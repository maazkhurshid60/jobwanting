import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getBrevoStats, getBrevoEvents, BrevoEvent, BrevoStats, DateRange } from "@/lib/brevo";
import { dayRangeToUnix, isValidDateStr, rangeLabel } from "@/lib/dateRange";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// When a list is selected, Brevo's aggregated report can't be filtered by list
// (Brevo doesn't know our lists), so we derive the deliverability numbers from the
// event feed restricted to that list's member emails.
function deriveBrevoFromEvents(events: BrevoEvent[], label: string): BrevoStats {
  const lc = (s: string) => (s || "").toLowerCase();
  const ofType = (t: string) => events.filter((e) => e.event === t);
  const uniq = (t: string) => new Set(ofType(t).map((e) => lc(e.email))).size;
  const delivered = ofType("delivered").length;
  const hardBounces = ofType("hardBounces").length;
  const softBounces = ofType("softBounces").length;
  const blocked = ofType("blocked").length;
  const requests = ofType("requests").length || delivered + hardBounces + softBounces + blocked;
  return {
    range: label,
    requests,
    delivered,
    hardBounces,
    softBounces,
    blocked,
    invalid: ofType("invalid").length,
    spamReports: ofType("spam").length,
    unsubscribed: ofType("unsubscribed").length,
    opens: ofType("opened").length,
    uniqueOpens: uniq("opened"),
    clicks: ofType("clicks").length,
    uniqueClicks: uniq("clicks"),
  };
}

interface ContactEngagement {
  email: string;
  name: string;
  status: string;
  title: string;
  company: string;
  sends: number;       // how many campaigns this person has been emailed
  opens: number;       // how many of those they opened
  last_sent: number | null;
  suppressed: number;  // 1 if on the suppression list (unsubscribed/bounced)
}

