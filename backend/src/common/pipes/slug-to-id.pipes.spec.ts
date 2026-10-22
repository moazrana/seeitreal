import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { ItemSlugToIdPipe, RestaurantSlugToIdPipe } from './slug-to-id.pipes';

describe('slug-to-id pipes', () => {
  const restaurantFindUnique = jest.fn();
  const itemFindUnique = jest.fn();
  const prisma = {
    restaurant: { findUnique: restaurantFindUnique },
    menuItem: { findUnique: itemFindUnique },
  } as unknown as PrismaService;

  beforeEach(() => jest.resetAllMocks());

  describe('RestaurantSlugToIdPipe', () => {
    const pipe = new RestaurantSlugToIdPipe(prisma);

    it('resolves a slug to the restaurant id', async () => {
      restaurantFindUnique.mockResolvedValue({ id: 7 });
      await expect(pipe.transform('joes-grill')).resolves.toBe(7);
      expect(restaurantFindUnique).toHaveBeenCalledWith({
        where: { slug: 'joes-grill' },
        select: { id: true },
      });
    });

    it('404s an unknown slug', async () => {
      restaurantFindUnique.mockResolvedValue(null);
      await expect(pipe.transform('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each(['Joes-Grill', '../etc', 'a b', '', 'x'.repeat(201)])(
      'rejects malformed slug %p without querying the DB',
      async (slug) => {
        await expect(pipe.transform(slug)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(restaurantFindUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('ItemSlugToIdPipe', () => {
    const pipe = new ItemSlugToIdPipe(prisma);

    it('resolves a public slug to the item id', async () => {
      itemFindUnique.mockResolvedValue({ id: 3 });
      await expect(pipe.transform('burger-1a2b3c4d')).resolves.toBe(3);
      expect(itemFindUnique).toHaveBeenCalledWith({
        where: { publicSlug: 'burger-1a2b3c4d' },
        select: { id: true },
      });
    });

    it('404s an unknown or malformed slug', async () => {
      itemFindUnique.mockResolvedValue(null);
      await expect(pipe.transform('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(pipe.transform('3')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
