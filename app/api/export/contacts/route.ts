import { NextResponse } from "next/server";
import db from "@/lib/db";
import { csvRow, csvCell, csvTextCell } from "@/lib/csv";

// GET /api/export/contacts — download contacts as CSV
// ?filter=removed  → only contacts in suppression_list with reason='removed'
// ?filter=all      → all contacts (default)
// ?list=<id>       → only contacts that belong to the given contact list
// ?full=1          → export every spreadsheet field (not just the summary set)
export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") ?? "all";
  const listId = searchParams.get("list");
  const full = searchParams.get("full") === "1";
  const date = new Date().toISOString().slice(0, 10);

  if (filter === "removed") {
    // Contacts removed via the Remove button — in suppression_list with reason='removed'
    // Also include any that still exist in contacts with unsubscribed/invalid status
    const result = await db.execute(`
      SELECT
        COALESCE(c.name, '') AS name,
        s.email,
        COALESCE(c.status, 'removed') AS status,
        COALESCE(c.title, '') AS title,
        COALESCE(c.company, '') AS company,
        s.reason,
        datetime(s.created_at, 'unixepoch') AS removed_at
      FROM suppression_list s
      LEFT JOIN contacts c ON c.email = s.email
      ORDER BY s.created_at DESC
    `);
    const lines = [
      "name,email,title,company,status,reason,removed_at",
      ...(result.rows as unknown as { name: string; email: string; title: string; company: string; status: string; reason: string; removed_at: string }[])
        .map((r) => csvRow([r.name, r.email, r.title, r.company, r.status, r.reason, r.removed_at])),
    ];
    return csv(lines, `removed-contacts-${date}.csv`);
  }

  // Resolve scope (all contacts, or a single list) once — shared by both modes.
  let scopeLabel = "all"; // download-filename label
  let joinSql = "";
  let whereSql = "";
  const args: number[] = [];

  if (listId && /^\d+$/.test(listId)) {
    const nameRes = await db.execute({ sql: "SELECT name FROM contact_lists WHERE id = ?", args: [Number(listId)] });
    const listName = (nameRes.rows[0]?.name as string | undefined) ?? `list-${listId}`;
    scopeLabel = listName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `list-${listId}`;
    joinSql = "JOIN contact_list_members clm ON clm.contact_id = c.id";
    whereSql = "WHERE clm.list_id = ?";
    args.push(Number(listId));
  }

  if (full) {
    // Every column shown in the Spreadsheet, in the same order.
    const result = await db.execute({
      sql: `
        SELECT
          (SELECT GROUP_CONCAT(cl.name, ', ')
             FROM contact_list_members m
             JOIN contact_lists cl ON m.list_id = cl.id
            WHERE m.contact_id = c.id) AS lists,
          COALESCE(c.status, 'active') AS status,
          COALESCE(c.name, '')             AS name,
          COALESCE(c.first_name, '')       AS first_name,
          COALESCE(c.last_name, '')        AS last_name,
          c.email,
          COALESCE(c.title, '')            AS title,
          COALESCE(c.company, '')          AS company,
          COALESCE(c.street_address, '')   AS street_address,
          COALESCE(c.city, '')             AS city,
          COALESCE(c.state, '')            AS state,
          COALESCE(c.zip_code, '')         AS zip_code,
          COALESCE(c.phone, '')            AS phone,
          COALESCE(c.work_phone_2, '')     AS work_phone_2,
          COALESCE(c.phone_2, '')          AS phone_2,
          COALESCE(c.mobile_phone_2, '')   AS mobile_phone_2,
          COALESCE(c.business_email, '')   AS business_email,
          COALESCE(c.email_2, '')          AS email_2,
          COALESCE(c.personal_email_2, '') AS personal_email_2,
          COALESCE(c.linkedin, '')         AS linkedin,
          COALESCE(c.website, '')          AS website,
          COALESCE(c.county, '')           AS county,
          COALESCE(c.region, '')           AS region,
          COALESCE(c.country, '')          AS country,
          COALESCE(c.segments, '')         AS segments,
          COALESCE(c.notes, '')            AS notes,
          datetime(c.created_at, 'unixepoch') AS created_at
        FROM contacts c
        ${joinSql}
        ${whereSql}
        ORDER BY c.created_at DESC
      `,
      args,
    });

    const header = csvRow([
      "Contact List", "Status", "Name", "First", "Last", "Email", "Title", "Company",
      "Work Address", "City", "State", "ZIP", "Work Phone 1", "Work Phone 2", "Mobile 1", "Mobile 2",
      "Business Email", "Personal Email 1", "Personal Email 2", "LinkedIn", "Website",
      "County", "Region", "Country", "Segments", "Notes", "Created At",
    ]);
    const lines = [
      header,
      ...result.rows.map((r) => {
        const cells = [
          r.lists ?? "", r.status, r.name, r.first_name, r.last_name, r.email, r.title, r.company,
          r.street_address, r.city, r.state, r.zip_code, r.phone, r.work_phone_2, r.phone_2, r.mobile_phone_2,
          r.business_email, r.email_2, r.personal_email_2, r.linkedin, r.website,
          r.county, r.region, r.country, r.segments, r.notes, r.created_at,
        ];
        // Index 11 is ZIP — emit as text so Excel keeps leading zeros (02886).
        return cells.map((v, i) => (i === 11 ? csvTextCell(v) : csvCell(v))).join(",");
      }),
    ];
    return csv(lines, `${scopeLabel}-contacts-${date}.csv`);
  }

  // Summary export (used by the Contacts page's "All Contacts" button)
  const result = await db.execute({
    sql: `
      SELECT
        c.name,
        c.email,
        COALESCE(c.status, 'active') AS status,
        COALESCE(c.title, '') AS title,
        COALESCE(c.company, '') AS company,
        COALESCE(c.tags, '') AS tags,
        datetime(c.created_at, 'unixepoch') AS created_at
      FROM contacts c
      ${joinSql}
      ${whereSql}
      ORDER BY c.created_at DESC
    `,
    args,
  });
  const rows = result.rows as unknown as { name: string; email: string; title: string; company: string; status: string; tags: string; created_at: string }[];
  const lines = [
    "name,email,title,company,status,tags,created_at",
    ...rows.map((r) => csvRow([r.name, r.email, r.title, r.company, r.status, r.tags, r.created_at])),
  ];
  return csv(lines, `${scopeLabel}-contacts-${date}.csv`);
}

function csv(lines: string[], filename: string): NextResponse {
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
