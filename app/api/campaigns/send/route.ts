import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { sendCampaignEmail, resolveSender, resolveSenders } from "@/lib/brevo";
import { sendViaSmtp } from "@/lib/smtp";
import {
  personalize,
  wrapInHtmlTemplate,
  buildAttachments,
  sendCampaignNow,
  type CampaignSendParams,
} from "@/lib/campaignSend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/campaigns/send
export async function POST(req: NextRequest): Promise<NextResponse> {
  /* senderEmails is overridden because the two sides carry different
     shapes on purpose: the browser sends addresses, and only the resolved
     {email,name} pairs that came back from Brevo are handed to the send
     core, so a name can never be attacker-supplied. */
  const payload = await req.json() as Omit<CampaignSendParams, "senderEmails"> & {
    isTestSend?: boolean;
    testEmail?: string | null;
    senderEmails?: string[] | null;
  };

  /* A test send through a mailbox goes through the same transport as the
     real thing, so it proves the credentials and shows the actual From
     address. Declared here because the test-send branch below returns
     before the main send path is reached. */
  const smtpAccountId = payload.smtpAccountId ?? null;
  const {
    subject, body, isHtml, replyTo, isTestSend, testEmail,
    attachPostcard, customAttachment,
  } = payload;

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  // Confirm the chosen sender against Brevo before anything goes out.
  const resolved = await resolveSender(payload.senderEmail);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const sender = resolved.sender;

  /* And the rotation, if one was chosen. Validated the same way and for the
     same reason: an unverified address here would not fail the campaign, it
     would fail every Nth email in it, which is far harder to notice than a
     campaign that does not start. */
  const resolvedRotation = await resolveSenders(payload.senderEmails);
  if (!resolvedRotation.ok) {
    return NextResponse.json(
      { error: resolvedRotation.error },
      { status: resolvedRotation.status },
    );
  }
  const rotation = resolvedRotation.senders;

  // Test Send: deliver a single [TEST] copy, no targeting, no logging.
  if (isTestSend) {
    if (!testEmail?.trim()) {
      return NextResponse.json({ error: "Test email address is required" }, { status: 400 });
    }
    try {
      const attachmentsOption = buildAttachments(attachPostcard, customAttachment);
      const testContact = { id: 0, email: testEmail.trim(), name: "Test Recipient", title: "Senior Engineer", company: "Big Company" };
      const personalizedBody = personalize(body, testContact);
      const personalizedSubject = `[TEST] ${personalize(subject, testContact)}`;
      const wrappedHtml = wrapInHtmlTemplate(personalizedBody, testEmail.trim(), 0, !!isHtml);

      const testRecipients = [
        { email: testEmail.trim(), name: "Test Recipient", personalizedHtml: wrappedHtml },
      ];
      const result = smtpAccountId
        ? await sendViaSmtp(smtpAccountId, {
            subject: personalizedSubject,
            htmlContent: wrappedHtml,
            replyTo: replyTo ?? undefined,
            attachments: attachmentsOption,
            recipients: testRecipients,
          })
        : await sendCampaignEmail({
            subject: personalizedSubject,
            htmlContent: wrappedHtml,
            replyTo: replyTo ?? undefined,
            /* A test send is one email, so a rotation has nothing to rotate
               through: it goes out as the first address, which is what the
               real campaign's first email will use. */
            sender: rotation.length ? rotation[0] : sender,
            attachments: attachmentsOption,
            recipients: testRecipients,
          });
      if (result.sent.length === 0) {
        const reason = result.failed[0]?.error ?? "Send failed";
        return NextResponse.json({ error: `Test send failed: ${reason}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, isTest: true, recipients: 1, messageId: result.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test send failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Real send — shared core (identical logic used by the scheduler worker).
  // Pass the resolved sender rather than the raw body value, so the send core
  // only ever sees an address that just came back from Brevo's own list.
  const result = await sendCampaignNow({
    ...payload,
    senderEmail: sender?.email ?? null,
    senderName: sender?.name ?? null,
    senderEmails: rotation.length ? rotation : null,
    senderRotateEvery: payload.senderRotateEvery ?? 1,
    smtpAccountId: payload.smtpAccountId ?? null,
  });
  if (!result.ok) {
    const status = result.error === "No eligible contacts to send to" ? 400 : 500;
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status });
  }
  return NextResponse.json({
    success: true,
    recipients: result.recipients,
    failed: result.failed,
    campaignId: result.campaignId,
    messageId: result.messageId,
  });
}

// GET /api/campaigns/send — campaign history with open counts.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const listIdParam = req.nextUrl.searchParams.get("listId");
  const listId = listIdParam ? Number(listIdParam) : null;

  const where = listId ? "WHERE c.list_id = ?" : "";
  const args = listId ? [listId] : [];

  // Open counts come from a pre-aggregated derived table (one scan of
  // email_opens total) rather than a correlated subquery per campaign row
  // (which was a full scan of email_opens for EACH of the 50 campaigns here —
  // the main driver behind Turso's "rows read" blowing up once email_opens
  // grew past a few thousand rows).
  const result = await db.execute({
    sql: `
      SELECT c.id, c.subject, c.recipient_count, c.status, c.target_list, c.list_id, c.sent_at,
             COALESCE(o.total_opens, 0) AS total_opens,
             COALESCE(o.unique_opens, 0) AS unique_opens
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) AS total_opens, COUNT(DISTINCT email) AS unique_opens
        FROM email_opens
        GROUP BY campaign_id
      ) o ON o.campaign_id = c.id
      ${where}
      ORDER BY c.sent_at DESC
      LIMIT 50
    `,
    args,
  });
  return NextResponse.json(result.rows);
}

// DELETE /api/campaigns/send — delete campaign record
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { id } = await req.json() as { id: number };
    if (!id) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
    }
    await db.execute({ sql: "DELETE FROM campaigns WHERE id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM campaign_recipients WHERE campaign_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM email_opens WHERE campaign_id = ?", args: [id] });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
