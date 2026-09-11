import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { DEFAULT_FOOTER, FooterSettings } from "@/lib/emailBuilder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface FooterRow {
  signature_name: string;
  signature_title: string;
  phone_display: string;
  phone_href: string;
  email: string;
  link1_label: string;
  link1_url: string;
  link2_label: string;
  link2_url: string;
  tagline: string;
  logo_url: string;
  logo_align: string;
  logo_position: string;
}

function toFooterSettings(row: FooterRow): FooterSettings {
  return {
    signatureName: row.signature_name,
    signatureTitle: row.signature_title,
    phoneDisplay: row.phone_display,
    phoneHref: row.phone_href,
    email: row.email,
    link1Label: row.link1_label,
    link1Url: row.link1_url,
    link2Label: row.link2_label,
    link2Url: row.link2_url,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    logoAlign: row.logo_align === "center" || row.logo_align === "right" ? row.logo_align : "left",
    logoPosition: row.logo_position === "bottom" ? "bottom" : "top",
  };
}

export async function GET(): Promise<NextResponse> {
  const result = await db.execute("SELECT * FROM email_footer_settings WHERE id = 1");
  const row = result.rows[0] as unknown as FooterRow | undefined;
  // db.ts seeds this row on startup; falling back to the in-code default keeps
  // this endpoint working even against a database that hasn't run that yet.
  return NextResponse.json(row ? toFooterSettings(row) : DEFAULT_FOOTER);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const logoAlign = body.logoAlign === "center" || body.logoAlign === "right" ? body.logoAlign : "left";
  const logoPosition = body.logoPosition === "bottom" ? "bottom" : "top";

  const result = await db.execute({
    sql: `UPDATE email_footer_settings SET
            signature_name=?, signature_title=?, phone_display=?, phone_href=?, email=?,
            link1_label=?, link1_url=?, link2_label=?, link2_url=?, tagline=?,
            logo_url=?, logo_align=?, logo_position=?, updated_at=unixepoch()
          WHERE id = 1`,
    args: [
      str(body.signatureName), str(body.signatureTitle), str(body.phoneDisplay), str(body.phoneHref), str(body.email),
      str(body.link1Label), str(body.link1Url), str(body.link2Label), str(body.link2Url), str(body.tagline),
      str(body.logoUrl), logoAlign, logoPosition,
    ],
  });

  /* id=1 is the table's only legal row (CHECK (id = 1) in lib/db.ts), seeded
     at startup, so this should always match exactly one row. If it ever
     doesn't — e.g. a request landing mid-cold-start, before the startup
     seed has finished inserting it — the old code returned {success:true}
     regardless, so the save silently did nothing and the form looked fine.
     Surface that instead of lying about it. */
  if (result.rowsAffected === 0) {
    return NextResponse.json(
      { error: "Save didn't take — the settings row wasn't found. Please try again in a few seconds." },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
