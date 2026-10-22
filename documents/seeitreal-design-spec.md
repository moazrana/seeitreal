# SeeItReal — Design System & Landing Page Spec

**For:** Claude Code / frontend implementation.
**Reference implementation:** `seeitreal-landing.html` (the approved sample — treat it as the visual source of truth; this doc is its written spec).
**Goal:** Rebuild this design as the real marketing site in the project's stack (React + Vite + TypeScript), keeping the tokens and structure below.

---

## 1. Design direction

Dark, premium, spatial. The page should feel like looking *through* an AR viewfinder into a real, dimensional world. All visual boldness is spent in **one place — the live 3D hero**; everything else stays quiet, dark, and spacious with hairline structure. The brand gradient is used as **light** (glows, the wordmark, the primary button, thin accents) — never as large decorative color washes.

**Do not** drift toward generic SaaS defaults: no identical rounded cards with the same grey shadow, no all-caps eyebrow labels, no `→` appended to buttons, no numbered `01/02/03` markers except where content is a true sequence (the "How it works" steps are, so numbering is used only there).

---

## 2. Design tokens

### Color
| Token | Hex / value | Use |
|-------|-------------|-----|
| `--bg` | `#0A0B14` | page background (deep midnight-navy, not flat black) |
| `--bg-elev` | `#12141F` | cards, elevated surfaces |
| `--bg-elev-2` | `#171A27` | higher elevation / CTA panel |
| `--ink` | `#F4F5FB` | primary text |
| `--muted` | `#9BA0B4` | secondary text |
| `--faint` | `#6A6F84` | tertiary / footer |
| `--line` | `rgba(255,255,255,.08)` | hairline borders |
| `--line-strong` | `rgba(255,255,255,.16)` | stronger borders |
| `--blue` | `#4D7CFF` | brand |
| `--violet` | `#8B5CF6` | brand |
| `--teal` | `#2DD4BF` | brand |
| `--grad` | `linear-gradient(105deg,#4D7CFF,#8B5CF6 50%,#2DD4BF)` | wordmark, primary button, accents, 3D lighting |

### Typography
- **Display / headings:** Space Grotesk (weights 400–700). Geometric, techy-but-warm.
- **Body / UI:** Inter (weights 400–600).
- Two clearly distinct families — do not substitute a single default family.

Type scale:
| Element | Size | Weight | Tracking |
|---------|------|--------|----------|
| H1 (hero) | `clamp(38px,7vw,74px)` | 600 | `-.03em` |
| H2 (section) | `clamp(28px,4.5vw,44px)` | 600 | `-.02em` |
| H3 (card/step) | 19–20px | 500 | `-.01em` |
| Body | 15–17px | 400 | normal |
| Small / label | 13–14.5px | 400–500 | normal |

Line length: body capped at ~42ch in cards. Sentence case everywhere (no all-caps).

### Shape & layout
- Radii: pills/buttons `999px`; cards `18px`; large panels `24–28px`; small chips of the logo glyph `6–12px`.
- Content max width: `1140px`. Section vertical padding: `100px` (responsive).
- Alignment: hero is centered; content sections are left-aligned headings with grid content below.

---

## 3. The 3D hero (the signature element)

A live WebGL scene (Three.js) behind the headline, framed by an AR viewfinder.

- **Object:** a faceted icosahedron (`IcosahedronGeometry(1.7, 0)`, `flatShading`) — the "real" object — with a violet **wireframe overlay** (`EdgesGeometry`) reading as 3D data.
- **Scan point cloud:** ~1,400 points distributed in a spherical shell around the object (blue, small, semi-transparent) — evokes AR scanning.
- **Lighting:** low ambient + three brand-colored point lights (blue, violet, teal) positioned around the object so the gradient rolls across the facets as it rotates.
- **Interaction:** mouse/pointer **parallax** — camera eases toward the pointer (lerp ~.05). Continuous slow auto-rotation of the object; counter-rotation of the point cloud; gentle vertical float.
- **AR viewfinder frame:** four corner brackets (CSS) around the scene + a **scan-line** that sweeps top→bottom on a loop.
- **Fallbacks:** `alpha:true` canvas over the dark bg; `pixelRatio` capped at 2; scene resizes to canvas. On `prefers-reduced-motion`, stop auto-rotation, float, and the scan-line (keep a static, lit object).

When ported to React: create the scene in a `useEffect` with a `<canvas ref>`, and **dispose geometries/materials/renderer on unmount** to avoid leaks. Keep the render loop in the effect; cancel `requestAnimationFrame` on cleanup.

---

## 4. Page structure (sections in order)

1. **Nav (fixed):** blurred, transparent at top; on scroll (>20px) gains a solid bg + bottom hairline. Left: `SeeItReal` wordmark (gradient on "ItReal" + a small gradient glyph). Right: How it works · Features · Pricing · **Start free** (solid pill). Links collapse on mobile.
2. **Hero:** viewfinder + 3D scene; sentence-case pill ("Augmented reality for menus — and more"); H1 "See it on the table before you order."; subhead; two CTAs (primary gradient "Start free", ghost "See a live demo"); scroll hint.
3. **How it works** (`#how`) — a **true 4-step sequence, numbered**: Snap a few photos (up to five angles) → We build the 3D (real-size, QA'd) → Print the code (per-dish QR) → Diners see it real (scan → AR). Top hairline per step; first step's rule uses the gradient.
4. **Features** (`#features`) — **asymmetric bento grid**, varied hierarchy (a tall feature-hero with a mini AR frame, plus wide and standard cards). Content: real size not guesswork; works on every phone / no app; one dashboard full control; the "see it real in 3D" statement card. Soft brand glow blobs, not uniform shadows.
5. **Beyond menus** — a bordered panel: "Same technology. Any product." with chips — **Restaurants (live)**, Clothing/Furniture/Retail (soon, dimmed).
6. **CTA band** (`#start`) — centered panel with top gradient glow: "Ready to let customers see it real?" + Start free.
7. **Footer** — wordmark + tagline "see it in your space before you decide."

---

## 5. Motion rules

- One orchestrated hero moment (3D + scan-line) is the star; the continuous 3D rotation is justified because it *is* the product demo.
- Reveal-on-scroll: a single subtle fade-and-rise per section (via IntersectionObserver), used sparingly — not on every child.
- Hover transitions only on interactive elements (buttons, nav CTA).
- **Respect `prefers-reduced-motion`**: disable scan-line, float, auto-rotation, and reveal animations; keep everything legible and static.

---

## 6. Quality floor (required)

- Responsive down to mobile (grids collapse: steps 4→2→1; bento 3→2→1 columns).
- Visible keyboard focus states on all interactive elements.
- Sufficient contrast for text on the dark bg (muted text stays ≥ AA on `--bg`).
- No `localStorage` / `sessionStorage` (not supported in the artifact sandbox; keep state in memory).
- Fonts loaded from Google Fonts with a system fallback stack, so the layout survives if fonts fail.

---

## 7. Implementation notes (porting to React/Vite)

- Represent tokens as CSS custom properties (as above) or a Tailwind theme extension — keep the exact hex values and the gradient.
- Componentize: `Nav`, `Hero` (+ `Scene` canvas component), `HowItWorks`, `Features`, `BeyondMenus`, `CtaBand`, `Footer`.
- Three.js: install `three`; scene lives in the `Scene` component's effect with full disposal on unmount.
- Keep copy exactly as written in the sample unless product wording changes — it was written to be plain and specific, not decorative.
- This is the marketing site; it can be a separate route/app from the authenticated dashboard, but should share the design tokens.
