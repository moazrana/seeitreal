import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootQaService } from './root-qa.service';

describe('RootQaService', () => {
  let service: RootQaService;
  let prisma: {
    menuItem: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };

  const admin = {
    adminId: 99,
    email: 'root@example.com',
    role: RootAdminRole.SUPPORT,
  };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    audit = { log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootQaService,
        { provide: PrismaService, useValue: prisma },
        { provide: RootAuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(RootQaService);
  });

  describe('approve', () => {
    it('refuses to approve an item missing the USDZ file, even if GLB is present', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: null,
      });

      await expect(service.approve(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.menuItem.update).not.toHaveBeenCalled();
    });

    it('refuses to approve an item missing its real-world width', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: 'https://x/model.usdz',
        widthMm: null,
      });

      await expect(service.approve(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to approve an item not in qa status', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'pending',
      });

      await expect(service.approve(1, admin, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('approves and audit-logs when both model files and dimensions are present', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: 'https://x/model.usdz',
        widthMm: 260,
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'live' });

      await service.approve(1, admin, '1.2.3.4');

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { arStatus: 'live', qaNote: null },
      });
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'approve_item',
        'menu_item',
        1,
        undefined,
        '1.2.3.4',
      );
    });

    it('throws 404 for a non-existent item', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.approve(999, admin, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('sends the item back to pending, clears model fields, and records the note', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
      });
      prisma.menuItem.update.mockResolvedValueOnce({
        id: 1,
        arStatus: 'pending',
      });

      await service.reject(1, 'Model looks distorted', admin, '1.2.3.4');

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          arStatus: 'pending',
          qaNote: 'Model looks distorted',
          modelGlbUrl: null,
          modelUsdzUrl: null,
          previewImageUrl: null,
          tripoTaskId: null,
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'reject_item',
        'menu_item',
        1,
        'Model looks distorted',
        '1.2.3.4',
      );
    });
  });
});
