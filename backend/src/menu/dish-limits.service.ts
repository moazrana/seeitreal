import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { TRIAL_MAX_DISHES } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';

export const DISH_LIMIT_REACHED = 'DISH_LIMIT_REACHED';

/** How many dishes a restaurant may hold right now, and how many count
 * against that. `maxItems: null` means unlimited. */
export interface DishAllowance {
  plan: 'trial' | 'package';
  packageName: string | null;
  maxItems: number | null;
  used: number;
}

type Db = Prisma.TransactionClient | PrismaService;

interface LatestSubscription {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  package: { name: string; maxItems: number | null };
}

/**
 * Dish limits per plan. A restaurant on a paid package gets that package's
 * `maxItems` (read from the package row the Root App manages). Every other
 * restaurant is on the free trial, and the trial allowance is shared by all
 * of an owner's trial restaurants — otherwise an owner could open many
 * restaurants (up to MAX_RESTAURANTS_PER_OWNER) and get 5 free dishes in
 * each.
 */
@Injectable()
export class DishLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Serializes dish creation for one owner: two concurrent "add dish"
   * requests both seeing count = limit - 1 and both inserting is exactly
   * the race this prevents. Must run inside an interactive transaction;
   * the row lock is held until it commits. The query is a tagged template,
   * so `ownerUserId` is sent as a bound parameter, never interpolated.
   */
  async lockOwner(tx: Prisma.TransactionClient, ownerUserId: number) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerUserId} FOR UPDATE`;
  }

  async allowanceFor(
    db: Db,
    restaurantId: number,
    ownerUserId: number,
  ): Promise<DishAllowance> {
    const now = new Date();
    const restaurants = await db.restaurant.findMany({
      where: { ownerUserId },
      select: {
        id: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            currentPeriodEnd: true,
            package: { select: { name: true, maxItems: true } },
          },
        },
      },
    });

    const paid = this.paidPackage(
      restaurants.find((r) => r.id === restaurantId)?.subscriptions[0],
      now,
    );
    if (paid) {
      const used = await db.menuItem.count({ where: { restaurantId } });
      return {
        plan: 'package',
        packageName: paid.name,
        maxItems: paid.maxItems,
        used,
      };
    }

    const trialRestaurantIds = restaurants
      .filter((r) => !this.paidPackage(r.subscriptions[0], now))
      .map((r) => r.id);
    const used = await db.menuItem.count({
      where: { restaurantId: { in: trialRestaurantIds } },
    });
    return {
      plan: 'trial',
      packageName: null,
      maxItems: this.trialMaxDishes(),
      used,
    };
  }

  assertRoomForOneMore(allowance: DishAllowance) {
    if (allowance.maxItems === null || allowance.used < allowance.maxItems) {
      return;
    }
    const message =
      allowance.plan === 'trial'
        ? `Your free trial allows up to ${allowance.maxItems} dishes. Choose a plan to add more.`
        : `Your ${allowance.packageName} plan allows up to ${allowance.maxItems} dishes. Upgrade your plan to add more.`;
    throw new ForbiddenException({
      message,
      error: 'Forbidden',
      code: DISH_LIMIT_REACHED,
      plan: allowance.plan,
      maxItems: allowance.maxItems,
    });
  }

  /** The package a restaurant is paying for, or null if it's on the trial.
   * past_due still counts (that's the grace period); a cancelled plan
   * keeps its limit until the period it already paid for ends. */
  private paidPackage(
    subscription: LatestSubscription | undefined,
    now: Date,
  ): LatestSubscription['package'] | null {
    if (!subscription) return null;
    switch (subscription.status) {
      case SubscriptionStatus.active:
      case SubscriptionStatus.past_due:
        return subscription.package;
      case SubscriptionStatus.canceled:
        return subscription.currentPeriodEnd > now
          ? subscription.package
          : null;
      default:
        return null;
    }
  }

  private trialMaxDishes(): number {
    const raw = this.config.get<string>('TRIAL_MAX_DISHES');
    return raw === undefined || raw === '' ? TRIAL_MAX_DISHES : Number(raw);
  }
}
