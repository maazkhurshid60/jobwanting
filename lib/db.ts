import { createClient, type Client } from "@libsql/client/http";
import { SEED_TEMPLATES } from "./seedTemplates";
import { DEFAULT_FOOTER } from "./emailBuilder";

/* The HTTP transport occasionally hits a transient connect timeout to
   Turso's edge (observed directly: a `UND_ERR_CONNECT_TIMEOUT` that
   succeeds on the very next attempt a few seconds later) — not a bad
   query, not bad data, just a blip. Without a retry, that blip surfaces as
   a 500 from whichever route happened to be running, and several of those
   routes (e.g. the footer editor's save button) don't show the user an
   error when that happens — it just looks like nothing happened. One quick
   retry here fixes the common case for every caller at once, since
   everything in this file goes through `db.execute`/`db.batch`. A second,
   real failure still throws, so a genuinely down database still fails
   loudly rather than hanging. */
function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { cause?: { code?: string } } | undefined)?.cause?.code
    ?? (err as { code?: string } | undefined)?.code;
  return (
    msg.includes("fetch failed") ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND"
  );
}

function withRetry<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!isTransientNetworkError(err)) throw err;
      await new Promise((r) => setTimeout(r, 400));
      return await fn(...args);
    }
  };
}

/* The client is built on first use, not at import time.
 *
 * `next build` imports every route module to collect page data. This module
 * used to call createClient() at import, so a build whose environment had no
 * TURSO_DATABASE_URL died with
 *
 *   Error [LibsqlError]: URL_INVALID: The URL 'undefined' is not in a valid format
 *   Failed to collect page data for /api/auth/callback
 *
 * — before a single request could be served. A build should not need a
 * database. Constructing on first query moves the failure to where it
 * belongs: the request that actually needs data, with a message that names
 * the missing variable instead of the string "undefined".
 */
let client: Client | null = null;

function getClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it, with TURSO_AUTH_TOKEN, to " +
        ".env.local locally or to the project's environment variables on the host.",
    );
  }

  const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  c.execute = withRetry(c.execute.bind(c));
  c.batch = withRetry(c.batch.bind(c));
  client = c;

  // Fire-and-forget, once per process — as it was when this ran at import
  // time, except that a build which never queries never triggers it.
  bootstrap(c);
  return c;
}

/* Callers keep writing `db.execute` / `db.batch`; the proxy only defers
   construction to the first property access. */
