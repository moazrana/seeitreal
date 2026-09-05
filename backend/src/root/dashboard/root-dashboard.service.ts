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
      subscriptionsByPlanRaw,
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
        by: ['plan'],
        where: { status: 'active' },
        _count: { _all: true },
      }),
    ]);

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
      subscriptionsByPlan: Object.fromEntries(
        subscriptionsByPlanRaw.map((r) => [r.plan, r._count._all]),
      ),
      // Plan pricing doesn't exist yet (rootApp spec's "Pricing management"
      // is deferred) — never fabricate a revenue figure. The dashboard UI
      // shows this as "not configured yet" rather than a dollar amount.
      mrr: null,
    };
  }
}
