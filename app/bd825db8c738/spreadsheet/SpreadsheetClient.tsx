"use client";

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import { Search, Loader2, Plus, ChevronLeft, ChevronRight, Trash2, ArrowUp, ArrowDown, Zap, Upload, Download } from "lucide-react";
import ContactImportModal, { ImportSummary } from "../ContactImportModal";

interface Contact {
  id: number;
  status?: string;
  [key: string]: string | number | undefined;
}

interface ContactList { id: number; name: string; member_count?: number }

// Columns rendered in the grid. `select` renders a status dropdown.
const COLS: { key: string; label: string; w: number; type?: "select" }[] = [
  { key: "list_ids", label: "Contact List", w: 180, type: "select" },
  { key: "status", label: "Status", w: 130, type: "select" },
  { key: "name", label: "Name", w: 180 },
  { key: "first_name", label: "First", w: 110 },
  { key: "last_name", label: "Last", w: 110 },
  { key: "email", label: "Email", w: 230 },
  { key: "title", label: "Title", w: 190 },
  { key: "company", label: "Company", w: 190 },
  // Work address block sits right after the company they work at
  { key: "street_address", label: "Work Address", w: 230 },
  { key: "city", label: "City", w: 140 },
  { key: "state", label: "State", w: 80 },
  { key: "zip_code", label: "ZIP", w: 90 },
  { key: "phone", label: "Work Phone 1", w: 140 },
  { key: "work_phone_2", label: "Work Phone 2", w: 140 },
  { key: "phone_2", label: "Mobile 1", w: 140 },
  { key: "mobile_phone_2", label: "Mobile 2", w: 140 },
  { key: "business_email", label: "Business Email", w: 210 },
  { key: "email_2", label: "Personal Email 1", w: 210 },
  { key: "personal_email_2", label: "Personal Email 2", w: 210 },
  { key: "linkedin", label: "LinkedIn", w: 210 },
  { key: "website", label: "Website", w: 170 },
  { key: "county", label: "County", w: 130 },
  { key: "region", label: "Region", w: 130 },
  { key: "country", label: "Country", w: 90 },
];

// ── Excel export (client-side via SheetJS from CDN) ──────────────────────────
interface XLSXWriteLib {
  utils: {
    aoa_to_sheet: (data: (string | number)[][]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  writeFile: (wb: unknown, filename: string) => void;
}
const loadXLSX = (): Promise<XLSXWriteLib> => {
  const w = window as unknown as { XLSX?: XLSXWriteLib };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as unknown as { XLSX: XLSXWriteLib }).XLSX);
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
};

// Columns for the full export — mirrors /api/export/contacts?full=1. Every value
// is written as a string so Excel keeps them as text (ZIP 02886 stays 02886).
const EXPORT_COLS: { header: string; key: string }[] = [
  { header: "Contact List", key: "lists" },
  { header: "Status", key: "status" },
  { header: "Name", key: "name" },
  { header: "First", key: "first_name" },
  { header: "Last", key: "last_name" },
  { header: "Email", key: "email" },
  { header: "Title", key: "title" },
  { header: "Company", key: "company" },
  { header: "Work Address", key: "street_address" },
  { header: "City", key: "city" },
  { header: "State", key: "state" },
  { header: "ZIP", key: "zip_code" },
  { header: "Work Phone 1", key: "phone" },
  { header: "Work Phone 2", key: "work_phone_2" },
  { header: "Mobile 1", key: "phone_2" },
  { header: "Mobile 2", key: "mobile_phone_2" },
  { header: "Business Email", key: "business_email" },
  { header: "Personal Email 1", key: "email_2" },
  { header: "Personal Email 2", key: "personal_email_2" },
  { header: "LinkedIn", key: "linkedin" },
  { header: "Website", key: "website" },
  { header: "County", key: "county" },
  { header: "Region", key: "region" },
  { header: "Country", key: "country" },
  { header: "Segments", key: "segments" },
  { header: "Notes", key: "notes" },
  { header: "Created At", key: "created_at" },
];

interface GridCellProps {
  rowId: number;
  colKey: string;
  colType?: "select";
  colW: number;
  initialValue: string;
  pendingValue: string | undefined;
  r: number;
  c: number;
  cellRefs: React.MutableRefObject<Map<string, HTMLInputElement | HTMLSelectElement>>;
  onChangePending: (id: number, key: string, value: string | undefined) => void;
  onKeyDown: (e: React.KeyboardEvent, r: number, c: number) => void;
  lists?: ContactList[];
  onAutoSave?: (rowId: number, colKey: string, newVal: string) => Promise<void>;
}

