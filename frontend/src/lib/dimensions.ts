import { MAX_DIMENSION_MM, MIN_DIMENSION_MM } from '@ar-menu/shared';

// Owners enter sizes in centimetres (the natural unit for a dish — typing
// "26" into a millimetre field produced a 2.6 cm AR model); the API stores
// whole millimetres. Bounds mirror the server's DTO for UX only.
export const MIN_DIMENSION_CM = MIN_DIMENSION_MM / 10;
export const MAX_DIMENSION_CM = MAX_DIMENSION_MM / 10;

export function mmToCmInput(mm: number | null): string {
  return mm === null ? '' : String(mm / 10);
}

/** Empty input → undefined (field left unset); otherwise whole mm. */
export function cmInputToMm(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Math.round(Number(trimmed) * 10);
}

export function formatDimensions(dims: {
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
}): string | null {
  const parts = [dims.widthMm, dims.heightMm, dims.lengthMm];
  if (parts.every((v) => v === null)) return null;
  return parts.map((v) => (v === null ? '?' : (v / 10).toFixed(1))).join(' × ') + ' cm (W×H×L)';
}
