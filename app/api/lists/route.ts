import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function GET() {
  // Count only memberships whose contact still exists, so a past delete that left
  // an orphan membership row can't inflate the number shown.
  const result = await db.execute(`
    SELECT cl.id, cl.name, cl.created_at,
           COUNT(DISTINCT c.id) as member_count,
           COUNT(DISTINCT cp.id) as campaign_count,
           MAX(cp.sent_at) as last_sent_at
    FROM contact_lists cl
    LEFT JOIN contact_list_members clm ON cl.id = clm.list_id
    LEFT JOIN contacts c ON c.id = clm.contact_id
    LEFT JOIN campaigns cp ON cl.id = cp.list_id AND cp.status = 'sent'
    GROUP BY cl.id
    ORDER BY cl.created_at DESC
  `);
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  try {
    const result = await db.execute({
      sql: "INSERT INTO contact_lists (name) VALUES (?)",
      args: [name.trim()],
    });
    return NextResponse.json({ id: Number(result.lastInsertRowid), name: name.trim(), member_count: 0 });
  } catch {
    return NextResponse.json({ error: "A list with that name already exists" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: number };
  await db.batch([
    { sql: "DELETE FROM contact_list_members WHERE list_id = ?", args: [id] },
    { sql: "DELETE FROM contact_lists WHERE id = ?", args: [id] },
  ], "write");
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const { id, name } = await req.json() as { id: number; name: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  try {
    await db.execute({ sql: "UPDATE contact_lists SET name = ? WHERE id = ?", args: [name.trim(), id] });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "A list with that name already exists" }, { status: 400 });
  }
}
