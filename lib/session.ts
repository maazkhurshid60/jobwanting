import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return s;
}

/**
 * Creates a signed session token: "<userId>.<timestamp>.<hmac>".
 * userId is "env" for the bootstrap admin, or the numeric admin_users.id for a
 * DB-backed account. Must not contain "." (we only ever pass "env" or digits).
 */
export function createSessionToken(userId: string = "env"): string {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${ts}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Verifies a token and returns the embedded user id, or null if invalid. */
export function sessionUserId(token: string): string | null {
  if (!verifySessionToken(token)) return null;
  const uid = token.split(".")[0];
  return uid || null;
}

/** Returns true if the token is valid and not expired. */
export function verifySessionToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [userId, ts, sig] = parts;
    const payload = `${userId}.${ts}`;
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return false;
    const age = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
    return age < SESSION_MAX_AGE;
  } catch {
    return false;
  }
}

/** Constant-time password comparison against ADMIN_PASSWORD env var. */
export function verifyPassword(username: string, password: string): boolean {
  const envUser = process.env.ADMIN_USERNAME ?? "";
  const envPass = process.env.ADMIN_PASSWORD ?? "";
  if (!envUser || !envPass) return false;

  // Pad to equal length before timingSafeEqual to prevent length leaks
  const maxLen = Math.max(username.length, envUser.length, password.length, envPass.length, 1);
  const pad = (s: string) => Buffer.from(s.padEnd(maxLen, "\0"));

  const userMatch = timingSafeEqual(pad(username), pad(envUser));
  const passMatch = timingSafeEqual(pad(password), pad(envPass));
  return userMatch && passMatch;
}
