import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import { MenuItemsService } from './menu-items.service';

describe('MenuItemsService', () => {
  let service: MenuItemsService;
  let prisma: {
    menuItem: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    menuCategory: { findUnique: jest.Mock };
  };
  let restaurants: { assertOwnership: jest.Mock };
  let imageUpload: { processAndStore: jest.Mock };

  const owner = { userId: 1, email: 'owner@example.com', role: UserRole.OWNER };
  const restaurant = { id: 10, ownerUserId: 1 };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      menuCategory: { findUnique: jest.fn() },
    };
    restaurants = { assertOwnership: jest.fn().mockResolvedValue(restaurant) };
    imageUpload = { processAndStore: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MenuItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: ImageUploadService, useValue: imageUpload },
      ],
    }).compile();

    service = moduleRef.get(MenuItemsService);
  });

  it('creates an item with a generated public slug after checking ownership', async () => {
    prisma.menuItem.create.mockResolvedValueOnce({ id: 1, name: 'Burger' });

    await service.create(restaurant.id, owner, { name: 'Burger', price: 9.99 });

    expect(restaurants.assertOwnership).toHaveBeenCalledWith(
      restaurant.id,
      owner,
    );
    expect(prisma.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Burger',
          publicSlug: expect.stringMatching(/^burger-[0-9a-f]{8}$/),
        }),
      }),
    );
  });

  it('rejects a categoryId that belongs to a different restaurant', async () => {
    prisma.menuCategory.findUnique.mockResolvedValueOnce({
      id: 5,
      restaurantId: 999,
    });

    await expect(
      service.create(restaurant.id, owner, {
        name: 'Burger',
        price: 9.99,
        categoryId: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the item does not belong to the given restaurant', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: 999,
    });

    await expect(
      service.findOne(restaurant.id, 1, owner),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setPhoto stores the new photo and resets AR status/model fields', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      restaurantId: restaurant.id,
    });
    imageUpload.processAndStore.mockResolvedValueOnce({
      key: 'menu-item-photo/abc.webp',
      url: 'http://localhost:3000/api/uploads/menu-item-photo/abc.webp',
    });
    prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

    const file = { buffer: Buffer.from('fake') } as Express.Multer.File;
    await service.setPhoto(restaurant.id, 1, owner, file);

    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        photoUrl: 'http://localhost:3000/api/uploads/menu-item-photo/abc.webp',
        arStatus: 'pending',
        modelGlbUrl: null,
        modelUsdzUrl: null,
        previewImageUrl: null,
        tripoTaskId: null,
        qaNote: null,
      },
    });
  });
});
