import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Full audit trail for the Root App (spec §5: "every admin action — who,
 * what, when, from which IP"). Append-only; every mutating action in the
 * root/ module tree calls this. Unlike AnalyticsEvent.ipHash (diner
 * privacy), `ipAddress` here is stored raw — this is an internal security
 * log for incident investigation, not diner-facing analytics.
 */
@Injectable()
export class RootAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    adminId: number,
    action: string,
    targetType?: string,
    targetId?: number,
    metadata?: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.prisma.rootAuditLog.create({
      data: { adminId, action, targetType, targetId, metadata, ipAddress },
    });
  }
}
