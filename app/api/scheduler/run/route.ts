import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { sendCampaignNow, type CampaignSendParams } from "@/lib/campaignSend";
import { advanceInZone, isRepeatEvery } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Give the worker room to dispatch a batch of due sends. NOTE: Vercel's Hobby
// plan caps functions at 60s regardless of this value — the stale-claim reaper
// below exists precisely because a batch can be killed part-way through.
export const maxDuration = 300;

// One campaign per invocation. Sending is sequential SMTP, so a single batch can
// already consume the whole function budget; taking more than one risks being
// killed mid-send. The cron ticks every 5 minutes and picks up the rest.
const MAX_PER_RUN = 1;

// The default recipient cap in campaignSend when no batch size is given.
const DEFAULT_BATCH = 500;

// How long a row may sit in 'processing' before it is presumed dead.
const STALE_CLAIM_SECONDS = 15 * 60;

interface ScheduledRow {
  id: number;
  subject: string;
  body: string;
  is_html: number;
  list_id: number | null;
  exclude_recent_days: number | null;
  daily_limit: number | null;
  send_offset: number;
  reply_to: string | null;
  attach_postcard: number;
  scheduled_at: number;
  timezone: string;
  batch_interval_minutes: number | null;
  total_target: number;
  repeat_every: string | null;
  recipient_count: number;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true; // Vercel Cron sends this
  if (req.nextUrl.searchParams.get("key") === secret) return true; // manual trigger
  return false;
}

/**
 * Fail any row whose claim has gone stale. A function killed mid-send (the 60s
 * Hobby ceiling) leaves 'processing' behind with no way back — the row would
 * never send and the UI refuses to delete it.
 *
 * These are deliberately failed rather than retried: the send had already begun,
 * and `send_offset` was not advanced, so resuming would re-mail everyone the
 * dead run already reached. Whatever did go out is recorded under Campaigns.
 */
async function reapStaleClaims(now: number): Promise<number> {
  const res = await db.execute({
    sql: `UPDATE scheduled_campaigns
          SET status = 'failed',
              error = 'Send was interrupted (likely the 60s function limit). Any emails already dispatched are listed under Campaigns — reduce the batch size and schedule the remainder.'
          WHERE status = 'processing' AND claimed_at IS NOT NULL AND claimed_at < ?`,
    args: [now - STALE_CLAIM_SECONDS],
  });
  return res.rowsAffected;
}

