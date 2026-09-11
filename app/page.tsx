import Link from "next/link";

/* The public face of an otherwise private tool.
 *
 * Everything else in this app sits behind the session check in proxy.ts, on
 * deliberately unguessable paths. This page is the only thing an anonymous
 * visitor can see, so it says what the tool is and offers a way in, and
 * nothing else: no contact counts, no campaign names, no client data.
 *
 * SIGN-IN LINK: the block marked below is the only place either private path
 * appears in public HTML. It points at the sign-in page, never at the panel
 * itself, so the panel's path stays unpublished. Deleting that one block
 * makes this page a dead end and leaves the tool reachable only by someone
 * who already has the URL - which is the safer setting if the client would
 * rather bookmark it. Nothing else on the page depends on it.
 */

const CAPABILITIES = [
  { title: "Contacts & lists", body: "Import, segment and keep one source of truth for who can be contacted." },
  { title: "Campaigns", body: "Build an email, choose a list, preview it and send." },
  { title: "Templates", body: "Reusable layouts so a campaign starts from something finished." },
  { title: "Scheduler", body: "Queue a send for later and let it go out on its own." },
  { title: "Reports", body: "Opens and engagement per campaign, not a vanity dashboard." },
  { title: "Opt-outs & bounces", body: "Unsubscribes and failures handled automatically, so the list stays clean." },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col" style={{ background: "var(--color-light)" }}>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20 sm:px-8 sm:py-28">
        <p
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#6366f1" }}
        >
          Patrick Novick
        </p>

        <h1
          className="mt-4 max-w-2xl text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
        >
          Email campaign manager
        </h1>

        <p
          className="mt-5 max-w-xl text-lg leading-8"
          style={{ color: "var(--color-gray)" }}
        >
          Contacts, campaigns, templates and scheduling in one place, with
          opt-outs and bounces handled for you. A private tool: everything
          below the sign-in is restricted.
        </p>

        {/* ---- SIGN-IN LINK (see the note at the top of this file) ---- */}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/feb58da15ece"
            className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-colors duration-200"
            style={{ background: "#6366f1" }}
          >
            Sign in
          </Link>
          <span className="text-sm" style={{ color: "var(--color-gray)" }}>
            Authorised users only.
          </span>
        </div>
        {/* ---- end sign-in link ---- */}

        <div
          className="mt-20 grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-3"
          style={{ background: "var(--color-border)" }}
        >
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="p-7" style={{ background: "#fff" }}>
              <h2
                className="text-[17px] font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
              >
                {c.title}
              </h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-gray)" }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer
        className="px-6 py-8 text-center text-xs sm:px-8"
        style={{ color: "var(--color-gray)", borderTop: "1px solid var(--color-border)" }}
      >
        {`© ${new Date().getFullYear()} Patrick Novick. All rights reserved.`}
      </footer>
    </div>
  );
}
