import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// GET /api/contacts/activity?email=...
// Returns all campaigns sent to a contact, with open status.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";

  if (!email) return NextResponse.json([]);

  // Join campaigns sent to this email with open events
  const result = await db.execute({
    sql: `
      SELECT
        cr.campaign_id,
        c.subject,
        cr.sent_at,
        CASE WHEN eo.id IS NOT NULL THEN 1 ELSE 0 END AS opened
      FROM campaign_recipients cr
      JOIN campaigns c ON c.id = cr.campaign_id
      LEFT JOIN email_opens eo ON eo.campaign_id = cr.campaign_id AND eo.email = cr.email
      WHERE cr.email = ?
      GROUP BY cr.campaign_id
      ORDER BY cr.sent_at DESC
      LIMIT 50
    `,
    args: [email],
  });

  return NextResponse.json(
    result.rows.map((r) => ({
      campaign_id: r.campaign_id,
      subject: r.subject,
      sent_at: r.sent_at,
      opened: r.opened === 1,
    }))
  );
}
