const BREVO_API_URL = "https://api.brevo.com/v3";

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY is not set");
  return key;
}

export interface Recipient {
  email: string;
  name?: string;
  personalizedHtml?: string;
  personalizedSubject?: string;
}

export interface Attachment {
  name: string;
  content?: string; // base64 string
  url?: string;
}

export interface SendEmailOptions {
  subject: string;
  htmlContent: string;
  recipients: Recipient[];
  replyTo?: string;
  attachments?: Attachment[];
  /* Which verified sender the mail goes out as. Omitted falls back to
     BREVO_SENDER_EMAIL, which is what every send used before the account
     had more than one verified domain. Callers must validate this against
     listVerifiedSenders() rather than trusting it from a request body:
     Brevo would reject an unverified address anyway, but it would do so
     once per recipient, after the campaign had started. */
  sender?: { email: string; name?: string };
  /* Rotate across several verified senders instead of using one.
     Takes precedence over `sender`. Order is the order given, and
     `rotateEvery` is how many consecutive emails each sender takes before
     the next one: 1 alternates every email, 50 sends in blocks of fifty.
     An empty array is treated as not set. */
  senders?: { email: string; name?: string }[];
  rotateEvery?: number;
}

export interface BrevoSender {
  id: number;
  name: string;
  email: string;
  /** Brevo's "activated" flag. The API exposes no separate verified field,
      and a sender that has not completed verification comes back deactivated,
      so this is the usable/not-usable signal. */
  active: boolean;
}

export interface SendResult {
  messageId?: string;
  sent: string[];                              // emails that were accepted by Brevo
  failed: { email: string; error: string }[]; // per-recipient non-fatal failures
}

export interface BrevoStats {
  range: string;
  requests: number;
  delivered: number;
  hardBounces: number;
  softBounces: number;
  clicks: number;
  uniqueClicks: number;
  opens: number;
  uniqueOpens: number;
  spamReports: number;
  blocked: number;
  invalid: number;
  unsubscribed: number;
}

/**
 * Fetches Brevo's aggregated transactional-email deliverability report
 * for the last `days` days. Returns zeros if Brevo can't be reached so the
 * dashboard still renders.
 */
export interface DateRange {
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string;   // YYYY-MM-DD, inclusive (Brevo counts the whole end day)
}

