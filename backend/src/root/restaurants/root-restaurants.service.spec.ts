import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootRestaurantsService } from './root-restaurants.service';

describe('RootRestaurantsService', () => {
  let service: RootRestaurantsService;
  let prisma: {
    restaurant: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    menuItem: { findUnique: jest.Mock; update: jest.Mock };
  };
  let audit: { log: jest.Mock };

  const admin = {
    adminId: 1,
    email: 'root@example.com',
    role: RootAdminRole.SUPERADMIN,
  };

  beforeEach(async () => {
    prisma = {
      restaurant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      menuItem: { findUnique: jest.fn(), update: jest.fn() },
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootRestaurantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RootAuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(RootRestaurantsService);
  });

  describe('list', () => {
    it('filters by search text and status', async () => {
      prisma.restaurant.findMany.mockResolvedValueOnce([]);

      await service.list({ q: 'pizza', status: 'active' });

      expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'pizza' } },
              { slug: { contains: 'pizza' } },
            ],
            suspended: false,
          }),
        }),
      );
    });
  });

  describe('suspend', () => {
    it('suspends a restaurant and audit-logs the action', async () => {
      prisma.restaurant.findUnique.mockResolvedValueOnce({
        id: 10,
        suspended: false,
      });
      prisma.restaurant.update.mockResolvedValueOnce({
        id: 10,
        suspended: true,
      });

      await service.suspend(10, 'Non-payment', admin, '1.2.3.4');

      expect(prisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          suspended: true,
          suspendedReason: 'Non-payment',
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'suspend_restaurant',
        'restaurant',
        10,
        'Non-payment',
        '1.2.3.4',
      );
    });

    it('refuses to suspend an already-suspended restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValueOnce({
        id: 10,
        suspended: true,
      });

      await expect(
        service.suspend(10, 'reason', admin, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a non-existent restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.suspend(999, 'reason', admin, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('reactivates a suspended restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValueOnce({
        id: 10,
        suspended: true,
      });
      prisma.restaurant.update.mockResolvedValueOnce({
        id: 10,
        suspended: false,
      });

      await service.reactivate(10, admin, '1.2.3.4');

      expect(prisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { suspended: false, suspendedAt: null, suspendedReason: null },
      });
    });

    it('refuses to reactivate a restaurant that is not suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValueOnce({
        id: 10,
        suspended: false,
      });

      await expect(
        service.reactivate(10, admin, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('hideItem / unhideItem', () => {
    it('hides an item belonging to the given restaurant', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 5,
        restaurantId: 10,
      });
      prisma.menuItem.update.mockResolvedValueOnce({
        id: 5,
        hiddenByAdmin: true,
      });

      await service.hideItem(10, 5, admin, '1.2.3.4');

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { hiddenByAdmin: true },
      });
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'hide_item',
        'menu_item',
        5,
        undefined,
        '1.2.3.4',
      );
    });

    it('404s when the item belongs to a different restaurant (cross-tenant guard)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 5,
        restaurantId: 999,
      });

      await expect(
        service.hideItem(10, 5, admin, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.menuItem.update).not.toHaveBeenCalled();
    });

    it('unhides an item', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 5,
        restaurantId: 10,
      });
      prisma.menuItem.update.mockResolvedValueOnce({
        id: 5,
        hiddenByAdmin: false,
      });

      await service.unhideItem(10, 5, admin, undefined);

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { hiddenByAdmin: false },
      });
    });
  });
});
