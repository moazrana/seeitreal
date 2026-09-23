import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';

/**
 * Subscription package CRUD (rootApp/documents/
 * ROOT-APP-subscriptions-and-promos.md §2). All mutations are superadmin-only
 * and audited — this domain is billing/pricing, out of the "support" role's
 * scope entirely (see RootPackagesController).
 */
@Injectable()
export class RootPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RootAuditService,
  ) {}

  list() {
    return this.prisma.subscriptionPackage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  async detail(id: number) {
    const pkg = await this.requirePackage(id);
    return pkg;
  }

  /** Restaurants currently on this package (§2: "view subscribers per package"). */
  async subscribers(id: number) {
    await this.requirePackage(id);
    return this.prisma.subscription.findMany({
      where: { packageId: id },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, suspended: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    dto: CreatePackageDto,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const created = await this.prisma.subscriptionPackage.create({
      data: {
        name: dto.name,
        pricePkr: dto.pricePkr,
        priceUsd: dto.priceUsd,
        interval: dto.interval,
        maxItems: dto.maxItems ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log(
      admin.adminId,
      'create_package',
      'subscription_package',
      created.id,
      dto.name,
      ip,
    );
    return created;
  }

  async update(
    id: number,
    dto: UpdatePackageDto,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const existing = await this.requirePackage(id);

    // Changing price does not retroactively re-charge anyone (spec §2) — it
    // only changes what SubscriptionPackage.pricePkr/priceUsd read as of now.
    // The (separate) billing renewal job reads the package's current price
    // at each subscriber's next renewal; nothing here touches past charges.
    const priceChanged =
      (dto.pricePkr !== undefined && dto.pricePkr !== existing.pricePkr) ||
      (dto.priceUsd !== undefined && dto.priceUsd !== existing.priceUsd);

    const updated = await this.prisma.subscriptionPackage.update({
      where: { id },
      data: {
        name: dto.name,
        pricePkr: dto.pricePkr,
        priceUsd: dto.priceUsd,
        interval: dto.interval,
        maxItems: dto.maxItems,
        sortOrder: dto.sortOrder,
      },
    });
    await this.audit.log(
      admin.adminId,
      priceChanged ? 'update_package_price' : 'update_package',
      'subscription_package',
      id,
      JSON.stringify(dto),
      ip,
    );
    return updated;
  }

  async retire(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const pkg = await this.requirePackage(id);
    if (!pkg.isActive) {
      throw new BadRequestException('Package is already retired');
    }
    const updated = await this.prisma.subscriptionPackage.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log(
      admin.adminId,
      'retire_package',
      'subscription_package',
      id,
      undefined,
      ip,
    );
    return updated;
  }

  async activate(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const pkg = await this.requirePackage(id);
    if (pkg.isActive) {
      throw new BadRequestException('Package is already active');
    }
    const updated = await this.prisma.subscriptionPackage.update({
      where: { id },
      data: { isActive: true },
    });
    await this.audit.log(
      admin.adminId,
      'activate_package',
      'subscription_package',
      id,
      undefined,
      ip,
    );
    return updated;
  }

  async remove(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    await this.requirePackage(id);
    const subscriberCount = await this.prisma.subscription.count({
      where: { packageId: id },
    });
    if (subscriberCount > 0) {
      throw new BadRequestException(
        'This package has subscriptions referencing it and cannot be deleted — retire it instead',
      );
    }
    await this.prisma.subscriptionPackage.delete({ where: { id } });
    await this.audit.log(
      admin.adminId,
      'delete_package',
      'subscription_package',
      id,
      undefined,
      ip,
    );
  }

  private async requirePackage(id: number) {
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id },
    });
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }
    return pkg;
  }
}
