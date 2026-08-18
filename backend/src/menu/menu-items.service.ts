import { Injectable, NotFoundException } from '@nestjs/common';
import { generatePublicSlug } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { CreateMenuItemDto } from './dto/create-menu-item.dto';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly imageUpload: ImageUploadService,
  ) {}

  async create(
    restaurantId: number,
    user: AuthenticatedUser,
    dto: CreateMenuItemDto,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    if (dto.categoryId !== undefined) {
      await this.assertCategoryBelongs(restaurantId, dto.categoryId);
    }

    return this.prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        photoUrl: dto.photoUrl,
        publicSlug: generatePublicSlug(dto.name),
      },
    });
  }

  async findAll(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    return this.prisma.menuItem.findMany({ where: { restaurantId } });
  }

  async findOne(restaurantId: number, id: number, user: AuthenticatedUser) {
    return this.findOwnedOrThrow(restaurantId, id, user);
  }

  async setPhoto(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
    file: Express.Multer.File,
  ) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    const { url } = await this.imageUpload.processAndStore(
      file,
      'menu-item-photo',
    );
    // A new photo invalidates any in-flight or existing 3D model — it no
    // longer matches what was (or is being) generated.
    return this.prisma.menuItem.update({
      where: { id },
      data: {
        photoUrl: url,
        arStatus: 'pending',
        modelGlbUrl: null,
        modelUsdzUrl: null,
        previewImageUrl: null,
        tripoTaskId: null,
        qaNote: null,
      },
    });
  }

  async update(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
    dto: UpdateMenuItemDto,
  ) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    if (dto.categoryId !== undefined) {
      await this.assertCategoryBelongs(restaurantId, dto.categoryId);
    }
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async remove(restaurantId: number, id: number, user: AuthenticatedUser) {
    await this.findOwnedOrThrow(restaurantId, id, user);
    await this.prisma.menuItem.delete({ where: { id } });
  }

  private async findOwnedOrThrow(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

  private async assertCategoryBelongs(
    restaurantId: number,
    categoryId: number,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.restaurantId !== restaurantId) {
      throw new NotFoundException('Category not found');
    }
  }
}
