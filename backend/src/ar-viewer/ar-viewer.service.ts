import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArViewerService {
  constructor(private readonly prisma: PrismaService) {}

  async findItemByPublicSlug(slug: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { publicSlug: slug },
      include: { restaurant: { select: { name: true, suspended: true } } },
    });
    // Never reveal a suspended restaurant's items or an admin-hidden item
    // publicly (rootApp/ROOT-APP-Implementation-Spec.md §3.2, §3.3) — same
    // generic 404 as "doesn't exist", so this can't be distinguished from
    // a genuinely missing dish.
    if (!item || item.restaurant.suspended || item.hiddenByAdmin) {
      throw new NotFoundException('Dish not found');
    }
    return item;
  }
}
