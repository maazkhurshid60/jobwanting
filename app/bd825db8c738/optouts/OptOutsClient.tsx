"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, UserCheck, AlertOctagon, RefreshCw, Download, Upload } from "lucide-react";
import { Pagination } from "../Toast";

interface SuppressedContact {
  email: string;
  reason: string;
  created_at: number;
}

/* Pull every address out of a file without being told which column holds them.
   A do-not-email list arrives in whatever shape the sender had it — one
   address per line, a single CSV column, or a full export with twenty columns
   and a header row — and asking which column is "the email one" is a mapping
   step that can be got wrong on the one list that must never be mailed. The
   delimiters are everything an address cannot contain, so quotes, commas,
   semicolons and angle brackets around "Name <a@b.com>" all fall away. */
function extractEmails(text: string): string[] {
  const matches = text.match(/[^\s@,;:"'<>()[\]]+@[^\s@,;:"'<>()[\]]+\.[A-Za-z]{2,}/g) ?? [];
  return [...new Set(matches.map((m) => m.trim().toLowerCase().replace(/[.,;:]+$/, "")))];
}

const UPLOAD_REASONS = [
  { value: "do_not_email", label: "Do not email" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "spam_complaint", label: "Spam complaint" },
  { value: "bounced", label: "Bounced" },
  { value: "invalid", label: "Invalid address" },
];

/* Addresses per request. The server writes in its own chunks; this one is
   about the request itself, which on Vercel is capped at a few megabytes —
   a 40,000-address list sent whole is a single request that fails whole. */
const UPLOAD_CHUNK = 2000;

const cardStyle = {
  background: "var(--admin-surface)",
  border: "1px solid var(--admin-border)",
  borderRadius: "1rem",
  padding: "1.5rem",
};

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

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OptOutsClient() {
  const [optouts, setOptouts] = useState<SuppressedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadReason, setUploadReason] = useState("do_not_email");
  const [exportView, setExportView] = useState("all");
  const PER_PAGE = 30;

  async function fetchOptouts() {
    try {
      setLoading(true);
      const res = await fetch("/api/contacts/suppressed");
      if (!res.ok) throw new Error("Failed to fetch opt-outs list");
      const data = await res.json();
      setOptouts(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOptouts();
  }, []);

  async function handleReactivate(email: string) {
    if (!confirm(`Reactivate ${email}? This will remove them from the suppression list and set their status to active.`)) return;
    try {
      setError("");
      setSuccess("");
      const res = await fetch("/api/contacts/suppressed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reactivate contact");
      setSuccess(`Successfully reactivated ${email}`);
      fetchOptouts();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  }

  const filteredOptouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return optouts.filter(
      (o) => o.email.toLowerCase().includes(q) || o.reason.toLowerCase().includes(q)
    );
  }, [optouts, search]);

  // Pagination — 30 per page
  const totalPages = Math.max(1, Math.ceil(filteredOptouts.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedOptouts = filteredOptouts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  useEffect(() => { setPage(1); }, [search]);

  function triggerDownload() {
    const a = document.createElement("a");
    a.href = `/api/export/suppression?view=${exportView}`;
    a.click();
  }

  function openUpload() {
    setError("");
    setSuccess("");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.txt,text/csv,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleUpload(file);
    };
    input.click();
  }

  async function handleUpload(file: File) {
    try {
      setError("");
      setSuccess("");

      const emails = extractEmails(await file.text());
      if (emails.length === 0) {
        setError(`No email addresses found in ${file.name}.`);
        return;
      }

      const label = UPLOAD_REASONS.find((r) => r.value === uploadReason)?.label ?? uploadReason;
      if (
        !confirm(
          `Add ${emails.length.toLocaleString()} address${emails.length === 1 ? "" : "es"} from ${file.name} to the do-not-email list as "${label}"?\n\n` +
            `They will be blocked from every future campaign. Addresses already on the list keep their original reason and date.`,
        )
      ) return;

      setUploading(true);

      let added = 0;
      let alreadyListed = 0;
      let invalid = 0;

      for (let i = 0; i < emails.length; i += UPLOAD_CHUNK) {
        const res = await fetch("/api/contacts/suppressed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: emails.slice(i, i + UPLOAD_CHUNK),
            reason: uploadReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        added += data.added ?? 0;
        alreadyListed += data.alreadyListed ?? 0;
        invalid += data.invalid ?? 0;
      }

      setSuccess(
        `${file.name}: ${added.toLocaleString()} added to the do-not-email list` +
          (alreadyListed ? `, ${alreadyListed.toLocaleString()} already on it` : "") +
          (invalid ? `, ${invalid.toLocaleString()} skipped as unreadable` : "") +
          /* Bounced and invalid rows live on the Bounced page, so say where
             they went rather than letting the admin think the upload was
             silently dropped when the table below doesn't grow. */
          (uploadReason === "bounced" || uploadReason === "invalid"
            ? ". They appear on the Bounced page, not this one."
            : "."),
      );
      fetchOptouts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload the list");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={cardStyle} className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-(--admin-text-muted)">Total Opt-Outs / Suppressed</p>
            <p className="text-3xl font-black mt-2" style={{ fontFamily: "var(--font-heading)", color: "var(--admin-danger-text)" }}>
              {optouts.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10">
            <AlertOctagon size={18} className="text-red-400" />
          </div>
        </div>

        <div style={cardStyle} className="flex flex-col justify-center gap-1 sm:col-span-2">
          <p className="text-xs font-medium text-(--admin-text-muted)">Master Do-Not-Email List</p>
          <p className="text-xs mt-1 leading-relaxed text-(--admin-text-faint)">
            Addresses land here when they unsubscribe, hard-bounce, complain, or are marked invalid, and every
            campaign send is filtered against the whole list — nothing on it can be mailed again.
            Use <strong>Upload List</strong> to add addresses in bulk from a CSV or TXT file, and <strong>Export List</strong>
            to download the complete list, bounces included. The table below shows opt-outs only; bounced and
            invalid addresses have their own page.
          </p>
        </div>
      </div>

      {/* Main List Container */}
      <div style={cardStyle} className="overflow-hidden !p-0">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-4 border-b border-(--admin-border)">
          <div>
            <p className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Suppressed Contacts & Feedback Reasons</p>
            <p className="text-xs mt-0.5 text-(--admin-text-faint)">View unsubscribes, opt-out reasons, and bounce events.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="text-(--admin-text-faint)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or reason..."
                style={{
                  ...inputStyle,
                  padding: "0.5rem 0.75rem 0.5rem 2.2rem",
                  fontSize: "0.8rem",
                  width: "220px",
                }}
              />
            </div>

            {/* The reason sits next to the upload button rather than inside a
                modal: it is the one thing about an uploaded list that can't be
                inferred from the file, and it decides which screen the rows
                land on. */}
            <select
              value={uploadReason}
              onChange={(e) => setUploadReason(e.target.value)}
              disabled={uploading}
              title="Reason recorded against every address in the uploaded file"
              style={{
                ...inputStyle,
                padding: "0.5rem 0.75rem",
                fontSize: "0.8rem",
                width: "auto",
                cursor: "pointer",
              }}
            >
              {UPLOAD_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <button
              onClick={openUpload}
              disabled={uploading}
              title="Upload a CSV or TXT file of addresses to never email"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-60"
              style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)", fontFamily: "var(--font-heading)" }}
            >
              <Upload size={13} /> {uploading ? "Uploading..." : "Upload List"}
            </button>

            {/* The client thinks of this as two lists — "the unsubscribes and
                the bouncing ones" — so the download can be either half or the
                whole thing. The halves use the same bounce test the Opt-Outs
                and Bounced pages split on, so the two files add back up to the
                master list with nothing double-counted. */}
            <select
              value={exportView}
              onChange={(e) => setExportView(e.target.value)}
              title="How much of the do-not-email list to download"
              style={{
                ...inputStyle,
                padding: "0.5rem 0.75rem",
                fontSize: "0.8rem",
                width: "auto",
                cursor: "pointer",
              }}
            >
              <option value="all">Whole list</option>
              <option value="optouts">Opt-outs only</option>
              <option value="bounced">Bounced only</option>
            </select>

            <button
              onClick={triggerDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-[1.02]"
              style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)", border: "1px solid var(--admin-accent-soft)", fontFamily: "var(--font-heading)" }}
            >
              <Download size={13} /> Export List
            </button>

            <button
              onClick={fetchOptouts}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-(--admin-hover-bg)"
              style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-secondary)" }}
              title="Refresh opt-out list"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-xs font-medium" style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger-text)", border: "1px solid var(--admin-danger-soft)" }}>{error}</div>}
        {success && <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-xs font-medium" style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid var(--admin-success-soft)" }}>{success}</div>}

        {/* Table list */}
        {loading && optouts.length === 0 ? (
          <div className="py-20 text-center text-xs text-(--admin-text-faint)">Loading suppressed contacts...</div>
        ) : filteredOptouts.length === 0 ? (
          <div className="py-20 text-center text-xs text-(--admin-text-faint)">No opt-outs match your criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--admin-border)">
                  <th className="text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-(--admin-text-faint)">Contact Email</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-(--admin-text-faint)">Unsubscribe Reason / Feedback</th>
                  <th className="text-left px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-(--admin-text-faint)">Opt-Out Date</th>
                  <th className="text-right px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-(--admin-text-faint)">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedOptouts.map((o, i) => {
                  const isBounceOrInvalid = o.reason.includes("invalid") || o.reason.includes("bounce");
                  return (
                    <tr
                      key={o.email}
                      className={`transition-colors hover:bg-(--admin-hover-bg) ${i < pagedOptouts.length - 1 ? "border-b border-(--admin-border)" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-(--admin-text)">{o.email}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold inline-block max-w-[400px] truncate"
                          style={{
                            background: isBounceOrInvalid ? "var(--admin-warning-soft)" : "var(--admin-danger-soft)",
                            color: isBounceOrInvalid ? "var(--admin-warning)" : "var(--admin-danger-text)",
                            border: `1px solid ${isBounceOrInvalid ? "var(--admin-warning-soft)" : "var(--admin-danger-soft)"}`,
                          }}
                          title={o.reason}
                        >
                          {o.reason}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-(--admin-text-muted)">{fmtDate(o.created_at)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleReactivate(o.email)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.03]"
                          style={{ background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid var(--admin-success-soft)" }}
                        >
                          <UserCheck size={12} /> Reactivate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={currentPage} total={filteredOptouts.length} perPage={PER_PAGE} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
