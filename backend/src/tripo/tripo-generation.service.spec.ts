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
  let tripoClient: { submitImageToModel: jest.Mock; getTaskStatus: jest.Mock };
  let storage: { putObject: jest.Mock; generateKey: jest.Mock };
  let usdz: { convert: jest.Mock };
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
    tripoClient = { submitImageToModel: jest.fn(), getTaskStatus: jest.fn() };
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripoGenerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: TripoClientService, useValue: tripoClient },
        { provide: StorageService, useValue: storage },
        { provide: UsdzConversionService, useValue: usdz },
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

    it('refuses to re-trigger while already generating (debounce guard)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photoUrl: 'http://example.com/photo.jpg',
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
  });
});
