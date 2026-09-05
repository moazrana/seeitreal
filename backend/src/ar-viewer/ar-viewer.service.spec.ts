import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ArViewerService } from './ar-viewer.service';

describe('ArViewerService', () => {
  let service: ArViewerService;
  let prisma: { menuItem: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { menuItem: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArViewerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ArViewerService);
  });

  it('returns the item (with restaurant name) for a known slug', async () => {
    const item = {
      id: 1,
      publicSlug: 'burger-abc',
      hiddenByAdmin: false,
      restaurant: { name: 'Demo Diner', suspended: false },
    };
    prisma.menuItem.findUnique.mockResolvedValueOnce(item);

    await expect(service.findItemByPublicSlug('burger-abc')).resolves.toEqual(
      item,
    );
    expect(prisma.menuItem.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicSlug: 'burger-abc' } }),
    );
  });

  it('throws 404 for an unknown slug', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.findItemByPublicSlug('does-not-exist'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 404 (not a distinguishable error) when the restaurant is suspended (rootApp restaurant control)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      publicSlug: 'burger-abc',
      hiddenByAdmin: false,
      restaurant: { name: 'Demo Diner', suspended: true },
    });

    await expect(
      service.findItemByPublicSlug('burger-abc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 404 when the item is hidden by an admin (rootApp item control)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      publicSlug: 'burger-abc',
      hiddenByAdmin: true,
      restaurant: { name: 'Demo Diner', suspended: false },
    });

    await expect(
      service.findItemByPublicSlug('burger-abc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
