"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    if (typeof window !== "undefined" && (window as any).__hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to sign out?")) {
        return;
      }
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/feb58da15ece");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs font-medium text-(--admin-text-faint) transition-colors duration-200 hover:text-red-400"
    >
      Sign out
    </button>
  );
}
