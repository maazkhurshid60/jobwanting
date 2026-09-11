import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionUserFromToken, type SessionUser } from "@/lib/users";
import { listVaultEntries, createVaultEntry } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(req: NextRequest): Promise<SessionUser | NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return me;
}

// GET /api/vault — list stored entries (label/username/url/notes only, no secrets)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;
  return NextResponse.json(await listVaultEntries());
}

// POST /api/vault — add a new entry
export async function POST(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const body = await req.json().catch(() => ({}));
  const result = await createVaultEntry({
    label: String(body.label ?? ""),
    username: String(body.username ?? ""),
    url: String(body.url ?? ""),
    notes: String(body.notes ?? ""),
    secret: String(body.secret ?? ""),
    createdBy: me.username,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, id: result.id });
}
