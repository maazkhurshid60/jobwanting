"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, Eye, AlertTriangle, UserMinus, Send, Users, TrendingUp, Loader2, ChevronLeft, ChevronRight, Reply, MousePointerClick } from "lucide-react";
import { LineChart } from "./charts";

interface ContactEngagement {
  email: string;
  name: string;
  status: string;
  title: string;
  company: string;
  sends: number;
  opens: number;
  last_sent: number | null;
  suppressed: number;
}

interface BrevoStats {
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

interface Totals {
  total_contacts: number;
  total_sends: number;
  total_opens: number;
  total_suppressed: number;
}

interface BrevoEvent {
  email: string;
  date: string;
  subject: string;
  event: string;
  reason?: string;
}

interface DayCount { date: string; count: number }
interface ChartsData {
  opensByDay: DayCount[];
  clicksByDay: DayCount[];
}

interface AnalyticsData {
  brevo: BrevoStats;
  events: BrevoEvent[];
  contacts: ContactEngagement[];
  totals: Totals;
  charts: ChartsData;
}

interface CampaignRow {
  id: number;
  subject: string;
  status: string;
  recipient_count: number;
  unique_opens: number;
  sent_at: number;
  target_list: string | null;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "contacts", label: "Contacts" },
  { key: "replies", label: "Replies" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Map a Brevo event type to a readable label + colors
function eventStyle(ev: string): { label: string; color: string; bg: string } {
  switch (ev) {
    case "delivered":    return { label: "Delivered",    color: "var(--admin-success)", bg: "rgba(34,197,94,0.12)" };
    case "requests":     return { label: "Sent",         color: "#93c5fd", bg: "rgba(147,197,253,0.12)" };
    case "opened":
    case "uniqueOpened": return { label: "Opened",       color: "var(--admin-warning)", bg: "rgba(245,158,11,0.14)" };
    case "clicks":
    case "uniqueClicks": return { label: "Clicked",      color: "var(--admin-accent-text)", bg: "rgba(165,180,252,0.14)" };
    case "loadedByProxy":return { label: "Proxy open",   color: "var(--admin-warning)", bg: "rgba(245,158,11,0.10)" };
    case "softBounces":  return { label: "Soft bounce",  color: "#fb923c", bg: "rgba(251,146,60,0.14)" };
    case "hardBounces":  return { label: "Hard bounce",  color: "var(--admin-danger-text)", bg: "rgba(248,113,113,0.14)" };
    case "deferred":     return { label: "Deferred",     color: "#fdba74", bg: "rgba(253,186,116,0.10)" };
    case "blocked":      return { label: "Blocked",      color: "var(--admin-danger-text)", bg: "rgba(248,113,113,0.14)" };
    case "spam":         return { label: "Spam",         color: "var(--admin-danger-text)", bg: "rgba(248,113,113,0.14)" };
    case "invalid":      return { label: "Invalid",      color: "#94a3b8", bg: "rgba(148,163,184,0.14)" };
    case "unsubscribed": return { label: "Unsubscribed", color: "var(--admin-danger-text)", bg: "rgba(248,113,113,0.14)" };
    case "error":        return { label: "Error",        color: "var(--admin-danger-text)", bg: "rgba(248,113,113,0.14)" };
    default:             return { label: ev,             color: "var(--admin-text-secondary)", bg: "var(--admin-surface-2)" };
  }
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Unix seconds → "12 Jul 2026". Used for a contact's last-sent date.
function fmtUnixDate(secs: number | null): string {
  if (!secs) return "—";
  const d = new Date(secs * 1000);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

const card = {
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "1rem",
};

function StatCard({ icon: Icon, label, value, sub, color, dim }: {
  icon: typeof Mail; label: string; value: number | string; sub?: string; color: string; dim: string;
}) {
  return (
    <div className="px-5 py-5" style={card}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: dim }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-black" style={{ fontFamily: "var(--font-heading)", color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>{sub}</p>}
    </div>
  );
}

interface ContactList { id: number; name: string }

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeActive = !!(from && to);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [listFilter, setListFilter] = useState<number | "all">("all");
  const [tab, setTab] = useState<TabKey>("overview");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [contactsSearch, setContactsSearch] = useState("");
  const [eventPage, setEventPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all"); // by readable label, e.g. "Opened"
  const [activitySearch, setActivitySearch] = useState("");
  const EVENTS_PER_PAGE = 20;

  // Recent-activity feed — offset-paginated from Brevo via /api/analytics/events.
  // We keep a growing pool of loaded events and page through it 20 at a time;
  // "Load more" pulls the next block from Brevo so we can go arbitrarily deep.
  const [feed, setFeed] = useState<BrevoEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0); // next raw Brevo offset to request

  const fetchFeed = useCallback(async (reset: boolean, offset: number) => {
    setFeedLoading(true);
    const params = new URLSearchParams();
    if (from && to) { params.set("from", from); params.set("to", to); }
    else params.set("days", String(days));
    if (listFilter !== "all") params.set("listId", String(listFilter));
    params.set("offset", String(offset));
    try {
      const r = await fetch(`/api/analytics/events?${params.toString()}`);
      const d = await r.json() as { events: BrevoEvent[]; hasMore: boolean; nextOffset: number };
      setFeed((prev) => reset ? d.events : [...prev, ...d.events]);
      setFeedOffset(d.nextOffset);
      setFeedHasMore(!!d.hasMore);
      if (reset) setEventPage(1);
    } catch {
      if (reset) setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, [from, to, days, listFilter]);

  useEffect(() => {
    fetch("/api/lists").then((r) => r.json()).then(setLists).catch(() => {});
  }, []);

  // Campaign history for the Campaigns tab — reuses the same endpoint the
  // Campaign Builder's "Sent History" panel already fetches from.
  useEffect(() => {
    let active = true;
    setCampaignsLoading(true);
    const url = listFilter === "all" ? "/api/campaigns/send" : `/api/campaigns/send?listId=${listFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((rows: CampaignRow[]) => { if (active) setCampaigns(rows); })
      .catch(() => { if (active) setCampaigns([]); })
      .finally(() => { if (active) setCampaignsLoading(false); });
    return () => { active = false; };
  }, [listFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEventPage(1);
    const params = new URLSearchParams();
    // An explicit from/to range overrides the rolling "last N days" window.
    if (from && to) { params.set("from", from); params.set("to", to); }
    else params.set("days", String(days));
    if (listFilter !== "all") params.set("listId", String(listFilter));
    fetch(`/api/analytics?${params.toString()}`)
      .then((r) => r.json())
      .then((d: AnalyticsData) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, listFilter, from, to]);

  // (Re)load the feed from the top whenever the window/list changes
  useEffect(() => { fetchFeed(true, 0); }, [fetchFeed]);
  // Reset to the first client page when filters change
  useEffect(() => { setEventPage(1); }, [eventTypeFilter, activitySearch]);

  const selectedListName = listFilter === "all" ? null : lists.find((l) => l.id === listFilter)?.name ?? null;

  const b = data?.brevo;

  // Per-contact rollup (times sent / last sent), keyed by lowercased email, so
  // each event row can show how many times we've emailed that recipient.
  const engByEmail = new Map<string, ContactEngagement>();
  for (const c of data?.contacts ?? []) engByEmail.set(c.email.toLowerCase(), c);

  // Distinct event types present (by readable label) for the status dropdown
  const eventTypeOptions = Array.from(new Set(feed.map((e) => eventStyle(e.event).label))).sort();

  // Apply status + search filters across everything loaded, then page 20 at a time
  const q = activitySearch.trim().toLowerCase();
  const filteredEvents = feed.filter((e) => {
    if (eventTypeFilter !== "all" && eventStyle(e.event).label !== eventTypeFilter) return false;
    if (q && !(e.email || "").toLowerCase().includes(q) && !(e.subject || "").toLowerCase().includes(q)) return false;
    return true;
  });
  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const currentEventPage = Math.min(eventPage, totalEventPages);
  const pagedEvents = filteredEvents.slice((currentEventPage - 1) * EVENTS_PER_PAGE, currentEventPage * EVENTS_PER_PAGE);
  const onLastLoadedPage = currentEventPage >= totalEventPages;
  const bounces = b ? b.hardBounces + b.softBounces : 0;
  const deliveryRate = b && b.requests > 0 ? Math.round((b.delivered / b.requests) * 100) : 0;
  const openRate = b && b.delivered > 0 ? Math.round((b.uniqueOpens / b.delivered) * 100) : 0;

  const filteredContacts = (data?.contacts ?? []).filter((c) => {
    const cq = contactsSearch.trim().toLowerCase();
    if (!cq) return true;
    return c.name.toLowerCase().includes(cq) || c.email.toLowerCase().includes(cq) || c.company.toLowerCase().includes(cq);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="relative px-4 py-2.5 text-sm font-semibold shrink-0 transition-colors"
            style={{ color: tab === t.key ? "var(--admin-text)" : "var(--admin-text-muted)" }}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ background: "var(--admin-accent)" }} />
            )}
          </button>
        ))}
      </div>

      {/* List scope + date-range selectors */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
          {selectedListName ? <>Showing analytics for <span className="font-semibold" style={{ color: "var(--admin-accent-text)" }}>{selectedListName}</span></> : "Showing analytics across all contacts"}
          {rangeActive && <> · <span className="font-semibold" style={{ color: "var(--admin-accent-text)" }}>{from} → {to}</span></>}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* From / To date range — the whole end day is included */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{ background: "transparent", border: "none", color: "var(--admin-text)", fontSize: "0.75rem", outline: "none", colorScheme: "dark" }}
              title="From date (inclusive)"
            />
            <span style={{ color: "var(--admin-text-faint)", fontSize: "0.75rem" }}>→</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              style={{ background: "transparent", border: "none", color: "var(--admin-text)", fontSize: "0.75rem", outline: "none", colorScheme: "dark" }}
              title="To date (the entire day is included)"
            />
            {rangeActive && (
              <button
                onClick={() => { setFrom(""); setTo(""); }}
                className="px-1.5 py-0.5 rounded text-xs font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                style={{ color: "var(--admin-text-secondary)" }}
                title="Clear date range"
              >
                Clear
              </button>
            )}
          </div>
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.78rem", padding: "0.45rem 0.75rem", outline: "none", cursor: "pointer", maxWidth: 220 }}
            title="Scope analytics to a list"
          >
            <option value="all" style={{ background: "var(--admin-surface)" }}>All lists</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === "overview" && (
      <>
      {/* Visual reports: opens/clicks trend — both live from Brevo's API, never stored in our DB */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5" style={card}>
          <p className="text-sm font-bold text-(--admin-text) mb-3" style={{ fontFamily: "var(--font-heading)" }}>Opens Over Time</p>
          <LineChart data={data?.charts.opensByDay ?? []} color="var(--admin-accent)" />
        </div>
        <div className="p-5" style={card}>
          <p className="text-sm font-bold text-(--admin-text) mb-3 flex items-center gap-1.5" style={{ fontFamily: "var(--font-heading)" }}>
            <MousePointerClick size={14} style={{ color: "var(--admin-text-faint)" }} /> Clicks Over Time
          </p>
          <LineChart data={data?.charts.clicksByDay ?? []} color="#60a5fa" />
        </div>
      </div>
      <p className="text-xs text-center" style={{ color: "var(--admin-text-faint)" }}>
        Visual reports to track performance &amp; trends.
      </p>

      {/* Engagement totals (from your own send logs) */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--admin-text-faint)" }}>
          Your audience
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Contacts" value={data?.totals.total_contacts ?? 0} color="#7dd3fc" dim="rgba(125,211,252,0.1)" />
          <StatCard icon={Send} label={rangeActive ? "Emails Sent (in range)" : "Emails Sent (all time)"} value={data?.totals.total_sends ?? 0} sub={rangeActive ? `${from} → ${to}` : undefined} color="var(--admin-success)" dim="var(--admin-success-soft)" />
          <StatCard icon={Eye} label={rangeActive ? "Opens (in range)" : "Total Opens"} value={data?.totals.total_opens ?? 0} sub={rangeActive ? `${from} → ${to}` : undefined} color="var(--admin-warning)" dim="var(--admin-warning-soft)" />
          <StatCard icon={UserMinus} label="Unsubscribed / Suppressed" value={data?.totals.total_suppressed ?? 0} color="var(--admin-danger-text)" dim="rgba(248,113,113,0.12)" />
        </div>
      </div>

      {/* Deliverability (from Brevo) */}
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--admin-text-faint)" }}>
            Deliverability <span style={{ color: "var(--admin-text-faint)" }}>· via Brevo · {b?.range ?? `last ${days} days`}</span>
            {loading && <Loader2 className="animate-spin" size={12} style={{ color: "var(--admin-text-muted)" }} />}
          </p>
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--admin-surface-2)", opacity: rangeActive ? 0.4 : 1 }} title={rangeActive ? "Clear the date range to use these quick windows" : undefined}>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => { setFrom(""); setTo(""); setDays(d); }}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{
                  background: !rangeActive && days === d ? "var(--admin-accent-soft)" : "transparent",
                  color: !rangeActive && days === d ? "var(--admin-accent-text)" : "var(--admin-text-muted)",
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Mail} label="Delivered" value={b?.delivered ?? 0} sub={`${deliveryRate}% of ${b?.requests ?? 0} sent`} color="var(--admin-success)" dim="var(--admin-success-soft)" />
          <StatCard icon={Eye} label="Unique Opens" value={b?.uniqueOpens ?? 0} sub={`${openRate}% open rate`} color="var(--admin-warning)" dim="var(--admin-warning-soft)" />
          <StatCard icon={TrendingUp} label="Unique Clicks" value={b?.uniqueClicks ?? 0} color="var(--admin-accent-text)" dim="rgba(165,180,252,0.12)" />
          <StatCard icon={AlertTriangle} label="Bounces" value={bounces} sub={`${b?.hardBounces ?? 0} hard · ${b?.softBounces ?? 0} soft`} color="#fb923c" dim="rgba(251,146,60,0.12)" />
        </div>
        {b && b.requests === 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--admin-text-faint)" }}>
            No Brevo activity in this window yet (or the API couldn&apos;t be reached). Your send-log numbers above are always accurate.
          </p>
        )}
      </div>

      {/* Recent email activity (live event log from Brevo, newest first) */}
      <div style={card} className="overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <div>
            <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Recent Email Activity</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
              Newest first · via Brevo · {b?.range ?? `last ${days} days`} · {feed.length} loaded{feedHasMore ? "+" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Recipient / subject search */}
            <input
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search recipient or subject…"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.75rem", padding: "0.4rem 0.7rem", outline: "none", width: 200 }}
            />
            {/* Status / event-type filter */}
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.75rem", padding: "0.4rem 0.7rem", outline: "none", cursor: "pointer" }}
              title="Filter by status / event type"
            >
              <option value="all" style={{ background: "var(--admin-surface)" }}>All statuses</option>
              {eventTypeOptions.map((label) => (
                <option key={label} value={label} style={{ background: "var(--admin-surface)" }}>{label}</option>
              ))}
            </select>
            {(eventTypeFilter !== "all" || activitySearch) && (
              <button
                onClick={() => { setEventTypeFilter("all"); setActivitySearch(""); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {feedLoading && feed.length === 0 ? (
          <div className="py-12 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>Loading…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>
            {feed.length === 0
              ? "No email activity in this window (or Brevo couldn't be reached)."
              : "No events match your filters."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 640 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Event</th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Recipient</th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Subject</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }} title="How many times we've emailed this contact">Sent</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEvents.map((ev, i) => {
                    const s = eventStyle(ev.event);
                    const eng = engByEmail.get((ev.email || "").toLowerCase());
                    return (
                      <tr key={`${ev.email}-${ev.date}-${i}`} style={{ borderBottom: i < pagedEvents.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                        <td className="px-5 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }} title={ev.reason || s.label}>{s.label}</span>
                        </td>
                        <td className="px-5 py-3 text-sm" style={{ color: "var(--admin-text-secondary)" }}>
                          <span className="truncate inline-block max-w-[220px] align-middle">{ev.email}</span>
                        </td>
                        <td className="px-5 py-3 text-sm" style={{ color: "var(--admin-text-muted)" }}>
                          <span className="truncate inline-block max-w-[260px] align-middle" title={ev.subject}>{ev.subject || "—"}</span>
                        </td>
                        <td
                          className="px-5 py-3 text-right text-sm font-bold whitespace-nowrap"
                          style={{ color: eng && eng.sends > 1 ? "var(--admin-success)" : "var(--admin-text-secondary)" }}
                          title={eng ? `Last sent: ${fmtUnixDate(eng.last_sent)}` : "Not in your contact list"}
                        >
                          {eng ? `${eng.sends}${eng.sends > 1 ? "×" : ""}` : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-xs whitespace-nowrap" style={{ color: "var(--admin-text-muted)" }}>{fmtDateTime(ev.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                {(currentEventPage - 1) * EVENTS_PER_PAGE + 1}–{Math.min(currentEventPage * EVENTS_PER_PAGE, filteredEvents.length)} of {filteredEvents.length} loaded{feedHasMore ? "+" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                  disabled={currentEventPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--admin-hover-bg)"
                  style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <span className="text-xs font-semibold" style={{ color: "var(--admin-text-secondary)" }}>
                  Page {currentEventPage} of {totalEventPages}
                </span>
                <button
                  onClick={() => {
                    // At the end of what's loaded? Pull the next block from Brevo, then advance.
                    if (onLastLoadedPage && feedHasMore) {
                      fetchFeed(false, feedOffset).then(() => setEventPage((p) => p + 1));
                    } else {
                      setEventPage((p) => Math.min(totalEventPages, p + 1));
                    }
                  }}
                  disabled={feedLoading || (currentEventPage >= totalEventPages && !feedHasMore)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--admin-hover-bg)"
                  style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                >
                  {feedLoading ? "Loading…" : "Next"} <ChevronRight size={13} />
                </button>
                {feedHasMore && (
                  <button
                    onClick={() => fetchFeed(false, feedOffset)}
                    disabled={feedLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 hover:scale-[1.02]"
                    style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(99,102,241,0.2)" }}
                    title="Fetch the next block of older events from Brevo"
                  >
                    {feedLoading ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </>
      )}

      {tab === "campaigns" && (
        <div style={card} className="overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Campaign History</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
              Delivered/Clicks/Replies/Opt-Outs per campaign aren&apos;t tracked per-send yet — Opens is.
            </p>
          </div>
          {campaignsLoading ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>No campaigns sent yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Campaign</th>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Status</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Recipients</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Opens</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: i < campaigns.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                      <td className="px-5 py-3 text-sm text-(--admin-text)">
                        <span className="truncate inline-block max-w-[280px] align-middle">{c.subject}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: c.status === "failed" ? "var(--admin-danger-soft)" : "var(--admin-success-soft)", color: c.status === "failed" ? "var(--admin-danger-text)" : "var(--admin-success)" }}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm" style={{ color: "var(--admin-text-secondary)" }}>{c.recipient_count}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: Number(c.unique_opens) > 0 ? "var(--admin-warning)" : "var(--admin-text-faint)" }}>{c.unique_opens ?? 0}</td>
                      <td className="px-5 py-3 text-right text-xs whitespace-nowrap" style={{ color: "var(--admin-text-muted)" }}>{fmtUnixDate(c.sent_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "contacts" && (
        <div style={card} className="overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Contact Engagement</p>
            <input
              value={contactsSearch}
              onChange={(e) => setContactsSearch(e.target.value)}
              placeholder="Search name, email, company…"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.75rem", padding: "0.4rem 0.7rem", outline: "none", width: 220 }}
            />
          </div>
          {filteredContacts.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>
              {data?.contacts.length ? "No contacts match your search." : "No contacts emailed in this window yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Contact</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Sends</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Opens</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Last Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.slice(0, 100).map((c, i) => (
                    <tr key={c.email} style={{ borderBottom: i < Math.min(filteredContacts.length, 100) - 1 ? "1px solid var(--admin-border)" : "none" }}>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-(--admin-text) truncate max-w-[260px]">{c.name}</p>
                        <p className="text-xs truncate max-w-[260px]" style={{ color: "var(--admin-text-faint)" }}>{c.email}{c.company ? ` · ${c.company}` : ""}</p>
                      </td>
                      <td className="px-5 py-3 text-right text-sm" style={{ color: "var(--admin-text-secondary)" }}>{c.sends}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: c.opens > 0 ? "var(--admin-warning)" : "var(--admin-text-faint)" }}>{c.opens}</td>
                      <td className="px-5 py-3 text-right text-xs whitespace-nowrap" style={{ color: "var(--admin-text-muted)" }}>{fmtUnixDate(c.last_sent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredContacts.length > 100 && (
                <p className="px-5 py-3 text-xs" style={{ color: "var(--admin-text-faint)" }}>Showing the first 100 of {filteredContacts.length}.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "replies" && (
        <div className="mx-auto max-w-md rounded-2xl p-10 text-center" style={card}>
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--admin-accent-soft)" }}>
            <Reply size={22} style={{ color: "var(--admin-accent-text)" }} strokeWidth={1.75} />
          </div>
          <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Reply reports — coming with Inbox</p>
          <p className="text-xs mt-2 leading-5" style={{ color: "var(--admin-text-muted)" }}>
            This depends on replies actually being pulled into the app (see the Inbox page). Once that exists, reply rate and reply volume land here.
          </p>
        </div>
      )}
    </div>
  );
}
