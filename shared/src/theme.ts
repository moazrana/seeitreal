/**
 * Canonical light/dark theme tokens for the whole product
 * (documents/USER-APP-theming.md §2). This module is the single source of
 * truth: the dashboard imports the generated `dist/theme.css`, the backend's
 * diner AR viewer inlines `buildThemeCss()`, and the Three.js hero /
 * <model-viewer> read their per-theme parameters from here. Never fork the
 * palette per app — add or change a value here instead.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** `system` follows `prefers-color-scheme`; the others are explicit choices. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** localStorage key for the user's explicit choice (absent = `system`). */
export const THEME_STORAGE_KEY = 'seeitreal.theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** Role tokens whose value differs between the two themes. (A type alias,
 * not an interface, so it stays assignable to `Record<string, string>`.) */
export type ThemeTokens = {
  bg: string;
  surface: string;
  'surface-2': string;
  'surface-hover': string;
  text: string;
  'text-muted': string;
  'text-faint': string;
  border: string;
  'border-strong': string;
  'shadow-elev': string;
  'glow-strength': string;
  /** Gradient for gradient-*text* — deeper stops on light so it keeps contrast. */
  'grad-text': string;
  /** Accent for text, links, focus outlines and selected borders (AA on bg). */
  'accent-strong': string;
  'focus-ring': string;
  /** Translucent sticky-header background. */
  'header-bg': string;
  /** Radial scrim behind the hero headline, keeping it legible over the 3D. */
  'hero-scrim': string;
  danger: string;
  'danger-bg': string;
  'danger-line': string;
  warning: string;
  'warning-bg': string;
  'warning-line': string;
  /** Positive status (active subscription, live, paid). */
  ok: string;
  'ok-bg': string;
  'ok-line': string;
  'tint-violet-text': string;
  'tint-blue-text': string;
  'tint-teal-text': string;
};

const BRAND_GRADIENT = 'linear-gradient(105deg, #4d7cff, #8b5cf6 50%, #2dd4bf)';

/** Tokens that are identical in both themes (brand + fixed-purpose colours). */
export const brandTokens = {
  blue: '#4d7cff',
  violet: '#8b5cf6',
  teal: '#2dd4bf',
  /** Space-separated RGB channels of the brand hues, for glows whose alpha
   * scales with `--glow-strength`: `rgb(var(--violet-rgb) / calc(...))`. */
  'blue-rgb': '77 124 255',
  'violet-rgb': '139 92 246',
  'teal-rgb': '45 212 191',
  /** Button/fill background — same in both themes. */
  grad: BRAND_GRADIENT,
  /** Text on `--grad` fills. */
  'on-grad': '#060712',
  /** Scrim behind modals / over photos, with its foreground. */
  overlay: 'rgba(0, 0, 0, 0.65)',
  'on-overlay': '#ffffff',
  /** QR codes must stay dark-on-white to remain scannable in either theme. */
  'qr-bg': '#ffffff',
  'tint-violet-bg': 'rgba(139, 92, 246, 0.14)',
  'tint-violet-line': 'rgba(139, 92, 246, 0.3)',
  'tint-blue-bg': 'rgba(77, 124, 255, 0.14)',
  'tint-blue-line': 'rgba(77, 124, 255, 0.3)',
  'tint-teal-bg': 'rgba(45, 212, 191, 0.14)',
  'tint-teal-line': 'rgba(45, 212, 191, 0.3)',
} as const;

export const themeTokens: Record<Theme, ThemeTokens> = {
  dark: {
    bg: '#0a0b14',
    surface: '#12141f',
    'surface-2': '#171a27',
    'surface-hover': 'rgba(255, 255, 255, 0.04)',
    text: '#f4f5fb',
    'text-muted': '#9ba0b4',
    'text-faint': '#6a6f84',
    border: 'rgba(255, 255, 255, 0.08)',
    'border-strong': 'rgba(255, 255, 255, 0.16)',
    'shadow-elev': '0 8px 30px rgba(0, 0, 0, 0.35)',
    'glow-strength': '0.22',
    'grad-text': BRAND_GRADIENT,
    'accent-strong': '#2dd4bf',
    'focus-ring': 'rgba(45, 212, 191, 0.15)',
    'header-bg': 'rgba(10, 11, 20, 0.85)',
    'hero-scrim': 'rgba(10, 11, 20, 0.72)',
    danger: '#ff6b6b',
    'danger-bg': 'rgba(255, 107, 107, 0.1)',
    'danger-line': 'rgba(255, 107, 107, 0.35)',
    warning: '#f5a524',
    'warning-bg': 'rgba(245, 165, 36, 0.1)',
    'warning-line': 'rgba(245, 165, 36, 0.35)',
    ok: '#4ade80',
    'ok-bg': 'rgba(74, 222, 128, 0.1)',
    'ok-line': 'rgba(74, 222, 128, 0.35)',
    'tint-violet-text': '#c4b5fd',
    'tint-blue-text': '#a8c0ff',
    'tint-teal-text': '#7fe8d8',
  },
  light: {
    // Spec says #f7f8fc; a slightly grayer page so white cards stand out.
    bg: '#eceef3',
    surface: '#ffffff',
    'surface-2': '#eef1f8',
    'surface-hover': 'rgba(10, 11, 20, 0.04)',
    text: '#14161f',
    'text-muted': '#565c6e',
    // Spec says #868ca0; darkened a hair so it clears 3:1 on --surface-2.
    'text-faint': '#7f859a',
    border: 'rgba(10, 11, 20, 0.1)',
    'border-strong': 'rgba(10, 11, 20, 0.18)',
    'shadow-elev': '0 8px 24px rgba(20, 22, 31, 0.1)',
    'glow-strength': '0.08',
    'grad-text': 'linear-gradient(105deg, #3d63e0, #7c3aed 50%, #0e9f8e)',
    'accent-strong': '#0f766e',
    'focus-ring': 'rgba(15, 118, 110, 0.2)',
    'header-bg': 'rgba(236, 238, 243, 0.85)',
    'hero-scrim': 'rgba(236, 238, 243, 0.78)',
    danger: '#c92a2a',
    'danger-bg': 'rgba(201, 42, 42, 0.08)',
    'danger-line': 'rgba(201, 42, 42, 0.3)',
    warning: '#8a5300',
    'warning-bg': 'rgba(245, 165, 36, 0.14)',
    'warning-line': 'rgba(176, 108, 0, 0.35)',
    ok: '#166534',
    'ok-bg': 'rgba(21, 128, 61, 0.08)',
    'ok-line': 'rgba(21, 128, 61, 0.3)',
    'tint-violet-text': '#6d28d9',
    'tint-blue-text': '#1d4ed8',
    'tint-teal-text': '#0f766e',
  },
};

