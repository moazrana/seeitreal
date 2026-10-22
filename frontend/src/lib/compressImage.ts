import { DISH_PHOTO_JPEG_QUALITY, DISH_PHOTO_MAX_EDGE_PX } from '@ar-menu/shared';

const DECODABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function toJpegName(name: string): string {
  const base = name.replace(/\.[^.]*$/, '');
  return `${base || 'photo'}.jpg`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Pre-compresses a dish photo in the browser before upload
 * (documents/TASK-image-optimization.md §1): longest edge down to
 * DISH_PHOTO_MAX_EDGE_PX, EXIF orientation applied, re-encoded as JPEG, so
 * a 4–12 MB phone photo travels as a few hundred KB — the difference that
 * matters on slow mobile networks.
 *
 * Purely an upload-speed optimization: the server re-validates and
 * re-normalizes every file regardless (spec §7.2, §7.5). So this never
 * blocks an upload — if the browser can't decode the file, or compressing
 * wouldn't make it smaller, the original is returned unchanged.
 */
export async function compressDishPhoto(file: File): Promise<File> {
  if (!DECODABLE_TYPES.has(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, DISH_PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    if (!(width > 0 && height > 0)) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no alpha — flatten transparency onto white, as the server does.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToJpeg(canvas, DISH_PHOTO_JPEG_QUALITY / 100);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], toJpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** Sequential on purpose: decoding several 12 MP photos at once can
 * exhaust memory on a phone. */
export async function compressDishPhotos(files: File[]): Promise<File[]> {
  const compressed: File[] = [];
  for (const file of files) {
    compressed.push(await compressDishPhoto(file));
  }
  return compressed;
}
