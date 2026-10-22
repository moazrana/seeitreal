# Light & Dark Mode — User App (canonical theme system)

**For:** Claude Code to implement.
**Scope:** This file defines the **canonical theme-token system for the whole product**. The Root App reuses it (see `ROOT-APP-theming.md`). Extends the **Design Spec** (which is currently dark-only) by adding a light theme and a toggle.
**Source of truth:** Put these tokens in the **monorepo shared package** so both apps import one definition — do not fork the palette per app.

---

## 1. Objective

Support **light and dark mode** in the User App (dashboard, marketing site, and diner-facing AR viewer). Default to the **system preference**, let the user **toggle**, and **remember** their choice — with no flash of the wrong theme on load.

---

## 2. Token model (semantic, not raw colors)

Components must reference **role tokens**, never raw hex, so a theme swap is one place. Define both themes as CSS custom properties.

| Role token | Dark | Light |
|------------|------|-------|
| `--bg` | `#0A0B14` | `#F7F8FC` |
| `--surface` | `#12141F` | `#FFFFFF` |
| `--surface-2` | `#171A27` | `#EEF1F8` |
| `--text` | `#F4F5FB` | `#14161F` |
| `--text-muted` | `#9BA0B4` | `#565C6E` |
| `--text-faint` | `#6A6F84` | `#868CA0` |
| `--border` | `rgba(255,255,255,.08)` | `rgba(10,11,20,.10)` |
| `--border-strong` | `rgba(255,255,255,.16)` | `rgba(10,11,20,.18)` |
| `--shadow-elev` | `0 8px 30px rgba(0,0,0,.35)` | `0 8px 24px rgba(20,22,31,.10)` |
| `--glow-strength` | `.22` | `.08` |

**Brand stays constant but adapts by use:**
- Gradient (`--grad`) = `linear-gradient(105deg,#4D7CFF,#8B5CF6 50%,#2DD4BF)` — same in both; fine as a **button/fill background with white text** in both modes.
- For **gradient text on a light background**, use deeper stops (`--grad-text: linear-gradient(105deg,#3D63E0,#7C3AED 50%,#0E9F8E)`) so it meets contrast; on dark use the bright gradient.
- **Glows/tints** must be much subtler in light mode (`--glow-strength` above) — big colored blurs look muddy on white; lean on `--shadow-elev` for elevation in light mode instead.

## 3. Applying themes (pattern)

Set the theme on `<html>` via `data-theme`, default from system, override by user choice:
```css
:root { /* dark values as the base */ }
:root[data-theme="light"] { /* light values */ }
@media (prefers-color-scheme: light){
  :root:not([data-theme]) { /* light values — system default when user hasn't chosen */ }
}
```
- **Persist** the user's explicit choice in `localStorage` (this is the real React app — localStorage is fine here).
- **Prevent FOUC:** an inline script in `<head>` sets `data-theme` from `localStorage` (or system) **before first paint**, so the page never flashes the wrong theme.
- Give `<body>` an explicit `background:var(--bg)` and `color:var(--text)`.

## 4. Toggle

- A sun/moon toggle in the nav (and in dashboard settings). Three-state is nice: **System / Light / Dark** (System follows `prefers-color-scheme`); minimum is a Light/Dark switch.
- Toggling updates `data-theme`, saves to `localStorage`, and transitions smoothly (a short `color`/`background` transition, disabled under `prefers-reduced-motion`).

## 5. Theme-aware 3D / AR (User App specific)

The 3D is the hard part — it must not look broken in light mode:
- **Three.js hero:** the canvas is already `alpha:true`, so it sits on `--bg`. Read the current theme in the scene and adjust: in **light mode** lighten the object material and reduce the point-cloud opacity and glow so the dark gem doesn't look like a hole in a white page; in **dark mode** keep the current look. Re-apply on toggle.
- **`<model-viewer>` (food showcase + diner viewer):** set `exposure` and `environment-image` per theme (a brighter, neutral environment in light mode), and drive the stage background from `--surface`/`--bg`.
- **Diner AR viewer & QR landing page:** must respect the diner's own system preference by default (they never see a toggle) — a diner on a light phone gets a light viewer.
- **The "menu temporarily unavailable" (expired) page** and empty states: themed in both modes, never a raw white/black default.

## 6. Accessibility

- Text/background contrast meets **WCAG AA in both themes** (check `--text-muted` on `--surface` in light mode especially).
- Respect `prefers-color-scheme` as the default; respect `prefers-reduced-motion` for the theme transition.
- The toggle is keyboard-reachable with a visible focus state and an accessible label.

## 7. Acceptance criteria

- User App renders correctly in **both light and dark**, defaulting to system preference, with a working, persisted toggle and **no flash** on load.
- All components read semantic tokens (no hardcoded hex in components); tokens live in the shared package.
- The Three.js hero and every `<model-viewer>` look intentional in both themes (no dark-on-white holes; adjusted exposure/glow).
- The diner AR viewer and expired/empty pages are themed in both modes.
- Contrast passes AA in both themes; toggle is accessible.
