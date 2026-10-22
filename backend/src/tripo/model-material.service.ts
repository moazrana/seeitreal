import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Injectable, Logger } from '@nestjs/common';
import { removeMetallic } from './remove-metallic';

/**
 * Food is never metal. Tripo's PBR output (and glTF's own default of
 * metallicFactor = 1 when a material omits it) can mark dishes as metallic,
 * which renders them as polished chrome, worst in iOS AR Quick Look. This
 * runs on every generated or uploaded GLB before it is stored and converted
 * to USDZ, so both formats get the same non-metallic materials.
 */
@Injectable()
export class ModelMaterialService {
  private readonly logger = new Logger(ModelMaterialService.name);
  // Lazy, same reason as ModelScalingService.
  private io: NodeIO | undefined;

  private getIo(): NodeIO {
    this.io ??= new NodeIO().registerExtensions(ALL_EXTENSIONS);
    return this.io;
  }

  /** Like optimizeOrOriginal, never a gate: if the GLB can't be rewritten,
   * the original is kept and the failure logged. */
  async makeNonMetallic(glbBuffer: Buffer, context: string): Promise<Buffer> {
    try {
      const io = this.getIo();
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const changed = removeMetallic(document.getRoot().listMaterials());
      if (changed === 0) {
        return glbBuffer;
      }
      this.logger.log(
        `Removed metallic from ${changed} material(s) (${context})`,
      );
      return Buffer.from(await io.writeBinary(document));
    } catch (err) {
      this.logger.warn(
        `Could not remove metallic (${context}); keeping the original: ${String(err)}`,
      );
      return glbBuffer;
    }
  }
}
