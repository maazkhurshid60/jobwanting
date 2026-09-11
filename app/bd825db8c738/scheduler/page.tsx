import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";
import SchedulerClient from "./SchedulerClient";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchedulerPage() {
  const [countResult, listsResult, templatesResult] = await Promise.all([
    db.execute("SELECT COUNT(*) as count FROM contacts WHERE status = 'active' OR status IS NULL"),
    db.execute(`
      SELECT cl.id, cl.name,
             (SELECT COUNT(*) FROM contact_list_members m WHERE m.list_id = cl.id) AS member_count
      FROM contact_lists cl ORDER BY cl.name
    `),
    db.execute("SELECT id, name, subject, body FROM email_templates ORDER BY updated_at DESC"),
  ]);

  const contactCount = Number(countResult.rows[0]?.count ?? 0);
  const lists = listsResult.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    member_count: Number(r.member_count ?? 0),
  }));
  const templates = templatesResult.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    subject: String(r.subject),
    body: String(r.body),
  }));

  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="scheduler" />
      <div className="lg:ml-56">
        <header className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14 border-b border-(--admin-border)"
          style={{ background: "var(--admin-bg)" }}>
          <p className="text-sm font-semibold text-(--admin-text-secondary)">Scheduler</p>
          <LogoutButton />
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <SchedulerClient contactCount={contactCount} lists={lists} templates={templates} />
        </main>
      </div>
    </div>
  );
}