const db = new Proxy({} as Client, {
  get(_target, prop) {
    const c = getClient();
    const value = Reflect.get(c as object, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

// Create tables on first use
function bootstrap(db: Client): void {
  void db.batch([
    `CREATE TABLE IF NOT EXISTS te_connections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL UNIQUE,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      scope         TEXT NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL DEFAULT '',
      title      TEXT NOT NULL DEFAULT '',
      company    TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS email_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS campaigns (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subject         TEXT NOT NULL,
      body            TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'sent',
      brevo_msg_id    TEXT,
      sent_at         INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS contact_lists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS contact_list_members (
      list_id    INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      PRIMARY KEY (list_id, contact_id)
    )`,
    `CREATE TABLE IF NOT EXISTS campaign_recipients (
      campaign_id INTEGER NOT NULL,
      email       TEXT NOT NULL,
      sent_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (campaign_id, email)
    )`,
    `CREATE TABLE IF NOT EXISTS suppression_list (
      email      TEXT PRIMARY KEY,
      reason     TEXT NOT NULL DEFAULT 'unsubscribed',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS email_opens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      email       TEXT NOT NULL,
      opened_at   INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // Append-only log of EVERY email actually dispatched — one row per send, no
    // dedup. campaign_recipients is keyed by (campaign_id, email) and so counts a
    // person once per campaign; this table is the source of truth for the true
    // number of emails sent (re-sends to the same person are counted each time).
    `CREATE TABLE IF NOT EXISTS email_send_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      email       TEXT NOT NULL,
      sent_at     INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // Uploaded email images (header/hero graphics). Stored base64 and served by
    // /api/images/[id] so they have a stable public URL that works on any host —
    // email clients require a real URL and strip embedded data: images.
    `CREATE TABLE IF NOT EXISTS images (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL DEFAULT '',
      mime       TEXT NOT NULL,
      data       TEXT NOT NULL,
      size       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // The email footer (signature, contact links, tagline, optional logo) shared
    // by every template the branded builder produces — see lib/emailBuilder.ts.
    // Single row, id=1, seeded below with the values that used to be hardcoded.
    `CREATE TABLE IF NOT EXISTS email_footer_settings (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      signature_name   TEXT NOT NULL DEFAULT '',
      signature_title  TEXT NOT NULL DEFAULT '',
      phone_display    TEXT NOT NULL DEFAULT '',
      phone_href       TEXT NOT NULL DEFAULT '',
      email            TEXT NOT NULL DEFAULT '',
      link1_label      TEXT NOT NULL DEFAULT '',
      link1_url        TEXT NOT NULL DEFAULT '',
      link2_label      TEXT NOT NULL DEFAULT '',
      link2_url        TEXT NOT NULL DEFAULT '',
      tagline          TEXT NOT NULL DEFAULT '',
      logo_url         TEXT NOT NULL DEFAULT '',
      logo_align       TEXT NOT NULL DEFAULT 'left',
      logo_position    TEXT NOT NULL DEFAULT 'top',
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // Dashboard login accounts. The bootstrap super-admin still lives in the
    // ADMIN_USERNAME/ADMIN_PASSWORD env vars; these are additional accounts an
    // admin creates from the Users page. Passwords are scrypt-hashed with a salt.
    `CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // Login brute-force lockout. Tracked by username (not just DB user id) so it
    // also covers the env bootstrap admin, which has no admin_users row. A
    // successful login clears the row; MAX_FAILED_ATTEMPTS in a row locks the
    // username out for LOCKOUT_SECONDS (see lib/users.ts).
    `CREATE TABLE IF NOT EXISTS login_attempts (
      username     TEXT PRIMARY KEY,
      fail_count   INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // A small credential vault for things an admin needs to keep on hand —
    // logins to other systems (e.g. the JobFolder admin panel), API consoles,
    // etc. `secret_enc` is AES-256-GCM ciphertext (lib/crypto.ts, keyed by
    // TOKEN_ENCRYPTION_KEY) — never plaintext at rest, and never included in a
    // list response; only GET /api/vault/[id]/reveal decrypts it, on demand.
    `CREATE TABLE IF NOT EXISTS vault_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT NOT NULL,
      username    TEXT NOT NULL DEFAULT '',
      url         TEXT NOT NULL DEFAULT '',
      notes       TEXT NOT NULL DEFAULT '',
      secret_enc  TEXT NOT NULL,
      created_by  TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // One row per successful decrypt of a vault secret — who, which entry, when.
    // Doubles as the source for the reveal rate limit (lib/vault.ts) so a
    // compromised session can't be used to dump every stored credential at once.
    `CREATE TABLE IF NOT EXISTS vault_audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id    INTEGER NOT NULL,
      entry_label TEXT NOT NULL DEFAULT '',
      username    TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS idx_vault_audit_username_created ON vault_audit_log(username, created_at)`,
    // Scheduled campaign sends. `scheduled_at` is the absolute UTC epoch the send
    // is due (computed from the user's local time + IANA `timezone` at creation).
    // The cron worker (/api/scheduler/run) claims due rows and dispatches them via
    // the shared send-core. `result_campaign_id` links to the campaigns row created
    // when it actually sends.
    `CREATE TABLE IF NOT EXISTS scheduled_campaigns (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      subject             TEXT NOT NULL,
      body                TEXT NOT NULL,
      is_html             INTEGER NOT NULL DEFAULT 0,
      list_id             INTEGER,
      exclude_recent_days INTEGER,
      daily_limit         INTEGER,
      send_offset         INTEGER NOT NULL DEFAULT 0,
      reply_to            TEXT,
      attach_postcard     INTEGER NOT NULL DEFAULT 0,
      scheduled_at        INTEGER NOT NULL,
      timezone            TEXT NOT NULL DEFAULT 'UTC',
      status              TEXT NOT NULL DEFAULT 'pending',
      result_campaign_id  INTEGER,
      recipient_count     INTEGER NOT NULL DEFAULT 0,
      error               TEXT,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    // Without these, every per-campaign open count and per-contact engagement
    // lookup below is a full scan of email_opens/email_send_log — fine at a few
    // thousand rows, catastrophic once the tracking pixel has logged millions
    // (this is what drove Turso's "rows read" into the billions: unindexed
    // correlated subqueries in /api/campaigns/send and /api/analytics, each
    // re-scanning the whole table once per outer row).
    `CREATE INDEX IF NOT EXISTS idx_email_opens_campaign ON email_opens(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_opens_email ON email_opens(email)`,
    `CREATE INDEX IF NOT EXISTS idx_email_opens_opened_at ON email_opens(opened_at)`,
    `CREATE INDEX IF NOT EXISTS idx_email_send_log_campaign ON email_send_log(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_send_log_email ON email_send_log(email)`,
    `CREATE INDEX IF NOT EXISTS idx_email_send_log_sent_at ON email_send_log(sent_at)`,
    `CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email)`,
], "write")
    .catch(console.error)
    .then(() => Promise.all([
      db.execute("ALTER TABLE contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").catch(() => {}),
      db.execute("ALTER TABLE campaigns ADD COLUMN target_list TEXT").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN tags TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN title TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN company TEXT NOT NULL DEFAULT ''").catch(() => {}),
      // CRM expansion — new columns (safe: ignored if already exist)
      db.execute("ALTER TABLE contacts ADD COLUMN first_name TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN last_name TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN phone TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN phone_2 TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN street_address TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN city TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN state TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN zip_code TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN country TEXT NOT NULL DEFAULT 'US'").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN notes TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN segments TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}'").catch(() => {}),
      // Extended fields — safe to re-run, ignored if already exist
      db.execute("ALTER TABLE contacts ADD COLUMN business_email TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN email_2 TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN linkedin TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN website TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN county TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN region TEXT NOT NULL DEFAULT ''").catch(() => {}),
      // List scoping — tie campaigns & templates to a contact list (null = all / general)
      db.execute("ALTER TABLE campaigns ADD COLUMN list_id INTEGER").catch(() => {}),
      db.execute("ALTER TABLE email_templates ADD COLUMN list_id INTEGER").catch(() => {}),
      // Branded-builder field state (JSON). Present = the template was built with the
      // field builder and can be reopened in it; null = plain / pasted-HTML template.
      db.execute("ALTER TABLE email_templates ADD COLUMN builder_json TEXT").catch(() => {}),
      // Extra phone / email slots (work & mobile secondary numbers, second personal email)
      db.execute("ALTER TABLE contacts ADD COLUMN work_phone_2 TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN mobile_phone_2 TEXT NOT NULL DEFAULT ''").catch(() => {}),
      db.execute("ALTER TABLE contacts ADD COLUMN personal_email_2 TEXT NOT NULL DEFAULT ''").catch(() => {}),
      // Drip sending — a scheduled entry may deliver its audience across many
      // batches instead of one. `batch_interval_minutes` is the gap between
      // batches (null = single send); `daily_limit` remains the per-batch size.
      // `send_offset` walks forward by the number actually sent each round, and
      // `recipient_count` accumulates the running total. `total_target` is the
      // audience size measured at schedule time — display only, so that drift in
      // the list never affects when the drip stops.
      db.execute("ALTER TABLE scheduled_campaigns ADD COLUMN batch_interval_minutes INTEGER").catch(() => {}),
      db.execute("ALTER TABLE scheduled_campaigns ADD COLUMN total_target INTEGER NOT NULL DEFAULT 0").catch(() => {}),
      // When the next batch is due. `scheduled_at` stays pinned to the time the
      // user originally chose — it is the campaign's anchor, and recurrence steps
      // forward from it — so the moving batch clock needs its own column.
      // Null means "use scheduled_at", i.e. the first batch has not run yet.
      db.execute("ALTER TABLE scheduled_campaigns ADD COLUMN next_batch_at INTEGER").catch(() => {}),
      // Recurrence: when a send finishes, queue the next occurrence ('daily' |
      // 'weekly' | 'monthly'). Null means one-and-done.
      db.execute("ALTER TABLE scheduled_campaigns ADD COLUMN repeat_every TEXT").catch(() => {}),
      // Set when a row is claimed for sending. A run killed mid-send (Vercel's
      // Hobby plan caps functions at 60s) would otherwise strand the row in
      // 'processing' forever; the worker reaps rows whose claim has gone stale.
      db.execute("ALTER TABLE scheduled_campaigns ADD COLUMN claimed_at INTEGER").catch(() => {}),
      // Template Library categories (see lib/templateCategories.ts) — distinct
      // from list_id, which scopes a template to a contact list rather than
      // classifying what kind of email it is.
      db.execute("ALTER TABLE email_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'general'").catch(() => {}),
      // Coarse device class ('desktop' | 'mobile' | 'other'), parsed from the
      // opening client's User-Agent at /api/track/open. Powers the Reports
      // "Top Devices" chart — nullable so historical opens (recorded before this
      // column existed) just fall into "Other" rather than breaking the count.
      db.execute("ALTER TABLE email_opens ADD COLUMN device TEXT").catch(() => {}),
    ]))
    .then(() => db.batch([
      // Seed test recipients — upsert so re-runs are safe
      { sql: "INSERT OR IGNORE INTO contacts (email, name, title, company) VALUES ('fiveer840@gmail.com', 'TEST SEED - Patrick', 'Senior Recruiter', 'Metro Associates')", args: [] },
      { sql: "INSERT OR IGNORE INTO contacts (email, name, title, company) VALUES ('news@patricknovick.com', 'TEST SEED - Sender', 'Marketing Coordinator', 'Metro Associates')", args: [] },
      { sql: "UPDATE contacts SET name = 'TEST SEED - Patrick', tags = 'test_seed', title = 'Senior Recruiter', company = 'Metro Associates' WHERE email = 'fiveer840@gmail.com'", args: [] },
      { sql: "UPDATE contacts SET name = 'TEST SEED - Sender', tags = 'test_seed', title = 'Marketing Coordinator', company = 'Metro Associates' WHERE email = 'news@patricknovick.com'", args: [] },
    ], "write"))
    // Seed the single footer-settings row once, with the values that used to be
    // hardcoded in emailBuilder.ts. INSERT OR IGNORE on a fixed id=1 makes this
    // safe to re-run — it never overwrites an admin's saved edits.
    .then(() => db.execute({
      sql: `INSERT OR IGNORE INTO email_footer_settings
            (id, signature_name, signature_title, phone_display, phone_href, email,
             link1_label, link1_url, link2_label, link2_url, tagline,
             logo_url, logo_align, logo_position)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        DEFAULT_FOOTER.signatureName, DEFAULT_FOOTER.signatureTitle,
        DEFAULT_FOOTER.phoneDisplay, DEFAULT_FOOTER.phoneHref, DEFAULT_FOOTER.email,
        DEFAULT_FOOTER.link1Label, DEFAULT_FOOTER.link1Url,
        DEFAULT_FOOTER.link2Label, DEFAULT_FOOTER.link2Url,
        DEFAULT_FOOTER.tagline, DEFAULT_FOOTER.logoUrl,
        DEFAULT_FOOTER.logoAlign, DEFAULT_FOOTER.logoPosition,
      ],
    }))
    // Seed built-in email templates once (idempotent: skip if the name exists).
    .then(() => db.batch(
      SEED_TEMPLATES.map((t) => ({
        sql: `INSERT INTO email_templates (name, subject, body)
              SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = ?)`,
        args: [t.name, t.subject, t.body, t.name],
      })),
      "write",
    ))
    // Phone-number migration (239 255-5921 -> 312 500-1878). Seeding above only
    // inserts a template when its name is missing, so templates already saved in the
    // DB — seeded ones plus anything typed or built in the dashboard — keep whatever
    // number they were created with. Rewrite it in place, covering every separator
    // style actually in use: the bare digits of the tel: href, the HTML signature's
    // "(239) 255-5921", and the "239-255-5921" that the plain-text letters sign off
    // with. Idempotent: REPLACE is a no-op once the new number is in. Pending
    // scheduled sends get it too, since their body is frozen at schedule time.
    // Sent campaigns are left alone — they're a historical record of what went out.
    .then(() => {
      const swap = (col: string) => `
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col},
          '2392555921',     '3125001878'),
          '(239) 255-5921', '(312) 500-1878'),
          '239-255-5921',   '312-500-1878'),
          '239.255.5921',   '312.500.1878'),
          '239 255 5921',   '312 500 1878')`;
      return db.batch([
        {
          sql: `UPDATE email_templates SET body = ${swap("body")} WHERE body LIKE '%5921%'`,
          args: [],
        },
        {
          sql: `UPDATE email_templates SET subject = ${swap("subject")} WHERE subject LIKE '%5921%'`,
          args: [],
        },
        {
          sql: `UPDATE scheduled_campaigns SET body = ${swap("body")}
                WHERE status = 'pending' AND body LIKE '%5921%'`,
          args: [],
        },
      ], "write");
    })
    // Backfill the send log from historical campaign_recipients ONCE — only runs
    // while the log is empty, so it preserves the existing "Emails Sent" baseline
    // without ever double-counting on later startups.
    .then(() => db.execute(`
      INSERT INTO email_send_log (campaign_id, email, sent_at)
      SELECT campaign_id, email, sent_at FROM campaign_recipients
      WHERE NOT EXISTS (SELECT 1 FROM email_send_log LIMIT 1)
    `))
    .catch(console.error);
}

export default db;
