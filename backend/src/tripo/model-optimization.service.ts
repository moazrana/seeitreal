import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { Injectable, Logger } from '@nestjs/common';
import type { MeshoptSimplifier as Simplifier } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Triangle budget for a dish model. Tripo returns ~1.4M triangles (~40MB
 * of geometry) — far beyond what a phone needs for a plate on a table, and
 * the main reason models loaded slowly, especially on mid-range Android.
 * ~150k keeps food surfaces smooth at AR viewing distance.
 */
export const TARGET_TRIANGLES = 150_000;
/** Longest texture edge. 4096² textures cost ~64MB of GPU memory each. */
export const MAX_TEXTURE_EDGE_PX = 2048;
// Max geometric deviation simplify() may introduce, relative to the mesh
// size (0.5%). Without an allowance this generous it stops long before the
// triangle budget on dense scanned-style meshes.
const SIMPLIFY_MAX_ERROR = 0.005;

export interface OptimizationStats {
  trianglesBefore: number;
  trianglesAfter: number;
  bytesBefore: number;
  bytesAfter: number;
}

/**
 * Shrinks a GLB for fast mobile loading, without changing its size,
 * placement, or appearance at AR viewing distance: dedup/prune unused data,
 * weld duplicate vertices, simplify to a triangle budget with
 * meshoptimizer, and cap texture dimensions (keeping each texture's format
 * — no extensions are introduced, so Scene Viewer, Quick Look and
 * <model-viewer> all load the result without extra decoders or CSP
 * changes).
 *
 * Runs after real-world scaling and before GLB→USDZ conversion, so the
 * iOS model gets the same savings.
 */
@Injectable()
export class ModelOptimizationService {
  private readonly logger = new Logger(ModelOptimizationService.name);
  // Lazy, same reason as ModelScalingService: NodeIO's constructor does a
  // dynamic import that some test runners can't handle at module load.
  private io: NodeIO | undefined;
  // Loaded on first use: meshoptimizer is ESM-only with an inline WASM
  // module — no reason to load it at API startup, and it keeps Jest (whose
  // CJS loader can't import ESM) working for every suite that merely
  // imports this service.
  private simplifier: Promise<typeof Simplifier> | undefined;

  private loadSimplifier(): Promise<typeof Simplifier> {
    this.simplifier ??= import('meshoptimizer').then(
      async ({ MeshoptSimplifier }) => {
        await MeshoptSimplifier.ready;
        return MeshoptSimplifier;
      },
    );
    return this.simplifier;
  }

  private getIo(): NodeIO {
    this.io ??= new NodeIO().registerExtensions(ALL_EXTENSIONS);
    return this.io;
  }

  async optimize(
    glbBuffer: Buffer,
  ): Promise<{ glb: Buffer; stats: OptimizationStats }> {
    const io = this.getIo();
    const document = await io.readBinary(new Uint8Array(glbBuffer));
    const trianglesBefore = countTriangles(document);

    const simplifier = await this.loadSimplifier();
    const ratio = Math.min(1, TARGET_TRIANGLES / Math.max(trianglesBefore, 1));
    await document.transform(
      dedup(),
      weld(),
      ...(ratio < 1
        ? [
            simplify({
              simplifier,
              ratio,
              error: SIMPLIFY_MAX_ERROR,
            }),
          ]
        : []),
      textureCompress({
        encoder: sharp,
        resize: [MAX_TEXTURE_EDGE_PX, MAX_TEXTURE_EDGE_PX],
      }),
      prune(),
    );

    const glb = Buffer.from(await io.writeBinary(document));
    const stats: OptimizationStats = {
      trianglesBefore,
      trianglesAfter: countTriangles(document),
      bytesBefore: glbBuffer.length,
      bytesAfter: glb.length,
    };
    this.logger.log(
      `Optimized model: ${stats.trianglesBefore} -> ${stats.trianglesAfter} triangles, ${stats.bytesBefore} -> ${stats.bytesAfter} bytes`,
    );
    return { glb, stats };
  }

  /**
   * Optimization is a performance step, never a gate: if it fails (an
   * unusual but valid GLB), the original model is used and the failure
   * logged, rather than blocking the dish from going to QA.
   */
  async optimizeOrOriginal(
    glbBuffer: Buffer,
    context: string,
  ): Promise<Buffer> {
    try {
      return (await this.optimize(glbBuffer)).glb;
    } catch (err) {
      this.logger.warn(
        `Model optimization failed (${context}); keeping the original: ${String(err)}`,
      );
      return glbBuffer;
    }
  }
}

function countTriangles(document: Document): number {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      // Only TRIANGLES (mode 4) contributes; points/lines don't count.
      if (primitive.getMode() !== 4) continue;
      const indices = primitive.getIndices();
      const count =
        indices?.getCount() ?? primitive.getAttribute('POSITION')?.getCount();
      triangles += Math.floor((count ?? 0) / 3);
    }
  }
  return triangles;
}
