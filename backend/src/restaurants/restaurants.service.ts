import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { CreateRestaurantDto } from './dto/create-restaurant.dto';
import type { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageUpload: ImageUploadService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateRestaurantDto) {
    await this.assertSlugAvailable(dto.slug);
    return this.prisma.restaurant.create({
      data: {
        ownerUserId: user.userId,
        name: dto.name,
        slug: dto.slug,
        logoUrl: dto.logoUrl,
      },
    });
  }

  async findAllForUser(user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN) {
      return this.prisma.restaurant.findMany();
    }
    return this.prisma.restaurant.findMany({
      where: { ownerUserId: user.userId },
    });
  }

  async findOneOrThrow(id: number) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return restaurant;
  }

  /**
   * Ownership check used by this module and by every other module whose
   * resources hang off a restaurant (menu categories/items, deals, ...) —
   * spec §7.3: every protected endpoint must verify both role AND that the
   * resource belongs to the caller. Returns the restaurant on success;
   * always throws 404 (never 403) on a cross-tenant mismatch so probing
   * can't distinguish "exists but isn't yours" from "doesn't exist".
   *
   * Also enforces the Root App's restaurant suspension
   * (rootApp/ROOT-APP-Implementation-Spec.md §3.2): a suspended
   * restaurant's owner is blocked here with 403 — distinct from the 404
   * case above, since they genuinely own it, they just can't act on it
   * right now. The legacy UserRole.ADMIN bypass ignores suspension too,
   * same as it already ignores ownership.
   */
  async assertOwnership(restaurantId: number, user: AuthenticatedUser) {
    const restaurant = await this.findOneOrThrow(restaurantId);
    if (user.role === UserRole.ADMIN) {
      return restaurant;
    }
    if (restaurant.ownerUserId !== user.userId) {
      throw new NotFoundException('Restaurant not found');
    }
    if (restaurant.suspended) {
      throw new ForbiddenException(
        'This restaurant has been suspended. Contact support for details.',
      );
    }
    return restaurant;
  }

  async update(id: number, user: AuthenticatedUser, dto: UpdateRestaurantDto) {
    await this.assertOwnership(id, user);
    if (dto.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }
    return this.prisma.restaurant.update({ where: { id }, data: dto });
  }

  async remove(id: number, user: AuthenticatedUser) {
    await this.assertOwnership(id, user);
    await this.prisma.restaurant.delete({ where: { id } });
  }

  async setLogo(
    id: number,
    user: AuthenticatedUser,
    file: Express.Multer.File,
  ) {
    await this.assertOwnership(id, user);
    const { url } = await this.imageUpload.processAndStore(
      file,
      'restaurant-logo',
    );
    return this.prisma.restaurant.update({
      where: { id },
      data: { logoUrl: url },
    });
  }

  private async assertSlugAvailable(slug: string, excludingId?: number) {
    const existing = await this.prisma.restaurant.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== excludingId) {
      throw new ConflictException('Slug already in use');
    }
  }
}
