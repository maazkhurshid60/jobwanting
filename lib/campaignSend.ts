import db from "@/lib/db";
import { sendCampaignEmail, getBouncedEmails } from "@/lib/brevo";
import fs from "fs";
import path from "path";

// Shared campaign send-core used by BOTH the manual send route
// (/api/campaigns/send) and the scheduler worker (/api/scheduler/run) so the
// two paths produce byte-identical emails, tracking, logging, and suppression.

// Every real campaign also sends ONE clearly-marked copy to these verifier
// addresses so the team can see exactly what went out. They are not tracked,
// not counted as recipients, and not written to any log.
export const VERIFIER_EMAILS: string[] = [
  "news@patricknovick.com",
  "pat@jobw.com",
  "zohaibe840@gmail.com",
];

export interface ContactRow {
  id: number;
  email: string;
  name: string;
  title?: string;
  company?: string;
}

export function personalize(template: string, contact: ContactRow): string {
  const fullName = (contact.name as string) || "";
  const firstName = fullName.split(" ")[0] || fullName || "there";
  const lastName = fullName.split(" ").slice(1).join(" ") || "";
  return template
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{last_name\}\}/gi, lastName)
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{email\}\}/gi, contact.email as string)
    .replace(/\{\{title\}\}/gi, contact.title || "")
    .replace(/\{\{company\}\}/gi, contact.company || "");
}

// A body that carries its own <html>/<body> is a complete, self-contained email
// (e.g. a rich HTML template). It should be delivered as authored rather than
// nested inside the standard wrapper below.
function isFullHtmlDocument(s: string): boolean {
  return /<!doctype html|<html[\s>]/i.test(s);
}

