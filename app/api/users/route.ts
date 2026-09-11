import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import {
  getSessionUserFromToken,
  listUsers,
  createUser,
  setUserActive,
  setUserPassword,
  setUserRole,
  deleteUser,
  type SessionUser,
} from "@/lib/users";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Resolve the caller and require an admin role. Returns the user, or a response
// to short-circuit with (401 unauthenticated / 403 not an admin).
async function requireAdmin(req: NextRequest): Promise<SessionUser | NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return me;
}

// GET /api/users — list dashboard accounts (admin only)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;
  return NextResponse.json(await listUsers());
}

// POST /api/users — create a dashboard account (admin only)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "member";

  const result = await createUser(username, password, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, id: result.id });
}

// PATCH /api/users — enable/disable an account (admin only)
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "`active` must be a boolean" }, { status: 400 });
  }

  // Don't let an admin disable their own DB account (would lock themselves out).
  if (me.id === String(id) && body.active === false) {
    return NextResponse.json({ error: "You can't disable your own account." }, { status: 400 });
  }

  await setUserActive(id, body.active);
  return NextResponse.json({ success: true });
}

// PUT /api/users — update an existing account's password and/or role (admin only)
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const hasPassword = typeof body.password === "string" && body.password.length > 0;
  const hasRole = body.role !== undefined;
  if (!hasPassword && !hasRole) {
    return NextResponse.json({ error: "Nothing to update. Provide a password and/or role." }, { status: 400 });
  }

  // Don't let an admin demote their own DB account (would strip their own access).
  if (hasRole && me.id === String(id) && body.role !== "admin") {
    return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
  }

  if (hasPassword) {
    const result = await setUserPassword(id, String(body.password));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (hasRole) {
    const role = body.role === "admin" ? "admin" : "member";
    const result = await setUserRole(id, role);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/users — permanently remove a dashboard account (admin only)
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const me = await requireAdmin(req);
  if (me instanceof NextResponse) return me;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  // Don't let an admin delete their own DB account (would lock themselves out).
  if (me.id === String(id)) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  await deleteUser(id);
  return NextResponse.json({ success: true });
}
