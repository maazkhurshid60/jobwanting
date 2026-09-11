import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import TemplateMakerClient from "./TemplateMakerClient";

export default function TemplateMakerPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="template-maker" />
      <div className="lg:ml-56">
        <header className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14"
          style={{ background: "var(--admin-bg)", borderBottom: "1px solid var(--admin-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--admin-text-secondary)" }}>Template Maker</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <TemplateMakerClient />
        </main>
      </div>
    </div>
  );
}
