import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const THEME_CHANGE_EVENT = 'theme-change';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return 'light'; // Default for SSR
    }
    
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme as Theme;
      }
      // Use matchMedia with fallback for older browsers
      if (window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    } catch (error) {
      console.warn('Error accessing theme preferences:', error);
      return 'light';
    }
  });

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;
    
    try {
      const root = window.document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
      
      // Dispatch theme change event
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
    } catch (error) {
      console.warn('Error setting theme:', error);
    }
  }, [theme]);

  return { theme, setTheme };
}

export function useThemeListener() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return 'light'; // Default for SSR
    }
    
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme as Theme;
      }
      // Use matchMedia with fallback for older browsers
      if (window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    } catch (error) {
      console.warn('Error accessing theme preferences:', error);
      return 'light';
    }
  });

  useEffect(() => {
    // Only run in browser environment
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