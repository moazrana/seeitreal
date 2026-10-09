import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** How long an admin preview link stays live. */
export const PREVIEW_LINK_TTL_MS = 24 * 60 * 60_000;

/** Shape of an HMAC-SHA256 digest in base64url — anything else is ignored
 * before any lookup or comparison happens. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface PreviewLink {
  url: string | null;
  expiresAt: string | null;
}

interface PreviewState {
  id: number;
  publicSlug: string;
  arStatus: string;
  previewLinkNonce: string | null;
  previewLinkExpiresAt: Date | null;
}

/**
 * Short-lived public links that let an admin open a dish still in QA on a
 * phone (via QR) before approving it. One live link per item: a new one
 * can only be created once the previous one expires.
 *
 * The link token is HMAC(key, itemId.nonce.expiry), with only the random
 * nonce and expiry stored on the item, so the database alone can't produce
 * a working link. The key is derived (HKDF, own label) from
 * ROOT_JWT_ACCESS_SECRET, which is required at boot, so this adds no new
 * secret to manage; rotating that secret invalidates all preview links.
 */
@Injectable()
export class PreviewLinkService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        this.config.get<string>('ROOT_JWT_ACCESS_SECRET')!,
        '',
        'seeitreal-ar-preview-link-v1',
        32,
      ),
    );
  }

  /** The item's live link, or nulls when none is live. */
  async getLive(itemId: number): Promise<PreviewLink> {
    const item = await this.loadQaItem(itemId);
    return this.isLive(item)
      ? this.toLink(item)
      : { url: null, expiresAt: null };
  }

  /** Creates a 24h link. 409 while another link for the item is live. */
  async create(itemId: number): Promise<PreviewLink> {
    await this.loadQaItem(itemId);
    const now = new Date();
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + PREVIEW_LINK_TTL_MS);

    // Conditional update, so two concurrent requests can't both create a
    // link: only one of them finds no live link to replace.
    const { count } = await this.prisma.menuItem.updateMany({
      where: {
        id: itemId,
        arStatus: 'qa',
        OR: [
          { previewLinkExpiresAt: null },
          { previewLinkExpiresAt: { lte: now } },
        ],
      },
      data: { previewLinkNonce: nonce, previewLinkExpiresAt: expiresAt },
    });
    if (count !== 1) {
      throw new ConflictException('A preview link for this item is still live');
    }

    const item = await this.loadQaItem(itemId);
    return this.toLink(item);
  }

  /** True only for a QA item whose live link matches `token`. */
  isValidToken(item: PreviewState, token: string): boolean {
    if (!TOKEN_PATTERN.test(token) || item.arStatus !== 'qa') return false;
    if (!this.isLive(item)) return false;
    const expected = Buffer.from(this.sign(item));
    const provided = Buffer.from(token);
    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }

  private async loadQaItem(itemId: number): Promise<PreviewState> {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        publicSlug: true,
        arStatus: true,
        previewLinkNonce: true,
        previewLinkExpiresAt: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    if (item.arStatus !== 'qa') {
      throw new BadRequestException(
        `Item is "${item.arStatus}", not awaiting QA`,
      );
    }
    return item;
  }

  private isLive(item: PreviewState): item is PreviewState & {
    previewLinkNonce: string;
    previewLinkExpiresAt: Date;
  } {
    return (
      !!item.previewLinkNonce &&
      !!item.previewLinkExpiresAt &&
      item.previewLinkExpiresAt > new Date()
    );
  }

  private sign(item: PreviewState): string {
    return createHmac('sha256', this.key)
      .update(
        `${item.id}.${item.previewLinkNonce}.${item.previewLinkExpiresAt?.getTime()}`,
      )
      .digest('base64url');
  }

  private toLink(item: PreviewState): PreviewLink {
    const base = (this.config.get<string>('API_BASE_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    return {
      url: `${base}/api/m/${encodeURIComponent(item.publicSlug)}?preview=${this.sign(item)}`,
      expiresAt: item.previewLinkExpiresAt!.toISOString(),
    };
  }
}
