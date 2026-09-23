import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionLifecycleService } from '../payments/subscription-lifecycle.service';
import { ArViewerService, SubscriptionExpiredError } from './ar-viewer.service';

describe('ArViewerService', () => {
  let service: ArViewerService;
  let prisma: { menuItem: { findUnique: jest.Mock } };
  let lifecycle: { isGated: jest.Mock };

  beforeEach(async () => {
    prisma = { menuItem: { findUnique: jest.fn() } };
    lifecycle = { isGated: jest.fn().mockReturnValue(false) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArViewerService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubscriptionLifecycleService, useValue: lifecycle },
      ],
    }).compile();
    service = moduleRef.get(ArViewerService);
  });

  it('returns the item (with restaurant name) for a known slug', async () => {
    const item = {
      id: 1,
      publicSlug: 'burger-abc',
      hiddenByAdmin: false,
      restaurant: { name: 'Demo Diner', suspended: false, subscriptions: [] },
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
      restaurant: { name: 'Demo Diner', suspended: true, subscriptions: [] },
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
      restaurant: { name: 'Demo Diner', suspended: false, subscriptions: [] },
    });

    await expect(
      service.findItemByPublicSlug('burger-abc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws SubscriptionExpiredError (not a 404) when the restaurant subscription is gated', async () => {
    const subscription = { status: 'expired' };
    lifecycle.isGated.mockReturnValueOnce(true);
    prisma.menuItem.findUnique.mockResolvedValueOnce({
      id: 1,
      publicSlug: 'burger-abc',
      hiddenByAdmin: false,
      restaurant: {
        name: 'Demo Diner',
        suspended: false,
        subscriptions: [subscription],
      },
    });

    await expect(
      service.findItemByPublicSlug('burger-abc'),
    ).rejects.toMatchObject(new SubscriptionExpiredError('Demo Diner'));
    expect(lifecycle.isGated).toHaveBeenCalledWith(subscription);
  });
});
