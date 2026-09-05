import { extname } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_GLB_EXTENSIONS,
  ALLOWED_GLB_MIME_TYPES,
  GLB_HEADER_BYTE_LENGTH,
  GLB_MAGIC,
  GLB_SUPPORTED_VERSION,
  MAX_GLB_UPLOAD_BYTES,
} from './glb-upload.constants';

/**
 * Upload pipeline for manually-produced GLB models (the hero-dish bypass —
 * documents/3d-model-enhancement.md §5). Mirrors ImageUploadService's §7.5
 * checklist, adapted for a 3D asset instead of an image:
 *  1. Whitelist by extension AND MIME (client-supplied — first-pass only).
 *  2. Verify real content via the GLB binary header (the magic-byte
 *     equivalent of ImageUploadService's sharp decode — there's no image
 *     library to lean on here, so the header is parsed directly).
 *  3. Enforce a max size.
 *  4. Store under a server-generated random key — never the client
 *     filename.
 *  5. Store outside the web root with no execute permission (StorageModule
 *     / LocalDiskStorageProvider) — never executed.
 * Every rejection is logged (spec §7.7) — filename/mimetype/reason only,
 * never file content.
 */
@Injectable()
export class GlbUploadService {
  private readonly logger = new Logger(GlbUploadService.name);

  constructor(private readonly storage: StorageService) {}

  async validateAndStore(
    file: Express.Multer.File,
    keyPrefix: string,
  ): Promise<{ key: string; url: string }> {
    this.assertClientClaimsAllowed(file);
    this.assertGenuineGlb(file);

    const key = this.storage.generateKey(keyPrefix, 'glb');
    this.logger.debug(
      `Storing manual GLB upload as ${key} (${file.size} bytes)`,
    );
    return this.storage.putObject({
      key,
      body: file.buffer,
      contentType: 'model/gltf-binary',
    });
  }

  private assertClientClaimsAllowed(file: Express.Multer.File) {
    if (
      !ALLOWED_GLB_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_GLB_MIME_TYPES)[number],
      )
    ) {
      throw this.reject(
        file,
        `claimed mimetype "${file.mimetype}" is not allowed`,
      );
    }
    const ext = extname(file.originalname).toLowerCase();
    if (
      !ALLOWED_GLB_EXTENSIONS.includes(
        ext as (typeof ALLOWED_GLB_EXTENSIONS)[number],
      )
    ) {
      throw this.reject(file, `extension "${ext}" is not allowed`);
    }
    if (file.size > MAX_GLB_UPLOAD_BYTES) {
      // Defense in depth — multer's own `limits.fileSize` (set on the
      // interceptor) is the primary enforcement.
      throw this.reject(
        file,
        `size ${file.size} exceeds ${MAX_GLB_UPLOAD_BYTES} bytes`,
      );
    }
  }

  /** Parses the real GLB binary header — independent of what the client
   * claimed — and rejects anything that isn't a genuine, well-formed GLB. */
  private assertGenuineGlb(file: Express.Multer.File) {
    const buf = file.buffer;
    if (buf.length < GLB_HEADER_BYTE_LENGTH) {
      throw this.reject(file, 'file is too small to be a valid GLB');
    }
    const magic = buf.readUInt32LE(0);
    if (magic !== GLB_MAGIC) {
      throw this.reject(file, 'file does not start with the GLB magic bytes');
    }
    const version = buf.readUInt32LE(4);
    if (version !== GLB_SUPPORTED_VERSION) {
      throw this.reject(file, `unsupported GLB version ${version}`);
    }
    // The GLB header declares the total file length — a genuine exporter
    // always sets this to match the actual byte count. A mismatch means
    // either a corrupt file or bytes appended/prepended by something else
    // (e.g. a polyglot file trying to smuggle a second payload past the
    // magic-byte check) — reject either way.
    const declaredLength = buf.readUInt32LE(8);
    if (declaredLength !== buf.length) {
      throw this.reject(
        file,
        `declared GLB length ${declaredLength} does not match actual file size ${buf.length}`,
      );
    }
  }

  /** Logs the rejection (spec §7.7) and returns a client-safe exception to throw. */
  private reject(
    file: Express.Multer.File,
    reason: string,
  ): BadRequestException {
    this.logger.warn(
      `Rejected manual GLB upload: ${reason} (filename="${file.originalname}", mimetype="${file.mimetype}", size=${file.size})`,
    );
    return new BadRequestException(
      'Only a valid, well-formed .glb file is allowed, up to the configured size limit',
    );
  }
}
