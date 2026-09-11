import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import BouncedClient from "./BouncedClient";

export default function BouncedPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="bounced" />
      <div className="lg:ml-56">
        <header
          className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14 border-b border-(--admin-border)"
          style={{ background: "var(--admin-bg)" }}
        >
          <p className="text-sm font-semibold text-(--admin-text-secondary)">Bounced Emails</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <BouncedClient />
        </main>
      </div>
    </div>
  );
}
