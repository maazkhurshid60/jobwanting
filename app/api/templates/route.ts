import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;


interface TemplateRow {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_at: number;
  updated_at: number;
}

export async function GET(): Promise<NextResponse> {
  const result = await db.execute("SELECT * FROM email_templates ORDER BY updated_at DESC");
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { name, subject, body, list_id, builder_json, category } = await req.json();
  if (!name?.trim() || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Name, subject and body required" }, { status: 400 });
  }
  const result = await db.execute({
    sql: "INSERT INTO email_templates (name, subject, body, list_id, builder_json, category) VALUES (?, ?, ?, ?, ?, ?)",
    args: [name.trim(), subject.trim(), body.trim(), list_id ?? null, builder_json ?? null, category || "general"],
  });
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { id, name, subject, body, list_id, builder_json, category } = await req.json();
  await db.execute({
    sql: "UPDATE email_templates SET name=?, subject=?, body=?, list_id=?, builder_json=?, category=?, updated_at=unixepoch() WHERE id=?",
    args: [name, subject, body, list_id ?? null, builder_json ?? null, category || "general", id],
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { id } = await req.json();
  await db.execute({ sql: "DELETE FROM email_templates WHERE id=?", args: [id] });
  return NextResponse.json({ success: true });
}
