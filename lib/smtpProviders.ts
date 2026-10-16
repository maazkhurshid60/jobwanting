/* Connection settings for the mail providers people actually use, so adding
 * a mailbox asks for an address and an app password rather than a hostname
 * and a port number.
 *
 * Nobody setting up a campaign knows that Outlook is smtp.office365.com on
 * 587 with STARTTLS, and getting it wrong does not produce a useful error —
 * 465 with STARTTLS just hangs until it times out. The settings are public
 * and they rarely change, so they belong here rather than in the user's head.
 *
 * dailyLimit is deliberately below each provider's published ceiling. The
 * published number is the point at which sending stops working, usually for
 * 24 hours and sometimes with the account locked, and it counts recipients
 * rather than messages. It is a cliff, not a target.
 *
 * No entry is a promise: a provider can change a port or tighten a limit
 * without telling anyone, which is why "Other" exists and why every mailbox
 * is connection-tested at save time rather than trusted from this table.
 */
export interface SmtpProvider {
  id: string;
  label: string;
  host: string;
  port: number;
  /** Implicit TLS (465) rather than STARTTLS (587/25). */
  secure: boolean;
  dailyLimit: number;
  /** Email domains that identify this provider, for auto-detection. */
  domains: string[];
  /** Where to create an app password, shown as a link. */
  appPasswordUrl?: string;
  note?: string;
}

export const SMTP_PROVIDERS: SmtpProvider[] = [
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    dailyLimit: 400,
    domains: ["gmail.com", "googlemail.com"],
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    note: "Needs an app password. Google blocks ordinary passwords over SMTP, and app passwords require 2-step verification to be on first.",
  },
  {
    id: "outlook",
    label: "Outlook.com / Hotmail",
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    dailyLimit: 250,
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    appPasswordUrl: "https://account.microsoft.com/security",
    note: "Needs an app password once two-step verification is on.",
  },
  {
    id: "office365",
    label: "Microsoft 365 (work account)",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    dailyLimit: 1000,
    domains: [],
    note: "Your admin may have SMTP AUTH disabled tenant-wide, which the connection test will show as a login failure even with the right password.",
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    dailyLimit: 400,
    domains: ["yahoo.com", "ymail.com"],
    appPasswordUrl: "https://login.yahoo.com/account/security",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    dailyLimit: 300,
    domains: ["zoho.com", "zohomail.com"],
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    dailyLimit: 400,
    domains: ["icloud.com", "me.com", "mac.com"],
    appPasswordUrl: "https://appleid.apple.com/account/manage",
    note: "iCloud requires an app-specific password.",
  },
  {
    id: "freehostia",
    label: "Freehostia (metroassoc and friends)",
    host: "mbox.freehostia.com",
    port: 465,
    secure: true,
    dailyLimit: 300,
    /* The domains already sending through Freehostia per their SPF records,
       which is where patrick@metroassoc.com lives. */
    domains: [
      "metroassoc.com", "metroassoc.email", "metroassoc.xyz",
      "jobfolder.com", "jobwanting.com", "jobwarm.com",
      "nickjain.org", "jobpools.com",
    ],
    note: "Check the host in your Freehostia control panel if the test fails; shared hosts vary the mailbox server per account.",
  },
  {
    id: "other",
    label: "Other (enter settings manually)",
    host: "",
    port: 587,
    secure: false,
    dailyLimit: 300,
    domains: [],
  },
];

/** The provider an address most likely belongs to, by its domain. Returns
 *  null rather than guessing when the domain is not one we know, so a custom
 *  domain lands on manual entry instead of a wrong host. */
export function providerForEmail(email: string): SmtpProvider | null {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  return SMTP_PROVIDERS.find((p) => p.domains.includes(domain)) ?? null;
}

export function providerById(id: string): SmtpProvider | undefined {
  return SMTP_PROVIDERS.find((p) => p.id === id);
}
