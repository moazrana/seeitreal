import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { MenuCategoriesService } from './menu-categories.service';

describe('MenuCategoriesService — duplicate cuisine types (mango points 2)', () => {
  let service: MenuCategoriesService;
  let prisma: {
    menuCategory: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  const owner = { userId: 1, email: 'o@example.com', role: UserRole.OWNER };

  beforeEach(async () => {
    prisma = {
      menuCategory: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MenuCategoriesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RestaurantsService,
          useValue: {
            assertOwnership: jest.fn().mockResolvedValue({ id: 10 }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MenuCategoriesService);
  });

  it('rejects a cuisine type name that already exists in the restaurant', async () => {
    prisma.menuCategory.findFirst.mockResolvedValueOnce({ id: 4 });

    await expect(
      service.create(10, owner, { name: 'BBQ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.menuCategory.create).not.toHaveBeenCalled();
  });

  it('maps a unique-index violation (two requests racing past the check) to a 409', async () => {
    prisma.menuCategory.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(10, owner, { name: 'BBQ' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a new, unique cuisine type', async () => {
    prisma.menuCategory.create.mockResolvedValueOnce({ id: 9, name: 'Karahi' });

    await expect(
      service.create(10, owner, { name: 'Karahi' }),
    ).resolves.toEqual({ id: 9, name: 'Karahi' });
  });

  it('excludes the category itself when checking a rename', async () => {
    prisma.menuCategory.findUnique.mockResolvedValueOnce({
      id: 4,
      restaurantId: 10,
    });
    prisma.menuCategory.update.mockResolvedValueOnce({ id: 4 });

    await service.update(10, 4, owner, { name: 'BBQ' });

    expect(prisma.menuCategory.findFirst).toHaveBeenCalledWith({
      where: { restaurantId: 10, name: 'BBQ', NOT: { id: 4 } },
      select: { id: true },
    });
  });
});
