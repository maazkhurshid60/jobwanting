import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

// 1×1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Coarse device class from the opening client's User-Agent. Deliberately
// simple (three buckets, not full device detection) — good enough for "Top
// Devices" as a share-of-opens chart, not a precise device inventory.
function deviceFromUserAgent(ua: string | null): "desktop" | "mobile" | "other" {
  if (!ua) return "other";
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
  if (/ipad|tablet/i.test(ua)) return "mobile"; // tablets bucket with mobile, not a 4th category
  if (/windows nt|macintosh|linux x86|cros /i.test(ua)) return "desktop";
  return "other"; // proxy/scanner opens (e.g. Apple MPP, Gmail image proxy) — genuinely unknown
}

// GET /api/track/open?cid=campaignId&eid=base64url_email
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");
  const eid = searchParams.get("eid");

  if (cid && eid) {
    try {
      const email = Buffer.from(eid, "base64").toString("utf8");
      const device = deviceFromUserAgent(req.headers.get("user-agent"));
      await db.execute({
        sql: "INSERT INTO email_opens (campaign_id, email, device) VALUES (?, ?, ?)",
        args: [Number(cid), email.toLowerCase(), device],
      });
    } catch {
      // Never fail on tracking — non-blocking
    }
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
