import { NextRequest, NextResponse } from "next/server";
import { verifySignedState, COOKIE_NAME } from "@/lib/state-cookie";
import { exchangeCodeForTokens, storeTokens } from "@/lib/token";

// Single admin user — all tokens are stored under this ID.
const ADMIN_USER_ID = 1;

/**
 * GET /api/auth/callback
 * Top Echelon redirects here after the user authorises the integration.
 * Verifies CSRF state, exchanges auth code for tokens, persists them server-side.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Surface OAuth errors from the provider
  if (error) {
    return NextResponse.redirect(
      new URL(`/connect?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connect?error=missing_params", req.url)
    );
  }

  // Verify CSRF state against the signed cookie
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue || !verifySignedState(cookieValue, state)) {
    return NextResponse.redirect(
      new URL("/connect?error=invalid_state", req.url)
    );
  }

  try {
    const tokenData = await exchangeCodeForTokens(code);
    await storeTokens(ADMIN_USER_ID, tokenData);
  } catch {
    // Do NOT log token values — only surface a generic error
    return NextResponse.redirect(
      new URL("/connect?error=token_exchange_failed", req.url)
    );
  }

  // Clear the state cookie and send user to the admin dashboard
  const response = NextResponse.redirect(new URL("/bd825db8c738", req.url));
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
