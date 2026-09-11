import { getConnection } from "@/lib/token";
import { redirect } from "next/navigation";
import Link from "next/link";

const ADMIN_USER_ID = 1;

/* This page asks the database whether the Top Echelon integration is already
   connected, and redirects when it is. Prerendering it would freeze that
   answer at build time — and make the build itself depend on the database,
   which is what broke the deploy. */
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "OAuth response was missing required parameters.",
  invalid_state: "CSRF state mismatch — please try again.",
  token_exchange_failed: "Failed to exchange the authorisation code for tokens.",
  access_denied: "You denied access to the integration.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const connection = await getConnection(ADMIN_USER_ID);

  // Already connected — send to admin
  if (connection) redirect("/bd825db8c738");

  const errorMsg = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? "An unknown error occurred.")
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-light)" }}>
      <div
        className="w-full max-w-md rounded-2xl p-10 shadow-sm"
        style={{ background: "#fff", border: "1px solid var(--color-border)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-1 mb-8">
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            Patrick
          </span>
          <span className="text-xl font-bold" style={{ color: "var(--color-red)" }}>.</span>
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}>
            Novick
          </span>
        </div>

        <h1
          className="text-2xl font-black mb-2"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
        >
          Connect Big Biller
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--color-gray)" }}>
          Link your Top Echelon / Big Biller account to enable email marketing
          integrations. You will be asked to log in and authorise access.
        </p>

        {errorMsg && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm font-medium"
            style={{ background: "#fff0f0", color: "var(--color-red)", border: "1px solid rgba(230,57,70,0.2)" }}
          >
            {errorMsg}
          </div>
        )}

        <a
          href="/api/auth/connect"
          className="flex items-center justify-center gap-3 w-full px-6 py-3.5 rounded-full text-sm font-bold text-white transition-all duration-200 hover:scale-[1.02]"
          style={{
            background: "var(--color-red)",
            fontFamily: "var(--font-heading)",
            boxShadow: "0 4px 20px rgba(230,57,70,0.3)",
          }}
        >
          Connect to Big Biller
        </a>

        <p className="mt-6 text-xs text-center" style={{ color: "var(--color-gray)" }}>
          Tokens are stored encrypted on the server and never sent to your browser.
        </p>

        <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: "var(--color-border)" }}>
          <Link href="/" className="text-xs" style={{ color: "var(--color-gray)" }}>
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
