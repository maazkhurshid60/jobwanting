"use client";
import { useState, useEffect, FormEvent, useCallback, useMemo } from "react";
import {
  Trash2, Plus, Upload, Users, FileText, UserMinus, UserCheck,
  ShieldCheck, Pencil, Download, X, Phone, MapPin, Tag, StickyNote,
  ChevronRight, Mail, Building2, User, Star, Send, Eye, Settings2, Search,
  List as ListIcon, CornerDownRight,
} from "lucide-react";
import { ToastProvider, toast, Spinner, LoadingOverlay, Pagination } from "../Toast";
import ContactImportModal, { ImportSummary } from "../ContactImportModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  phone: string;
  phone_2: string;
  work_phone_2: string;
  mobile_phone_2: string;
  business_email: string;
  email_2: string;
  personal_email_2: string;
  linkedin: string;
  website: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  county: string;
  region: string;
  country: string;
  notes: string;
  segments: string;
  custom_fields: string;
  status: string;
  tags: string;
  campaigns_sent: number;
  created_at: number;
  lists?: string | null;
  list_ids?: string | null;
}

interface ActivityEntry {
  campaign_id: number;
  subject: string;
  sent_at: number;
  opened: boolean;
}

interface ContactList {
  id: number;
  name: string;
  member_count: number;
}


// ─── Style tokens ─────────────────────────────────────────────────────────────

const card = {
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "1rem",
  padding: "1.5rem",
} as const;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(c: Contact) {
  const fn = c.first_name || c.name.split(" ")[0] || c.email[0];
  const ln = c.last_name  || c.name.split(" ")[1] || "";
  return (fn[0] + (ln[0] ?? "")).toUpperCase();
}

function displayName(c: Contact) {
  if (c.first_name || c.last_name) return [c.first_name, c.last_name].filter(Boolean).join(" ");
  return c.name || c.email;
}

function hasAddress(c: Contact) {
  return !!(c.street_address && c.city && c.state);
}

// "City, ST" — only the parts that exist
function cityState(c: { city?: string; state?: string }) {
  return [c.city?.trim(), c.state?.trim()].filter(Boolean).join(", ");
}

