"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "admin-theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

/** Read wherever the toggle in Sidebar.tsx lives. */
export const useAdminTheme = () => useContext(ThemeContext);

/* Dark is the default everywhere — matches what every admin page already
   looked like before this existed. Only users who've explicitly flipped the
   toggle (and therefore have a saved preference) ever see light mode, so
   there's no server/client mismatch to guard against beyond the one-frame
   gap while localStorage is read on mount. */
export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light") setTheme("light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div data-admin-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}
