/**
 * The only object keys the platform ever creates: `<prefix>/<48 hex>.<ext>`
 * (StorageService.generateKey). Serving is restricted to exactly this shape
 * so the local-disk uploads route can never be used to read anything else
 * under the storage root — dotfiles, source code, config.
 */
export const STORAGE_KEY_PREFIXES = [
  'menu-item-photo',
  'restaurant-logo',
  'model-glb',
  'model-glb-manual',
  'model-usdz',
  'model-preview',
] as const;

export type StorageKeyPrefix = (typeof STORAGE_KEY_PREFIXES)[number];

const STORAGE_FILENAME = /^[0-9a-f]{48}\.(?:jpg|jpeg|png|webp|glb|usdz)$/;

export function isServableStorageKey(
  prefix: string,
  filename: string,
): boolean {
  return (
    (STORAGE_KEY_PREFIXES as readonly string[]).includes(prefix) &&
    STORAGE_FILENAME.test(filename)
  );
}
