"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/bd825db8c738";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        /* An error response is not guaranteed to carry JSON — an unhandled
           500 from the platform has an empty body, and res.json() throws on
           it. That threw into the catch below, so a server fault was
           reported as "Network error", which is the one thing it was not. */
        const data = await res.json().catch(() => null);
        setError(
          data?.error ?? `Sign-in failed (server returned ${res.status}). Please tell your administrator.`,
        );
      }
    } catch {
      // Genuinely no response: offline, DNS, connection refused.
      setError("Couldn't reach the server — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--color-light)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-10 shadow-sm"
        style={{ background: "#fff", border: "1px solid var(--color-border)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-1 mb-8">
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            Patrick
          </span>
          <span className="text-xl font-bold" style={{ color: "#6366f1" }}>.</span>
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            Novick
          </span>
        </div>

        <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
          Admin Login
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--color-gray)" }}>
          Sign in to manage your Big Biller integration.
        </p>

        {error && (
          <div
            className="mb-5 px-4 py-3 rounded-xl text-sm font-medium"
            style={{ background: "#fff0f0", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-dark)" }}>
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-dark)", background: "var(--color-light)" }}
              onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-dark)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-dark)", background: "var(--color-light)" }}
              onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full px-6 py-3.5 rounded-full text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "#6366f1",
              fontFamily: "var(--font-heading)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
