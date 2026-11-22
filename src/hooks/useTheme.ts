import { useEffect, useState } from "react";
import { useStorageContext } from "./useStorageContext";

function resolveEffectiveTheme(theme: "light" | "dark" | "system"): "light" | "dark" {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function useTheme() {
  const { theme, setTheme } = useStorageContext();
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(() =>
    resolveEffectiveTheme(theme),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = window.document.documentElement;

    const applyTheme = () => {
      const next = resolveEffectiveTheme(theme);
      root.classList.toggle("dark", next === "dark");
      setEffectiveTheme(next);
    };

    applyTheme();

    if (theme === "system" && typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  return { theme, setTheme, effectiveTheme };
}
