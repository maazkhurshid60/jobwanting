"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import {
  Plus, X, KeyRound, Lock, Eye, EyeOff, Copy, Check, Trash2, Pencil, ExternalLink,
} from "lucide-react";
import { ToastProvider, toast, Spinner } from "../Toast";

interface Me {
  id: string;
  username: string;
  role: "admin" | "member";
}

interface VaultEntry {
  id: number;
  label: string;
  username: string;
  url: string;
  notes: string;
  created_by: string;
  created_at: number;
  updated_at: number;
}

interface AuditEntry {
  id: number;
  entry_id: number;
  entry_label: string;
  username: string;
  created_at: number;
}

const AUTO_HIDE_MS = 30_000;

const inp = {
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  background: "var(--admin-surface-2)",
  borderRadius: "0.625rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as const;

const label = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "var(--admin-text-muted)",
  marginBottom: "0.3rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};

const emptyForm = { label: "", username: "", url: "", notes: "", secret: "" };

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtRelative(unix: number) {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return fmtDate(unix);
}

export default function VaultClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editEntry, setEditEntry] = useState<VaultEntry | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [showEditSecret, setShowEditSecret] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<VaultEntry | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Revealed secrets live only in memory, per row, until the page reloads,
  // are manually hidden, or AUTO_HIDE_MS elapses — never cached to disk.
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [revealingId, setRevealingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const revealTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault");
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/vault/audit");
    if (res.ok) setAudit(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Me | null) => {
        if (cancelled) return;
        setMe(data);
        setMeLoaded(true);
        if (data?.role === "admin") { loadEntries(); loadAudit(); }
      })
      .catch(() => {
        if (cancelled) return;
        setMe(null);
        setMeLoaded(true);
      });
    return () => { cancelled = true; };
  }, [loadEntries, loadAudit]);

  // Clear every pending auto-hide timer on unmount.
  useEffect(() => {
    const timeouts = revealTimeouts.current;
    return () => { Object.values(timeouts).forEach(clearTimeout); };
  }, []);

  function hideRevealed(id: number) {
    if (revealTimeouts.current[id]) {
      clearTimeout(revealTimeouts.current[id]);
      delete revealTimeouts.current[id];
    }
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function scheduleAutoHide(id: number) {
    if (revealTimeouts.current[id]) clearTimeout(revealTimeouts.current[id]);
    revealTimeouts.current[id] = setTimeout(() => {
      delete revealTimeouts.current[id];
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, AUTO_HIDE_MS);
  }

  function closeAdd() {
    setShowAdd(false);
    setShowSecret(false);
    setForm(emptyForm);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to save entry"); return; }
      toast.success(`“${form.label}” saved`);
      closeAdd();
      loadEntries();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(entry: VaultEntry) {
    setEditEntry(entry);
    setEditForm({ label: entry.label, username: entry.username, url: entry.url, notes: entry.notes, secret: "" });
    setShowEditSecret(false);
  }
  function closeEdit() {
    setEditEntry(null);
    setShowEditSecret(false);
    setEditForm(emptyForm);
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editEntry) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/vault/${editEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to update entry"); return; }
      toast.success(`“${editForm.label}” updated`);
      // A changed secret invalidates whatever was previously revealed in memory.
      hideRevealed(editEntry.id);
      closeEdit();
      loadEntries();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeEntry(entry: VaultEntry) {
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/vault/${entry.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to delete entry"); return; }
      setEntries((prev) => prev.filter((x) => x.id !== entry.id));
      hideRevealed(entry.id);
      toast.success(`“${entry.label}” deleted`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  async function toggleReveal(entry: VaultEntry) {
    if (revealed[entry.id] !== undefined) {
      hideRevealed(entry.id);
      return;
    }
    setRevealingId(entry.id);
    try {
      const res = await fetch(`/api/vault/${entry.id}/reveal`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to reveal secret"); return; }
      setRevealed((prev) => ({ ...prev, [entry.id]: data.secret }));
      scheduleAutoHide(entry.id);
      loadAudit();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setRevealingId(null);
    }
  }

  async function copySecret(entry: VaultEntry) {
    let secret = revealed[entry.id];
    if (secret === undefined) {
      try {
        const res = await fetch(`/api/vault/${entry.id}/reveal`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(data.error ?? "Failed to copy"); return; }
        secret = data.secret;
        loadAudit();
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
        return;
      }
    }
    await navigator.clipboard.writeText(secret);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500);
  }

  // ── Access control ──────────────────────────────────────────────────────────

  if (!meLoaded) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-sm text-(--admin-text-muted)">
        <Spinner /> Loading…
      </div>
    );
  }

  if (me?.role !== "admin") {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-2xl p-8 text-center" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--admin-danger-soft)" }}>
          <Lock size={20} style={{ color: "var(--admin-danger-text)" }} />
        </div>
        <p className="text-base font-bold text-(--admin-text) mb-1" style={{ fontFamily: "var(--font-heading)" }}>Admins only</p>
        <p className="text-sm text-(--admin-text-muted)">
          You need an admin account to open the vault.
        </p>
      </div>
    );
  }

  // ── Admin view ──────────────────────────────────────────────────────────────

  return (
    <>
      <ToastProvider />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="text-lg font-black text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
            Vault <span className="text-sm font-medium text-(--admin-text-muted)">· {entries.length}</span>
          </p>
          <p className="text-xs mt-0.5 text-(--admin-text-muted)">
            Logins for systems you manage outside this dashboard — JobFolder, other admin panels, service consoles.
            Stored encrypted; nothing here is ever visible until you click Reveal.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white transition-all hover:scale-[1.03]"
          style={{ background: "var(--admin-accent)" }}
        >
          <Plus size={14} /> Add entry
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-(--admin-text-muted)">
          <Spinner /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl p-10 text-center border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "var(--admin-accent-soft)" }}>
            <KeyRound size={20} className="text-(--admin-accent)" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-(--admin-text) mb-1">Nothing stored yet</p>
          <p className="text-xs text-(--admin-text-muted)">Add the first login you want to keep on hand.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-(--admin-border)">
                {["Label", "Username", "Secret", "Updated", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--admin-text-faint)">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isRevealed = revealed[entry.id] !== undefined;
                return (
                  <tr key={entry.id} className="border-b border-(--admin-border) last:border-b-0">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-(--admin-text)">{entry.label}</p>
                      {entry.url && (
                        <a
                          href={/^https?:\/\//.test(entry.url) ? entry.url : `https://${entry.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-(--admin-accent-text) hover:underline"
                        >
                          {entry.url} <ExternalLink size={10} />
                        </a>
                      )}
                      {entry.notes && <p className="text-xs text-(--admin-text-faint) mt-0.5">{entry.notes}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-(--admin-text-secondary)">{entry.username || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <code
                          className="text-xs px-2 py-1 rounded-lg font-mono"
                          style={{ background: "var(--admin-surface-2)", color: "var(--admin-text)" }}
                        >
                          {isRevealed ? revealed[entry.id] : "••••••••••"}
                        </code>
                        <button
                          onClick={() => toggleReveal(entry)}
                          disabled={revealingId === entry.id}
                          aria-label={isRevealed ? "Hide secret" : "Reveal secret"}
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--admin-hover-bg) text-(--admin-text-muted) disabled:opacity-50"
                        >
                          {revealingId === entry.id ? <Spinner /> : isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => copySecret(entry)}
                          aria-label="Copy secret"
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--admin-hover-bg) text-(--admin-text-muted)"
                        >
                          {copiedId === entry.id ? <Check size={14} className="text-(--admin-success)" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-(--admin-text-faint)">{fmtDate(entry.updated_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(entry)}
                          aria-label="Edit"
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--admin-hover-bg) text-(--admin-text-muted)"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(entry)}
                          aria-label="Delete"
                          className="p-1.5 rounded-lg transition-colors hover:bg-(--admin-hover-bg) text-(--admin-danger-text)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {audit.length > 0 && (
        <div className="mt-6 rounded-2xl p-5 border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-(--admin-text-faint) mb-3">Recent reveals</p>
          <div className="flex flex-col gap-2">
            {audit.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-(--admin-text-secondary)">
                  <span className="font-semibold text-(--admin-text)">{a.username}</span> revealed “{a.entry_label}”
                </span>
                <span className="text-(--admin-text-faint) whitespace-nowrap">{fmtRelative(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add entry modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--admin-scrim)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Add vault entry</p>
              <button onClick={closeAdd} aria-label="Close" className="p-1 rounded-lg hover:bg-(--admin-hover-bg) text-(--admin-text-muted)">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label style={label}>Label</label>
                <input style={inp} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="JobFolder admin" />
              </div>
              <div>
                <label style={label}>Username / email</label>
                <input style={inp} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jobtempadmin@admin.com" />
              </div>
              <div>
                <label style={label}>Secret</label>
                <div className="relative">
                  <input
                    style={{ ...inp, paddingRight: "2.25rem" }}
                    required
                    type={showSecret ? "text" : "password"}
                    value={form.secret}
                    onChange={(e) => setForm({ ...form, secret: e.target.value })}
                    placeholder="Password, API key, etc."
                  />
                  <button type="button" onClick={() => setShowSecret((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--admin-text-muted)">
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={label}>URL (optional)</label>
                <input style={inp} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="jobfolder.com/console-..." />
              </div>
              <div>
                <label style={label}>Notes (optional)</label>
                <input style={inp} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything worth remembering" />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-full text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "var(--admin-accent)" }}
              >
                {saving ? "Saving…" : "Save entry"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit entry modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--admin-scrim)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Edit “{editEntry.label}”</p>
              <button onClick={closeEdit} aria-label="Close" className="p-1 rounded-lg hover:bg-(--admin-hover-bg) text-(--admin-text-muted)">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label style={label}>Label</label>
                <input style={inp} required value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} />
              </div>
              <div>
                <label style={label}>Username / email</label>
                <input style={inp} value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
              </div>
              <div>
                <label style={label}>Secret <span className="normal-case font-normal text-(--admin-text-faint)">— leave blank to keep the current one</span></label>
                <div className="relative">
                  <input
                    style={{ ...inp, paddingRight: "2.25rem" }}
                    type={showEditSecret ? "text" : "password"}
                    value={editForm.secret}
                    onChange={(e) => setEditForm({ ...editForm, secret: e.target.value })}
                    placeholder="Unchanged"
                  />
                  <button type="button" onClick={() => setShowEditSecret((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--admin-text-muted)">
                    {showEditSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={label}>URL</label>
                <input style={inp} value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} />
              </div>
              <div>
                <label style={label}>Notes</label>
                <input style={inp} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <button
                type="submit"
                disabled={savingEdit}
                className="w-full py-2.5 rounded-full text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "var(--admin-accent)" }}
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--admin-scrim)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center border border-(--admin-border)" style={{ background: "var(--admin-surface)" }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--admin-danger-soft)" }}>
              <Trash2 size={18} style={{ color: "var(--admin-danger-text)" }} />
            </div>
            <p className="text-sm font-bold text-(--admin-text) mb-1">Delete “{confirmDelete.label}”?</p>
            <p className="text-xs text-(--admin-text-muted) mb-5">This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-full text-xs font-semibold text-(--admin-text) transition-colors hover:bg-(--admin-hover-bg)"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => removeEntry(confirmDelete)}
                disabled={busyId === confirmDelete.id}
                className="flex-1 py-2 rounded-full text-xs font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "var(--admin-danger)" }}
              >
                {busyId === confirmDelete.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
