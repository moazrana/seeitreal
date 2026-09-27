import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ArStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

/** The same visitor re-opening a dish within this window counts once, so
 * refreshes, link-preview bots and back-and-forth don't inflate scans. */
export const SCAN_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const TOP_DISHES_PER_RESTAURANT = 3;

export interface RestaurantOverview {
  id: number;
  name: string;
  slug: string;
  dishes: number;
  /** Per AR status: pending (no model yet), generating, qa (in review), live. */
  statusCounts: Record<ArStatus, number>;
  scans: number;
  topDishes: { name: string; publicSlug: string; scans: number }[];
}

export interface DashboardOverview {
  totals: {
    restaurants: number;
    dishes: number;
    live: number;
    inReview: number;
    scans: number;
  };
  restaurants: RestaurantOverview[];
}

/**
 * Diner scan analytics (spec §4.8, §5 AnalyticsEvent). Privacy by design
 * (spec §7.7): the raw IP is never stored — only an HMAC-SHA256 of it keyed
 * with IP_HASH_SALT, used solely to de-duplicate repeat opens. Without the
 * key the hash can't be reversed by brute-forcing the IPv4 space.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Records one scan (an open of a dish's public AR page — the URL its QR
   * code encodes). Never throws: analytics must not break the diner page.
   */
  async recordScan(
    restaurantId: number,
    itemId: number,
    ip: string | undefined,
  ): Promise<void> {
    try {
      const ipHash = this.hashIp(ip ?? 'unknown');
      const recent = await this.prisma.analyticsEvent.findFirst({
        where: {
          targetType: 'item',
          targetId: itemId,
          eventType: 'scan',
          ipHash,
          createdAt: { gte: new Date(Date.now() - SCAN_DEDUPE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
      await this.prisma.analyticsEvent.create({
        data: {
          restaurantId,
          targetType: 'item',
          targetId: itemId,
          eventType: 'scan',
          ipHash,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record scan for item ${itemId}: ${String(err)}`,
      );
    }
  }

  /** Scan count per dish of one restaurant (owner/admin only). */
  async itemScanCounts(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const groups = await this.prisma.analyticsEvent.groupBy({
      by: ['targetId'],
      where: { restaurantId, targetType: 'item', eventType: 'scan' },
      _count: { _all: true },
    });
    return groups.map((g) => ({ itemId: g.targetId, scans: g._count._all }));
  }

  /** The signed-in user's dashboard: their restaurants with dish, status
   * and scan counts. Aggregated in the DB (groupBy), never per-row. */
  async overview(user: AuthenticatedUser): Promise<DashboardOverview> {
    const restaurants = await this.restaurants.findAllForUser(user);
    const ids = restaurants.map((r) => r.id);

    const [statusGroups, scanGroups] = ids.length
      ? await Promise.all([
          this.prisma.menuItem.groupBy({
            by: ['restaurantId', 'arStatus'],
            where: { restaurantId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.analyticsEvent.groupBy({
            by: ['restaurantId', 'targetId'],
            where: {
              restaurantId: { in: ids },
              targetType: 'item',
              eventType: 'scan',
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];

    // Top dishes per restaurant, by scans. Names resolved in one query and
    // only for items that still exist (deleted dishes keep their events).
    const scansByItem = new Map(
      scanGroups.map((g) => [g.targetId, g._count._all]),
    );
    const scannedItems = scanGroups.length
      ? await this.prisma.menuItem.findMany({
          where: {
            id: { in: [...scansByItem.keys()] },
            restaurantId: { in: ids },
          },
          select: {
            id: true,
            restaurantId: true,
            name: true,
            publicSlug: true,
          },
        })
      : [];

    const perRestaurant: RestaurantOverview[] = restaurants.map((r) => {
      const statusCounts: Record<ArStatus, number> = {
        pending: 0,
        generating: 0,
        qa: 0,
        live: 0,
      };
      for (const g of statusGroups) {
        if (g.restaurantId === r.id) statusCounts[g.arStatus] = g._count._all;
      }
      const topDishes = scannedItems
        .filter((item) => item.restaurantId === r.id)
        .map((item) => ({
          name: item.name,
          publicSlug: item.publicSlug,
          scans: scansByItem.get(item.id) ?? 0,
        }))
        .sort((a, b) => b.scans - a.scans)
        .slice(0, TOP_DISHES_PER_RESTAURANT);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        dishes: Object.values(statusCounts).reduce((sum, n) => sum + n, 0),
        statusCounts,
        scans: scanGroups
          .filter((g) => g.restaurantId === r.id)
          .reduce((sum, g) => sum + g._count._all, 0),
        topDishes,
      };
    });

    return {
      totals: {
        restaurants: perRestaurant.length,
        dishes: sum(perRestaurant, (r) => r.dishes),
        live: sum(perRestaurant, (r) => r.statusCounts.live),
        inReview: sum(perRestaurant, (r) => r.statusCounts.qa),
        scans: sum(perRestaurant, (r) => r.scans),
      },
      restaurants: perRestaurant,
    };
  }

  private hashIp(ip: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('IP_HASH_SALT'))
      .update(ip)
      .digest('hex');
  }
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
