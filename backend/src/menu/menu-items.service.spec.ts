import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      delete: jest.Mock;
    };
    menuItemPhoto: {
      createMany: jest.Mock;
      delete: jest.Mock;
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
        delete: jest.fn(),
      },
      menuItemPhoto: {
        createMany: jest.fn(),
        delete: jest.fn(),
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

    await service.create(restaurant.id, owner, { name: 'Burger' });

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

  describe('addPhotos', () => {
    function makeFile(name: string): Express.Multer.File {
      return { buffer: Buffer.from(name) } as Express.Multer.File;
    }

    it('stores each file independently, sets photoUrl from the first-ever photo, and resets AR status/model fields', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [],
      });
      imageUpload.processAndStore
        .mockResolvedValueOnce({ url: 'http://localhost/api/uploads/a.webp' })
        .mockResolvedValueOnce({ url: 'http://localhost/api/uploads/b.webp' });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.addPhotos(restaurant.id, 1, owner, [
        makeFile('a'),
        makeFile('b'),
      ]);

      expect(imageUpload.processAndStore).toHaveBeenCalledTimes(2);
      expect(prisma.menuItemPhoto.createMany).toHaveBeenCalledWith({
        data: [
          {
            menuItemId: 1,
            url: 'http://localhost/api/uploads/a.webp',
            sortOrder: 0,
          },
          {
            menuItemId: 1,
            url: 'http://localhost/api/uploads/b.webp',
            sortOrder: 1,
          },
        ],
      });
      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            photoUrl: 'http://localhost/api/uploads/a.webp',
            arStatus: 'pending',
            modelGlbUrl: null,
            modelUsdzUrl: null,
            previewImageUrl: null,
            tripoTaskId: null,
            qaNote: null,
          }),
        }),
      );
    });

    it('does not overwrite the display photoUrl when photos already exist', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [{ id: 1, sortOrder: 0, url: 'existing.webp' }],
      });
      imageUpload.processAndStore.mockResolvedValueOnce({ url: 'new.webp' });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.addPhotos(restaurant.id, 1, owner, [makeFile('c')]);

      const call = prisma.menuItem.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data).not.toHaveProperty('photoUrl');
      expect(prisma.menuItemPhoto.createMany).toHaveBeenCalledWith({
        data: [{ menuItemId: 1, url: 'new.webp', sortOrder: 1 }],
      });
    });

    it('rejects a batch that would push the item past the 5-photo cap', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [1, 2, 3, 4].map((n) => ({
          id: n,
          sortOrder: n - 1,
          url: `p${n}`,
        })),
      });

      await expect(
        service.addPhotos(restaurant.id, 1, owner, [
          makeFile('a'),
          makeFile('b'),
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imageUpload.processAndStore).not.toHaveBeenCalled();
    });

    it('rejects if any single file fails the upload security checks (bubbles the underlying rejection)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [],
      });
      imageUpload.processAndStore.mockRejectedValueOnce(
        new BadRequestException('not a real image'),
      );

      await expect(
        service.addPhotos(restaurant.id, 1, owner, [makeFile('bad')]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s when the item belongs to a different restaurant (no cross-tenant leak)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: 999,
        photos: [],
      });

      await expect(
        service.addPhotos(restaurant.id, 1, owner, [makeFile('a')]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removePhoto', () => {
    it('deletes the photo, renumbers the rest, and promotes the new first photo', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [
          { id: 10, sortOrder: 0, url: 'p0.webp' },
          { id: 11, sortOrder: 1, url: 'p1.webp' },
          { id: 12, sortOrder: 2, url: 'p2.webp' },
        ],
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.removePhoto(restaurant.id, 1, 10, owner);

      expect(prisma.menuItemPhoto.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      // p1 (sortOrder 1) moves to 0, p2 (sortOrder 2) moves to 1.
      expect(prisma.menuItemPhoto.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { sortOrder: 0 },
      });
      expect(prisma.menuItemPhoto.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { sortOrder: 1 },
      });
      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ photoUrl: 'p1.webp' }),
        }),
      );
    });

    it('clears photoUrl when the last photo is removed', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [{ id: 10, sortOrder: 0, url: 'p0.webp' }],
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1 });

      await service.removePhoto(restaurant.id, 1, 10, owner);

      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ photoUrl: null }),
        }),
      );
    });

    it('404s when the photo does not belong to this item', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        restaurantId: restaurant.id,
        photos: [{ id: 10, sortOrder: 0, url: 'p0.webp' }],
      });

      await expect(
        service.removePhoto(restaurant.id, 1, 999, owner),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.menuItemPhoto.delete).not.toHaveBeenCalled();
    });
  });
});
