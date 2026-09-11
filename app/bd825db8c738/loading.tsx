import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "var(--admin-bg)" }}>
      <Loader2 className="animate-spin text-(--admin-accent)" size={28} />
      <p className="text-xs font-medium text-(--admin-text-muted)">Loading…</p>
    </div>
  );
}
