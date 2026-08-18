// Full §7.5 checklist lives in ImageUploadService — these are the concrete
// limits it enforces. Kept as code constants (not env vars) since they're
// a security policy, not per-environment config.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_IMAGE_DIMENSION_PX = 4096;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
// sharp's decoded format names — the authoritative check (magic bytes /
// real decode), independent of what the client claimed.
export const ALLOWED_DECODED_FORMATS = ['jpeg', 'png', 'webp'] as const;
