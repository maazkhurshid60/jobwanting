"use client";

// Bounced Emails, as an editable spreadsheet (same feel as the main Spreadsheet
// page). Rows are the bounced/blocked/invalid addresses joined to their full
// contact record, so every field is editable inline and saved in a batch. Extra,
// read-only columns show the bounce info (Reason, Bounced date, Last emailed), and
// a sticky action column keeps Release / Delete. Correcting the Email cell and
// saving fixes the address AND releases it back to sendable.

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import {
  Search, Loader2, ChevronLeft, ChevronRight, Trash2, RotateCcw,
  ArrowUp, ArrowDown, Download, Upload, FileSpreadsheet, RefreshCw,
} from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ContactList { id: number; name: string }

interface Row {
  id: number | null; // contact id (null = suppression entry with no contact record)
  email: string;
  reason: string;
  bounced_at: number;
  last_sent: number | null;
  send_count: number;
  lists?: string | null;
  list_ids?: string | null;
  [key: string]: string | number | null | undefined;
}

// Column model. `readOnly` cells (bounce info) render as text; the rest are
// editable. `kind` picks the editor (list / status select, date display, etc.).
type Kind = "text" | "list" | "status" | "date" | "lastsent" | "reason";
const COLS: { key: string; label: string; w: number; readOnly?: boolean; kind?: Kind }[] = [
  { key: "reason", label: "Reason", w: 150, readOnly: true, kind: "reason" },
  { key: "bounced_at", label: "Bounced", w: 120, readOnly: true, kind: "date" },
  { key: "last_sent", label: "Last Emailed", w: 140, readOnly: true, kind: "lastsent" },
  { key: "list_ids", label: "List", w: 175, kind: "list" },
  { key: "status", label: "Status", w: 120, kind: "status" },
  { key: "name", label: "Name", w: 170 },
  { key: "first_name", label: "First", w: 110 },
  { key: "last_name", label: "Last", w: 110 },
  { key: "email", label: "Email", w: 230 },
  { key: "title", label: "Title", w: 180 },
  { key: "company", label: "Company", w: 180 },
  { key: "street_address", label: "Work Address", w: 220 },
  { key: "city", label: "City", w: 130 },
  { key: "state", label: "State", w: 80 },
  { key: "zip_code", label: "ZIP", w: 90 },
  { key: "phone", label: "Work Phone 1", w: 140 },
  { key: "work_phone_2", label: "Work Phone 2", w: 140 },
  { key: "phone_2", label: "Mobile 1", w: 140 },
  { key: "mobile_phone_2", label: "Mobile 2", w: 140 },
  { key: "business_email", label: "Business Email", w: 200 },
  { key: "email_2", label: "Personal Email 1", w: 200 },
  { key: "personal_email_2", label: "Personal Email 2", w: 200 },
  { key: "linkedin", label: "LinkedIn", w: 200 },
  { key: "website", label: "Website", w: 160 },
  { key: "county", label: "County", w: 120 },
  { key: "region", label: "Region", w: 120 },
  { key: "country", label: "Country", w: 90 },
];

const loadXLSX = (): Promise<any> => {
  if (typeof window === "undefined") return Promise.resolve(null);
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as any).XLSX);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
};

