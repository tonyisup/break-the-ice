import { useEffect } from 'react';
import { useStorageContext } from './useStorageContext';

type Theme = 'light' | 'dark';

const THEME_CHANGE_EVENT = 'theme-change';

export function useTheme() {
  const { theme, setTheme } = useStorageContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const root = window.document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
    } catch (error) {
      console.warn('Error setting theme:', error);
    }
  }, [theme]);

  return { theme, setTheme };
}

import { useState } from 'react';

export function useThemeListener() {
  const { theme: initialTheme } = useStorageContext();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleThemeChange = (event: CustomEvent<Theme>) => {
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