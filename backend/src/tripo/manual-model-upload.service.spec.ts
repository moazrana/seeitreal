import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import { GlbUploadService } from '../uploads/glb-upload.service';
import { ManualModelUploadService } from './manual-model-upload.service';
import { UsdzConversionService } from './usdz-conversion.service';

// Factory mock so the real optimizer (gltf-transform + ESM-only
// meshoptimizer, which Jest's CJS loader can't import) is never evaluated;
// same pattern as tripo-generation.service.spec.ts.
jest.mock('./model-optimization.service', () => ({
  ModelOptimizationService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const modelOptimizationModule = require('./model-optimization.service');
const { ModelOptimizationService } =
  modelOptimizationModule as typeof import('./model-optimization.service');
// Same reasoning for the material step (gltf-transform).
jest.mock('./model-material.service', () => ({
  ModelMaterialService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const modelMaterialModule = require('./model-material.service');
const { ModelMaterialService } =
  modelMaterialModule as typeof import('./model-material.service');

describe('ManualModelUploadService', () => {
  let service: ManualModelUploadService;
  let prisma: { menuItem: { findUnique: jest.Mock; update: jest.Mock } };
  let restaurants: { assertOwnership: jest.Mock };
  let glbUpload: { assertValid: jest.Mock; store: jest.Mock };
  let modelOptimization: { optimizeOrOriginal: jest.Mock };
  let modelMaterial: { makeNonMetallic: jest.Mock };
  let usdz: { convert: jest.Mock };
  let storage: { putObject: jest.Mock; generateKey: jest.Mock };

  const owner = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };
  const restaurant = { id: 10, ownerUserId: 1 };
  const file = { buffer: Buffer.from('fake-glb') } as Express.Multer.File;

  beforeEach(async () => {
    prisma = { menuItem: { findUnique: jest.fn(), update: jest.fn() } };
    restaurants = { assertOwnership: jest.fn().mockResolvedValue(restaurant) };
    glbUpload = {
      assertValid: jest.fn(),
      store: jest.fn().mockResolvedValue({
        key: 'model-glb-manual/x.glb',
        url: 'http://localhost/api/uploads/model-glb-manual/x.glb',
      }),
    };
    modelMaterial = {
      makeNonMetallic: jest
        .fn()
        .mockImplementation((buf: Buffer) => Promise.resolve(buf)),
    };
    modelOptimization = {
      optimizeOrOriginal: jest.fn().mockResolvedValue(Buffer.from('optimized')),
    };
    usdz = { convert: jest.fn() };
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualModelUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: GlbUploadService, useValue: glbUpload },
        { provide: UsdzConversionService, useValue: usdz },
        { provide: StorageService, useValue: storage },
        { provide: ModelOptimizationService, useValue: modelOptimization },
        { provide: ModelMaterialService, useValue: modelMaterial },
      ],
    }).compile();

    service = moduleRef.get(ManualModelUploadService);
  });

  it('accepts a model for an item without dimensions (they are optional)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: null,
      arStatus: 'pending',
    });
    usdz.convert.mockResolvedValueOnce(Buffer.from('fake-usdz'));
    prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'qa' });

    await service.uploadManualModel(restaurant.id, 1, owner, file);

    expect(glbUpload.store).toHaveBeenCalled();
  });

  it('never optimizes (parses) a file that fails GLB validation', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      arStatus: 'pending',
    });
    glbUpload.assertValid.mockImplementationOnce(() => {
      throw new BadRequestException('not a GLB');
    });

    await expect(
      service.uploadManualModel(restaurant.id, 1, owner, file),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modelOptimization.optimizeOrOriginal).not.toHaveBeenCalled();
    expect(glbUpload.store).not.toHaveBeenCalled();
  });

  it('rejects while the item is not pending (debounce guard)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: 200,
      arStatus: 'qa',
    });

    await expect(
      service.uploadManualModel(restaurant.id, 1, owner, file),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(glbUpload.store).not.toHaveBeenCalled();
  });

  it('404s when the item belongs to a different restaurant', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: 999,
      widthMm: 200,
      arStatus: 'pending',
    });

    await expect(
      service.uploadManualModel(restaurant.id, 1, owner, file),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates, optimizes, stores and converts the GLB, then moves the item to qa (no scaling)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: 200,
      arStatus: 'pending',
    });
    usdz.convert.mockResolvedValueOnce(Buffer.from('fake-usdz'));
    prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'qa' });

    await service.uploadManualModel(restaurant.id, 1, owner, file);

    expect(glbUpload.assertValid).toHaveBeenCalledWith(file);
    expect(modelOptimization.optimizeOrOriginal).toHaveBeenCalledWith(
      file.buffer,
      expect.any(String),
    );
    expect(modelMaterial.makeNonMetallic).toHaveBeenCalledWith(
      Buffer.from('optimized'),
      expect.any(String),
    );
    expect(glbUpload.store).toHaveBeenCalledWith(
      Buffer.from('optimized'),
      'model-glb-manual',
    );
    expect(usdz.convert).toHaveBeenCalledWith(Buffer.from('optimized'));
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        arStatus: 'qa',
        modelGlbUrl: 'http://localhost/api/uploads/model-glb-manual/x.glb',
        modelUsdzUrl: expect.stringContaining('model-usdz'),
        tripoTaskId: null,
        qaNote: null,
      },
    });
  });

  it('still moves the item to qa (with a note) when USDZ conversion fails', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: 200,
      arStatus: 'pending',
    });
    usdz.convert.mockRejectedValueOnce(new Error('conversion failed'));
    prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'qa' });

    await service.uploadManualModel(restaurant.id, 1, owner, file);

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        arStatus: 'qa',
        modelUsdzUrl: null,
        qaNote: expect.stringContaining('USDZ'),
      }),
    });
  });
});
