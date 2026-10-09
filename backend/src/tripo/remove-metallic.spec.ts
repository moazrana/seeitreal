import { removeMetallic } from './remove-metallic';

function fakeMaterial(metallic: number) {
  let value = metallic;
  return {
    getMetallicFactor: () => value,
    setMetallicFactor(next: number) {
      value = next;
      return this as never;
    },
  };
}

describe('removeMetallic', () => {
  it('sets every metallic material to 0 and reports how many changed', () => {
    const materials = [fakeMaterial(1), fakeMaterial(0.4), fakeMaterial(0)];

    expect(removeMetallic(materials)).toBe(2);
    expect(materials.map((m) => m.getMetallicFactor())).toEqual([0, 0, 0]);
  });

  it('changes nothing when no material is metallic', () => {
    expect(removeMetallic([fakeMaterial(0)])).toBe(0);
  });
});
