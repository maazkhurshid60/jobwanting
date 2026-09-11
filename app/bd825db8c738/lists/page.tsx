import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import ListsClient from "./ListsClient";

export default function ListsPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="lists" />
      <div className="lg:ml-56">
        <header className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14 border-b border-(--admin-border)"
          style={{ background: "var(--admin-bg)" }}>
          <p className="text-sm font-semibold text-(--admin-text-secondary)">Contact Lists</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <ListsClient />
        </main>
      </div>
    </div>
  );
}
