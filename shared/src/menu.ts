/**
 * Real-world dish dimension bounds in millimetres
 * (documents/TASK-real-world-ar-sizing.md §2). The backend DTOs enforce
 * these; the dashboard mirrors them for UX only (the server stays the
 * source of truth, spec §7.2).
 */
export const MIN_DIMENSION_MM = 10;
export const MAX_DIMENSION_MM = 5000;
