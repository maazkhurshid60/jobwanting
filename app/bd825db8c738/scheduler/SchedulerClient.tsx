"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Calendar, Trash2, Send, AlertCircle, CheckCircle2, Loader2, Repeat, CalendarClock, X } from "lucide-react";
import { REPEAT_INTERVAL_DAYS, type RepeatEvery } from "@/lib/schedule";

interface ListRow { id: number; name: string; member_count: number }
interface TemplateRow { id: number; name: string; subject: string; body: string }

interface ScheduledRow {
  id: number;
  subject: string;
  is_html: number;
  list_id: number | null;
  list_name: string | null;
  daily_limit: number | null;
  send_offset: number;
  exclude_recent_days: number | null;
  reply_to: string | null;
  scheduled_at: number;
  timezone: string;
  status: string;
  result_campaign_id: number | null;
  recipient_count: number;
  error: string | null;
  batch_interval_minutes: number | null;
  total_target: number;
  repeat_every: string | null;
  next_batch_at: number | null;
}

// A curated set of common IANA zones; the viewer's own zone is added on mount.
const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/Toronto", "America/Sao_Paulo", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Madrid", "Europe/Athens", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Australia/Sydney", "UTC",
];

const CARD: React.CSSProperties = { background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: 16 };
const INPUT: React.CSSProperties = { background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: 10, color: "var(--admin-text)", padding: "9px 12px", fontSize: 14, width: "100%", outline: "none" };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", marginBottom: 6, display: "block" };

// "sending"/"processing" deliberately keep a distinct blue (off the
// accent/danger/success/warning families) so an in-progress send reads as its
// own state at a glance rather than borrowing the brand indigo — same call as
// the fixed off-family hues on the dashboard's Templates/Contacts cards.
function statusStyle(status: string): { bg: string; color: string } {
  switch (status) {
    case "pending": return { bg: "var(--admin-warning-soft)", color: "var(--admin-warning)" };
    case "sending": return { bg: "rgba(59,130,246,0.16)", color: "#60a5fa" };
    case "processing": return { bg: "rgba(59,130,246,0.16)", color: "#60a5fa" };
    case "sent": return { bg: "var(--admin-success-soft)", color: "var(--admin-success)" };
    case "failed": return { bg: "var(--admin-danger-soft)", color: "var(--admin-danger-text)" };
    default: return { bg: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)" };
  }
}

// A drip that has delivered at least one batch is still 'pending' in the table —
// it is waiting for its next batch, not waiting to start. Show that difference.
function displayStatus(r: ScheduledRow): string {
  if (r.status === "pending" && r.recipient_count > 0) return "sending";
  return r.status;
}

const STEPS = [
  { label: "Audience & Message", title: "Who & What", subtitle: "Pick your audience and write what you're sending." },
  { label: "Send Settings", title: "Send Settings", subtitle: "Batching, skipping, and reply-to for this send." },
  { label: "Schedule", title: "Schedule It", subtitle: "When this should go out, and whether it repeats." },
  { label: "Review & Send", title: "Review & Send", subtitle: "Double check the details before this goes out." },
] as const;

