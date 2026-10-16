import { NextRequest, NextResponse } from "next/server";
import {
  listSmtpAccounts,
  createSmtpAccount,
  deleteSmtpAccount,
  verifySmtpAccount,
} from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* Mailboxes a campaign can be sent through instead of Brevo.
 *
 * The password is write-only across this boundary: it goes in on POST and is
 * never returned by GET, so the panel can list and pick a mailbox without the
 * secret ever being in a page the browser holds. */

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ accounts: await listSmtpAccounts() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load mailboxes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const b = (await req.json()) as {
    label?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    fromEmail?: string;
    fromName?: string;
    dailyLimit?: number;
  };

  const missing = (["label", "host", "username", "password", "fromEmail"] as const).filter(
    (k) => !b[k]?.toString().trim(),
  );
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const port = Number(b.port) || 587;

  try {
    const id = await createSmtpAccount({
      label: b.label!,
      host: b.host!,
      port,
      /* 465 is implicit TLS; 587 and 25 start plaintext and upgrade with
         STARTTLS, which nodemailer does on its own when secure is false.
         Defaulting off the port rather than trusting the checkbox avoids the
         most common setup failure, which is 465 with secure unticked and a
         connection that simply hangs. */
      secure: b.secure ?? port === 465,
      username: b.username!,
      password: b.password!,
      fromEmail: b.fromEmail!,
      fromName: b.fromName,
      dailyLimit: b.dailyLimit,
    });

    /* Prove it works now rather than at send time. A mailbox that fails to
       authenticate is kept, not discarded, so the settings can be corrected
       instead of retyped, but the caller is told plainly. */
    const check = await verifySmtpAccount(id);
    return NextResponse.json({
      id,
      verified: check.ok,
      ...(check.ok ? {} : { warning: `Saved, but the connection failed: ${check.error}` }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the mailbox";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { id } = (await req.json()) as { id?: number };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deleteSmtpAccount(Number(id));
  return NextResponse.json({ success: true });
}
