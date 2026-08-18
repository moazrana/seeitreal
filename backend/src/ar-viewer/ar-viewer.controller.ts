import { createReadStream } from 'node:fs';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
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
  constructor(private readonly arViewer: ArViewerService) {}

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
        "img-src 'self' data: blob:",
        "connect-src 'self' blob: data:",
        "worker-src 'self' blob:",
        'child-src blob:',
      ].join('; '),
    );

    try {
      const item = await this.arViewer.findItemByPublicSlug(slug);
      return renderItemPage(item, item.restaurant.name);
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
}