export default function SchedulerClient({
  contactCount, lists, templates,
}: { contactCount: number; lists: ListRow[]; templates: TemplateRow[] }) {
  const [step, setStep] = useState(0);

  // compose
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [listId, setListId] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [sendOffset, setSendOffset] = useState(0);
  const [excludeRecent, setExcludeRecent] = useState(false);
  const [excludeDays, setExcludeDays] = useState(30);
  const [replyTo, setReplyTo] = useState("");
  const [templateId, setTemplateId] = useState<number | "">("");

  // schedule
  const [localDateTime, setLocalDateTime] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [tzOptions, setTzOptions] = useState<string[]>(TIMEZONES);
  const [drip, setDrip] = useState(false);
  const [dripMinutes, setDripMinutes] = useState(30);
  const [repeatEvery, setRepeatEvery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  // Reschedule a failed row — see the inline editor in the list below. Pushing
  // the date forward (rather than re-sending now) is what makes it show
  // "Pending" again without actually firing: the cron worker only claims rows
  // whose scheduled_at has already passed.
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [reDateTime, setReDateTime] = useState("");
  const [reExcludeRecent, setReExcludeRecent] = useState(false);
  const [reExcludeDays, setReExcludeDays] = useState(30);
  const [reSaving, setReSaving] = useState(false);
  const [reErr, setReErr] = useState<string | null>(null);

  // `defaultDateTime` is computed at the call site (inside the button's onClick,
  // an actual event handler) rather than here, so the impure Date.now() read
  // isn't inside a plain component-scope function the linter can't prove is
  // event-only.
  function openReschedule(r: ScheduledRow, defaultDateTime: string) {
    setReschedulingId(r.id);
    setReErr(null);
    setReDateTime(defaultDateTime);
    setReExcludeRecent(r.exclude_recent_days != null);
    setReExcludeDays(r.exclude_recent_days ?? 30);
  }

  async function saveReschedule(r: ScheduledRow) {
    setReErr(null);
    if (!reDateTime) { setReErr("Pick a date and time."); return; }
    if (r.repeat_every && reExcludeRecent && reExcludeDays >= REPEAT_INTERVAL_DAYS[r.repeat_every as RepeatEvery]) {
      setReErr(`A ${r.repeat_every} repeat with a ${reExcludeDays}-day exclusion will exclude almost everyone once the previous run has gone out. Lower it below ${REPEAT_INTERVAL_DAYS[r.repeat_every as RepeatEvery]} days, or turn it off.`);
      return;
    }
    setReSaving(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id,
          localDateTime: reDateTime,
          timezone: r.timezone,
          excludeRecentDays: reExcludeRecent ? reExcludeDays : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setReErr(data.error || "Could not reschedule."); return; }
      setReschedulingId(null);
      loadRows();
    } catch {
      setReErr("Network error — please try again.");
    } finally {
      setReSaving(false);
    }
  }

  // Default timezone + a sensible default time (1 hour from now, rounded to :00).
  useEffect(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz && !TIMEZONES.includes(browserTz)) {
      setTzOptions([browserTz, ...TIMEZONES]);
    }
    if (browserTz) setTimezone(browserTz);

    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    setLocalDateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);

    // Pre-populate scheduler draft if any (e.g. from Templates page)
    const draft = localStorage.getItem("scheduler_draft");
    if (draft) {
      try {
        const { subject: s, body: b, isHtml: h } = JSON.parse(draft);
        if (s) setSubject(s);
        if (b) setBody(b);
        if (typeof h === "boolean") setIsHtml(h);
        localStorage.removeItem("scheduler_draft");
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const res = await fetch("/api/scheduler");
      if (res.ok) setRows(await res.json());
    } finally {
      setLoadingRows(false);
    }
  }, []);

  // Poll while the tab is visible. Without this the list keeps showing "Pending"
  // long after the cron has actually sent, since it only loaded once on mount.
  useEffect(() => {
    loadRows();
    const tick = () => { if (document.visibilityState === "visible") loadRows(); };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [loadRows]);

  function applyTemplate(id: number | "") {
    setTemplateId(id);
    if (id === "") return;
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
      // Templates are stored as HTML bodies in this app.
      setIsHtml(/<[a-z][\s\S]*>/i.test(t.body));
    }
  }

  const targetCount = listId ? (lists.find((l) => l.id === listId)?.member_count ?? 0) : contactCount;
  const remaining = Math.max(0, targetCount - sendOffset);
  const willSend = Math.min(remaining, dailyLimit);

  // A recurring send re-targets its whole list from scratch every occurrence,
  // so an exclusion window as long as the repeat interval means next time's
  // run finds the previous run's recipients still "recently emailed" — the
  // whole audience gets excluded and it fails with no obvious cause. Same
  // check as POST /api/scheduler; shown here so it's caught before submitting.
  const repeatConflict =
    repeatEvery && excludeRecent && excludeDays >= REPEAT_INTERVAL_DAYS[repeatEvery as RepeatEvery]
      ? `A ${repeatEvery} repeat with a ${excludeDays}-day exclusion will exclude almost everyone once the previous run has gone out. Lower it below ${REPEAT_INTERVAL_DAYS[repeatEvery as RepeatEvery]} days, or turn it off, if this should re-reach the same list each time.`
      : null;

  const canContinue =
    step === 0 ? !!subject.trim() && !!body.trim() :
    step === 2 ? !!localDateTime && !repeatConflict :
    true;

  async function schedule() {
    setMsg(null);
    if (!subject.trim() || !body.trim()) { setMsg({ type: "err", text: "Subject and message are required." }); return; }
    if (!localDateTime) { setMsg({ type: "err", text: "Pick a date and time." }); return; }
    if (repeatConflict) { setMsg({ type: "err", text: repeatConflict }); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, body, isHtml,
          listId: listId ?? null,
          dailyLimit,
          offset: sendOffset,
          excludeRecentDays: excludeRecent ? excludeDays : null,
          replyTo: replyTo.trim() || null,
          localDateTime,
          timezone,
          batchIntervalMinutes: drip ? dripMinutes : null,
          repeatEvery: repeatEvery || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error || "Failed to schedule." }); return; }
      const batches = drip ? Math.ceil(Math.max(0, targetCount - sendOffset) / Math.max(1, dailyLimit)) : 1;
      setMsg({
        type: "ok",
        text: drip
          ? `Scheduled! ${dailyLimit} at a time, every ${dripMinutes} min — about ${batches} batch${batches === 1 ? "" : "es"} to reach all ${targetCount}.`
          : "Scheduled! It will send automatically at the chosen time.",
      });
      setSubject(""); setBody(""); setTemplateId(""); setIsHtml(false);
      setStep(0);
      loadRows();
    } catch {
      setMsg({ type: "err", text: "Network error — please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: number) {
    if (!confirm("Cancel this scheduled send?")) return;
    const res = await fetch("/api/scheduler", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadRows();
    else { const d = await res.json().catch(() => ({})); alert(d.error || "Could not cancel."); }
  }

  function fmt(epoch: number, tz: string): string {
    try {
      return new Date(epoch * 1000).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
    } catch {
      return new Date(epoch * 1000).toLocaleString();
    }
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--admin-accent-soft)" }}>
          <Clock size={20} style={{ color: "var(--admin-accent-text)" }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-(--admin-text)">Email Scheduler</h1>
          <p className="text-xs text-(--admin-text-muted)">
            Queue campaigns to send automatically at a specific time, in any timezone.
          </p>
        </div>
      </div>

      {/* Compose wizard */}
      <div style={CARD} className="p-5 sm:p-6 flex flex-col gap-5">
        {/* Step indicator */}
        <div className="pb-1">
          <ol className="flex items-center">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={s.label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <button type="button" onClick={() => i <= step && setStep(i)} disabled={i > step}
                    className="flex shrink-0 flex-col items-center gap-1.5" style={{ cursor: i <= step ? "pointer" : "default" }}>
                    <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors" style={{
                        background: done || active ? "var(--admin-accent)" : "transparent",
                        border: done || active ? "none" : "2px solid var(--admin-border)",
                        color: done || active ? "var(--admin-text)" : "var(--admin-text-muted)",
                      }}>
                      {done ? <CheckCircle2 size={14} /> : i + 1}
                    </span>
                    <span className="hidden text-[11px] font-semibold sm:block" style={{ color: active ? "var(--admin-text)" : "var(--admin-text-muted)" }}>
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="mx-2 mb-5 h-0.5 flex-1 sm:mb-6" style={{ background: done ? "var(--admin-accent)" : "var(--admin-border)" }} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h2 className="text-base font-bold text-(--admin-text)">{STEPS[step].title}</h2>
          <p className="text-xs mt-0.5 text-(--admin-text-muted)">{STEPS[step].subtitle}</p>
        </div>

        {/* Step 1: audience + message */}
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label style={LABEL}>Start from a template (optional)</label>
                <select style={INPUT} value={templateId} onChange={(e) => applyTemplate(e.target.value ? Number(e.target.value) : "")}>
                  <option value="" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>— None —</option>
                  {templates.map((t) => <option key={t.id} value={t.id} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Send to</label>
                <select style={INPUT} value={listId ?? ""} onChange={(e) => setListId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All active contacts ({contactCount})</option>
                  {lists.map((l) => <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{l.name} ({l.member_count})</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={LABEL}>Subject</label>
              <input style={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your email subject…" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label style={{ ...LABEL, marginBottom: 0 }}>Message</label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: "var(--admin-text-secondary)" }}>
                  <input type="checkbox" checked={isHtml} onChange={(e) => setIsHtml(e.target.checked)} />
                  Body is HTML
                </label>
              </div>
              <textarea style={{ ...INPUT, minHeight: 160, resize: "vertical", fontFamily: isHtml ? "monospace" : undefined }}
                value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={isHtml ? "<p>Paste your HTML here…</p>" : "Write your message… Use {{first_name}}, {{company}} etc. to personalize."} />
            </div>
          </div>
        )}

        {/* Step 2: send settings */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label style={LABEL}>Batch size (max to send)</label>
                <input style={INPUT} type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <label style={LABEL}>Skip first N recipients</label>
                <input style={INPUT} type="number" min={0} value={sendOffset} onChange={(e) => setSendOffset(Math.max(0, Number(e.target.value)))} />
              </div>
              <div>
                <label style={LABEL}>Reply-to (optional)</label>
                <input style={INPUT} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="patrick@metroassoc.com" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
              <input type="checkbox" checked={excludeRecent} onChange={(e) => setExcludeRecent(e.target.checked)} />
              Don&apos;t send to anyone emailed in the last
              <input style={{ ...INPUT, width: 64, padding: "4px 8px" }} type="number" min={1} value={excludeDays}
                disabled={!excludeRecent} onChange={(e) => setExcludeDays(Math.max(1, Number(e.target.value)))} />
              days
            </label>
          </div>
        )}

        {/* Step 3: schedule */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label style={LABEL}><Calendar size={12} className="inline mr-1 -mt-0.5" />Send date &amp; time</label>
                <input style={INPUT} type="datetime-local" value={localDateTime} onChange={(e) => setLocalDateTime(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Timezone</label>
                <select style={INPUT} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {tzOptions.map((tz) => <option key={tz} value={tz} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{tz.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <div>
                <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                  <input type="checkbox" checked={drip} onChange={(e) => setDrip(e.target.checked)} />
                  Keep sending in batches, every
                  <input style={{ ...INPUT, width: 68, padding: "4px 8px" }} type="number" min={5} step={5} value={dripMinutes}
                    disabled={!drip} onChange={(e) => setDripMinutes(Math.max(5, Number(e.target.value)))} />
                  min
                </label>
                <p className="text-xs mt-1.5 text-(--admin-text-faint)">
                  {drip
                    ? `Sends ${dailyLimit} at a time until the whole audience is covered.`
                    : `Off — this sends ${willSend} once and stops.`}
                </p>
              </div>
              <div>
                <label style={LABEL}><Repeat size={12} className="inline mr-1 -mt-0.5" />Repeat</label>
                <select style={INPUT} value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)}>
                  <option value="" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Don&apos;t repeat</option>
                  <option value="daily" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Daily</option>
                  <option value="weekly" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Weekly</option>
                  <option value="monthly" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Monthly</option>
                </select>
              </div>
            </div>

            {repeatConflict && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)" }}>
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                {repeatConflict}
              </div>
            )}
          </div>
        )}

        {/* Step 4: review */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 rounded-xl px-4 py-3" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
              <ReviewRow label="Audience" value={listId ? `${lists.find((l) => l.id === listId)?.name} (${lists.find((l) => l.id === listId)?.member_count})` : `All active contacts (${contactCount})`} />
              <ReviewRow label="Subject" value={subject || "—"} />
              <ReviewRow label="Batch size" value={String(dailyLimit)} />
              {sendOffset > 0 && <ReviewRow label="Skip first" value={String(sendOffset)} />}
              {replyTo && <ReviewRow label="Reply-to" value={replyTo} />}
              {excludeRecent && <ReviewRow label="Exclude recent" value={`Emailed in last ${excludeDays} days`} />}
              <ReviewRow
                label="Send date"
                value={localDateTime ? `${localDateTime.replace("T", " ")} · ${timezone.replace(/_/g, " ")}` : "—"}
                highlight
              />
              <ReviewRow label="Repeat" value={repeatEvery ? repeatEvery[0].toUpperCase() + repeatEvery.slice(1) : "Doesn't repeat"} />
              <ReviewRow label="Drip" value={drip ? `${dailyLimit} every ${dripMinutes} min` : "Off — sends once"} last />
            </div>

            <p className="text-xs text-(--admin-text-muted)">
              {drip ? (
                <>
                  Will send <span style={{ color: "var(--admin-text)" }}>{dailyLimit}</span> at a time every {dripMinutes} min until all{" "}
                  <span style={{ color: "var(--admin-text)" }}>{remaining}</span> of {targetCount} in{" "}
                  <span style={{ color: "var(--admin-text)" }}>{listId ? lists.find((l) => l.id === listId)?.name : "all active contacts"}</span> are reached.
                </>
              ) : (
                <>
                  Will send to <span style={{ color: "var(--admin-text)" }}>{willSend}</span> recipient{willSend === 1 ? "" : "s"}
                  {sendOffset > 0 ? ` (#${sendOffset + 1}–#${sendOffset + willSend})` : ""} of {targetCount} in{" "}
                  <span style={{ color: "var(--admin-text)" }}>{listId ? lists.find((l) => l.id === listId)?.name : "all active contacts"}</span>.
                </>
              )}
            </p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
            className="text-sm font-semibold transition-colors"
            style={{ color: step === 0 ? "var(--admin-text-faint)" : "var(--admin-text-secondary)", cursor: step === 0 ? "default" : "pointer" }}>
            ← Previous
          </button>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs sm:inline text-(--admin-text-muted)">
              Step {step + 1} of {STEPS.length}
            </span>
            {step === STEPS.length - 1 ? (
              <button onClick={schedule} disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                style={{ background: "var(--admin-accent)", opacity: submitting ? 0.5 : 1, color: "#fff", cursor: submitting ? "default" : "pointer" }}>
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {submitting ? "Scheduling…" : "Schedule Send"}
              </button>
            ) : (
              <button type="button" onClick={() => canContinue && setStep((s) => s + 1)} disabled={!canContinue}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                style={{ background: canContinue ? "var(--admin-hover-bg)" : "var(--admin-surface-2)", color: canContinue ? "var(--admin-text)" : "var(--admin-text-faint)", cursor: canContinue ? "pointer" : "default" }}>
                Next step
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: msg.type === "ok" ? "var(--admin-success-soft)" : "var(--admin-danger-soft)", color: msg.type === "ok" ? "var(--admin-success)" : "var(--admin-danger-text)" }}>
            {msg.type === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {msg.text}
          </div>
        )}
      </div>

      {/* Scheduled list */}
      <div style={CARD} className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-(--admin-text)">Scheduled &amp; Sent</h2>
          <button onClick={loadRows} className="text-xs text-(--admin-text-muted)">Refresh</button>
        </div>

        {loadingRows ? (
          <div className="flex items-center gap-2 py-8 justify-center text-(--admin-text-muted)">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-(--admin-text-muted)">
            No scheduled sends yet. Compose one above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const shown = displayStatus(r);
              const ss = statusStyle(shown);
              const isDrip = !!r.batch_interval_minutes && r.batch_interval_minutes > 0;
              const showProgress = isDrip && r.total_target > 0 && shown !== "failed";
              const pct = showProgress
                ? Math.min(100, Math.round((r.recipient_count / r.total_target) * 100))
                : 0;
              const isEditing = reschedulingId === r.id;
              return (
                <div key={r.id} className="rounded-xl px-4 py-3"
                  style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-0" style={{ flexBasis: "60%" }}>
                      <p className="text-sm font-medium text-(--admin-text) truncate">
                        {r.subject || "—"}
                        {r.repeat_every && (
                          <span className="ml-2 text-xs font-normal capitalize text-(--admin-text-muted)">
                            <Repeat size={10} className="inline mr-0.5 -mt-0.5" />{r.repeat_every}
                          </span>
                        )}
                      </p>
                      <p className="text-xs mt-0.5 text-(--admin-text-muted)">
                        {r.list_name ?? "All active contacts"}
                        {shown === "sent" ? ` · ${r.recipient_count} sent` : ""}
                        {shown === "sending" && r.next_batch_at
                          ? ` · next batch ${fmt(r.next_batch_at, r.timezone)}`
                          : ""}
                        {shown === "failed" && r.error ? ` · ${r.error}` : ""}
                      </p>
                      {showProgress && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--admin-border)" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: shown === "sent" ? "var(--admin-success)" : "#60a5fa" }} />
                          </div>
                          <span className="text-xs tabular-nums shrink-0 text-(--admin-text-muted)">
                            {r.recipient_count.toLocaleString()} / {r.total_target.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Scheduled date/time — the detail people actually scan for,
                        pulled out of the muted subtitle line and made to look like it. */}
                    <div className="flex flex-col items-start sm:items-end shrink-0">
                      <span className="text-sm font-bold tabular-nums flex items-center gap-1.5" style={{ color: "var(--admin-text)" }}>
                        <Calendar size={12} style={{ color: "var(--admin-accent-text)" }} />
                        {fmt(r.scheduled_at, r.timezone)}
                      </span>
                      <span className="text-[11px] mt-0.5 text-(--admin-text-muted)">
                        {r.timezone.replace(/_/g, " ")}
                      </span>
                    </div>

                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize shrink-0" style={{ background: ss.bg, color: ss.color }}>
                      {shown}
                    </span>
                    {r.status === "failed" && (
                      <button onClick={() => {
                          if (isEditing) { setReschedulingId(null); return; }
                          const d = new Date(Date.now() + 24 * 60 * 60 * 1000); // default: this time tomorrow
                          d.setMinutes(0, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          openReschedule(r, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                        }}
                        title="Reschedule — sets it back to Pending without sending now"
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-(--admin-hover-bg)"
                        style={{ color: isEditing ? "var(--admin-warning)" : "var(--admin-text-muted)" }}>
                        <CalendarClock size={15} />
                      </button>
                    )}
                    {r.status !== "processing" && (
                      <button onClick={() => cancel(r.id)} title={r.status === "pending" ? "Cancel" : "Remove"}
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-(--admin-hover-bg)"
                        style={{ color: "var(--admin-text-muted)" }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mt-3 pt-3 flex flex-col gap-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                      <p className="text-xs text-(--admin-text-muted)">
                        Pushes this to Pending at a new time — it will NOT send right now.
                      </p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label style={LABEL}>New send date &amp; time ({r.timezone.replace(/_/g, " ")})</label>
                          <input style={INPUT} type="datetime-local" value={reDateTime} onChange={(e) => setReDateTime(e.target.value)} />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer mt-6" style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                            <input type="checkbox" checked={reExcludeRecent} onChange={(e) => setReExcludeRecent(e.target.checked)} />
                            Don&apos;t send to anyone emailed in the last
                            <input style={{ ...INPUT, width: 64, padding: "4px 8px" }} type="number" min={1} value={reExcludeDays}
                              disabled={!reExcludeRecent} onChange={(e) => setReExcludeDays(Math.max(1, Number(e.target.value)))} />
                            days
                          </label>
                        </div>
                      </div>
                      {reErr && (
                        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)" }}>
                          <AlertCircle size={15} className="shrink-0 mt-0.5" />
                          {reErr}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => saveReschedule(r)} disabled={reSaving}
                          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                          style={{ background: "var(--admin-accent)", color: "#fff" }}>
                          {reSaving ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                          {reSaving ? "Saving…" : "Set to Pending"}
                        </button>
                        <button onClick={() => setReschedulingId(null)}
                          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                          style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-center text-(--admin-text-faint)">
        The scheduler checks for due sends every 5 minutes. A send fires at the next check after its scheduled time.
      </p>
    </div>
  );
}

function ReviewRow({ label, value, highlight, last }: { label: string; value: string; highlight?: boolean; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2" style={last ? undefined : { borderBottom: "1px solid var(--admin-border)" }}>
      <span className="text-xs text-(--admin-text-muted)">{label}</span>
      <span
        className={`text-sm text-right truncate ${highlight ? "font-bold" : "font-medium"}`}
        style={{ color: highlight ? "var(--admin-accent-text)" : "var(--admin-text)", maxWidth: "70%" }}
      >
        {value}
      </span>
    </div>
  );
}
