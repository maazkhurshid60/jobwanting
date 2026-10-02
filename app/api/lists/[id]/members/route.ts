import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = parseInt(id);
  const result = await db.execute({
    sql: `SELECT c.id, c.email, c.name, c.status, c.title, c.company, c.city, c.state,
                 (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.email = c.email) AS send_count
          FROM contacts c
          JOIN contact_list_members m ON c.id = m.contact_id
          WHERE m.list_id = ?
          ORDER BY c.created_at DESC`,
    args: [listId],
  });
  return NextResponse.json(result.rows);
}

/* Add contacts to a list — except anyone on the master do-not-email list.
 *
 * The send query already excludes suppressed addresses, so this is not what
 * stops the email going out. It is what stops the list from lying. Without it
 * a suppressed address sits in the list, is counted in its member total, and
 * shows in the recipients table, so the only way to find out they were never
 * going to be mailed is to send the campaign and compare the numbers.
 *
 * Blocking at the point of adding is also the only form of this that holds
 * when the address is suppressed later: the import skips them, this skips
 * them, and the send filters them. Three independent gates, which is what "an
 * all stop on an email" has to mean if it is to survive one of them changing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = parseInt(id);
  const { contactIds } = await req.json() as { contactIds: number[] };

  const ids = [...new Set((contactIds ?? []).map(Number))].filter(Number.isInteger);
  if (ids.length === 0) {
    return NextResponse.json({ added: 0, blocked: 0, blockedEmails: [] });
  }

  /* Matched case-insensitively rather than with the exact comparison the send
     query uses. Addresses are lowercased on every write today, but this is the
     gate a human sees the result of, and it should not be the one that misses
     because a row arrived from somewhere with a capital letter in it. */
  const placeholders = ids.map(() => "?").join(",");
  const blockedResult = await db.execute({
    sql: `SELECT c.id, c.email
            FROM contacts c
            JOIN suppression_list s ON LOWER(s.email) = LOWER(c.email)
           WHERE c.id IN (${placeholders})`,
    args: ids,
  });

  const blockedIds = new Set(blockedResult.rows.map((r) => Number(r.id)));
  const blockedEmails = blockedResult.rows.map((r) => String(r.email));
  const allowed = ids.filter((contactId) => !blockedIds.has(contactId));

  let added = 0;
  for (const contactId of allowed) {
    const res = await db.execute({
      sql: "INSERT OR IGNORE INTO contact_list_members (list_id, contact_id) VALUES (?, ?)",
      args: [listId, contactId],
    });
    added += res.rowsAffected;
  }

  // Capped — the caller shows these, and a bulk add of a stale spreadsheet can
  // block thousands.
  return NextResponse.json({
    added,
    blocked: blockedIds.size,
    blockedEmails: blockedEmails.slice(0, 20),
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = parseInt(id);
  const { contactId } = await req.json() as { contactId: number };
  await db.execute({
    sql: "DELETE FROM contact_list_members WHERE list_id = ? AND contact_id = ?",
    args: [listId, contactId],
  });
  return NextResponse.json({ success: true });
}
