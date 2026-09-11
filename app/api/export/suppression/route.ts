import { NextResponse } from "next/server";
import db from "@/lib/db";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const revalidate = 0;


// GET /api/export/suppression — download suppression list as CSV
export async function GET(): Promise<NextResponse> {
  const result = await db.execute(
    `SELECT email, reason, datetime(created_at, 'unixepoch') AS added_at
     FROM suppression_list
     ORDER BY created_at DESC`
  );

  const rows = result.rows as unknown as { email: string; reason: string; added_at: string }[];

  const lines = [
    "email,reason,added_at",
    ...rows.map((r) => csvRow([r.email, r.reason, r.added_at])),
  ];

  const csv = lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppression-list-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
