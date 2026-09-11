import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { findUserForLogin, usernameExists, checkLoginLockout, recordFailedLogin, clearLoginAttempts } from "@/lib/users";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let username = "";
  let password = "";

  try {
    const body = await req.json();
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  /* Everything from here needs the database, and when it could not be
     reached this threw — Next answered 500 with an empty body, the login
     form's res.json() threw on that, and its catch reported "Network error
     — please try again". Which sent whoever was debugging to look at the
     network, when the actual cause was TURSO_DATABASE_URL missing from the
     deployment's environment. An unreachable database is not a bad password
     and not a bad connection; say so. */
  let userId: string | null = null;
  try {
    const lockedFor = await checkLoginLockout(username);
    if (lockedFor !== null) {
      const minutes = Math.ceil(lockedFor / 60);
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429 }
      );
    }

    // DB-backed accounts first. The env bootstrap admin is only a fallback and
    // ONLY works while no DB account exists for that username — so once the admin
    // changes their password (which migrates them into the DB), the old env
    // password is retired automatically.
    const dbId = await findUserForLogin(username, password);
    if (dbId !== null) {
      userId = String(dbId);
    } else if (verifyPassword(username, password) && !(await usernameExists(username))) {
      userId = "env";
    }

    if (!userId) {
      await recordFailedLogin(username);
      // Fixed delay to slow brute-force attempts
      await new Promise((r) => setTimeout(r, 500));
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await clearLoginAttempts(username);
  } catch (err) {
    // Never the credentials themselves — only what went wrong reaching storage.
    console.error("login: storage unavailable", err);
    return NextResponse.json(
      {
        error:
          "The server can't reach its database. This is a configuration problem on the server, not your password — please tell your administrator.",
      },
      { status: 503 }
    );
  }

  const token = createSessionToken(userId);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return response;
}