/** Queue the next occurrence of a recurring campaign, anchored to its original time. */
async function queueRepeat(row: ScheduledRow): Promise<number | null> {
  if (!isRepeatEvery(row.repeat_every)) return null;

  const nextAt = advanceInZone(row.scheduled_at, row.timezone, row.repeat_every);
  if (nextAt === null) return null;

  const res = await db.execute({
    sql: `INSERT INTO scheduled_campaigns
            (subject, body, is_html, list_id, exclude_recent_days, daily_limit,
             send_offset, reply_to, attach_postcard, scheduled_at, timezone, status,
             batch_interval_minutes, total_target, repeat_every)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    args: [
      row.subject, row.body, row.is_html, row.list_id, row.exclude_recent_days,
      row.daily_limit, row.reply_to, row.attach_postcard, nextAt, row.timezone,
      row.batch_interval_minutes, row.total_target, row.repeat_every,
    ],
  });
  return Number(res.lastInsertRowid);
}

async function processDue(): Promise<{ processed: number; reaped: number; results: Array<Record<string, unknown>> }> {
  const now = Math.floor(Date.now() / 1000);
  const reaped = await reapStaleClaims(now);

  const due = await db.execute({
    sql: `SELECT id, subject, body, is_html, list_id, exclude_recent_days,
                 daily_limit, send_offset, reply_to, attach_postcard,
                 scheduled_at, timezone, batch_interval_minutes, total_target,
                 repeat_every, recipient_count
          FROM scheduled_campaigns
          WHERE status = 'pending' AND COALESCE(next_batch_at, scheduled_at) <= ?
          ORDER BY COALESCE(next_batch_at, scheduled_at) ASC
          LIMIT ?`,
    args: [now, MAX_PER_RUN],
  });

  const rows = due.rows as unknown as ScheduledRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    // Atomically claim the row so overlapping cron runs never double-send it.
    const claim = await db.execute({
      sql: "UPDATE scheduled_campaigns SET status = 'processing', claimed_at = ? WHERE id = ? AND status = 'pending'",
      args: [now, row.id],
    });
    if (claim.rowsAffected === 0) continue; // another run got it first

    const batchSize = row.daily_limit && row.daily_limit > 0 ? row.daily_limit : DEFAULT_BATCH;
    const isDrip = !!row.batch_interval_minutes && row.batch_interval_minutes > 0;

    const params: CampaignSendParams = {
      subject: row.subject,
      body: row.body,
      isHtml: !!row.is_html,
      listId: row.list_id,
      excludeRecentDays: row.exclude_recent_days,
      dailyLimit: batchSize,
      offset: row.send_offset,
      replyTo: row.reply_to,
      attachPostcard: !!row.attach_postcard,
    };

    try {
      const result = await sendCampaignNow(params);

      // Running out of eligible contacts is how a drip ends, not a failure —
      // but on the very first batch it means the audience was empty all along.
      const exhausted = !result.ok && /no eligible contacts/i.test(result.error ?? "");
      if (exhausted && row.recipient_count > 0) {
        await db.execute({
          sql: "UPDATE scheduled_campaigns SET status = 'sent', claimed_at = NULL, error = NULL WHERE id = ?",
          args: [row.id],
        });
        const repeatId = await queueRepeat(row);
        results.push({ id: row.id, status: "sent", recipients: row.recipient_count, note: "audience exhausted", repeatId });
        continue;
      }

      if (!result.ok) {
        await db.execute({
          sql: "UPDATE scheduled_campaigns SET status = 'failed', claimed_at = NULL, error = ? WHERE id = ?",
          args: [result.error ?? "Send failed", row.id],
        });
        results.push({ id: row.id, status: "failed", error: result.error });
        continue;
      }

      const sentNow = result.recipients;
      const newTotal = row.recipient_count + sentNow;
      const newOffset = row.send_offset + sentNow;
      // A short batch means the audience ran dry inside this round.
      const moreLikely = isDrip && sentNow >= batchSize;

      if (moreLikely) {
        const nextAt = now + row.batch_interval_minutes! * 60;
        await db.execute({
          sql: `UPDATE scheduled_campaigns
                SET status = 'pending', claimed_at = NULL, error = NULL,
                    send_offset = ?, recipient_count = ?, next_batch_at = ?,
                    result_campaign_id = ?
                WHERE id = ?`,
          args: [newOffset, newTotal, nextAt, result.campaignId ?? null, row.id],
        });
        results.push({
          id: row.id, status: "batch-sent", recipients: sentNow,
          totalSent: newTotal, of: row.total_target, nextBatchAt: nextAt,
        });
        continue;
      }

      await db.execute({
        sql: `UPDATE scheduled_campaigns
              SET status = 'sent', claimed_at = NULL, error = NULL,
                  send_offset = ?, recipient_count = ?, result_campaign_id = ?
              WHERE id = ?`,
        args: [newOffset, newTotal, result.campaignId ?? null, row.id],
      });
      const repeatId = await queueRepeat(row);
      results.push({ id: row.id, status: "sent", recipients: sentNow, totalSent: newTotal, repeatId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      await db.execute({
        sql: "UPDATE scheduled_campaigns SET status = 'failed', claimed_at = NULL, error = ? WHERE id = ?",
        args: [message, row.id],
      });
      results.push({ id: row.id, status: "failed", error: message });
    }
  }

  return { processed: results.length, reaped, results };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const out = await processDue();
  return NextResponse.json({ ok: true, ...out });
}

// Allow manual/POST triggering too.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return GET(req);
}