// Columns our export uses — re-uploads are matched header→field by exact key.
const IMPORT_KEYS = new Set([
  "id", "email", "name", "first_name", "last_name", "title", "company",
  "business_email", "email_2", "personal_email_2",
  "phone", "work_phone_2", "phone_2", "mobile_phone_2",
  "linkedin", "website",
  "street_address", "city", "state", "zip_code", "county", "region", "country",
]);
function headerToKey(header: string): string | null {
  const k = String(header).trim().toLowerCase().replace(/\s+/g, "_");
  return IMPORT_KEYS.has(k) ? k : null;
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const rowKey = (r: Row) => (r.id != null ? `c${r.id}` : `e${String(r.email).toLowerCase()}`);

// ── One editable / read-only grid cell ──────────────────────────────────────
interface CellProps {
  rk: string;
  rowId: number | null;
  col: (typeof COLS)[number];
  initialValue: string;
  pendingValue: string | undefined;
  r: number; c: number;
  row: Row;
  lists: ContactList[];
  cellRefs: React.MutableRefObject<Map<string, HTMLInputElement | HTMLSelectElement>>;
  onChangePending: (rk: string, key: string, value: string | undefined) => void;
  onKeyDown: (e: React.KeyboardEvent, r: number, c: number) => void;
  onAutoSaveList: (rk: string, rowId: number, newVal: string) => Promise<void>;
}

const GridCell = memo(function GridCell({
  rk, rowId, col, initialValue, pendingValue, r, c, row, lists, cellRefs, onChangePending, onKeyDown, onAutoSaveList,
}: CellProps) {
  const isDirty = pendingValue !== undefined;
  const displayValue = isDirty ? pendingValue : initialValue;
  const [val, setVal] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(displayValue); }, [displayValue]);

  const base: React.CSSProperties = {
    width: col.w,
    background: focused ? "rgba(59,130,246,0.08)" : isDirty ? "rgba(245,158,11,0.03)" : "transparent",
    color: "var(--admin-text)", border: focused ? "2px solid #3b82f6" : "2px solid transparent",
    outline: "none", padding: "6px 8px", transition: "border-color .1s, background-color .1s",
  };

  // Read-only bounce columns
  if (col.readOnly) {
    if (col.kind === "reason") {
      return (
        <div style={{ width: col.w, padding: "6px 8px" }}>
          {/* Bounce-reason chip stays amber/warning-family, not part of the
              danger recolor — precedent from the prior red→indigo pass. */}
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold inline-block max-w-full truncate"
            style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)", border: "1px solid rgba(245,158,11,0.15)" }}
            title={row.reason}>{row.reason}</span>
        </div>
      );
    }
    if (col.kind === "date") {
      return <div style={{ width: col.w, padding: "6px 8px", fontSize: "0.72rem", color: "var(--admin-text-muted)" }}>{fmtDate(row.bounced_at)}</div>;
    }
    // lastsent
    return (
      <div style={{ width: col.w, padding: "6px 8px", fontSize: "0.72rem" }}>
        {row.last_sent ? (
          <span style={{ color: "var(--admin-text-secondary)" }}>
            {fmtDate(row.last_sent)}{row.send_count > 1 && <span style={{ color: "var(--admin-success)", marginLeft: 5 }}>×{row.send_count}</span>}
          </span>
        ) : <span style={{ color: "var(--admin-text-faint)" }}>Never</span>}
      </div>
    );
  }

  if (col.kind === "list") {
    const listVal = val ? val.split(",")[0].trim() : "";
    return (
      <div style={{ position: "relative", width: col.w, display: "flex", alignItems: "center" }}>
        <select
          ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
          value={listVal}
          disabled={saving || rowId == null}
          onChange={async (e) => {
            const nv = e.target.value; setVal(nv);
            if (rowId == null) return;
            setSaving(true);
            try { await onAutoSaveList(rk, rowId, nv); }
            catch (err) { alert((err as Error).message || "Failed to save list"); setVal(initialValue); }
            finally { setSaving(false); }
          }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={(e) => onKeyDown(e, r, c)}
          style={{ ...base, color: "var(--admin-text)", cursor: rowId == null ? "not-allowed" : "pointer" }}
        >
          <option value="" style={{ background: "var(--admin-surface)" }}>— None —</option>
          {lists.map((l) => <option key={l.id} value={String(l.id)} style={{ background: "var(--admin-surface)" }}>{l.name}</option>)}
        </select>
        {saving && <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Loader2 size={13} className="animate-spin text-blue-400" /></div>}
      </div>
    );
  }

  if (col.kind === "status") {
    return (
      <select
        ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
        value={val} disabled={rowId == null}
        onChange={(e) => { const nv = e.target.value; setVal(nv); onChangePending(rk, col.key, nv === initialValue ? undefined : nv); }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onKeyDown={(e) => onKeyDown(e, r, c)}
        style={{ ...base, color: "var(--admin-text)", cursor: rowId == null ? "not-allowed" : "pointer" }}
      >
        <option value="active" style={{ background: "var(--admin-surface)" }}>active</option>
        <option value="unsubscribed" style={{ background: "var(--admin-surface)" }}>unsubscribed</option>
        <option value="invalid" style={{ background: "var(--admin-surface)" }}>invalid</option>
      </select>
    );
  }

  // Text input (email + all other contact fields). Non-email fields need a
  // contact id to save; email can always be corrected (fix + release).
  const editable = col.key === "email" || rowId != null;
  return (
    <div style={{ position: "relative", width: col.w }}>
      <input
        ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
        value={val} readOnly={!editable}
        onChange={(e) => setVal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onChangePending(rk, col.key, val === initialValue ? undefined : val); }}
        onKeyDown={(e) => onKeyDown(e, r, c)}
        spellCheck={false}
        style={{ ...base, opacity: editable ? 1 : 0.45, cursor: editable ? "text" : "not-allowed" }}
      />
      {isDirty && <div style={{ position: "absolute", top: 2, right: 2, width: 0, height: 0, borderStyle: "solid", borderWidth: "0 6px 6px 0", borderColor: "transparent #f59e0b transparent transparent", pointerEvents: "none" }} />}
    </div>
  );
});

