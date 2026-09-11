import { Inbox as InboxIcon, Reply, Flag, StickyNote, ListPlus, ShieldOff } from "lucide-react";
import Sidebar from "../Sidebar";
import LogoutButton from "../LogoutButton";

const CATEGORIES = ["All", "Interested", "Follow Up", "Not Interested", "Out of Office", "Unsubscribe"];

const ACTIONS: { icon: typeof Reply; label: string }[] = [
  { icon: Reply, label: "Reply" },
  { icon: Flag, label: "Mark Interested" },
  { icon: StickyNote, label: "Add Note" },
  { icon: ListPlus, label: "Add to List" },
  { icon: ShieldOff, label: "Suppress" },
];

/* Placeholder for the reply-ingestion feature discussed for the next phase —
   this page exists so the sidebar's simplified menu doesn't link to nothing,
   not because the feature is built. Building it means pulling replies into
   the app (IMAP/webhook ingestion), which is real backend work, not a nav
   reorg. */
export default function InboxPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--admin-bg)" }}>
      <Sidebar active="inbox" />
      <div className="lg:ml-56">
        <header
          className="sticky top-0 z-20 flex items-center justify-between pl-16 pr-4 lg:px-8 h-14"
          style={{ background: "var(--admin-bg)", borderBottom: "1px solid var(--admin-border)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--admin-text-secondary)" }}>Inbox</p>
          <LogoutButton />
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-7">
          <div
            className="mx-auto max-w-2xl rounded-2xl p-10 text-center"
            style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
          >
            <div
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--admin-accent-soft)", color: "var(--admin-accent-text)" }}
            >
              <InboxIcon size={22} strokeWidth={1.75} />
            </div>
            <h1 className="text-base font-semibold text-(--admin-text)">Reply inbox — coming in the next phase</h1>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--admin-text-muted)" }}>
              Replies to your campaigns will land here instead of only in your
              email client, sorted so you can act on interest without leaving
              the app.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              {CATEGORIES.map((c) => (
                <span
                  key={c}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)" }}
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 pt-6" style={{ borderTop: "1px solid var(--admin-border)" }}>
              {ACTIONS.map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--admin-text-faint)" }}>
                  <Icon size={13} strokeWidth={1.75} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