const GridCell = memo(function GridCell({
  rowId,
  colKey,
  colType,
  colW,
  initialValue,
  pendingValue,
  r,
  c,
  cellRefs,
  onChangePending,
  onKeyDown,
  lists,
  onAutoSave,
}: GridCellProps) {
  const isDirty = pendingValue !== undefined;
  const displayValue = isDirty ? pendingValue : initialValue;

  const [val, setVal] = useState(displayValue);
  const [isFocused, setIsFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(displayValue);
  }, [displayValue]);

  const handleBlur = () => {
    setIsFocused(false);
    if (val === initialValue) {
      onChangePending(rowId, colKey, undefined);
    } else {
      onChangePending(rowId, colKey, val);
    }
  };

  const handleSelectChange = async (newVal: string) => {
    setVal(newVal);
    if (colKey === "list_ids" && onAutoSave) {
      setSaving(true);
      try {
        await onAutoSave(rowId, colKey, newVal);
      } catch (err) {
        alert((err as Error).message || "Failed to save list");
        setVal(initialValue);
      } finally {
        setSaving(false);
      }
    } else {
      if (newVal === initialValue) {
        onChangePending(rowId, colKey, undefined);
      } else {
        onChangePending(rowId, colKey, newVal);
      }
    }
  };

  const cellStyle: React.CSSProperties = {
    width: colW,
    background: isFocused ? "rgba(59,130,246,0.08)" : isDirty ? "var(--admin-warning-soft)" : "transparent",
    color: "var(--admin-text)",
    border: isFocused
      ? "2px solid #3b82f6"
      : "2px solid transparent",
    outline: "none",
    padding: "6px 8px",
    transition: "border-color 0.1s, background-color 0.1s",
  };

  if (colKey === "list_ids") {
    const listVal = val ? val.split(",")[0].trim() : "";
    return (
      <div style={{ position: "relative", width: colW, display: "flex", alignItems: "center" }}>
        <select
          ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
          value={listVal}
          disabled={saving}
          onChange={(e) => handleSelectChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => onKeyDown(e, r, c)}
          style={{ ...cellStyle, color: "var(--admin-text)", cursor: saving ? "not-allowed" : "pointer", paddingRight: saving ? "28px" : "8px" }}
        >
          <option value="" style={{ background: "var(--admin-surface)" }}>— None —</option>
          {lists?.map((l) => (
            <option key={l.id} value={String(l.id)} style={{ background: "var(--admin-surface)" }}>
              {l.name}
            </option>
          ))}
        </select>
        {saving && (
          <div style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
            <Loader2 size={13} className="animate-spin text-blue-400" />
          </div>
        )}
      </div>
    );
  }

  if (colType === "select") {
    return (
      <div style={{ position: "relative", width: colW }}>
        <select
          ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
          value={val}
          onChange={(e) => handleSelectChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => onKeyDown(e, r, c)}
          style={{ ...cellStyle, color: "var(--admin-text)", cursor: "pointer" }}
        >
          <option value="active" style={{ background: "var(--admin-surface)" }}>active</option>
          <option value="unsubscribed" style={{ background: "var(--admin-surface)" }}>unsubscribed</option>
          <option value="invalid" style={{ background: "var(--admin-surface)" }}>invalid</option>
        </select>
        {isDirty && (
          <div style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: "0 6px 6px 0",
            borderColor: `transparent var(--admin-warning) transparent transparent`,
            pointerEvents: "none"
          }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: colW }}>
      <input
        ref={(el) => { if (el) cellRefs.current.set(`r${r}c${c}`, el); }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => onKeyDown(e, r, c)}
        spellCheck={false}
        style={cellStyle}
      />
      {isDirty && (
        <div style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: "0 6px 6px 0",
          borderColor: `transparent var(--admin-warning) transparent transparent`,
          pointerEvents: "none"
        }} />
      )}
    </div>
  );
});

const PER_PAGE = 100;

