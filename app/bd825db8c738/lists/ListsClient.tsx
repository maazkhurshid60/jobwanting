"use client";

import { useState, useEffect, useRef, useCallback, FormEvent, useMemo, KeyboardEvent } from "react";
import {
  Plus, Trash2, X, Users, UserMinus, ChevronLeft, Check,
  Search, UploadCloud, CheckSquare, Square, RefreshCw,
  Layers, List as ListIcon, ChevronDown, ChevronRight, Pencil, MapPin,
} from "lucide-react";
import { ToastProvider, toast, Spinner } from "../Toast";

interface ContactList {
  id: number;
  name: string;
  member_count: number;
  created_at: number;
  campaign_count?: number;
  last_sent_at?: number | null;
}

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

interface Contact {
  id: number;
  email: string;
  name: string;
  status: string;
  lists?: string | null;
  campaigns_sent?: number;
  send_count?: number;
  title: string;
  company: string;
  city?: string;
  state?: string;
}

// "City, ST" — only the parts that exist
function locationOf(c: { city?: string; state?: string }): string {
  return [c.city?.trim(), c.state?.trim()].filter(Boolean).join(", ");
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  background: "var(--admin-surface-2)",
  borderRadius: "0.75rem",
  padding: "0.625rem 1rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
};

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────
function Checkbox({ checked, partial, disabled }: { checked: boolean; partial?: boolean; disabled?: boolean }) {
  const base: React.CSSProperties = {
    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
    border: checked || partial ? "1.5px solid var(--admin-accent-text)" : "1.5px solid var(--admin-border)",
    background: checked ? "var(--admin-accent-soft)" : partial ? "var(--admin-accent-soft)" : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.1s",
    opacity: disabled ? 0.4 : 1,
  };
  return (
    <div style={base}>
      {checked && <Check size={9} color={disabled ? "var(--admin-text-faint)" : "var(--admin-accent-text)"} />}
      {!checked && partial && <div style={{ width: 8, height: 2, borderRadius: 1, background: "var(--admin-accent-text)" }} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Add-contacts modal
// ─────────────────────────────────────────────
function AddContactsModal({
  listId, listName, memberIds, onClose, onDone,
}: {
  listId: number;
  listName: string;
  memberIds: Set<number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [memberFilter, setMemberFilter] = useState<"all" | "no-list" | "not-in-list">("not-in-list");
  const [locationFilter, setLocationFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");

  // Shift-range tracking
  const lastClickedIndexRef = useRef<number | null>(null);

  // Collapsed company groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Paste tab
  const [tab, setTab] = useState<"browse" | "paste">("browse");
  const [pastedEmails, setPastedEmails] = useState("");
  const [pasteResult, setPasteResult] = useState<{ added: number; notFound: number; alreadyIn: number } | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);

  const PAGE = 100;
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d: Contact[]) => { setAllContacts(d); setLoadingContacts(false); });
  }, []);

  // ── filtered flat list ──────────────────────
  // Distinct location (state) values for the filter dropdown
  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    allContacts.forEach((c) => { const v = (c.state || "").trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allContacts]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return allContacts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (memberFilter === "no-list" && c.lists) return false;
      if (memberFilter === "not-in-list" && memberIds.has(c.id)) return false;
      if (locationFilter !== "all" && (c.state || "").trim() !== locationFilter) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q) ||
        (c.state || "").toLowerCase().includes(q)
      );
    });
  }, [allContacts, query, statusFilter, memberFilter, locationFilter, memberIds]);

  // eligible = not yet in list
  const eligible = useMemo(() => filtered.filter((c) => !memberIds.has(c.id)), [filtered, memberIds]);
  const allEligibleSelected = eligible.length > 0 && eligible.every((c) => selectedIds.has(c.id));

  // ── grouped view ────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const key = (c.company || "").trim() || "(No Company)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    // sort: biggest groups first
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const visible = filtered.slice(0, page * PAGE);
  const canLoadMore = visible.length < filtered.length;

  // ── keyboard shortcut Ctrl+A ─────────────
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && tab === "browse") {
        e.preventDefault();
        const next = new Set(selectedIds);
        eligible.forEach((c) => next.add(c.id));
        setSelectedIds(next);
      }
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eligible, selectedIds, tab, onClose]);

  // ── toggle all eligible ──────────────────
  function toggleAll() {
    if (allEligibleSelected) {
      const next = new Set(selectedIds);
      eligible.forEach((c) => next.delete(c.id));
      setSelectedIds(next);
      lastClickedIndexRef.current = null;
    } else {
      const next = new Set(selectedIds);
      eligible.forEach((c) => next.add(c.id));
      setSelectedIds(next);
    }
  }

  // ── shift-range click (flat list) ────────
  function handleRowClick(c: Contact, index: number, shiftKey: boolean) {
    if (memberIds.has(c.id)) return;
    const next = new Set(selectedIds);

    if (shiftKey && lastClickedIndexRef.current !== null) {
      const from = Math.min(lastClickedIndexRef.current, index);
      const to = Math.max(lastClickedIndexRef.current, index);
      const shouldSelect = !selectedIds.has(c.id);
      for (let i = from; i <= to; i++) {
        const target = visible[i];
        if (!target || memberIds.has(target.id)) continue;
        if (shouldSelect) next.add(target.id);
        else next.delete(target.id);
      }
    } else {
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      lastClickedIndexRef.current = index;
    }

    setSelectedIds(next);
  }

  // ── group toggle ─────────────────────────
  function toggleGroup(company: string, contacts: Contact[]) {
    const eligibleInGroup = contacts.filter((c) => !memberIds.has(c.id));
    const allSelected = eligibleInGroup.every((c) => selectedIds.has(c.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      eligibleInGroup.forEach((c) => next.delete(c.id));
    } else {
      eligibleInGroup.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
    lastClickedIndexRef.current = null;
  }

  function toggleCollapse(company: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  }

  // ── add to list ──────────────────────────
  async function handleAdd() {
    if (selectedIds.size === 0 || adding) return;
    setAdding(true);
    await fetch(`/api/lists/${listId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
    });
    setAdding(false);
    onDone();
  }

  // ── paste import ─────────────────────────
  async function handlePasteImport(e: FormEvent) {
    e.preventDefault();
    const emails = pastedEmails
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@"));
    if (!emails.length) return;
    setPasteLoading(true);
    setPasteResult(null);
    const emailToId = new Map(allContacts.map((c) => [c.email.toLowerCase(), c.id]));
    const toAdd: number[] = [];
    let notFound = 0, alreadyIn = 0;
    for (const email of emails) {
      const id = emailToId.get(email);
      if (!id) { notFound++; continue; }
      if (memberIds.has(id)) { alreadyIn++; continue; }
      toAdd.push(id);
    }
    if (toAdd.length > 0) {
      await fetch(`/api/lists/${listId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: toAdd }),
      });
    }
    setPasteResult({ added: toAdd.length, notFound, alreadyIn });
    setPasteLoading(false);
    if (toAdd.length > 0) onDone();
  }

  // ── styles ───────────────────────────────
  const backdrop: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "var(--admin-scrim)",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "1rem",
  };
  const modal: React.CSSProperties = {
    background: "var(--admin-surface)",
    border: "1px solid var(--admin-border)",
    borderRadius: "1.25rem",
    width: "100%", maxWidth: "700px", maxHeight: "92vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
  };

  return (
    <div style={backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>

        {/* ── Header ── */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--admin-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, color: "var(--admin-text)", fontSize: "0.95rem" }}>
              Add contacts to <span style={{ color: "var(--admin-accent-text)" }}>{listName}</span>
            </p>
            <p style={{ fontSize: "0.7rem", color: "var(--admin-text-muted)", marginTop: "0.2rem" }}>
              {allContacts.length} total · {memberIds.size} already in list
              <span style={{ marginLeft: "0.75rem", color: "var(--admin-text-faint)" }}>
                · Shift+click to range-select · Ctrl+A to select all
              </span>
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--admin-text-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: "0.25rem" }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--admin-border)", padding: "0 1.5rem" }}>
          {(["browse", "paste"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0.7rem 1rem 0.55rem", fontSize: "0.78rem", fontWeight: 600,
              color: tab === t ? "var(--admin-text)" : "var(--admin-text-muted)",
              borderBottom: tab === t ? "2px solid var(--admin-accent)" : "2px solid transparent",
            }}>
              {t === "browse" ? "Browse Contacts" : "Paste / Import Emails"}
            </button>
          ))}
        </div>

        {tab === "browse" ? (
          <>
            {/* ── Filter bar ── */}
            <div style={{ padding: "0.75rem 1.5rem", borderBottom: "1px solid var(--admin-border)", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {/* Search */}
              <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
                <Search size={13} style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                <input
                  style={{ ...inputStyle, paddingLeft: "2.1rem", fontSize: "0.78rem", borderRadius: "0.6rem" }}
                  placeholder="Search name, email, company…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); lastClickedIndexRef.current = null; }}
                  autoFocus
                />
                {query && (
                  <button onClick={() => { setQuery(""); setPage(1); }} style={{ position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-faint)", display: "flex" }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Status */}
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
                style={{ ...inputStyle, width: "auto", fontSize: "0.76rem", borderRadius: "0.6rem", cursor: "pointer" }}>
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All statuses</option>
                <option value="active" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Active only</option>
                <option value="unsubscribed" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Unsubscribed</option>
              </select>

              {/* Member filter */}
              <select value={memberFilter} onChange={(e) => { setMemberFilter(e.target.value as typeof memberFilter); setPage(1); }}
                style={{ ...inputStyle, width: "auto", fontSize: "0.76rem", borderRadius: "0.6rem", cursor: "pointer" }}>
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All contacts</option>
                <option value="not-in-list" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Not in this list</option>
                <option value="no-list" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>In no lists</option>
              </select>

              {/* Location filter */}
              <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
                style={{ ...inputStyle, width: "auto", maxWidth: 160, fontSize: "0.76rem", borderRadius: "0.6rem", cursor: "pointer" }}
                title="Filter by location (state)">
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All locations</option>
                {stateOptions.map((st) => (
                  <option key={st} value={st} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{st}</option>
                ))}
              </select>

              {/* View toggle */}
              <div style={{ display: "flex", background: "var(--admin-surface-2)", borderRadius: "0.6rem", border: "1px solid var(--admin-border)", padding: "2px", gap: "2px", flexShrink: 0 }}>
                {([["list", <ListIcon size={13} />], ["grouped", <Layers size={13} />]] as [string, React.ReactNode][]).map(([m, icon]) => (
                  <button key={m} onClick={() => setViewMode(m as "list" | "grouped")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0.3rem 0.5rem", borderRadius: "0.4rem", border: "none", cursor: "pointer", background: viewMode === m ? "var(--admin-hover-bg)" : "transparent", color: viewMode === m ? "var(--admin-text)" : "var(--admin-text-muted)", transition: "all 0.12s" }}
                    title={m === "list" ? "List view" : "Group by company"}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Select-all bar ── */}
            <div style={{ padding: "0.45rem 1.5rem", background: "var(--admin-surface-2)", borderBottom: "1px solid var(--admin-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: "0.45rem", background: "none", border: "none", cursor: eligible.length === 0 ? "default" : "pointer", color: allEligibleSelected ? "var(--admin-accent-text)" : "var(--admin-text-muted)", fontSize: "0.73rem", fontWeight: 600 }}>
                {allEligibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allEligibleSelected ? "Deselect all" : `Select all ${eligible.length} eligible`}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {selectedIds.size > 0 && (
                  <button onClick={() => { setSelectedIds(new Set()); lastClickedIndexRef.current = null; }}
                    style={{ fontSize: "0.7rem", color: "var(--admin-text-faint)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Clear
                  </button>
                )}
                <span style={{ fontSize: "0.7rem", color: "var(--admin-text-faint)" }}>
                  {filtered.length} shown · <span style={{ color: selectedIds.size > 0 ? "var(--admin-accent-text)" : "var(--admin-text-faint)", fontWeight: selectedIds.size > 0 ? 700 : 400 }}>{selectedIds.size} selected</span>
                </span>
              </div>
            </div>

            {/* ── Contact list ── */}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {loadingContacts ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", gap: "0.75rem", color: "var(--admin-text-faint)", fontSize: "0.8rem" }}>
                  <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading contacts…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--admin-text-faint)", fontSize: "0.8rem" }}>
                  No contacts match your filters.
                </div>
              ) : viewMode === "list" ? (
                <>
                  {visible.map((c, index) => {
                    const alreadyIn = memberIds.has(c.id);
                    return (
                      <ContactRow
                        key={c.id}
                        c={c}
                        index={index}
                        alreadyIn={alreadyIn}
                        selected={selectedIds.has(c.id)}
                        onRowClick={handleRowClick}
                      />
                    );
                  })}
                  {canLoadMore && (
                    <div style={{ padding: "0.875rem", textAlign: "center" }}>
                      <button onClick={() => setPage((p) => p + 1)}
                        style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)", borderRadius: "0.6rem", padding: "0.45rem 1.5rem", fontSize: "0.76rem", cursor: "pointer" }}>
                        Show more ({filtered.length - visible.length} remaining)
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* ── Grouped view ── */
                grouped.map(([company, contacts]) => {
                  const eligibleInGroup = contacts.filter((c) => !memberIds.has(c.id));
                  const selectedInGroup = eligibleInGroup.filter((c) => selectedIds.has(c.id)).length;
                  const allGroupSelected = eligibleInGroup.length > 0 && selectedInGroup === eligibleInGroup.length;
                  const partialGroupSelected = selectedInGroup > 0 && !allGroupSelected;
                  const isCollapsed = collapsedGroups.has(company);

                  return (
                    <div key={company} style={{ borderBottom: "1px solid var(--admin-border)" }}>
                      {/* Group header */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.55rem 1.5rem", background: "var(--admin-surface-2)", cursor: "pointer" }}>
                        {/* Group checkbox */}
                        <div onClick={() => toggleGroup(company, contacts)} style={{ flexShrink: 0, cursor: eligibleInGroup.length === 0 ? "default" : "pointer" }}>
                          <Checkbox checked={allGroupSelected} partial={partialGroupSelected} disabled={eligibleInGroup.length === 0} />
                        </div>
                        {/* Collapse toggle + label */}
                        <div onClick={() => toggleCollapse(company)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                          {isCollapsed ? <ChevronRight size={12} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} /> : <ChevronDown size={12} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />}
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company}</span>
                          <span style={{ fontSize: "0.7rem", color: "var(--admin-text-faint)", flexShrink: 0 }}>
                            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                            {selectedInGroup > 0 && <span style={{ color: "var(--admin-accent-text)", marginLeft: "0.4rem" }}>· {selectedInGroup} selected</span>}
                          </span>
                        </div>
                        {/* Quick select all in group */}
                        {eligibleInGroup.length > 0 && (
                          <button onClick={() => toggleGroup(company, contacts)}
                            style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: "99px", background: allGroupSelected ? "var(--admin-accent-soft)" : "var(--admin-hover-bg)", border: "1px solid " + (allGroupSelected ? "var(--admin-accent-soft)" : "var(--admin-border)"), color: allGroupSelected ? "var(--admin-accent-text)" : "var(--admin-text-muted)", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {allGroupSelected ? "Deselect all" : `Select all ${eligibleInGroup.length}`}
                          </button>
                        )}
                      </div>

                      {/* Group rows */}
                      {!isCollapsed && contacts.map((c) => {
                        const alreadyIn = memberIds.has(c.id);
                        return (
                          <GroupContactRow
                            key={c.id}
                            c={c}
                            alreadyIn={alreadyIn}
                            selected={selectedIds.has(c.id)}
                            onToggle={() => {
                              if (alreadyIn) return;
                              const next = new Set(selectedIds);
                              if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                              setSelectedIds(next);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{ padding: "0.875rem 1.5rem", borderTop: "1px solid var(--admin-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.76rem", color: "var(--admin-text-muted)" }}>
                {selectedIds.size > 0
                  ? <><span style={{ color: "var(--admin-accent-text)", fontWeight: 700 }}>{selectedIds.size}</span> contact{selectedIds.size !== 1 ? "s" : ""} selected</>
                  : "Select contacts above"}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={onClose} style={{ background: "var(--admin-hover-bg)", border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)", borderRadius: "0.6rem", padding: "0.5rem 1.1rem", fontSize: "0.78rem", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={selectedIds.size === 0 || adding}
                  style={{ background: selectedIds.size === 0 ? "var(--admin-accent-soft)" : "var(--admin-accent)", border: "none", color: "#fff", borderRadius: "0.6rem", padding: "0.5rem 1.25rem", fontSize: "0.8rem", fontWeight: 700, cursor: selectedIds.size === 0 ? "default" : "pointer", display: "flex", alignItems: "center", gap: "0.4rem", opacity: adding ? 0.6 : 1, transition: "all 0.14s", fontFamily: "var(--font-heading)" }}>
                  {adding ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
                  {adding ? "Adding…" : `Add ${selectedIds.size > 0 ? selectedIds.size : ""} to List`}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ── Paste tab ── */
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1, overflowY: "auto" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--admin-text-secondary)", lineHeight: 1.6 }}>
              Paste email addresses (one per line, or comma / semicolon separated).<br />
              Only contacts already in your database will be added.
            </p>
            <form onSubmit={handlePasteImport} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <textarea
                value={pastedEmails}
                onChange={(e) => { setPastedEmails(e.target.value); setPasteResult(null); }}
                placeholder={"john@acme.com\njane@corp.com\nbob@example.com"}
                rows={10}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem", lineHeight: "1.6" }}
              />
              {pasteResult && (
                <div style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)", borderRadius: "0.75rem", padding: "1rem 1.25rem", display: "flex", gap: "2rem" }}>
                  {([["added", "var(--admin-success)", pasteResult.added], ["already in list", "var(--admin-text-muted)", pasteResult.alreadyIn], ["not found", "var(--admin-danger-text)", pasteResult.notFound]] as [string, string, number][]).map(([label, color, val]) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "1.4rem", fontWeight: 700, color, lineHeight: 1 }}>{val}</p>
                      <p style={{ fontSize: "0.68rem", color: "var(--admin-text-muted)", marginTop: "0.25rem" }}>{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" disabled={pasteLoading || !pastedEmails.trim()}
                  style={{ background: "var(--admin-accent)", border: "none", color: "#fff", borderRadius: "0.625rem", padding: "0.6rem 1.5rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", opacity: pasteLoading || !pastedEmails.trim() ? 0.5 : 1, fontFamily: "var(--font-heading)" }}>
                  {pasteLoading ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <UploadCloud size={13} />}
                  {pasteLoading ? "Importing…" : "Import to List"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Flat list row (supports shift-click)
// ─────────────────────────────────────────────
function ContactRow({
  c, index, alreadyIn, selected, onRowClick,
}: {
  c: Contact;
  index: number;
  alreadyIn: boolean;
  selected: boolean;
  onRowClick: (c: Contact, index: number, shift: boolean) => void;
}) {
  return (
    <div
      onClick={(e) => onRowClick(c, index, e.shiftKey)}
      style={{
        display: "flex", alignItems: "center", gap: "0.875rem",
        padding: "0.55rem 1.5rem",
        cursor: alreadyIn ? "default" : "pointer",
        opacity: alreadyIn ? 0.4 : 1,
        borderBottom: "1px solid var(--admin-border)",
        background: selected ? "var(--admin-accent-soft)" : "transparent",
        transition: "background 0.1s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (!alreadyIn) (e.currentTarget as HTMLDivElement).style.background = selected ? "var(--admin-accent-soft)" : "var(--admin-hover-bg)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = selected ? "var(--admin-accent-soft)" : "transparent"; }}
    >
      <Checkbox checked={selected || alreadyIn} disabled={alreadyIn} />
      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700 }}>
        {(c.name || c.email)[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.email}</span>
          {c.status === "unsubscribed" && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", flexShrink: 0 }}>unsub</span>}
          {alreadyIn && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)", flexShrink: 0 }}>in list</span>}
        </div>
        <div style={{ fontSize: "0.68rem", color: "var(--admin-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name ? c.email : ""}
          {(c.title || c.company) && <span> · {c.title}{c.title && c.company ? " at " : ""}{c.company}</span>}
        </div>
        {locationOf(c) && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.65rem", color: "var(--admin-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>
            <MapPin size={9} style={{ flexShrink: 0 }} /> {locationOf(c)}
          </div>
        )}
      </div>
      {c.lists && !alreadyIn && (
        <span style={{ fontSize: "0.62rem", padding: "2px 6px", borderRadius: 99, background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)", flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.lists}>
          {c.lists}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Grouped view row (no shift-select, simpler)
// ─────────────────────────────────────────────
function GroupContactRow({ c, alreadyIn, selected, onToggle }: { c: Contact; alreadyIn: boolean; selected: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: "0.875rem",
        padding: "0.5rem 1.5rem 0.5rem 3.25rem",
        cursor: alreadyIn ? "default" : "pointer",
        opacity: alreadyIn ? 0.4 : 1,
        borderBottom: "1px solid var(--admin-hover-bg)",
        background: selected ? "var(--admin-accent-soft)" : "transparent",
        transition: "background 0.1s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (!alreadyIn) (e.currentTarget as HTMLDivElement).style.background = selected ? "var(--admin-accent-soft)" : "var(--admin-hover-bg)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = selected ? "var(--admin-accent-soft)" : "transparent"; }}
    >
      <Checkbox checked={selected || alreadyIn} disabled={alreadyIn} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.email}</span>
          {c.status === "unsubscribed" && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", flexShrink: 0 }}>unsub</span>}
          {alreadyIn && <span style={{ fontSize: "0.6rem", padding: "1px 5px", borderRadius: 99, background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)", flexShrink: 0 }}>in list</span>}
        </div>
        <div style={{ fontSize: "0.67rem", color: "var(--admin-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name ? c.email : ""}
          {c.title && <span> · {c.title}</span>}
          {locationOf(c) && <span> · {locationOf(c)}</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function ListsClient() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [selected, setSelected] = useState<ContactList | null>(null);
  const [members, setMembers] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Contact | null>(null);
  const [removing, setRemoving] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberLocationFilter, setMemberLocationFilter] = useState("all");
  const [memberSentFilter, setMemberSentFilter] = useState<"all" | "sent" | "unsent">("all");
  const [memberPage, setMemberPage] = useState(1);

  const [activeRightTab, setActiveRightTab] = useState<"contacts" | "campaigns">("contacts");
  const [listCampaigns, setListCampaigns] = useState<Campaign[]>([]);
  const [listCampaignsLoading, setListCampaignsLoading] = useState(false);

  async function fetchListCampaigns(listId: number) {
    setListCampaignsLoading(true);
    try {
      const res = await fetch(`/api/campaigns/send?listId=${listId}`);
      if (res.ok) {
        setListCampaigns(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setListCampaignsLoading(false);
    }
  }

  // Inline list rename
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  async function fetchLists() {
    const res = await fetch("/api/lists");
    setLists(await res.json());
  }

  async function fetchMembers(listId: number) {
    const res = await fetch(`/api/lists/${listId}/members`);
    setMembers(await res.json());
  }

  useEffect(() => { fetchLists(); }, []);

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setLoading(true); setError("");
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to create list"); }
    else { setNewListName(""); fetchLists(); toast.success(`List "${newListName.trim()}" created`); }
    setLoading(false);
  }

  async function handleDeleteList(id: number) {
    if (!confirm("Delete this list? Contacts are not deleted.")) return;
    await fetch("/api/lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (selected?.id === id) setSelected(null);
    toast.success("List deleted");
    fetchLists();
  }

  async function openList(list: ContactList) {
    setSelected(list);
    setMemberSearch("");
    setActiveRightTab("contacts");
    await Promise.all([
      fetchMembers(list.id),
      fetchListCampaigns(list.id)
    ]);
  }

  async function confirmRemoveMember() {
    if (!selected || !removeTarget) return;
    try {
      setRemoving(true);
      await fetch(`/api/lists/${selected.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: removeTarget.id }),
      });
      toast.success("Removed from list");
      setRemoveTarget(null);
      fetchMembers(selected.id);
      fetchLists();
    } finally {
      setRemoving(false);
    }
  }

  async function handleModalDone() {
    setShowModal(false);
    if (selected) {
      await fetchMembers(selected.id);
      await fetchLists();
      setSelected((prev) => prev ? { ...prev } : null);
    }
  }

  async function handleRenameList(id: number, newName: string) {
    const trimmed = newName.trim();
    setRenamingId(null);
    if (!trimmed) return;
    const current = lists.find((l) => l.id === id);
    if (current && current.name === trimmed) return;
    const res = await fetch("/api/lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: trimmed }),
    });
    if (res.ok) {
      toast.success(`Renamed to "${trimmed}"`);
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Rename failed");
    }
    await fetchLists();
    setSelected((prev) => prev?.id === id ? { ...prev, name: trimmed } : prev);
  }

  const mostRecentListId = useMemo(() => {
    let maxTime = 0;
    let targetId: number | null = null;
    lists.forEach((l) => {
      if (l.last_sent_at && l.last_sent_at > maxTime) {
        maxTime = l.last_sent_at;
        targetId = l.id;
      }
    });
    return targetId;
  }, [lists]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  // Distinct location (state) values among this list's members
  const memberStateOptions = useMemo(() => {
    const set = new Set<string>();
    members.forEach((c) => { const v = (c.state || "").trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    const out = members.filter((c) => {
      if (memberLocationFilter !== "all" && (c.state || "").trim() !== memberLocationFilter) return false;
      const sent = (c.send_count ?? 0) > 0;
      if (memberSentFilter === "sent" && !sent) return false;
      if (memberSentFilter === "unsent" && sent) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q) ||
        (c.state || "").toLowerCase().includes(q)
      );
    });
    // Show people we've already emailed first (most-emailed at the top).
    // Array.sort is stable, so ties keep the API's created_at DESC order.
    return out.sort((a, b) => (b.send_count ?? 0) - (a.send_count ?? 0));
  }, [members, memberSearch, memberLocationFilter, memberSentFilter]);

  // Pagination — 30 members per page
  const MEMBERS_PER_PAGE = 30;
  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE));
  const currentMemberPage = Math.min(memberPage, totalMemberPages);
  const pagedMembers = filteredMembers.slice(
    (currentMemberPage - 1) * MEMBERS_PER_PAGE,
    currentMemberPage * MEMBERS_PER_PAGE
  );

  // Reset to first page when the search, filters, or selected list changes
  useEffect(() => { setMemberPage(1); }, [memberSearch, memberLocationFilter, memberSentFilter, selected?.id]);
  // Clear the filters when switching lists
  useEffect(() => { setMemberLocationFilter("all"); setMemberSentFilter("all"); }, [selected?.id]);

  return (
    <>
      <ToastProvider />
      {showModal && selected && (
        <AddContactsModal
          listId={selected.id}
          listName={selected.name}
          memberIds={memberIds}
          onClose={() => setShowModal(false)}
          onDone={handleModalDone}
        />
      )}

      {/* Confirm remove-from-list */}
      {removeTarget && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--admin-scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          onClick={(e) => { if (e.target === e.currentTarget && !removing) setRemoveTarget(null); }}
        >
          <div style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", borderRadius: "1.25rem", width: "100%", maxWidth: 420, padding: "1.75rem", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--admin-danger-soft)" }}>
                <UserMinus size={18} style={{ color: "var(--admin-danger-text)" }} />
              </div>
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Remove from list?</p>
            </div>
            <p className="text-sm mb-1" style={{ color: "var(--admin-text-secondary)" }}>
              Remove <span className="font-semibold text-(--admin-text)">{removeTarget.name || removeTarget.email}</span> from <span className="font-semibold text-(--admin-text)">{selected?.name}</span>?
            </p>
            <p className="text-xs mb-5" style={{ color: "var(--admin-text-muted)" }}>
              This only takes them off this list — the contact itself is not deleted and stays in your other lists.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors hover:bg-(--admin-hover-bg) disabled:opacity-50"
                style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveMember}
                disabled={removing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                style={{ background: "var(--admin-danger)" }}
              >
                <UserMinus size={14} /> {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="rounded-2xl p-5" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            <p className="text-sm font-bold text-(--admin-text) mb-4" style={{ fontFamily: "var(--font-heading)" }}>New List</p>
            <form onSubmit={handleCreateList} className="flex flex-col gap-3">
              <input style={inputStyle} placeholder="e.g. MEP Engineers" value={newListName} onChange={(e) => setNewListName(e.target.value)} required />
              {error && <p className="text-xs" style={{ color: "var(--admin-danger-text)" }}>{error}</p>}
              <button type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                {loading ? <Spinner size={14} /> : <Plus size={14} />} Create List
              </button>
            </form>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>
                All Lists <span className="text-xs font-normal ml-1" style={{ color: "var(--admin-text-faint)" }}>{lists.length}</span>
              </p>
            </div>
            {lists.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>No lists yet. Create one above.</p>
              </div>
            ) : lists.map((list, i) => (
              <div key={list.id}
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors group"
                style={{ borderBottom: i < lists.length - 1 ? "1px solid var(--admin-border)" : "none", background: selected?.id === list.id ? "var(--admin-accent-soft)" : "transparent" }}
                onClick={() => renamingId !== list.id && openList(list)}>
                <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: selected?.id === list.id ? "var(--admin-accent-soft)" : "var(--admin-hover-bg)" }}>
                    <Users size={13} style={{ color: selected?.id === list.id ? "var(--admin-accent-text)" : "var(--admin-text-muted)" }} />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    {renamingId === list.id ? (
                      <input
                        ref={renameInputRef}
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameList(list.id, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleRenameList(list.id, renameValue); }
                          if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium w-full outline-none"
                        style={{ background: "var(--admin-hover-bg)", border: "1px solid var(--admin-accent)", borderRadius: "0.375rem", padding: "2px 6px", color: "var(--admin-text)" }}
                      />
                    ) : (
                      <p className="text-sm font-medium truncate" style={{ color: selected?.id === list.id ? "var(--admin-text)" : "var(--admin-text-secondary)" }}>{list.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>{Number(list.member_count)} contacts</p>
                      {list.campaign_count !== undefined && list.campaign_count > 0 && (
                        <>
                          <span className="text-[10px]" style={{ color: "var(--admin-text-faint)" }}>•</span>
                          <span className="text-[11px]" style={{ color: "#60a5fa" }} title="Campaigns sent targeting this list">
                            {list.campaign_count} sent
                            {list.id !== mostRecentListId && list.last_sent_at && ` (${new Date(list.last_sent_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
                          </span>
                        </>
                      )}
                      {list.id === mostRecentListId && list.last_sent_at && (
                        <>
                          <span className="text-[10px]" style={{ color: "var(--admin-text-faint)" }}>•</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid var(--admin-accent-soft)" }}>
                            Last Sent: {new Date(list.last_sent_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenamingId(list.id); setRenameValue(list.name); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg) opacity-0 group-hover:opacity-100"
                    style={{ color: "var(--admin-text-muted)" }} title="Rename list">
                    <Pencil size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                    style={{ color: "var(--admin-text-faint)" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="rounded-2xl flex flex-col items-center justify-center py-24 text-center"
              style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--admin-surface-2)" }}>
                <Users size={20} style={{ color: "var(--admin-text-faint)" }} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-(--admin-text) mb-1">Select a list</p>
              <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>Click a list on the left to view and manage its contacts.</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-muted)" }}>
                    <ChevronLeft size={15} />
                  </button>
                  <div>
                    {renamingId === selected.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameList(selected.id, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleRenameList(selected.id, renameValue); }
                          if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
                        }}
                        className="text-sm font-bold outline-none"
                        style={{ background: "var(--admin-hover-bg)", border: "1px solid var(--admin-accent)", borderRadius: "0.375rem", padding: "3px 8px", color: "var(--admin-text)", fontFamily: "var(--font-heading)", minWidth: 180 }}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>{selected.name}</p>
                        <button
                          onClick={() => { setRenamingId(selected.id); setRenameValue(selected.name); }}
                          className="w-5 h-5 rounded flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)"
                          style={{ color: "var(--admin-text-faint)" }} title="Rename list">
                          <Pencil size={11} />
                        </button>
                      </div>
                    )}
                    <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                      {members.length} contacts
                      {selected.campaign_count !== undefined && selected.campaign_count > 0 && (
                        <>
                          {" · "}
                          <span style={{ color: "#60a5fa" }}>{selected.campaign_count} campaign{selected.campaign_count === 1 ? "" : "s"} sent</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-white transition-all hover:scale-[1.02]"
                  style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)" }}>
                  <Plus size={12} /> Add Contacts
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--admin-border)", padding: "0 1.5rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveRightTab("contacts")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.7rem 1.25rem 0.55rem",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: activeRightTab === "contacts" ? "var(--admin-text)" : "var(--admin-text-muted)",
                    borderBottom: activeRightTab === "contacts" ? "2px solid var(--admin-accent)" : "2px solid transparent",
                  }}
                >
                  Contacts ({members.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab("campaigns")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.7rem 1.25rem 0.55rem",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: activeRightTab === "campaigns" ? "var(--admin-text)" : "var(--admin-text-muted)",
                    borderBottom: activeRightTab === "campaigns" ? "2px solid var(--admin-accent)" : "2px solid transparent",
                  }}
                >
                  Sent Campaigns ({listCampaigns.length})
                </button>
              </div>

              {activeRightTab === "contacts" ? (
                <>
                  {/* Member search + location filter — always visible */}
                  <div style={{ padding: "0.75rem 1.5rem", borderBottom: "1px solid var(--admin-border)", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
                      <Search size={13} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                      <input style={{ ...inputStyle, paddingLeft: "2.2rem", fontSize: "0.78rem", borderRadius: "0.625rem" }}
                        placeholder="Search members…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                      {memberSearch && (
                        <button onClick={() => setMemberSearch("")} style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-faint)", display: "flex" }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <select value={memberLocationFilter} onChange={(e) => setMemberLocationFilter(e.target.value)}
                      style={{ ...inputStyle, width: "auto", maxWidth: 170, fontSize: "0.76rem", borderRadius: "0.625rem", cursor: "pointer" }}
                      title="Filter by location (state)">
                      <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All locations</option>
                      {memberStateOptions.map((st) => (
                        <option key={st} value={st} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{st}</option>
                      ))}
                    </select>
                    <select value={memberSentFilter} onChange={(e) => setMemberSentFilter(e.target.value as "all" | "sent" | "unsent")}
                      style={{ ...inputStyle, width: "auto", maxWidth: 170, fontSize: "0.76rem", borderRadius: "0.625rem", cursor: "pointer" }}
                      title="Filter by whether we've emailed them">
                      <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Everyone</option>
                      <option value="sent" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Emailed only</option>
                      <option value="unsent" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Not emailed yet</option>
                    </select>
                  </div>

                  {/* Members */}
                  {members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <p className="text-sm font-semibold text-(--admin-text) mb-1">No contacts yet</p>
                      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>Click "Add Contacts" to add people to this list.</p>
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>No members match your search.</p>
                    </div>
                  ) : (
                    <>
                      {pagedMembers.map((c, i) => (
                        <div key={c.id}
                          className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-(--admin-hover-bg)"
                          style={{ borderBottom: i < pagedMembers.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}>
                              {(c.name || c.email)[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-(--admin-text)">{c.name || c.email}</p>
                                {c.status === "unsubscribed" && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)" }}>unsubscribed</span>
                                )}
                                {(c.send_count ?? 0) > 0 && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                    style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}
                                    title={`Emailed ${c.send_count} time${c.send_count === 1 ? "" : "s"} across all campaigns`}
                                  >
                                    sent {c.send_count}×
                                  </span>
                                )}
                              </div>
                              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                                {c.name ? c.email : ""}
                                {(c.title || c.company) && <>{c.name ? " · " : ""}{c.title}{c.title && c.company ? " at " : ""}{c.company}</>}
                              </p>
                              {locationOf(c) && (
                                <p className="text-xs flex items-center gap-1" style={{ color: "var(--admin-text-faint)" }}>
                                  <MapPin size={10} style={{ flexShrink: 0 }} /> {locationOf(c)}
                                </p>
                              )}
                            </div>
                          </div>
                          <button onClick={() => setRemoveTarget(c)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:bg-(--admin-hover-bg)"
                            style={{ color: "var(--admin-text-faint)" }} title="Remove from list">
                            <UserMinus size={12} /> Remove
                          </button>
                        </div>
                      ))}

                      {/* Pagination footer */}
                      {totalMemberPages > 1 && (
                        <div className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap" style={{ borderTop: "1px solid var(--admin-border)" }}>
                          <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                            {(currentMemberPage - 1) * MEMBERS_PER_PAGE + 1}–{Math.min(currentMemberPage * MEMBERS_PER_PAGE, filteredMembers.length)} of {filteredMembers.length}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setMemberPage((p) => Math.max(1, p - 1))}
                              disabled={currentMemberPage <= 1}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--admin-hover-bg)"
                              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
                              <ChevronLeft size={13} /> Prev
                            </button>
                            <span className="text-xs font-semibold" style={{ color: "var(--admin-text-secondary)" }}>
                              Page {currentMemberPage} of {totalMemberPages}
                            </span>
                            <button
                              onClick={() => setMemberPage((p) => Math.min(totalMemberPages, p + 1))}
                              disabled={currentMemberPage >= totalMemberPages}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--admin-hover-bg)"
                              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
                              Next <ChevronRight size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  {listCampaignsLoading ? (
                    <div className="py-16 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>Loading campaigns…</div>
                  ) : listCampaigns.length === 0 ? (
                    <div className="py-16 text-center text-xs" style={{ color: "var(--admin-text-faint)" }}>No campaigns sent to this list yet.</div>
                  ) : (
                    <div>
                      {listCampaigns.map((c, i) => (
                        <div
                          key={c.id}
                          className="px-6 py-4 transition-colors hover:bg-(--admin-hover-bg)"
                          style={{ borderBottom: i < listCampaigns.length - 1 ? "1px solid var(--admin-border)" : "none" }}
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
                              </div>
                              <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                                {new Date(c.sent_at * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
