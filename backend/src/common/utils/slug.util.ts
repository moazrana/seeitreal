import { randomBytes } from 'node:crypto';

/**
 * Builds a URL-safe public slug from a name plus a short random suffix, so
 * collisions across restaurants are effectively impossible without needing
 * a DB round trip to check. Used for MenuItem/Deal `public_slug` (spec §5)
 * — these appear in public QR/AR URLs, so they must be unique and should
 * not leak sequential IDs.
 */
export function generatePublicSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}
