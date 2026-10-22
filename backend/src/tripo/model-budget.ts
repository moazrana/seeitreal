/**
 * Triangle budget for a dish model. Tripo returns ~1.4M triangles (~40MB
 * of geometry) — far beyond what a phone needs for a plate on a table, and
 * the main reason models loaded slowly, especially on mid-range Android.
 * ~150k keeps food surfaces smooth at AR viewing distance.
 */
export const TARGET_TRIANGLES = 150_000;
