import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    analyticsEvent: {
      findFirst: jest.Mock;
      create: jest.Mock;
      groupBy: jest.Mock;
    };
    menuItem: { groupBy: jest.Mock; findMany: jest.Mock };
  };
  let restaurants: { assertOwnership: jest.Mock; findAllForUser: jest.Mock };
  const owner = { userId: 1, email: 'o@example.com', role: UserRole.OWNER };

  beforeEach(async () => {
    prisma = {
      analyticsEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      menuItem: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    restaurants = {
      assertOwnership: jest.fn().mockResolvedValue({ id: 10 }),
      findAllForUser: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RestaurantsService, useValue: restaurants },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-salt-at-least-16-chars' },
        },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  describe('recordScan', () => {
    it('stores a keyed hash of the IP, never the raw IP', async () => {
      await service.recordScan(10, 42, '203.0.113.7');

      const { data } = (
        prisma.analyticsEvent.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ]
      )[0];
      expect(data).toMatchObject({
        restaurantId: 10,
        targetType: 'item',
        targetId: 42,
        eventType: 'scan',
      });
      expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(data)).not.toContain('203.0.113.7');
    });

    it('counts a repeat open by the same visitor within the window only once', async () => {
      prisma.analyticsEvent.findFirst.mockResolvedValueOnce({ id: 1 });

      await service.recordScan(10, 42, '203.0.113.7');

      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });

    it('hashes the same IP identically (needed for de-duplication) and different IPs differently', async () => {
      await service.recordScan(10, 42, '203.0.113.7');
      await service.recordScan(10, 42, '203.0.113.7');
      await service.recordScan(10, 42, '198.51.100.1');
      const hashes = prisma.analyticsEvent.create.mock.calls.map(
        (call) => (call as [{ data: { ipHash: string } }])[0].data.ipHash,
      );
      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[0]).not.toBe(hashes[2]);
    });

    it('never throws — a failing DB write must not break the diner page', async () => {
      prisma.analyticsEvent.create.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.recordScan(10, 42, '203.0.113.7'),
      ).resolves.toBeUndefined();
    });
  });

  it('enforces restaurant ownership for per-dish scan counts', async () => {
    restaurants.assertOwnership.mockRejectedValueOnce(new NotFoundException());

    await expect(service.itemScanCounts(99, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.analyticsEvent.groupBy).not.toHaveBeenCalled();
  });

  it('builds the dashboard overview: per-restaurant status counts, scans, top dishes, and totals', async () => {
    restaurants.findAllForUser.mockResolvedValueOnce([
      { id: 1, name: 'Karachi Grill', slug: 'karachi-grill' },
      { id: 2, name: 'Lahore Bites', slug: 'lahore-bites' },
    ]);
    prisma.menuItem.groupBy.mockResolvedValueOnce([
      { restaurantId: 1, arStatus: 'live', _count: { _all: 3 } },
      { restaurantId: 1, arStatus: 'qa', _count: { _all: 2 } },
      { restaurantId: 2, arStatus: 'pending', _count: { _all: 4 } },
    ]);
    prisma.analyticsEvent.groupBy.mockResolvedValueOnce([
      { restaurantId: 1, targetId: 11, _count: { _all: 9 } },
      { restaurantId: 1, targetId: 12, _count: { _all: 20 } },
    ]);
    prisma.menuItem.findMany.mockResolvedValueOnce([
      { id: 11, restaurantId: 1, name: 'Seekh Kabab', publicSlug: 'seekh' },
      { id: 12, restaurantId: 1, name: 'Karahi', publicSlug: 'karahi' },
    ]);

    const result = await service.overview(owner);

    expect(restaurants.findAllForUser).toHaveBeenCalledWith(owner);
    expect(result.totals).toEqual({
      restaurants: 2,
      dishes: 9,
      live: 3,
      inReview: 2,
      scans: 29,
    });
    expect(result.restaurants[0]).toMatchObject({
      dishes: 5,
      statusCounts: { pending: 0, generating: 0, qa: 2, live: 3 },
      scans: 29,
      topDishes: [
        { name: 'Karahi', publicSlug: 'karahi', scans: 20 },
        { name: 'Seekh Kabab', publicSlug: 'seekh', scans: 9 },
      ],
    });
    expect(result.restaurants[1]).toMatchObject({
      dishes: 4,
      scans: 0,
      topDishes: [],
    });
  });

  it('returns an empty overview without querying when the user has no restaurants', async () => {
    const result = await service.overview(owner);

    expect(result.totals.restaurants).toBe(0);
    expect(prisma.menuItem.groupBy).not.toHaveBeenCalled();
  });
});
