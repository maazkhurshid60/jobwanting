import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionUserFromToken, type SessionUser } from "@/lib/users";
import { revealVaultSecret, revealsRemaining, logReveal } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(req: NextRequest): Promise<SessionUser | NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return me;
}

// GET /api/vault/[id]/reveal — the one endpoint that decrypts a stored secret.
// No re-entered password (removed by request — it was extra friction on every
// click). Still admin-only, still logged (lib/vault.ts) and rate-limited so a
// working session can't be used to dump every entry at once.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  if ((await revealsRemaining(me.username)) <= 0) {
    return NextResponse.json({ error: "Too many secrets revealed recently — please wait a few minutes." }, { status: 429 });
  }

  const result = await revealVaultSecret(id);
  if (result === null) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  await logReveal(id, result.label, me.username);
  return NextResponse.json({ secret: result.secret });
}
