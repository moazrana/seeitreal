import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PutObjectParams,
  StorageProvider,
} from '../storage-provider.interface';

/**
 * Dev/self-hosted fallback storage — writes to a dedicated directory
 * outside the compiled `dist/` web root, never executed (spec §7.5): files
 * are written with no execute bit and served back only through the
 * read-only `GET /api/uploads/:key` controller (uploads.controller.ts),
 * never via a generic static-file mount.
 *
 * Production should use the S3-compatible provider (R2) instead — see
 * StorageModule.
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalDiskStorageProvider.name);
  private readonly rootDir: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.rootDir = resolve(
      this.config.get<string>('LOCAL_STORAGE_DIR') ??
        join(__dirname, '..', '..', '..', 'var', 'uploads'),
    );
    const apiBaseUrl = this.config.get<string>('API_BASE_URL') ?? '';
    this.baseUrl = `${apiBaseUrl.replace(/\/+$/, '')}/api/uploads`;
  }

  async putObject({ key, body, contentType }: PutObjectParams): Promise<void> {
    void contentType; // content type is re-derived from the file on read (see UploadsController)
    const filePath = this.resolveKeyPath(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o750 });
    await writeFile(filePath, body, { mode: 0o640 });
    this.logger.debug(`Wrote object ${key} (${body.length} bytes)`);
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKeyPath(key), { force: true });
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /** Resolves a storage key to an on-disk path, rejecting anything that
   * would escape rootDir (defense in depth — keys are always
   * server-generated, but this makes path traversal structurally
   * impossible rather than relying on that alone). Fails closed: any key
   * containing a `..` segment is rejected outright rather than silently
   * sanitized, so a bug elsewhere can't quietly resolve to the wrong file. */
  resolveKeyPath(key: string): string {
    const normalizedKey = normalize(key);
    if (normalizedKey.split(/[/\\]/).includes('..')) {
      throw new Error(
        `Refusing to resolve storage key containing "..": ${key}`,
      );
    }
    const fullPath = resolve(this.rootDir, normalizedKey);
    if (!fullPath.startsWith(this.rootDir)) {
      throw new Error(`Refusing to resolve storage key outside root: ${key}`);
    }
    return fullPath;
  }
}
