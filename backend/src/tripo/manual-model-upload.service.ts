import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import { GlbUploadService } from '../uploads/glb-upload.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { UsdzConversionService } from './usdz-conversion.service';

/**
 * Hero-dish fallback (documents/3d-model-enhancement.md §5): lets an owner
 * upload an already-produced GLB (Polycam/photogrammetry/a 3D artist)
 * instead of generating one via Tripo, and routes it into the same
 * QA -> live flow as a Tripo-generated model.
 *
 * Deliberately does NOT run it through ModelScalingService. Tripo returns
 * models at an arbitrary normalized scale, so TripoGenerationService scales
 * every result to the item's real-world width. A manually-produced model
 * from a real-world capture tool (LiDAR/photogrammetry) is already
 * true-to-scale — re-scaling it against widthMm would silently distort an
 * already-correct model. widthMm is still required (same gate as
 * triggerGeneration) so the AR viewer's size caption and the QA/approve
 * checks stay consistent, but it's never used to transform this model.
 */
@Injectable()
export class ManualModelUploadService {
  private readonly logger = new Logger(ManualModelUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly glbUpload: GlbUploadService,
    private readonly usdz: UsdzConversionService,
    private readonly storage: StorageService,
  ) {}

  async uploadManualModel(
    restaurantId: number,
    itemId: number,
    user: AuthenticatedUser,
    file: Express.Multer.File,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException('Item not found');
    }
    if (!item.widthMm) {
      throw new BadRequestException(
        'Enter the dish width before uploading a 3D model',
      );
    }
    // Same debounce/guard as the Tripo path (spec §7.4): only a
    // freshly-created or freshly-photographed item can accept a model.
    if (item.arStatus !== 'pending') {
      throw new BadRequestException(
        `Cannot upload a model while item is in "${item.arStatus}" status`,
      );
    }

    const { url: modelGlbUrl } = await this.glbUpload.validateAndStore(
      file,
      'model-glb-manual',
    );
    this.logger.log(`Item ${itemId}: manual GLB uploaded, bypassing Tripo`);

    let modelUsdzUrl: string | null = null;
    let qaNote: string | null = null;
    try {
      const usdzBuffer = await this.usdz.convert(file.buffer);
      const stored = await this.storage.putObject({
        key: this.storage.generateKey('model-usdz', 'usdz'),
        body: usdzBuffer,
        contentType: 'model/vnd.usdz+zip',
      });
      modelUsdzUrl = stored.url;
    } catch (err) {
      // Spec §11.3: an item isn't AR-ready without both files — leave
      // modelUsdzUrl unset and flag it, same handling as the Tripo path.
      this.logger.warn(
        `USDZ conversion failed for manually-uploaded GLB on item ${itemId}: ${String(err)}`,
      );
      qaNote = 'GLB uploaded, but USDZ conversion failed. See server logs.';
    }

    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        arStatus: 'qa',
        modelGlbUrl,
        modelUsdzUrl,
        tripoTaskId: null,
        qaNote,
      },
    });
  }
}
