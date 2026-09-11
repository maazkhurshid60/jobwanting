"use client";

import { useState } from "react";
import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import SpreadsheetClient from "./SpreadsheetClient";
import { Maximize2, Minimize2 } from "lucide-react";

export default function SpreadsheetPage() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--admin-bg)", overflowX: "hidden" }}>
      <div className={isSidebarCollapsed ? "hidden lg:hidden" : ""}>
        <Sidebar active="spreadsheet" />
      </div>
      <div className={`transition-all duration-200 flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden ${isSidebarCollapsed ? "ml-0 lg:ml-0" : "lg:ml-56"}`}>
        <header className={`sticky top-0 z-20 flex items-center justify-between pr-4 h-14 transition-all duration-200 shrink-0 ${
          isSidebarCollapsed ? "pl-4 lg:px-8" : "pl-16 lg:px-8"
        }`}
          style={{ background: "var(--admin-bg)", borderBottom: "1px solid var(--admin-border)" }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-(--admin-hover-bg) transition-all cursor-pointer select-none"
              style={{ color: "var(--admin-text-secondary)", border: "1px solid var(--admin-border)", background: "var(--admin-surface-2)" }}
            >
              {isSidebarCollapsed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {isSidebarCollapsed ? "Show Sidebar" : "Maximize"}
            </button>
            <p className="text-sm font-semibold" style={{ color: "var(--admin-text-secondary)" }}>Spreadsheet</p>
          </div>
          <LogoutButton />
        </header>
        <main className="px-2 sm:px-3 lg:px-4 py-3 min-w-0 max-w-full flex-1 flex flex-col overflow-hidden">
          <SpreadsheetClient />
        </main>
      </div>
    </div>
  );
}
