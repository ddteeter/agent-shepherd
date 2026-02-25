import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'shepherd-theme';

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage may be unavailable
    }
    applyTheme(resolveTheme(newTheme));
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme =
        current === 'system' ? 'light' :
        current === 'light' ? 'dark' :
        'system';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage may be unavailable
      }
      applyTheme(resolveTheme(next));
      return next;
    });
  }, []);

  // Apply theme on mount and listen for OS preference changes in 'system' mode
  useEffect(() => {
    applyTheme(resolveTheme(theme));

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      // Only react to OS changes when in 'system' mode.
      // We read from localStorage to get the latest value, since
      // the effect closure captures the theme at setup time.
      const current = getStoredTheme();
      if (current === 'system') {
        applyTheme(getSystemTheme());
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  const resolved = resolveTheme(theme);

  return { theme, resolved, setTheme, cycleTheme };
}
