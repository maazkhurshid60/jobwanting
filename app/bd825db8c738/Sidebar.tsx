"use client";

import Link from "next/link";
import { useState, useEffect, type ComponentType } from "react";
import {
  ExternalLink, BarChart2, Mail, Users, Layout, Menu, X, UserCog,
  Inbox, ChevronDown, Sun, Moon,
} from "lucide-react";
import { useAdminTheme } from "./ThemeProvider";

const BASE = "/bd825db8c738";

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

type NavLeaf = { label: string; href: string; key: string; adminOnly?: boolean };
// `children` is for a link that also needs a permanently-visible sub-item
// underneath it (Reports under Dashboard) — unlike NavGroup, there's no
// collapse/expand toggle, since the parent itself stays a clickable page.
type NavLink = {
  type: "link"; label: string; icon: IconType; href: string; key: string; badge?: string;
  children?: NavLeaf[];
};
type NavGroup = { type: "group"; label: string; icon: IconType; key: string; items: NavLeaf[] };

/* Grouped so the sidebar reads as ~6 sections instead of a flat list of every
   sub-page. Each page still passes its own leaf `key` to <Sidebar active=… />
   unchanged — grouping only changes how those same keys are presented. */
const NAV: (NavLink | NavGroup)[] = [
  {
    type: "link", label: "Dashboard", icon: BarChart2, href: BASE, key: "dashboard",
    children: [{ label: "Reports", href: `${BASE}/analytics`, key: "analytics" }],
  },
  {
    type: "group", label: "Contacts", icon: Users, key: "contacts-group",
    items: [
      { label: "All Contacts", href: `${BASE}/contacts`, key: "contacts" },
      { label: "Spreadsheet", href: `${BASE}/spreadsheet`, key: "spreadsheet" },
      { label: "Lists", href: `${BASE}/lists`, key: "lists" },
      { label: "Bounced", href: `${BASE}/bounced`, key: "bounced" },
      { label: "Opt-Outs", href: `${BASE}/optouts`, key: "optouts" },
    ],
  },
  {
    type: "group", label: "Campaigns", icon: Mail, key: "campaigns-group",
    items: [
      { label: "Email Campaigns", href: `${BASE}/campaigns`, key: "campaigns" },
      { label: "Scheduler", href: `${BASE}/scheduler`, key: "scheduler" },
    ],
  },
  // Not built yet — links to a placeholder rather than claiming the feature
  // exists. See app/bd825db8c738/inbox/page.tsx.
  { type: "link", label: "Inbox", icon: Inbox, href: `${BASE}/inbox`, key: "inbox", badge: "Soon" },
  {
    type: "group", label: "Templates", icon: Layout, key: "templates-group",
    items: [
      { label: "Templates", href: `${BASE}/templates`, key: "templates" },
      { label: "Template Maker", href: `${BASE}/template-maker`, key: "template-maker" },
      { label: "Email Footer", href: `${BASE}/footer-settings`, key: "footer-settings" },
    ],
  },
  {
    type: "group", label: "Admin", icon: UserCog, key: "admin-group",
    items: [
      { label: "Users", href: `${BASE}/users`, key: "users", adminOnly: true },
      { label: "Vault", href: `${BASE}/vault`, key: "vault", adminOnly: true },
    ],
  },
];

