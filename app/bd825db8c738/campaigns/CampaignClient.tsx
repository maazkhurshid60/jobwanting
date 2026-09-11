"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Send, Clock, ChevronDown, ChevronLeft, ChevronRight, Users, Trash2, Paperclip, AlertTriangle, Mail, Reply, CheckCircle2, Search, X, MapPin, Check, Pencil, CalendarClock, Layout } from "lucide-react";
import { ToastProvider, toast, Spinner, LoadingOverlay } from "../Toast";
import { isHtmlContent } from "@/lib/emailBuilder";

// The 6-step campaign builder flow. Each step renders a slice of the same
// form state below — nothing is step-local, so switching steps never loses
// what was typed.
const STEPS = [
  { n: 1, label: "Template" },
  { n: 2, label: "Recipients" },
  { n: 3, label: "Subject" },
  { n: 4, label: "Email" },
  { n: 5, label: "Preview" },
  { n: 6, label: "Schedule" },
] as const;

interface Campaign {
  id: number;
  subject: string;
  recipient_count: number;
  status: string;
  target_list: string | null;
  list_id: number | null;
  sent_at: number;
  total_opens: number;
  unique_opens: number;
}

interface RecipientRow {
  id: number;
  email: string;
  name: string;
  title: string;
  company: string;
  city?: string;
  state?: string;
  send_count: number;
  last_sent: number | null;
}

