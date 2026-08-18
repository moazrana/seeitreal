/**
 * gltf-pipeline (CesiumGS) ships no type declarations of its own and there's
 * no @types package for it — this covers only the one function this backend
 * actually calls (UsdzConversionService: unpack a GLB into a self-contained
 * glTF JSON with buffers/images embedded, so the USD converter never has to
 * deal with binary chunk parsing).
 */
declare module 'gltf-pipeline' {
  export interface GlbToGltfResult {
    gltf: Record<string, unknown>;
    separateResources?: Record<string, Buffer>;
  }

  export function glbToGltf(
    glb: Buffer,
    options?: Record<string, unknown>,
  ): Promise<GlbToGltfResult>;
}
