import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';
import type { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';

@Injectable()
export class RootRestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RootAuditService,
  ) {}

  list(query: ListRestaurantsQueryDto) {
    return this.prisma.restaurant.findMany({
      where: {
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q } },
                { slug: { contains: query.q } },
              ],
            }
          : {}),
        ...(query.status === 'active' ? { suspended: false } : {}),
        ...(query.status === 'suspended' ? { suspended: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true, supportTickets: true } } },
    });
  }

  async detail(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      include: {
        items: { orderBy: { createdAt: 'desc' } },
        _count: { select: { supportTickets: true, feedback: true } },
      },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  async suspend(
    slug: string,
    reason: string,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const restaurant = await this.requireRestaurant(slug);
    if (restaurant.suspended) {
      throw new BadRequestException('Restaurant is already suspended');
    }

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        suspended: true,
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
    });
    await this.audit.log(
      admin.adminId,
      'suspend_restaurant',
      'restaurant',
      restaurant.id,
      reason,
      ip,
    );
    return updated;
  }

  async reactivate(
    slug: string,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const restaurant = await this.requireRestaurant(slug);
    if (!restaurant.suspended) {
      throw new BadRequestException('Restaurant is not suspended');
    }

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { suspended: false, suspendedAt: null, suspendedReason: null },
    });
    await this.audit.log(
      admin.adminId,
      'reactivate_restaurant',
      'restaurant',
      restaurant.id,
      undefined,
      ip,
    );
    return updated;
  }

  async hideItem(
    slug: string,
    itemId: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const item = await this.requireItem(slug, itemId);
    const updated = await this.prisma.menuItem.update({
      where: { id: item.id },
      data: { hiddenByAdmin: true },
    });
    await this.audit.log(
      admin.adminId,
      'hide_item',
      'menu_item',
      itemId,
      undefined,
      ip,
    );
    return updated;
  }

  async unhideItem(
    slug: string,
    itemId: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const item = await this.requireItem(slug, itemId);
    const updated = await this.prisma.menuItem.update({
      where: { id: item.id },
      data: { hiddenByAdmin: false },
    });
    await this.audit.log(
      admin.adminId,
      'unhide_item',
      'menu_item',
      itemId,
      undefined,
      ip,
    );
    return updated;
  }

  private async requireRestaurant(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  private async requireItem(slug: string, itemId: number) {
    const restaurant = await this.requireRestaurant(slug);
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.restaurantId !== restaurant.id) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }
}
