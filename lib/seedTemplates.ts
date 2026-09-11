// Seeded email templates. These are inserted once (idempotently) on startup so
// they appear ready-to-use on the Templates page. Bodies are full, standalone
// HTML documents — the campaign sender detects that and delivers them verbatim
// (only injecting the tracking pixel + unsubscribe), so the design is preserved.
//
// Personalization tokens: {{first_name}} {{last_name}} {{name}} {{title}}
// {{company}} {{email}} {{unsubscribe_url}}.

export interface SeedTemplate {
  name: string;
  subject: string;
  body: string;
}

export const METRO_CLIENT_OUTREACH: SeedTemplate = {
  name: "Metro Associates — Client Outreach (HTML)",
  subject: "Need Engineering Talent for DOT, MEP, Bridge or Construction Projects?",
  body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Need Engineering Talent for DOT, MEP, Bridge or Construction Projects?</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    table { border-collapse:collapse !important; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:#eef2f5; }
    a { color:#0a2745; }
    @media screen and (max-width:700px) {
      .email-shell { width:100% !important; }
      .mobile-pad { padding-left:22px !important; padding-right:22px !important; }
      .button-cell { display:block !important; width:100% !important; padding:0 0 12px 0 !important; }
      .button-link { display:block !important; text-align:center !important; }
      .service-cell { display:block !important; width:100% !important; padding:6px 0 !important; }
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Metro Associates delivers inspectors, engineers, project managers, MEP specialists and construction experts.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f5;">
    <tr>
      <td align="center" style="padding:24px 10px;">
        <table role="presentation" class="email-shell" width="680" cellpadding="0" cellspacing="0" border="0"
               style="width:680px;max-width:680px;background:#ffffff;border-radius:10px;overflow:hidden;
                      box-shadow:0 3px 16px rgba(7,27,49,.12);">

          <tr>
            <td style="background:#071b31;">
              <img src="https://patricknovick.com/metro-header.jpg" width="680"
                   alt="Metro Associates — People. Projects. Progress. Bridges, DOT, MEP and construction staffing."
                   style="display:block;width:100%;max-width:680px;height:auto;border:0;">
            </td>
          </tr>

          <tr>
            <td class="mobile-pad" style="padding:34px 42px 16px 42px;font-family:Arial,Helvetica,sans-serif;color:#17283a;">
              <div style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.2px;color:#bf8f00;">
                ENGINEERING &amp; CONSTRUCTION TALENT
              </div>
              <h1 style="margin:8px 0 16px 0;font-size:28px;line-height:35px;color:#071b31;">
                Have an opening—or need more help on a current project?
              </h1>
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;">
                Hello {{first_name}},
              </p>
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;">
                When project deadlines move faster than hiring timelines, <strong>Metro Associates</strong> can help.
                We recruit and deliver qualified professionals for DOT, bridge, civil, MEP, inspection,
                project-management and construction needs.
              </p>
              <p style="margin:0 0 18px 0;font-size:16px;line-height:25px;">
                Send me the position title, location and hiring timeline. Our team can quickly identify candidates
                aligned with your technical, licensing, clearance, travel, onsite and project-specific requirements.
              </p>
            </td>
          </tr>

          <tr>
            <td class="mobile-pad" style="padding:0 42px 23px 42px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#f5f7f9;border:1px solid #d9e0e7;border-radius:8px;">
                <tr>
                  <td class="service-cell" width="50%" style="padding:14px 18px;font-size:14px;line-height:21px;color:#26394b;">
                    <strong style="color:#071b31;">✓</strong> DOT &amp; transportation inspectors<br>
                    <strong style="color:#071b31;">✓</strong> Civil, structural &amp; bridge engineers<br>
                    <strong style="color:#071b31;">✓</strong> MEP &amp; HVAC professionals
                  </td>
                  <td class="service-cell" width="50%" style="padding:14px 18px;font-size:14px;line-height:21px;color:#26394b;">
                    <strong style="color:#071b31;">✓</strong> Project &amp; construction managers<br>
                    <strong style="color:#071b31;">✓</strong> Field &amp; construction experts<br>
                    <strong style="color:#071b31;">✓</strong> Hard-to-fill technical roles
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="mobile-pad" style="padding:0 42px 31px 42px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="button-cell" style="padding-right:12px;">
                    <a class="button-link" href="mailto:patrick@metroassoc.com?subject=Engineering%20/%20Construction%20Staffing%20Need&body=Patrick,%0D%0A%0D%0AWe have an opening or project staffing need.%0D%0A%0D%0APosition title:%0D%0ALocation:%0D%0ATimeline:%0D%0AEmployment type:%0D%0AAdditional details:%0D%0A"
                       style="display:inline-block;background:#f2b800;color:#071b31;text-decoration:none;
                              font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;
                              line-height:18px;padding:14px 20px;border-radius:6px;">
                      Send Your Openings
                    </a>
                  </td>
                  <td class="button-cell">
                    <a class="button-link" href="tel:+13125001878"
                       style="display:inline-block;background:#071b31;color:#ffffff;text-decoration:none;
                              font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;
                              line-height:18px;padding:14px 20px;border-radius:6px;">
                      Call +1 (312) 500-1878
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="mobile-pad" style="padding:24px 42px;background:#071b31;
                                        font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              <div style="font-size:18px;line-height:23px;font-weight:700;">Patrick Novick</div>
              <div style="font-size:14px;line-height:21px;color:#d7e0e9;">CEO, Metro Associates</div>
              <div style="margin-top:10px;font-size:14px;line-height:23px;">
                <a href="tel:+13125001878" style="color:#f2b800;text-decoration:none;font-weight:700;">+1 (312) 500-1878</a>
                &nbsp;|&nbsp;
                <a href="mailto:patrick@metroassoc.com" style="color:#ffffff;text-decoration:none;">patrick@metroassoc.com</a>
              </div>
              <div style="font-size:14px;line-height:23px;">
                <a href="https://patricknovick.com" style="color:#ffffff;text-decoration:none;">patricknovick.com</a>
                &nbsp;|&nbsp;
                <a href="https://metroassoc.com" style="color:#ffffff;text-decoration:none;">metroassoc.com</a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px;text-align:center;background:#031426;
                       font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#9eacb9;">
              Metro Associates &nbsp;•&nbsp; People. Projects. Progress.<br>
              <a href="{{unsubscribe_url}}" style="color:#9eacb9;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

export const METRO_MEP_OUTREACH: SeedTemplate = {
  name: "Metro Associates — MEP / HVAC Candidate Outreach (HTML)",
  subject: "MEP engineering and design opportunities — onsite, hybrid or remote",
  body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>MEP Engineering &amp; Design Opportunities | Metro Associates</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#eef1f4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Metro Associates is recruiting MEP, HVAC, electrical and plumbing engineering professionals for opportunities nationwide.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="width:100%;background-color:#eef1f4;">
    <tr>
      <td align="center" style="padding:22px 10px;">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0"
               style="width:680px;max-width:680px;background:#ffffff;border-collapse:collapse;">
          <tr>
            <td style="padding:0;background:#ffffff;">
              <img src="https://patricknovick.com/metro-hiring-hero.png" width="680"
                   alt="Metro Associates is hiring MEP engineering and design professionals."
                   style="display:block;width:680px;max-width:100%;height:auto;border:0;outline:none;">
            </td>
          </tr>

          <tr>
            <td style="padding:30px 40px 12px 40px;font-family:Arial,Helvetica,sans-serif;color:#142c52;">
              <div style="font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1.2px;color:#c69200;">
                MEP &bull; HVAC &bull; ELECTRICAL &bull; PLUMBING
              </div>
              <h1 style="margin:7px 0 15px 0;font-size:28px;line-height:35px;color:#142c52;">
                MEP engineering and design opportunities
              </h1>
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;color:#26384f;">
                Hello {{first_name}},
              </p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:25px;color:#26384f;">
                Metro Associates is recruiting <strong>MEP engineering and design professionals</strong>
                for building-systems and infrastructure opportunities across the United States.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 22px 40px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%;background:#f5f7f9;border:1px solid #d8dee6;border-collapse:collapse;">
                <tr>
                  <td style="padding:18px 20px;font-size:15px;line-height:24px;color:#26384f;">
                    <strong style="color:#142c52;">Current areas of focus:</strong><br>
                    <span style="color:#c69200;">&#10003;</span> Mechanical &amp; HVAC design engineers<br>
                    <span style="color:#c69200;">&#10003;</span> Electrical engineers &amp; power distribution<br>
                    <span style="color:#c69200;">&#10003;</span> Plumbing &amp; fire-protection engineers<br>
                    <span style="color:#c69200;">&#10003;</span> Revit / BIM modelers &amp; MEP coordinators<br>
                    <span style="color:#c69200;">&#10003;</span> Data-center &amp; mission-critical MEP roles
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 14px 40px;font-family:Arial,Helvetica,sans-serif;color:#26384f;">
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;">
                Positions may be <strong>onsite, hybrid or remote</strong>, depending on the opportunity.
              </p>
              <p style="margin:0 0 14px 0;font-size:16px;line-height:25px;">
                To be considered, reply with your updated resume, preferred specialty, current location,
                compensation expectations, availability and work authorization.
              </p>
            </td>
          </tr>

          <tr>
            <td align="left" style="padding:6px 40px 32px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                xmlns:w="urn:schemas-microsoft-com:office:word"
                href="mailto:patrick@metroassoc.com?subject=MEP%20Engineering%20Opportunity&body=Patrick,%0D%0A%0D%0AI am interested in MEP engineering opportunities.%0D%0A%0D%0APreferred role:%0D%0ACurrent location:%0D%0ACompensation target:%0D%0AAvailability:%0D%0AWork authorization:%0D%0A%0D%0AI have attached my resume." style="height:48px;v-text-anchor:middle;width:210px;"
                arcsize="10%" stroke="f" fillcolor="#f4bf00">
                <w:anchorlock/>
                <center style="color:#142c52;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                  Send Your Resume
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="mailto:patrick@metroassoc.com?subject=MEP%20Engineering%20Opportunity&body=Patrick,%0D%0A%0D%0AI am interested in MEP engineering opportunities.%0D%0A%0D%0APreferred role:%0D%0ACurrent location:%0D%0ACompensation target:%0D%0AAvailability:%0D%0AWork authorization:%0D%0A%0D%0AI have attached my resume."
                 style="display:inline-block;background:#f4bf00;color:#142c52;text-decoration:none;
                        font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;
                        line-height:48px;text-align:center;width:210px;border-radius:5px;">
                Send Your Resume
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;background:#142c52;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              <div style="font-size:19px;line-height:24px;font-weight:bold;">Patrick Novick</div>
              <div style="font-size:14px;line-height:21px;color:#dfe6ee;">CEO | Metro Associates</div>
              <div style="margin-top:9px;font-size:14px;line-height:23px;">
                <a href="tel:+13125001878" style="color:#f4bf00;text-decoration:none;font-weight:bold;">
                  +1 (312) 500-1878
                </a>
                &nbsp;|&nbsp;
                <a href="mailto:patrick@metroassoc.com" style="color:#ffffff;text-decoration:none;">
                  patrick@metroassoc.com
                </a>
              </div>
              <div style="font-size:14px;line-height:23px;">
                <a href="https://patricknovick.com" style="color:#ffffff;text-decoration:none;">
                  patricknovick.com
                </a>
                &nbsp;|&nbsp;
                <a href="https://metroassoc.com" style="color:#ffffff;text-decoration:none;">
                  metroassoc.com
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td align="center"
                style="padding:13px 25px;background:#0c1e3b;font-family:Arial,Helvetica,sans-serif;
                       font-size:11px;line-height:17px;color:#b8c3cf;">
              Metro Associates &nbsp;|&nbsp; Nationwide Engineering and Construction Recruiting<br>
              <a href="{{unsubscribe_url}}" style="color:#b8c3cf;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

export const METRO_NYC_EMPLOYER_OUTREACH: SeedTemplate = {
  name: "Metro Associates — NYC Employer Outreach (HTML)",
  subject: "Need help filling engineering or construction roles in NYC?",
  body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Need help filling engineering or construction roles in NYC?</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef2f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Metro Associates supports NYC and Tri-State employers with targeted recruiting for engineering, MEP, DOT, inspection and construction positions.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="width:100%;background:#eef2f5;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:22px 10px;">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0"
               style="width:680px;max-width:680px;background:#ffffff;border-collapse:collapse;">
          <tr>
            <td style="padding:0;background:#051b34;">
              <img src="https://patricknovick.com/metro-nyc-hire-hero.png" width="680"
                   alt="Metro Associates helps NYC employers hire engineering and construction professionals."
                   style="display:block;width:680px;max-width:100%;height:auto;border:0;outline:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 14px 40px;font-family:Arial,Helvetica,sans-serif;color:#25384b;">
              <div style="font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1.1px;color:#b98500;">
                NYC &amp; TRI-STATE EMPLOYERS
              </div>
              <h1 style="margin:8px 0 16px 0;font-size:27px;line-height:34px;color:#071b31;">
                Are you looking to hire for an engineering or construction role?
              </h1>
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;">Hello {{first_name}},</p>
              <p style="margin:0 0 15px 0;font-size:16px;line-height:25px;">
                Metro Associates helps employers across <strong>New York City and the Tri-State area</strong>
                identify qualified professionals for permanent, contract and project-based needs.
              </p>
              <p style="margin:0 0 17px 0;font-size:16px;line-height:25px;">
                We can conduct a targeted local search or expand nationally when relocation is available.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 23px 40px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%;background:#f5f7f9;border:1px solid #d9e0e7;border-collapse:collapse;">
                <tr>
                  <td style="padding:18px 20px;font-size:15px;line-height:24px;color:#26384b;">
                    <strong style="color:#071b31;">Recruiting focus:</strong><br>
                    <span style="color:#b98500;">&#10003;</span> MEP, HVAC, electrical, plumbing, Revit and BIM<br>
                    <span style="color:#b98500;">&#10003;</span> Civil, structural, transportation and infrastructure<br>
                    <span style="color:#b98500;">&#10003;</span> Bridge, construction and DOT inspection<br>
                    <span style="color:#b98500;">&#10003;</span> Project managers, construction managers and field professionals<br>
                    <span style="color:#b98500;">&#10003;</span> Data-center and mission-critical engineering<br>
                    <span style="color:#b98500;">&#10003;</span> Licensed PEs and specialized technical professionals
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 18px 40px;font-family:Arial,Helvetica,sans-serif;color:#26384b;">
              <p style="margin:0;font-size:16px;line-height:25px;">
                Send me the position title, location, compensation range and hiring timeline.
                I will review the need with my team and respond with the best search approach.
              </p>
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:8px 40px 32px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                xmlns:w="urn:schemas-microsoft-com:office:word"
                href="mailto:patrick@metroassoc.com?subject=NYC%20Engineering%20%2F%20Construction%20Hiring%20Need&body=Patrick,%0D%0A%0D%0AWe are looking to hire in the NYC / Tri-State area.%0D%0A%0D%0APosition title:%0D%0ALocation:%0D%0ACompensation range:%0D%0AEmployment type:%0D%0AHiring timeline:%0D%0ARequired experience / licenses:%0D%0AAdditional details:%0D%0A" style="height:48px;v-text-anchor:middle;width:220px;"
                arcsize="8%" stroke="f" fillcolor="#f2b800">
                <w:anchorlock/>
                <center style="color:#071b31;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                  Discuss Your Opening
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="mailto:patrick@metroassoc.com?subject=NYC%20Engineering%20%2F%20Construction%20Hiring%20Need&body=Patrick,%0D%0A%0D%0AWe are looking to hire in the NYC / Tri-State area.%0D%0A%0D%0APosition title:%0D%0ALocation:%0D%0ACompensation range:%0D%0AEmployment type:%0D%0AHiring timeline:%0D%0ARequired experience / licenses:%0D%0AAdditional details:%0D%0A"
                 style="display:inline-block;background:#f2b800;color:#071b31;text-decoration:none;
                        font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;
                        line-height:48px;text-align:center;width:220px;border-radius:5px;">
                Discuss Your Opening
              </a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#071b31;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
              <div style="font-size:19px;line-height:24px;font-weight:bold;">Patrick Novick</div>
              <div style="font-size:14px;line-height:21px;color:#d8e0e8;">CEO | Metro Associates</div>
              <div style="margin-top:9px;font-size:14px;line-height:23px;">
                <a href="tel:+13125001878" style="color:#f2b800;text-decoration:none;font-weight:bold;">
                  +1 (312) 500-1878
                </a>
                &nbsp;|&nbsp;
                <a href="mailto:patrick@metroassoc.com" style="color:#ffffff;text-decoration:none;">
                  patrick@metroassoc.com
                </a>
              </div>
              <div style="font-size:14px;line-height:23px;">
                <a href="https://patricknovick.com" style="color:#ffffff;text-decoration:none;">patricknovick.com</a>
                &nbsp;|&nbsp;
                <a href="https://metroassoc.com" style="color:#ffffff;text-decoration:none;">metroassoc.com</a>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center"
                style="padding:13px 25px;background:#031426;font-family:Arial,Helvetica,sans-serif;
                       font-size:11px;line-height:17px;color:#a9b6c2;">
              Metro Associates &nbsp;•&nbsp; Engineering, MEP, DOT and Construction Recruiting<br>
              <a href="{{unsubscribe_url}}" style="color:#a9b6c2;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
};

export const SEED_TEMPLATES: SeedTemplate[] = [
  METRO_CLIENT_OUTREACH,
  METRO_MEP_OUTREACH,
  METRO_NYC_EMPLOYER_OUTREACH,
];