const PER_PAGE = 100;
const inputStyle = { border: "1px solid var(--admin-border)", color: "var(--admin-text)", background: "var(--admin-surface-2)", borderRadius: "0.625rem", padding: "0.45rem 0.7rem", fontSize: "0.8rem", outline: "none" };

export default function BouncedClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [listFilter, setListFilter] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [deleteInfo, setDeleteInfo] = useState<{ id: number | null; email: string; name: string } | null>(null);

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const saved = useRef<Map<string, Row>>(new Map());
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([fetch("/api/contacts/bounced"), fetch("/api/contacts")]);
      const bounced: any[] = bRes.ok ? await bRes.json() : [];
      const contacts: any[] = cRes.ok ? await cRes.json() : [];
      const byId = new Map<number, any>(); const byEmail = new Map<string, any>();
      for (const c of contacts) { byId.set(c.id, c); byEmail.set(String(c.email).toLowerCase(), c); }
      const merged: Row[] = bounced.map((b) => {
        const full = (b.contact_id != null ? byId.get(b.contact_id) : null) || byEmail.get(String(b.email).toLowerCase()) || {};
        return {
          ...full,
          id: b.contact_id ?? full.id ?? null,
          email: b.email,
          reason: b.reason,
          bounced_at: Number(b.created_at),
          last_sent: b.last_sent != null ? Number(b.last_sent) : null,
          send_count: Number(b.send_count ?? 0),
          status: b.status ?? full.status ?? "active",
          name: b.name ?? full.name ?? "",
          company: b.company ?? full.company ?? "",
          title: b.title ?? full.title ?? "",
          lists: b.lists ?? full.lists ?? null,
          list_ids: b.list_ids ?? full.list_ids ?? null,
        } as Row;
      });
      setRows(merged);
      saved.current = new Map(merged.map((r) => [rowKey(r), { ...r }]));
    } catch (e: any) {
      setError(e?.message || "Failed to load bounced contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    fetch("/api/lists").then((r) => (r.ok ? r.json() : [])).then(setLists).catch(() => {});
  }, [loadData]);

  useEffect(() => { setPage(1); }, [search, listFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (listFilter !== "all") {
        const ids = String(r.list_ids ?? "").split(",").map((s) => s.trim());
        if (!ids.includes(String(listFilter))) return false;
      }
      if (!q) return true;
      return ["name", "email", "company", "title", "reason", "lists"].some((k) => String(r[k] ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, listFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "").trim().toLowerCase();
      const bv = String(b[sortKey] ?? "").trim().toLowerCase();
      if (av === bv) return 0; if (!av) return 1; if (!bv) return -1;
      return av.localeCompare(bv, undefined, { numeric: true }) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else setSortKey(null);
  }

  const onChangePending = useCallback((rk: string, key: string, value: string | undefined) => {
    const ck = `${rk}::${key}`;
    setPendingEdits((prev) => { const next = { ...prev }; if (value === undefined) delete next[ck]; else next[ck] = value; return next; });
  }, []);

  const onAutoSaveList = useCallback(async (rk: string, rowId: number, newVal: string) => {
    const listIds = newVal ? [Number(newVal)] : [];
    const res = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rowId, listIds }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to update list"); }
    const name = lists.find((l) => String(l.id) === newVal)?.name ?? "";
    setRows((prev) => prev.map((r) => (rowKey(r) === rk ? { ...r, list_ids: newVal, lists: name } : r)));
    const snap = saved.current.get(rk); if (snap) { snap.list_ids = newVal; snap.lists = name; }
  }, [lists]);

  // Google-Sheets-style cell movement
  function focusCell(r: number, c: number) { const el = cellRefs.current.get(`r${r}c${c}`); if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); } }
  function onKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    const maxR = pageRows.length - 1, maxC = COLS.length - 1;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); focusCell(Math.min(maxR, r + 1), c); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
    else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); c < maxC ? focusCell(r, c + 1) : focusCell(Math.min(maxR, r + 1), 0); }
    else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); c > 0 ? focusCell(r, c - 1) : focusCell(Math.max(0, r - 1), maxC); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusCell(Math.min(maxR, r + 1), c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
  }

  async function saveChanges() {
    const edits = Object.entries(pendingEdits);
    if (edits.length === 0) return;
    setSaving(true); setBanner(""); setError("");
    const byRow: Record<string, Record<string, string>> = {};
    for (const [k, v] of edits) { const idx = k.indexOf("::"); const rk = k.slice(0, idx); const key = k.slice(idx + 2); (byRow[rk] ??= {})[key] = v; }
    try {
      for (const [rk, fields] of Object.entries(byRow)) {
        const row = rows.find((r) => rowKey(r) === rk); if (!row) continue;
        const snap = saved.current.get(rk);
        const oldEmail = String(snap?.email ?? row.email).toLowerCase();
        const newEmail = fields.email !== undefined ? fields.email.trim().toLowerCase() : null;
        const emailChanged = newEmail !== null && newEmail !== oldEmail;

        const nonEmail: Record<string, string> = { ...fields }; delete nonEmail.email;
        if (Object.keys(nonEmail).length && row.id != null) {
          const res = await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, ...nonEmail }) });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Save failed"); }
        }
        if (emailChanged) {
          // Correct the address AND release it from suppression (fix + release)
          const res = await fetch("/api/contacts/bounced", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldEmail, newEmail }) });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to fix email"); }
        }
      }
      setPendingEdits({});
      setBanner("Changes saved. Fixed addresses were released back to sendable.");
      setTimeout(() => setBanner(""), 4000);
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() { setPendingEdits({}); }

  async function release(email: string) {
    if (!confirm(`Release ${email} back to your sendable list without changing the address?\n\nOnly do this if you believe the bounce was temporary — a permanently dead address will just bounce again.`)) return;
    try {
      setBusy(true); setError("");
      const res = await fetch("/api/contacts/bounced", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to release"); }
      setBanner(`Released ${email} — they can be emailed again.`); setTimeout(() => setBanner(""), 3000);
      await loadData();
    } catch (e: any) { setError(e?.message || "Failed to release"); } finally { setBusy(false); }
  }

  async function executeDelete() {
    if (!deleteInfo) return;
    const { id, email } = deleteInfo; setDeleteInfo(null);
    try {
      setBusy(true); setError("");
      const reqs = [fetch("/api/contacts/bounced", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })];
      if (id != null) reqs.push(fetch("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }));
      const res = await Promise.all(reqs);
      const bad = res.find((r) => !r.ok); if (bad) { const d = await bad.json().catch(() => ({})); throw new Error(d.error || "Delete failed"); }
      setBanner(`Deleted ${email} entirely.`); setTimeout(() => setBanner(""), 3000);
      await loadData();
    } catch (e: any) { setError(e?.message || "Delete failed"); } finally { setBusy(false); }
  }

  function downloadCsv() {
    const a = document.createElement("a");
    a.href = `/api/export/bounced${listFilter !== "all" ? `?list=${listFilter}` : ""}`;
    a.click();
  }
  async function downloadExcel() {
    try {
      setExporting(true); setError("");
      const XLSX = await loadXLSX();
      const res = await fetch(`/api/export/bounced?format=json${listFilter !== "all" ? `&list=${listFilter}` : ""}`);
      const data = await res.json();
      const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bounced");
      XLSX.writeFile(wb, `bounced-contacts-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) { setError(e?.message || "Excel export failed"); } finally { setExporting(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = ""; if (!file) return;
    try {
      setUploading(true); setError(""); setBanner("");
      const XLSX = await loadXLSX();
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array", cellText: true, cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as any[][];
      if (grid.length < 2) throw new Error("That file has a header row but no data rows.");
      const rawHeaders = grid[0].map((h: any) => String(h ?? "").trim());
      const keys = rawHeaders.map((h: string) => headerToKey(h));
      if (!keys.some((k) => k === "id" || k === "email")) throw new Error("Couldn't find an 'id' or 'email' column. Upload the file exported from this page.");
      const norm = (h: string) => h.toLowerCase().replace(/\s+/g, "_");
      const KEEP_HEADERS = ["keep", "keep_bounced", "do_not_email", "donotemail", "note", "notes", "action"];
      let keepIdx = rawHeaders.findIndex((h: string) => KEEP_HEADERS.includes(norm(h)));
      if (keepIdx === -1 && rawHeaders.length && rawHeaders[rawHeaders.length - 1] === "") keepIdx = rawHeaders.length - 1;
      const reasonIdx = rawHeaders.findIndex((h: string) => norm(h) === "bounce_reason");
      const isSystemReason = (v: string) => /^(bounced|blocked|invalid)$/i.test(v.trim());
      const uploadRows = grid.slice(1).map((cells) => {
        const o: Record<string, string> = {};
        keys.forEach((k, i) => { if (k) o[k] = cells[i] == null ? "" : String(cells[i]); });
        let keepNote = keepIdx >= 0 ? String(cells[keepIdx] ?? "").trim() : "";
        if (!keepNote && reasonIdx >= 0) { const rv = String(cells[reasonIdx] ?? "").trim(); if (rv && !isSystemReason(rv)) keepNote = rv; }
        if (keepNote) o.__keep = keepNote;
        return o;
      }).filter((o) => (o.id && o.id.trim()) || (o.email && o.email.trim()));
      if (uploadRows.length === 0) throw new Error("No rows with an id or email were found.");
      const res = await fetch("/api/contacts/bounced", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: uploadRows }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setBanner(`Applied ${uploadRows.length} row${uploadRows.length === 1 ? "" : "s"}: ${data.released} fixed & released · ${data.kept} kept in bounced${data.invalid ? ` · ${data.invalid} invalid skipped` : ""}${data.notFound ? ` · ${data.notFound} not matched` : ""}`);
      await loadData();
    } catch (e: any) { setError(e?.message || "Upload failed"); } finally { setUploading(false); }
  }

  const btn = "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-(--admin-hover-bg)";
  const dirtyCount = Object.keys(pendingEdits).length;

  return (
    <div className="flex flex-col gap-4 w-full max-w-full overflow-hidden flex-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          <p className="text-lg font-black text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
            Bounced contacts <span className="text-sm font-medium" style={{ color: "var(--admin-text-muted)" }}>· {filtered.length}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            Edit any cell and Save · fixing the <span style={{ color: "var(--admin-text-muted)" }}>Email</span> releases them back to sendable · click a header to sort.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, padding: "0.45rem 0.7rem 0.45rem 2rem", width: 190 }} />
          </div>
          <select value={listFilter} onChange={(e) => setListFilter(e.target.value === "all" ? "all" : Number(e.target.value))} title="Filter by list — also scopes the export" style={{ ...inputStyle, cursor: "pointer", maxWidth: 190 }}>
            <option value="all" style={{ background: "var(--admin-surface)" }}>All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>)}
          </select>
          <button onClick={downloadCsv} className={btn} style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }} title="Export (scoped to the selected list)"><Download size={13} /> CSV</button>
          <button onClick={downloadExcel} disabled={exporting} className={btn} style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}>{exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Excel</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid rgba(34,197,94,0.2)" }}>{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{uploading ? "Applying…" : "Upload fixed file"}</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={{ display: "none" }} />
          <button onClick={loadData} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-(--admin-hover-bg)" style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }} title="Refresh"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {banner && <div className="px-4 py-2.5 rounded-xl text-xs font-medium shrink-0" style={{ background: "rgba(96,165,250,0.1)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.2)" }}>{banner} <button onClick={() => setBanner("")} className="ml-2 underline">dismiss</button></div>}
      {error && <div className="px-4 py-2.5 rounded-xl text-xs font-medium shrink-0" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid rgba(239,68,68,0.2)" }}>{error} <button onClick={() => setError("")} className="ml-2 underline">dismiss</button></div>}

      {/* Grid */}
      <div ref={gridRef} className="spreadsheet-grid" style={{ border: "1px solid var(--admin-border)", borderRadius: "0.75rem", overflow: "auto", maxHeight: "calc(100vh - 190px)", background: "var(--admin-surface)", width: "100%", maxWidth: "100%" }}>
        {loading && rows.length === 0 ? (
          <div className="py-20 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--admin-text-muted)" }}><Loader2 size={14} className="animate-spin" /> Loading bounced contacts…</div>
        ) : pageRows.length === 0 ? (
          <div className="py-20 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>{rows.length === 0 ? "No bounced addresses — your list is clean." : "No bounced contacts match your filter."}</div>
        ) : (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "0.78rem", width: "max-content" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: "var(--admin-surface)", color: "var(--admin-text-muted)", padding: "8px 10px", fontWeight: 600, textAlign: "left", borderBottom: "2px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", minWidth: 150 }}>Actions</th>
                {COLS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th key={col.key} onClick={() => toggleSort(col.key)} title="Click to sort"
                      style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--admin-surface)", color: active ? "var(--admin-text)" : "var(--admin-text-secondary)", padding: "8px 10px", fontWeight: 600, textAlign: "left", borderBottom: "2px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", minWidth: col.w, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                      <span className="inline-flex items-center gap-1">{col.label}{active && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, r) => {
                const rk = rowKey(row);
                const bg = "var(--admin-surface)";
                return (
                  <tr key={rk} style={{ background: bg }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: bg, borderBottom: "1px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", padding: "4px 8px" }}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => release(row.email)} disabled={busy} title="Release without changing the email" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all hover:scale-[1.03] disabled:opacity-50" style={{ background: "var(--admin-surface-2)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}><RotateCcw size={11} /> Release</button>
                        <button onClick={() => setDeleteInfo({ id: row.id, email: row.email, name: String(row.name || row.email) })} disabled={busy} title="Delete entirely" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all hover:scale-[1.03] disabled:opacity-50" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger)", border: "1px solid rgba(239,68,68,0.2)" }}><Trash2 size={11} /></button>
                      </div>
                    </td>
                    {COLS.map((col, c) => {
                      const ck = `${rk}::${col.key}`;
                      return (
                        <td key={col.key} style={{ padding: 0, borderBottom: "1px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", position: "relative" }}>
                          <GridCell
                            rk={rk} rowId={row.id} col={col}
                            initialValue={String(row[col.key] ?? "")}
                            pendingValue={pendingEdits[ck]}
                            r={r} c={c} row={row} lists={lists} cellRefs={cellRefs}
                            onChangePending={onChangePending} onKeyDown={onKeyDown} onAutoSaveList={onAutoSaveList}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pager */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>{(currentPage - 1) * PER_PAGE + 1}–{Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}><ChevronLeft size={13} /> Prev</button>
            <span className="text-xs font-semibold" style={{ color: "var(--admin-text-muted)" }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>Next <ChevronRight size={13} /></button>
          </div>
        </div>
      )}

      {/* Floating Save bar */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 px-4 py-3 rounded-xl shadow-2xl border flex-wrap sm:flex-nowrap" style={{ background: "var(--admin-surface)", borderColor: "rgba(245,158,11,0.3)", width: "calc(100% - 32px)", maxWidth: 460 }}>
          <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Unsaved changes ({dirtyCount})</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={discardChanges} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-(--admin-hover-bg) text-slate-400 disabled:opacity-40">Discard</button>
            <button onClick={saveChanges} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : null} Save Changes</button>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-2">Delete Bounced Contact</h3>
            <p className="text-xs text-slate-300 mb-4">You are about to delete <span className="font-semibold text-(--admin-text)">{deleteInfo.name}</span>.</p>
            <p className="text-xs text-slate-400 mb-5">This permanently deletes the contact from the database, removes all list memberships, and clears their bounce record. This cannot be undone.</p>
            <div className="flex justify-end gap-2 text-xs font-bold">
              <button onClick={() => setDeleteInfo(null)} className="px-3 py-1.5 rounded-lg text-slate-400 hover:bg-(--admin-hover-bg)">Cancel</button>
              <button onClick={executeDelete} className="px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-400">Delete Entirely</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
