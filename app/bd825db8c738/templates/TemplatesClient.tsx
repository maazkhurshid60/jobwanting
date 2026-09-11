"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Edit2, Check, X, Copy, Layout, Send, Eye, Clock, Search, ChevronDown } from "lucide-react";
import { METRO_CLIENT_OUTREACH, METRO_MEP_OUTREACH, METRO_NYC_EMPLOYER_OUTREACH } from "@/lib/seedTemplates";
import { TEMPLATE_CATEGORIES, categoryMeta } from "@/lib/templateCategories";
import { isHtmlContent } from "@/lib/emailBuilder";

interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  updated_at: number;
  list_id: number | null;
  category: string;
}

interface ContactList {
  id: number;
  name: string;
}

const SIGNATURE = `

Best,

Patrick`;

const STARTER_TEMPLATES = [
  // Full HTML templates (the campaign sender delivers them as-is).
  METRO_CLIENT_OUTREACH,
  METRO_MEP_OUTREACH,
  METRO_NYC_EMPLOYER_OUTREACH,
  {  
    name: "CT Engineering — Email 1",
    subject: "engineering hiring in Connecticut",
    body: `Hi {{first_name}},

I work with Metro Associates placing civil, transportation, structural, and inspection engineers throughout Connecticut. Over the past year we have placed professionals on CTDOT projects, bridge rehab work, and water and wastewater infrastructure.

If your team anticipates any hiring in the next 30 to 90 days — even for hard-to-fill roles — I would be glad to share what we are seeing in the market.

Worth a quick call?
${SIGNATURE}`,
  },
  {
    name: "CT Engineering — Email 2",
    subject: "following up",
    body: `Hi {{first_name}},

Just wanted to follow up on my last note. We are currently representing several engineers and inspectors in Connecticut who are not on job boards — they are only available through direct recruiter contact.

If timing is not right, no problem. But if you have anything in the pipeline, I would welcome a 10-minute conversation.
${SIGNATURE}`,
  },
  {
    name: "CT Engineering — Email 3",
    subject: "one more thought",
    body: `Hi {{first_name}},

I have reached out a couple of times about engineering and inspection talent in Connecticut. I do not want to clutter your inbox, but wanted to mention — a lot of our placements happen before any urgent opening exists.

If succession planning, upcoming projects, or specialized roles are on your radar in the next few months, I am happy to have a brief conversation.

Otherwise, I will stop reaching out and wish you well.
${SIGNATURE}`,
  },
  {
    name: "CT Engineering — Email 4",
    subject: "quick question",
    body: `Hi {{first_name}},

Would it be useful if I occasionally sent a short note when a strong engineer or inspector becomes available in Connecticut — even if you are not actively hiring?

A simple reply is all it takes. No pressure if the timing is not right.
${SIGNATURE}`,
  },
];

const inputStyle = {
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  background: "var(--admin-surface-2)",
  borderRadius: "0.75rem",
  padding: "0.625rem 1rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
};

