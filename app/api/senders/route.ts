import { NextResponse } from "next/server";
import { listVerifiedSenders } from "@/lib/brevo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* GET /api/senders — the addresses a campaign may go out as.
 *
 * Backs the sender dropdown in the composer. The account has several verified
 * domains and which one a campaign should come from is an editorial choice,
 * not a deployment constant, so it cannot stay in BREVO_SENDER_EMAIL.
 *
 * An error is returned as a message rather than an empty list. The composer
 * falls back to the configured default sender when this fails, so a campaign
 * can still go out; swallowing the reason would make that look deliberate. */
export async function GET(): Promise<NextResponse> {
  try {
    const senders = await listVerifiedSenders();
    return NextResponse.json({
      senders: senders.map((s) => ({ email: s.email, name: s.name })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Brevo";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
