import { createReadStream } from 'node:fs';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  renderItemPage,
  renderNotFoundPage,
  renderSubscriptionExpiredPage,
} from './ar-viewer.html';
import type { ViewerEnvironmentImages } from './ar-viewer.html';
import { ArViewerService, SubscriptionExpiredError } from './ar-viewer.service';
import { AR_VIEWER_THEME_SCRIPT } from './ar-viewer.theme-script';

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
    private readonly analytics: AnalyticsService,
  ) {}

  // Public scan/AR endpoint — stricter throttling per spec §7.4.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('m/:slug')
  async viewItem(
    @Param('slug') slug: string,
    @Req() req: Request,
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
      // Only a page actually served counts as a scan — not-found, hidden
      // and subscription-gated responses never reach here. req.ip is the
      // real client only when TRUST_PROXY is set behind nginx; it's hashed
      // before storage and never persisted raw.
      await this.analytics.recordScan(item.restaurantId, item.id, req.ip);
      return renderItemPage(
        item,
        item.restaurant.name,
        this.environmentImages(),
      );
    } catch (err) {
      if (err instanceof SubscriptionExpiredError) {
        res.status(200);
        return renderSubscriptionExpiredPage(err.restaurantName);
      }
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

  // Tiny theme helper for the viewer page (see ar-viewer.theme-script.ts).
  // Unversioned URL, so cached for a day rather than `immutable`. Left under
  // the global throttle (it's requested once per page view).
  @Get('static/ar-viewer-theme.js')
  getThemeScript(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(AR_VIEWER_THEME_SCRIPT);
  }

  /** Per-theme <model-viewer> environment images (documents/
   * USER-APP-theming.md §5). Light mode falls back to "neutral" — a bright,
   * neutral studio IBL — rather than reusing a (typically warm/dark) dark-
   * mode HDR, unless a dedicated light HDR is configured. */
  private environmentImages(): ViewerEnvironmentImages {
    return {
      dark: this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL') || 'neutral',
      light:
        this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL_LIGHT') || 'neutral',
    };
  }

  /** Origins the CSP must explicitly allow beyond 'self' — object storage
   * (STORAGE_PUBLIC_BASE_URL, where photos/models actually live under
   * STORAGE_DRIVER=s3) and, if configured, the dark/light HDR
   * environment-image hosts.
   * Returns a leading-space-prefixed, space-separated list ready to splice
   * into a directive value (empty string when nothing extra is configured
   * — e.g. local dev, where uploads are same-origin). Malformed config is
   * dropped rather than included verbatim, so a bad env value can't smuggle
   * `unsafe-inline`/wildcards/etc. into the header. */
  private externalAssetOrigins(): string {
    const candidates = [
      this.config.get<string>('STORAGE_PUBLIC_BASE_URL'),
      this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL'),
      this.config.get<string>('AR_ENVIRONMENT_IMAGE_URL_LIGHT'),
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
