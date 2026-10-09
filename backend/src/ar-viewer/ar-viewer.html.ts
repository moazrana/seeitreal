import {
  buildThemeCss,
  MM_PER_INCH,
  modelViewerExposure,
} from '@ar-menu/shared';
import type { Theme } from '@ar-menu/shared';
import { escapeHtml } from '../common/utils/html-escape.util';

interface ViewerItem {
  name: string;
  description: string | null;
  photoUrl: string | null;
  previewImageUrl: string | null;
  modelGlbUrl: string | null;
  modelUsdzUrl: string | null;
  arStatus: string;
  // Real-world dish dimensions in millimetres (documents/TASK-real-world-ar-sizing.md
  // §4) — shown as a caption so the diner sees the true size, reinforcing
  // that the model in front of them is life-size, not an arbitrary render.
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
}

/** Public path of the tiny same-origin script that swaps <model-viewer>
 * exposure/environment to match the diner's colour scheme (served by
 * ArViewerController; see ar-viewer.theme-script.ts). */
export const AR_VIEWER_THEME_SCRIPT_PATH = '/api/static/ar-viewer-theme.js';

/** Per-theme environment images for <model-viewer> (documents/
 * USER-APP-theming.md §5). */
export type ViewerEnvironmentImages = Record<Theme, string>;

const DEFAULT_ENVIRONMENT_IMAGES: ViewerEnvironmentImages = {
  dark: 'neutral',
  light: 'neutral',
};

// Diners never see a toggle, so the page follows their phone's own
// prefers-color-scheme (documents/USER-APP-theming.md §5) using the same
// shared tokens as the dashboard. Generated once at module load from
// constant tokens — no request data ever reaches this <style> block.
const THEME_CSS = buildThemeCss({ allowOverride: false });

