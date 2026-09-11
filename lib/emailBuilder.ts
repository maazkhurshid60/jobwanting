// Metro Associates branded email builder.
// Turns a small set of structured fields into a full, Outlook-safe HTML email in
// the house style (680px table, navy #071b31 header/footer, gold #f2b800 button,
// signature block, unsubscribe). The campaign sender detects the full HTML
// document and delivers it verbatim, so what you build is what recipients get.
//
// The footer (signature, contact links, tagline, optional logo) is the same
// on every email produced here by design — see FooterSettings/DEFAULT_FOOTER
// below and /bd825db8c738/footer-settings, which is where it's edited.
//
// Personalization tokens ({{first_name}} etc.) pass straight through untouched.

// A template/campaign body carrying its own HTML document/markup should be
// treated (previewed, sent, loaded into the campaign builder) as rendered
// HTML rather than shown as plain source text. Shared by the Templates page
// and the Campaign builder's "start from a template" picker.
export function isHtmlContent(s: string): boolean {
  return /<!doctype html|<html[\s>]|<(table|div|p|a|img|span|body)[\s>]/i.test(s);
}

export interface EmailBuilderInput {
  eyebrow: string;      // small gold label above the headline
  headline: string;     // the H1
  greeting: string;     // e.g. "Hello {{first_name}},"
  intro: string;        // one or more paragraphs, separated by a blank line
  // One or more labelled check-lists (gold-checkmark boxes). Each has an optional
  // bold heading and its own bullet items. Empty array = no list boxes.
  lists: { heading: string; items: string[] }[];
  bodyAfter: string;    // paragraph shown after the list (optional)
  // CTA buttons, in order. The first is styled gold (primary), the rest navy
  // (secondary). A button with an empty label is skipped. Empty array = no buttons.
  buttons: { label: string; href: string }[];
  heroUrl: string;      // optional hero image URL (empty = no hero)
  previewText: string;  // hidden inbox-preview snippet (optional)
}

// The signature block + bottom bar, shared by every email this builder
// produces. Historically these were hardcoded here, so "the footer" really
// was identical on every template — this type is what makes it editable
// (see /bd825db8c738/footer-settings) while keeping that same "one footer
// for everything" behavior as the default.
export interface FooterSettings {
  signatureName: string;
  signatureTitle: string;
  phoneDisplay: string; // shown text, e.g. "+1 (312) 500-1878"
  phoneHref: string;    // tel: target — digits/plus only, e.g. "+13125001878"
  email: string;
  link1Label: string;
  link1Url: string;
  link2Label: string;
  link2Url: string;
  tagline: string;      // bottom dark bar, above the required Unsubscribe link
  logoUrl: string;      // optional — empty means no footer logo
  logoAlign: "left" | "center" | "right";
  logoPosition: "top" | "bottom"; // relative to the signature text
}

export const DEFAULT_FOOTER: FooterSettings = {
  signatureName: "Patrick Novick",
  signatureTitle: "CEO | Metro Associates",
  phoneDisplay: "+1 (312) 500-1878",
  phoneHref: "+13125001878",
  email: "patrick@metroassoc.com",
  link1Label: "patricknovick.com",
  link1Url: "https://patricknovick.com",
  link2Label: "metroassoc.com",
  link2Url: "https://metroassoc.com",
  tagline: "Metro Associates  •  Engineering, MEP, DOT and Construction Recruiting",
  logoUrl: "",
  logoAlign: "left",
  logoPosition: "top",
};

