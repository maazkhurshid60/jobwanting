import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { csvRow } from "@/lib/csv";

// GET /api/export/mailing-list
// Returns a CSV formatted for postcard / direct mail campaigns.
// Only includes contacts that have at minimum street_address + city + state.
// Optional query param: ?segment=Healthcare  — filters by segment tag.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment")?.trim() ?? "";

  const result = await db.execute(`
    SELECT first_name, last_name, name, company, title,
           street_address, city, state, zip_code, country, email
    FROM contacts
    WHERE status = 'active'
      AND street_address != ''
      AND city != ''
      AND state != ''
    ORDER BY last_name ASC, first_name ASC
  `);

  let rows = result.rows as unknown as {
    first_name: string;
    last_name: string;
    name: string;
    company: string;
    title: string;
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    email: string;
  }[];

  // Optional segment filter — stored as comma-separated in segments column
  if (segment) {
    const segRows = await db.execute({
      sql: `SELECT id, email FROM contacts WHERE status = 'active' AND (segments LIKE ? OR segments LIKE ? OR segments LIKE ? OR segments = ?)`,
      args: [
        `%,${segment},%`,
        `${segment},%`,
        `%,${segment}`,
        segment,
      ],
    });
    const segEmails = new Set(segRows.rows.map((r) => (r.email as string).toLowerCase()));
    rows = rows.filter((r) => segEmails.has(r.email.toLowerCase()));
  }

  const header = "First Name,Last Name,Company,Title,Street Address,City,State,ZIP Code,Country,Email\r\n";
  const lines = rows.map((r) => {
    // Derive first/last from name if split fields are empty
    const fn = (r.first_name || r.name.split(" ")[0] || "").trim();
    const ln = (r.last_name  || r.name.split(" ").slice(1).join(" ") || "").trim();
    return csvRow([
      fn, ln, r.company, r.title, r.street_address,
      r.city, r.state, r.zip_code, r.country || "US", r.email,
    ]);
  });

  const csv = header + lines.join("\r\n");
  const filename = segment
    ? `mailing-list-${segment.toLowerCase().replace(/\s+/g, "-")}.csv`
    : "mailing-list.csv";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
