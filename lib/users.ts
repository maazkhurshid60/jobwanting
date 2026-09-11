import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import db from "@/lib/db";
import { sessionUserId } from "@/lib/session";

export type Role = "admin" | "member";

export interface SessionUser {
  id: string;        // "env" for the bootstrap admin, or a numeric id as a string
  username: string;
  role: Role;
}

export interface AdminUser {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  created_at: number;
}

// ─── Password hashing (scrypt + per-user salt) ────────────────────────────────

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyHash(password: string, hash: string, salt: string): boolean {
  const a = scryptSync(password, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Login ────────────────────────────────────────────────────────────────────

// Returns the id of an active DB user whose credentials match, else null.
export async function findUserForLogin(username: string, password: string): Promise<number | null> {
  const res = await db.execute({
    sql: "SELECT id, password_hash, password_salt, active FROM admin_users WHERE username = ?",
    args: [username],
  });
  const row = res.rows[0];
  if (!row) return null;
  if (Number(row.active) !== 1) return null;
  if (!verifyHash(password, row.password_hash as string, row.password_salt as string)) return null;
  return Number(row.id);
}

// ─── Login lockout ──────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

// Seconds remaining if `username` is currently locked out, else null.
export async function checkLoginLockout(username: string): Promise<number | null> {
  if (!username) return null;
  const res = await db.execute({
    sql: "SELECT locked_until FROM login_attempts WHERE username = ?",
    args: [username],
  });
  const lockedUntil = Number(res.rows[0]?.locked_until) || 0;
  const remaining = lockedUntil - Math.floor(Date.now() / 1000);
  return remaining > 0 ? remaining : null;
}

// Records a failed login, locking the username out once MAX_FAILED_ATTEMPTS is reached.
export async function recordFailedLogin(username: string): Promise<void> {
  if (!username) return;
  const res = await db.execute({
    sql: "SELECT fail_count FROM login_attempts WHERE username = ?",
    args: [username],
  });
  const count = (Number(res.rows[0]?.fail_count) || 0) + 1;
  const lockedUntil = count >= MAX_FAILED_ATTEMPTS ? Math.floor(Date.now() / 1000) + LOCKOUT_SECONDS : 0;
  await db.execute({
    sql: `INSERT INTO login_attempts (username, fail_count, locked_until, updated_at)
          VALUES (?, ?, ?, unixepoch())
          ON CONFLICT(username) DO UPDATE SET
            fail_count = excluded.fail_count, locked_until = excluded.locked_until, updated_at = unixepoch()`,
    args: [username, count, lockedUntil],
  });
}

// Clears attempt tracking after a successful login.
export async function clearLoginAttempts(username: string): Promise<void> {
  if (!username) return;
  await db.execute({ sql: "DELETE FROM login_attempts WHERE username = ?", args: [username] });
}

// ─── Session → user resolution ────────────────────────────────────────────────

// Resolves the logged-in user from a session token. The env bootstrap admin is
// always treated as an active admin; DB users must still exist and be active
// (so disabling an account immediately invalidates its sessions).
export async function getSessionUserFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const uid = sessionUserId(token);
  if (!uid) return null;

  if (uid === "env") {
    return { id: "env", username: process.env.ADMIN_USERNAME ?? "admin", role: "admin" };
  }

  if (!/^\d+$/.test(uid)) return null;
  const res = await db.execute({
    sql: "SELECT id, username, role, active FROM admin_users WHERE id = ?",
    args: [Number(uid)],
  });
  const row = res.rows[0];
  if (!row || Number(row.active) !== 1) return null;
  return {
    id: String(row.id),
    username: row.username as string,
    role: row.role === "admin" ? "admin" : "member",
  };
}

// ─── User management (admin-only; callers must authorize) ─────────────────────

export async function listUsers(): Promise<AdminUser[]> {
  const res = await db.execute(
    "SELECT id, username, role, active, created_at FROM admin_users ORDER BY created_at DESC"
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    username: r.username as string,
    role: r.role === "admin" ? "admin" : "member",
    active: Number(r.active) === 1,
    created_at: Number(r.created_at),
  }));
}

