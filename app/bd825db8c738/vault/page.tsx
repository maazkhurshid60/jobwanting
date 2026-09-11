import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import VaultClient from "./VaultClient";

export default function VaultPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="vault" />
      <div className="transition-all duration-200 flex-1 flex flex-col min-w-0 lg:ml-56">
        <header className="sticky top-0 z-20 flex items-center justify-between pr-4 h-14 pl-16 lg:px-8 shrink-0 border-b border-(--admin-border)"
          style={{ background: "var(--admin-bg)" }}>
          <p className="text-sm font-semibold text-(--admin-text-secondary)">Vault</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 min-w-0 flex-1">
          <VaultClient />
        </main>
      </div>
    </div>
  );
}
