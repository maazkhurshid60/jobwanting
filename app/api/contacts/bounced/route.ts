import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// GET /api/contacts/bounced — addresses that bounced/were blocked/invalid,
// joined to the contact record so we can show who they are and fix the email.
export async function GET(): Promise<NextResponse> {
  try {
    const result = await db.execute(`
      SELECT s.email, s.reason, s.created_at,
             c.id AS contact_id, c.name, c.company, c.title, c.status,
             (SELECT MAX(cr.sent_at) FROM campaign_recipients cr
               WHERE LOWER(cr.email) = LOWER(s.email)) AS last_sent,
             (SELECT COUNT(*) FROM email_send_log l
               WHERE LOWER(l.email) = LOWER(s.email)) AS send_count,
             (SELECT GROUP_CONCAT(cl.name, ', ')
                FROM contact_list_members clm
                JOIN contact_lists cl ON clm.list_id = cl.id
               WHERE clm.contact_id = c.id) AS lists,
             (SELECT GROUP_CONCAT(clm.list_id, ', ')
                FROM contact_list_members clm
               WHERE clm.contact_id = c.id) AS list_ids
      FROM suppression_list s
      LEFT JOIN contacts c ON LOWER(c.email) = LOWER(s.email)
      WHERE s.reason IN ('bounced', 'invalid') OR s.reason LIKE '%bounce%'
      ORDER BY s.created_at DESC
    `);
    const rows = result.rows.map((r) => ({
      email: r.email,
      reason: r.reason,
      created_at: Number(r.created_at),
      last_sent: r.last_sent != null ? Number(r.last_sent) : null,
      send_count: Number(r.send_count ?? 0),
      contact_id: r.contact_id != null ? Number(r.contact_id) : null,
      name: r.name ?? null,
      company: r.company ?? null,
      title: r.title ?? null,
      status: r.status ?? null,
      lists: r.lists ?? null,
      list_ids: r.list_ids ?? null,
    }));
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch bounced contacts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Fields a re-upload is allowed to update. status/bounce_reason/id/email handled separately.
const IMPORT_FIELDS = [
  "name", "first_name", "last_name", "title", "company",
  "business_email", "email_2", "personal_email_2",
  "phone", "work_phone_2", "phone_2", "mobile_phone_2",
  "linkedin", "website",
  "street_address", "city", "state", "zip_code", "county", "region", "country",
];

// POST /api/contacts/bounced — bulk apply a fixed export back onto contacts.
// Matches each row by `id` (preferred) or current `email`, updates fields
// NON-destructively (a blank cell never wipes existing data — protects edits the
// team already made). Then, per row:
//   • `__keep` empty  → release: apply a corrected email if given, set active,
//                       and remove the address(es) from suppression (sendable again).
//   • `__keep` set    → keep in bounced: apply field edits, leave the contact
//                       suppressed, and store the note as the reason (e.g.
//                       "bounced: Retired") so it still shows on the Bounced page.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { rows } = await req.json() as { rows?: Record<string, unknown>[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }

    let released = 0, kept = 0, invalid = 0, notFound = 0;

    for (const row of rows) {
      const id = row.id != null && String(row.id).trim() !== "" ? Number(row.id) : null;
      const newEmail = String(row.email ?? "").trim().toLowerCase();
      const keepNote = String(row.__keep ?? "").trim();
      const isKeep = keepNote !== "";
      const keepReason = isKeep ? `bounced: ${keepNote}`.slice(0, 200) : "";

      // Locate the contact: by id first (survives an email correction), then by email
      let contact: { id: number; email: string } | null = null;
      if (id && Number.isFinite(id)) {
        const r = await db.execute({ sql: "SELECT id, email FROM contacts WHERE id = ?", args: [id] });
        if (r.rows[0]) contact = { id: Number(r.rows[0].id), email: String(r.rows[0].email) };
      }
      if (!contact && newEmail) {
        const r = await db.execute({ sql: "SELECT id, email FROM contacts WHERE LOWER(email) = ?", args: [newEmail] });
        if (r.rows[0]) contact = { id: Number(r.rows[0].id), email: String(r.rows[0].email) };
      }

      // No matching contact row — just manage the suppression entry by email
      if (!contact) {
        if (!isValidEmail(newEmail)) { notFound++; continue; }
        if (isKeep) {
          await db.execute({ sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, ?)", args: [newEmail, keepReason] });
          await db.execute({ sql: "UPDATE suppression_list SET reason = ? WHERE LOWER(email) = ?", args: [keepReason, newEmail] });
          kept++;
        } else {
          await db.execute({ sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [newEmail] });
          released++;
        }
        continue;
      }

      // Non-destructive field updates
      const sets: string[] = [];
      const args: (string | number)[] = [];
      for (const f of IMPORT_FIELDS) {
        const v = row[f];
        if (v === undefined) continue;
        const val = String(v).trim();
        if (!val) continue; // blank never overwrites existing data
        sets.push(`${f} = ?`);
        args.push(val);
      }

      const affectedEmails = [contact.email.toLowerCase()];

      // Apply a corrected email if it changed, is valid, and doesn't collide
      if (newEmail && newEmail !== contact.email.toLowerCase()) {
        if (!isValidEmail(newEmail)) {
          invalid++;
        } else {
          const conflict = await db.execute({
            sql: "SELECT id FROM contacts WHERE LOWER(email) = ? AND id != ?",
            args: [newEmail, contact.id],
          });
          if (conflict.rows.length === 0) {
            sets.push("email = ?");
            args.push(newEmail);
            affectedEmails.push(newEmail);
          }
        }
      }

      if (isKeep) {
        // Keep suppressed — apply edits but leave them in the bounced list
        if (sets.length > 0) {
          args.push(contact.id);
          await db.execute({ sql: `UPDATE contacts SET ${sets.join(", ")} WHERE id = ?`, args });
        }
        for (const e of affectedEmails) {
          await db.execute({ sql: "INSERT OR IGNORE INTO suppression_list (email, reason) VALUES (?, ?)", args: [e, keepReason] });
          await db.execute({ sql: "UPDATE suppression_list SET reason = ? WHERE LOWER(email) = ?", args: [keepReason, e] });
        }
        kept++;
      } else {
        // Release — apply edits, reactivate, and drop from suppression
        sets.push("status = 'active'");
        args.push(contact.id);
        await db.execute({ sql: `UPDATE contacts SET ${sets.join(", ")} WHERE id = ?`, args });
        for (const e of affectedEmails) {
          await db.execute({ sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [e] });
        }
        released++;
      }
    }

    return NextResponse.json({ released, kept, invalid, notFound });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/contacts/bounced — correct a wrong email and release it back to sendable.
// Updates the contact's email to the new address, removes the old (bad) address
// from the suppression list, and reactivates the contact.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { oldEmail, newEmail } = await req.json() as { oldEmail?: string; newEmail?: string };
    const oldClean = (oldEmail ?? "").trim().toLowerCase();
    const newClean = (newEmail ?? "").trim().toLowerCase();

    if (!oldClean) {
      return NextResponse.json({ error: "Original email is required" }, { status: 400 });
    }
    if (!isValidEmail(newClean)) {
      return NextResponse.json({ error: "Please enter a valid new email address" }, { status: 400 });
    }
    if (oldClean === newClean) {
      return NextResponse.json({ error: "The new email is the same as the old one" }, { status: 400 });
    }

    // Don't let the new address collide with a different existing contact
    const collision = await db.execute({
      sql: "SELECT id FROM contacts WHERE LOWER(email) = ? LIMIT 1",
      args: [newClean],
    });
    if (collision.rows.length > 0) {
      return NextResponse.json(
        { error: `Another contact already uses ${newClean}` },
        { status: 409 }
      );
    }

    await db.batch([
      // Point the contact at the corrected address and reactivate them
      { sql: "UPDATE contacts SET email = ?, status = 'active' WHERE LOWER(email) = ?", args: [newClean, oldClean] },
      // Remove the bad address from suppression so it stops blocking sends
      { sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [oldClean] },
      // If the corrected address was itself suppressed before, clear it too so we can send
      { sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [newClean] },
    ], "write");

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/contacts/bounced — release as-is (remove from suppression, reactivate)
// without changing the email. Use when you believe the bounce was temporary.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await req.json() as { email?: string };
    const clean = (email ?? "").trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    await db.batch([
      { sql: "DELETE FROM suppression_list WHERE LOWER(email) = ?", args: [clean] },
      { sql: "UPDATE contacts SET status = 'active' WHERE LOWER(email) = ?", args: [clean] },
    ], "write");
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to release contact";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