/**
 * Three.js hero parameters per theme (documents/TASK-hero-3d-fix.md,
 * USER-APP-theming.md §5). The hero is a solid faceted gem, a thin
 * wireframe over it and a point cloud around it, lit by three brand-colour
 * point lights so a blue→violet→teal gradient rolls across the facets.
 *
 * Dark uses the task's exact values. Light lightens the gem (a dark gem on
 * a white page reads as a hole) and softens the cloud and wire, per the
 * theming spec's "much subtler in light mode" rule.
 *
 * Light intensities are the task's reference values (written for three's
 * legacy lighting). Scene.tsx converts them for three ≥ r155's physically
 * based lights — don't pre-scale them here.
 */
export interface HeroSceneTheme {
  solidColor: number;
  solidMetalness: number;
  solidRoughness: number;
  wireColor: number;
  wireOpacity: number;
  pointColor: number;
  pointOpacity: number;
  ambientColor: number;
  ambientIntensity: number;
  /** Blue, violet and teal key lights, in that order. */
  lightIntensities: [number, number, number];
}

export const heroSceneTheme: Record<Theme, HeroSceneTheme> = {
  dark: {
    solidColor: 0x151827,
    solidMetalness: 0.55,
    solidRoughness: 0.28,
    wireColor: 0x8b5cf6,
    wireOpacity: 0.35,
    pointColor: 0x4d7cff,
    pointOpacity: 0.7,
    ambientColor: 0x404050,
    ambientIntensity: 0.6,
    lightIntensities: [1.2, 1.3, 1.0],
  },
  light: {
    solidColor: 0xc9cfe6,
    solidMetalness: 0.35,
    solidRoughness: 0.35,
    wireColor: 0x7c3aed,
    wireOpacity: 0.3,
    pointColor: 0x4d7cff,
    pointOpacity: 0.35,
    ambientColor: 0xffffff,
    ambientIntensity: 0.7,
    lightIntensities: [1.0, 1.1, 0.9],
  },
};

/** <model-viewer> exposure per theme (§5) — a touch brighter on light pages. */
export const modelViewerExposure: Record<Theme, string> = {
  dark: '1.0',
  light: '1.1',
};

function declarations(tokens: Readonly<Record<string, string>>, indent: string): string {
  return Object.entries(tokens)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join('\n');
}

function block(selector: string, body: string, indent = ''): string {
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

export interface BuildThemeCssOptions {
  /**
   * `true` (default): the §3 pattern — `[data-theme]` on <html> overrides the
   * system preference. `false`: follow `prefers-color-scheme` only (the diner
   * viewer, where there is no toggle).
   */
  allowOverride?: boolean;
}

/** Renders both themes as CSS custom properties. Dark is the base. */
export function buildThemeCss({ allowOverride = true }: BuildThemeCssOptions = {}): string {
  const dark = `${declarations(brandTokens, '  ')}\n${declarations(themeTokens.dark, '  ')}\n  color-scheme: dark;`;
  const light = `${declarations(themeTokens.light, '  ')}\n  color-scheme: light;`;
  const lightNested = `${declarations(themeTokens.light, '    ')}\n    color-scheme: light;`;

  if (!allowOverride) {
    return [
      block(':root', dark),
      `@media (prefers-color-scheme: light) {\n${block(':root', lightNested, '  ')}\n}`,
    ].join('\n\n');
  }

  return [
    block(':root', dark),
    block(':root[data-theme="light"]', light),
    `@media (prefers-color-scheme: light) {\n${block(':root:not([data-theme])', lightNested, '  ')}\n}`,
  ].join('\n\n');
}

/**
 * Source of the blocking <head> script that applies a stored explicit
 * choice before first paint (§3, no FOUC). Shipped as a same-origin file,
 * not inlined, so the page never needs `'unsafe-inline'` in its CSP. Only
 * whitelisted values are applied; anything else falls through to the
 * system default. Storage access is wrapped because it throws in some
 * privacy modes.
 */
export function buildThemeInitScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  return `(function () {
  try {
    var stored = window.localStorage.getItem(${key});
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    /* storage unavailable: fall back to prefers-color-scheme */
  }
})();
`;
}
