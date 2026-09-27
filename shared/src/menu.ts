/**
 * Real-world dish dimension bounds in millimetres
 * (documents/TASK-real-world-ar-sizing.md §2). The backend DTOs enforce
 * these; the dashboard mirrors them for UX only (the server stays the
 * source of truth, spec §7.2).
 */
export const MIN_DIMENSION_MM = 10;
export const MAX_DIMENSION_MM = 5000;

/**
 * Dish-photo normalization (documents/TASK-image-optimization.md). Photos
 * are resized so their longest edge is at most this many pixels and
 * re-encoded as JPEG at this quality (percent) — small and fast to upload
 * and hand to Tripo, still sharp enough for reconstruction (the task sets
 * a 1024 px floor and ≥80% quality as the "don't over-compress" guardrail).
 * The dashboard pre-compresses to the same target; the server re-does it
 * authoritatively.
 */
export const DISH_PHOTO_MAX_EDGE_PX = 2048;
export const DISH_PHOTO_JPEG_QUALITY = 82;
