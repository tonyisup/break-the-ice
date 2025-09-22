import { useEffect, useState } from 'react';
import { useStorageContext } from './useStorageContext';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const { theme, setTheme } = useStorageContext();
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;

    const applyTheme = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
      setEffectiveTheme(isDark ? 'dark' : 'light');
    };

    applyTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  return { theme, setTheme, effectiveTheme };
}