import { ModelOptimizationService } from './model-optimization.service';

// The real optimize() pipeline (gltf-transform + meshoptimizer WASM) can't
// run under Jest's CommonJS loader, so it was verified directly against
// real Tripo models (1.42M -> 150k triangles, 41MB -> 4.9MB, dimensions
// unchanged). These tests cover the service's own contract.
describe('ModelOptimizationService.optimizeOrOriginal', () => {
  let service: ModelOptimizationService;

  beforeEach(() => {
    service = new ModelOptimizationService();
  });

  it('returns the optimized GLB when optimization succeeds', async () => {
    const optimized = Buffer.from('small');
    jest.spyOn(service, 'optimize').mockResolvedValueOnce({
      glb: optimized,
      stats: {
        trianglesBefore: 1_400_000,
        trianglesAfter: 150_000,
        bytesBefore: 40,
        bytesAfter: 5,
      },
    });

    await expect(
      service.optimizeOrOriginal(Buffer.from('big'), 'test'),
    ).resolves.toBe(optimized);
  });

  it('falls back to the original GLB (never blocks the pipeline) when optimization throws', async () => {
    const original = Buffer.from('original');
    jest
      .spyOn(service, 'optimize')
      .mockRejectedValueOnce(new Error('unsupported extension'));

    await expect(service.optimizeOrOriginal(original, 'test')).resolves.toBe(
      original,
    );
  });
});
