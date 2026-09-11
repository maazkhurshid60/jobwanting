import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/campaigns/recipients — resolve the EXACT recipients for the current
// targeting (same rules as /api/campaigns/send: active, not suppressed, optional
// skip-recent, stable order, batch size + skip-first), WITHOUT sending anything.
// Also returns how many times each person has been emailed and when last.
// Params: listId, excludeRecentDays, dailyLimit, offset.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const listId = sp.get("listId") ? Number(sp.get("listId")) : null;
  const excludeRecentDays = sp.get("excludeRecentDays") ? Number(sp.get("excludeRecentDays")) : null;
  const dailyLimit = sp.get("dailyLimit") ? Number(sp.get("dailyLimit")) : 500;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : 0;

  const args: (string | number)[] = [];
  const select = `SELECT c.id, c.email, c.name, c.title, c.company, c.city, c.state,
        (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.email = c.email) AS send_count,
        (SELECT MAX(sent_at) FROM campaign_recipients cr WHERE cr.email = c.email) AS last_sent`;

  let sql: string;
  if (listId) {
    sql = `${select}
           FROM contacts c
           JOIN contact_list_members m ON c.id = m.contact_id
           WHERE m.list_id = ? AND c.status = 'active'
           AND c.email NOT IN (SELECT email FROM suppression_list)`;
    args.push(listId);
  } else {
    sql = `${select}
           FROM contacts c
           WHERE c.status = 'active'
           AND c.email NOT IN (SELECT email FROM suppression_list)`;
  }

  if (excludeRecentDays && excludeRecentDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - excludeRecentDays * 86400;
    sql += ` AND c.email NOT IN (SELECT DISTINCT email FROM campaign_recipients WHERE sent_at > ?)`;
    args.push(cutoff);
  }

  sql += ` ORDER BY c.id`;
  const limit = dailyLimit && dailyLimit > 0 ? dailyLimit : 500;
  sql += ` LIMIT ?`;
  args.push(limit);
  const skip = offset && offset > 0 ? Math.floor(offset) : 0;
  if (skip > 0) { sql += ` OFFSET ?`; args.push(skip); }

  const res = await db.execute({ sql, args });
  return NextResponse.json({ count: res.rows.length, recipients: res.rows });
}