export default function TemplatesClient() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);

  async function fetchTemplates() {
    const res = await fetch("/api/templates");
    setTemplates(await res.json());
  }

  async function fetchLists() {
    const res = await fetch("/api/lists");
    if (res.ok) setLists(await res.json());
  }

  useEffect(() => { fetchTemplates(); fetchLists(); }, []);

  const listName = (id: number | null) => (id == null ? null : lists.find((l) => l.id === id)?.name ?? null);
  const shownTemplates = templates.filter((t) => {
    if (categoryFilter !== "all" && (t.category || "general") !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !t.name.toLowerCase().includes(q) && !t.subject.toLowerCase().includes(q)) return false;
    return true;
  });

  async function handleDelete(id: number) {
    if (!confirm("Delete this template?")) return;
    await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTemplates();
  }

  async function handleStarter(t: typeof STARTER_TEMPLATES[0]) {
    // Don't create a second copy if a template with this name already exists.
    if (templates.some((x) => x.name === t.name)) return;
    setLoading(true);
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t.name, subject: t.subject, body: t.body }),
    });
    fetchTemplates();
    setLoading(false);
  }

  function copyBody(id: number, body: string) {
    navigator.clipboard.writeText(body);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function applyTemplate(t: Template) {
    localStorage.setItem("campaign_draft", JSON.stringify({
      subject: t.subject,
      body: t.body,
      isHtml: isHtmlContent(t.body),
    }));
    router.push("/bd825db8c738/campaigns");
  }

  function scheduleTemplate(t: Template) {
    localStorage.setItem("scheduler_draft", JSON.stringify({
      subject: t.subject,
      body: t.body,
      isHtml: isHtmlContent(t.body),
    }));
    router.push("/bd825db8c738/scheduler");
  }

  return (
    <div>
      {/* Starter templates banner */}
      {templates.length === 0 && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "rgba(124,58,237,0.1)" }}>
              <Layout size={20} style={{ color: "#c4b5fd" }} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-bold text-(--admin-text) mb-1" style={{ fontFamily: "var(--font-heading)" }}>No templates yet</p>
            <p className="text-xs mb-5 text-(--admin-text-faint)">
              Use a starter or create your own. Plain text only — best for deliverability. Use{" "}
              <code style={{ background: "var(--admin-hover-bg)", padding: "1px 5px", borderRadius: 4 }}>{"{{first_name}}"}</code>,{" "}
              <code style={{ background: "var(--admin-hover-bg)", padding: "1px 5px", borderRadius: 4 }}>{"{{title}}"}</code>, or{" "}
              <code style={{ background: "var(--admin-hover-bg)", padding: "1px 5px", borderRadius: 4 }}>{"{{company}}"}</code>{" "}
              for personalization.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTER_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => handleStarter(t)}
                  disabled={loading}
                  className="px-4 py-2 rounded-full text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                >
                  + {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: category filter, search, New Template (opens the dedicated editor page) */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", fontSize: "0.8rem", padding: "0.55rem 0.9rem", borderRadius: "0.75rem", cursor: "pointer" }}
          >
            <option value="all" style={{ background: "var(--admin-surface)" }}>All Categories</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} style={{ background: "var(--admin-surface)" }}>{c.label}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-(--admin-text-faint)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              style={{ ...inputStyle, width: "220px", paddingLeft: "2.25rem", fontSize: "0.8rem" }}
            />
          </div>
          <p className="text-xs text-(--admin-text-faint)">
            {shownTemplates.length} template{shownTemplates.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/bd825db8c738/templates/new")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02]"
          style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}
        >
          <Plus size={14} /> New Template
        </button>
      </div>

      {/* Template library — expandable rows, grouped visually by category badge */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        {shownTemplates.length === 0 ? (
          <p className="py-14 text-center text-sm text-(--admin-text-faint)">
            No templates match your filters.
          </p>
        ) : (
          shownTemplates.map((t, i) => {
            const cat = categoryMeta(t.category);
            const isOpen = expandedId === t.id;
            return (
              <div key={t.id} style={{ borderBottom: i < shownTemplates.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : t.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-(--admin-hover-bg)"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cat.bg }}>
                    <Layout size={14} style={{ color: cat.color }} strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-semibold text-(--admin-text) truncate flex-1 min-w-0">{t.name}</p>
                  <span
                    className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: cat.bg, color: cat.color }}
                  >
                    {cat.label}
                  </span>
                  <ChevronDown
                    size={15}
                    style={{ color: "var(--admin-text-faint)", transform: isOpen ? "rotate(180deg)" : "rotate(-90deg)", transition: "transform 150ms" }}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 flex flex-col gap-3">
                    <p className="text-xs text-(--admin-text-muted)">Subject: {t.subject}</p>
                    {listName(t.list_id) && (
                      <span className="self-start text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)" }}>
                        List: {listName(t.list_id)}
                      </span>
                    )}
                    <pre
                      className="text-xs rounded-xl p-3 overflow-hidden"
                      style={{ background: "var(--admin-surface-2)", color: "var(--admin-text-faint)", maxHeight: "72px", whiteSpace: "pre-wrap", wordBreak: "break-all", border: "1px solid var(--admin-border)" }}
                    >
                      {t.body.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}…
                    </pre>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => applyTemplate(t)}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.01]"
                        style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(99,102,241,0.2)" }}
                      >
                        <Send size={11} /> Use in Campaign
                      </button>
                      <button
                        onClick={() => scheduleTemplate(t)}
                        className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.01]"
                        style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
                      >
                        <Clock size={11} /> Schedule
                      </button>
                      <button
                        onClick={() => setPreviewing(t)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-(--admin-text-secondary) transition-all hover:bg-(--admin-hover-bg) hover:text-(--admin-text)"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => copyBody(t.id, t.body)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg) ${
                          copied === t.id ? "text-emerald-400" : "text-(--admin-text-secondary) hover:text-(--admin-text)"
                        }`}
                        title="Copy HTML"
                      >
                        {copied === t.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => router.push(`/bd825db8c738/templates/${t.id}`)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-(--admin-text-secondary) transition-all hover:bg-(--admin-hover-bg) hover:text-(--admin-text)"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-(--admin-text-secondary) transition-all hover:bg-red-500/15 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Preview modal */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
          onClick={() => setPreviewing(null)}
        >
          <div
            className="relative w-full flex flex-col"
            style={{ maxWidth: "680px", maxHeight: "90vh", background: "var(--admin-surface)", borderRadius: "1rem", border: "1px solid var(--admin-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div>
                <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>{previewing.name}</p>
                <p className="text-xs mt-0.5 text-(--admin-text-muted)">Subject: {previewing.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { applyTemplate(previewing); setPreviewing(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-[1.02]"
                  style={{ background: "var(--admin-accent)", color: "#fff" }}
                >
                  <Send size={11} /> Use in Campaign
                </button>
                <button
                  onClick={() => { scheduleTemplate(previewing); setPreviewing(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  <Clock size={11} /> Schedule
                </button>
                <button
                  onClick={() => setPreviewing(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)"
                  style={{ color: "var(--admin-text-muted)" }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            {/* Preview: render HTML templates as the actual email; show plain-text
                templates as formatted text with the signature. */}
            <div className="overflow-auto flex-1 p-4">
              {isHtmlContent(previewing.body) ? (
                <iframe
                  title="Email preview"
                  srcDoc={previewing.body.replace(
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
                  <div style={{ marginBottom: "30px" }}>
                    {previewing.body}
                  </div>
                  <div style={{ borderTop: "1px solid #eeeeee", paddingTop: "20px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/signature.png"
                      alt="Patrick Novick - CEO, Metro Associates LLC"
                      width="550"
                      style={{ display: "block", maxWidth: "100%", height: "auto", border: 0 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Starter buttons when templates exist */}
      {templates.length > 0 && (
        <div className="mt-5 pt-5 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <p className="w-full text-xs mb-1 text-(--admin-text-faint)">Add starter templates:</p>
          {STARTER_TEMPLATES.map((t) => {
            const added = templates.some((x) => x.name === t.name);
            return (
              <button
                key={t.name}
                onClick={() => handleStarter(t)}
                disabled={loading || added}
                title={added ? "Already in your templates" : undefined}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed inline-flex items-center gap-1"
                style={added
                  ? { background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid rgba(34,197,94,0.25)" }
                  : { background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)", opacity: loading ? 0.5 : 1 }}
              >
                {added ? <><Check size={12} /> {t.name} — added</> : <>+ {t.name}</>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