export default function Sidebar({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const close = () => setOpen(false);
  const { theme, toggle: toggleTheme } = useAdminTheme();

  // A group starts expanded when the current page lives inside it, so the
  // active link is never hidden behind a collapsed section on load.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const entry of NAV) {
      if (entry.type === "group") init[entry.key] = entry.items.some((i) => i.key === active);
    }
    return init;
  });
  const toggleGroup = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        // 401 means the session is no longer valid (e.g. the account was
        // disabled) — bounce to the login page rather than showing a stale UI.
        if (r.status === 401) { window.location.href = "/feb58da15ece"; return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  const handleLinkClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined" && (window as unknown as { __hasUnsavedChanges?: boolean }).__hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave this page?")) {
        e.preventDefault();
        return;
      }
    }
    close();
  };

  const isAdmin = me?.role === "admin";

  return (
    <>
      {/* Mobile hamburger — sits inside the top bar, hidden on desktop */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="lg:hidden fixed top-0 left-0 z-30 h-14 w-14 flex items-center justify-center text-(--admin-text-secondary) transition-colors hover:bg-(--admin-hover-bg)"
      >
        <Menu size={20} />
      </button>

      {/* Backdrop (mobile only, when drawer open) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          style={{ background: "var(--admin-scrim)" }}
          onClick={close}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-56 flex flex-col z-50 border-r border-(--admin-border) transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--admin-bg)" }}
      >
        {/* Close button (mobile only) */}
        <button
          onClick={close}
          aria-label="Close menu"
          className="lg:hidden absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-(--admin-text-muted) transition-colors hover:bg-(--admin-hover-bg)"
        >
          <X size={16} />
        </button>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-(--admin-border)">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Patrick</span>
            <span className="text-sm font-bold" style={{ color: "var(--admin-accent)" }}>.</span>
            <span className="text-sm font-bold text-(--admin-text)" style={{ fontFamily: "var(--font-heading)" }}>Novick</span>
          </div>
          <p className="text-xs text-(--admin-text-faint)">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 flex flex-col gap-0.5 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-widest px-3 mb-3 text-(--admin-text-faint)">
            Application
          </p>

          {NAV.map((entry) => {
            if (entry.type === "link") {
              const isActive = active === entry.key;
              const Icon = entry.icon;
              return (
                <div key={entry.key}>
                  <Link
                    href={entry.href}
                    onClick={handleLinkClick}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? ""
                        : "text-(--admin-text-muted) hover:bg-(--admin-hover-bg) hover:text-(--admin-text) hover:translate-x-0.5"
                    }`}
                    style={{
                      background: isActive ? "var(--admin-accent-soft)" : undefined,
                      color: isActive ? "var(--admin-accent-text)" : undefined,
                    }}
                  >
                    <Icon size={15} strokeWidth={1.75} />
                    <span className="flex-1">{entry.label}</span>
                    {entry.badge && (
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)" }}
                      >
                        {entry.badge}
                      </span>
                    )}
                  </Link>
                  {entry.children && (
                    <div className="ml-4 pl-3 mt-0.5 flex flex-col gap-0.5 border-l border-(--admin-border)">
                      {entry.children.map((child) => {
                        const childActive = active === child.key;
                        return (
                          <Link
                            key={child.key}
                            href={child.href}
                            onClick={handleLinkClick}
                            className={`block px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                              childActive
                                ? ""
                                : "text-(--admin-text-faint) hover:bg-(--admin-hover-bg) hover:text-(--admin-text) hover:translate-x-0.5"
                            }`}
                            style={{
                              background: childActive ? "var(--admin-accent-soft)" : undefined,
                              color: childActive ? "var(--admin-accent-text)" : undefined,
                            }}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const items = entry.items.filter((i) => !i.adminOnly || isAdmin);
            if (items.length === 0) return null;

            const isGroupActive = items.some((i) => i.key === active);
            const isOpen = expanded[entry.key] ?? isGroupActive;
            const GroupIcon = entry.icon;

            return (
              <div key={entry.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isGroupActive
                      ? ""
                      : "text-(--admin-text-muted) hover:bg-(--admin-hover-bg) hover:text-(--admin-text) hover:translate-x-0.5"
                  }`}
                  style={{ color: isGroupActive ? "var(--admin-accent-text)" : undefined }}
                  aria-expanded={isOpen}
                >
                  <GroupIcon size={15} strokeWidth={1.75} />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.75}
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 150ms",
                      opacity: 0.6,
                    }}
                  />
                </button>
                {isOpen && (
                  <div className="ml-4 pl-3 flex flex-col gap-0.5 border-l border-(--admin-border)">
                    {items.map((item) => {
                      const isActive = active === item.key;
                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          onClick={handleLinkClick}
                          className={`block px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                            isActive
                              ? ""
                              : "text-(--admin-text-faint) hover:bg-(--admin-hover-bg) hover:text-(--admin-text) hover:translate-x-0.5"
                          }`}
                          style={{
                            background: isActive ? "var(--admin-accent-soft)" : undefined,
                            color: isActive ? "var(--admin-accent-text)" : undefined,
                          }}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-4 pt-4 border-t border-(--admin-border)">
            <p className="text-xs font-semibold uppercase tracking-widest px-3 mb-3 text-(--admin-text-faint)">
              Others
            </p>
            <Link
              href="/"
              onClick={handleLinkClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-(--admin-text-muted) transition-all hover:bg-(--admin-hover-bg)"
            >
              <ExternalLink size={15} strokeWidth={1.75} />
              View Site
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-(--admin-text-muted) transition-all hover:bg-(--admin-hover-bg)"
            >
              {theme === "dark" ? (
                <Sun size={15} strokeWidth={1.75} />
              ) : (
                <Moon size={15} strokeWidth={1.75} />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </nav>

        {/* User badge */}
        <div className="px-4 py-4 border-t border-(--admin-border)">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: "var(--admin-surface-2)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--admin-accent)", color: "#fff" }}>
              {(me?.username?.[0] ?? "P").toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-(--admin-text) truncate">{me?.username ?? "Patrick Novick"}</p>
              <p className="text-xs truncate capitalize text-(--admin-text-muted)">{me?.role ?? "Admin"}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
