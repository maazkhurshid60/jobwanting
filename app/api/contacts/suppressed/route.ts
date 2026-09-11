import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;


// GET /api/contacts/suppressed — list all suppressed contacts
export async function GET(): Promise<NextResponse> {
  try {
    // Opt-Outs shows genuine unsubscribes/spam complaints only. Bounces and
    // invalid addresses have their own dedicated "Bounced" page, so exclude them
    // here to avoid showing the same record in two places.
    const result = await db.execute(`
      SELECT email, reason, created_at
      FROM suppression_list
      WHERE reason NOT IN ('bounced', 'invalid') AND reason NOT LIKE '%bounce%'
      ORDER BY created_at DESC
    `);
    const rows = result.rows.map((r) => ({
      email: r.email,
      reason: r.reason,
      created_at: Number(r.created_at),
    }));
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch suppressed contacts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/contacts/suppressed — reactivate (remove from suppression list)
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await req.json() as { email?: string };
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    await db.batch([
      { sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [cleanEmail] },
      { sql: "UPDATE contacts SET status = 'active' WHERE LOWER(email) = ?", args: [cleanEmail] },
    ], "write");

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reactivate contact";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