// GET /api/analytics — deliverability stats (Brevo) + per-contact engagement (local DB)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days")) || 30));
  const listIdParam = req.nextUrl.searchParams.get("listId");
  const listId = listIdParam ? Number(listIdParam) : null;

  // Optional explicit date range (from/to as YYYY-MM-DD). When present it overrides
  // the rolling `days` window. We use a half-open unix interval [start, endExclusive)
  // so the entire `to` day is included — the classic "BETWEEN drops the last day" bug.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const hasRange = isValidDateStr(fromParam) && isValidDateStr(toParam);
  const brevoRange: DateRange | undefined = hasRange
    ? { startDate: fromParam, endDate: toParam }
    : undefined;
  const unixRange = hasRange ? dayRangeToUnix(fromParam, toParam) : null;
  const label = hasRange ? rangeLabel(fromParam, toParam) : `last ${days} days`;
  // The charts need a concrete window even for the rolling "last N days" case
  // (unixRange is null there) — fall back to now-minus-days.
  const chartRange = unixRange ?? { start: Math.floor(Date.now() / 1000) - days * 86400, endExclusive: Math.floor(Date.now() / 1000) + 1 };

  // Member emails for the selected list (used to scope Brevo events)
  let memberEmails: Set<string> | null = null;
  if (listId) {
    const m = await db.execute({
      sql: `SELECT LOWER(c.email) AS e FROM contact_list_members m JOIN contacts c ON c.id = m.contact_id WHERE m.list_id = ?`,
      args: [listId],
    });
    memberEmails = new Set(m.rows.map((r) => String(r.e)));
  }

  // Always pull a bounded event window now (not just when a list is selected):
  // the "Clicks over time" chart needs per-event timestamps, which the
  // aggregated report doesn't provide. (The recent-activity feed is served
  // separately by /api/analytics/events with proper offset pagination.)
  const rawEvents = await getBrevoEvents(days, 1000, brevoRange);
  const events = memberEmails
    ? rawEvents.filter((e) => memberEmails!.has((e.email || "").toLowerCase()))
    : rawEvents;

  // Deliverability: account-wide aggregated report normally; derived from the
  // list's events when a list is selected (Brevo's aggregated report can't be
  // scoped to a list).
  const brevo: BrevoStats = listId ? deriveBrevoFromEvents(events, label) : await getBrevoStats(days, brevoRange);

  // Opens and clicks over time, bucketed by UTC day — both from Brevo's live
  // event feed above, not our own DB. Nothing here is persisted; it's
  // re-fetched from Brevo via BREVO_API_KEY on every request.
  const clicksByDayMap = new Map<string, number>();
  const opensByDayMap = new Map<string, number>();
  for (const e of events) {
    if (e.event === "clicks") clicksByDayMap.set(e.date.slice(0, 10), (clicksByDayMap.get(e.date.slice(0, 10)) ?? 0) + 1);
    else if (e.event === "opened") opensByDayMap.set(e.date.slice(0, 10), (opensByDayMap.get(e.date.slice(0, 10)) ?? 0) + 1);
  }

  // Audience totals from our own send logs. Sends & opens honour the date range
  // (half-open [start, endExclusive) so the whole end day counts); contacts &
  // suppression are current-state counts, not time-scoped.
  const sendConds: string[] = [];
  const sendArgs: number[] = [];
  if (listId) { sendConds.push("campaign_id IN (SELECT id FROM campaigns WHERE list_id = ?)"); sendArgs.push(listId); }
  if (unixRange) { sendConds.push("sent_at >= ? AND sent_at < ?"); sendArgs.push(unixRange.start, unixRange.endExclusive); }
  const sendWhere = sendConds.length ? `WHERE ${sendConds.join(" AND ")}` : "";

  const openConds: string[] = [
    `eo.campaign_id ${listId ? "IN (SELECT id FROM campaigns WHERE list_id = ?)" : "IN (SELECT id FROM campaigns)"}`,
  ];
  const openArgs: number[] = [];
  if (listId) openArgs.push(listId);
  if (unixRange) { openConds.push("eo.opened_at >= ? AND eo.opened_at < ?"); openArgs.push(unixRange.start, unixRange.endExclusive); }

  const contactsSel = listId
    ? "(SELECT COUNT(*) FROM contact_list_members WHERE list_id = ?)"
    : "(SELECT COUNT(*) FROM contacts)";
  // "Unsubscribed / Suppressed" counts genuine opt-outs only — bounces/invalids
  // have their own Bounced page (and Bounces stat), so exclude them here to match
  // the Opt-Outs page.
  const notBounce = "s.reason NOT IN ('bounced','invalid') AND s.reason NOT LIKE '%bounce%'";
  const suppressedSel = listId
    ? `(SELECT COUNT(*) FROM contact_list_members m JOIN contacts c ON c.id = m.contact_id JOIN suppression_list s ON s.email = c.email WHERE m.list_id = ? AND ${notBounce})`
    : `(SELECT COUNT(*) FROM suppression_list s WHERE ${notBounce})`;

  const totalsRes = await db.execute({
    sql: `
      SELECT
        ${contactsSel} AS total_contacts,
        (SELECT COUNT(*) FROM email_send_log ${sendWhere}) AS total_sends,
        (SELECT COUNT(*) FROM (
           SELECT DISTINCT eo.campaign_id, eo.email FROM email_opens eo WHERE ${openConds.join(" AND ")}
        )) AS total_opens,
        ${suppressedSel} AS total_suppressed
    `,
    args: [
      ...(listId ? [listId] : []), // total_contacts
      ...sendArgs,                 // total_sends
      ...openArgs,                 // total_opens
      ...(listId ? [listId] : []), // total_suppressed
    ],
  });

  const t = totalsRes.rows[0] ?? {};
  const totals = {
    total_contacts: Number(t.total_contacts ?? 0),
    total_sends: Number(t.total_sends ?? 0),
    total_opens: Number(t.total_opens ?? 0),
    total_suppressed: Number(t.total_suppressed ?? 0),
  };

  // Zero-fill every calendar day in the window — the event feed only has
  // entries for days that had at least one hit, and a trend chart with
  // silently-skipped zero days would compress into a misleadingly busy line.
  function zeroFillDays(counts: Map<string, number>): { date: string; count: number }[] {
    const out: { date: string; count: number }[] = [];
    for (let ts = chartRange.start; ts < chartRange.endExclusive; ts += 86400) {
      const day = new Date(ts * 1000).toISOString().slice(0, 10);
      out.push({ date: day, count: counts.get(day) ?? 0 });
    }
    return out;
  }

  const opensByDay = zeroFillDays(opensByDayMap);
  const clicksByDayFilled = zeroFillDays(clicksByDayMap);

  // Per-contact engagement: who we've emailed, how many times, and when last —
  // built from the append-only send log so re-sends to the same person count.
  // Honours the same list/date scoping as the totals above (l = email_send_log).
  //
  // `opens` comes from a pre-aggregated derived table (one scan of
  // email_opens total), not a correlated subquery per email — that subquery
  // used to re-scan the whole (unindexed, tracking-pixel-fed) email_opens
  // table once for every one of up to 200 rows here, which is the query that
  // drove Turso's "rows read" into the billions. `suppressed` stays a
  // correlated subquery since suppression_list.email is a primary key —
  // that's an indexed point lookup, not a scan.
  const engRes = await db.execute({
    sql: `
      SELECT
        l.email                                   AS email,
        COALESCE(NULLIF(c.name,''), l.email)      AS name,
        COALESCE(c.status, 'active')              AS status,
        COALESCE(c.title, '')                     AS title,
        COALESCE(c.company, '')                   AS company,
        COUNT(*)                                  AS sends,
        MAX(l.sent_at)                            AS last_sent,
        COALESCE(oa.opens, 0)                     AS opens,
        (SELECT COUNT(*) FROM suppression_list s WHERE s.email = l.email) AS suppressed
      FROM email_send_log l
      LEFT JOIN contacts c ON c.email = l.email
      LEFT JOIN (
        SELECT email, COUNT(DISTINCT campaign_id) AS opens FROM email_opens GROUP BY email
      ) oa ON oa.email = l.email
      ${sendWhere ? sendWhere.replace(/\bcampaign_id\b/g, "l.campaign_id").replace(/\bsent_at\b/g, "l.sent_at") : ""}
      GROUP BY l.email
      ORDER BY last_sent DESC
      LIMIT 200
    `,
    args: [...sendArgs],
  });

  const contacts: ContactEngagement[] = engRes.rows.map((r) => ({
    email: String(r.email),
    name: String(r.name ?? r.email),
    status: String(r.status ?? "active"),
    title: String(r.title ?? ""),
    company: String(r.company ?? ""),
    sends: Number(r.sends ?? 0),
    opens: Number(r.opens ?? 0),
    last_sent: r.last_sent != null ? Number(r.last_sent) : null,
    suppressed: Number(r.suppressed ?? 0) > 0 ? 1 : 0,
  }));

  return NextResponse.json({
    brevo, events: [] as BrevoEvent[], contacts, totals,
    charts: { opensByDay, clicksByDay: clicksByDayFilled },
  });
}
