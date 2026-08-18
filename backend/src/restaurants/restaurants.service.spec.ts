import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import { RestaurantsService } from './restaurants.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let imageUpload: { processAndStore: jest.Mock };
  let prisma: {
    restaurant: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const owner = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };
  const otherOwner = {
    userId: 2,
    email: 'other@example.com',
    role: UserRole.OWNER,
  };
  const restaurant = {
    id: 10,
    ownerUserId: 1,
    name: 'Pizza Place',
    slug: 'pizza-place',
  };

  beforeEach(async () => {
    prisma = {
      restaurant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    imageUpload = { processAndStore: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImageUploadService, useValue: imageUpload },
      ],
    }).compile();

    service = moduleRef.get(RestaurantsService);
  });

  it('creates a restaurant for the caller when the slug is free', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(null);
    prisma.restaurant.create.mockResolvedValueOnce(restaurant);

    const result = await service.create(owner, {
      name: 'Pizza Place',
      slug: 'pizza-place',
    });

    expect(result).toEqual(restaurant);
    expect(prisma.restaurant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: owner.userId }),
      }),
    );
  });

  it('rejects creation when the slug is already taken', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(restaurant);

    await expect(
      service.create(owner, { name: 'Dup', slug: 'pizza-place' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the owner access their own restaurant', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(restaurant);

    await expect(
      service.assertOwnership(restaurant.id, owner),
    ).resolves.toEqual(restaurant);
  });

  it("returns 404 (not 403) when another owner requests someone else's restaurant", async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(restaurant);

    await expect(
      service.assertOwnership(restaurant.id, otherOwner),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uploads and stores a new logo after checking ownership', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(restaurant);
    imageUpload.processAndStore.mockResolvedValueOnce({
      key: 'restaurant-logo/abc.webp',
      url: 'http://localhost:3000/api/uploads/restaurant-logo/abc.webp',
    });
    prisma.restaurant.update.mockResolvedValueOnce({
      ...restaurant,
      logoUrl: 'http://...',
    });

    const file = { buffer: Buffer.from('fake') } as Express.Multer.File;
    await service.setLogo(restaurant.id, owner, file);

    expect(imageUpload.processAndStore).toHaveBeenCalledWith(
      file,
      'restaurant-logo',
    );
    expect(prisma.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: restaurant.id },
        data: {
          logoUrl: 'http://localhost:3000/api/uploads/restaurant-logo/abc.webp',
        },
      }),
    );
  });
});
