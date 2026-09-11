"use client";

// Full-page template editor (create + edit). Builder-made templates reopen in the
// branded field builder; everything else uses the raw-body editor with a live
// preview beside it. Reached at /bd825db8c738/templates/new and .../templates/[id].

import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Wand2, Code, Loader2 } from "lucide-react";
import { buildMetroEmail, DEFAULT_BUILDER, DEFAULT_FOOTER, EmailBuilderInput, FooterSettings } from "@/lib/emailBuilder";
import EmailBuilderFields from "../EmailBuilderFields";
import { TEMPLATE_CATEGORIES } from "@/lib/templateCategories";

interface ContactList { id: number; name: string }
interface Template {
  id: number; name: string; subject: string; body: string;
  list_id: number | null; builder_json?: string | null; category?: string | null;
}

// A body carrying its own HTML document/markup previews as rendered HTML.
const isHtmlTemplate = (s: string) =>
  /<!doctype html|<html[\s>]|<(table|div|p|a|img|span|body)[\s>]/i.test(s);

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

export default function TemplateEditor({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";

  const [lists, setLists] = useState<ContactList[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [notFound, setNotFound] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hasBuilderJson, setHasBuilderJson] = useState(false);

  const [mode, setMode] = useState<"builder" | "blank">(isNew ? "builder" : "blank");
  const [builder, setBuilder] = useState<EmailBuilderInput>(DEFAULT_BUILDER);
  const [footer, setFooter] = useState<FooterSettings>(DEFAULT_FOOTER);
  const [form, setForm] = useState<{ name: string; subject: string; body: string; list_id: number | null; category: string }>({ name: "", subject: "", body: "", list_id: null, category: "general" });
  const [loading, setLoading] = useState(false);

  const builderHtml = useMemo(() => buildMetroEmail(builder, footer), [builder, footer]);
  const setB = (patch: Partial<EmailBuilderInput>) => setBuilder((b) => ({ ...b, ...patch }));
  const setF = (patch: Partial<FooterSettings>) => setFooter((f) => ({ ...f, ...patch }));

  useEffect(() => {
    fetch("/api/lists").then((r) => (r.ok ? r.json() : [])).then(setLists).catch(() => {});
    // Same global footer used everywhere else — see /bd825db8c738/footer-settings.
    fetch("/api/footer-settings").then((r) => (r.ok ? r.json() : null)).then((f) => f && setFooter({ ...DEFAULT_FOOTER, ...f })).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((rows: Template[]) => {
        if (cancelled) return;
        const t = rows.find((x) => String(x.id) === id);
        if (!t) { setNotFound(true); setLoaded(true); return; }
        setEditingId(t.id);
        let builderMode = false;
        if (t.builder_json) {
          try { setBuilder({ ...DEFAULT_BUILDER, ...JSON.parse(t.builder_json) }); builderMode = true; setHasBuilderJson(true); }
          catch { builderMode = false; }
        }
        setMode(builderMode ? "builder" : "blank");
        setForm({ name: t.name, subject: t.subject, body: t.body, list_id: t.list_id ?? null, category: t.category || "general" });
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [id, isNew]);

  function goBack() { router.push("/bd825db8c738/templates"); }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const isBuilder = mode === "builder";
    const payload = {
      ...form,
      body: isBuilder ? builderHtml : form.body,
      builder_json: isBuilder ? JSON.stringify(builder) : null,
    };
    if (editingId != null) {
      await fetch("/api/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: editingId }) });
    } else {
      await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setLoading(false);
    goBack();
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-sm" style={{ color: "var(--admin-text-muted)" }}>
        <Loader2 size={16} className="animate-spin" /> Loading template…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl p-8 text-center" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <p className="text-base font-bold text-(--admin-text) mb-1" style={{ fontFamily: "var(--font-heading)" }}>Template not found</p>
        <p className="text-sm mb-5" style={{ color: "var(--admin-text-muted)" }}>It may have been deleted.</p>
        <button onClick={goBack} className="px-5 py-2 rounded-full text-sm font-bold text-white" style={{ background: "var(--admin-accent)" }}>Back to Templates</button>
      </div>
    );
  }

  const showToggle = isNew || hasBuilderJson;

  return (
    <div className="rounded-2xl p-7" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
          {editingId != null ? "Edit Template" : "New Template"}
        </p>
        <button onClick={goBack} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-faint)" }}>
          <X size={15} />
        </button>
      </div>

      {showToggle && (
        <div className="flex gap-2 mb-5">
          {([["builder", Wand2, "Branded builder"], ["blank", Code, "Blank / paste HTML"]] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => { if (m === "blank" && mode === "builder") setForm((f) => ({ ...f, body: builderHtml })); setMode(m); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all"
              style={mode === m
                ? { background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(99,102,241,0.3)" }
                : { background: "var(--admin-surface-2)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <input style={inputStyle} placeholder="Template name (e.g. Job Outreach)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input style={inputStyle} placeholder="Email subject line" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-faint)" }}>Category</p>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value} style={{ background: "var(--admin-surface)" }}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-faint)" }}>Contact list <span style={{ color: "var(--admin-text-faint)" }}>(optional)</span></p>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.list_id ?? ""}
              onChange={(e) => setForm({ ...form, list_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="" style={{ background: "var(--admin-surface)" }}>No specific list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {mode === "builder" ? (
          <EmailBuilderFields builder={builder} onChange={setB} previewHeight="72vh" footer={footer} onFooterChange={setF} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Editor */}
            <div className="flex flex-col">
              <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-faint)" }}>
                Body — plain text, or paste full HTML. Use{" "}
                <code style={{ background: "var(--admin-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{"{{first_name}}"}</code>,{" "}
                <code style={{ background: "var(--admin-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{"{{title}}"}</code>, and{" "}
                <code style={{ background: "var(--admin-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{"{{company}}"}</code>.
              </p>
              <textarea
                style={{ ...inputStyle, minHeight: "62vh", resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem", flex: 1 }}
                placeholder={"Hi {{first_name}},\n\nI saw you are a {{title}} at {{company}}...\n\nBest,\nPatrick"}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
              />
            </div>
            {/* Live preview */}
            <div className="lg:sticky lg:top-4 h-fit">
              <p className="text-xs mb-1.5 font-semibold" style={{ color: "var(--admin-text-muted)" }}>Live preview</p>
              {form.subject.trim() && (
                <p className="text-xs mb-1.5 truncate" style={{ color: "var(--admin-text-faint)" }}>
                  Subject: <span style={{ color: "var(--admin-text-secondary)" }}>{form.subject}</span>
                </p>
              )}
              {form.body.trim() ? (
                isHtmlTemplate(form.body) ? (
                  <iframe
                    title="Template live preview"
                    srcDoc={form.body.replace(
                      /https:\/\/patricknovick\.com\//g,
                      (typeof window !== "undefined" ? window.location.origin : "https://patricknovick.com") + "/"
                    )}
                    sandbox=""
                    style={{ width: "100%", height: "62vh", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.5rem", background: "#fff", display: "block" }}
                  />
                ) : (
                  <div style={{ background: "#fff", borderRadius: "0.5rem", height: "62vh", overflow: "auto", padding: "28px 32px", fontFamily: "'Georgia', serif", fontSize: 14, lineHeight: 1.8, color: "#1a1a2e" }}>
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 30 }}>{form.body}</div>
                    <div style={{ borderTop: "1px solid #eeeeee", paddingTop: 20 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/signature.png" alt="Patrick Novick - CEO, Metro Associates LLC" width={550} style={{ display: "block", maxWidth: "100%", height: "auto", border: 0 }} />
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center text-xs" style={{ height: "62vh", border: "1px dashed var(--admin-border)", borderRadius: "0.5rem", color: "var(--admin-text-faint)" }}>
                  Start typing to see a live preview
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit" disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editingId != null ? "Save Changes" : "Save Template"}
          </button>
          <button type="button" onClick={goBack} className="px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
