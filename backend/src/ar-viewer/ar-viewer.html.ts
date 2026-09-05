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

const PAGE_HEAD = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f7f7f8;
    color: #1c1c1f;
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
  .restaurant { color: #6b6b74; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { margin: 0; font-size: 1.5rem; }
  .description { color: #444; line-height: 1.5; }
  model-viewer { width: 100%; height: 60vh; background: #eee; border-radius: 12px; }
  .photo { width: 100%; border-radius: 12px; aspect-ratio: 4 / 3; object-fit: cover; background: #eee; }
  .notice {
    background: #eff6ff;
    color: #1e40af;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }
  .placeholder {
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    background: #eee;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 0.9rem;
  }
  .dimensions {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 0.35rem;
    background: #ecfdf5;
    color: #065f46;
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
 * dimensions"). Stored in mm, shown in cm as the more natural unit. */
function renderDimensionsCaption(item: ViewerItem): string {
  if (!item.widthMm && !item.heightMm && !item.lengthMm) return '';
  const toCm = (mm: number | null) =>
    mm === null ? '?' : (mm / 10).toFixed(1);
  return `<div class="dimensions">📏 True size: ${toCm(item.widthMm)} × ${toCm(item.heightMm)} × ${toCm(item.lengthMm)} cm (W×H×L)</div>`;
}

export function renderItemPage(
  item: ViewerItem,
  restaurantName: string,
  // Image-based lighting/rendering config (documents/3d-model-enhancement.md
  // §3) — "neutral" (model-viewer's built-in studio IBL) is the safe
  // default; a real warm kitchen/restaurant HDR can be configured via
  // AR_ENVIRONMENT_IMAGE_URL without a code change.
  environmentImageUrl: string = 'neutral',
): string {
  const name = escapeHtml(item.name);
  const restaurant = escapeHtml(restaurantName);
  const description = item.description
    ? `<p class="description">${escapeHtml(item.description)}</p>`
    : '';

  const isArReady =
    item.arStatus === 'live' && item.modelGlbUrl && item.modelUsdzUrl;

  const media = isArReady
    ? `<script type="module" src="/api/vendor/model-viewer.min.js"></script>
<model-viewer
  src="${escapeHtml(item.modelGlbUrl!)}"
  ios-src="${escapeHtml(item.modelUsdzUrl!)}"
  ar
  ar-modes="webxr scene-viewer quick-look"
  camera-controls
  auto-rotate
  ${item.previewImageUrl ? `poster="${escapeHtml(item.previewImageUrl)}"` : ''}
  environment-image="${escapeHtml(environmentImageUrl)}"
  exposure="1.0"
  tone-mapping="neutral"
  shadow-intensity="1"
  shadow-softness="1"
>
  <button slot="ar-button" class="ar-button">View in your space</button>
</model-viewer>
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
