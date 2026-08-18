import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArViewerService {
  constructor(private readonly prisma: PrismaService) {}

  async findItemByPublicSlug(slug: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { publicSlug: slug },
      include: { restaurant: { select: { name: true } } },
    });
    if (!item) {
      throw new NotFoundException('Dish not found');
    }
    return item;
  }
}
