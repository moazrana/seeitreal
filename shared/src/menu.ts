/**
 * Real-world dish dimension bounds in millimetres
 * (documents/TASK-real-world-ar-sizing.md §2). Owners enter inches; storage
 * stays whole millimetres. The backend DTOs enforce these; the dashboard
 * mirrors them for UX only (the server stays the source of truth, §7.2).
 */
export const MM_PER_INCH = 25.4;
export const MIN_DIMENSION_MM = 10;
/** 20 inches — nothing served on a menu is bigger. */
export const MAX_DIMENSION_MM = 508;

/**
 * Dimensions are optional. A model generated without them is scaled so its
 * footprint is 10 inches — a typical dinner plate — instead of being left
 * at Tripo's arbitrary scale (which can be metres). Entering real
 * dimensions gives true-to-life size.
 */
export const DEFAULT_FOOTPRINT_MM = 254;

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

/**
 * An owner may run several restaurants (mango points 2). The cap is an
 * abuse guard (slug squatting, runaway automated creation), far above any
 * real chain on the platform.
 */
export const MAX_RESTAURANTS_PER_OWNER = 20;
