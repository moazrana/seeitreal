import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MAX_RESTAURANTS_PER_OWNER, UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import { RestaurantsService } from './restaurants.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let imageUpload: { processAndStore: jest.Mock };
  let prisma: {
    restaurant: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
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
    suspended: false,
  };

  beforeEach(async () => {
    prisma = {
      restaurant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
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
      address: '123 Main St',
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
      service.create(owner, {
        name: 'Dup',
        slug: 'pizza-place',
        address: '123 Main St',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.restaurant.create).not.toHaveBeenCalled();
  });

  it('lets an owner create additional restaurants (multi-restaurant accounts)', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(null);
    prisma.restaurant.count.mockResolvedValueOnce(3);
    prisma.restaurant.create.mockResolvedValueOnce({ ...restaurant, id: 11 });

    await expect(
      service.create(owner, {
        name: 'Second Place',
        slug: 'second-place',
        address: '456 Side St',
      }),
    ).resolves.toMatchObject({ id: 11 });
  });

  it('rejects creation once an owner reaches the per-account cap (abuse guard)', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce(null);
    prisma.restaurant.count.mockResolvedValueOnce(MAX_RESTAURANTS_PER_OWNER);

    await expect(
      service.create(owner, {
        name: 'One Too Many',
        slug: 'one-too-many',
        address: '456 Side St',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.restaurant.create).not.toHaveBeenCalled();
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

  it('blocks the owner of a suspended restaurant with 403, not 404 (rootApp restaurant control)', async () => {
    prisma.restaurant.findUnique.mockResolvedValueOnce({
      ...restaurant,
      suspended: true,
    });

    await expect(
      service.assertOwnership(restaurant.id, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a legacy UserRole.ADMIN caller bypass suspension too, same as ownership', async () => {
    const admin = {
      userId: 99,
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    };
    prisma.restaurant.findUnique.mockResolvedValueOnce({
      ...restaurant,
      suspended: true,
    });

    await expect(
      service.assertOwnership(restaurant.id, admin),
    ).resolves.toEqual({ ...restaurant, suspended: true });
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
