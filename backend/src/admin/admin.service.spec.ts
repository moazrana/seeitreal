import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    menuItem: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    adminAuditLog: { create: jest.Mock };
  };

  const admin = {
    userId: 99,
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      menuItem: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      adminAuditLog: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  describe('approve', () => {
    it('refuses to approve an item missing the USDZ file, even if GLB is present', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: null,
      });

      await expect(service.approve(1, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.menuItem.update).not.toHaveBeenCalled();
    });

    it('refuses to approve an item not in qa status', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'pending',
      });

      await expect(service.approve(1, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('approves and logs an audit entry when both model files are present', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: 'https://x/model.usdz',
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'live' });

      await service.approve(1, admin);

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { arStatus: 'live', qaNote: null },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: admin.userId,
            action: 'approve_item',
          }),
        }),
      );
    });

    it('throws 404 for a non-existent item', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce(null);

      await expect(service.approve(999, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

      await service.reject(
        1,
        'Model looks distorted, please retake the photo',
        admin,
      );

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          arStatus: 'pending',
          qaNote: 'Model looks distorted, please retake the photo',
          modelGlbUrl: null,
          modelUsdzUrl: null,
          previewImageUrl: null,
          tripoTaskId: null,
        },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'reject_item',
            metadata: expect.any(String) as string,
          }),
        }),
      );
    });
  });
});