interface ContactList {
  id: number;
  name: string;
  member_count: number;
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Turn raw API/network errors into something a person can act on.
function friendlyError(raw?: string, status?: number): string {
  if (!raw) {
    if (status === 504 || status === 408) return "The send took too long. Some emails may have gone out — check Sent History before resending.";
    return "Something went wrong while sending. Please try again.";
  }
  const r = raw.toLowerCase();
  if (r.includes("no eligible") || r.includes("no contacts")) return "No eligible contacts to send to right now (they may all be suppressed or recently emailed).";
  if (r.includes("subject") && r.includes("body")) return "Please add a subject and a message before sending.";
  if (r.includes("api key") || r.includes("unauthor") || r.includes("smtp") || r.includes("401")) return "The email service isn't configured correctly. Please check the Brevo/SMTP settings.";
  if (r.includes("fetch") || r.includes("network") || r.includes("timeout")) return "Couldn't reach the email service. Please check your connection and try again.";
  return raw; // already a readable server message
}

const inputStyle = {
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  background: "var(--admin-surface-2)",
  borderRadius: "0.75rem",
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
};

const labelStyle = {
  display: "block" as const,
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "0.375rem",
  color: "var(--admin-text-muted)",
};

// Back / Next row shown at the bottom of every step except the last (which
// has its own Send/Schedule actions instead of a generic "Next").
function StepNav({ onBack, onNext, nextLabel }: { onBack?: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex items-center justify-between pt-1">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg)"
          style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
        >
          <ChevronLeft size={14} /> Back
        </button>
      ) : <span />}
      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
        style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}
      >
        Next: {nextLabel} <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function CampaignClient({
  contactCount: initialContactCount,
}: {
  contactCount: number;
  lists: ContactList[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [recipientsEditOpen, setRecipientsEditOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [listId, setListId] = useState<number | null>(null);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contactCount, setContactCount] = useState(initialContactCount);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [sendOffset, setSendOffset] = useState(0);
  const [excludeRecent, setExcludeRecent] = useState(true);
  const [excludeDays, setExcludeDays] = useState(30);
  const [replyTo, setReplyTo] = useState("");
  const [isTestSend, setIsTestSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [historyFilter, setHistoryFilter] = useState<number | "all">("all");

  // "Start from a template" — lets a campaign begin from the Templates
  // library without leaving this page (Templates itself still supports the
  // same handoff via the campaign_draft localStorage key, read on mount below).
  const [templates, setTemplates] = useState<{ id: number; name: string; subject: string; body: string }[]>([]);
  const [previewingTemplate, setPreviewingTemplate] = useState<{ id: number; name: string; subject: string; body: string } | null>(null);

  const [customAttachment, setCustomAttachment] = useState<{ name: string; content: string; size: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bodyIsHtml, setBodyIsHtml] = useState(false);

  // Recipient preview — the actual people this send will go to
  const [showRecipients, setShowRecipients] = useState(false);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds the 5MB limit.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      setCustomAttachment({
        name: file.name,
        content: base64String,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  async function handleDeleteCampaign(id: number) {
    if (!confirm("Delete this campaign record from history?")) return;
    const loadId = toast.loading("Removing campaign…");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchHistory();
        toast.success("Campaign removed from history");
      } else {
        const data = await res.json().catch(() => ({} as { error?: string }));
        toast.error(friendlyError(data.error, res.status));
      }
    } catch {
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      toast.dismiss(loadId);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchLists() {
    const res = await fetch("/api/lists");
    setLists(await res.json());
  }

  async function fetchContactCount() {
    const res = await fetch("/api/contacts/count");
    if (res.ok) {
      const data = await res.json();
      setContactCount(data.count);
    }
  }

  async function fetchTemplates() {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates(await res.json());
  }

  function applyTemplate(t: { id: number; name: string; subject: string; body: string }) {
    if ((subject.trim() || body.trim()) && !confirm(`Load "${t.name}"? This replaces the current subject and email body.`)) {
      return;
    }
    setSubject(t.subject);
    setBody(t.body);
    setBodyIsHtml(isHtmlContent(t.body));
    toast.success(`Loaded "${t.name}"`);
    setPreviewingTemplate(null);
    setStep(2);
  }

  async function fetchHistory(filter: number | "all" = historyFilter) {
    const url = filter === "all" ? "/api/campaigns/send" : `/api/campaigns/send?listId=${filter}`;
    const res = await fetch(url);
    setHistory(await res.json());
  }

  // Refetch history whenever the list filter changes (covers initial load too)
  useEffect(() => { fetchHistory(historyFilter); }, [historyFilter]);

  useEffect(() => {
    fetchLists();
    fetchContactCount();
    fetchTemplates();
    const draft = localStorage.getItem("campaign_draft");
    if (draft) {
      try {
        const { subject: s, body: b, isHtml: h } = JSON.parse(draft);
        setSubject(s ?? "");
        setBody(b ?? "");
        if (typeof h === "boolean") setBodyIsHtml(h);
        localStorage.removeItem("campaign_draft");
        // A template (or scheduled draft) was already chosen on the page that
        // sent us here — skip past the in-wizard template step instead of
        // asking again.
        setStep(2);
      } catch { /* ignore */ }
    }
  }, []);

  const selectedList = lists.find((l) => l.id === listId);
  const recipientCount = listId ? Number(selectedList?.member_count ?? 0) : contactCount;
  // Skip the first `sendOffset` recipients, then send up to `dailyLimit` of the rest.
  const remainingAfterSkip = Math.max(0, recipientCount - sendOffset);
  const sendCount = Math.min(remainingAfterSkip, dailyLimit);

  // Names of attachments that will ride along with this send
  const attachmentNames = [
    ...(customAttachment ? [customAttachment.name] : []),
  ];
  const hasAttachment = attachmentNames.length > 0;

  // Live preview — substitutes sample values and formats exactly like the server:
  // plain text turns newlines into <br>, HTML is used verbatim.
  const previewBodyHtml = (() => {
    const s = { first_name: "Alex", last_name: "Morgan", full_name: "Alex Morgan", title: "Principal Engineer", company: "Acme Corp", email: "alex.morgan@example.com" };
    let out = (body || "")
      .replace(/\{\{first_name\}\}/gi, s.first_name)
      .replace(/\{\{last_name\}\}/gi, s.last_name)
      .replace(/\{\{full_name\}\}/gi, s.full_name)
      .replace(/\{\{name\}\}/gi, s.full_name)
      .replace(/\{\{email\}\}/gi, s.email)
      .replace(/\{\{title\}\}/gi, s.title)
      .replace(/\{\{company\}\}/gi, s.company);
    if (!bodyIsHtml) out = out.trim().replace(/\n/g, "<br />");
    const sigHtml = `<div style="margin-top: 30px; border-top: 1px solid #eeeeee; padding-top: 20px;"><img src="/signature.png" alt="Patrick Novick - CEO, Metro Associates LLC" width="550" style="display: block; max-width: 100%; height: auto; border: 0;" /></div>`;
    return out + sigHtml;
  })();

  async function openRecipients() {
    setShowRecipients(true);
    setRecipientsLoading(true);
    setRecipientSearch("");
    const params = new URLSearchParams();
    if (listId) params.set("listId", String(listId));
    if (excludeRecent) params.set("excludeRecentDays", String(excludeDays));
    params.set("dailyLimit", String(dailyLimit));
    params.set("offset", String(sendOffset));
    try {
      const res = await fetch(`/api/campaigns/recipients?${params.toString()}`);
      const data = await res.json();
      setRecipients(data.recipients ?? []);
    } catch {
      setRecipients([]);
    } finally {
      setRecipientsLoading(false);
    }
  }

  // Split from the form's onSubmit so the step-4 "Send test email" button can
  // trigger the same validation + send path without needing a submit event.
  async function triggerSend() {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body are required"); return; }
    if (isTestSend && !testEmail.trim()) { toast.error("Test email is required"); return; }
    if (!isTestSend && recipientCount === 0) { toast.error("No contacts in selected list"); return; }

    // Test sends stay quick; real campaigns go through the pre-send checklist.
    if (isTestSend) {
      if (!confirm(`Send test email to ${testEmail.trim()}?`)) return;
      doSend();
    } else {
      setShowConfirm(true);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    await triggerSend();
  }

  async function doSend() {
    setShowConfirm(false);
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, body,
          isHtml: bodyIsHtml,
          listId: listId ?? null,
          dailyLimit,
          offset: sendOffset,
          excludeRecentDays: excludeRecent ? excludeDays : null,
          replyTo: replyTo.trim() || null,
          isTestSend,
          testEmail: isTestSend ? testEmail.trim() : null,
          customAttachment: customAttachment ? { name: customAttachment.name, content: customAttachment.content } : null,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string; recipients?: number }));
      if (!res.ok) {
        toast.error(friendlyError(data.error, res.status));
      } else {
        const n = Number(data.recipients ?? 0);
        const failedN = Number(data.failed ?? 0);
        toast.success(
          isTestSend
            ? `Test email sent to ${testEmail.trim()}`
            : `✓ Campaign sent to ${n} recipient${n === 1 ? "" : "s"}${failedN ? ` · ${failedN} failed` : ""}`
        );
        if (!isTestSend) {
          setSubject(""); setBody("");
          setCustomAttachment(null);
          fetchHistory();
        }
      }
    } catch {
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Hands this draft to the Scheduler instead of sending now — same
  // localStorage handoff the Templates page already uses for its own
  // "Schedule" action, so the Scheduler page needs no changes to pick it up.
  function scheduleForLater() {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body are required"); return; }
    localStorage.setItem("scheduler_draft", JSON.stringify({ subject, body, isHtml: bodyIsHtml }));
    router.push("/bd825db8c738/scheduler");
  }

  return (
    <>
    <ToastProvider />
    <LoadingOverlay show={loading} message={isTestSend ? "Sending test email…" : "Sending campaign… this can take a moment"} />

    {/* Pre-send checklist — a last-look before a real campaign goes out */}
    {showConfirm && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--admin-scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
      >
        <div style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", borderRadius: "1.25rem", width: "100%", maxWidth: 460, padding: "1.75rem", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--admin-accent-soft)" }}>
              <Send size={17} style={{ color: "var(--admin-accent-text)" }} />
            </div>
            <div>
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Ready to send?</p>
              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>Quick check before this goes out.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mb-5">
            {/* Recipients */}
            <div className="flex items-start gap-2.5">
              <Users size={15} className="mt-0.5 shrink-0" style={{ color: "#7dd3fc" }} />
              <p className="text-sm" style={{ color: "var(--admin-text-secondary)" }}>
                Sending to <strong className="text-(--admin-text)">{sendCount}</strong> {sendCount === 1 ? "contact" : "contacts"}
                <span style={{ color: "var(--admin-text-muted)" }}> (#{sendOffset + 1}–#{sendOffset + sendCount} of {recipientCount} · {listId ? lists.find((l) => l.id === listId)?.name : "all active contacts"})</span>
              </p>
            </div>
            {/* Subject */}
            <div className="flex items-start gap-2.5">
              <Mail size={15} className="mt-0.5 shrink-0" style={{ color: "var(--admin-success)" }} />
              <p className="text-sm truncate" style={{ color: "var(--admin-text-secondary)" }} title={subject}>
                Subject: <span className="text-(--admin-text)">{subject.trim() || "—"}</span>
              </p>
            </div>
            {/* Reply-to */}
            <div className="flex items-start gap-2.5">
              <Reply size={15} className="mt-0.5 shrink-0" style={{ color: "var(--admin-accent-text)" }} />
              <p className="text-sm" style={{ color: "var(--admin-text-secondary)" }}>
                Replies go to <span className="text-(--admin-text)">{replyTo.trim() || "patrick@metroassoc.com"}</span>
              </p>
            </div>
            {/* Attachment — highlighted when missing */}
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style={ hasAttachment
                ? { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }
                : { background: "var(--admin-warning-soft)", border: "1px solid rgba(245,158,11,0.2)" } }
            >
              {hasAttachment
                ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: "var(--admin-success)" }} />
                : <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--admin-warning)" }} />}
              <div className="min-w-0">
                {hasAttachment ? (
                  <p className="text-sm" style={{ color: "var(--admin-text)" }}>
                    <Paperclip size={12} className="inline mb-0.5" /> Attaching: <span className="text-(--admin-text)">{attachmentNames.join(", ")}</span>
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: "var(--admin-warning)" }}>
                    No attachment added — send without one?
                  </p>
                )}
              </div>
            </div>
            {/* Skip-recent reminder */}
            {excludeRecent && (
              <p className="text-xs pl-1" style={{ color: "var(--admin-text-muted)" }}>
                Skipping anyone emailed in the last {excludeDays} day{excludeDays === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg)"
              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
            >
              Back
            </button>
            <button
              onClick={doSend}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{ background: "var(--admin-accent)" }}
            >
              <Send size={14} /> Send now
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Recipient preview — the actual people this send resolves to */}
    {showRecipients && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--admin-scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowRecipients(false); }}
      >
        <div style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", borderRadius: "1.25rem", width: "100%", maxWidth: 620, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}>
          <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div>
              <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
                Recipients for this send {!recipientsLoading && <span style={{ color: "var(--admin-text-muted)" }}>· {recipients.length}</span>}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                Exactly who gets this email with the current settings, and how many times we&apos;ve emailed each before.
              </p>
            </div>
            <button onClick={() => setShowRecipients(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-(--admin-hover-bg) shrink-0" style={{ color: "var(--admin-text-muted)" }}>
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div className="relative">
              <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)" }} />
              <input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Search name, email, company…"
                style={{ ...inputStyle, paddingLeft: "2.2rem", fontSize: "0.8rem" }}
              />
            </div>
          </div>

          <div style={{ overflowY: "auto" }}>
            {recipientsLoading ? (
              <div className="py-16 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>Resolving recipients…</div>
            ) : (() => {
              const rq = recipientSearch.trim().toLowerCase();
              const shown = recipients.filter((r) =>
                !rq || r.email.toLowerCase().includes(rq) || (r.name || "").toLowerCase().includes(rq) || (r.company || "").toLowerCase().includes(rq)
              );
              if (shown.length === 0) {
                return <div className="py-16 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>{recipients.length === 0 ? "No eligible recipients for these settings." : "No recipients match your search."}</div>;
              }
              return shown.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderBottom: i < shown.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}>
                      {(r.name || r.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-(--admin-text) truncate">{r.name || r.email}</p>
                      <p className="text-xs truncate" style={{ color: "var(--admin-text-muted)" }}>
                        {r.name ? r.email : ""}
                        {(r.title || r.company) && <>{r.name ? " · " : ""}{[r.title, r.company].filter(Boolean).join(" at ")}</>}
                      </p>
                      {[r.city, r.state].filter(Boolean).length > 0 && (
                        <p className="text-xs flex items-center gap-1" style={{ color: "var(--admin-text-faint)" }}>
                          <MapPin size={9} /> {[r.city, r.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {r.send_count > 0 ? (
                      <>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
                          sent {r.send_count}×
                        </span>
                        {r.last_sent && (
                          <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
                            last {new Date(r.last_sent * 1000).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)" }}>first time</span>
                    )}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Composer */}
      <div className="lg:col-span-2 rounded-2xl p-5 sm:p-7" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>New Campaign</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-7 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const isActive = step === s.n;
            const isDone = step > s.n;
            return (
              <div key={s.n} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(s.n)}
                  className="flex items-center gap-2 shrink-0"
                  title={s.label}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                    style={
                      isActive
                        ? { background: "#3b82f6", color: "#fff" }
                        : isDone
                        ? { background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.4)" }
                        : { background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)" }
                    }
                  >
                    {isDone ? <Check size={12} /> : s.n}
                  </span>
                  <span
                    className="text-xs font-semibold hidden sm:inline"
                    style={{ color: isActive ? "#fff" : isDone ? "#60a5fa" : "var(--admin-text-muted)" }}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="w-5 sm:w-10 h-px shrink-0 mx-1.5 sm:mx-2.5" style={{ background: "var(--admin-border)" }} />
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-5">
          {/* STEP 1 — Template */}
          {step === 1 && (
            <>
              <div>
                <p style={labelStyle}>Start from a template</p>
                <p className="text-xs mt-1 mb-3" style={{ color: "var(--admin-text-faint)" }}>
                  Pick a saved template to pre-fill the subject and email, or skip and start from scratch.
                </p>
                {templates.length === 0 ? (
                  <div className="rounded-xl p-6 text-center flex flex-col items-center gap-2" style={{ background: "var(--admin-surface-2)", border: "1px dashed var(--admin-border)" }}>
                    <Layout size={20} className="text-(--admin-text-faint)" strokeWidth={1.5} />
                    <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>No saved templates yet — skip ahead and write this one from scratch.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {templates.map((t) => (
                      <div key={t.id} className="rounded-xl p-4 flex flex-col gap-2.5" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate text-(--admin-text)">{t.name}</p>
                          <p className="text-xs truncate mt-0.5" style={{ color: "var(--admin-text-faint)" }}>{t.subject || "No subject"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewingTemplate(t)}
                            className="flex-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                            style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => applyTemplate(t)}
                            className="flex-1 px-3 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:scale-[1.02]"
                            style={{ background: "var(--admin-accent)" }}
                          >
                            Use this
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <StepNav onNext={() => setStep(2)} nextLabel="Recipients" />
            </>
          )}

          {/* STEP 2 — Recipients */}
          {step === 2 && (
            <>
              {/* Send to — summary + inline edit */}
              <div className="rounded-xl p-4" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p style={labelStyle}>Send to</p>
                    <p className="text-sm text-(--admin-text) font-medium">
                      {listId ? `${lists.find(l => l.id === listId)?.name} (${Number(lists.find(l => l.id === listId)?.member_count)})` : `All active contacts (${contactCount})`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecipientsEditOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold shrink-0"
                    style={{ color: "var(--admin-warning)" }}
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </div>

                {recipientsEditOpen && (
                  <div className="mt-4 pt-4 flex flex-col gap-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
                    <div>
                      <label style={labelStyle}>List</label>
                      <div className="relative" ref={dropdownRef}>
                        <button
                          type="button"
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          className="flex items-center justify-between w-full"
                          style={{ ...inputStyle, cursor: "pointer", textAlign: "left" }}
                        >
                          <span>{listId ? `${lists.find(l => l.id === listId)?.name} (${Number(lists.find(l => l.id === listId)?.member_count)})` : `All active contacts (${contactCount})`}</span>
                          <ChevronDown size={14} style={{ color: "var(--admin-text-faint)", flexShrink: 0, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                        </button>
                        {dropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                            <div
                              className="px-4 py-2.5 text-sm cursor-pointer transition-colors"
                              style={{ color: listId === null ? "var(--admin-text)" : "var(--admin-text-secondary)", background: listId === null ? "var(--admin-accent-soft)" : "transparent" }}
                              onMouseEnter={e => { if (listId !== null) (e.currentTarget as HTMLDivElement).style.background = "var(--admin-hover-bg)"; }}
                              onMouseLeave={e => { if (listId !== null) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                              onClick={() => { setListId(null); setDropdownOpen(false); }}
                            >
                              All active contacts ({contactCount})
                            </div>
                            {lists.map((l) => (
                              <div
                                key={l.id}
                                className="px-4 py-2.5 text-sm cursor-pointer transition-colors"
                                style={{ color: listId === l.id ? "var(--admin-text)" : "var(--admin-text-secondary)", background: listId === l.id ? "var(--admin-accent-soft)" : "transparent", borderTop: "1px solid var(--admin-border)" }}
                                onMouseEnter={e => { if (listId !== l.id) (e.currentTarget as HTMLDivElement).style.background = "var(--admin-hover-bg)"; }}
                                onMouseLeave={e => { if (listId !== l.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                                onClick={() => { setListId(l.id); setDropdownOpen(false); }}
                              >
                                {l.name} ({Number(l.member_count)})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={labelStyle}>Batch size (send)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          style={inputStyle}
                          value={dailyLimit}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^0-9]/g, "");
                            setDailyLimit(digits === "" ? 0 : Math.min(1500, Number(digits)));
                          }}
                          onBlur={() => setDailyLimit((v) => Math.max(1, Math.min(1500, v || 1)))}
                          title="How many to send this run (1–1500)."
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Skip first</label>
                        <div className="flex items-stretch gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSendOffset((o) => Math.max(0, o - (dailyLimit || 1)))}
                            disabled={sendOffset === 0}
                            className="shrink-0 w-9 rounded-xl text-lg font-bold transition-colors hover:bg-(--admin-hover-bg) disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
                            title="Back one batch"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            style={{ ...inputStyle, textAlign: "center" }}
                            value={sendOffset}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^0-9]/g, "");
                              setSendOffset(digits === "" ? 0 : Number(digits));
                            }}
                            title="Skip this many recipients from the top, then send the next batch. Use − / + to jump one batch at a time."
                          />
                          <button
                            type="button"
                            onClick={() => setSendOffset((o) => o + (dailyLimit || 1))}
                            className="shrink-0 w-9 rounded-xl text-lg font-bold transition-colors hover:bg-(--admin-hover-bg)"
                            style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
                            title="Forward one batch"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>Skip recently emailed</span>
                      <div
                        className="relative w-8 h-4 rounded-full transition-colors"
                        style={{ background: excludeRecent ? "rgba(99,102,241,0.6)" : "var(--admin-hover-bg)" }}
                        onClick={() => setExcludeRecent(!excludeRecent)}
                      >
                        <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: excludeRecent ? "calc(100% - 14px)" : "2px" }} />
                      </div>
                      {excludeRecent && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--admin-text-muted)" }}>
                          in last
                          <input
                            type="text"
                            inputMode="numeric"
                            value={excludeDays}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^0-9]/g, "");
                              setExcludeDays(digits === "" ? 0 : Math.min(90, Number(digits)));
                            }}
                            onBlur={() => setExcludeDays((v) => Math.max(1, Math.min(90, v || 1)))}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: "42px", background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "6px", color: "var(--admin-text)", padding: "1px 6px", fontSize: "0.75rem", outline: "none", textAlign: "center" }}
                          />
                          days
                        </span>
                      )}
                    </label>
                  </div>
                )}
              </div>

              {/* Exclude — the baseline is always on; only "recently emailed" is editable (above) */}
              <div className="rounded-xl p-4" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <p style={labelStyle}>Exclude</p>
                <p className="text-sm text-(--admin-text) font-medium">
                  Unsubscribed, Bounced, Suppressed{excludeRecent ? `, emailed in the last ${excludeDays}d` : ""}
                </p>
              </div>

              {/* Recipient count + who-gets-this preview */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl flex-wrap gap-2" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <div className="flex items-center gap-2">
                  <Users size={13} style={{ color: "var(--admin-text-faint)" }} />
                  <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                    {sendCount === 0 ? (
                      <>Nothing to send — &ldquo;skip first&rdquo; ({sendOffset}) is past the {recipientCount} recipient{recipientCount !== 1 ? "s" : ""}</>
                    ) : (
                      <>
                        Will send to <strong className="text-(--admin-text)">{sendCount}</strong> contact{sendCount !== 1 ? "s" : ""}
                        {" "}(#{sendOffset + 1}–#{sendOffset + sendCount} of {recipientCount})
                        {recipientCount > sendOffset + sendCount && (
                          <span style={{ color: "var(--admin-text-faint)" }}> · {recipientCount - sendOffset - sendCount} remaining after this batch</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={openRecipients}
                  disabled={sendCount === 0}
                  className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "#7dd3fc" }}
                >
                  <Users size={12} /> Preview recipients &amp; send history
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p style={labelStyle}>Est. recipients</p>
                  <p className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)", color: "var(--admin-text)" }}>{recipientCount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                    style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                  >
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
                    style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}
                  >
                    Next: Subject <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STEP 3 — Subject */}
          {step === 3 && (
            <>
              <div>
                <label style={labelStyle}>Subject</label>
                <input style={inputStyle} type="text" placeholder="Email subject line" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
                <p className="text-xs mt-1.5" style={{ color: "var(--admin-text-faint)" }}>
                  Personalize with {"{{first_name}}"}, {"{{title}}"}, or {"{{company}}"} — these also work in the body.
                </p>
              </div>
              <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Email" />
            </>
          )}

          {/* STEP 4 — Email */}
          {step === 4 && (
            <>
              {/* Reply-to */}
              <div>
                <label style={labelStyle}>
                  Reply-to email <span style={{ color: "var(--admin-text-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — replies land here)</span>
                </label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="patrick@metroassoc.com (default)"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                />
              </div>

              {/* Attachments */}
              <div className="flex flex-col gap-3.5 p-4 rounded-2xl" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-(--admin-text)">Campaign Attachments</span>
                  <span className="text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Attach a document to this email campaign</span>
                </div>
                <div className="flex flex-col gap-3 pt-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
                  <div className="flex flex-col gap-2">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Attach a file</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="text-xs text-white/55 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 cursor-pointer"
                      />
                      {customAttachment && (
                        <button
                          type="button"
                          onClick={() => setCustomAttachment(null)}
                          className="text-xs text-red-400 hover:text-red-300 font-semibold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {customAttachment && (
                      <p className="text-[10px] text-emerald-400">
                        Selected: {customAttachment.name} ({Math.round(customAttachment.size / 1024)} KB)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    Body <span style={{ color: "var(--admin-text-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(use {"{{first_name}}"}, {"{{title}}"}, {"{{company}}"} etc.)</span>
                  </label>
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--admin-hover-bg)" }}>
                    {([["Plain text", false], ["HTML", true]] as [string, boolean][]).map(([lbl, val]) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setBodyIsHtml(val)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                        style={{ background: bodyIsHtml === val ? "var(--admin-accent-soft)" : "transparent", color: bodyIsHtml === val ? "var(--admin-accent-text)" : "var(--admin-text-muted)" }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: "240px", resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }}
                  placeholder={bodyIsHtml
                    ? "<p>Hi {{first_name}},</p>\n<p>I saw you are a {{title}} at {{company}}…</p>\n<p>Best,<br/>Patrick</p>"
                    : "Hi {{first_name}},\n\nI saw you are a {{title}} at {{company}}...\n\nBest,\nPatrick"}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                {bodyIsHtml && (
                  <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
                    HTML mode: your markup is sent as-is (newlines are not auto-converted). The standard header/footer &amp; unsubscribe link are still added.
                  </p>
                )}
              </div>

              <StepNav onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Preview" />
            </>
          )}

          {/* STEP 5 — Preview & test */}
          {step === 5 && (
            <>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                <div className="px-3 py-1.5 text-xs font-semibold flex items-center justify-between" style={{ background: "var(--admin-surface-2)", color: "var(--admin-text-muted)" }}>
                  <span>Preview — sample contact (Alex Morgan · Principal Engineer · Acme Corp)</span>
                  <span style={{ color: "var(--admin-text-faint)" }}>{bodyIsHtml ? "HTML" : "Plain text"}</span>
                </div>
                {/* Rendered-email canvas — simulates the recipient's inbox view; kept as
                    a literal white surface with fixed text colors regardless of admin theme. */}
                <div style={{ background: "#ffffff", padding: "24px", maxHeight: 420, overflowY: "auto" }}>
                  <div className="text-sm mb-1" style={{ color: "#111", fontWeight: 600 }}>{subject.trim() || "(no subject yet)"}</div>
                  <div style={{ borderTop: "1px solid #eee", margin: "8px 0 16px" }} />
                  {body.trim() ? (
                    <div style={{ color: "#1a1a1a", fontSize: "15px", lineHeight: 1.7, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" }}
                      dangerouslySetInnerHTML={{ __html: previewBodyHtml }} />
                  ) : (
                    <div style={{ color: "#999", fontSize: "14px" }}>Start typing the body to see it here…</div>
                  )}
                  {hasAttachment && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #eee", color: "#666", fontSize: "12px" }}>
                      📎 {attachmentNames.join(", ")}
                    </div>
                  )}
                  <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee", textAlign: "center", color: "#999", fontSize: "11px" }}>
                    Metro Associates, LLC • 1317 Edgewater Drive #4452, Orlando, FL 32804<br />
                    <span style={{ textDecoration: "underline" }}>Unsubscribe</span>
                  </div>
                </div>
              </div>

              {/* Send a real test to your own inbox before committing */}
              <div className="flex flex-col gap-2.5 p-4 rounded-2xl" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isTestSend}
                    onChange={(e) => {
                      setIsTestSend(e.target.checked);
                      if (e.target.checked && !testEmail) {
                        setTestEmail("patrick@metroassoc.com");
                      }
                    }}
                    className="w-4 h-4 rounded border-(--admin-border) bg-(--admin-surface-2) accent-indigo-500 shrink-0"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-(--admin-text)">Send a test email first</span>
                    <span className="text-[10px]" style={{ color: "var(--admin-text-muted)" }}>Doesn&apos;t write a log entry to sent history</span>
                  </div>
                </label>
                {isTestSend && (
                  <div className="mt-1 pt-2 flex flex-col gap-2.5" style={{ borderTop: "1px solid var(--admin-border)" }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: "0.25rem" }}>Test Email Address</label>
                      <input
                        style={inputStyle}
                        type="email"
                        placeholder="e.g. patrick@metroassoc.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={triggerSend}
                      disabled={loading}
                      className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                      style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                    >
                      {loading ? <Spinner size={12} /> : <Send size={12} />} Send Test Email
                    </button>
                  </div>
                )}
              </div>

              <StepNav onBack={() => setStep(4)} onNext={() => setStep(6)} nextLabel="Schedule" />
            </>
          )}

          {/* STEP 6 — Schedule / Send */}
          {step === 6 && (
            <>
              <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                <p style={labelStyle}>Ready to go</p>
                <p className="text-sm" style={{ color: "var(--admin-text-secondary)" }}>
                  <strong className="text-(--admin-text)">{sendCount}</strong> recipient{sendCount !== 1 ? "s" : ""} · subject &ldquo;{subject.trim() || "—"}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="submit"
                  disabled={loading || (!isTestSend && recipientCount === 0)}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
                >
                  {loading ? <Spinner size={14} /> : <Send size={14} />}
                  {loading ? "Sending…" : `Send now to ${sendCount} contacts`}
                </button>
                <button
                  type="button"
                  onClick={scheduleForLater}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  <CalendarClock size={14} /> Schedule for later
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep(5)}
                className="self-start flex items-center gap-1.5 text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg) px-4 py-2.5 rounded-full"
                style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            </>
          )}
        </form>
      </div>

      {/* History */}
      <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <div className="flex items-center gap-2 px-5 py-4 flex-wrap" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <Clock size={14} style={{ color: "var(--admin-text-faint)" }} />
          <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Sent History</p>
          <select
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="ml-auto"
            style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.5rem", color: "var(--admin-text)", fontSize: "0.72rem", padding: "0.25rem 0.5rem", outline: "none", cursor: "pointer", maxWidth: 160 }}
            title="Filter sent history by list"
          >
            <option value="all" style={{ background: "var(--admin-surface)" }}>All lists</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
            ))}
          </select>
        </div>

        {history.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12 text-center px-4">
            <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>No campaigns sent yet.</p>
          </div>
        ) : (
          <div className="overflow-y-auto">
            {history.map((c, i) => (
              <div
                key={c.id}
                className="px-5 py-4 relative group"
                style={{ borderBottom: i < history.length - 1 ? "1px solid var(--admin-border)" : "none" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-(--admin-text) mb-1.5 truncate">{c.subject}</p>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: c.status === "failed" ? "var(--admin-danger-soft)" : "var(--admin-success-soft)", color: c.status === "failed" ? "var(--admin-danger-text)" : "var(--admin-success)" }}>
                        {c.status}
                      </span>
                      <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>{c.recipient_count} sent</span>
                      {Number(c.unique_opens) > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)" }}>
                          {c.unique_opens} opened
                        </span>
                      )}
                      {c.target_list && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}>
                          {c.target_list}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>{formatDate(c.sent_at)}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteCampaign(c.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete campaign log"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Template preview modal — mirrors the one on the Templates page */}
    {previewingTemplate && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
        onClick={() => setPreviewingTemplate(null)}
      >
        <div
          className="relative w-full flex flex-col"
          style={{ maxWidth: "680px", maxHeight: "90vh", background: "var(--admin-surface)", borderRadius: "1rem", border: "1px solid var(--admin-border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div>
              <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>{previewingTemplate.name}</p>
              <p className="text-xs mt-0.5 text-(--admin-text-muted)">Subject: {previewingTemplate.subject || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applyTemplate(previewingTemplate)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-[1.02]"
                style={{ background: "var(--admin-accent)", color: "#fff" }}
              >
                Use this template
              </button>
              <button
                onClick={() => setPreviewingTemplate(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)"
                style={{ color: "var(--admin-text-muted)" }}
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="overflow-auto flex-1 p-4">
            {isHtmlContent(previewingTemplate.body) ? (
              <iframe
                title="Template preview"
                srcDoc={previewingTemplate.body.replace(
                  /https:\/\/patricknovick\.com\//g,
                  (typeof window !== "undefined" ? window.location.origin : "https://patricknovick.com") + "/"
                )}
                sandbox=""
                style={{ width: "100%", height: "70vh", border: 0, borderRadius: "0.5rem", background: "#fff", display: "block" }}
              />
            ) : (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "'Georgia', serif",
                  fontSize: "14px",
                  lineHeight: "1.8",
                  color: "#1a1a2e",
                  background: "#fff",
                  borderRadius: "0.5rem",
                  padding: "32px 40px",
                  margin: 0,
                  minHeight: "400px",
                }}
              >
                {previewingTemplate.body}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