export async function getBrevoStats(days = 30, range?: DateRange): Promise<BrevoStats> {
  const label = range ? `${range.startDate} → ${range.endDate}` : `last ${days} days`;
  const empty: BrevoStats = {
    range: label,
    requests: 0, delivered: 0, hardBounces: 0, softBounces: 0,
    clicks: 0, uniqueClicks: 0, opens: 0, uniqueOpens: 0,
    spamReports: 0, blocked: 0, invalid: 0, unsubscribed: 0,
  };

  const qs = range
    ? `startDate=${range.startDate}&endDate=${range.endDate}`
    : `days=${days}`;

  try {
    const res = await fetch(
      `${BREVO_API_URL}/smtp/statistics/aggregatedReport?${qs}`,
      {
        headers: { "api-key": getApiKey(), Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as Partial<BrevoStats>;
    return { ...empty, ...data, range: label };
  } catch {
    return empty;
  }
}


export interface BrevoEvent {
  email: string;
  date: string;          // ISO timestamp
  subject: string;
  event: string;         // delivered | opened | clicks | hardBounces | softBounces | deferred | blocked | spam | unsubscribed | requests | invalid | error | loadedByProxy
  reason?: string;       // populated for bounces / deferrals / blocks
  messageId?: string;
}

/**
 * Fetches the most recent transactional-email events (per recipient) from Brevo —
 * the same feed shown on Brevo's Logs page. Sorted newest-first. Returns [] if the
 * API can't be reached so the dashboard still renders.
 */
export async function getBrevoEvents(days = 30, limit = 100, range?: DateRange, offset = 0): Promise<BrevoEvent[]> {
  const window = range
    ? `startDate=${range.startDate}&endDate=${range.endDate}`
    : `days=${days}`;
  try {
    const res = await fetch(
      `${BREVO_API_URL}/smtp/statistics/events?limit=${limit}&offset=${offset}&${window}&sort=desc`,
      { headers: { "api-key": getApiKey(), Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: BrevoEvent[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

/**
 * Pulls every address Brevo has recorded as a hard bounce, block, or invalid
 * over the last `days` and returns them as a lowercased Set. These are addresses
 * that physically can't receive mail (dead mailbox, bad domain, blocklisted) —
 * we feed them into our suppression list so we never email them again, which is
 * what keeps the bounce rate down. Returns an empty Set if Brevo can't be reached.
 */
export async function getBouncedEmails(days = 90): Promise<Set<string>> {
  const types = ["hardBounces", "blocked", "invalid"];
  const out = new Set<string>();
  for (const t of types) {
    try {
      const res = await fetch(
        `${BREVO_API_URL}/smtp/statistics/events?event=${t}&days=${days}&limit=2500&sort=desc`,
        { headers: { "api-key": getApiKey(), Accept: "application/json" }, cache: "no-store" }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { events?: { email?: string }[] };
      for (const e of data.events ?? []) {
        if (e.email) out.add(String(e.email).toLowerCase());
      }
    } catch {
      // ignore — a failed sync just means we skip this batch, send still proceeds
    }
  }
  return out;
}

/* One retry on a genuine network-level failure (fetch throwing — DNS blip,
   connect timeout, dropped connection), not on an HTTP error response (a
   4xx/5xx is a real answer from Brevo, retrying it just wastes a request).
   Without this, a single transient blip during the loop below can fail every
   recipient in the batch, which is exactly what an all-failed "0 sent"
   campaign in Sent History looks like — the fix mirrors the same retry
   already added to the Turso client (lib/db.ts) for the same class of error. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    return await fetch(url, init);
  }
}

/**
 * The senders this account may send as, newest Brevo state rather than a list
 * kept here.
 *
 * Hardcoding the addresses would have been less code, but the list is edited
 * in Brevo, not in this repo: a domain added there would stay invisible to the
 * dashboard, and one removed or left to lapse would stay on offer and fail at
 * send time. Reading it live means the dropdown cannot drift from the account.
 *
 * Deactivated senders are filtered out. A sender that has not completed domain
 * verification comes back deactivated, and offering one guarantees a campaign
 * that fails for every recipient.
 *
 * Throws rather than returning [] on a bad key or an unreachable Brevo: an
 * empty list and a broken connection look identical to a dropdown, and
 * silently showing "no senders" would read as an account problem.
 */
export async function listVerifiedSenders(): Promise<BrevoSender[]> {
  const res = await fetchWithRetry(`${BREVO_API_URL}/senders`, {
    method: "GET",
    headers: { "api-key": getApiKey(), Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Brevo rejected the API key while listing senders."
        : `Brevo returned ${res.status} while listing senders.`,
    );
  }

  const data = (await res.json()) as { senders?: BrevoSender[] };
  return (data.senders ?? []).filter((s) => s.active !== false);
}

export type SenderResolution =
  | { ok: true; sender: { email: string; name?: string } | undefined }
  | { ok: false; status: 400 | 502; error: string };

/**
 * Turns a sender address from a request body into one Brevo has confirmed,
 * or into the reason it can't.
 *
 * Shared by the send route and the scheduler route because both accept the
 * same field and both must apply the same check: an address off a form is not
 * evidence of anything, and an unverified one fails per recipient rather than
 * up front, so a campaign to four hundred contacts would make four hundred
 * failing calls and report "0 sent" with no usable reason. One lookup here
 * turns that into a single 400 before anything is sent or stored.
 *
 * No address is not an error. It means "use the configured default", which is
 * how every campaign behaved before the composer offered a choice.
 */
export async function resolveSender(
  email?: string | null,
): Promise<SenderResolution> {
  if (!email) return { ok: true, sender: undefined };

  let allowed: BrevoSender[];
  try {
    allowed = await listVerifiedSenders();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Brevo";
    return { ok: false, status: 502, error: `Could not confirm the sender address: ${message}` };
  }

  const match = allowed.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (!match) {
    return {
      ok: false,
      status: 400,
      error: `${email} is not a verified sender on this Brevo account.`,
    };
  }
  return { ok: true, sender: { email: match.email, name: match.name } };
}

export type SendersResolution =
  | { ok: true; senders: { email: string; name?: string }[] }
  | { ok: false; status: 400 | 502; error: string };

/**
 * The rotation version of resolveSender: validates every address in one
 * lookup and preserves the order given, which is the order they will be
 * rotated through.
 *
 * All-or-nothing on purpose. Silently dropping an address that failed
 * verification would still send the campaign, just not from where the sender
 * asked, and the rotation would be a different shape than the one on screen.
 */
export async function resolveSenders(
  emails?: string[] | null,
): Promise<SendersResolution> {
  const wanted = (emails ?? []).map((e) => e.trim()).filter(Boolean);
  if (wanted.length === 0) return { ok: true, senders: [] };

  let allowed: BrevoSender[];
  try {
    allowed = await listVerifiedSenders();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Brevo";
    return { ok: false, status: 502, error: `Could not confirm the sender addresses: ${message}` };
  }

  const resolved: { email: string; name?: string }[] = [];
  const unknown: string[] = [];
  for (const email of wanted) {
    const match = allowed.find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (match) resolved.push({ email: match.email, name: match.name });
    else unknown.push(email);
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Not verified on this Brevo account: ${unknown.join(", ")}.`,
    };
  }
  return { ok: true, senders: resolved };
}

/**
 * Sends a transactional email to multiple recipients via Brevo API.
 * Each recipient gets an individual email (BCC-safe — no address leaking).
 */
export async function sendCampaignEmail(
  opts: SendEmailOptions
): Promise<SendResult> {
  const senderEmail = opts.sender?.email ?? process.env.BREVO_SENDER_EMAIL;
  const senderName =
    opts.sender?.name ?? process.env.BREVO_SENDER_NAME ?? "Patrick Novick";
  const replyToEmail = opts.replyTo ?? process.env.BREVO_REPLY_TO_EMAIL ?? "patrick@metroassoc.com";

  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not set");

  // Send individually so each recipient gets personalized content. A single bad
  // recipient (transient 4xx/5xx, network blip) must NOT abort the whole run and
  // lose the record of everyone already sent — we collect per-recipient results.
  // The one exception is a 401 (bad key / IP block): that fails for everyone, so
  // we abort immediately rather than hammering the API 500 times.
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];
  let lastMessageId: string | undefined;

  /* The rotation, if one was asked for.
     Indexed on the recipient's position rather than on a counter that only
     advances on success, so a bounce cannot shift every later recipient onto
     a different sender and make a re-run send from somewhere else. A block
     size below 1 would divide by zero or stall on one sender, so it is
     floored. */
  const rotation = opts.senders?.length ? opts.senders : null;
  const rotateEvery = Math.max(1, Math.floor(opts.rotateEvery ?? 1));

  for (const [index, recipient] of opts.recipients.entries()) {
    const from = rotation
      ? rotation[Math.floor(index / rotateEvery) % rotation.length]
      : null;
    const html = recipient.personalizedHtml ?? opts.htmlContent;
    const payload: Record<string, unknown> = {
      sender: from
        ? { email: from.email, name: from.name ?? senderName }
        : { email: senderEmail, name: senderName },
      to: [{ email: recipient.email, name: recipient.name ?? recipient.email }],
      subject: recipient.personalizedSubject ?? opts.subject,
      htmlContent: html,
    };
    if (replyToEmail) payload.replyTo = { email: replyToEmail };
    if (opts.attachments && opts.attachments.length > 0) {
      payload.attachment = opts.attachments;
    }

    let res: Response;
    try {
      res = await fetchWithRetry(`${BREVO_API_URL}/smtp/email`, {
        method: "POST",
        headers: {
          "api-key": getApiKey(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch {
      failed.push({ email: recipient.email, error: "Network error reaching Brevo" });
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      // 401 is fatal for the whole batch — surface a clear message and stop.
      if (res.status === 401) {
        let msg = "Brevo authentication failed.";
        try {
          const parsed = JSON.parse(errText);
          if (parsed.message?.includes("unrecognised IP")) {
            msg = "Brevo blocked this request — your current IP is not whitelisted. Go to app.brevo.com → Security → Authorised IPs and add your IP, or remove the restriction entirely.";
          } else if (parsed.message?.includes("Key not found") || parsed.code === "unauthorized") {
            msg = "Brevo API key is invalid. Check BREVO_API_KEY in your environment variables.";
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      // Everything else is per-recipient: record and keep going.
      failed.push({ email: recipient.email, error: `Brevo ${res.status}` });
      continue;
    }

    const data = await res.json() as { messageId?: string };
    lastMessageId = data.messageId;
    sent.push(recipient.email);
  }

  return { messageId: lastMessageId, sent, failed };
}