const PAGE_HEAD = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>${title}</title>
<meta name="robots" content="noindex">
<style>
${THEME_CSS}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .card {
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
  }
  .restaurant { color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0; font-size: 1.5rem; }
  .description { color: var(--text-muted); line-height: 1.5; }
  model-viewer {
    width: 100%;
    height: 60vh;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .photo { width: 100%; border-radius: 12px; aspect-ratio: 4 / 3; object-fit: cover; background: var(--surface-2); }
  .notice {
    background: var(--tint-blue-bg);
    color: var(--tint-blue-text);
    border: 1px solid var(--tint-blue-line);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }
  .placeholder {
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .dimensions {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 0.35rem;
    background: var(--tint-teal-bg);
    color: var(--tint-teal-text);
    border: 1px solid var(--tint-teal-line);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
</head>
`;

/** Real-world size caption — only shown once dimensions are set (spec:
 * TASK-real-world-ar-sizing.md §4, "only show it when the item has
 * dimensions"). Stored in mm; shown in inches (the unit owners enter)
 * with centimetres alongside. Values are numbers from the DB, never
 * free text, so nothing here needs escaping. */
function renderDimensionsCaption(item: ViewerItem): string {
  if (!item.widthMm && !item.heightMm && !item.lengthMm) return '';
  const dims = [item.widthMm, item.heightMm, item.lengthMm];
  const inches = dims
    .map((mm) => (mm === null ? '?' : (mm / MM_PER_INCH).toFixed(1)))
    .join(' × ');
  const cm = dims
    .map((mm) => (mm === null ? '?' : String(Math.round(mm / 10))))
    .join(' × ');
  return `<div class="dimensions">📏 True size: ${inches} in (${cm} cm) W×H×L</div>`;
}

export function renderItemPage(
  item: ViewerItem,
  restaurantName: string,
  // Image-based lighting/rendering config (documents/3d-model-enhancement.md
  // §3), per theme (documents/USER-APP-theming.md §5) — "neutral"
  // (model-viewer's built-in studio IBL) is the safe default; real HDRs can
  // be configured via AR_ENVIRONMENT_IMAGE_URL / AR_ENVIRONMENT_IMAGE_URL_LIGHT
  // without a code change.
  environmentImages: ViewerEnvironmentImages = DEFAULT_ENVIRONMENT_IMAGES,
  // Admin QA preview (PreviewLinkService): shows a not-yet-live model, with
  // a banner, as soon as its GLB exists. The USDZ may be missing at QA
  // (conversion failed), so iOS AR is offered only when it exists.
  options: { preview?: boolean } = {},
): string {
  const name = escapeHtml(item.name);
  const restaurant = escapeHtml(restaurantName);
  const description = item.description
    ? `<p class="description">${escapeHtml(item.description)}</p>`
    : '';

  const isArReady = options.preview
    ? !!item.modelGlbUrl
    : item.arStatus === 'live' && !!item.modelGlbUrl && !!item.modelUsdzUrl;
  const iosSrc = item.modelUsdzUrl
    ? `ios-src="${escapeHtml(item.modelUsdzUrl)}"`
    : '';
  const previewBanner = options.preview
    ? `<p class="notice">Admin preview — this model is awaiting approval and isn't public yet.</p>`
    : '';

  const media = isArReady
    ? `<script type="module" src="/api/vendor/model-viewer.min.js"></script>
<model-viewer
  src="${escapeHtml(item.modelGlbUrl!)}"
  ${iosSrc}
  ar
  ar-modes="webxr scene-viewer quick-look"
  camera-controls
  auto-rotate
  ${item.previewImageUrl ? `poster="${escapeHtml(item.previewImageUrl)}"` : ''}
  environment-image="${escapeHtml(environmentImages.dark)}"
  exposure="${modelViewerExposure.dark}"
  data-theme-aware
  data-environment-image-dark="${escapeHtml(environmentImages.dark)}"
  data-environment-image-light="${escapeHtml(environmentImages.light)}"
  data-exposure-dark="${modelViewerExposure.dark}"
  data-exposure-light="${modelViewerExposure.light}"
  tone-mapping="neutral"
  shadow-intensity="1"
  shadow-softness="1"
>
  <button slot="ar-button" class="ar-button">View in your space</button>
</model-viewer>
<script src="${AR_VIEWER_THEME_SCRIPT_PATH}"></script>
${renderDimensionsCaption(item)}`
    : item.photoUrl
      ? `<img class="photo" src="${escapeHtml(item.photoUrl)}" alt="${name}">
<p class="notice">The AR view for this dish is still being prepared — check back soon.</p>`
      : `<div class="placeholder">No photo yet</div>
<p class="notice">The AR view for this dish is still being prepared — check back soon.</p>`;

  return `${PAGE_HEAD(`${name} — ${restaurant}`)}<body>
<div class="card">
  <div class="restaurant">${restaurant}</div>
  <h1>${name}</h1>
  ${previewBanner}
  ${media}
  ${description}
</div>
</body>
</html>
`;
}

export function renderNotFoundPage(): string {
  return `${PAGE_HEAD('Dish not found')}<body>
<div class="card">
  <h1>Dish not found</h1>
  <p class="description">This link doesn't match a menu item — it may have been removed.</p>
</div>
</body>
</html>
`;
}

/**
 * Rendered when a restaurant's subscription is `expired` (documents/
 * USER-APP-subscription-and-ui.md §4.1, §5: "clean, not a broken/500
 * error... honest, not alarmist"). Deliberately never mentions billing,
 * payment status, or amounts to the diner — that's between the platform
 * and the restaurant owner, not this page's audience.
 */
export function renderSubscriptionExpiredPage(restaurantName: string): string {
  const restaurant = escapeHtml(restaurantName);
  return `${PAGE_HEAD(`${restaurant} — menu unavailable`)}<body>
<div class="card">
  <div class="restaurant">${restaurant}</div>
  <h1>This menu is temporarily unavailable</h1>
  <p class="description">Please check back soon, or ask the restaurant for an updated menu.</p>
</div>
</body>
</html>
`;
}
