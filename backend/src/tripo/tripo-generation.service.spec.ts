import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import { TripoClientService } from './tripo-client.service';
import { TripoGenerationService } from './tripo-generation.service';
import { UsdzConversionService } from './usdz-conversion.service';

// Factory mock (not automock) so the real './model-scaling.service' module
// is never evaluated here — it statically imports @gltf-transform/core,
// which ships a CJS build that requires the ESM-only `property-graph`
// package. Real Node 22 resolves that fine (require(esm)), but Jest's own
// module loader doesn't implement that interop, so importing it for real
// inside a Jest test file throws. ModelScalingService itself is covered by
// model-scaling.service.spec.ts (which mocks these same gltf-transform
// packages for the same reason).
//
// Deliberately a plain `require` (not an ES `import`) — TS/ts-jest always
// hoists `import` statements above other statements when compiling to
// CommonJS, which would run this require before jest.mock() had a chance
// to register the mock.
jest.mock('./model-scaling.service', () => ({
  ModelScalingService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const modelScalingModule = require('./model-scaling.service');
const { ModelScalingService } =
  modelScalingModule as typeof import('./model-scaling.service');

describe('TripoGenerationService', () => {
  let service: TripoGenerationService;
  let prisma: {
    menuItem: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let restaurants: { assertOwnership: jest.Mock };
  let tripoClient: {
    submitImageToModel: jest.Mock;
    submitMultiviewToModel: jest.Mock;
    getTaskStatus: jest.Mock;
  };
  let storage: { putObject: jest.Mock; generateKey: jest.Mock };
  let usdz: { convert: jest.Mock };
  let modelScaling: { scaleToRealWidth: jest.Mock };
  let originalFetch: typeof fetch;

  const owner = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };
  const restaurant = { id: 10, ownerUserId: 1 };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    restaurants = { assertOwnership: jest.fn().mockResolvedValue(restaurant) };
    tripoClient = {
      submitImageToModel: jest.fn(),
      submitMultiviewToModel: jest.fn(),
      getTaskStatus: jest.fn(),
    };
    storage = {
      putObject: jest
        .fn()
        .mockImplementation(({ key }: { key: string }) =>
          Promise.resolve({ key, url: `http://localhost/api/uploads/${key}` }),
        ),
      generateKey: jest.fn(
        (prefix: string, ext: string) => `${prefix}/random.${ext}`,
      ),
    };
    usdz = { convert: jest.fn() };
    modelScaling = {
      scaleToRealWidth: jest
        .fn()
        .mockImplementation((buf: Buffer) => Promise.resolve(buf)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripoGenerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: TripoClientService, useValue: tripoClient },
        { provide: StorageService, useValue: storage },
        { provide: UsdzConversionService, useValue: usdz },
        { provide: ModelScalingService, useValue: modelScaling },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({
                  API_BASE_URL: 'http://localhost:3000',
                  TRIPO_WEBHOOK_SECRET: 'x'.repeat(20),
                })[key],
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(TripoGenerationService);

    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('triggerGeneration', () => {
    it('rejects an item with no photo', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: null,
        arStatus: 'pending',
      });

      await expect(
        service.triggerGeneration(restaurant.id, 1, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tripoClient.submitImageToModel).not.toHaveBeenCalled();
    });

    it('rejects an item with no real-world width (documents/TASK-real-world-ar-sizing.md)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: 'http://example.com/photo.jpg',
        widthMm: null,
        arStatus: 'pending',
      });

      await expect(
        service.triggerGeneration(restaurant.id, 1, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tripoClient.submitImageToModel).not.toHaveBeenCalled();
    });

    it('refuses to re-trigger while already generating (debounce guard)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: 'http://example.com/photo.jpg',
        widthMm: 260,
        arStatus: 'generating',
      });

      await expect(
        service.triggerGeneration(restaurant.id, 1, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tripoClient.submitImageToModel).not.toHaveBeenCalled();
    });

    it('submits to Tripo and marks the item generating on the happy path', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: 'http://example.com/photo.jpg',
        widthMm: 260,
        arStatus: 'pending',
      });
      tripoClient.submitImageToModel.mockResolvedValueOnce({
        taskId: 'task_123',
      });
      prisma.menuItem.update.mockResolvedValueOnce({
        id: 1,
        arStatus: 'generating',
      });

      await service.triggerGeneration(restaurant.id, 1, owner);

      expect(tripoClient.submitImageToModel).toHaveBeenCalledWith(
        'http://example.com/photo.jpg',
        expect.objectContaining({ texture: true, pbr: true }),
      );
      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { arStatus: 'generating', tripoTaskId: 'task_123', qaNote: null },
      });
    });

    it('uses the single-image endpoint for exactly one photo from the photos relation (documents/3d-model-enhancement.md §1)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: 'http://example.com/legacy.jpg',
        photos: [
          { id: 1, sortOrder: 0, url: 'http://example.com/photo-0.jpg' },
        ],
        widthMm: 260,
        arStatus: 'pending',
      });
      tripoClient.submitImageToModel.mockResolvedValueOnce({
        taskId: 'task_1',
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.triggerGeneration(restaurant.id, 1, owner);

      // Prefers the `photos` relation over the legacy photoUrl field when
      // both are present.
      expect(tripoClient.submitImageToModel).toHaveBeenCalledWith(
        'http://example.com/photo-0.jpg',
        expect.objectContaining({ texture: true, pbr: true }),
      );
      expect(tripoClient.submitMultiviewToModel).not.toHaveBeenCalled();
    });

    it('routes 2-5 photos to the multiview endpoint, capped at 4, in upload order', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [0, 1, 2, 3, 4].map((n) => ({
          id: n,
          sortOrder: n,
          url: `http://example.com/photo-${n}.jpg`,
        })),
        widthMm: 260,
        arStatus: 'pending',
      });
      tripoClient.submitMultiviewToModel.mockResolvedValueOnce({
        taskId: 'task_mv',
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.triggerGeneration(restaurant.id, 1, owner);

      expect(tripoClient.submitImageToModel).not.toHaveBeenCalled();
      expect(tripoClient.submitMultiviewToModel).toHaveBeenCalledWith(
        [
          'http://example.com/photo-0.jpg',
          'http://example.com/photo-1.jpg',
          'http://example.com/photo-2.jpg',
          'http://example.com/photo-3.jpg',
        ],
        expect.objectContaining({ texture: true, pbr: true }),
      );
    });

    it('passes the configured texture quality to Tripo', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [{ id: 1, sortOrder: 0, url: 'http://example.com/photo.jpg' }],
        widthMm: 260,
        arStatus: 'pending',
      });
      tripoClient.submitImageToModel.mockResolvedValueOnce({
        taskId: 'task_1',
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.triggerGeneration(restaurant.id, 1, owner);

      expect(tripoClient.submitImageToModel).toHaveBeenCalledWith(
        'http://example.com/photo.jpg',
        expect.objectContaining({ textureQuality: 'detailed' }),
      );
    });
  });

  describe('handleTaskResult', () => {
    it('ignores a still-running status (no item update)', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
      });

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'running',
        progress: 40,
      });

      expect(prisma.menuItem.update).not.toHaveBeenCalled();
    });

    it('flags the item for QA (not silent retry) when Tripo reports failure', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
      });

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'failed',
        progress: 0,
      });

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          arStatus: 'qa',
          qaNote: expect.stringContaining('task_1'),
        },
      });
    });

    it('downloads and re-hosts the GLB, and flags QA when USDZ conversion is unavailable', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-glb-bytes')),
      });
      usdz.convert.mockRejectedValueOnce(new Error('not implemented'));

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'success',
        progress: 100,
        output: { modelUrl: 'https://tripo.example/model.glb' },
      });

      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'model/gltf-binary' }),
      );
      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          arStatus: 'qa',
          modelGlbUrl: expect.stringContaining('model-glb'),
          modelUsdzUrl: null,
          qaNote: expect.stringContaining('USDZ'),
        }),
      });
    });

    it('never stores the Tripo result URL directly as the model URL (spec §11.4)', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-glb-bytes')),
      });
      usdz.convert.mockResolvedValueOnce(Buffer.from('fake-usdz'));

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'success',
        progress: 100,
        output: { modelUrl: 'https://tripo-expiring.example/model.glb' },
      });

      const updateCall = prisma.menuItem.update.mock.calls[0][0] as {
        data: { modelGlbUrl: string };
      };
      expect(updateCall.data.modelGlbUrl).not.toContain(
        'tripo-expiring.example',
      );
      expect(updateCall.data.modelGlbUrl).toContain('localhost');
    });

    it('scales the GLB to the item real-world width before uploading and before USDZ conversion (documents/TASK-real-world-ar-sizing.md)', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
        widthMm: 260,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-glb-bytes')),
      });
      const scaledBuffer = Buffer.from('scaled-glb-bytes');
      modelScaling.scaleToRealWidth.mockResolvedValueOnce(scaledBuffer);
      usdz.convert.mockResolvedValueOnce(Buffer.from('fake-usdz'));

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'success',
        progress: 100,
        output: { modelUrl: 'https://tripo.example/model.glb' },
      });

      expect(modelScaling.scaleToRealWidth).toHaveBeenCalledWith(
        Buffer.from('fake-glb-bytes'),
        260,
      );
      // The uploaded GLB and the buffer handed to USDZ conversion must both
      // be the *scaled* buffer, not the raw Tripo download.
      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'model/gltf-binary',
          body: scaledBuffer,
        }),
      );
      expect(usdz.convert).toHaveBeenCalledWith(scaledBuffer);
    });

    it('flags the item for QA (not live-but-mis-sized) when scaling fails', async () => {
      prisma.menuItem.findFirst.mockResolvedValueOnce({
        id: 1,
        tripoTaskId: 'task_1',
        widthMm: 260,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-glb-bytes')),
      });
      modelScaling.scaleToRealWidth.mockRejectedValueOnce(
        new Error('bounding box is degenerate'),
      );

      await service.handleTaskResult({
        taskId: 'task_1',
        status: 'success',
        progress: 100,
        output: { modelUrl: 'https://tripo.example/model.glb' },
      });

      expect(storage.putObject).not.toHaveBeenCalled();
      expect(usdz.convert).not.toHaveBeenCalled();
      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          arStatus: 'qa',
          qaNote: expect.stringContaining('scaling'),
        },
      });
    });
  });
});
