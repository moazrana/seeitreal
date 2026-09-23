import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootPromoCodesService } from './root-promo-codes.service';

describe('RootPromoCodesService', () => {
  let service: RootPromoCodesService;
  let prisma: {
    promoCode: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  const admin = {
    adminId: 1,
    email: 'root@example.com',
    role: RootAdminRole.SUPERADMIN,
  };

  beforeEach(async () => {
    prisma = {
      promoCode: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootPromoCodesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RootAuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(RootPromoCodesService);
  });

  describe('create', () => {
    it('upper-cases the code before persisting', async () => {
      prisma.promoCode.create.mockResolvedValueOnce({ id: 1, code: 'SAVE10' });

      await service.create(
        {
          code: 'save10',
          discountType: 'percent' as never,
          amount: 10,
          appliesTo: 'subscription' as never,
        },
        admin,
        undefined,
      );

      expect(prisma.promoCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'SAVE10', currency: null }),
      });
    });

    it('rejects a percent discount over 100', async () => {
      await expect(
        service.create(
          {
            code: 'TOO-BIG',
            discountType: 'percent' as never,
            amount: 150,
            appliesTo: 'subscription' as never,
          },
          admin,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.promoCode.create).not.toHaveBeenCalled();
    });

    it('rejects a fixed discount with no currency', async () => {
      await expect(
        service.create(
          {
            code: 'FIXED10',
            discountType: 'fixed' as never,
            amount: 500,
            appliesTo: 'subscription' as never,
          },
          admin,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects endsAt before startsAt', async () => {
      await expect(
        service.create(
          {
            code: 'BADWINDOW',
            discountType: 'percent' as never,
            amount: 10,
            appliesTo: 'subscription' as never,
            startsAt: '2026-06-01T00:00:00.000Z',
            endsAt: '2026-05-01T00:00:00.000Z',
          },
          admin,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a duplicate code into a 409', async () => {
      prisma.promoCode.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Duplicate', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );

      await expect(
        service.create(
          {
            code: 'DUPE',
            discountType: 'percent' as never,
            amount: 10,
            appliesTo: 'subscription' as never,
          },
          admin,
          undefined,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('activate / deactivate', () => {
    it('deactivates an active code', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: true,
      });
      prisma.promoCode.update.mockResolvedValueOnce({ id: 1, isActive: false });

      await service.deactivate(1, admin, '1.2.3.4');

      expect(prisma.promoCode.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'deactivate_promo_code',
        'promo_code',
        1,
        undefined,
        '1.2.3.4',
      );
    });

    it('refuses to deactivate an already-inactive code', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 1,
        isActive: false,
      });

      await expect(
        service.deactivate(1, admin, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws 404 for a non-existent code', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.remove(999, admin, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to delete a code with redemption history', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 1,
        timesRedeemed: 4,
      });

      await expect(service.remove(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.promoCode.delete).not.toHaveBeenCalled();
    });

    it('deletes a never-redeemed code', async () => {
      prisma.promoCode.findUnique.mockResolvedValueOnce({
        id: 1,
        timesRedeemed: 0,
      });

      await service.remove(1, admin, '1.2.3.4');

      expect(prisma.promoCode.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(audit.log).toHaveBeenCalledWith(
        1,
        'delete_promo_code',
        'promo_code',
        1,
        undefined,
        '1.2.3.4',
      );
    });
  });
});
