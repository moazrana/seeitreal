import { escapeHtml } from '../common/utils/html-escape.util';

interface ViewerItem {
  name: string;
  description: string | null;
  price: { toFixed(digits: number): string };
  photoUrl: string | null;
  previewImageUrl: string | null;
  modelGlbUrl: string | null;
  modelUsdzUrl: string | null;
  arStatus: string;
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
  .price { font-size: 1.1rem; font-weight: 600; color: #2563eb; }
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
</style>
</head>
`;

export function renderItemPage(
  item: ViewerItem,
  restaurantName: string,
): string {
  const name = escapeHtml(item.name);
  const restaurant = escapeHtml(restaurantName);
  const description = item.description
    ? `<p class="description">${escapeHtml(item.description)}</p>`
    : '';
  const price = `$${item.price.toFixed(2)}`;

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
  shadow-intensity="1"
>
  <button slot="ar-button" class="ar-button">View in your space</button>
</model-viewer>`
    : item.photoUrl
      ? `<img class="photo" src="${escapeHtml(item.photoUrl)}" alt="${name}">
<p class="notice">The AR view for this dish is still being prepared — check back soon.</p>`
      : `<div class="placeholder">No photo yet</div>
<p class="notice">The AR view for this dish is still being prepared — check back soon.</p>`;

  return `${PAGE_HEAD(`${name} — ${restaurant}`)}<body>
<div class="card">
  <div class="restaurant">${restaurant}</div>
  <h1>${name}</h1>
  <div class="price">${price}</div>
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
