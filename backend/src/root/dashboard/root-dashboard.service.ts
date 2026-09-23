import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RootDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const [
      totalRestaurants,
      activeRestaurants,
      itemsByStatusRaw,
      qaQueueSize,
      openTickets,
      unreviewedFeedback,
      subscriptionsByPackageRaw,
    ] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.restaurant.count({ where: { suspended: false } }),
      this.prisma.menuItem.groupBy({
        by: ['arStatus'],
        _count: { _all: true },
      }),
      this.prisma.menuItem.count({ where: { arStatus: 'qa' } }),
      this.prisma.supportTicket.count({ where: { status: 'open' } }),
      this.prisma.feedback.count({ where: { status: 'new' } }),
      this.prisma.subscription.groupBy({
        by: ['packageId'],
        where: { status: 'active' },
        _count: { _all: true },
      }),
    ]);

    const packages = await this.prisma.subscriptionPackage.findMany({
      where: { id: { in: subscriptionsByPackageRaw.map((r) => r.packageId) } },
      select: { id: true, name: true },
    });
    const packageNameById = new Map(packages.map((p) => [p.id, p.name]));

    return {
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        suspended: totalRestaurants - activeRestaurants,
      },
      itemsByStatus: Object.fromEntries(
        itemsByStatusRaw.map((r) => [r.arStatus, r._count._all]),
      ),
      qaQueueSize,
      support: { openTickets },
      feedback: { unreviewed: unreviewedFeedback },
      subscriptionsByPackage: Object.fromEntries(
        subscriptionsByPackageRaw.map((r) => [
          packageNameById.get(r.packageId) ?? `#${r.packageId}`,
          r._count._all,
        ]),
      ),
      // Revenue reporting isn't built yet — never fabricate a figure. The
      // dashboard UI shows this as "not configured yet" rather than a number.
      mrr: null,
    };
  }
}
