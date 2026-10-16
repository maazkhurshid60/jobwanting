import "server-only";
import nodemailer from "nodemailer";
import db from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import type { SendEmailOptions, SendResult } from "@/lib/brevo";

/* Sending a campaign through an ordinary mailbox instead of Brevo.
 *
 * WHY THIS EXISTS
 *
 * Brevo sends from a verified noreply address. That is the right default for
 * volume, but it reads as marketing, and replies go nowhere a person is
 * watching. Sending through the recruiter's own inbox means the message
 * arrives from a human and the reply lands where they already work.
 *
 * WHAT IT COSTS
 *
 * Volume. A provider mailbox is not an ESP: Gmail allows roughly 500
 * recipients a day on a consumer account, Workspace about 2,000, Outlook
 * around 300. Exceed it and the provider does not bounce politely, it locks
 * sending on the account for 24 hours or longer. So the limit is enforced
 * here, from a log of what was actually accepted, rather than discovered when
 * a campaign dies halfway and takes the mailbox with it.
 *
 * Also worth knowing: mail sent this way is authenticated by the provider's
 * SPF/DKIM, not Brevo's, and it skips Brevo's bounce and unsubscribe
 * handling. Bounces come back to the mailbox as ordinary email, so the
 * suppression feedback loop in campaignSend does not see them.
 */

export interface SmtpAccount {
  id: number;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  dailyLimit: number;
}

interface AccountRow {
  id: number;
  label: string;
  host: string;
  port: number;
  secure: number;
  username: string;
  password_enc: string;
  from_email: string;
  from_name: string;
  daily_limit: number;
}

function toAccount(r: AccountRow): SmtpAccount {
  return {
    id: r.id,
    label: r.label,
    host: r.host,
    port: r.port,
    secure: !!r.secure,
    username: r.username,
    fromEmail: r.from_email,
    fromName: r.from_name,
    dailyLimit: r.daily_limit,
  };
}

/** Every configured mailbox. Never includes the password, encrypted or not —
 *  this feeds a dropdown, and a secret that is not sent cannot leak from it. */
export async function listSmtpAccounts(): Promise<SmtpAccount[]> {
  const res = await db.execute(
    `SELECT id, label, host, port, secure, username, password_enc,
            from_email, from_name, daily_limit
       FROM smtp_accounts ORDER BY label`,
  );
  return (res.rows as unknown as AccountRow[]).map(toAccount);
}

export async function createSmtpAccount(input: {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
  dailyLimit?: number;
}): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO smtp_accounts
            (label, host, port, secure, username, password_enc,
             from_email, from_name, daily_limit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.label.trim(),
      input.host.trim(),
      input.port,
      input.secure ? 1 : 0,
      input.username.trim(),
      encrypt(input.password),
      input.fromEmail.trim(),
      input.fromName?.trim() ?? "",
      /* Deliberately below every provider's published ceiling. The published
         number is where sending stops working, not a target, and it counts
         recipients rather than messages. */
      Math.max(1, Math.floor(input.dailyLimit ?? 400)),
    ],
  });
  return Number(res.lastInsertRowid);
}

export async function deleteSmtpAccount(id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM smtp_accounts WHERE id = ?", args: [id] });
}

async function loadRow(id: number): Promise<AccountRow | null> {
  const res = await db.execute({
    sql: `SELECT id, label, host, port, secure, username, password_enc,
                 from_email, from_name, daily_limit
            FROM smtp_accounts WHERE id = ?`,
    args: [id],
  });
  return (res.rows[0] as unknown as AccountRow) ?? null;
}

function transportFor(row: AccountRow) {
  return nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure: !!row.secure,
    auth: { user: row.username, pass: decrypt(row.password_enc) },
    /* One connection reused for the whole batch. Without pooling each
       recipient opens a fresh TLS session and authenticates again, which is
       slow and looks to a provider like repeated login attempts. */
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  });
}

/** How many recipients this account has accepted since midnight UTC. */
async function sentToday(accountId: number): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM smtp_send_log WHERE account_id = ? AND sent_at >= ?",
    args: [accountId, since],
  });
  return Number((res.rows[0] as unknown as { n: number })?.n ?? 0);
}

/** Proves the credentials and the host before a campaign depends on them. */
export async function verifySmtpAccount(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: "No such mailbox." };
  const transport = transportFor(row);
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  } finally {
    transport.close();
  }
}

/**
 * Sends a campaign through a configured mailbox.
 *
 * Mirrors sendCampaignEmail's contract — one message per recipient, a bad
 * recipient recorded rather than aborting the batch — so campaignSend can
 * use either transport without special-casing the result.
 */
export async function sendViaSmtp(
  accountId: number,
  opts: Pick<SendEmailOptions, "subject" | "htmlContent" | "recipients" | "replyTo" | "attachments">,
): Promise<SendResult> {
  const row = await loadRow(accountId);
  if (!row) throw new Error("No such mailbox.");

  const already = await sentToday(accountId);
  const remaining = row.daily_limit - already;
  if (remaining <= 0) {
    throw new Error(
      `${row.from_email} has already sent its daily limit of ${row.daily_limit}. ` +
        `Sending more risks the provider locking the mailbox. Try again tomorrow or raise the limit.`,
    );
  }

  const transport = transportFor(row);
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];
  let lastMessageId: string | undefined;

  try {
    for (const [index, recipient] of opts.recipients.entries()) {
      /* Stop at the limit rather than sending into a lockout. Everyone past
         it is reported as failed with the reason, so the campaign record
         shows who did not receive it instead of silently truncating. */
      if (index >= remaining) {
        failed.push({
          email: recipient.email,
          error: `Daily limit of ${row.daily_limit} reached for ${row.from_email}`,
        });
        continue;
      }

      try {
        const info = await transport.sendMail({
          from: row.from_name ? `"${row.from_name}" <${row.from_email}>` : row.from_email,
          to: recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email,
          subject: recipient.personalizedSubject ?? opts.subject,
          html: recipient.personalizedHtml ?? opts.htmlContent,
          ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
          ...(opts.attachments?.length
            ? {
                attachments: opts.attachments.map((a) => ({
                  filename: a.name,
                  ...(a.content ? { content: Buffer.from(a.content, "base64") } : {}),
                  ...(a.url ? { path: a.url } : {}),
                })),
              }
            : {}),
        });
        lastMessageId = info.messageId;
        sent.push(recipient.email);
        await db.execute({
          sql: "INSERT INTO smtp_send_log (account_id, email) VALUES (?, ?)",
          args: [accountId, recipient.email],
        });
      } catch (err) {
        failed.push({
          email: recipient.email,
          error: err instanceof Error ? err.message : "SMTP send failed",
        });
      }
    }
  } finally {
    transport.close();
  }

  return { messageId: lastMessageId, sent, failed };
}
