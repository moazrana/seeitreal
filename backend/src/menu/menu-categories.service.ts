import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.menuCategory.create({
      data: { restaurantId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
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
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async remove(restaurantId: number, id: number, user: AuthenticatedUser) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    await this.prisma.menuCategory.delete({ where: { id } });
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
