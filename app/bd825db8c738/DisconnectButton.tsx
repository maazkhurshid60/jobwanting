"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisconnectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Are you sure? This will delete the stored tokens and you will need to reconnect.")) return;
    setLoading(true);
    await fetch("/api/auth/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="px-5 py-2.5 rounded-full text-sm font-semibold border border-(--admin-border) text-(--admin-text-muted) transition-all duration-200 hover:border-red-500 hover:text-red-500 disabled:opacity-50"
    >
      {loading ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
