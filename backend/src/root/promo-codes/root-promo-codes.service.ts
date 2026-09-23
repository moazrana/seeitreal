import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromoDiscountType } from '@ar-menu/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RootAuditService } from '../audit/root-audit.service';
import type { AuthenticatedRootAdmin } from '../types/authenticated-root-admin.interface';
import type { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import type { ListPromoCodesQueryDto } from './dto/list-promo-codes-query.dto';
import type { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

const MAX_PERCENT = 100;

/**
 * Promo code CRUD + activate/deactivate (rootApp/documents/
 * ROOT-APP-subscriptions-and-promos.md §3). All mutations are
 * superadmin-only and audited (see RootPromoCodesController) — same
 * billing-is-not-support-scope reasoning as RootPackagesService.
 */
@Injectable()
export class RootPromoCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RootAuditService,
  ) {}

  list(query: ListPromoCodesQueryDto) {
    return this.prisma.promoCode.findMany({
      where: {
        ...(query.q ? { code: { contains: this.normalizeCode(query.q) } } : {}),
        ...(query.status === 'active' ? { isActive: true } : {}),
        ...(query.status === 'inactive' ? { isActive: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(id: number) {
    return this.requirePromoCode(id);
  }

  async create(
    dto: CreatePromoCodeDto,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const code = this.normalizeCode(dto.code);
    this.assertDiscountShape(dto.discountType, dto.amount, dto.currency);
    this.assertDateWindow(dto.startsAt, dto.endsAt);

    try {
      const created = await this.prisma.promoCode.create({
        data: {
          code,
          discountType: dto.discountType,
          amount: dto.amount,
          currency:
            dto.discountType === PromoDiscountType.FIXED ? dto.currency : null,
          appliesTo: dto.appliesTo,
          maxRedemptions: dto.maxRedemptions ?? null,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          createdByAdminId: admin.adminId,
        },
      });
      await this.audit.log(
        admin.adminId,
        'create_promo_code',
        'promo_code',
        created.id,
        code,
        ip,
      );
      return created;
    } catch (err) {
      throw this.mapUniqueCodeError(err);
    }
  }

  async update(
    id: number,
    dto: UpdatePromoCodeDto,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const existing = await this.requirePromoCode(id);

    const discountType = dto.discountType ?? existing.discountType;
    const amount = dto.amount ?? existing.amount;
    const currency =
      dto.currency !== undefined ? dto.currency : existing.currency;
    this.assertDiscountShape(discountType, amount, currency ?? undefined);

    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
        : existing.startsAt?.toISOString();
    const endsAt =
      dto.endsAt !== undefined ? dto.endsAt : existing.endsAt?.toISOString();
    this.assertDateWindow(startsAt ?? undefined, endsAt ?? undefined);

    const code = dto.code ? this.normalizeCode(dto.code) : undefined;

    try {
      const updated = await this.prisma.promoCode.update({
        where: { id },
        data: {
          code,
          discountType: dto.discountType,
          amount: dto.amount,
          currency: discountType === PromoDiscountType.FIXED ? currency : null,
          appliesTo: dto.appliesTo,
          maxRedemptions: dto.maxRedemptions,
          startsAt:
            dto.startsAt !== undefined
              ? dto.startsAt
                ? new Date(dto.startsAt)
                : null
              : undefined,
          endsAt:
            dto.endsAt !== undefined
              ? dto.endsAt
                ? new Date(dto.endsAt)
                : null
              : undefined,
        },
      });
      await this.audit.log(
        admin.adminId,
        'update_promo_code',
        'promo_code',
        id,
        JSON.stringify(dto),
        ip,
      );
      return updated;
    } catch (err) {
      throw this.mapUniqueCodeError(err);
    }
  }

  async activate(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const promo = await this.requirePromoCode(id);
    if (promo.isActive) {
      throw new BadRequestException('Promo code is already active');
    }
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: { isActive: true },
    });
    await this.audit.log(
      admin.adminId,
      'activate_promo_code',
      'promo_code',
      id,
      undefined,
      ip,
    );
    return updated;
  }

  async deactivate(
    id: number,
    admin: AuthenticatedRootAdmin,
    ip: string | undefined,
  ) {
    const promo = await this.requirePromoCode(id);
    if (!promo.isActive) {
      throw new BadRequestException('Promo code is already inactive');
    }
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log(
      admin.adminId,
      'deactivate_promo_code',
      'promo_code',
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
    const promo = await this.requirePromoCode(id);
    if (promo.timesRedeemed > 0) {
      throw new BadRequestException(
        'This code has redemption history and cannot be deleted — deactivate it instead',
      );
    }
    await this.prisma.promoCode.delete({ where: { id } });
    await this.audit.log(
      admin.adminId,
      'delete_promo_code',
      'promo_code',
      id,
      undefined,
      ip,
    );
  }

  // `discountType`/`currency` are typed as plain strings, not the shared
  // enums: callers may pass either the shared enum (DTOs) or Prisma's
  // structurally-equivalent-but-nominally-distinct union (existing rows
  // read back from the DB), and this only ever needs string equality.
  private assertDiscountShape(
    discountType: string,
    amount: number,
    currency: string | undefined,
  ) {
    if (discountType === (PromoDiscountType.PERCENT as string)) {
      if (amount > MAX_PERCENT) {
        throw new BadRequestException('A percent discount cannot exceed 100');
      }
      if (currency) {
        throw new BadRequestException(
          'Percent discounts must not specify a currency',
        );
      }
    } else if (!currency) {
      throw new BadRequestException('Fixed discounts require a currency');
    }
  }

  private assertDateWindow(
    startsAt: string | undefined,
    endsAt: string | undefined,
  ) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  /** Uppercase + trim so "SAVE10" and "save10" can never coexist. */
  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private mapUniqueCodeError(err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        'A promo code with this code already exists',
      );
    }
    return err;
  }

  private async requirePromoCode(id: number) {
    const promo = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!promo) {
      throw new NotFoundException('Promo code not found');
    }
    return promo;
  }
}
