import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import { GlbUploadService } from '../uploads/glb-upload.service';
import { ManualModelUploadService } from './manual-model-upload.service';
import { UsdzConversionService } from './usdz-conversion.service';

describe('ManualModelUploadService', () => {
  let service: ManualModelUploadService;
  let prisma: { menuItem: { findUnique: jest.Mock; update: jest.Mock } };
  let restaurants: { assertOwnership: jest.Mock };
  let glbUpload: { validateAndStore: jest.Mock };
  let usdz: { convert: jest.Mock };
  let storage: { putObject: jest.Mock; generateKey: jest.Mock };

  const owner = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };
  const restaurant = { id: 10, ownerUserId: 1 };
  const file = { buffer: Buffer.from('fake-glb') } as Express.Multer.File;

  beforeEach(async () => {
    prisma = { menuItem: { findUnique: jest.fn(), update: jest.fn() } };
    restaurants = { assertOwnership: jest.fn().mockResolvedValue(restaurant) };
    glbUpload = { validateAndStore: jest.fn() };
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
      ],
    }).compile();

    service = moduleRef.get(ManualModelUploadService);
  });

  it('rejects when the item has no real-world width set', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: null,
      arStatus: 'pending',
    });

    await expect(
      service.uploadManualModel(restaurant.id, 1, owner, file),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(glbUpload.validateAndStore).not.toHaveBeenCalled();
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
    expect(glbUpload.validateAndStore).not.toHaveBeenCalled();
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

  it('stores the GLB, converts to USDZ, and moves the item to qa without touching ModelScalingService', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
      widthMm: 200,
      arStatus: 'pending',
    });
    glbUpload.validateAndStore.mockResolvedValueOnce({
      key: 'model-glb-manual/x.glb',
      url: 'http://localhost/api/uploads/model-glb-manual/x.glb',
    });
    usdz.convert.mockResolvedValueOnce(Buffer.from('fake-usdz'));
    prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'qa' });

    await service.uploadManualModel(restaurant.id, 1, owner, file);

    expect(glbUpload.validateAndStore).toHaveBeenCalledWith(
      file,
      'model-glb-manual',
    );
    expect(usdz.convert).toHaveBeenCalledWith(file.buffer);
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
    glbUpload.validateAndStore.mockResolvedValueOnce({
      key: 'model-glb-manual/x.glb',
      url: 'http://localhost/api/uploads/model-glb-manual/x.glb',
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
