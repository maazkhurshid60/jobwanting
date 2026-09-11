"use client";

import { useState } from "react";
import { Upload, Loader2, X, Plus, Check } from "lucide-react";
import { EmailBuilderInput, FooterSettings, buildMetroEmail } from "@/lib/emailBuilder";

const inputStyle = {
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  background: "var(--admin-surface-2)",
  borderRadius: "0.75rem",
  padding: "0.55rem 0.85rem",
  fontSize: "0.82rem",
  outline: "none",
  width: "100%",
};

// A labeled input/textarea used by the branded email builder. Exported so the
// step-by-step Template Maker can lay out the same fields on its own steps.
export function BField({ label, value, onChange, area, rows }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; rows?: number;
}) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: "var(--admin-text-muted)" }}>{label}</p>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

type BuilderProps = { builder: EmailBuilderInput; setB: (patch: Partial<EmailBuilderInput>) => void };

/* Eyebrow / headline / greeting / intro — the top of the message. Split out
   so the Template Maker can put just this on one step; the all-in-one
   EmailBuilderFields below still renders it inline in its original spot. */
export function MessageFields({ builder, setB }: BuilderProps) {
  return (
    <>
      <BField label="Eyebrow (small gold label)" value={builder.eyebrow} onChange={(v) => setB({ eyebrow: v })} />
      <BField label="Headline" value={builder.headline} onChange={(v) => setB({ headline: v })} />
      <BField label="Greeting" value={builder.greeting} onChange={(v) => setB({ greeting: v })} />
      <BField label="Intro paragraphs (blank line = new paragraph)" value={builder.intro} onChange={(v) => setB({ intro: v })} area rows={4} />
    </>
  );
}

