import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE, SESSION_MAX_AGE, verifyPassword, createSessionToken,
} from "@/lib/session";
import {
  getSessionUserFromToken, findUserForLogin, setUserPassword, promoteEnvAdminToDb,
} from "@/lib/users";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/users/me/password — the logged-in user changes their OWN password.
// Works for both DB accounts and the env bootstrap admin (which is migrated into
// the DB on first change, retiring the old env password).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const me = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }

  // Env bootstrap admin → verify against the env password, then migrate to DB.
  if (me.id === "env") {
    if (!verifyPassword(me.username, currentPassword)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const result = await promoteEnvAdminToDb(me.username, newPassword);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // Re-issue the session as the new DB account so the identity is consistent.
    const res = NextResponse.json({ success: true, migrated: true });
    res.cookies.set(SESSION_COOKIE, createSessionToken(String(result.id)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  }

  // DB account → verify current password against the stored hash, then update.
  const verifiedId = await findUserForLogin(me.username, currentPassword);
  if (verifiedId === null || String(verifiedId) !== me.id) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  const result = await setUserPassword(Number(me.id), newPassword);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ success: true });
}
