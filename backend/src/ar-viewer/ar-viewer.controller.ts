import { createReadStream } from 'node:fs';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { renderItemPage, renderNotFoundPage } from './ar-viewer.html';
import { ArViewerService } from './ar-viewer.service';

const MODEL_VIEWER_SCRIPT_PATH: string =
  require.resolve('@google/model-viewer/dist/model-viewer.min.js');

/**
 * Public, unauthenticated diner-facing pages (spec §3, §7 "Diner AR Viewer
 * (public)", §9 build order step 3). No JWT guard anywhere in this
 * controller — that's intentional, not an oversight.
 */
@Controller()
export class ArViewerController {
  constructor(
    private readonly arViewer: ArViewerService,
    private readonly config: ConfigService,
  ) {}

  // Public scan/AR endpoint — stricter throttling per spec §7.4.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('m/:slug')
  async viewItem(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // model-viewer needs blob:/data: for WebGL texture decoding and (on
    // some browsers) a worker — helmet's default CSP doesn't allow those.
    // Scoped to this route only; the JSON API keeps the stricter default.
    // Also explicitly allow-lists the object-storage origin (photos/models
    // live there in production, STORAGE_DRIVER=s3) and, if configured, the
    // HDR environment-image origin (documents/3d-model-enhancement.md §3) —
    // never a wildcard, same "explicit allow-list" rule as CORS (spec §7.6).
    const externalOrigins = this.externalAssetOrigins();
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        // 'wasm-unsafe-eval' (not the broader 'unsafe-eval') — model-viewer
        // compiles a WASM module for mesh/texture decoding (Draco/KTX2).
        // Without it, WebAssembly.instantiate() throws a CSP CompileError;
        // simple uncompressed models still render (found live: a plain
        // sample glTF rendered fine while throwing this in the console —
        // a Draco/KTX2-compressed model would actually fail to load).
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob:${externalOrigins}`,
        `connect-src 'self' blob: data:${externalOrigins}`,
        "worker-src 'self' blob:",
        'child-src blob:',
      ].join('; '),
    );

    try {
      const item = await this.arViewer.findItemByPublicSlug(slug);
      const environmentImageUrl =
        this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL') || 'neutral';
      return renderItemPage(item, item.restaurant.name, environmentImageUrl);
    } catch (err) {
      if (err instanceof NotFoundException) {
        res.status(404);
        return renderNotFoundPage();
      }
      throw err;
    }
  }

  // Self-hosted model-viewer bundle (spec-neutral choice: an npm dependency
  // we serve ourselves, not a vendored blob in git and not a third-party
  // CDN — keeps CSP simple and avoids an external runtime dependency).
  @SkipThrottle()
  @Get('vendor/model-viewer.min.js')
  getModelViewerScript(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(MODEL_VIEWER_SCRIPT_PATH).pipe(res);
  }

  /** Origins the CSP must explicitly allow beyond 'self' — object storage
   * (STORAGE_PUBLIC_BASE_URL, where photos/models actually live under
   * STORAGE_DRIVER=s3) and, if configured, the HDR environment-image host.
   * Returns a leading-space-prefixed, space-separated list ready to splice
   * into a directive value (empty string when nothing extra is configured
   * — e.g. local dev, where uploads are same-origin). Malformed config is
   * dropped rather than included verbatim, so a bad env value can't smuggle
   * `unsafe-inline`/wildcards/etc. into the header. */
  private externalAssetOrigins(): string {
    const candidates = [
      this.config.get<string>('STORAGE_PUBLIC_BASE_URL'),
      this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL'),
    ];
    const origins = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          origins.add(url.origin);
        }
      } catch {
        // Not an absolute URL (e.g. AR_ENVIRONMENT_IMAGE_URL="neutral") —
        // nothing to allow-list for it.
      }
    }
    return origins.size > 0 ? ` ${[...origins].join(' ')}` : '';
  }
}
