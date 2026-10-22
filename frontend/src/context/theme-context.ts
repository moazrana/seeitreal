import { createContext } from 'react';
import type { Theme, ThemePreference } from '@ar-menu/shared';

export interface ThemeContextValue {
  /** What the user chose; `system` follows `prefers-color-scheme`. */
  preference: ThemePreference;
  /** The theme actually on screen right now. */
  resolvedTheme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
