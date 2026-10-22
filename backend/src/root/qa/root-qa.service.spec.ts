import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RootAdminRole } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PreviewLinkService } from '../../preview-link/preview-link.service';
import { RootAuditService } from '../audit/root-audit.service';
import { RootQaService } from './root-qa.service';

// TripoGenerationService pulls in gltf-transform, which Jest can't load
// (see tripo-generation.service.spec.ts); only its class token is needed.
jest.mock('../../tripo/tripo-generation.service', () => ({
  TripoGenerationService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const generationModule = require('../../tripo/tripo-generation.service');
const { TripoGenerationService } =
  generationModule as typeof import('../../tripo/tripo-generation.service');

describe('RootQaService', () => {
  let service: RootQaService;
  let prisma: {
    menuItem: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let previewLinks: { getLive: jest.Mock; create: jest.Mock };
  let generation: { regenerateAsAdmin: jest.Mock };

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
    previewLinks = { getLive: jest.fn(), create: jest.fn() };
    generation = { regenerateAsAdmin: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RootQaService,
        { provide: PrismaService, useValue: prisma },
        { provide: RootAuditService, useValue: audit },
        { provide: PreviewLinkService, useValue: previewLinks },
        { provide: TripoGenerationService, useValue: generation },
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

    it('approves an item without dimensions (they are optional)', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: 'https://x/model.usdz',
        widthMm: null,
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'live' });

      await service.approve(1, admin, undefined);

      expect(prisma.menuItem.update).toHaveBeenCalled();
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
        data: {
          arStatus: 'live',
          qaNote: null,
          qrIssuedAt: expect.any(Date) as Date,
          previewLinkNonce: null,
          previewLinkExpiresAt: null,
        },
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

    it('keeps the original QR issue date when re-approving a regenerated model', async () => {
      const issued = new Date('2026-09-01T00:00:00Z');
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        id: 1,
        arStatus: 'qa',
        modelGlbUrl: 'https://x/model.glb',
        modelUsdzUrl: 'https://x/model.usdz',
        widthMm: 260,
        qrIssuedAt: issued,
      });
      prisma.menuItem.update.mockResolvedValueOnce({ id: 1, arStatus: 'live' });

      await service.approve(1, admin, undefined);

      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ qrIssuedAt: issued }) as object,
        }),
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
          // Inferred from the note: "distorted" is a shape problem.
          qaIssues: 'shape',
          modelGlbUrl: null,
          modelUsdzUrl: null,
          previewImageUrl: null,
          tripoTaskId: null,
          previewLinkNonce: null,
          previewLinkExpiresAt: null,
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

  describe('preview links', () => {
    it('creates a link and audit-logs who created it', async () => {
      const link = {
        url: 'https://api.example/api/m/dish?preview=t',
        expiresAt: '2026-10-10T09:00:00.000Z',
      };
      previewLinks.create.mockResolvedValueOnce(link);

      await expect(
        service.createPreviewLink(7, admin, '1.2.3.4'),
      ).resolves.toBe(link);
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'create_preview_link',
        'menu_item',
        7,
        undefined,
        '1.2.3.4',
      );
    });

    it('does not audit-log when creation is refused', async () => {
      previewLinks.create.mockRejectedValueOnce(new Error('still live'));

      await expect(
        service.createPreviewLink(7, admin, undefined),
      ).rejects.toThrow();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('starts a regeneration with the reason and audit-logs it with the note', async () => {
      generation.regenerateAsAdmin.mockResolvedValueOnce({
        id: 7,
        arStatus: 'generating',
      });

      await expect(
        service.regenerate(
          7,
          'Colors too orange',
          ['colors'],
          admin,
          '1.2.3.4',
        ),
      ).resolves.toEqual({ id: 7, arStatus: 'generating' });
      expect(generation.regenerateAsAdmin).toHaveBeenCalledWith(
        7,
        admin.adminId,
        'Colors too orange',
        ['colors'],
      );
      expect(audit.log).toHaveBeenCalledWith(
        admin.adminId,
        'regenerate_item',
        'menu_item',
        7,
        'Colors too orange',
        '1.2.3.4',
      );
    });

    it('does not audit-log a refused regeneration', async () => {
      generation.regenerateAsAdmin.mockRejectedValueOnce(
        new BadRequestException('not allowed'),
      );

      await expect(
        service.regenerate(7, 'x', undefined, admin, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