/* Check-lists — add as many labelled lists as needed. */
export function ListsFields({ builder, setB }: BuilderProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {builder.lists.map((list, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {i === 0 ? "List heading (optional)" : `List ${i + 1} heading (optional)`}
            </p>
            {builder.lists.length > 1 && (
              <button
                type="button"
                onClick={() => setB({ lists: builder.lists.filter((_, idx) => idx !== i) })}
                className="flex items-center gap-1 text-xs text-(--admin-text-muted) transition-colors hover:text-(--admin-text)"
              >
                <X size={12} /> Remove
              </button>
            )}
          </div>
          <input
            value={list.heading}
            onChange={(e) => setB({ lists: builder.lists.map((l, idx) => idx === i ? { ...l, heading: e.target.value } : l) })}
            placeholder="e.g. Recruiting focus:"
            style={inputStyle}
          />
          <textarea
            value={list.items.join("\n")}
            onChange={(e) => setB({ lists: builder.lists.map((l, idx) => idx === i ? { ...l, items: e.target.value.split("\n") } : l) })}
            rows={4}
            placeholder="List items (one per line)"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setB({ lists: [...builder.lists, { heading: "", items: [] }] })}
        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all hover:bg-(--admin-hover-bg)"
        style={{ border: "1px dashed var(--admin-border)", color: "var(--admin-text-secondary)" }}
      >
        <Plus size={13} /> Add another list
      </button>
    </div>
  );
}

/* Call-to-action buttons — add as many as needed. The first is styled gold
   (primary), the rest navy (secondary). */
export function ButtonsFields({ builder, setB }: BuilderProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {builder.buttons.map((btn, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {i === 0 ? "Button (blank = no button)" : `Button ${i + 1}`}
              {i === 0 && <span style={{ color: "var(--admin-text-faint)" }}> · gold</span>}
              {i > 0 && <span style={{ color: "var(--admin-text-faint)" }}> · navy</span>}
            </p>
            {builder.buttons.length > 1 && (
              <button
                type="button"
                onClick={() => setB({ buttons: builder.buttons.filter((_, idx) => idx !== i) })}
                className="flex items-center gap-1 text-xs text-(--admin-text-muted) transition-colors hover:text-(--admin-text)"
              >
                <X size={12} /> Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={btn.label}
              onChange={(e) => setB({ buttons: builder.buttons.map((b, idx) => idx === i ? { ...b, label: e.target.value } : b) })}
              placeholder="Button text"
              style={inputStyle}
            />
            <input
              value={btn.href}
              onChange={(e) => setB({ buttons: builder.buttons.map((b, idx) => idx === i ? { ...b, href: e.target.value } : b) })}
              placeholder="mailto: or https:"
              style={inputStyle}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setB({ buttons: [...builder.buttons, { label: "", href: "" }] })}
        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all hover:bg-(--admin-hover-bg)"
        style={{ border: "1px dashed var(--admin-border)", color: "var(--admin-text-secondary)" }}
      >
        <Plus size={13} /> Add another button
      </button>
    </div>
  );
}

/* Header/hero image, inbox preview text, and the shared footer (signature,
   phone, links, tagline, logo). Bundled together because they're all
   "everything around the message" rather than the message itself — and
   because the footer is edited once, globally (saving here updates every
   template, not just this one; see /bd825db8c738/footer-settings). */
export function ImageAndFooterFields({
  builder, setB, footer, setF,
}: BuilderProps & { footer?: FooterSettings; setF: (patch: Partial<FooterSettings>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadErr, setLogoUploadErr] = useState("");
  const [footerSaving, setFooterSaving] = useState(false);
  const [footerSaved, setFooterSaved] = useState(false);

  async function uploadImage(file: File) {
    setUploadErr("");
    if (!file.type.startsWith("image/")) { setUploadErr("Please choose an image file."); return; }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mime: file.type, dataBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) { setUploadErr(data.error || "Upload failed"); return; }
      setB({ heroUrl: data.url });
    } catch {
      setUploadErr("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFooterLogo(file: File) {
    setLogoUploadErr("");
    if (!file.type.startsWith("image/")) { setLogoUploadErr("Please choose an image file."); return; }
    setLogoUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mime: file.type, dataBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) { setLogoUploadErr(data.error || "Upload failed"); return; }
      setF({ logoUrl: data.url });
    } catch {
      setLogoUploadErr("Upload failed. Please try again.");
    } finally {
      setLogoUploading(false);
    }
  }

  async function saveFooter() {
    if (!footer) return;
    setFooterSaving(true);
    try {
      const res = await fetch("/api/footer-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(footer),
      });
      if (res.ok) { setFooterSaved(true); setTimeout(() => setFooterSaved(false), 2000); }
    } finally {
      setFooterSaving(false);
    }
  }

  return (
    <>
      {/* Header / hero image — upload one or paste a URL */}
      <div>
        <p className="text-xs mb-1" style={{ color: "var(--admin-text-muted)" }}>Header / hero image (optional)</p>
        <div className="flex gap-2">
          <input
            value={builder.heroUrl}
            onChange={(e) => setB({ heroUrl: e.target.value })}
            placeholder="Paste an image URL, or upload →"
            style={inputStyle}
          />
          <label
            className="flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap transition-all hover:bg-(--admin-hover-bg)"
            style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
          </label>
        </div>
        {uploadErr && <p className="text-xs mt-1" style={{ color: "var(--admin-danger-text)" }}>{uploadErr}</p>}
        {builder.heroUrl && (
          <div className="mt-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={builder.heroUrl} alt="Header preview" style={{ height: 44, width: "auto", borderRadius: 6, border: "1px solid var(--admin-border)" }} />
            <button
              type="button"
              onClick={() => setB({ heroUrl: "" })}
              className="flex items-center gap-1 text-xs text-(--admin-text-muted) transition-colors hover:text-(--admin-text)"
            >
              <X size={12} /> Remove
            </button>
          </div>
        )}
        <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
          Uploaded images are saved to your database and served from this app — no external host needed.
        </p>
      </div>
      <BField label="Inbox preview text (optional)" value={builder.previewText} onChange={(v) => setB({ previewText: v })} />

      {footer && (
        <div className="mt-2 pt-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div>
            <p className="text-sm font-bold text-(--admin-text)">Footer</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
              Shared by every template — saving here updates it everywhere, not just this one.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <BField label="Signature name" value={footer.signatureName} onChange={(v) => setF({ signatureName: v })} />
            <BField label="Signature title" value={footer.signatureTitle} onChange={(v) => setF({ signatureTitle: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BField label="Phone (shown)" value={footer.phoneDisplay} onChange={(v) => setF({ phoneDisplay: v })} />
            <BField label="Phone (tel: link)" value={footer.phoneHref} onChange={(v) => setF({ phoneHref: v })} />
          </div>
          <BField label="Email" value={footer.email} onChange={(v) => setF({ email: v })} />
          <div className="grid grid-cols-2 gap-3">
            <BField label="Link 1 label" value={footer.link1Label} onChange={(v) => setF({ link1Label: v })} />
            <BField label="Link 1 URL" value={footer.link1Url} onChange={(v) => setF({ link1Url: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BField label="Link 2 label" value={footer.link2Label} onChange={(v) => setF({ link2Label: v })} />
            <BField label="Link 2 URL" value={footer.link2Url} onChange={(v) => setF({ link2Url: v })} />
          </div>
          <BField label="Bottom bar tagline" value={footer.tagline} onChange={(v) => setF({ tagline: v })} />

          {/* Footer logo — upload/URL + where it sits */}
          <div>
            <p className="text-xs mb-1" style={{ color: "var(--admin-text-muted)" }}>Footer logo (optional)</p>
            <div className="flex gap-2">
              <input
                value={footer.logoUrl}
                onChange={(e) => setF({ logoUrl: e.target.value })}
                placeholder="Paste an image URL, or upload →"
                style={inputStyle}
              />
              <label
                className="flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap transition-all hover:bg-(--admin-hover-bg)"
                style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
              >
                {logoUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {logoUploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: "none" }}
                  disabled={logoUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFooterLogo(f); e.target.value = ""; }}
                />
              </label>
            </div>
            {logoUploadErr && <p className="text-xs mt-1" style={{ color: "var(--admin-danger-text)" }}>{logoUploadErr}</p>}
            {footer.logoUrl && (
              <div className="mt-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={footer.logoUrl} alt="Footer logo preview" style={{ height: 36, width: "auto", borderRadius: 6, border: "1px solid var(--admin-border)" }} />
                <button
                  type="button"
                  onClick={() => setF({ logoUrl: "" })}
                  className="flex items-center gap-1 text-xs text-(--admin-text-muted) transition-colors hover:text-(--admin-text)"
                >
                  <X size={12} /> Remove
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-xs mb-1" style={{ color: "var(--admin-text-muted)" }}>Position</p>
                <div className="flex gap-2">
                  {(["top", "bottom"] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setF({ logoPosition: pos })}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                      style={footer.logoPosition === pos
                        ? { background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(99,102,241,0.3)" }
                        : { background: "var(--admin-surface-2)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                    >
                      {pos === "top" ? "Above signature" : "Below signature"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "var(--admin-text-muted)" }}>Alignment</p>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => setF({ logoAlign: align })}
                      className="flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all"
                      style={footer.logoAlign === align
                        ? { background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(99,102,241,0.3)" }
                        : { background: "var(--admin-surface-2)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={saveFooter}
            disabled={footerSaving}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all hover:bg-(--admin-hover-bg) disabled:opacity-50 w-fit px-4"
            style={{ border: "1px solid var(--admin-border)", color: footerSaved ? "var(--admin-success)" : "var(--admin-text-secondary)" }}
          >
            {footerSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {footerSaved ? "Footer saved" : footerSaving ? "Saving…" : "Save footer (applies to every template)"}
          </button>
        </div>
      )}
    </>
  );
}

/* The generated HTML + live preview iframe. Exported so the Template Maker's
   own "Preview" step can show it full-width instead of side-by-side. */
export function EmailLivePreview({
  builder, footer, previewHeight = "62vh",
}: { builder: EmailBuilderInput; footer?: FooterSettings; previewHeight?: string }) {
  const html = buildMetroEmail(builder, footer);
  const previewSrc = html.replace(
    /https:\/\/patricknovick\.com\//g,
    (typeof window !== "undefined" ? window.location.origin : "https://patricknovick.com") + "/"
  );
  return (
    <iframe
      title="Email builder preview"
      srcDoc={previewSrc}
      sandbox=""
      style={{ width: "100%", height: previewHeight, border: "1px solid var(--admin-border)", borderRadius: "0.5rem", background: "#fff" }}
    />
  );
}

/**
 * The branded email builder: structured fields on the left, a live preview of
 * the generated house-style HTML on the right. Controlled via `builder`/`onChange`.
 * This is the all-in-one layout (used by the Template Editor's "Branded
 * builder" mode); the Template Maker instead assembles the section
 * components above onto its own steps.
 */
export default function EmailBuilderFields({
  builder,
  onChange,
  previewHeight = "62vh",
  footer,
  onFooterChange,
}: {
  builder: EmailBuilderInput;
  onChange: (patch: Partial<EmailBuilderInput>) => void;
  previewHeight?: string;
  /** The saved footer (see /bd825db8c738/footer-settings). Falls back to
      emailBuilder's DEFAULT_FOOTER when the caller hasn't loaded it yet. */
  footer?: FooterSettings;
  /** Updates the caller's local footer state so the preview reacts instantly.
      Persisting it globally (PUT /api/footer-settings) happens inside
      ImageAndFooterFields' own "Save footer" button — editing it here changes
      the ONE shared footer, not something scoped to this template. */
  onFooterChange?: (patch: Partial<FooterSettings>) => void;
}) {
  const setB = onChange;
  const setF = onFooterChange ?? (() => {});

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Fields */}
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
          Fill in the pieces — the branded HTML (680px layout, gold button, Patrick&apos;s
          signature &amp; unsubscribe) is generated automatically. Tokens like{" "}
          <code style={{ background: "var(--admin-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{"{{first_name}}"}</code> work anywhere.
        </p>
        <MessageFields builder={builder} setB={setB} />
        <ListsFields builder={builder} setB={setB} />
        <BField label="Closing paragraph (optional)" value={builder.bodyAfter} onChange={(v) => setB({ bodyAfter: v })} area rows={2} />
        <ButtonsFields builder={builder} setB={setB} />
        <ImageAndFooterFields builder={builder} setB={setB} footer={footer} setF={setF} />
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-4 h-fit">
        <p className="text-xs mb-1.5 font-semibold" style={{ color: "var(--admin-text-muted)" }}>Live preview</p>
        <EmailLivePreview builder={builder} footer={footer} previewHeight={previewHeight} />
      </div>
    </div>
  );
}
