"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertCircle, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "loading";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, 0 = never auto-dismiss
}

// ─── Singleton event bus ───────────────────────────────────────────────────────
type Listener = (t: ToastItem) => void;
type DismissListener = (id: string) => void;
const listeners: Listener[] = [];
const dismissListeners: DismissListener[] = [];

export function toast(message: string, type: ToastType = "info", duration = 3500) {
  const item: ToastItem = { id: crypto.randomUUID(), type, message, duration };
  listeners.forEach((l) => l(item));
  return item.id;
}
toast.success = (msg: string, d?: number) => toast(msg, "success", d ?? 3500);
toast.error   = (msg: string, d?: number) => toast(msg, "error",   d ?? 5000);
toast.info    = (msg: string, d?: number) => toast(msg, "info",    d ?? 3000);
toast.loading = (msg: string)             => toast(msg, "loading", 0);
// Dismiss a specific toast by id — needed to clear "loading" toasts (duration 0)
toast.dismiss = (id: string) => dismissListeners.forEach((l) => l(id));

// ─── Provider / renderer ──────────────────────────────────────────────────────
export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const addToast = useCallback((t: ToastItem) => {
    setItems((prev) => [...prev, t]);
    if (t.duration && t.duration > 0) {
      setTimeout(() => removeToast(t.id), t.duration);
    }
  }, []);

  function removeToast(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  useEffect(() => {
    listeners.push(addToast);
    const onDismiss: DismissListener = (id) => removeToast(id);
    dismissListeners.push(onDismiss);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx !== -1) listeners.splice(idx, 1);
      const dIdx = dismissListeners.indexOf(onDismiss);
      if (dIdx !== -1) dismissListeners.splice(dIdx, 1);
    };
  }, [addToast]);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const colors = {
    success: { bg: "var(--admin-success-soft)",  border: "rgba(34,197,94,0.25)",  text: "var(--admin-success)",  icon: <CheckCircle size={15} /> },
    error:   { bg: "var(--admin-danger-soft)",  border: "rgba(239,68,68,0.3)",   text: "var(--admin-danger-text)",  icon: <XCircle size={15} />     },
    info:    { bg: "var(--admin-accent-soft)", border: "rgba(167,139,250,0.25)", text: "var(--admin-accent-text)",  icon: <AlertCircle size={15} /> },
    loading: { bg: "var(--admin-surface-2)", border: "var(--admin-border)", text: "var(--admin-text-secondary)", icon: <Loader2 size={15} style={{ animation: "spin 0.9s linear infinite" }} /> },
  }[item.type];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        minWidth: 260,
        maxWidth: 380,
        padding: "0.7rem 0.875rem",
        borderRadius: "0.875rem",
        background: "var(--admin-surface)",
        border: `1px solid ${colors.border}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.22s ease, transform 0.22s ease",
      }}
    >
      <span style={{ color: colors.text, flexShrink: 0 }}>{colors.icon}</span>
      <p style={{ fontSize: "0.8rem", color: "var(--admin-text)", fontWeight: 500, flex: 1, lineHeight: 1.4 }}>
        {item.message}
      </p>
      {item.type !== "loading" && (
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-faint)", display: "flex", flexShrink: 0, padding: 0 }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Spinner for buttons ──────────────────────────────────────────────────────
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    />
  );
}

// ─── Reusable pagination footer ────────────────────────────────────────────────
export function Pagination({ page, total, perPage, onPage }: {
  page: number; total: number; perPage: number; onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const btn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "0.25rem",
    padding: "0.375rem 0.75rem", borderRadius: "0.5rem",
    fontSize: "0.72rem", fontWeight: 600, color: "var(--admin-text-secondary)",
    border: "1px solid var(--admin-border)", background: "transparent", cursor: "pointer",
  };
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap" style={{ borderTop: "1px solid var(--admin-border)" }}>
      <p style={{ fontSize: "0.72rem", color: "var(--admin-text-muted)" }}>{start}–{end} of {total}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          style={{ ...btn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}>
          <ChevronLeft size={13} /> Prev
        </button>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--admin-text-secondary)" }}>
          Page {page} of {totalPages}
        </span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          style={{ ...btn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}>
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Full-screen blocking loader ───────────────────────────────────────────────
// Fixed-position overlay — centered on any screen size, always on top.
export function LoadingOverlay({ show, message }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "var(--admin-scrim)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.9rem",
          padding: "1.75rem 2.25rem",
          maxWidth: "90vw",
          borderRadius: "1rem",
          background: "var(--admin-surface)",
          border: "1px solid var(--admin-border)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <Loader2 size={30} style={{ color: "var(--admin-accent)", animation: "spin 0.8s linear infinite" }} />
        {message && (
          <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--admin-text)", textAlign: "center" }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