// Parse a contact's comma-separated segments into display tags
function contactTags(c: { segments?: string }): string[] {
  return (c.segments || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Split a value that crams several email addresses into one field
// (e.g. "a@x.com; b@y.com") into a de-duplicated list. The first is the primary.
function splitEmails(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─── Blank form state ─────────────────────────────────────────────────────────

const BLANK = {
  first_name: "", last_name: "", email: "", title: "", company: "",
  phone: "", phone_2: "", work_phone_2: "", mobile_phone_2: "",
  business_email: "", email_2: "", personal_email_2: "",
  linkedin: "", website: "",
  street_address: "", city: "", state: "", zip_code: "", county: "", region: "",
  country: "US", notes: "", segments: "",
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, label: txt }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3" style={{ borderBottom: "1px solid var(--admin-border)", paddingBottom: "0.5rem" }}>
      <Icon size={12} style={{ color: "var(--admin-text-faint)" }} />
      <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--admin-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{txt}</span>
    </div>
  );
}

// ─── Field pair ───────────────────────────────────────────────────────────────

function Field({ label: lbl, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label}>{lbl}</label>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null); // full-screen loader message
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Contact list search & filter
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState<"all" | "active" | "unsubscribed" | "invalid">("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [contactPage, setContactPage] = useState(1);
  const CONTACTS_PER_PAGE = 30;

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [selectedAddLists, setSelectedAddLists] = useState<number[]>([]);
  const [newAddListName, setNewAddListName] = useState("");

  // Bulk import
  const [bulk, setBulk] = useState("");
  const [selectedBulkLists, setSelectedBulkLists] = useState<number[]>([]);
  const [newBulkListName, setNewBulkListName] = useState("");

  // Detail drawer
  const [drawer, setDrawer] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({ ...BLANK, email: "" });
  const [selectedEditLists, setSelectedEditLists] = useState<number[]>([]);
  const [newEditListName, setNewEditListName] = useState("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [mailingCount, setMailingCount] = useState<number | null>(null);
  const [segmentFilter, setSegmentFilter] = useState("");

  // Contact lists (used across add / edit / import)
  const [allLists, setAllLists] = useState<ContactList[]>([]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setContacts(data);
    setMailingCount(data.filter(hasAddress).length);
  }, []);

  const fetchAllLists = useCallback(async () => {
    const res = await fetch("/api/lists");
    if (res.ok) {
      setAllLists(await res.json());
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchAllLists();
  }, [fetchContacts, fetchAllLists]);


  // ── Activity history for a contact ────────────────────────────────────────

  async function fetchActivity(email: string) {
    const res = await fetch(`/api/contacts/activity?email=${encodeURIComponent(email)}`);
    if (res.ok) setActivity(await res.json());
    else setActivity([]);
  }

  function openDrawer(c: Contact) {
    setDrawer(c);
    setEditForm({
      first_name: c.first_name || c.name.split(" ")[0] || "",
      last_name:  c.last_name  || c.name.split(" ").slice(1).join(" ") || "",
      email:      c.email,
      title:      c.title,
      company:    c.company,
      phone:      c.phone,
      phone_2:    c.phone_2,
      work_phone_2:   c.work_phone_2 || "",
      mobile_phone_2: c.mobile_phone_2 || "",
      business_email: c.business_email || "",
      email_2:    c.email_2 || "",
      personal_email_2: c.personal_email_2 || "",
      linkedin:   c.linkedin || "",
      website:    c.website || "",
      street_address: c.street_address,
      city:       c.city,
      state:      c.state,
      zip_code:   c.zip_code,
      county:     c.county || "",
      region:     c.region || "",
      country:    c.country || "US",
      notes:      c.notes,
      segments:   c.segments,
    });
    const initialListIds = c.list_ids
      ? c.list_ids.split(",").map(Number).filter(Boolean)
      : [];
    setSelectedEditLists(initialListIds);
    setNewEditListName("");
    fetchActivity(c.email);
  }

  // ── Add contact ───────────────────────────────────────────────────────────

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setOverlayMsg("Adding contact…");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: form,
          listIds: selectedAddLists,
          newListName: newAddListName.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) toast.error(data.error ?? "Failed to add contact");
      else {
        toast.success(`Contact added`);
        setForm({ ...BLANK });
        setSelectedAddLists([]);
        setNewAddListName("");
        setShowAdd(false);
        fetchContacts();
        fetchAllLists();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
      setOverlayMsg(null);
    }
  }

  // ── Bulk import ───────────────────────────────────────────────────────────

  async function handleBulk(e: FormEvent) {
    e.preventDefault();
    const entries = bulk.split("\n").map((line) => {
      line = line.trim();
      const match = line.match(/^(.+?)\s*<(.+?)>$/);
      if (match) return { name: match[1].trim(), email: match[2].trim() };
      return { email: line, name: "" };
    }).filter((e) => e.email.length > 0);

    if (entries.length === 0) { toast.error("Paste at least one email (one per line)."); return; }

    setLoading(true);
    setOverlayMsg("Importing contacts…");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: entries,
          listIds: selectedBulkLists,
          newListName: newBulkListName.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string; added?: number; updated?: number; skipped?: number; invalid?: number }));
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      const parts = [`${data.added ?? 0} added`];
      if (data.updated) parts.push(`${data.updated} updated`);
      if (data.skipped) parts.push(`${data.skipped} suppressed`);
      if (data.invalid) parts.push(`${data.invalid} ignored (not a valid email)`);
      toast.success(parts.join(" · "));
      setBulk("");
      setSelectedBulkLists([]);
      setNewBulkListName("");
      fetchContacts();
      fetchAllLists();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
      setOverlayMsg(null);
    }
  }

  // ── Spreadsheet import (shared with the Spreadsheet page) ──────────────────

  function handleImported(s: ImportSummary) {
    const parts = [`${s.added} added`];
    if (s.updated) parts.push(`${s.updated} updated`);
    if (s.skipped) parts.push(`${s.skipped} suppressed`);
    if (s.invalid) parts.push(`${s.invalid} invalid`);
    toast.success(parts.join(" · "));
    fetchContacts();
    fetchAllLists();
  }

  // ── Save drawer edits ─────────────────────────────────────────────────────

  async function handleSaveDrawer() {
    if (!drawer) return;
    setLoading(true);
    const res = await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: drawer.id,
        ...editForm,
        listIds: selectedEditLists,
        newListName: newEditListName.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error ?? "Update failed");
    else {
      toast.success("Contact updated");
      fetchContacts();
      fetchAllLists();
      setDrawer(null);
    }
    setLoading(false);
  }

  // ── Delete / toggle ───────────────────────────────────────────────────────

  async function handleDelete(id: number) {
    await fetch("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    toast.success("Contact deleted");
    setDrawer(null);
    fetchContacts();
  }

  async function handleToggleStatus(id: number, current: string) {
    const status = current === "unsubscribed" ? "active" : "unsubscribed";
    await fetch("/api/contacts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    fetchContacts();
    if (drawer?.id === id) setDrawer((d) => d ? { ...d, status } : null);
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  async function handleValidate() {
    if (!confirm("Check all active contacts for valid email domains? This may take a minute.")) return;
    setLoading(true);
    const loadId = toast.loading("Validating email addresses…");
    const res = await fetch("/api/contacts/validate", { method: "POST" });
    const data = await res.json();
    toast.success(`Checked ${data.checked} — ${data.valid} valid, ${data.invalid} marked invalid`);
    fetchContacts(); setLoading(false);
  }

  function triggerDownload(url: string) {
    const a = document.createElement("a"); a.href = url; a.click();
  }

  const activeCount = contacts.filter((c) => c.status === "active" || !c.status).length;

  // Distinct company + location (state) values for the filter dropdowns
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => { const v = (c.company || "").trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [contacts]);
  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => { const v = (c.state || "").trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  // Filtered contacts (client-side, instant)
  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();
    return contacts.filter((c) => {
      if (contactStatusFilter === "active" && c.status !== "active" && c.status) return false;
      if (contactStatusFilter === "unsubscribed" && c.status !== "unsubscribed") return false;
      if (contactStatusFilter === "invalid" && c.status !== "invalid") return false;
      if (companyFilter !== "all" && (c.company || "").trim() !== companyFilter) return false;
      if (stateFilter !== "all" && (c.state || "").trim() !== stateFilter) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.first_name || "").toLowerCase().includes(q) ||
        (c.last_name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q) ||
        (c.zip_code || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    });
  }, [contacts, contactSearch, contactStatusFilter, companyFilter, stateFilter]);

  // Pagination — 30 contacts per page
  const totalContactPages = Math.max(1, Math.ceil(filteredContacts.length / CONTACTS_PER_PAGE));
  const currentContactPage = Math.min(contactPage, totalContactPages);
  const pagedContacts = filteredContacts.slice(
    (currentContactPage - 1) * CONTACTS_PER_PAGE,
    currentContactPage * CONTACTS_PER_PAGE
  );
  // Reset to page 1 when any filter changes
  useEffect(() => { setContactPage(1); }, [contactSearch, contactStatusFilter, companyFilter, stateFilter]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <ToastProvider />
      <LoadingOverlay show={!!overlayMsg} message={overlayMsg ?? ""} />
      {/* ── Add Contact Modal ─────────────────────────────────────────────── */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--admin-scrim)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", borderRadius: "1.25rem", padding: "2rem" }}
          >
            <div className="flex items-center justify-between mb-6">
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Add Contact</p>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-muted)" }}><X size={16} /></button>
            </div>

            <form onSubmit={handleAdd} className="flex flex-col gap-5">

              {/* Identity */}
              <div>
                <SectionLabel icon={User} label="Identity" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="First Name"><input style={inp} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="John" /></Field>
                  <Field label="Last Name"><input style={inp} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Smith" /></Field>
                  <Field label="Title / Role"><input style={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VP of Marketing" /></Field>
                  <Field label="Company"><input style={inp} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Corp" /></Field>
                </div>
              </div>

              {/* Contact */}
              <div>
                <SectionLabel icon={Mail} label="Contact" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Email Address (primary) *"><input style={inp} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@acme.com" /></Field>
                  <Field label="Business Email"><input style={inp} type="email" value={form.business_email} onChange={(e) => setForm({ ...form, business_email: e.target.value })} placeholder="j.smith@work.com" /></Field>
                  <Field label="Personal Email 1"><input style={inp} type="email" value={form.email_2} onChange={(e) => setForm({ ...form, email_2: e.target.value })} placeholder="personal@gmail.com" /></Field>
                  <Field label="Personal Email 2"><input style={inp} type="email" value={form.personal_email_2} onChange={(e) => setForm({ ...form, personal_email_2: e.target.value })} placeholder="personal2@gmail.com" /></Field>
                  <Field label="Work Phone 1"><input style={inp} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555-000-0000" /></Field>
                  <Field label="Work Phone 2"><input style={inp} value={form.work_phone_2} onChange={(e) => setForm({ ...form, work_phone_2: e.target.value })} placeholder="+1 555-000-0002" /></Field>
                  <Field label="Mobile Phone 1"><input style={inp} value={form.phone_2} onChange={(e) => setForm({ ...form, phone_2: e.target.value })} placeholder="+1 555-000-0001" /></Field>
                  <Field label="Mobile Phone 2"><input style={inp} value={form.mobile_phone_2} onChange={(e) => setForm({ ...form, mobile_phone_2: e.target.value })} placeholder="+1 555-000-0003" /></Field>
                  <Field label="LinkedIn URL"><input style={inp} value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="linkedin.com/in/jsmith" /></Field>
                  <Field label="Website"><input style={inp} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" /></Field>
                </div>
              </div>

              {/* Address */}
              <div>
                <SectionLabel icon={MapPin} label="Mailing Address" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Field label="Work Address"><input style={inp} value={form.street_address} onChange={(e) => setForm({ ...form, street_address: e.target.value })} placeholder="123 Main St" /></Field>
                  </div>
                  <Field label="City"><input style={inp} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="New York" /></Field>
                  <Field label="State / Province"><input style={inp} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="NY" /></Field>
                  <Field label="ZIP / Postal Code"><input style={inp} value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} placeholder="10001" /></Field>
                  <Field label="Country"><input style={inp} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="US" /></Field>
                  <Field label="County"><input style={inp} value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} placeholder="Kings County" /></Field>
                  <Field label="Region"><input style={inp} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Northeast" /></Field>
                </div>
              </div>

              {/* More */}
              <div>
                <SectionLabel icon={StickyNote} label="Notes & Segments" />
                <div className="flex flex-col gap-3">
                  <Field label="Marketing Segments (comma-separated)"><input style={inp} value={form.segments} onChange={(e) => setForm({ ...form, segments: e.target.value })} placeholder="Healthcare, Newsletter, VIP" /></Field>
                  <Field label="Notes"><textarea style={{ ...inp, minHeight: "80px", resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this contact…" /></Field>
                </div>
              </div>

              {/* List Assignment */}
              <div>
                <SectionLabel icon={ListIcon} label="List Assignment" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label style={label}>Assign to Lists</label>
                    {allLists.length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>No lists created yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-36 overflow-y-auto p-2.5 rounded-lg border border-(--admin-border)" style={{ background: "var(--admin-surface-2)" }}>
                        {allLists.map((l) => {
                          const checked = selectedAddLists.includes(l.id);
                          return (
                            <label key={l.id} className="flex items-center gap-2 cursor-pointer text-xs text-(--admin-text)">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAddLists([...selectedAddLists, l.id]);
                                  } else {
                                    setSelectedAddLists(selectedAddLists.filter((id) => id !== l.id));
                                  }
                                }}
                                className="rounded border-(--admin-border) bg-(--admin-surface-2) text-(--admin-accent) focus:ring-0 animate-none"
                                style={{ accentColor: "var(--admin-accent-text)" }}
                              />
                              <span>{l.name} ({l.member_count})</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={label}>Create & Add to New List</label>
                    <input
                      type="text"
                      value={newAddListName}
                      onChange={(e) => setNewAddListName(e.target.value)}
                      placeholder="e.g. New List Name"
                      className="h-9 px-3 rounded-lg text-xs text-(--admin-text) outline-none border border-(--admin-border) w-full"
                      style={{ background: "var(--admin-surface-2)" }}
                    />
                  </div>
                </div>
              </div>

              {error && <div className="px-4 py-3 rounded-xl text-xs font-medium" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)" }}>{error}</div>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", fontFamily: "var(--font-heading)" }}>Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50" style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                {loading ? <Spinner size={14} /> : <Plus size={14} />} Add Contact
              </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail / Edit Drawer ──────────────────────────────────────────── */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: "var(--admin-scrim)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}
        >
          <div
            className="h-full w-full max-w-lg overflow-y-auto flex flex-col"
            style={{ background: "var(--admin-surface)", borderLeft: "1px solid var(--admin-border)" }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}>
                  {initials(drawer)}
                </div>
                <div>
                  <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>{displayName(drawer)}</p>
                  <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>{drawer.email}</p>
                </div>
              </div>
              <button onClick={() => setDrawer(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-muted)" }}><X size={16} /></button>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              {(drawer.status === "active" || !drawer.status) && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid var(--admin-success-soft)" }}>Active</span>}
              {drawer.status === "unsubscribed" && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)" }}>Unsubscribed</span>}
              {drawer.status === "invalid" && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)" }}>Invalid</span>}
              {drawer.tags?.includes("test_seed") && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.25)" }}>SEED</span>}
              {Number(drawer.campaigns_sent) > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)" }}>Sent ×{drawer.campaigns_sent}</span>}
              {drawer.lists && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}>Lists: {drawer.lists}</span>}
              <div className="ml-auto flex items-center gap-1.5">
                {drawer.status !== "invalid" && (
                  <button onClick={() => handleToggleStatus(drawer.id, drawer.status)} className="text-xs px-2.5 py-1 rounded-full font-semibold transition-all hover:scale-[1.02]" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
                    {drawer.status === "unsubscribed" ? <><UserCheck size={10} className="inline mr-1" />Reactivate</> : <><UserMinus size={10} className="inline mr-1" />Unsubscribe</>}
                  </button>
                )}
                <button onClick={() => { if (confirm("Delete this contact?")) handleDelete(drawer.id); }} className="text-xs px-2.5 py-1 rounded-full font-semibold transition-all hover:scale-[1.02]" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)" }}>
                  <Trash2 size={10} className="inline mr-1" />Delete
                </button>
              </div>
            </div>

            {/* Edit form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

              <div>
                <SectionLabel icon={User} label="Identity" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="First Name"><input style={inp} value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} /></Field>
                  <Field label="Last Name"><input style={inp} value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} /></Field>
                  <Field label="Title"><input style={inp} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field>
                  <Field label="Company"><input style={inp} value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} /></Field>
                </div>
              </div>

              <div>
                <SectionLabel icon={Mail} label="Contact" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Field label="Email Address"><input style={inp} type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
                    {(() => {
                      const addrs = splitEmails(editForm.email);
                      if (addrs.length < 2) return null;
                      const extras = addrs.slice(1);
                      const removeAddr = (addr: string) =>
                        setEditForm({ ...editForm, email: addrs.filter((a) => a !== addr).join("; ") });
                      const moveToSecondary = (addr: string) => {
                        const remaining = addrs.filter((a) => a !== addr).join("; ");
                        if (!editForm.business_email.trim())
                          setEditForm({ ...editForm, email: remaining, business_email: addr });
                        else if (!editForm.email_2.trim())
                          setEditForm({ ...editForm, email: remaining, email_2: addr });
                        else if (!editForm.personal_email_2.trim())
                          setEditForm({ ...editForm, email: remaining, personal_email_2: addr });
                        else {
                          setEditForm({ ...editForm, email: remaining });
                          toast.error("Secondary email slots are full — removed from primary only");
                        }
                      };
                      return (
                        <div className="mt-2 rounded-xl p-3" style={{ background: "var(--admin-warning-soft)", border: "1px solid var(--admin-warning-soft)" }}>
                          <p className="text-xs mb-2" style={{ color: "var(--admin-warning)" }}>
                            This field holds {addrs.length} email addresses. Only the first (<span style={{ fontWeight: 700 }}>{addrs[0]}</span>) is used as the primary. Move or delete the extras:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {extras.map((addr) => (
                              <span key={addr} className="inline-flex items-center gap-2 text-xs pl-2.5 pr-1.5 py-1 rounded-full" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)" }}>
                                {addr}
                                <button type="button" title="Keep as a secondary email" onClick={() => moveToSecondary(addr)} className="w-5 h-5 rounded-full flex items-center justify-center transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-secondary)" }}>
                                  <CornerDownRight size={11} />
                                </button>
                                <button type="button" title="Delete this email" onClick={() => removeAddr(addr)} className="w-5 h-5 rounded-full flex items-center justify-center transition-all hover:bg-red-500/15" style={{ color: "var(--admin-danger-text)" }}>
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <Field label="Business Email"><input style={inp} type="email" value={editForm.business_email} onChange={(e) => setEditForm({ ...editForm, business_email: e.target.value })} placeholder="j.smith@work.com" /></Field>
                  <Field label="Personal Email 1"><input style={inp} type="email" value={editForm.email_2} onChange={(e) => setEditForm({ ...editForm, email_2: e.target.value })} placeholder="personal@gmail.com" /></Field>
                  <Field label="Personal Email 2"><input style={inp} type="email" value={editForm.personal_email_2} onChange={(e) => setEditForm({ ...editForm, personal_email_2: e.target.value })} placeholder="personal2@gmail.com" /></Field>
                  <Field label="Work Phone 1"><input style={inp} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+1 555-000-0000" /></Field>
                  <Field label="Work Phone 2"><input style={inp} value={editForm.work_phone_2} onChange={(e) => setEditForm({ ...editForm, work_phone_2: e.target.value })} placeholder="+1 555-000-0002" /></Field>
                  <Field label="Mobile Phone 1"><input style={inp} value={editForm.phone_2} onChange={(e) => setEditForm({ ...editForm, phone_2: e.target.value })} placeholder="+1 555-000-0001" /></Field>
                  <Field label="Mobile Phone 2"><input style={inp} value={editForm.mobile_phone_2} onChange={(e) => setEditForm({ ...editForm, mobile_phone_2: e.target.value })} placeholder="+1 555-000-0003" /></Field>
                  <Field label="LinkedIn URL"><input style={inp} value={editForm.linkedin} onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })} placeholder="linkedin.com/in/jsmith" /></Field>
                  <Field label="Website"><input style={inp} value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="https://acme.com" /></Field>
                </div>
              </div>

              <div>
                <SectionLabel icon={MapPin} label="Mailing Address" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Field label="Work Address"><input style={inp} value={editForm.street_address} onChange={(e) => setEditForm({ ...editForm, street_address: e.target.value })} placeholder="123 Main St" /></Field>
                  </div>
                  <Field label="City"><input style={inp} value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></Field>
                  <Field label="State / Province"><input style={inp} value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} /></Field>
                  <Field label="ZIP / Postal Code"><input style={inp} value={editForm.zip_code} onChange={(e) => setEditForm({ ...editForm, zip_code: e.target.value })} /></Field>
                  <Field label="Country"><input style={inp} value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></Field>
                  <Field label="County"><input style={inp} value={editForm.county} onChange={(e) => setEditForm({ ...editForm, county: e.target.value })} placeholder="Kings County" /></Field>
                  <Field label="Region"><input style={inp} value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} placeholder="Northeast" /></Field>
                </div>
              </div>

              {/* Mailing label preview */}
              {(editForm.street_address && editForm.city && editForm.state) && (
                <div style={{ background: "var(--admin-surface-2)", border: "1px dashed var(--admin-border)", borderRadius: "0.75rem", padding: "1rem" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--admin-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}><MapPin size={10} className="inline mr-1" />Mailing Label Preview</p>
                  <p className="text-sm" style={{ color: "var(--admin-text-secondary)", fontFamily: "monospace", lineHeight: 1.6 }}>
                    {[editForm.first_name, editForm.last_name].filter(Boolean).join(" ") || "—"}<br />
                    {editForm.company && <>{editForm.company}<br /></>}
                    {editForm.street_address}<br />
                    {editForm.city}, {editForm.state} {editForm.zip_code}<br />
                    {editForm.country !== "US" ? editForm.country : ""}
                  </p>
                </div>
              )}

              <div>
                <SectionLabel icon={Tag} label="Marketing Segments" />
                <Field label="Segments (comma-separated)">
                  <input style={inp} value={editForm.segments} onChange={(e) => setEditForm({ ...editForm, segments: e.target.value })} placeholder="Healthcare, Newsletter, VIP" />
                </Field>
                {editForm.segments && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {editForm.segments.split(",").map((s) => s.trim()).filter(Boolean).map((seg) => (
                      <span key={seg} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid var(--admin-accent-soft)" }}>{seg}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionLabel icon={StickyNote} label="Notes" />
                <textarea style={{ ...inp, minHeight: "90px", resize: "vertical" }} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes about this contact…" />
              </div>

              {/* List Assignment */}
              <div>
                <SectionLabel icon={ListIcon} label="List Assignment" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label style={label}>Assigned Lists</label>
                    {allLists.length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>No lists created yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-36 overflow-y-auto p-2.5 rounded-lg border border-(--admin-border)" style={{ background: "var(--admin-surface-2)" }}>
                        {allLists.map((l) => {
                          const checked = selectedEditLists.includes(l.id);
                          return (
                            <label key={l.id} className="flex items-center gap-2 cursor-pointer text-xs text-(--admin-text)">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedEditLists([...selectedEditLists, l.id]);
                                  } else {
                                    setSelectedEditLists(selectedEditLists.filter((id) => id !== l.id));
                                  }
                                }}
                                className="rounded border-(--admin-border) bg-(--admin-surface-2) text-(--admin-accent) focus:ring-0 animate-none"
                                style={{ accentColor: "var(--admin-accent-text)" }}
                              />
                              <span>{l.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={label}>Create & Add to New List</label>
                    <input
                      type="text"
                      value={newEditListName}
                      onChange={(e) => setNewEditListName(e.target.value)}
                      placeholder="e.g. New List Name"
                      className="h-9 px-3 rounded-lg text-xs text-(--admin-text) outline-none border border-(--admin-border) w-full"
                      style={{ background: "var(--admin-surface-2)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Email Activity History */}
              <div>
                <SectionLabel icon={Send} label="Email Activity History" />
                {activity.length === 0 ? (
                  <p className="text-xs py-2" style={{ color: "var(--admin-text-faint)" }}>No campaigns sent to this contact yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {activity.map((a) => (
                      <div key={a.campaign_id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "var(--admin-surface-2)", border: "1px solid var(--admin-border)" }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.opened ? "var(--admin-success-soft)" : "var(--admin-hover-bg)" }}>
                          {a.opened ? <Eye size={12} style={{ color: "var(--admin-success)" }} /> : <Send size={12} style={{ color: "var(--admin-text-faint)" }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "var(--admin-text-secondary)" }}>{a.subject}</p>
                          <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>{new Date(a.sent_at * 1000).toLocaleDateString()}{a.opened ? " · Opened" : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Save bar */}
            <div className="px-6 py-4 flex gap-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <button onClick={() => setDrawer(null)} className="flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-(--admin-hover-bg)" style={{ color: "var(--admin-text-muted)", border: "1px solid var(--admin-border)", fontFamily: "var(--font-heading)" }}>Cancel</button>
            <button onClick={handleSaveDrawer} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50" style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
              {loading ? <Spinner size={14} /> : null} Save Changes
            </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: forms */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          {/* Add button */}
          <button
            onClick={() => { setShowAdd(true); setError(""); setSuccess(""); }}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.28)" }}
          >
            <Plus size={15} /> Add Contact
          </button>

          {/* Bulk */}
          <div style={card}>
            <p className="text-sm font-bold text-(--admin-text) mb-1" style={{ fontFamily: "var(--font-heading)" }}>Bulk Import</p>
            <p className="text-xs mb-3" style={{ color: "var(--admin-text-muted)" }}>
              One per line: <code style={{ background: "var(--admin-hover-bg)", padding: "1px 5px", borderRadius: 4 }}>Name &lt;email&gt;</code> or just email
            </p>
            <form onSubmit={handleBulk} className="flex flex-col gap-3">
              <textarea
                style={{ ...inp, minHeight: "110px", resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem" }}
                placeholder={"John Smith <john@firm.com>\njane@firm.com"}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
              
              {/* Select list for bulk import */}
              <div className="mt-1">
                <label style={label}>Add to Lists (Optional)</label>
                {allLists.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-24 overflow-y-auto p-2 rounded-lg border border-(--admin-border) mb-2" style={{ background: "var(--admin-surface-2)" }}>
                    {allLists.map((l) => {
                      const checked = selectedBulkLists.includes(l.id);
                      return (
                        <label key={l.id} className="flex items-center gap-1.5 cursor-pointer text-[11px] text-(--admin-text)">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBulkLists([...selectedBulkLists, l.id]);
                              } else {
                                setSelectedBulkLists(selectedBulkLists.filter((id) => id !== l.id));
                              }
                            }}
                            className="rounded border-(--admin-border) bg-(--admin-surface-2) text-(--admin-accent) focus:ring-0"
                            style={{ accentColor: "var(--admin-accent-text)" }}
                          />
                          <span>{l.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <input
                  type="text"
                  value={newBulkListName}
                  onChange={(e) => setNewBulkListName(e.target.value)}
                  placeholder="Or create new list..."
                  className="h-8 px-2.5 rounded-lg text-[11px] text-(--admin-text) outline-none border border-(--admin-border) w-full"
                  style={{ background: "var(--admin-surface-2)" }}
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", fontFamily: "var(--font-heading)" }}
              >
                <Upload size={14} /> Import All
              </button>
            </form>

            {/* Spreadsheet (CSV & Excel) Upload */}
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--admin-text-muted)" }}>
                Or upload a spreadsheet (<strong style={{ color: "var(--admin-text-secondary)" }}>.csv, .xlsx, .xls</strong>) with column field mapping
              </p>
              <ContactImportModal
                lists={allLists}
                onImported={handleImported}
                renderTrigger={(open, busy) => (
                  <button
                    type="button" disabled={busy} onClick={open}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                    style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid var(--admin-accent-soft)", fontFamily: "var(--font-heading)" }}
                  >
                    {busy ? <Spinner /> : <FileText size={14} />} Upload Spreadsheet
                  </button>
                )}
              />
            </div>
          </div>

          {error && <div className="px-4 py-3 rounded-xl text-xs font-medium" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)" }}>{error}</div>}
          {success && <div className="px-4 py-3 rounded-xl text-xs font-medium" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid var(--admin-success-soft)" }}>{success}</div>}

          {/* Export */}
          <div style={card}>
            <p className="text-sm font-bold text-(--admin-text) mb-1" style={{ fontFamily: "var(--font-heading)" }}>Export Data</p>
            <p className="text-xs mb-3" style={{ color: "var(--admin-text-muted)" }}>
              Download CSVs for external systems, mail houses, or third-party tools.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => triggerDownload("/api/export/contacts?filter=all")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02]"
                style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", fontFamily: "var(--font-heading)" }}
              >
                <Download size={13} /> All Contacts
              </button>
              {/* Mailing list export — new */}
              <div className="flex flex-col gap-1.5" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: "0.75rem", padding: "0.75rem" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: "var(--admin-accent-text)", fontFamily: "var(--font-heading)" }}><MapPin size={11} className="inline mr-1" />Mailing List (Direct Mail)</span>
                  {mailingCount !== null && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}>{mailingCount} with address</span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>For postcard printers & mail houses. Includes address-complete contacts only.</p>
                <div className="flex gap-1.5 mt-1">
                  <input
                    style={{ ...inp, flex: 1, padding: "0.375rem 0.625rem", fontSize: "0.75rem" }}
                    placeholder="Filter by segment (optional)"
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value)}
                  />
                  <button
                    onClick={() => triggerDownload(`/api/export/mailing-list${segmentFilter ? `?segment=${encodeURIComponent(segmentFilter)}` : ""}`)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02]"
                    style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", fontFamily: "var(--font-heading)" }}
                  >
                    <Download size={12} className="inline mr-1" />Download
                  </button>
                </div>
              </div>
              <button
                onClick={() => triggerDownload("/api/export/suppression")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02]"
                style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)", fontFamily: "var(--font-heading)" }}
              >
                <Download size={13} /> Suppression List
              </button>
              <button
                onClick={() => triggerDownload("/api/export/contacts?filter=removed")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-[1.02]"
                style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)", border: "1px solid var(--admin-warning-soft)", fontFamily: "var(--font-heading)" }}
              >
                <Download size={13} /> Removed / Opted Out
              </button>
            </div>
          </div>
        </div>

        {/* Right: contact list */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          {/* List header */}
          <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>All Contacts</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)" }}>
                  {contactSearch || contactStatusFilter !== "all" ? `${filteredContacts.length} / ` : ""}{activeCount} active / {contacts.length} total
                </span>
                <button
                  onClick={handleValidate}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid var(--admin-accent-soft)" }}
                  title="Check all emails for valid domains"
                >
                  <ShieldCheck size={12} /> Validate Emails
                </button>
              </div>
            </div>
            {/* Search + filter row */}
            <div className="flex flex-wrap gap-2">
              <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
                <Search size={13} style={{ position: "absolute", left: "0.7rem", top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                <input
                  style={{ ...inp, paddingLeft: "2.1rem", borderRadius: "0.625rem" }}
                  placeholder="Search name, email, company, city, phone…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                />
                {contactSearch && (
                  <button onClick={() => setContactSearch("")} style={{ position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-faint)", display: "flex" }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              <select
                value={contactStatusFilter}
                onChange={(e) => setContactStatusFilter(e.target.value as typeof contactStatusFilter)}
                style={{ ...inp, width: "auto", fontSize: "0.76rem", borderRadius: "0.625rem", cursor: "pointer" }}
              >
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All statuses</option>
                <option value="active" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Active</option>
                <option value="unsubscribed" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Unsubscribed</option>
                <option value="invalid" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>Invalid</option>
              </select>

              {/* Company filter */}
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                style={{ ...inp, width: "auto", maxWidth: 200, fontSize: "0.76rem", borderRadius: "0.625rem", cursor: "pointer" }}
                title="Filter by company"
              >
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All companies</option>
                {companyOptions.map((co) => (
                  <option key={co} value={co} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{co}</option>
                ))}
              </select>

              {/* Location filter */}
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                style={{ ...inp, width: "auto", maxWidth: 160, fontSize: "0.76rem", borderRadius: "0.625rem", cursor: "pointer" }}
                title="Filter by location (state)"
              >
                <option value="all" style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>All locations</option>
                {stateOptions.map((st) => (
                  <option key={st} value={st} style={{ background: "var(--admin-surface)", color: "var(--admin-text)" }}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          {contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--admin-accent-soft)" }}>
                <Users size={20} style={{ color: "var(--admin-accent)" }} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-(--admin-text) mb-1">No contacts yet</p>
              <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>Click "Add Contact" to get started.</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-(--admin-text) mb-1">No results</p>
              <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
                No contacts match <span style={{ color: "var(--admin-text-secondary)" }}>"{contactSearch}"</span>. Try a different search.
              </p>
              <button onClick={() => { setContactSearch(""); setContactStatusFilter("all"); }} className="mt-3 text-xs px-3 py-1.5 rounded-full" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)", border: "none", cursor: "pointer" }}>Clear filters</button>
            </div>
          ) : (
            <div>
              {pagedContacts.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-6 py-3 transition-colors cursor-pointer hover:bg-(--admin-hover-bg)"
                  style={{ borderBottom: i < pagedContacts.length - 1 ? "1px solid var(--admin-border)" : "none" }}
                  onClick={() => openDrawer(c)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: c.status === "active" || !c.status ? "var(--admin-accent-soft)" : "var(--admin-hover-bg)",
                        color: c.status === "active" || !c.status ? "var(--admin-accent-text)" : "var(--admin-text-faint)",
                      }}
                    >
                      {initials(c)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate" style={{ color: c.status === "active" || !c.status ? "var(--admin-text)" : "var(--admin-text-muted)" }}>
                          {displayName(c)}
                        </p>
                        {c.status === "unsubscribed" && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)" }}>unsub</span>}
                        {c.status === "invalid" && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "var(--admin-warning-soft)", color: "var(--admin-warning)" }}>invalid</span>}
                        {c.tags?.includes("test_seed") && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0" style={{ background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.25)" }}>SEED</span>}
                        {Number(c.campaigns_sent) > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)" }}>sent ×{c.campaigns_sent}</span>}
                        {hasAddress(c) && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}><MapPin size={8} className="inline mr-0.5" />addr</span>}
                        {contactTags(c).slice(0, 3).map((t) => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}>{t}</span>
                        ))}
                        {contactTags(c).length > 3 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)" }}>+{contactTags(c).length - 3}</span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
                        {c.name !== displayName(c) ? c.email : ""}
                        {(c.title || c.company) && (
                          <>
                            {c.name !== displayName(c) ? " · " : ""}
                            <span style={{ color: "var(--admin-text-muted)" }}>{c.title}</span>
                            {c.title && c.company ? " at " : ""}
                            <span style={{ color: "var(--admin-text-muted)" }}>{c.company}</span>
                          </>
                        )}
                      </p>
                      {cityState(c) && (
                        <p className="text-xs truncate mt-0.5 flex items-center gap-1" style={{ color: "var(--admin-text-faint)" }}>
                          <MapPin size={9} style={{ flexShrink: 0 }} /> {cityState(c)}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: "var(--admin-text-faint)", flexShrink: 0 }} />
                </div>
              ))}
              <Pagination
                page={currentContactPage}
                total={filteredContacts.length}
                perPage={CONTACTS_PER_PAGE}
                onPage={setContactPage}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