export default function SpreadsheetClient() {
  const [all, setAll] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [listFilter, setListFilter] = useState<number | "all" | "none">("all");
  const [memberIds, setMemberIds] = useState<Set<number> | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [banner, setBanner] = useState("");

  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [selectedAddListId, setSelectedAddListId] = useState<number | "all">("all");
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddListId, setQuickAddListId] = useState<number | "all">("all");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportListId, setExportListId] = useState<number | "all">("all");
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [exportBusy, setExportBusy] = useState(false);
  const [deleteContactInfo, setDeleteContactInfo] = useState<{ id: number; name: string } | null>(null);
  const [showBulkDeleteNoList, setShowBulkDeleteNoList] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Sorting (click a header) and column order (drag a header, persisted per browser)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [colOrder, setColOrder] = useState<string[]>(() => COLS.map((c) => c.key));
  const dragKey = useRef<string | null>(null);
  const suppressClick = useRef(false);
  // Live drag feedback: which column is being dragged and which it will drop before.
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // last-saved snapshot per contact, to know what changed
  const saved = useRef<Map<number, Contact>>(new Map());
  // input refs for keyboard navigation, keyed by "r{row}c{col}"
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());
  // the scrollable grid container, so we can snap to the new row after adding
  const gridRef = useRef<HTMLDivElement>(null);

  // Load a saved column order (client only); reconcile with current columns.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("ss_col_order") || "null");
      if (Array.isArray(raw)) {
        const valid = raw.filter((k) => COLS.some((c) => c.key === k));
        const missing = COLS.map((c) => c.key).filter((k) => !valid.includes(k));
        
        // Reconcile and place missing columns in their default positions from COLS
        const combined = [...valid];
        for (const m of missing) {
          const defaultIdx = COLS.findIndex((c) => c.key === m);
          if (defaultIdx !== -1) {
            combined.splice(defaultIdx, 0, m);
          } else {
            combined.push(m);
          }
        }
        setColOrder(combined);
      }
    } catch { /* ignore */ }
  }, []);

  function saveColOrder(order: string[]) {
    setColOrder(order);
    try { localStorage.setItem("ss_col_order", JSON.stringify(order)); } catch { /* ignore */ }
  }
  function reorderCol(targetKey: string) {
    const from = dragKey.current;
    dragKey.current = null;
    setDraggingKey(null);
    setDragOverKey(null);
    if (!from || from === targetKey) return;
    const fromIdx = colOrder.indexOf(from);
    const targetIdx = colOrder.indexOf(targetKey);
    const after = targetIdx > fromIdx; // dragging rightward → land just after the target
    const order = colOrder.filter((k) => k !== from);
    let ti = order.indexOf(targetKey);
    if (after) ti += 1;
    order.splice(ti, 0, from);
    saveColOrder(order);
  }
  // Which edge of the hovered column the drop-line shows on — matches reorderCol.
  function dropSide(targetKey: string): "left" | "right" | null {
    if (!draggingKey || draggingKey === targetKey) return null;
    return colOrder.indexOf(targetKey) > colOrder.indexOf(draggingKey) ? "right" : "left";
  }
  function toggleSort(key: string) {
    if (suppressClick.current) return; // ignore the click that follows a drag
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else setSortKey(null); // asc → desc → off
  }

  // ids of rows just added in this session, so we can highlight them until saved
  const [newRowIds, setNewRowIds] = useState<Set<number>>(new Set());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts");
      const data = (await res.json()) as Contact[];
      setAll(data);
      saved.current = new Map(data.map((c) => [c.id, { ...c }]));
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    try {
      const r = await fetch("/api/lists");
      setLists(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadAll();
    loadLists();
  }, [loadAll, loadLists]);

  function triggerDownload(url: string) {
    const a = document.createElement("a"); a.href = url; a.click();
  }

  // Export CSV: let the user pick a list (defaults to the one they're viewing) or all.
  function openExport() {
    setExportListId(listFilter === "none" ? "all" : listFilter);
    setShowExportModal(true);
  }
  const exportScopeLabel = () =>
    exportListId === "all"
      ? "all"
      : ((lists.find((l) => l.id === exportListId)?.name || `list-${exportListId}`)
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `list-${exportListId}`);

  async function confirmExport() {
    if (exportFormat === "csv") {
      setShowExportModal(false);
      const url = exportListId === "all"
        ? "/api/export/contacts?filter=all&full=1"
        : `/api/export/contacts?list=${exportListId}&full=1`;
      triggerDownload(url);
      return;
    }

    // Excel: build the workbook from the contacts already in memory. Values are
    // strings, so Excel treats them as text and keeps ZIP leading zeros.
    setExportBusy(true);
    try {
      const scopeRows = exportListId === "all"
        ? all
        : all.filter((c) =>
            String(c.list_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(exportListId))
          );
      const aoa: (string | number)[][] = [EXPORT_COLS.map((col) => col.header)];
      for (const c of scopeRows) {
        aoa.push(EXPORT_COLS.map((col) => {
          const v = c[col.key];
          if (col.key === "created_at" && typeof v === "number") {
            return new Date(v * 1000).toISOString().slice(0, 10);
          }
          return v == null ? "" : String(v);
        }));
      }
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contacts");
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${exportScopeLabel()}-contacts-${date}.xlsx`);
      setShowExportModal(false);
    } catch {
      setBanner("Excel export failed — please try again.");
      setTimeout(() => setBanner(""), 4000);
    } finally {
      setExportBusy(false);
    }
  }

  // Reload everything after a spreadsheet import so new/updated contacts and any
  // newly created list show up immediately in the grid.
  const afterImport = useCallback(async (s: ImportSummary) => {
    const parts = [`${s.added} added`];
    if (s.updated) parts.push(`${s.updated} updated`);
    if (s.skipped) parts.push(`${s.skipped} suppressed`);
    if (s.invalid) parts.push(`${s.invalid} ignored (not a valid email)`);
    setBanner(`Import complete — ${parts.join(" · ")}.`);
    setTimeout(() => setBanner(""), 5000);
    await loadAll();
    await loadLists();
    if (listFilter !== "all" && listFilter !== "none") {
      try {
        const r = await fetch(`/api/lists/${listFilter}/members`);
        const rows = await r.json();
        setMemberIds(new Set(rows.map((x: { id: number }) => x.id)));
      } catch { /* ignore */ }
    }
  }, [loadAll, loadLists, listFilter]);

  useEffect(() => {
    if (listFilter === "all" || listFilter === "none") { setMemberIds(null); return; }
    fetch(`/api/lists/${listFilter}/members`)
      .then((r) => r.json())
      .then((rows: { id: number }[]) => setMemberIds(new Set(rows.map((r) => r.id))))
      .catch(() => setMemberIds(new Set()));
  }, [listFilter]);

  useEffect(() => { setPage(1); }, [listFilter, search]);

  useEffect(() => {
    const hasUnsaved = Object.keys(pendingEdits).length > 0;
    if (typeof window !== "undefined") {
      (window as any).__hasUnsavedChanges = hasUnsaved;
    }

    if (!hasUnsaved) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (typeof window !== "undefined") {
        (window as any).__hasUnsavedChanges = false;
      }
    };
  }, [pendingEdits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (listFilter === "none") {
        if (String(c.list_ids ?? "").trim() !== "") return false;
      } else if (memberIds && !memberIds.has(c.id)) {
        return false;
      }
      if (!q) return true;
      return ["name", "email", "company", "title", "city", "state"].some((k) =>
        String(c[k] ?? "").toLowerCase().includes(q)
      );
    });
  }, [all, memberIds, search, listFilter]);

  // How many contacts belong to no list at all — drives the bulk-delete action.
  const noListCount = useMemo(
    () => all.filter((c) => String(c.list_ids ?? "").trim() === "").length,
    [all]
  );

  // Columns in the user's chosen order
  const orderedCols = useMemo(
    () => colOrder.map((k) => COLS.find((c) => c.key === k)).filter(Boolean) as typeof COLS,
    [colOrder]
  );

  // Sort the filtered rows (empties sink to the bottom); length is unchanged
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "").trim().toLowerCase();
      const bv = String(b[sortKey] ?? "").trim().toLowerCase();
      if (av === bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv, undefined, { numeric: true }) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  function setValue(id: number, key: string, value: string) {
    setAll((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  }

  const onChangePending = useCallback((id: number, key: string, value: string | undefined) => {
    const ck = `${id}-${key}`;
    setPendingEdits((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[ck];
      } else {
        next[ck] = value;
      }
      return next;
    });
  }, []);

  const onAutoSave = useCallback(async (rowId: number, colKey: string, newVal: string) => {
    if (colKey === "list_ids") {
      const listIds = newVal ? [Number(newVal)] : [];
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rowId, listIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update list");
      }
      
      const selectedList = lists.find((l) => String(l.id) === newVal);
      const listName = selectedList ? selectedList.name : "";
      
      setAll((prev) => prev.map((c) => {
        if (c.id === rowId) {
          return { ...c, list_ids: newVal, lists: listName };
        }
        return c;
      }));
      
      const currentContact = all.find((c) => c.id === rowId);
      if (currentContact) {
        saved.current.set(rowId, {
          ...currentContact,
          list_ids: newVal,
          lists: listName,
        });
      }
    }
  }, [all, lists]);

  async function saveChanges() {
    setSaving(true);
    setBanner("");
    const editsArray = Object.entries(pendingEdits);
    if (editsArray.length === 0) { setSaving(false); return; }

    const contactUpdates: Record<number, Record<string, string>> = {};
    for (const [ck, val] of editsArray) {
      const [idStr, key] = ck.split("-");
      const id = Number(idStr);
      if (!contactUpdates[id]) contactUpdates[id] = {};
      contactUpdates[id][key] = val;
    }

    try {
      const updatePromises = Object.entries(contactUpdates).map(async ([idStr, fields]) => {
        const id = Number(idStr);
        const res = await fetch("/api/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...fields }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed");

        const snap = saved.current.get(id);
        Object.entries(fields).forEach(([key, val]) => {
          setValue(id, key, val);
          if (snap) {
            snap[key] = val;
            if (key === "first_name" || key === "last_name") {
              const cur = all.find((c) => c.id === id) || snap;
              const first = key === "first_name" ? val : String(cur.first_name ?? "");
              const last = key === "last_name" ? val : String(cur.last_name ?? "");
              const nm = [first, last].filter(Boolean).join(" ");
              setValue(id, "name", nm); snap.name = nm;
            }
          }
        });
      });

      await Promise.all(updatePromises);
      setPendingEdits({});
      // Once a new row's details are saved, it's no longer "new"
      const savedIds = Object.keys(contactUpdates).map(Number);
      setNewRowIds((prev) => {
        const next = new Set(prev);
        savedIds.forEach((id) => next.delete(id));
        return next;
      });
      setBanner("All changes saved successfully.");
      setTimeout(() => setBanner(""), 3000);
    } catch (err) {
      setBanner((err as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setPendingEdits({});
    setBanner("Discarded unsaved changes.");
    setTimeout(() => setBanner(""), 2000);
  }

  async function deleteRow(id: number) {
    const contact = all.find((c) => c.id === id);
    const name = String(contact?.name || contact?.email || `contact #${id}`);
    setDeleteContactInfo({ id, name });
  }

  async function executeDeleteEntirely(id: number) {
    setDeleteContactInfo(null);
    setPendingEdits((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${id}-`)) delete next[k];
      });
      return next;
    });

    try {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete contact");
      }
      setAll((prev) => prev.filter((c) => c.id !== id));
      saved.current.delete(id);
      setNewRowIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (listFilter !== "all" && memberIds) {
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      setBanner("Contact deleted entirely from database.");
      setTimeout(() => setBanner(""), 3000);
    } catch (err) {
      setBanner((err as Error).message || "Failed to delete contact");
    }
  }

  async function executeDeleteNoList() {
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noList: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Bulk delete failed");
      setShowBulkDeleteNoList(false);
      await loadAll();
      await loadLists();
      const n = Number(data.deleted ?? 0);
      setBanner(`Deleted ${n} contact${n === 1 ? "" : "s"} that had no list.`);
      setTimeout(() => setBanner(""), 4000);
    } catch (err) {
      setBanner((err as Error).message || "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function executeRemoveFromList(contactId: number) {
    setDeleteContactInfo(null);
    if (listFilter === "all" || listFilter === "none") return;

    setPendingEdits((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${contactId}-`)) delete next[k];
      });
      return next;
    });

    try {
      const res = await fetch(`/api/lists/${listFilter}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      if (memberIds) {
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(contactId);
          return next;
        });
      }
      setBanner(`Removed contact from current list.`);
      setTimeout(() => setBanner(""), 3000);
    } catch (err) {
      setBanner((err as Error).message || "Failed to remove member");
    }
  }

  // Google-Sheets-style movement between cells
  function focusCell(r: number, c: number) {
    const el = cellRefs.current.get(`r${r}c${c}`);
    if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
  }
  function onKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    const maxR = pageRows.length - 1;
    const maxC = orderedCols.length - 1;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); focusCell(Math.min(maxR, r + 1), c); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
    else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); c < maxC ? focusCell(r, c + 1) : focusCell(Math.min(maxR, r + 1), 0); }
    else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); c > 0 ? focusCell(r, c - 1) : focusCell(Math.max(0, r - 1), maxC); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusCell(Math.min(maxR, r + 1), c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
  }

  function addRow() {
    setSelectedAddListId(listFilter === "none" ? "all" : listFilter);
    setShowAddRowModal(true);
  }

  // Quick add: pick which list first (defaults to the list you're viewing), then
  // drop a blank NEW row at the top and jump straight into editing it.
  function openQuickAdd() {
    setQuickAddListId(listFilter === "none" ? "all" : listFilter);
    setShowQuickAddModal(true);
  }

  async function confirmQuickAdd() {
    setShowQuickAddModal(false);
    const target = quickAddListId;
    const email = `new.contact.${Date.now()}@edit-me.com`;
    const body: Record<string, unknown> = { contacts: [{ email }] };
    if (target !== "all") body.listId = target;
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSortKey(null);       // newest-first so the new row is at the top
      setSearch("");          // make sure it isn't filtered out
      setPage(1);
      setListFilter(target);  // switch the view to the destination list so the row is visible
      const data = await loadAll();
      const created = data.find((c) => String(c.email) === email);
      if (created) setNewRowIds((prev) => new Set(prev).add(created.id));
      if (target !== "all") {
        const r = await fetch(`/api/lists/${target}/members`);
        const rows = await r.json();
        setMemberIds(new Set(rows.map((x: { id: number }) => x.id)));
      } else {
        setMemberIds(null);
      }
      const listName = target === "all" ? "All Contacts" : lists.find((l) => l.id === target)?.name || "the list";
      setBanner(`Blank row added to ${listName} (marked NEW at the top) — fill it in, then Save.`);
      setTimeout(() => setBanner(""), 4500);
      // Snap the grid to the top-left and focus the new row so it's right in front of you
      setTimeout(() => {
        if (gridRef.current) gridRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        focusCell(0, 0);
      }, 250);
    } catch (err) {
      setBanner((err as Error).message || "Failed to add row");
    }
  }

  async function executeAddRow() {
    setShowAddRowModal(false);
    const email = `new.contact.${Date.now()}@edit-me.com`;
    const body: Record<string, unknown> = { contacts: [{ email }] };
    if (selectedAddListId !== "all") {
      body.listId = selectedAddListId;
    }
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSortKey(null);
      setSearch("");
      const data = await loadAll();
      const created = data.find((c) => String(c.email) === email);
      if (created) setNewRowIds((prev) => new Set(prev).add(created.id));
      if (listFilter !== "all" && listFilter !== "none") {
        const r = await fetch(`/api/lists/${listFilter}/members`);
        const rows = await r.json();
        setMemberIds(new Set(rows.map((x: { id: number }) => x.id)));
      }
      setPage(1);
      const listName = selectedAddListId === "all" ? "All Contacts" : lists.find(l => l.id === selectedAddListId)?.name || "selected list";
      setBanner(`Added new contact to ${listName} (marked NEW at the top).`);
      setTimeout(() => setBanner(""), 4000);
      setTimeout(() => {
        if (gridRef.current) gridRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        focusCell(0, 0);
      }, 150);
    } catch (err) {
      setBanner((err as Error).message || "Failed to add row");
    }
  }

  const selectedName =
    listFilter === "all"
      ? null
      : listFilter === "none"
        ? "Contacts with no list"
        : lists.find((l) => l.id === listFilter)?.name;

  return (
    <div className="flex flex-col gap-4 w-full max-w-full overflow-hidden flex-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          <p className="text-lg font-black text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
            {selectedName ?? "All contacts"} <span className="text-sm font-medium" style={{ color: "var(--admin-text-muted)" }}>· {filtered.length}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            Click a cell to edit · Tab / Enter / arrows to move · <span style={{ color: "var(--admin-text-muted)" }}>click a header to sort</span> · <span style={{ color: "var(--admin-text-muted)" }}>drag a header to reorder (a blue line shows where it lands)</span> · Save when done.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.8rem", padding: "0.45rem 0.7rem 0.45rem 2rem", outline: "none", width: 200 }} />
          </div>
          <select value={listFilter} onChange={(e) => { const v = e.target.value; setListFilter(v === "all" ? "all" : v === "none" ? "none" : Number(v)); }}
            style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.625rem", color: "var(--admin-text)", fontSize: "0.8rem", padding: "0.45rem 0.7rem", outline: "none", cursor: "pointer", maxWidth: 220 }}>
            <option value="all" style={{ background: "var(--admin-surface)" }}>All contacts</option>
            <option value="none" style={{ background: "var(--admin-surface)" }}>— No list —</option>
            {lists.map((l) => <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>)}
          </select>
          {listFilter === "none" && noListCount > 0 && (
            <button onClick={() => setShowBulkDeleteNoList(true)} title="Permanently delete every contact that isn't in any list"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer"
              style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <Trash2 size={14} /> Delete all with no list ({noListCount})
            </button>
          )}
          <ContactImportModal
            lists={lists}
            defaultListId={listFilter === "all" || listFilter === "none" ? null : listFilter}
            onImported={afterImport}
            renderTrigger={(open, busy) => (
              <button onClick={open} disabled={busy} title="Upload a CSV/Excel file and map its columns to contact fields"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
                style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid rgba(165,180,252,0.25)" }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import
              </button>
            )}
          />
          <button onClick={openExport} title="Export contacts to CSV — choose a list or all contacts"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer"
            style={{ background: "var(--admin-surface-2)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
            <Download size={14} /> Export
          </button>
          <button onClick={openQuickAdd} title="Pick a list, then add a blank row at the top ready to edit"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer"
            style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>
            <Zap size={14} /> Quick add
          </button>
          <button onClick={addRow} title="Add a row and choose which list it goes to"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer"
            style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Plus size={14} /> Add row
          </button>
        </div>
      </div>

      {banner && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-medium shrink-0" style={{ background: "rgba(96,165,250,0.1)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.2)" }}>
          {banner} <button onClick={() => setBanner("")} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Grid */}
      <div ref={gridRef} className="spreadsheet-grid" style={{ border: "1px solid var(--admin-border)", borderRadius: "0.75rem", overflow: "auto", maxHeight: "calc(100vh - 190px)", background: "var(--admin-surface)", width: "100%", maxWidth: "100%" }}>
        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--admin-text-muted)" }}>
            <Loader2 size={14} className="animate-spin" /> Loading contacts…
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-20 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>No contacts here.</div>
        ) : (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "0.78rem", width: "max-content" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: "var(--admin-surface)", color: "var(--admin-text-muted)", padding: "8px 10px", fontWeight: 600, textAlign: "left", borderBottom: "2px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", minWidth: 44 }}>#</th>
                {orderedCols.map((col) => {
                  const active = sortKey === col.key;
                  const isDragging = draggingKey === col.key;
                  const side = dragOverKey === col.key ? dropSide(col.key) : null;
                  const dropLine = "0 0 0 2px #3b82f6";
                  return (
                    <th key={col.key}
                      draggable
                      onDragStart={() => { dragKey.current = col.key; setDraggingKey(col.key); }}
                      onDragOver={(e) => { e.preventDefault(); if (col.key !== dragKey.current && dragOverKey !== col.key) setDragOverKey(col.key); }}
                      onDragLeave={() => { setDragOverKey((k) => (k === col.key ? null : k)); }}
                      onDrop={() => reorderCol(col.key)}
                      onDragEnd={() => { setDraggingKey(null); setDragOverKey(null); dragKey.current = null; suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 150); }}
                      onClick={() => toggleSort(col.key)}
                      title="Click to sort · drag to reorder"
                      style={{
                        position: "sticky", top: 0, zIndex: 2,
                        background: side ? "rgba(59,130,246,0.18)" : active ? "var(--admin-surface)" : "var(--admin-surface)",
                        color: active ? "var(--admin-text)" : "var(--admin-text-secondary)",
                        padding: "8px 10px", fontWeight: 600, textAlign: "left",
                        borderBottom: "2px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)",
                        minWidth: col.w, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
                        opacity: isDragging ? 0.4 : 1,
                        boxShadow: side === "left" ? `inset ${dropLine}` : side === "right" ? `inset -2px 0 0 #3b82f6` : "none",
                        transition: "background-color 0.1s, opacity 0.1s",
                      }}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {active && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, r) => {
                const isNew = newRowIds.has(row.id);
                const rowBg = isNew ? "var(--admin-surface)" : r % 2 === 0 ? "var(--admin-surface)" : "var(--admin-surface)";
                return (
                <tr key={row.id} style={{ background: rowBg, boxShadow: isNew ? "inset 3px 0 0 var(--admin-success)" : "none" }}>
                  {(() => {
                    const hasPendingChangesInRow = Object.keys(pendingEdits).some((k) => k.startsWith(`${row.id}-`));
                    return (
                      <td className="group" style={{ position: "sticky", left: 0, zIndex: 1, background: isNew ? "var(--admin-surface)" : "var(--admin-surface)", color: "var(--admin-text-faint)", padding: 0, textAlign: "right", borderBottom: "1px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", fontVariantNumeric: "tabular-nums" }}>
                        <div className="relative flex items-center justify-end w-[44px] h-[36px] px-[10px]">
                          {isNew && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 shrink-0 animate-pulse" title="Just added — fill it in and Save" />
                          )}
                          {hasPendingChangesInRow && !isNew && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 shrink-0" title="Row has unsaved changes" />
                          )}
                          <span className="group-hover:opacity-0 transition-opacity duration-150">
                            {(currentPage - 1) * PER_PAGE + r + 1}
                          </span>
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-red-400 hover:text-red-300 transition-all cursor-pointer bg-(--admin-surface)"
                            title="Delete Row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    );
                  })()}
                  {orderedCols.map((col, c) => {
                    const ck = `${row.id}-${col.key}`;
                    const pendingValue = pendingEdits[ck];
                    return (
                      <td key={col.key} style={{ padding: 0, borderBottom: "1px solid var(--admin-border)", borderRight: "1px solid var(--admin-border)", position: "relative" }}>
                        <GridCell
                          rowId={row.id}
                          colKey={col.key}
                          colType={col.type}
                          colW={col.w}
                          initialValue={String(row[col.key] ?? "")}
                          pendingValue={pendingValue}
                          r={r}
                          c={c}
                          cellRefs={cellRefs}
                          onChangePending={onChangePending}
                          onKeyDown={onKeyDown}
                          lists={lists}
                          onAutoSave={onAutoSave}
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
          <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
            {(currentPage - 1) * PER_PAGE + 1}–{Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 hover:bg-(--admin-hover-bg) cursor-pointer"
              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
              <ChevronLeft size={13} /> Prev
            </button>
            <span className="text-xs font-semibold" style={{ color: "var(--admin-text-secondary)" }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 hover:bg-(--admin-hover-bg) cursor-pointer"
              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Save Panel */}
      {Object.keys(pendingEdits).length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 px-4 py-3 rounded-xl shadow-2xl border transition-all duration-300 flex-wrap sm:flex-nowrap"
             style={{
               background: "var(--admin-surface)",
               borderColor: "var(--admin-warning-soft)",
               width: "calc(100% - 32px)",
               maxWidth: "460px",
               boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)"
             }}>
          <div className="flex flex-col gap-0.5 max-w-[280px]">
            <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes ({Object.keys(pendingEdits).length})
            </p>
            <p className="text-[0.7rem] text-(--admin-text-muted) truncate">
              {Object.keys(pendingEdits).map(k => {
                const [id, key] = k.split("-");
                const contact = all.find(c => String(c.id) === id);
                const fieldLabel = COLS.find(c => c.key === key)?.label || key;
                return `${contact?.name || `Row #${id}`}: ${fieldLabel}`;
              }).join(", ")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={discardChanges} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-(--admin-hover-bg) cursor-pointer text-(--admin-text-muted) disabled:opacity-40 select-none">
              Discard
            </button>
            <button onClick={saveChanges} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 select-none">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Export Modal — choose which list to export (or all contacts) */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
          onKeyDown={(e) => { if (e.key === "Enter") confirmExport(); if (e.key === "Escape") setShowExportModal(false); }}>
          <div className="w-full max-w-sm rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-1 flex items-center gap-1.5"><Download size={14} /> Export contacts</h3>
            <p className="text-xs text-(--admin-text-muted) mb-4">Export every contact, or only the members of a specific list.</p>

            <label className="text-[0.7rem] uppercase tracking-wide text-(--admin-text-faint) font-semibold">Export from</label>
            <select
              autoFocus
              value={exportListId}
              onChange={(e) => setExportListId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-full mt-1 mb-4 px-3 py-2 rounded-lg text-xs"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", color: "var(--admin-text)", outline: "none", cursor: "pointer" }}
            >
              <option value="all" style={{ background: "var(--admin-surface)" }}>All contacts</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
              ))}
            </select>

            <label className="text-[0.7rem] uppercase tracking-wide text-(--admin-text-faint) font-semibold">Format</label>
            <div className="flex gap-1 mt-1 mb-1.5 p-1 rounded-lg" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
              {(["csv", "xlsx"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setExportFormat(f)}
                  className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                  style={exportFormat === f
                    ? { background: "rgba(96,165,250,0.18)", color: "#93c5fd" }
                    : { background: "transparent", color: "var(--admin-text-secondary)" }}>
                  {f === "csv" ? "CSV" : "Excel (.xlsx)"}
                </button>
              ))}
            </div>
            <p className="text-[0.7rem] text-(--admin-text-faint) mb-5">
              {exportFormat === "xlsx"
                ? "Excel keeps ZIP codes as text, so leading zeros (02886) are preserved."
                : "CSV opens anywhere; ZIP codes are written as text to keep leading zeros."}
            </p>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button onClick={() => setShowExportModal(false)} disabled={exportBusy} className="px-3 py-1.5 rounded-lg text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={confirmExport} disabled={exportBusy} className="px-4 py-1.5 rounded-lg bg-(--admin-hover-bg) text-(--admin-text) hover:bg-(--admin-hover-bg) cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                {exportBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download {exportFormat === "csv" ? "CSV" : "Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal — choose the destination list, then jump into editing */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
          onKeyDown={(e) => { if (e.key === "Enter") confirmQuickAdd(); if (e.key === "Escape") setShowQuickAddModal(false); }}>
          <div className="w-full max-w-sm rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "rgba(96,165,250,0.25)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-1 flex items-center gap-1.5"><Zap size={14} className="text-blue-400" /> Quick add contact</h3>
            <p className="text-xs text-(--admin-text-muted) mb-4">Which list should this new contact go into? A blank row will appear at the top, marked <span className="text-green-400 font-semibold">NEW</span>, ready to edit.</p>

            <label className="text-[0.7rem] uppercase tracking-wide text-(--admin-text-faint) font-semibold">Add to list</label>
            <select
              autoFocus
              value={quickAddListId}
              onChange={(e) => setQuickAddListId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-full mt-1 mb-5 px-3 py-2 rounded-lg text-xs"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", color: "var(--admin-text)", outline: "none", cursor: "pointer" }}
            >
              <option value="all" style={{ background: "var(--admin-surface)" }}>All Contacts (no specific list)</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button onClick={() => setShowQuickAddModal(false)} className="px-3 py-1.5 rounded-lg text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer">Cancel</button>
              <button onClick={confirmQuickAdd} className="px-4 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 cursor-pointer flex items-center gap-1.5">
                <Zap size={13} /> Add &amp; edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Row Modal */}
      {showAddRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-sm rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-3">Add Row to List</h3>
            <p className="text-xs text-(--admin-text-muted) mb-4">Choose which list this new contact should be added to:</p>
            
            <select
              value={selectedAddListId}
              onChange={(e) => setSelectedAddListId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-full mb-5 px-3 py-2 rounded-lg text-xs"
              style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", color: "var(--admin-text)", outline: "none", cursor: "pointer" }}
            >
              <option value="all" style={{ background: "var(--admin-surface)" }}>All Contacts (No specific list)</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id} style={{ background: "var(--admin-surface)" }}>{l.name}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button
                onClick={() => setShowAddRowModal(false)}
                className="px-3 py-1.5 rounded-lg text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeAddRow}
                className="px-4 py-1.5 rounded-lg bg-green-500 text-slate-950 hover:bg-green-400 cursor-pointer"
              >
                Add Row
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete/Remove Row Modal */}
      {deleteContactInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-2">Delete or Remove Row</h3>
            <p className="text-xs text-(--admin-text-secondary) mb-4">
              You are about to delete <span className="font-semibold text-(--admin-text)">{deleteContactInfo.name}</span>.
            </p>

            {listFilter === "all" || listFilter === "none" ? (
              <p className="text-xs text-(--admin-text-muted) mb-5">
                This will permanently delete the contact entirely from the database and remove them from all lists. This action cannot be undone.
              </p>
            ) : (
              <p className="text-xs text-(--admin-text-muted) mb-5">
                Do you want to just remove them from the current list <span className="font-semibold text-(--admin-text)">"{selectedName}"</span>, or delete them entirely from the database?
              </p>
            )}

            <div className="flex justify-end gap-2 text-xs font-bold flex-wrap">
              <button
                onClick={() => setDeleteContactInfo(null)}
                className="px-3 py-1.5 rounded-lg text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer"
              >
                Cancel
              </button>
              
              {listFilter !== "all" && listFilter !== "none" && (
                <button
                  onClick={() => executeRemoveFromList(deleteContactInfo.id)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                >
                  Remove from List
                </button>
              )}
              
              <button
                onClick={() => executeDeleteEntirely(deleteContactInfo.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-400 cursor-pointer"
              >
                Delete Entirely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete — every contact that isn't in any list */}
      {showBulkDeleteNoList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
          onKeyDown={(e) => { if (e.key === "Escape") setShowBulkDeleteNoList(false); }}>
          <div className="w-full max-w-md rounded-xl p-5 border" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-danger-soft)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-sm font-bold text-(--admin-text) mb-2 flex items-center gap-1.5"><Trash2 size={14} className="text-red-400" /> Delete contacts with no list</h3>
            <p className="text-xs text-(--admin-text-secondary) mb-2">
              This permanently deletes all <span className="font-semibold text-(--admin-text)">{noListCount}</span> contact{noListCount === 1 ? "" : "s"} that aren&apos;t in any list.
            </p>
            <p className="text-xs text-(--admin-text-muted) mb-5">
              They&apos;ll be removed from the database entirely and this cannot be undone. Contacts that belong to at least one list are not affected.
            </p>
            <div className="flex justify-end gap-2 text-xs font-bold">
              <button onClick={() => setShowBulkDeleteNoList(false)} disabled={bulkDeleting} className="px-3 py-1.5 rounded-lg text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={executeDeleteNoList} disabled={bulkDeleting} className="px-4 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-400 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete {noListCount} contact{noListCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
