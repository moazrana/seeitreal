import {
  DISH_PHOTO_JPEG_QUALITY,
  DISH_PHOTO_MAX_EDGE_PX,
} from '@ar-menu/shared';

// Full §7.5 checklist lives in ImageUploadService — these are the concrete
// limits it enforces. Kept as code constants (not env vars) since they're
// a security policy, not per-environment config.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
// Max *input* size. Anything larger is rejected, not downscaled.
export const MAX_IMAGE_DIMENSION_PX = 4096;
// Hard cap on decoded pixels, passed to sharp so a small, highly
// compressible file (a decompression bomb) is refused during decode
// instead of being expanded into memory. Matches the dimension limit.
export const MAX_INPUT_PIXELS = MAX_IMAGE_DIMENSION_PX * MAX_IMAGE_DIMENSION_PX;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
// sharp's decoded format names — the authoritative check (magic bytes /
// real decode), independent of what the client claimed.
export const ALLOWED_DECODED_FORMATS = ['jpeg', 'png', 'webp'] as const;

/** What an upload is for — also its storage key prefix. */
export type ImageUploadPurpose = 'menu-item-photo' | 'restaurant-logo';

export interface ImageOutputProfile {
  /** Longest edge after resizing (`fit: inside`, never enlarged). */
  maxEdgePx: number;
  format: 'jpeg' | 'webp';
  /** Encoder quality, 1-100. */
  quality: number;
}

/**
 * Normalized output per purpose (documents/TASK-image-optimization.md).
 * Dish photos feed Tripo: ~2048px JPEG — a fraction of a phone photo's
 * size with no meaningful reconstruction loss, and JPEG is the format
 * Tripo's URL input is documented to accept. Logos keep WebP so
 * transparency survives, and don't need more than 1024px.
 */
export const IMAGE_OUTPUT_PROFILES: Record<
  ImageUploadPurpose,
  ImageOutputProfile
> = {
  'menu-item-photo': {
    maxEdgePx: DISH_PHOTO_MAX_EDGE_PX,
    format: 'jpeg',
    quality: DISH_PHOTO_JPEG_QUALITY,
  },
  'restaurant-logo': { maxEdgePx: 1024, format: 'webp', quality: 85 },
};

/** Don't-over-compress guardrail (task §4): reconstruction needs clear
 * edges and texture, so dish photos never go below this edge/quality. */
export const MIN_DISH_PHOTO_EDGE_PX = 1024;
export const MIN_DISH_PHOTO_QUALITY = 80;
