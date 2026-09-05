import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { Injectable } from '@nestjs/common';

/**
 * Scales a Tripo-generated GLB to the dish's true real-world size
 * (documents/TASK-real-world-ar-sizing.md). Tripo returns models at an
 * arbitrary normalized scale — without this step a burger and a wardrobe
 * come out the same size in AR.
 *
 * Runs server-side, after the GLB is downloaded from Tripo and before
 * GLB→USDZ conversion (TripoGenerationService.handleTaskResult), so both
 * output files end up correctly sized.
 */
@Injectable()
export class ModelScalingService {
  // Built lazily on first use, not as an eager field initializer:
  // NodeIO's constructor kicks off an internal dynamic import() of
  // node:fs/node:path (for its file-path read/write helpers, which this
  // service never uses — we only call readBinary/writeBinary on in-memory
  // buffers). Constructing it eagerly would run that at module-load time
  // for every process that imports this service, including test runners
  // that don't support dynamic import in their module system.
  private io: NodeIO | undefined;

  private getIo(): NodeIO {
    // Extension registration only affects which glTF extensions NodeIO
    // understands while reading/writing (e.g. KHR_materials_*,
    // KHR_texture_transform) — it does not add Draco/Meshopt geometry
    // decompression, which needs separate wasm decoders we don't depend
    // on. If Tripo ever starts returning Draco-compressed meshes this
    // throws loudly instead of silently mis-scaling; the caller already
    // treats a scaling failure as a QA-flag case, matching how USDZ
    // conversion failures are handled.
    this.io ??= new NodeIO().registerExtensions(ALL_EXTENSIONS);
    return this.io;
  }

  /**
   * Uniform-scales the model so its bounding-box width matches
   * `realWidthMm`, then translates it so its base rests at y = 0.
   *
   * Deliberately scales uniformly from width alone rather than stretching
   * width/height/length independently — the AI's proportions are only
   * approximately right, and forcing all three axes would distort the
   * shape (spec: TASK-real-world-ar-sizing.md §3).
   */
  async scaleToRealWidth(
    glbBuffer: Buffer,
    realWidthMm: number,
  ): Promise<Buffer> {
    const io = this.getIo();
    const document = await io.readBinary(new Uint8Array(glbBuffer));
    const scene = document.getRoot().listScenes()[0];
    if (!scene) {
      throw new Error('GLB has no scene to scale');
    }

    const bbox = getBounds(scene);
    const currentWidth = bbox.max[0] - bbox.min[0];
    if (!Number.isFinite(currentWidth) || currentWidth <= 0) {
      throw new Error(
        `Cannot scale: model bounding box has an invalid width (${currentWidth})`,
      );
    }

    const realWidthMeters = realWidthMm / 1000;
    const factor = realWidthMeters / currentWidth;

    for (const node of scene.listChildren()) {
      const s = node.getScale();
      node.setScale([s[0] * factor, s[1] * factor, s[2] * factor]);
    }

    // Ground the model: shift it so its lowest point sits at y = 0, so it
    // rests naturally on the detected surface in AR instead of floating
    // or sinking into it (recommended by the task spec).
    const scaledBounds = getBounds(scene);
    const dy = -scaledBounds.min[1];
    if (dy !== 0) {
      for (const node of scene.listChildren()) {
        const t = node.getTranslation();
        node.setTranslation([t[0], t[1] + dy, t[2]]);
      }
    }

    const out = await io.writeBinary(document);
    return Buffer.from(out);
  }
}
