import db from "./db";
import { encrypt, decrypt } from "./crypto";

const TOKEN_URL = process.env.TOPECHELON_TOKEN_URL!;
const CLIENT_ID = process.env.TOPECHELON_CLIENT_ID!;
const CLIENT_SECRET = process.env.TOPECHELON_CLIENT_SECRET!;
const REDIRECT_URI = process.env.TOPECHELON_REDIRECT_URI!;

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenRow {
  id: number;
  user_id: number;
  access_token: string;   // encrypted
  refresh_token: string;  // encrypted
  expires_at: number;
  scope: string;
  created_at: number;
  updated_at: number;
}

export interface ConnectionInfo {
  user_id: number;
  expires_at: number;
  scope: string;
  created_at: number;
  updated_at: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

// ── Internal: call token endpoint with rate-limit retry ──────────────────────

async function callTokenEndpoint(
  params: Record<string, string>
): Promise<TokenResponse> {
  const maxRetries = 3;
  let delay = 1_000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    });

    if (res.status === 429) {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw new Error("Top Echelon rate limit exceeded — try again shortly");
    }

    if (!res.ok) {
      // Never log the request body (contains secrets)
      throw new Error(`Token endpoint returned ${res.status}`);
    }

    return res.json() as Promise<TokenResponse>;
  }

  throw new Error("Token request failed after retries");
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Persist (or update) tokens for a user. Encrypts before writing. */
export async function storeTokens(
  userId: number,
  data: TokenResponse
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO te_connections
      (user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at    = excluded.expires_at,
      scope         = excluded.scope,
      updated_at    = excluded.updated_at`,
    args: [userId, encrypt(data.access_token), encrypt(data.refresh_token), expiresAt, data.scope, now, now],
  });
}

/**
 * Returns a valid access token for userId, refreshing automatically if the
 * stored token is within 60 seconds of expiry.
 * This is the ONLY function that should be used when making TE API calls.
 */
export async function getValidAccessToken(userId: number): Promise<string> {
  const result = await db.execute({
    sql: "SELECT * FROM te_connections WHERE user_id = ?",
    args: [userId],
  });
  const row = result.rows[0] as unknown as TokenRow | undefined;

  if (!row) {
    throw new Error(`No Top Echelon connection found for user ${userId}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresIn = Number(row.expires_at) - nowSeconds;

  if (expiresIn > 60) {
    return decrypt(row.access_token as string);
  }

  // Token expired or expiring soon — refresh
  const fresh = await callTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: decrypt(row.refresh_token as string),
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });

  await storeTokens(userId, fresh);
  return fresh.access_token;
}

/** Exchange auth code for tokens (initial OAuth step). */
export async function exchangeCodeForTokens(
  code: string
): Promise<TokenResponse> {
  return callTokenEndpoint({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });
}

/** Returns connection metadata (no tokens). */
export async function getConnection(userId: number): Promise<ConnectionInfo | null> {
  const result = await db.execute({
    sql: "SELECT user_id, expires_at, scope, created_at, updated_at FROM te_connections WHERE user_id = ?",
    args: [userId],
  });
  return (result.rows[0] as unknown as ConnectionInfo) ?? null;
}

/** Deletes the stored connection and tokens for a user. */
export async function deleteConnection(userId: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM te_connections WHERE user_id = ?",
    args: [userId],
  });
}
