"use client";

import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Wand2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { buildMetroEmail, DEFAULT_BUILDER, DEFAULT_FOOTER, EmailBuilderInput, FooterSettings } from "@/lib/emailBuilder";
import { BField, MessageFields, ListsFields, ButtonsFields, ImageAndFooterFields, EmailLivePreview } from "../EmailBuilderFields";

interface ContactList { id: number; name: string }

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

// Same 5-step shape as the Campaign Builder — one thing at a time instead of
// a single long scroll through every field.
const STEPS = [
  { n: 1, label: "Basics" },
  { n: 2, label: "Message" },
  { n: 3, label: "Lists & Buttons" },
  { n: 4, label: "Image & Footer" },
  { n: 5, label: "Preview" },
] as const;
type Step = (typeof STEPS)[number]["n"];

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

export default function TemplateMakerClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [listId, setListId] = useState<number | null>(null);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [builder, setBuilder] = useState<EmailBuilderInput>(DEFAULT_BUILDER);
  const [footer, setFooter] = useState<FooterSettings>(DEFAULT_FOOTER);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const setB = (patch: Partial<EmailBuilderInput>) => setBuilder((b) => ({ ...b, ...patch }));
  const setF = (patch: Partial<FooterSettings>) => setFooter((f) => ({ ...f, ...patch }));
  const html = useMemo(() => buildMetroEmail(builder, footer), [builder, footer]);

  useEffect(() => {
    fetch("/api/lists").then((r) => (r.ok ? r.json() : [])).then(setLists).catch(() => {});
    // The footer is edited once, globally, at /bd825db8c738/footer-settings —
    // pick up whatever's currently saved so both the preview and the HTML
    // this page saves match it.
    fetch("/api/footer-settings").then((r) => (r.ok ? r.json() : null)).then((f) => f && setFooter({ ...DEFAULT_FOOTER, ...f })).catch(() => {});
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, body: html, list_id: listId, builder_json: JSON.stringify(builder) }),
    });
    setLoading(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => router.push("/bd825db8c738/templates"), 700);
    }
  }

  function useInCampaign() {
    localStorage.setItem("campaign_draft", JSON.stringify({ subject, body: html, isHtml: true }));
    router.push("/bd825db8c738/campaigns");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl p-6" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--admin-accent-soft)" }}>
            <Wand2 size={16} style={{ color: "var(--admin-accent-text)" }} />
          </span>
          <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Email Template Maker</p>
        </div>
        <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
          Build a branded, Outlook-safe email from simple fields — it&apos;s saved to your
          Templates and ready to send as a campaign.
        </p>

        {/* Stepper */}
        <div className="flex items-center mt-5 mb-1 overflow-x-auto pb-1">
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
                        : { background: "var(--admin-surface-2)", color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)" }
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

        {/* Fields (left) + persistent live preview (right) — every step
            updates the same builder/footer state, so the preview on the
            right reacts immediately no matter which step is open. */}
        <div className="grid gap-6 lg:grid-cols-2 mt-4">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {/* STEP 1 — Basics */}
            {step === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-muted)" }}>Template name</p>
                    <input style={inputStyle} placeholder="e.g. NYC Employer Outreach" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-muted)" }}>Email subject line</p>
                    <input style={inputStyle} placeholder="What recipients see in their inbox" value={subject} onChange={(e) => setSubject(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--admin-text-muted)" }}>Contact list <span style={{ color: "var(--admin-text-faint)" }}>(optional)</span></p>
                  <select
                    style={{ ...inputStyle, cursor: "pointer", maxWidth: 320 }}
                    value={listId ?? ""}
                    onChange={(e) => setListId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="" style={{ background: "var(--admin-surface)" }}>General (no specific list)</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <StepNav onNext={() => setStep(2)} nextLabel="Message" />
              </>
            )}

            {/* STEP 2 — Message */}
            {step === 2 && (
              <>
                <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                  Tokens like <code style={{ background: "var(--admin-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{"{{first_name}}"}</code> work anywhere below.
                </p>
                <MessageFields builder={builder} setB={setB} />
                <BField label="Closing paragraph (optional)" value={builder.bodyAfter} onChange={(v) => setB({ bodyAfter: v })} area rows={2} />
                <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Lists & Buttons" />
              </>
            )}

            {/* STEP 3 — Lists & Buttons */}
            {step === 3 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--admin-text-faint)" }}>Check-lists</p>
                <ListsFields builder={builder} setB={setB} />
                <p className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: "var(--admin-text-faint)" }}>Call-to-action buttons</p>
                <ButtonsFields builder={builder} setB={setB} />
                <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Image & Footer" />
              </>
            )}

            {/* STEP 4 — Image & Footer */}
            {step === 4 && (
              <>
                <ImageAndFooterFields builder={builder} setB={setB} footer={footer} setF={setF} />
                <StepNav onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Preview" />
              </>
            )}

            {/* STEP 5 — Save */}
            {step === 5 && (
              <>
                <div className="rounded-xl p-4" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--admin-text-faint)" }}>Ready to save</p>
                  <p className="text-sm text-(--admin-text)">{name || "Untitled template"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>{subject || "No subject yet"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit" disabled={loading || saved}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                    style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}
                  >
                    <Check size={14} /> {saved ? "Saved!" : loading ? "Saving…" : "Save Template"}
                  </button>
                  <button
                    type="button"
                    onClick={useInCampaign}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-(--admin-hover-bg)"
                    style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                  >
                    <Eye size={14} /> Use in Campaign
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="self-start flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg)"
                  style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
                >
                  <ChevronLeft size={14} /> Back
                </button>
              </>
            )}
          </form>

          {/* Live preview — always visible, updates as you type on any step */}
          <div className="lg:sticky lg:top-4 h-fit">
            <p className="text-xs mb-1.5 font-semibold" style={{ color: "var(--admin-text-muted)" }}>Live preview</p>
            <EmailLivePreview builder={builder} footer={footer} previewHeight="70vh" />
          </div>
        </div>
      </div>
    </div>
  );
}
