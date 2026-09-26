import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Same rule as CreateRestaurantDto.slug and generatePublicSlug output
// (spec §7.2: slugs match ^[a-z0-9-]+$), capped at the column width.
const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;

/**
 * Resolves a `:restaurantSlug` route param to the restaurant's internal id
 * so URLs never expose sequential ids. Resolution only — ownership is still
 * enforced by RestaurantsService.assertOwnership in the service layer, which
 * returns the same 404 for "doesn't exist" and "not yours" (spec §7.3).
 */
@Injectable()
export class RestaurantSlugToIdPipe implements PipeTransform<
  string,
  Promise<number>
> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(slug: string): Promise<number> {
    if (!SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Restaurant not found');
    }
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant.id;
  }
}

/**
 * Resolves a `:itemSlug` route param (MenuItem.publicSlug, globally unique)
 * to the item's internal id. The services still verify the item belongs to
 * the restaurant in the same path before touching it.
 */
@Injectable()
export class ItemSlugToIdPipe implements PipeTransform<
  string,
  Promise<number>
> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(slug: string): Promise<number> {
    if (!SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Item not found');
    }
    const item = await this.prisma.menuItem.findUnique({
      where: { publicSlug: slug },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item.id;
  }
}
