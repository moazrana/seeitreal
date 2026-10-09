import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import {
  PREVIEW_LINK_TTL_MS,
  PreviewLinkService,
} from './preview-link.service';

describe('PreviewLinkService', () => {
  let service: PreviewLinkService;
  let prisma: { menuItem: { findUnique: jest.Mock; updateMany: jest.Mock } };

  const config = {
    get: (key: string) =>
      ({
        ROOT_JWT_ACCESS_SECRET: 'a'.repeat(32),
        API_BASE_URL: 'https://api.example/',
      })[key],
  } as unknown as ConfigService;

  const qaItem = (overrides = {}) => ({
    id: 7,
    publicSlug: 'margherita-ab12',
    arStatus: 'qa',
    previewLinkNonce: null as string | null,
    previewLinkExpiresAt: null as Date | null,
    ...overrides,
  });
  const liveLink = () =>
    qaItem({
      previewLinkNonce: 'n'.repeat(64),
      previewLinkExpiresAt: new Date(Date.now() + 60_000),
    });
  const tokenOf = (url: string) => new URL(url).searchParams.get('preview')!;

  beforeEach(() => {
    prisma = {
      menuItem: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new PreviewLinkService(
      prisma as unknown as PrismaService,
      config,
    );
  });

  describe('getLive', () => {
    it('returns nulls when no link is live', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce(
        qaItem({
          previewLinkNonce: 'n'.repeat(64),
          previewLinkExpiresAt: new Date(Date.now() - 1),
        }),
      );
      await expect(service.getLive(7)).resolves.toEqual({
        url: null,
        expiresAt: null,
      });
    });

    it('returns the absolute public viewer URL while a link is live', async () => {
      const item = liveLink();
      prisma.menuItem.findUnique.mockResolvedValueOnce(item);

      const link = await service.getLive(7);

      expect(link.url).toMatch(
        /^https:\/\/api\.example\/api\/m\/margherita-ab12\?preview=[A-Za-z0-9_-]{43}$/,
      );
      expect(link.expiresAt).toBe(item.previewLinkExpiresAt!.toISOString());
      expect(service.isValidToken(item, tokenOf(link.url!))).toBe(true);
    });

    it('404s for a missing item and 400s for an item not in QA', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce(null);
      await expect(service.getLive(7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.menuItem.findUnique.mockResolvedValueOnce(
        qaItem({ arStatus: 'live' }),
      );
      await expect(service.getLive(7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('create', () => {
    it('creates a 24-hour link only when none is live', async () => {
      prisma.menuItem.findUnique
        .mockResolvedValueOnce(qaItem())
        .mockImplementationOnce(() => {
          const [{ data }] = prisma.menuItem.updateMany.mock.calls[0] as [
            { data: { previewLinkNonce: string; previewLinkExpiresAt: Date } },
          ];
          return Promise.resolve(qaItem(data));
        });

      const link = await service.create(7);

      const [{ where, data }] = prisma.menuItem.updateMany.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];
      expect(where).toMatchObject({ id: 7, arStatus: 'qa' });
      expect(where.OR).toEqual([
        { previewLinkExpiresAt: null },
        { previewLinkExpiresAt: { lte: expect.any(Date) } },
      ]);
      expect(data.previewLinkNonce).toMatch(/^[0-9a-f]{64}$/);
      const ttl = (data.previewLinkExpiresAt as Date).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(PREVIEW_LINK_TTL_MS - 5_000);
      expect(ttl).toBeLessThanOrEqual(PREVIEW_LINK_TTL_MS);
      expect(link.url).toContain('?preview=');
    });

    it('409s while another link is live', async () => {
      prisma.menuItem.findUnique.mockResolvedValueOnce(liveLink());
      prisma.menuItem.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.create(7)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('isValidToken', () => {
    it('rejects a wrong, malformed, expired or non-QA token', async () => {
      const item = liveLink();
      prisma.menuItem.findUnique.mockResolvedValueOnce(item);
      const token = tokenOf((await service.getLive(7)).url!);

      expect(service.isValidToken(item, 'x'.repeat(43))).toBe(false);
      expect(service.isValidToken(item, `${token}x`)).toBe(false);
      expect(
        service.isValidToken(
          { ...item, previewLinkExpiresAt: new Date(Date.now() - 1) },
          token,
        ),
      ).toBe(false);
      expect(service.isValidToken({ ...item, arStatus: 'live' }, token)).toBe(
        false,
      );
      // A newer link (new nonce) invalidates the old token.
      expect(
        service.isValidToken(
          { ...item, previewLinkNonce: 'm'.repeat(64) },
          token,
        ),
      ).toBe(false);
    });
  });
});
