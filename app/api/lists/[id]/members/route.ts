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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = parseInt(id);
  const { contactIds } = await req.json() as { contactIds: number[] };
  let added = 0;
  for (const contactId of contactIds) {
    const res = await db.execute({
      sql: "INSERT OR IGNORE INTO contact_list_members (list_id, contact_id) VALUES (?, ?)",
      args: [listId, contactId],
    });
    added += res.rowsAffected;
  }
  return NextResponse.json({ added });
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
