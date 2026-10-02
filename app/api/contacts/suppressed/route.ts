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

/* Reasons the rest of the app already writes. Restricting uploads to this set
   keeps the list searchable and keeps the Opt-Outs / Bounced split meaningful:
   anything matching bounce/invalid is routed to the Bounced page by the GET
   above, so a free-text reason would quietly decide which screen a row shows
   up on. */
const UPLOAD_REASONS = [
  "do_not_email",
  "unsubscribed",
  "spam_complaint",
  "bounced",
  "invalid",
] as const;

// Same shape the contact importer accepts: one @, a dotted domain, no spaces.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* How many statements go to the database at once. A master do-not-email list
   is the one import that can arrive with tens of thousands of rows, and one
   batch that size is a single oversized request that either times out or is
   rejected whole — losing the addresses we were told never to mail again. */
const CHUNK = 500;

/* POST /api/contacts/suppressed — add addresses to the master do-not-email list.
 *
 * Accepts an array of addresses rather than a file: the client reads the CSV or
 * TXT and pulls the addresses out of it, so this endpoint doesn't care whether
 * the source was a bare list, one column of a spreadsheet export, or a block of
 * pasted text.
 *
 * Suppression is additive and never destructive. An address already on the list
 * keeps its original reason and date (INSERT OR IGNORE) — a re-upload of last
 * month's file can't overwrite the record of why someone opted out, or reset
 * how long they have been suppressed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { emails?: unknown; reason?: unknown };

    if (!Array.isArray(body.emails)) {
      return NextResponse.json({ error: "emails must be an array of addresses" }, { status: 400 });
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const cleanReason = (UPLOAD_REASONS as readonly string[]).includes(reason)
      ? reason
      : "do_not_email";

    let invalid = 0;
    const seen = new Set<string>();
    for (const raw of body.emails) {
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (!isValidEmail(email)) { invalid++; continue; }
      seen.add(email);
    }

    const emails = [...seen];
    if (emails.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses were found in that file." },
        { status: 400 },
      );
    }

    // Which of these are new, measured before the insert — INSERT OR IGNORE
    // reports no difference between "added" and "was already there", and the
    // whole point of the upload is to know how much it actually changed.
    const existingResult = await db.execute("SELECT email FROM suppression_list");
    const existing = new Set(
      existingResult.rows.map((r) => (r.email as string).toLowerCase()),
    );
    const added = emails.filter((e) => !existing.has(e)).length;

    for (let i = 0; i < emails.length; i += CHUNK) {
      const slice = emails.slice(i, i + CHUNK);
      await db.batch(
        slice.flatMap((email) => [
          {
            sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, ?)",
            args: [email, cleanReason],
          },
          /* Mirror the status onto the contact so the Contacts page agrees with
             the suppression list. Harmless when the address isn't a contact —
             an uploaded do-not-email list is mostly people we have never had a
             record for, and blocking them is the point. */
          {
            sql: "UPDATE contacts SET status = 'unsubscribed' WHERE email = ?",
            args: [email],
          },
        ]),
        "write",
      );
    }

    return NextResponse.json({
      success: true,
      added,
      alreadyListed: emails.length - added,
      invalid,
      reason: cleanReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to upload suppression list";
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
