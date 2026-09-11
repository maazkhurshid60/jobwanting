import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { sendCampaignEmail } from "@/lib/brevo";
import {
  personalize,
  wrapInHtmlTemplate,
  buildAttachments,
  sendCampaignNow,
  type CampaignSendParams,
} from "@/lib/campaignSend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/campaigns/send
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await req.json() as CampaignSendParams & {
    isTestSend?: boolean;
    testEmail?: string | null;
  };
  const {
    subject, body, isHtml, replyTo, isTestSend, testEmail,
    attachPostcard, customAttachment,
  } = payload;

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  // Test Send: deliver a single [TEST] copy, no targeting, no logging.
  if (isTestSend) {
    if (!testEmail?.trim()) {
      return NextResponse.json({ error: "Test email address is required" }, { status: 400 });
    }
    try {
      const attachmentsOption = buildAttachments(attachPostcard, customAttachment);
      const testContact = { id: 0, email: testEmail.trim(), name: "Test Recipient", title: "Senior Engineer", company: "Big Company" };
      const personalizedBody = personalize(body, testContact);
      const personalizedSubject = `[TEST] ${personalize(subject, testContact)}`;
      const wrappedHtml = wrapInHtmlTemplate(personalizedBody, testEmail.trim(), 0, !!isHtml);

      const result = await sendCampaignEmail({
        subject: personalizedSubject,
        htmlContent: wrappedHtml,
        replyTo: replyTo ?? undefined,
        attachments: attachmentsOption,
        recipients: [{ email: testEmail.trim(), name: "Test Recipient", personalizedHtml: wrappedHtml }],
      });
      if (result.sent.length === 0) {
        const reason = result.failed[0]?.error ?? "Send failed";
        return NextResponse.json({ error: `Test send failed: ${reason}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, isTest: true, recipients: 1, messageId: result.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test send failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Real send — shared core (identical logic used by the scheduler worker).
  const result = await sendCampaignNow(payload);
  if (!result.ok) {
    const status = result.error === "No eligible contacts to send to" ? 400 : 500;
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status });
  }
  return NextResponse.json({
    success: true,
    recipients: result.recipients,
    failed: result.failed,
    campaignId: result.campaignId,
    messageId: result.messageId,
  });
}

// GET /api/campaigns/send — campaign history with open counts.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const listIdParam = req.nextUrl.searchParams.get("listId");
  const listId = listIdParam ? Number(listIdParam) : null;

  const where = listId ? "WHERE c.list_id = ?" : "";
  const args = listId ? [listId] : [];

  // Open counts come from a pre-aggregated derived table (one scan of
  // email_opens total) rather than a correlated subquery per campaign row
  // (which was a full scan of email_opens for EACH of the 50 campaigns here —
  // the main driver behind Turso's "rows read" blowing up once email_opens
  // grew past a few thousand rows).
  const result = await db.execute({
    sql: `
      SELECT c.id, c.subject, c.recipient_count, c.status, c.target_list, c.list_id, c.sent_at,
             COALESCE(o.total_opens, 0) AS total_opens,
             COALESCE(o.unique_opens, 0) AS unique_opens
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) AS total_opens, COUNT(DISTINCT email) AS unique_opens
        FROM email_opens
        GROUP BY campaign_id
      ) o ON o.campaign_id = c.id
      ${where}
      ORDER BY c.sent_at DESC
      LIMIT 50
    `,
    args,
  });
  return NextResponse.json(result.rows);
}

// DELETE /api/campaigns/send — delete campaign record
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { id } = await req.json() as { id: number };
    if (!id) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
    }
    await db.execute({ sql: "DELETE FROM campaigns WHERE id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM campaign_recipients WHERE campaign_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM email_opens WHERE campaign_id = ?", args: [id] });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