export type CreateUserResult =
  | { ok: true; id: number }
  | { ok: false; error: string; status: number };

export async function createUser(username: string, password: string, role: Role): Promise<CreateUserResult> {
  const uname = username.trim();
  if (uname.length < 3) return { ok: false, error: "Username must be at least 3 characters.", status: 400 };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters.", status: 400 };
  if (role !== "admin" && role !== "member") return { ok: false, error: "Invalid role.", status: 400 };

  const { hash, salt } = hashPassword(password);
  try {
    const res = await db.execute({
      sql: "INSERT INTO admin_users (username, password_hash, password_salt, role, active) VALUES (?, ?, ?, ?, 1)",
      args: [uname, hash, salt, role],
    });
    return { ok: true, id: Number(res.lastInsertRowid) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) return { ok: false, error: "That username is already taken.", status: 409 };
    return { ok: false, error: "Failed to create user.", status: 500 };
  }
}

export type UpdateUserResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// Does a DB account already exist for this username? Used by login to stop the
// env bootstrap password from working once the admin has been migrated to the DB.
export async function usernameExists(username: string): Promise<boolean> {
  const res = await db.execute({
    sql: "SELECT 1 FROM admin_users WHERE username = ? LIMIT 1",
    args: [username.trim()],
  });
  return res.rows.length > 0;
}

// Migrate the env bootstrap admin into a real DB account (or update it if one
// already exists). After this, login uses the DB password and the old env
// password is retired (see the login route). Returns the DB user id.
export async function promoteEnvAdminToDb(username: string, password: string): Promise<{ ok: true; id: number } | { ok: false; error: string; status: number }> {
  const uname = username.trim();
  if (uname.length < 3) return { ok: false, error: "Invalid admin username.", status: 400 };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters.", status: 400 };
  const { hash, salt } = hashPassword(password);

  const existing = await db.execute({ sql: "SELECT id FROM admin_users WHERE username = ?", args: [uname] });
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    await db.execute({
      sql: "UPDATE admin_users SET password_hash = ?, password_salt = ?, role = 'admin', active = 1 WHERE id = ?",
      args: [hash, salt, id],
    });
    return { ok: true, id };
  }
  const res = await db.execute({
    sql: "INSERT INTO admin_users (username, password_hash, password_salt, role, active) VALUES (?, ?, ?, 'admin', 1)",
    args: [uname, hash, salt],
  });
  return { ok: true, id: Number(res.lastInsertRowid) };
}

// Admin: set a new password for an existing DB user (rehashes with a fresh salt).
export async function setUserPassword(id: number, password: string): Promise<UpdateUserResult> {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters.", status: 400 };
  const { hash, salt } = hashPassword(password);
  const res = await db.execute({
    sql: "UPDATE admin_users SET password_hash = ?, password_salt = ? WHERE id = ?",
    args: [hash, salt, id],
  });
  if (res.rowsAffected === 0) return { ok: false, error: "User not found.", status: 404 };
  return { ok: true };
}

// Admin: change an existing DB user's role.
export async function setUserRole(id: number, role: Role): Promise<UpdateUserResult> {
  if (role !== "admin" && role !== "member") return { ok: false, error: "Invalid role.", status: 400 };
  const res = await db.execute({
    sql: "UPDATE admin_users SET role = ? WHERE id = ?",
    args: [role, id],
  });
  if (res.rowsAffected === 0) return { ok: false, error: "User not found.", status: 404 };
  return { ok: true };
}

export async function setUserActive(id: number, active: boolean): Promise<void> {
  await db.execute({
    sql: "UPDATE admin_users SET active = ? WHERE id = ?",
    args: [active ? 1 : 0, id],
  });
}

export async function deleteUser(id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM admin_users WHERE id = ?", args: [id] });
}
