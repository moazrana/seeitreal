import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootPackagesService } from './root-packages.service';

describe('RootPackagesService', () => {
  let service: RootPackagesService;
  let prisma: {
    subscriptionPackage: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    subscription: { findMany: jest.Mock; count: jest.Mock };
  };
  let audit: { log: jest.Mock };

  const admin = {
    adminId: 1,
    email: 'root@example.com',
    role: RootAdminRole.SUPERADMIN,
  };

  beforeEach(async () => {
    prisma = {
      subscriptionPackage: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      subscription: { findMany: jest.fn(), count: jest.fn() },
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootPackagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RootAuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(RootPackagesService);
  });

  describe('create', () => {
    it('creates a package and audit-logs it', async () => {
      prisma.subscriptionPackage.create.mockResolvedValueOnce({
        id: 1,
        name: 'Starter',
      });

      await service.create(
        {
          name: 'Starter',
          pricePkr: 100000,
          priceUsd: 500,
          interval: 'monthly' as never,
          maxItems: 10,
        },
        admin,
        '1.2.3.4',
      );

      expect(prisma.subscriptionPackage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Starter',
          pricePkr: 100000,
          priceUsd: 500,
          sortOrder: 0,
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'create_package',
        'subscription_package',
        1,
        'Starter',
        '1.2.3.4',
      );
    });
  });

  describe('update', () => {
    it('logs update_package_price when a price field changes', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 1,
        pricePkr: 100000,
        priceUsd: 500,
      });
      prisma.subscriptionPackage.update.mockResolvedValueOnce({ id: 1 });

      await service.update(1, { pricePkr: 150000 }, admin, undefined);

      expect(audit.log).toHaveBeenCalledWith(
        1,
        'update_package_price',
        'subscription_package',
        1,
        expect.any(String),
        undefined,
      );
    });

    it('logs a plain update_package when no price field changes', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 1,
        pricePkr: 100000,
        priceUsd: 500,
      });
      prisma.subscriptionPackage.update.mockResolvedValueOnce({ id: 1 });

      await service.update(1, { name: 'Renamed' }, admin, undefined);

      expect(audit.log).toHaveBeenCalledWith(
        1,
        'update_package',
        'subscription_package',
        1,
        expect.any(String),
        undefined,
      );
    });
  });

  describe('retire / activate', () => {
    it('retires an active package', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      prisma.subscriptionPackage.update.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });

      await service.retire(1, admin, undefined);

      expect(prisma.subscriptionPackage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
    });

    it('refuses to retire an already-retired package', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });

      await expect(service.retire(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to activate an already-active package', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });

      await expect(
        service.activate(1, admin, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws 404 for a non-existent package', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.remove(999, admin, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to hard-delete a package with subscribers', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({ id: 1 });
      prisma.subscription.count.mockResolvedValueOnce(3);

      await expect(service.remove(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.subscriptionPackage.delete).not.toHaveBeenCalled();
    });

    it('hard-deletes a package with no subscribers', async () => {
      prisma.subscriptionPackage.findUnique.mockResolvedValueOnce({ id: 1 });
      prisma.subscription.count.mockResolvedValueOnce(0);

      await service.remove(1, admin, '1.2.3.4');

      expect(prisma.subscriptionPackage.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'delete_package',
        'subscription_package',
        1,
        undefined,
        '1.2.3.4',
      );
    });
  });
});
