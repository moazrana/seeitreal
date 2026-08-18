import { extname } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_DECODED_FORMATS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_DIMENSION_PX,
  MAX_UPLOAD_BYTES,
} from './image-upload.constants';

/**
 * Shared image-upload pipeline for dish photos and restaurant logos —
 * implements the full §7.5 checklist:
 *  1. Whitelist by extension AND MIME (client-supplied — first-pass only).
 *  2. Verify real content via sharp's decode (magic bytes), independent of
 *     what the client claimed.
 *  3. Enforce max size (multer, before this runs) and max dimensions.
 *  4. Re-encode to a random server-generated key — never the client
 *     filename — which also strips EXIF/metadata (sharp only carries
 *     metadata forward if you explicitly call `.withMetadata()`, which we
 *     never do).
 *  5. Store outside the web root with no execute permission (see
 *     StorageModule / LocalDiskStorageProvider) — never executed.
 * Every rejection is logged (spec §7.7) — filename/mimetype/reason only,
 * never file content.
 */
@Injectable()
export class ImageUploadService {
  private readonly logger = new Logger(ImageUploadService.name);

  constructor(private readonly storage: StorageService) {}

  async processAndStore(
    file: Express.Multer.File,
    keyPrefix: string,
  ): Promise<{ key: string; url: string }> {
    this.assertClientClaimsAllowed(file);

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.buffer, { failOn: 'error' }).metadata();
    } catch {
      throw this.reject(file, 'file is not a decodable image');
    }

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw this.reject(file, 'decoded image is missing width/height/format');
    }
    if (
      !ALLOWED_DECODED_FORMATS.includes(
        metadata.format as (typeof ALLOWED_DECODED_FORMATS)[number],
      )
    ) {
      // The bytes decoded fine but aren't one of our allowed formats —
      // e.g. a GIF or TIFF renamed to .jpg. Reject regardless of what the
      // client claimed.
      throw this.reject(
        file,
        `decoded format "${metadata.format}" is not allowed`,
      );
    }
    if (
      metadata.width > MAX_IMAGE_DIMENSION_PX ||
      metadata.height > MAX_IMAGE_DIMENSION_PX
    ) {
      throw this.reject(
        file,
        `dimensions ${metadata.width}x${metadata.height} exceed ${MAX_IMAGE_DIMENSION_PX}px`,
      );
    }

    // Re-encoding (rather than storing the original bytes) strips EXIF/
    // metadata and normalizes the output format regardless of input.
    const output = await sharp(file.buffer)
      .resize({
        width: MAX_IMAGE_DIMENSION_PX,
        height: MAX_IMAGE_DIMENSION_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();

    const key = this.storage.generateKey(keyPrefix, 'webp');
    this.logger.debug(
      `Storing upload as ${key} (${output.length} bytes, from ${file.size} original)`,
    );
    return this.storage.putObject({
      key,
      body: output,
      contentType: 'image/webp',
    });
  }

  private assertClientClaimsAllowed(file: Express.Multer.File) {
    if (
      !ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw this.reject(
        file,
        `claimed mimetype "${file.mimetype}" is not allowed`,
      );
    }
    const ext = extname(file.originalname).toLowerCase();
    if (
      !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])
    ) {
      throw this.reject(file, `extension "${ext}" is not allowed`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      // Defense in depth — multer's own `limits.fileSize` (set on the
      // interceptor) is the primary enforcement and rejects before the
      // buffer is even fully read.
      throw this.reject(
        file,
        `size ${file.size} exceeds ${MAX_UPLOAD_BYTES} bytes`,
      );
    }
  }

  /** Logs the rejection (spec §7.7) and returns a client-safe exception to throw. */
  private reject(
    file: Express.Multer.File,
    reason: string,
  ): BadRequestException {
    this.logger.warn(
      `Rejected upload: ${reason} (filename="${file.originalname}", mimetype="${file.mimetype}", size=${file.size})`,
    );
    return new BadRequestException(
      'Only JPEG, PNG, and WebP images are allowed, up to the configured size and dimension limits',
    );
  }
}
