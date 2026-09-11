import { NextRequest, NextResponse } from "next/server";

/* Next 16 renamed the "middleware" file convention to "proxy". Same contract,
   same matcher; only the filename and the exported function name changed.
   Kept here rather than left deprecated because the old name warns on every
   build and is scheduled to stop working. */

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

const PROTECTED = ["/bd825db8c738", "/connect"];

// API endpoints that must stay reachable without an admin session:
// - login (you can't be authed yet), OAuth callback (external redirect)
// - the tracking pixel and unsubscribe link (hit by recipients' mail clients)
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/track/open",
  "/api/unsubscribe",
  // Scheduler cron worker: hit by Vercel Cron with no admin session. It is not
  // open — it verifies CRON_SECRET itself (see app/api/scheduler/run/route.ts).
  "/api/scheduler/run",
];

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [userId, ts, sig] = parts;
    const payload = `${userId}.${ts}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBytes(sig),
      enc.encode(payload)
    );
    if (!valid) return false;

    const age = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
    return age < SESSION_MAX_AGE;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Return 404 for old /admin path so bots get nothing
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse(null, { status: 404 });
  }

  // Protect all API routes except the explicitly public ones. Unauthenticated
  // API calls get a 401 (not a redirect — these are fetch/XHR, not navigations).
  if (pathname.startsWith("/api/")) {
    // Serving an uploaded email image by id must be public — recipients' mail
    // clients fetch these with no session. Only the GET-by-id serve route is
    // opened up; upload/list/delete on /api/images stay protected below.
    if (req.method === "GET" && /^\/api\/images\/\d+$/.test(pathname)) {
      return NextResponse.next();
    }

    const isPublic = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (isPublic) return NextResponse.next();

    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token && (await verifyToken(token))) return NextResponse.next();

    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) return NextResponse.next();
  if (pathname === "/feb58da15ece") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifyToken(token))) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/feb58da15ece";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/admin", "/bd825db8c738/:path*", "/connect/:path*", "/connect", "/feb58da15ece", "/api/:path*"],
};
