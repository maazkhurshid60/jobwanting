import { NextRequest, NextResponse } from "next/server";
import { verifySmtpAccount } from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* Re-test a saved mailbox on demand.
 *
 * Separate from POST because credentials go stale on their own: an app
 * password gets revoked, 2FA is turned on, a host changes its port. Finding
 * that out from a button is better than finding it out from a campaign that
 * reports every recipient failed. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { id } = (await req.json()) as { id?: number };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const result = await verifySmtpAccount(Number(id));
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: result.error }, { status: 400 });
}
