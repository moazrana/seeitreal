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

  async detail(id: number) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
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
    id: number,
    reason: string,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const restaurant = await this.requireRestaurant(id);
    if (restaurant.suspended) {
      throw new BadRequestException('Restaurant is already suspended');
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
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
      id,
      reason,
      ip,
    );
    return updated;
  }

  async reactivate(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const restaurant = await this.requireRestaurant(id);
    if (!restaurant.suspended) {
      throw new BadRequestException('Restaurant is not suspended');
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: { suspended: false, suspendedAt: null, suspendedReason: null },
    });
    await this.audit.log(
      admin.adminId,
      'reactivate_restaurant',
      'restaurant',
      id,
      undefined,
      ip,
    );
    return updated;
  }

  async hideItem(
    restaurantId: number,
    itemId: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const item = await this.requireItem(restaurantId, itemId);
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
    restaurantId: number,
    itemId: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const item = await this.requireItem(restaurantId, itemId);
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

  private async requireRestaurant(id: number) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  private async requireItem(restaurantId: number, itemId: number) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }
}
