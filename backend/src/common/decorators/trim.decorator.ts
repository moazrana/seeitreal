import { Transform } from 'class-transformer';

/**
 * Trims surrounding whitespace before validation, so " BBQ " can't slip
 * past a uniqueness check as a different name from "BBQ", and a
 * whitespace-only value fails @MinLength(1) instead of being stored.
 * Non-strings pass through untouched for @IsString() to reject.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
