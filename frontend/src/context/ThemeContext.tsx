import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isTheme, isThemePreference, THEME_STORAGE_KEY } from '@ar-menu/shared';
import type { Theme, ThemePreference } from '@ar-menu/shared';
import { ThemeContext } from './theme-context';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const TRANSITION_CLASS = 'theme-transition';
const TRANSITION_MS = 300;

// Storage can throw (privacy modes, blocked site data) — the theme then
// just follows the system preference for this session.
function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredPreference(preference: ThemePreference) {
  try {
    if (preference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Not persisted; the in-memory choice still applies until reload.
  }
}

/**
 * Light/dark theme state (documents/USER-APP-theming.md §3–4). The initial
 * `data-theme` is already on <html> before React mounts (public
 * /theme-init.js, see vite.config.ts), so this provider only has to keep it
 * in sync: an explicit choice sets `data-theme`, `system` removes it and
 * lets the CSS `prefers-color-scheme` rule decide.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark',
  );
  const transitionTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia(LIGHT_QUERY);
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? 'light' : 'dark');
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // Keep other open tabs in step when the choice changes in one of them.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreferenceState(readStoredPreference());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }, [preference]);

  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);

  const setPreference = useCallback((next: ThemePreference) => {
    // Values can arrive from DOM inputs — accept only the known set.
    if (!isThemePreference(next)) return;
    const root = document.documentElement;
    root.classList.add(TRANSITION_CLASS);
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(
      () => root.classList.remove(TRANSITION_CLASS),
      TRANSITION_MS,
    );
    writeStoredPreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme: preference === 'system' ? systemTheme : preference,
      setPreference,
    }),
    [preference, systemTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
