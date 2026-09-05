import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { generatePublicSlug } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ImageUploadService } from '../uploads/image-upload.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { MAX_ITEM_PHOTOS } from './menu-items.constants';
import type { UpdateMenuItemDto } from './dto/update-menu-item.dto';

const PHOTOS_ORDERED = {
  photos: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.MenuItemInclude;

// Clears any in-flight/existing 3D model — the input photo set no longer
// matches what was (or is being) generated, so a stale model must never be
// left looking current.
const MODEL_INVALIDATION_FIELDS = {
  arStatus: 'pending' as const,
  modelGlbUrl: null,
  modelUsdzUrl: null,
  previewImageUrl: null,
  tripoTaskId: null,
  qaNote: null,
};

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
      include: PHOTOS_ORDERED,
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        photoUrl: dto.photoUrl,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        lengthMm: dto.lengthMm,
        publicSlug: generatePublicSlug(dto.name),
      },
    });
  }

  async findAll(restaurantId: number, user: AuthenticatedUser) {
    await this.restaurants.assertOwnership(restaurantId, user);
    return this.prisma.menuItem.findMany({
      where: { restaurantId },
      include: PHOTOS_ORDERED,
    });
  }

  async findOne(restaurantId: number, id: number, user: AuthenticatedUser) {
    return this.findOwnedWithPhotosOrThrow(restaurantId, id, user);
  }

  /**
   * Adds 1-5 photos (documents/3d-model-enhancement.md §1). Every file is
   * validated/stored independently via ImageUploadService (full §7.5
   * checklist), never as a batch shortcut. The first photo ever uploaded
   * becomes the item's display photo (MenuItem.photoUrl); any photo change
   * invalidates an in-flight/existing 3D model, same as the old setPhoto.
   */
  async addPhotos(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
    files: Express.Multer.File[],
  ) {
    const item = await this.findOwnedWithPhotosOrThrow(restaurantId, id, user);
    const existingCount = item.photos.length;
    if (existingCount + files.length > MAX_ITEM_PHOTOS) {
      throw new BadRequestException(
        `A dish can have at most ${MAX_ITEM_PHOTOS} photos (${existingCount} already uploaded)`,
      );
    }

    // Sequential, not Promise.all — keeps upload order (and therefore
    // sortOrder) deterministic, and avoids one item's request fanning out
    // into a burst of concurrent image-processing work.
    const stored: { url: string }[] = [];
    for (const file of files) {
      stored.push(
        await this.imageUpload.processAndStore(file, 'menu-item-photo'),
      );
    }

    await this.prisma.menuItemPhoto.createMany({
      data: stored.map(({ url }, index) => ({
        menuItemId: id,
        url,
        sortOrder: existingCount + index,
      })),
    });

    return this.prisma.menuItem.update({
      where: { id },
      include: PHOTOS_ORDERED,
      data: {
        ...(existingCount === 0 ? { photoUrl: stored[0].url } : {}),
        ...MODEL_INVALIDATION_FIELDS,
      },
    });
  }

  /**
   * Removes one photo (documents/3d-model-enhancement.md §1). Renumbers the
   * remaining photos to stay contiguous 0..n-1 and, if the removed photo
   * was the display photo (sortOrder 0), promotes the new first photo (or
   * clears it if none remain). Same model-invalidation as addPhotos.
   */
  async removePhoto(
    restaurantId: number,
    id: number,
    photoId: number,
    user: AuthenticatedUser,
  ) {
    const item = await this.findOwnedWithPhotosOrThrow(restaurantId, id, user);
    const target = item.photos.find((p) => p.id === photoId);
    if (!target) {
      throw new NotFoundException('Photo not found');
    }

    await this.prisma.menuItemPhoto.delete({ where: { id: photoId } });

    const remaining = item.photos
      .filter((p) => p.id !== photoId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const [index, photo] of remaining.entries()) {
      if (photo.sortOrder !== index) {
        await this.prisma.menuItemPhoto.update({
          where: { id: photo.id },
          data: { sortOrder: index },
        });
      }
    }

    return this.prisma.menuItem.update({
      where: { id },
      include: PHOTOS_ORDERED,
      data: {
        photoUrl: remaining[0]?.url ?? null,
        ...MODEL_INVALIDATION_FIELDS,
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
    return this.prisma.menuItem.update({
      where: { id },
      include: PHOTOS_ORDERED,
      data: dto,
    });
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

  /** Same as findOwnedOrThrow, but with the ordered photos relation loaded
   * — a separate method (rather than a generic `include` param) so Prisma
   * can statically type the returned `photos` array. */
  private async findOwnedWithPhotosOrThrow(
    restaurantId: number,
    id: number,
    user: AuthenticatedUser,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: PHOTOS_ORDERED,
    });
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
