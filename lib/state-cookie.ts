import { createHmac, randomBytes } from "crypto";

const COOKIE_NAME = "te_oauth_state";
const MAX_AGE = 60 * 10; // 10 minutes — auth code expires in 10 min

function getSecret(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  return key;
}

/** Creates a random state string and its HMAC signature. */
export function generateSignedState(): { state: string; cookieValue: string } {
  const state = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", getSecret()).update(state).digest("hex");
  return { state, cookieValue: `${state}.${sig}` };
}

/** Verifies that cookieValue was produced by generateSignedState() and matches state. */
export function verifySignedState(cookieValue: string, state: string): boolean {
  const [storedState, sig] = cookieValue.split(".");
  if (!storedState || !sig || storedState !== state) return false;
  const expectedSig = createHmac("sha256", getSecret())
    .update(storedState)
    .digest("hex");
  return sig === expectedSig;
}

export { COOKIE_NAME, MAX_AGE };
