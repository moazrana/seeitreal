type Vec3 = [number, number, number];

interface FakeNodeData {
  // Fixed local-space bounds the node's (untransformed) mesh occupies —
  // stands in for real geometry so the fake getBounds() below can compute
  // a world-space AABB the same way the real @gltf-transform/functions
  // getBounds() does: local bounds transformed by the node's own
  // scale/translation.
  baseMin: Vec3;
  baseMax: Vec3;
  scale: Vec3;
  translation: Vec3;
}

/**
 * ModelScalingService is a thin, well-typed wrapper around
 * @gltf-transform/core + functions — but that package's CJS build
 * `require()`s the ESM-only `property-graph` package. Real Node 22
 * resolves that fine, but Jest's own module loader doesn't implement that
 * interop, so it can't be loaded for real inside a Jest test file (see the
 * same note in tripo-generation.service.spec.ts).
 *
 * Rather than skip testing the actual scale/ground/error-handling logic,
 * these mocks reimplement just enough of NodeIO/getBounds' real semantics
 * — a JSON-serialized scene graph instead of a real GLB, and a bounds
 * calculation that composes scale+translation the same way the real
 * world-space AABB does — so the assertions below exercise the service's
 * real math, not a stub return value.
 */
jest.mock('@gltf-transform/core', () => {
  class FakeNodeIO {
    registerExtensions() {
      return this;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async readBinary(bytes: Uint8Array) {
      const children: FakeNodeData[] = JSON.parse(
        Buffer.from(bytes).toString('utf8'),
      ) as FakeNodeData[];
      const scene = {
        listChildren: () =>
          children.map((child) => ({
            __base: { min: child.baseMin, max: child.baseMax },
            getScale: (): Vec3 => child.scale,
            setScale: (v: Vec3) => {
              child.scale = v;
            },
            getTranslation: (): Vec3 => child.translation,
            setTranslation: (v: Vec3) => {
              child.translation = v;
            },
          })),
      };
      return {
        getRoot: () => ({ listScenes: () => [scene] }),
        __children: children,
      };
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async writeBinary(document: { __children: FakeNodeData[] }) {
      return new TextEncoder().encode(JSON.stringify(document.__children));
    }
  }

  return { NodeIO: FakeNodeIO };
});

jest.mock('@gltf-transform/extensions', () => ({ ALL_EXTENSIONS: [] }));

jest.mock('@gltf-transform/functions', () => ({
  getBounds: (scene: {
    listChildren: () => {
      __base: { min: Vec3; max: Vec3 };
      getScale: () => Vec3;
      getTranslation: () => Vec3;
    }[];
  }) => {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const child of scene.listChildren()) {
      const s = child.getScale();
      const t = child.getTranslation();
      for (let i = 0; i < 3; i++) {
        const worldMin = child.__base.min[i] * s[i] + t[i];
        const worldMax = child.__base.max[i] * s[i] + t[i];
        min[i] = Math.min(min[i], worldMin);
        max[i] = Math.max(max[i], worldMax);
      }
    }
    return { min, max };
  },
}));

// Deliberately `require`d (not statically `import`ed) — TS/ts-jest always
// hoists `import` statements above other statements when compiling to
// CommonJS, which would load the real module before jest.mock() above had
// a chance to register the mocks.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const modelScalingModule = require('./model-scaling.service');
const { ModelScalingService } =
  modelScalingModule as typeof import('./model-scaling.service');

function buildGlbFixture(nodes: FakeNodeData[]): Buffer {
  return Buffer.from(JSON.stringify(nodes));
}

function readFixture(bytes: Buffer): FakeNodeData[] {
  return JSON.parse(bytes.toString('utf8')) as FakeNodeData[];
}

describe('ModelScalingService', () => {
  let service: InstanceType<typeof ModelScalingService>;

  beforeEach(() => {
    service = new ModelScalingService();
  });

  it('uniform-scales the model so its bounding-box width matches the target real-world width', async () => {
    // A 0.10m-wide node, target real width 260mm (0.26m).
    const glb = buildGlbFixture([
      {
        baseMin: [0, 0, 0],
        baseMax: [0.1, 0.05, 0.1],
        scale: [1, 1, 1],
        translation: [0, 0, 0],
      },
    ]);

    const scaled = await service.scaleToRealWidth(glb, 260);
    const [node] = readFixture(Buffer.from(scaled));

    const width = (node.baseMax[0] - node.baseMin[0]) * node.scale[0];
    expect(width).toBeCloseTo(0.26, 5);
  });

  it('does not distort proportions — every axis scales by the same factor', async () => {
    const glb = buildGlbFixture([
      {
        baseMin: [0, 0, 0],
        baseMax: [0.1, 0.05, 0.2],
        scale: [1, 1, 1],
        translation: [0, 0, 0],
      },
    ]);

    const scaled = await service.scaleToRealWidth(glb, 260);
    const [node] = readFixture(Buffer.from(scaled));

    expect(node.scale[0]).toBeCloseTo(node.scale[1], 10);
    expect(node.scale[0]).toBeCloseTo(node.scale[2], 10);
  });

  it('composes onto any pre-existing scale rather than overwriting it', async () => {
    const glb = buildGlbFixture([
      {
        baseMin: [0, 0, 0],
        baseMax: [0.1, 0.05, 0.1],
        scale: [2, 2, 2], // node already has a non-identity scale
        translation: [0, 0, 0],
      },
    ]);

    const scaled = await service.scaleToRealWidth(glb, 260);
    const [node] = readFixture(Buffer.from(scaled));

    // Current world width was 0.1 * 2 = 0.2m; factor to reach 0.26m is 1.3,
    // applied on top of the existing scale of 2 → final scale 2.6.
    expect(node.scale[0]).toBeCloseTo(2.6, 5);
  });

  it('grounds the model so its lowest point sits at y = 0', async () => {
    const glb = buildGlbFixture([
      {
        baseMin: [0, 0, 0],
        baseMax: [0.1, 0.05, 0.1],
        scale: [1, 1, 1],
        translation: [0, 1, 0], // floating 1m above the origin
      },
    ]);

    const scaled = await service.scaleToRealWidth(glb, 260);
    const [node] = readFixture(Buffer.from(scaled));

    const worldMinY = node.baseMin[1] * node.scale[1] + node.translation[1];
    expect(worldMinY).toBeCloseTo(0, 5);
  });

  it('rejects a model with a zero-width bounding box instead of dividing by zero', async () => {
    const glb = buildGlbFixture([
      {
        baseMin: [0, 0, 0],
        baseMax: [0, 1, 1], // zero extent on X
        scale: [1, 1, 1],
        translation: [0, 0, 0],
      },
    ]);

    await expect(service.scaleToRealWidth(glb, 260)).rejects.toThrow(/width/);
  });
});
