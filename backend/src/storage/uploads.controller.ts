import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { StorageDriver } from '../config/env.validation';
import { LocalDiskStorageProvider } from './providers/local-disk-storage.provider';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.usdz': 'model/vnd.usdz+zip',
};

/**
 * Read-only static serving for the local-disk storage provider (dev/
 * self-hosted only — production points STORAGE_DRIVER=s3 at real object
 * storage/CDN instead, and this controller is simply unused).
 *
 * Deliberately not a generic `express.static` mount: the key shape is
 * validated (exactly `<prefix>/<random>.<ext>`, checked again against the
 * resolved on-disk path by LocalDiskStorageProvider) and files are only
 * ever read, never executed (spec §7.5).
 */
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalDiskStorageProvider,
  ) {}

  @SkipThrottle()
  @Get(':prefix/:filename')
  getObject(
    @Param('prefix') prefix: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (
      this.config.get<StorageDriver>('STORAGE_DRIVER') !== StorageDriver.Local
    ) {
      throw new NotFoundException();
    }

    const key = `${prefix}/${filename}`;
    let filePath: string;
    try {
      filePath = this.local.resolveKeyPath(key);
    } catch {
      throw new NotFoundException();
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new NotFoundException();
    }

    const contentType =
      CONTENT_TYPES[extname(filename).toLowerCase()] ??
      'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // These are public assets meant to be embedded cross-origin — the
    // dashboard (a different origin in dev, and the CDN/frontend domain in
    // production) loads them as <img>/<model-viewer> subresources, and the
    // diner-facing AR viewer will too. helmet's default
    // Cross-Origin-Resource-Policy: same-origin (correct for the JSON API)
    // silently blocks exactly that: the browser drops the image with no
    // console error, `naturalWidth` stays 0. Override it only here.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(filePath).pipe(res);
  }
}
