import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* The one predicate that decides whether an address is a bounce or an opt-out,
   written once. The Opt-Outs page, the Bounced page and this export all have to
   agree on which side a row falls, or the two halves of a split download will
   either double-count an address or lose it. */
const BOUNCE_SQL =
  "(reason IN ('bounced', 'invalid') OR reason LIKE '%bounce%')";

const VIEWS = {
  // The whole master do-not-email list — the file that round-trips back through
  // the Upload List button.
  all: { where: "", filename: "do-not-email-master" },
  // Genuine unsubscribes and complaints, matching the Opt-Outs table.
  optouts: { where: `WHERE NOT ${BOUNCE_SQL}`, filename: "do-not-email-optouts" },
  // Hard bounces, blocks and invalid addresses.
  bounced: { where: `WHERE ${BOUNCE_SQL}`, filename: "do-not-email-bounced" },
} as const;

type ViewId = keyof typeof VIEWS;

/* GET /api/export/suppression — download the master do-not-email list as CSV.
 *
 * ?view=all (default) | optouts | bounced. Defaulting to the whole list keeps
 * the existing Contacts-page button exporting exactly what it always did, and
 * means the download that is meant to be re-uploadable is the one you get
 * without thinking about it.
 *
 * Columns match what the uploader reads back, so a file downloaded here can be
 * handed to someone, edited, and uploaded again without reshaping it.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const requested = req.nextUrl.searchParams.get("view") ?? "all";
  const view: ViewId = requested in VIEWS ? (requested as ViewId) : "all";
  const { where, filename } = VIEWS[view];

  const result = await db.execute(
    `SELECT email, reason, datetime(created_at, 'unixepoch') AS added_at
     FROM suppression_list
     ${where}
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
      "Content-Disposition": `attachment; filename="${filename}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