export const DEFAULT_BUILDER: EmailBuilderInput = {
  eyebrow: "ENGINEERING & CONSTRUCTION TALENT",
  headline: "Are you looking to hire for an engineering or construction role?",
  greeting: "Hello {{first_name}},",
  intro:
    "Metro Associates helps employers identify qualified professionals for permanent, contract and project-based needs.\n\nWe can run a targeted local search or expand nationally when relocation is available.",
  lists: [
    {
      heading: "Recruiting focus:",
      items: [
        "MEP, HVAC, electrical, plumbing, Revit and BIM",
        "Civil, structural, transportation and infrastructure",
        "Bridge, construction and DOT inspection",
        "Project managers, construction managers and field professionals",
      ],
    },
  ],
  bodyAfter:
    "Send me the position title, location, compensation range and hiring timeline, and I will respond with the best search approach.",
  buttons: [
    { label: "Discuss Your Opening", href: "mailto:patrick@metroassoc.com?subject=Engineering%20%2F%20Construction%20Hiring%20Need" },
  ],
  heroUrl: "",
  previewText: "",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Escape a value used inside a double-quoted HTML attribute (href).
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

const paragraphs = (text: string, style: string) =>
  text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n              ");

export function buildMetroEmail(input: EmailBuilderInput, footer: FooterSettings = DEFAULT_FOOTER): string {
  const {
    eyebrow, headline, greeting, intro,
    bodyAfter, heroUrl, previewText,
  } = input;

  const preview = (previewText || headline || "").trim();
  const bodyStyle = "margin:0 0 15px 0;font-size:16px;line-height:25px;color:#26384b;";

  const hero = heroUrl.trim()
    ? `
          <tr>
            <td style="padding:0;background:#051b34;">
              <img src="${escAttr(heroUrl.trim())}" width="680"
                   alt="${escAttr(headline)}"
                   style="display:block;width:680px;max-width:100%;height:auto;border:0;outline:none;">
            </td>
          </tr>`
    : "";

  // Render one gold-checkmark list box (or "" when it has no items), then stack
  // however many lists the user added.
  const makeListBox = (heading: string, items: string[]) => {
    const cleanItems = items.map((i) => i.trim()).filter(Boolean);
    if (!cleanItems.length) return "";
    return `
          <tr>
            <td style="padding:0 40px 23px 40px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%;background:#f5f7f9;border:1px solid #d9e0e7;border-collapse:collapse;">
                <tr>
                  <td style="padding:18px 20px;font-size:15px;line-height:24px;color:#26384b;">
                    ${heading.trim() ? `<strong style="color:#071b31;">${esc(heading.trim())}</strong><br>` : ""}
                    ${cleanItems.map((i) => `<span style="color:#b98500;">&#10003;</span> ${esc(i)}`).join("<br>\n                    ")}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  };
  const listBox = (input.lists ?? []).map((l) => makeListBox(l.heading, l.items)).join("");

  const afterBox = bodyAfter.trim()
    ? `
          <tr>
            <td style="padding:0 40px 18px 40px;font-family:Arial,Helvetica,sans-serif;color:#26384b;">
              ${paragraphs(bodyAfter, "margin:0;font-size:16px;line-height:25px;")}
            </td>
          </tr>`
    : "";

  // Render one button (VML for Outlook + a normal anchor for everyone else). The
  // first/primary button is gold; the rest are navy so they read as primary +
  // secondary. Each unit is inline-block with right/bottom margin, so any number
  // of buttons flow side-by-side and wrap to the next line when they run out of
  // room. In Outlook the VML shapes stack, which is a fine fallback.
  const makeButton = (label: string, href: string, primary: boolean) => {
    const bg = primary ? "#f2b800" : "#071b31";
    const fg = primary ? "#071b31" : "#ffffff";
    const l = esc(label);
    const h = escAttr(href);
    return `<!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${h}" style="height:48px;v-text-anchor:middle;width:210px;margin-right:12px;margin-bottom:12px;"
                arcsize="8%" stroke="f" fillcolor="${bg}">
                <w:anchorlock/>
                <center style="color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                  ${l}
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${h}"
                 style="display:inline-block;background:${bg};color:${fg};text-decoration:none;
                        font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;
                        line-height:48px;text-align:center;min-width:200px;padding:0 24px;border-radius:5px;
                        margin:0 12px 12px 0;">
                ${l}
              </a>
              <!--<![endif]-->`;
  };

  const activeButtons = (input.buttons ?? []).filter((b) => b.label.trim());

  // Footer logo — an inline-block div rather than a table row, so it sits
  // inside the same navy cell as the signature text with no extra padding
  // seams between them, and `logoPosition` just decides where in that cell
  // it's placed.
  const footerLogo = footer.logoUrl.trim()
    ? `<div style="text-align:${footer.logoAlign};margin:${footer.logoPosition === "top" ? "0 0 14px 0" : "14px 0 0 0"};">
                <img src="${escAttr(footer.logoUrl.trim())}" alt=""
                     style="display:inline-block;max-width:200px;width:auto;height:auto;border:0;outline:none;">
              </div>`
    : "";

  const phoneHtml = footer.phoneDisplay.trim()
    ? `<a href="tel:${escAttr((footer.phoneHref || footer.phoneDisplay).trim())}" style="color:#f2b800;text-decoration:none;font-weight:bold;">${esc(footer.phoneDisplay.trim())}</a>`
    : "";
  const emailHtml = footer.email.trim()
    ? `<a href="mailto:${escAttr(footer.email.trim())}" style="color:#ffffff;text-decoration:none;">${esc(footer.email.trim())}</a>`
    : "";
  const contactLine = phoneHtml || emailHtml
    ? `
              <div style="margin-top:9px;font-size:14px;line-height:23px;">
                ${phoneHtml}${phoneHtml && emailHtml ? "&nbsp;|&nbsp;" : ""}${emailHtml}
              </div>`
    : "";

  const footerLink = (label: string, url: string) =>
    label.trim() && url.trim()
      ? `<a href="${escAttr(url.trim())}" style="color:#ffffff;text-decoration:none;">${esc(label.trim())}</a>`
      : "";
  const link1Html = footerLink(footer.link1Label, footer.link1Url);
  const link2Html = footerLink(footer.link2Label, footer.link2Url);
  const linksLine = link1Html || link2Html
    ? `
              <div style="font-size:14px;line-height:23px;">
                ${link1Html}${link1Html && link2Html ? "&nbsp;|&nbsp;" : ""}${link2Html}
              </div>`
    : "";

  // Negative bottom margin on the cell absorbs the last row's 12px button margin
  // so spacing below the buttons stays consistent no matter how many there are.
  const button = activeButtons.length
    ? `
          <tr>
            <td align="left" style="padding:8px 40px 20px 40px;font-family:Arial,Helvetica,sans-serif;">
              ${activeButtons.map((b, i) => makeButton(b.label.trim(), b.href, i === 0)).join("\n              ")}
            </td>
          </tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(headline || "Metro Associates")}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef2f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${esc(preview)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="width:100%;background:#eef2f5;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:22px 10px;">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0"
               style="width:680px;max-width:680px;background:#ffffff;border-collapse:collapse;">${hero}
          <tr>
            <td style="padding:32px 40px 14px 40px;font-family:Arial,Helvetica,sans-serif;color:#25384b;">
              ${eyebrow.trim() ? `<div style="font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1.1px;color:#b98500;">${esc(eyebrow.trim())}</div>` : ""}
              <h1 style="margin:8px 0 16px 0;font-size:27px;line-height:34px;color:#071b31;">
                ${esc(headline)}
              </h1>
              ${greeting.trim() ? `<p style="${bodyStyle}">${esc(greeting.trim())}</p>` : ""}
              ${paragraphs(intro, bodyStyle)}
            </td>
          </tr>${listBox}${afterBox}${button}
          <tr>
            <td style="padding:24px 40px;background:#071b31;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              ${footer.logoPosition === "top" ? footerLogo : ""}
              <div style="font-size:19px;line-height:24px;font-weight:bold;">${esc(footer.signatureName)}</div>
              <div style="font-size:14px;line-height:21px;color:#d8e0e8;">${esc(footer.signatureTitle)}</div>${contactLine}${linksLine}
              ${footer.logoPosition === "bottom" ? footerLogo : ""}
            </td>
          </tr>
          <tr>
            <td align="center"
                style="padding:13px 25px;background:#031426;font-family:Arial,Helvetica,sans-serif;
                       font-size:11px;line-height:17px;color:#a9b6c2;">
              ${footer.tagline.trim() ? `${esc(footer.tagline.trim())}<br>` : ""}
              <a href="{{unsubscribe_url}}" style="color:#a9b6c2;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
