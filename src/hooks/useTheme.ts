import { useEffect } from 'react';
import { useStorageContext } from './useStorageContext';

type Theme = 'light' | 'dark' | 'system';

const THEME_CHANGE_EVENT = 'theme-change';

export function useTheme() {
  const { theme, setTheme } = useStorageContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;

    const applyTheme = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
      window.dispatchEvent(
        new CustomEvent(THEME_CHANGE_EVENT, { detail: theme })
      );
    };

    applyTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  return { theme, setTheme };
}

import { useState } from 'react';

export function useThemeListener() {
  const { theme: initialTheme } = useStorageContext();
  const [theme, setTheme] = useState<"light" | "dark" | "system">(initialTheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleThemeChange = (event: CustomEvent<"light" | "dark" | "system">) => {
      setTheme(event.detail);
    };

    try {
      window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
      return () => {
        window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener);
      };
    } catch (error) {
      console.warn('Error setting up theme listener:', error);
    }
  }, []);

  return theme;
} 