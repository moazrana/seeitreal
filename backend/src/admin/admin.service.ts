import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  qaQueue() {
    return this.prisma.menuItem.findMany({
      where: { arStatus: 'qa' },
      orderBy: { updatedAt: 'asc' },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
  }

  async approve(itemId: number, admin: AuthenticatedUser) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    if (item.arStatus !== 'qa') {
      throw new BadRequestException(
        `Item is "${item.arStatus}", not awaiting QA`,
      );
    }
    // An item is not AR-ready until both files exist (spec §11.3) — the
    // pipeline can legitimately reach "qa" with only a GLB (e.g. USDZ
    // conversion unavailable), so this must not be a silent no-op.
    if (!item.modelGlbUrl || !item.modelUsdzUrl) {
      throw new BadRequestException(
        'Cannot approve: item is missing a GLB and/or USDZ model file',
      );
    }

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { arStatus: 'live', qaNote: null },
    });
    await this.logAction(admin.userId, 'approve_item', 'menu_item', itemId);
    return updated;
  }

  async reject(itemId: number, note: string, admin: AuthenticatedUser) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    if (item.arStatus !== 'qa') {
      throw new BadRequestException(
        `Item is "${item.arStatus}", not awaiting QA`,
      );
    }

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      // Sent back to the owner (spec §10.3) — clears any stale model URLs
      // so the item can't be mistaken for AR-ready while pending fixes.
      data: {
        arStatus: 'pending',
        qaNote: note,
        modelGlbUrl: null,
        modelUsdzUrl: null,
        previewImageUrl: null,
        tripoTaskId: null,
      },
    });
    await this.logAction(
      admin.userId,
      'reject_item',
      'menu_item',
      itemId,
      note,
    );
    return updated;
  }

  private async logAction(
    adminUserId: number,
    action: string,
    targetType: string,
    targetId: number,
    metadata?: string,
  ) {
    await this.prisma.adminAuditLog.create({
      data: { adminUserId, action, targetType, targetId, metadata },
    });
  }
}
