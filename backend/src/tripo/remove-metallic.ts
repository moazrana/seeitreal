import type { Material } from '@gltf-transform/core';

/**
 * Sets every material's metallic factor to 0. In glTF the metallic value
 * is metallicFactor × the texture's blue channel, so a factor of 0 removes
 * metal everywhere while keeping the roughness map (green channel) intact.
 *
 * Returns how many materials were changed. Kept apart from
 * ModelMaterialService, with a type-only import, so it can be unit-tested
 * without loading @gltf-transform/core, which Jest can't load (see
 * model-scaling.service.spec.ts).
 */
export function removeMetallic(
  materials: Pick<Material, 'getMetallicFactor' | 'setMetallicFactor'>[],
): number {
  let changed = 0;
  for (const material of materials) {
    if (material.getMetallicFactor() !== 0) {
      material.setMetallicFactor(0);
      changed++;
    }
  }
  return changed;
}
