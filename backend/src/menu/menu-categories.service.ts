import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import type { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';

@Injectable()
export class MenuCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async create(
    restaurantId: number,
    user: AuthenticatedUser,
    dto: CreateMenuCategoryDto,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    await this.assertNameAvailable(restaurantId, dto.name);
    return this.prisma.menuCategory
      .create({
        data: { restaurantId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateNameError(err, dto.name);
      });
  }

  async findAll(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    return this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async update(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
    dto: UpdateMenuCategoryDto,
  ) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    if (dto.name !== undefined) {
      await this.assertNameAvailable(restaurantId, dto.name, id);
    }
    return this.prisma.menuCategory
      .update({ where: { id }, data: dto })
      .catch((err: unknown) => {
        throw this.mapDuplicateNameError(err, dto.name ?? '');
      });
  }

  /**
   * Every dish needs a cuisine type, so one still in use can't be deleted —
   * the owner moves or deletes its dishes first. The FK's ON DELETE
   * RESTRICT is the real guarantee (it also catches a dish added between
   * this check and the delete — mapInUseError).
   */
  async remove(restaurantId: number, id: number, user: AuthenticatedUser) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    const dishCount = await this.prisma.menuItem.count({
      where: { categoryId: id },
    });
    if (dishCount > 0) {
      throw cuisineInUseConflict(dishCount);
    }
    await this.prisma.menuCategory
      .delete({ where: { id } })
      .catch((err: unknown) => {
        throw this.mapInUseError(err);
      });
  }

  private mapInUseError(err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2003'
    ) {
      return cuisineInUseConflict();
    }
    return err;
  }

  /**
   * Friendly 409 before writing. The DB's unique (restaurant_id, name)
   * index (case-insensitive collation) is the real guarantee — it also
   * catches two requests racing past this check (mapDuplicateNameError).
   */
  private async assertNameAvailable(
    restaurantId: number,
    name: string,
    exceptId?: number,
  ) {
    const existing = await this.prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        name,
        ...(exceptId !== undefined ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw duplicateNameConflict(name);
    }
  }

  private mapDuplicateNameError(err: unknown, name: string) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return duplicateNameConflict(name);
    }
    return err;
  }

  private async findOwnedOrThrow(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
    });
    if (!category || category.restaurantId !== restaurantId) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }
}

function duplicateNameConflict(name: string) {
  return new ConflictException(
    `A cuisine type named "${name}" already exists for this restaurant`,
  );
}

function cuisineInUseConflict(dishCount?: number) {
  const dishes =
    dishCount === undefined
      ? 'dishes'
      : `${dishCount} dish${dishCount === 1 ? '' : 'es'}`;
  return new ConflictException(
    `This cuisine type still has ${dishes}. Move them to another cuisine type or delete them first.`,
  );
}
