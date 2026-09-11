"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { Plus, X, ShieldCheck, User as UserIcon, Loader2, Lock, UserPlus, Eye, EyeOff, Check, AtSign, Trash2, KeyRound } from "lucide-react";
import { ToastProvider, toast, Spinner } from "../Toast";

type Role = "admin" | "member";

interface AdminUser {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  created_at: number;
}

interface Me {
  id: string;
  username: string;
  role: Role;
}

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

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function UsersClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null); // row toggling

  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "", role: "member" as Role });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit (reset password / change role) modal
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ password: "", confirmPassword: "", role: "member" as Role });
  const [showEditPw, setShowEditPw] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Change-my-password modal
  const [showChangePw, setShowChangePw] = useState(false);
  const [cpForm, setCpForm] = useState({ current: "", next: "", confirm: "" });
  const [showCpPw, setShowCpPw] = useState(false);
  const [savingCp, setSavingCp] = useState(false);
  const cpValid = cpForm.current.length > 0 && cpForm.next.length >= 8 && cpForm.next === cpForm.confirm;

  function closeChangePw() {
    setShowChangePw(false);
    setShowCpPw(false);
    setCpForm({ current: "", next: "", confirm: "" });
  }

  async function changeMyPassword(e: FormEvent) {
    e.preventDefault();
    if (!cpValid) return;
    setSavingCp(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cpForm.current, newPassword: cpForm.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Could not change password."); return; }
      toast.success("Your password has been changed.");
      closeChangePw();
      loadUsers();
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSavingCp(false);
    }
  }

  const editPwEqual = editForm.confirmPassword.length > 0 && editForm.password === editForm.confirmPassword;
  const editRoleChanged = editUser !== null && editForm.role !== editUser.role;
  const editPwProvided = editForm.password.length > 0;
  const canSaveEdit =
    editUser !== null &&
    (editPwProvided || editRoleChanged) &&
    (!editPwProvided || (editForm.password.length >= 8 && editForm.password === editForm.confirmPassword));

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setEditForm({ password: "", confirmPassword: "", role: u.role });
    setShowEditPw(false);
  }
  function closeEdit() {
    setEditUser(null);
    setShowEditPw(false);
    setEditForm({ password: "", confirmPassword: "", role: "member" });
  }

  // Live validation for the Add User form
  const pwEqual = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const canSubmit =
    form.username.trim().length >= 3 &&
    form.password.length >= 8 &&
    form.password === form.confirmPassword;

  function closeAdd() {
    setShowAdd(false);
    setShowPw(false);
    setForm({ username: "", password: "", confirmPassword: "", role: "member" });
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Resolve the current user, and (if admin) load the user list in the same pass.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Me | null) => {
        if (cancelled) return;
        setMe(data);
        setMeLoaded(true);
        if (data?.role === "admin") loadUsers();
      })
      .catch(() => {
        if (cancelled) return;
        setMe(null);
        setMeLoaded(true);
      });
    return () => { cancelled = true; };
  }, [loadUsers]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const username = form.username.trim();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: form.password, role: form.role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to create user"); return; }
      toast.success(`User “${username}” created`);
      closeAdd();
      loadUsers();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, active: !u.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to update user"); return; }
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x)));
      toast.success(`${u.username} ${!u.active ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: AdminUser) {
    setBusyId(u.id);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to delete user"); return; }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success(`${u.username} deleted`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (editPwProvided && editForm.password !== editForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const payload: { id: number; password?: string; role?: Role } = { id: editUser.id };
    if (editPwProvided) payload.password = editForm.password;
    if (editRoleChanged) payload.role = editForm.role;

    setSavingEdit(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Failed to update user"); return; }
      if (editRoleChanged) {
        setUsers((prev) => prev.map((x) => (x.id === editUser.id ? { ...x, role: editForm.role } : x)));
      }
      const changed = [editPwProvided && "password", editRoleChanged && "role"].filter(Boolean).join(" & ");
      toast.success(`${editUser.username}: ${changed} updated`);
      closeEdit();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setSavingEdit(false);
    }
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
          You need an admin account to manage dashboard users.
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
            Dashboard Users <span className="text-sm font-medium text-(--admin-text-muted)">· {users.length}</span>
          </p>
          <p className="text-xs mt-0.5 text-(--admin-text-muted)">
            Create accounts and enable or disable access. Admins can manage users; members can’t.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowChangePw(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
            style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text)", border: "1px solid var(--admin-border)" }}
          >
            <KeyRound size={15} /> Change my password
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: "var(--admin-accent)", fontFamily: "var(--font-heading)", boxShadow: "0 4px 16px rgba(99,102,241,0.28)" }}
          >
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Bootstrap-admin note */}
      <div className="px-4 py-2.5 rounded-xl text-xs mb-4" style={{ background: "rgba(96,165,250,0.08)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.18)" }}>
        You’re signed in as <strong>{me.username}</strong>. Use <strong>Change my password</strong> above to update your own login — including the primary admin account.
      </div>

      {/* Users table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs text-(--admin-text-muted)">
            <Loader2 size={14} className="animate-spin" /> Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-(--admin-text-faint)">
            No users yet. Click <strong>Add User</strong> to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "var(--admin-surface-2)", borderBottom: "1px solid var(--admin-border)" }}>
                  {["User", "Role", "Status", "Created", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 4 ? "right" : "left", padding: "0.75rem 1rem", fontWeight: 600, color: "var(--admin-text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text)" }}>
                          {u.username[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium text-(--admin-text)">{u.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={u.role === "admin"
                          ? { background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }
                          : { background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)" }}>
                        {u.role === "admin" ? <ShieldCheck size={11} /> : <UserIcon size={11} />}
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: u.active ? "var(--admin-success)" : "var(--admin-text-muted)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.active ? "var(--admin-success)" : "var(--admin-text-faint)" }} />
                        {u.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "var(--admin-text-muted)", whiteSpace: "nowrap" }}>{fmtDate(u.created_at)}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      <div className="inline-flex items-center gap-2 justify-end">
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                          style={u.active
                            ? { background: "var(--admin-warning-soft)", color: "var(--admin-warning)", border: "1px solid rgba(245,158,11,0.2)" }
                            : { background: "var(--admin-success-soft)", color: "var(--admin-success)", border: "1px solid rgba(34,197,94,0.2)" }}
                        >
                          {busyId === u.id ? <Loader2 size={12} className="animate-spin" /> : null}
                          {u.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => openEdit(u)}
                          disabled={busyId === u.id}
                          title="Reset password / change role"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 cursor-pointer inline-flex items-center"
                          style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
                        >
                          <KeyRound size={12} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(u)}
                          disabled={busyId === u.id}
                          title="Delete user"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 cursor-pointer inline-flex items-center"
                          style={{ background: "var(--admin-danger-soft)", color: "var(--admin-danger)", border: "1px solid rgba(239,68,68,0.2)" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--admin-danger-soft)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <Trash2 size={19} style={{ color: "var(--admin-danger-text)" }} />
              </div>
              <p className="text-base font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Delete user</p>
            </div>
            <p className="text-sm mb-1 text-(--admin-text-secondary)">
              Permanently delete <span className="font-semibold text-(--admin-text)">{confirmDelete.username}</span>?
            </p>
            <p className="text-xs mb-6 text-(--admin-text-muted)">
              Their account and access are removed immediately. This can&apos;t be undone — you&apos;d have to recreate the account.
            </p>
            <div className="flex justify-end gap-2 text-sm font-bold">
              <button onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id} className="px-4 py-2 rounded-full text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer transition-colors disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
              <button onClick={() => removeUser(confirmDelete)} disabled={busyId === confirmDelete.id} className="px-5 py-2 rounded-full text-white cursor-pointer flex items-center gap-2 disabled:opacity-50 transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}>
                {busyId === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete user
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user (reset password / change role) modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.6)" }}>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-5" style={{ borderBottom: "1px solid var(--admin-border)", background: "linear-gradient(180deg, rgba(96,165,250,0.06), transparent)" }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(96,165,250,0.14)", border: "1px solid rgba(96,165,250,0.25)" }}>
                  <KeyRound size={19} style={{ color: "#60a5fa" }} />
                </div>
                <div>
                  <p className="text-base font-bold text-(--admin-text) leading-tight" style={{ fontFamily: "var(--font-heading)" }}>Edit {editUser.username}</p>
                  <p className="text-xs mt-0.5 text-(--admin-text-muted)">Reset the password or change the role</p>
                </div>
              </div>
              <button onClick={closeEdit} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors shrink-0" style={{ color: "var(--admin-text-muted)" }}><X size={16} /></button>
            </div>

            <form onSubmit={handleEdit} className="flex flex-col gap-4 px-6 py-6">
              {/* New Password */}
              <div>
                <label style={label}>New Password <span style={{ textTransform: "none", fontWeight: 500, color: "var(--admin-text-faint)" }}>· leave blank to keep current</span></label>
                <div style={{ position: "relative" }}>
                  <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                  <input style={{ ...inp, paddingLeft: 34, paddingRight: 40 }} type={showEditPw ? "text" : "password"} value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} />
                  <button type="button" onClick={() => setShowEditPw((v) => !v)} title={showEditPw ? "Hide passwords" : "Show passwords"} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors cursor-pointer" style={{ color: "var(--admin-text-muted)" }}>
                    {showEditPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              {editPwProvided && (
                <div>
                  <label style={label}>Confirm New Password</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                    <input
                      style={{
                        ...inp, paddingLeft: 34, paddingRight: 40,
                        border: editForm.confirmPassword.length === 0
                          ? inp.border
                          : editPwEqual ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(239,68,68,0.5)",
                      }}
                      type={showEditPw ? "text" : "password"}
                      value={editForm.confirmPassword}
                      onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                    />
                    {editForm.confirmPassword.length > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {editPwEqual ? <Check size={15} style={{ color: "var(--admin-success)" }} /> : <X size={15} style={{ color: "var(--admin-danger-text)" }} />}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Role — selectable cards */}
              <div>
                <label style={label}>Role</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(["member", "admin"] as Role[]).map((r) => {
                    const selected = editForm.role === r;
                    const Icon = r === "admin" ? ShieldCheck : UserIcon;
                    const selfLock = me?.id === String(editUser.id) && r === "member" && editUser.role === "admin";
                    return (
                      <button
                        type="button"
                        key={r}
                        disabled={selfLock}
                        onClick={() => setEditForm({ ...editForm, role: r })}
                        title={selfLock ? "You can't change your own role" : undefined}
                        className="text-left rounded-xl p-3 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          border: selected ? "1px solid rgba(99,102,241,0.5)" : "1px solid var(--admin-border)",
                          background: selected ? "var(--admin-accent-soft)" : "var(--admin-surface-2)",
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={13} style={{ color: selected ? "var(--admin-accent-text)" : "var(--admin-text-secondary)" }} />
                          <span className="text-xs font-bold capitalize" style={{ color: selected ? "var(--admin-text)" : "var(--admin-text-secondary)" }}>{r}</span>
                        </div>
                        <p className="text-[0.7rem] leading-snug text-(--admin-text-muted)">
                          {r === "admin" ? "Full access + manage users" : "Dashboard access only"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 mt-2 text-sm font-bold">
                <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-full text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
                <button type="submit" disabled={savingEdit || !canSaveEdit} className="px-5 py-2 rounded-full text-white cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 6px 20px rgba(59,130,246,0.35)" }}>
                  {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: "var(--admin-scrim)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAdd(); }}>
          <div className="w-full max-w-md rounded-2xl border overflow-hidden" style={{ background: "var(--admin-surface)", borderColor: "var(--admin-border)", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.6)" }}>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-5" style={{ borderBottom: "1px solid var(--admin-border)", background: "linear-gradient(180deg, rgba(99,102,241,0.06), transparent)" }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--admin-accent-soft)", border: "1px solid rgba(99,102,241,0.25)" }}>
                  <UserPlus size={19} style={{ color: "var(--admin-accent-text)" }} />
                </div>
                <div>
                  <p className="text-base font-bold text-(--admin-text) leading-tight" style={{ fontFamily: "var(--font-heading)" }}>Add User</p>
                  <p className="text-xs mt-0.5 text-(--admin-text-muted)">Create a new dashboard account</p>
                </div>
              </div>
              <button onClick={closeAdd} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors shrink-0" style={{ color: "var(--admin-text-muted)" }}><X size={16} /></button>
            </div>

            <form onSubmit={handleAdd} className="flex flex-col gap-4 px-6 py-6">
              {/* Username */}
              <div>
                <label style={label}>Username</label>
                <div style={{ position: "relative" }}>
                  <AtSign size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                  <input style={{ ...inp, paddingLeft: 34 }} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jane" autoComplete="off" required minLength={3} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={label}>Password</label>
                <div style={{ position: "relative" }}>
                  <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                  <input style={{ ...inp, paddingLeft: 34, paddingRight: 40 }} type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
                  <button type="button" onClick={() => setShowPw((v) => !v)} title={showPw ? "Hide passwords" : "Show passwords"} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors cursor-pointer" style={{ color: "var(--admin-text-muted)" }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label style={label}>Confirm Password</label>
                <div style={{ position: "relative" }}>
                  <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-faint)", pointerEvents: "none" }} />
                  <input
                    style={{
                      ...inp, paddingLeft: 34, paddingRight: 40,
                      border: form.confirmPassword.length === 0
                        ? inp.border
                        : pwEqual ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(239,68,68,0.5)",
                    }}
                    type={showPw ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                  />
                  {form.confirmPassword.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      {pwEqual ? <Check size={15} style={{ color: "var(--admin-success)" }} /> : <X size={15} style={{ color: "var(--admin-danger-text)" }} />}
                    </div>
                  )}
                </div>
                {form.confirmPassword.length > 0 && (
                  <p className="text-[0.7rem] font-medium flex items-center gap-1 mt-1.5" style={{ color: pwEqual ? "var(--admin-success)" : "var(--admin-danger-text)" }}>
                    {pwEqual ? "Passwords match" : "Passwords don't match"}
                  </p>
                )}
              </div>

              {/* Role — selectable cards */}
              <div>
                <label style={label}>Role</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(["member", "admin"] as Role[]).map((r) => {
                    const selected = form.role === r;
                    const Icon = r === "admin" ? ShieldCheck : UserIcon;
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => setForm({ ...form, role: r })}
                        className="text-left rounded-xl p-3 transition-all cursor-pointer"
                        style={{
                          border: selected ? "1px solid rgba(99,102,241,0.5)" : "1px solid var(--admin-border)",
                          background: selected ? "var(--admin-accent-soft)" : "var(--admin-surface-2)",
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={13} style={{ color: selected ? "var(--admin-accent-text)" : "var(--admin-text-secondary)" }} />
                          <span className="text-xs font-bold capitalize" style={{ color: selected ? "var(--admin-text)" : "var(--admin-text-secondary)" }}>{r}</span>
                        </div>
                        <p className="text-[0.7rem] leading-snug text-(--admin-text-muted)">
                          {r === "admin" ? "Full access + manage users" : "Dashboard access only"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 mt-2 text-sm font-bold">
                <button type="button" onClick={closeAdd} className="px-4 py-2 rounded-full text-(--admin-text-muted) hover:bg-(--admin-hover-bg) cursor-pointer transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
                <button type="submit" disabled={saving || !canSubmit} className="px-5 py-2 rounded-full text-white cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 6px 20px rgba(99,102,241,0.35)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change-my-password modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "var(--admin-scrim)" }} onClick={closeChangePw}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(96,165,250,0.12)" }}>
                  <KeyRound size={17} style={{ color: "#60a5fa" }} />
                </div>
                <div>
                  <p className="text-base font-bold text-(--admin-text)">Change my password</p>
                  <p className="text-xs mt-0.5 text-(--admin-text-muted)">Updates the account you’re signed in as ({me.username}).</p>
                </div>
              </div>
              <button onClick={closeChangePw} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors" style={{ color: "var(--admin-text-muted)" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={changeMyPassword} className="mt-4 flex flex-col gap-3.5">
              <div>
                <label style={label}>Current password</label>
                <input style={inp} type={showCpPw ? "text" : "password"} value={cpForm.current}
                  onChange={(e) => setCpForm({ ...cpForm, current: e.target.value })}
                  placeholder="Your current password" autoComplete="current-password" />
              </div>
              <div>
                <label style={label}>New password</label>
                <div className="relative">
                  <input style={{ ...inp, paddingRight: 40 }} type={showCpPw ? "text" : "password"} value={cpForm.next}
                    onChange={(e) => setCpForm({ ...cpForm, next: e.target.value })}
                    placeholder="At least 8 characters" autoComplete="new-password" minLength={8} />
                  <button type="button" onClick={() => setShowCpPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-(--admin-hover-bg) transition-colors"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {showCpPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={label}>Confirm new password</label>
                <input style={inp} type={showCpPw ? "text" : "password"} value={cpForm.confirm}
                  onChange={(e) => setCpForm({ ...cpForm, confirm: e.target.value })}
                  placeholder="Re-enter new password" autoComplete="new-password" />
                {cpForm.confirm.length > 0 && cpForm.next !== cpForm.confirm && (
                  <p className="text-xs mt-1" style={{ color: "var(--admin-danger-text)" }}>Passwords don’t match.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 mt-1">
                <button type="button" onClick={closeChangePw} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-secondary)" }}>
                  Cancel
                </button>
                <button type="submit" disabled={!cpValid || savingCp}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                  style={{ background: "var(--admin-accent)" }}>
                  {savingCp ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {savingCp ? "Saving…" : "Change password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
