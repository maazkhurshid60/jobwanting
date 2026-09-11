import { AdminThemeProvider } from "./ThemeProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminThemeProvider>{children}</AdminThemeProvider>;
}
