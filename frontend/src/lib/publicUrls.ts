import { API_BASE_URL } from '../api/client';

/**
 * The public, unauthenticated diner-facing AR page for a menu item
 * (backend: ArViewerController, `GET /api/m/:slug` — see spec §3 "Diner AR
 * Viewer (public)"). This is what a QR code should point at and what a
 * "view in AR" button should open.
 */
export function itemArViewerUrl(publicSlug: string): string {
  return `${API_BASE_URL}/m/${encodeURIComponent(publicSlug)}`;
}
