import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/unsubscribe?email=... — do NOT suppress on a bare GET. Email security
// scanners and inbox link-prefetchers fetch links automatically, which would
// unsubscribe people who never clicked. Instead, send them to the confirmation
// page where an explicit button click (POST) performs the unsubscribe.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  const target = email && email.includes("@")
    ? `/unsubscribe?email=${encodeURIComponent(email)}`
    : "/unsubscribe?status=invalid";
  return NextResponse.redirect(new URL(target, req.url));
}

// POST /api/unsubscribe — called from the unsubscribe page form.
//
// This endpoint is public (recipients have no session), which makes it a target
// for bots that spray fabricated addresses (e.g. Gmail dot-variations) to
// pollute the database. Two guards keep it clean:
//   1. Honeypot — a hidden form field real users never fill.
//   2. Recipient check — we only act on addresses we actually hold as a contact
//      or have emailed. Fabricated addresses were never recipients, so they are
//      silently ignored (and never inserted). Real recipients unsubscribe as
//      normal, so CAN-SPAM compliance is preserved.
// We also no longer CREATE contacts here (update existing only), so the route
// can never add rows to the contacts table.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as { email?: string; hp?: string; website?: string };

  // Honeypot: any value here means a bot filled a hidden field.
  if (body.hp || body.website) {
    return NextResponse.json({ success: true });
  }

  const cleanEmail = (body.email ?? "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  // Only honor unsubscribes for addresses that are genuinely on our list or were
  // sent a campaign. Silently succeed otherwise so we neither reveal list
  // membership nor write junk.
  const known = await db.execute({
    sql: `SELECT 1 FROM contacts WHERE email = ?
          UNION ALL SELECT 1 FROM campaign_recipients WHERE email = ?
          LIMIT 1`,
    args: [cleanEmail, cleanEmail],
  });
  if (known.rows.length === 0) {
    return NextResponse.json({ success: true });
  }

  await db.batch([
    { sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, 'unsubscribed')", args: [cleanEmail] },
    { sql: "UPDATE contacts SET status = 'unsubscribed' WHERE email = ?", args: [cleanEmail] },
  ], "write");
  return NextResponse.json({ success: true });
}

// PATCH /api/unsubscribe — update unsubscribe reason / feedback
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { email, reason } = await req.json() as { email?: string; reason?: string };
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanReason = (reason ?? "").trim();
    if (!cleanEmail || !cleanReason) {
      return NextResponse.json({ error: "Email and reason are required" }, { status: 400 });
    }

    await db.execute({
      sql: "UPDATE suppression_list SET reason = ? WHERE LOWER(email) = ?",
      args: [cleanReason, cleanEmail],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update reason";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
