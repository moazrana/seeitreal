import { MAX_DIMENSION_MM, MIN_DIMENSION_MM, MM_PER_INCH } from '@ar-menu/shared';

// Owners enter dish sizes in inches; the API stores whole millimetres.
// Bounds mirror the server's DTO for UX only (0.4"–20").
export const MIN_DIMENSION_IN = Math.ceil((MIN_DIMENSION_MM / MM_PER_INCH) * 10) / 10;
export const MAX_DIMENSION_IN = MAX_DIMENSION_MM / MM_PER_INCH;

function mmToInches(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * 10) / 10;
}

export function mmToInchInput(mm: number | null): string {
  return mm === null ? '' : String(mmToInches(mm));
}

/** Empty input → undefined (field left unset); otherwise whole mm. */
export function inchInputToMm(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Math.round(Number(trimmed) * MM_PER_INCH);
}

export function formatDimensions(dims: {
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
}): string | null {
  const parts = [dims.widthMm, dims.heightMm, dims.lengthMm];
  if (parts.every((v) => v === null)) return null;
  return parts.map((v) => (v === null ? '?' : mmToInches(v).toFixed(1))).join(' × ') + ' in (W×H×L)';
}