export function wrapInHtmlTemplate(bodyText: string, email: string, campaignId: number, isHtml = false): string {
  const unsubscribeUrl = `https://patricknovick.com/unsubscribe?email=${encodeURIComponent(email)}`;
  // base64-encode email for tracking pixel — decoded server-side on open
  const eid = encodeURIComponent(Buffer.from(email.toLowerCase()).toString("base64"));
  const trackingPixel = `https://patricknovick.com/api/track/open?cid=${campaignId}&eid=${eid}`;

  if (isFullHtmlDocument(bodyText)) {
    const html = bodyText.replace(/\{\{unsubscribe_url\}\}/gi, unsubscribeUrl);
    const pixel = `<img src="${trackingPixel}" width="1" height="1" style="display:none;width:1px;height:1px;opacity:0;" alt="" />`;
    const unsubFallback = /unsubscribe/i.test(html)
      ? ""
      : `<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#8a97a4;padding:16px;">` +
        `<a href="${unsubscribeUrl}" style="color:#8a97a4;text-decoration:underline;">Unsubscribe</a></div>`;
    const injection = `${unsubFallback}${pixel}`;
    return /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${injection}</body>`)
      : `${html}${injection}`;
  }

  const formattedBody = isHtml ? bodyText : bodyText.trim().replace(/\n/g, "<br />");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td style="padding:40px 30px;font-size:15px;line-height:1.7;color:#1a1a1a;max-width:600px;">
        ${formattedBody}
        <div style="margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px;">
          <img src="https://patricknovick.com/signature.png" alt="Patrick Novick - CEO, Metro Associates LLC" width="550" style="display: block; max-width: 100%; height: auto; border: 0;" />
        </div>
      </td>
    </tr>
    <tr>
      <td style="height:400px;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:30px;border-top:1px solid #eeeeee;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#999999;">Metro Associates, LLC &nbsp;&bull;&nbsp; 1317 Edgewater Drive #4452, Orlando, FL 32804</p>
        <p style="margin:0;">
          <a href="${unsubscribeUrl}" style="font-size:11px;color:#999999;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
  <img src="${trackingPixel}" width="1" height="1" style="display:none;width:1px;height:1px;position:absolute;opacity:0;" alt="" />
</body>
</html>`.trim();
}

export interface CampaignSendParams {
  subject: string;
  body: string;
  isHtml?: boolean;
  listId?: number | null;
  excludeRecentDays?: number | null;
  dailyLimit?: number | null;
  offset?: number | null;
  replyTo?: string | null;
  attachPostcard?: boolean;
  customAttachment?: { name: string; content: string } | null;
}

export interface CampaignSendResult {
  ok: boolean;
  campaignId?: number;
  recipients: number;
  failed: number;
  messageId?: string | null;
  error?: string;
}

// Build the attachments array from the postcard flag / a custom attachment.
export function buildAttachments(
  attachPostcard?: boolean,
  customAttachment?: { name: string; content: string } | null,
): { name: string; content?: string; url?: string }[] | undefined {
  const finalAttachments: { name: string; content?: string; url?: string }[] = [];
  if (attachPostcard) {
    try {
      const postcardPath = path.join(process.cwd(), "public", "postcard.pdf");
      if (fs.existsSync(postcardPath)) {
        finalAttachments.push({ name: "postcard.pdf", content: fs.readFileSync(postcardPath).toString("base64") });
      }
    } catch (err) {
      console.error("Failed to read postcard file:", err);
    }
  }
  if (customAttachment?.content) {
    finalAttachments.push({ name: customAttachment.name, content: customAttachment.content });
  }
  return finalAttachments.length > 0 ? finalAttachments : undefined;
}

// Execute a real campaign send end-to-end: sync bounces → target contacts →
// create the campaign row → send → record recipients/log → verifier copy.
// Returns a structured result (never throws for expected failures).
export async function sendCampaignNow(params: CampaignSendParams): Promise<CampaignSendResult> {
  const {
    subject, body, isHtml, listId, excludeRecentDays, dailyLimit, offset,
    replyTo, attachPostcard, customAttachment,
  } = params;

  if (!subject?.trim() || !body?.trim()) {
    return { ok: false, recipients: 0, failed: 0, error: "Subject and body are required" };
  }

  const attachmentsOption = buildAttachments(attachPostcard, customAttachment);

  // Feedback loop: pull Brevo's hard bounces/blocks into suppression first.
  try {
    const bounced = await getBouncedEmails(90);
    if (bounced.size > 0) {
      await db.batch(
        [...bounced].map((email) => ({
          sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, 'bounced')",
          args: [email],
        })),
        "write",
      );
    }
  } catch {
    // a failed sync must never block a send
  }

  // Build targeting query
  let sql: string;
  const args: (string | number)[] = [];

  if (listId) {
    sql = `SELECT c.id, c.email, c.name, c.title, c.company
           FROM contacts c
           JOIN contact_list_members m ON c.id = m.contact_id
           WHERE m.list_id = ? AND c.status = 'active'
           AND c.email NOT IN (SELECT email FROM suppression_list)`;
    args.push(listId);
  } else {
    sql = `SELECT id, email, name, title, company FROM contacts WHERE status = 'active'
           AND email NOT IN (SELECT email FROM suppression_list)`;
  }

  if (excludeRecentDays && excludeRecentDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - excludeRecentDays * 86400;
    const emailCol = listId ? "c.email" : "email";
    sql += ` AND ${emailCol} NOT IN (SELECT DISTINCT email FROM campaign_recipients WHERE sent_at > ?)`;
    args.push(cutoff);
  }

  sql += ` ORDER BY ${listId ? "c.id" : "id"}`;

  const limit = dailyLimit && dailyLimit > 0 ? dailyLimit : 500;
  sql += ` LIMIT ?`;
  args.push(limit);

  const skip = offset && offset > 0 ? Math.floor(offset) : 0;
  if (skip > 0) {
    sql += ` OFFSET ?`;
    args.push(skip);
  }

  const contactsResult = await db.execute({ sql, args });
  const contacts = contactsResult.rows as unknown as ContactRow[];

  if (contacts.length === 0) {
    return { ok: false, recipients: 0, failed: 0, error: "No eligible contacts to send to" };
  }

  // Resolve list name for logging
  let targetListName: string | null = null;
  if (listId) {
    const listResult = await db.execute({ sql: "SELECT name FROM contact_lists WHERE id = ?", args: [listId] });
    targetListName = (listResult.rows[0]?.name as string) ?? null;
  }

  // Create campaign record FIRST to get ID for tracking pixel
  const campaignInsert = await db.execute({
    sql: `INSERT INTO campaigns (subject, body, recipient_count, status, target_list, list_id, sent_at)
          VALUES (?, ?, 0, 'sending', ?, ?, unixepoch())`,
    args: [subject, body, targetListName, listId ?? null],
  });
  const campaignId = Number(campaignInsert.lastInsertRowid);

  let result;
  try {
    result = await sendCampaignEmail({
      subject,
      htmlContent: body,
      replyTo: replyTo ?? undefined,
      attachments: attachmentsOption,
      recipients: contacts.map((c) => {
        const personalizedText = personalize(body, c);
        const wrappedHtml = wrapInHtmlTemplate(personalizedText, c.email as string, campaignId, !!isHtml);
        return {
          email: c.email as string,
          name: (c.name as string) || undefined,
          personalizedHtml: wrappedHtml,
          personalizedSubject: personalize(subject, c),
        };
      }),
    });
  } catch (err) {
    await db.execute({ sql: "UPDATE campaigns SET status = 'failed' WHERE id = ?", args: [campaignId] });
    const message = err instanceof Error ? err.message : "Send failed";
    return { ok: false, campaignId, recipients: 0, failed: 0, error: message };
  }

  if (result.sent.length === 0) {
    await db.execute({ sql: "UPDATE campaigns SET status = 'failed' WHERE id = ?", args: [campaignId] });
    const reason = result.failed[0]?.error ?? "no emails were accepted";
    return { ok: false, campaignId, recipients: 0, failed: result.failed.length, error: `Send failed — ${reason}` };
  }

  await db.execute({
    sql: "UPDATE campaigns SET status = 'sent', recipient_count = ?, brevo_msg_id = ? WHERE id = ?",
    args: [result.sent.length, result.messageId ?? null, campaignId],
  });

  await db.batch(
    result.sent.map((email) => ({
      sql: "INSERT OR IGNORE INTO campaign_recipients (campaign_id, email) VALUES (?, ?)",
      args: [campaignId, email],
    })),
    "write",
  );

  await db.batch(
    result.sent.map((email) => ({
      sql: "INSERT INTO email_send_log (campaign_id, email) VALUES (?, ?)",
      args: [campaignId, email],
    })),
    "write",
  );

  // Verifier copy — non-fatal
  if (VERIFIER_EMAILS.length > 0) {
    try {
      const sample = contacts[0];
      const verifierSubject = `[CAMPAIGN COPY] ${personalize(subject, sample)}`;
      const verifierBodyText = personalize(body, sample);
      await sendCampaignEmail({
        subject: verifierSubject,
        htmlContent: wrapInHtmlTemplate(verifierBodyText, VERIFIER_EMAILS[0], 0, !!isHtml),
        replyTo: replyTo ?? undefined,
        attachments: attachmentsOption,
        recipients: VERIFIER_EMAILS.map((e) => ({
          email: e,
          name: "Campaign Verifier",
          personalizedHtml: wrapInHtmlTemplate(verifierBodyText, e, 0, !!isHtml),
          personalizedSubject: verifierSubject,
        })),
      });
    } catch (err) {
      console.error("Verifier copy failed (non-fatal):", err);
    }
  }

  return {
    ok: true,
    campaignId,
    recipients: result.sent.length,
    failed: result.failed.length,
    messageId: result.messageId,
  };
}
