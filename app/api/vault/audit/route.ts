import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionUserFromToken, type SessionUser } from "@/lib/users";
import { listVaultAuditLog } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(req: NextRequest): Promise<SessionUser | NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return me;
}

// GET /api/vault/audit — who revealed which vault entry, and when. Read-only
// visibility into secret access, so a stolen session's activity shows up here.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  return NextResponse.json(await listVaultAuditLog(15));
}
