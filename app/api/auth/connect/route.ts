import { NextResponse } from "next/server";
import { generateSignedState, COOKIE_NAME, MAX_AGE } from "@/lib/state-cookie";

export const dynamic = "force-dynamic";
export const revalidate = 0;


/**
 * GET /api/auth/connect
 * Generates a CSRF state, stores it in a signed httpOnly cookie,
 * then redirects the browser to Top Echelon's OAuth authorize URL.
 */
export async function GET(): Promise<NextResponse> {
  const AUTHORIZE_URL = process.env.TOPECHELON_AUTHORIZE_URL;
  const CLIENT_ID = process.env.TOPECHELON_CLIENT_ID;
  const REDIRECT_URI = process.env.TOPECHELON_REDIRECT_URI;

  if (!AUTHORIZE_URL || !CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json(
      { error: "OAuth environment variables not configured" },
      { status: 500 }
    );
  }

  const { state, cookieValue } = generateSignedState();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "read",
    state,
    response_type: "code",
  });

  const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });

  return response;
}
