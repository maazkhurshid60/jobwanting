import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import CampaignClient from "./CampaignClient";
import db from "@/lib/db";

export default async function CampaignsPage() {
  const countResult = await db.execute(
    "SELECT COUNT(*) as count FROM contacts WHERE status = 'active' OR status IS NULL"
  );
  const contactCount = Number(countResult.rows[0]?.count ?? 0);

  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="campaigns" />
      <div className="lg:ml-56">
        <header
          className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14 border-b border-(--admin-border)"
          style={{ background: "var(--admin-bg)" }}
        >
          <p className="text-sm font-semibold text-(--admin-text-secondary)">Email Campaigns</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <CampaignClient contactCount={contactCount} lists={[]} />
        </main>
      </div>
    </div>
  );
}