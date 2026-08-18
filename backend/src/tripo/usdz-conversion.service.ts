import { Injectable, Logger } from '@nestjs/common';

/**
 * GLB → USDZ conversion (spec §11.3) — mandatory for iOS AR Quick Look;
 * `<model-viewer>` needs both formats. Tripo only returns a GLB.
 *
 * NOT YET IMPLEMENTED. Per a deliberate scoping decision (deferred rather
 * than attempting a real Pixar USD toolkit install in this pass — that's a
 * nontrivial, slow, separate piece of infrastructure work), this currently
 * throws instead of pretending to produce a working file.
 *
 * Real implementation options for whoever picks this up:
 *  - `pip install usd-core` (Linux-installable, ~200MB) gives Python `pxr`
 *    USD bindings; pair with a glTF→USD converter such as
 *    https://github.com/kcoley/gltf2usd, then package as .usdz (a zip
 *    with a specific layout — Apple's `usdzconvert` does this step too).
 *  - Apple's own `usdzconvert` / Reality Converter (macOS) if the
 *    conversion step runs on Apple hardware/CI rather than this server.
 *  - A hosted conversion API, if one becomes available, called the same
 *    way TripoClientService calls Tripo (server-side, key from env).
 *
 * Whichever is chosen, the contract below (`convert(glbBuffer) =>
 * usdzBuffer`) is what TripoGenerationService expects — swap the body of
 * `convert()` and nothing else in the pipeline needs to change.
 */
@Injectable()
export class UsdzConversionService {
  private readonly logger = new Logger(UsdzConversionService.name);

  isAvailable(): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- signature matches the future real implementation
  async convert(glbBuffer: Buffer): Promise<Buffer> {
    void glbBuffer; // unused until a real converter is wired in — see doc comment
    this.logger.error(
      'USDZ conversion was invoked but is not implemented yet — see class doc comment',
    );
    throw new Error(
      'GLB→USDZ conversion is not implemented in this environment. ' +
        'An item cannot be marked AR-ready without a .usdz file (spec §11.3) — ' +
        'wire a real converter (see UsdzConversionService doc comment) before enabling this path.',
    );
  }
}
