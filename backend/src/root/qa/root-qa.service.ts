import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';

/**
 * 3D model review / QA queue — moved here from the old
 * backend/src/admin/ module (rootApp/ROOT-APP-Implementation-Spec.md §1,
 * §3.7, §8: "moves into this app"). Business logic is unchanged from
 * AdminService.{qaQueue,approve,reject}; only the audit trail (RootAuditLog
 * instead of AdminAuditLog) and the identity performing the action
 * (AuthenticatedRootAdmin instead of AuthenticatedUser) differ.
 */
@Injectable()
export class RootQaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RootAuditService,
  ) {}

  qaQueue() {
    return this.prisma.menuItem.findMany({
      where: { arStatus: 'qa' },
      orderBy: { updatedAt: 'asc' },
      // Restaurant + cuisine type (MenuCategory) so the Root App can group
      // the queue by restaurant and cuisine. Only display fields are
      // selected — never the owner or billing relations.
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async approve(
    itemId: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
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
    // Real-world dimensions are optional (models without them are scaled
    // to DEFAULT_FOOTPRINT_MM in the pipeline), so they don't gate approval.

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        arStatus: 'live',
        qaNote: null,
        // First publish issues the dish's QR code; re-approvals after a
        // regeneration keep the original timestamp.
        qrIssuedAt: item.qrIssuedAt ?? new Date(),
      },
    });
    await this.audit.log(
      admin.adminId,
      'approve_item',
      'menu_item',
      itemId,
      undefined,
      ip,
    );
    return updated;
  }

  async reject(
    itemId: number,
    note: string,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
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
    await this.audit.log(
      admin.adminId,
      'reject_item',
      'menu_item',
      itemId,
      note,
      ip,
    );
    return updated;
  }
}
