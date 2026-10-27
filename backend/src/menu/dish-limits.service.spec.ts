import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { DishLimitsService } from './dish-limits.service';

const DAY_MS = 86_400_000;

function sub(
  status: SubscriptionStatus,
  maxItems: number | null,
  periodEndOffsetMs = DAY_MS,
) {
  return {
    status,
    currentPeriodEnd: new Date(Date.now() + periodEndOffsetMs),
    package: { name: 'Growth', maxItems },
  };
}

describe('DishLimitsService', () => {
  let prisma: {
    restaurant: { findMany: jest.Mock };
    menuItem: { count: jest.Mock };
  };
  let env: Record<string, string | undefined>;
  let service: DishLimitsService;

  beforeEach(() => {
    prisma = {
      restaurant: { findMany: jest.fn() },
      menuItem: { count: jest.fn().mockResolvedValue(0) },
    };
    env = {};
    service = new DishLimitsService(
      prisma as unknown as PrismaService,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );
  });

  const allowance = (restaurantId = 1) =>
    service.allowanceFor(prisma as unknown as PrismaService, restaurantId, 99);

  it("uses the package's maxItems and counts only this restaurant", async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [sub(SubscriptionStatus.active, 30)] },
    ]);
    prisma.menuItem.count.mockResolvedValueOnce(12);

    await expect(allowance()).resolves.toEqual({
      plan: 'package',
      packageName: 'Growth',
      maxItems: 30,
      used: 12,
    });
    expect(prisma.menuItem.count).toHaveBeenCalledWith({
      where: { restaurantId: 1 },
    });
  });

  it('keeps the package limit during the past_due grace period', async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [sub(SubscriptionStatus.past_due, 30)] },
    ]);
    await expect(allowance()).resolves.toMatchObject({ plan: 'package' });
  });

  it('keeps a cancelled package until its paid period ends', async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [sub(SubscriptionStatus.canceled, 30)] },
    ]);
    await expect(allowance()).resolves.toMatchObject({ plan: 'package' });
  });

  it('falls back to the trial once a cancelled period has ended', async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      {
        id: 1,
        subscriptions: [sub(SubscriptionStatus.canceled, 30, -DAY_MS)],
      },
    ]);
    await expect(allowance()).resolves.toMatchObject({
      plan: 'trial',
      maxItems: 5,
    });
  });

  it('treats an expired subscription as the trial', async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [sub(SubscriptionStatus.expired, 30)] },
    ]);
    await expect(allowance()).resolves.toMatchObject({ plan: 'trial' });
  });

  it("shares the trial allowance across all of an owner's trial restaurants", async () => {
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [] },
      { id: 2, subscriptions: [] },
      { id: 3, subscriptions: [sub(SubscriptionStatus.active, 75)] },
    ]);
    prisma.menuItem.count.mockResolvedValueOnce(4);

    await expect(allowance(2)).resolves.toEqual({
      plan: 'trial',
      packageName: null,
      maxItems: 5,
      used: 4,
    });
    // The paid restaurant's dishes don't eat into the trial.
    expect(prisma.menuItem.count).toHaveBeenCalledWith({
      where: { restaurantId: { in: [1, 2] } },
    });
  });

  it('lets TRIAL_MAX_DISHES override the trial default', async () => {
    env.TRIAL_MAX_DISHES = '8';
    prisma.restaurant.findMany.mockResolvedValueOnce([
      { id: 1, subscriptions: [] },
    ]);
    await expect(allowance()).resolves.toMatchObject({ maxItems: 8 });
  });

  describe('assertRoomForOneMore', () => {
    it('passes under the limit and when unlimited', () => {
      expect(() =>
        service.assertRoomForOneMore({
          plan: 'trial',
          packageName: null,
          maxItems: 5,
          used: 4,
        }),
      ).not.toThrow();
      expect(() =>
        service.assertRoomForOneMore({
          plan: 'package',
          packageName: 'Pro',
          maxItems: null,
          used: 1000,
        }),
      ).not.toThrow();
    });

    it('throws a 403 with a machine-readable code at the limit', () => {
      expect(() =>
        service.assertRoomForOneMore({
          plan: 'package',
          packageName: 'Starter',
          maxItems: 10,
          used: 10,
        }),
      ).toThrow(ForbiddenException);
    });
  });
});
