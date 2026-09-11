import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getBrevoEvents, DateRange } from "@/lib/brevo";
import { isValidDateStr } from "@/lib/dateRange";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 500; // raw events pulled from Brevo per request

// GET /api/analytics/events — one offset-paginated page of the Brevo activity feed.
// Params: days | from&to, listId, offset. Returns { events, hasMore }.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days")) || 30));
  const listIdParam = req.nextUrl.searchParams.get("listId");
  const listId = listIdParam ? Number(listIdParam) : null;
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const hasRange = isValidDateStr(fromParam) && isValidDateStr(toParam);
  const range: DateRange | undefined = hasRange ? { startDate: fromParam, endDate: toParam } : undefined;

  const raw = await getBrevoEvents(days, PAGE, range, offset);
  // A full raw page means Brevo may have more beyond this offset.
  const hasMore = raw.length === PAGE;

  // Scope to a list by keeping only events for that list's member addresses.
  let events = raw;
  if (listId) {
    const m = await db.execute({
      sql: `SELECT LOWER(c.email) AS e FROM contact_list_members m JOIN contacts c ON c.id = m.contact_id WHERE m.list_id = ?`,
      args: [listId],
    });
    const members = new Set(m.rows.map((r) => String(r.e)));
    events = raw.filter((e) => members.has((e.email || "").toLowerCase()));
  }

  return NextResponse.json({ events, hasMore, nextOffset: offset + PAGE });
}
