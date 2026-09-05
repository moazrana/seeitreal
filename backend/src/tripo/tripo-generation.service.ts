import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ModelScalingService } from './model-scaling.service';
import { TripoClientService } from './tripo-client.service';
import { UsdzConversionService } from './usdz-conversion.service';
import type { TripoTaskResult } from './tripo.types';

// Poll fallback only looks at jobs that have had a fair chance to arrive
// via webhook first (spec §11.2: webhook preferred, polling is fallback).
const POLL_MIN_AGE_MS = 2 * 60 * 1000;

// Tripo's multiview endpoint has a fixed max input count. If an owner
// uploaded more than this, we cap it here — see
// TripoClientService.submitMultiviewToModel's doc comment for why (we
// don't capture per-photo angle labels to pick "the most distinct" by, so
// this takes the first N in upload order).
const MAX_MULTIVIEW_IMAGES = 4;

@Injectable()
export class TripoGenerationService {
  private readonly logger = new Logger(TripoGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly tripo: TripoClientService,
    private readonly storage: StorageService,
    private readonly usdz: UsdzConversionService,
    private readonly modelScaling: ModelScalingService,
    private readonly config: ConfigService,
  ) {}

  /** Owner-triggered: kick off generation for one menu item (spec §4.4, §11.1). */
  async triggerGeneration(
    restaurantId: number,
    itemId: number,
    user: AuthenticatedUser,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException('Item not found');
    }
    // Prefer the ordered `photos` set (documents/3d-model-enhancement.md
    // §1); fall back to the legacy single `photoUrl` for items created
    // before that migration backfilled it.
    const photoUrls = (item.photos ?? []).map((p) => p.url);
    if (photoUrls.length === 0 && item.photoUrl) {
      photoUrls.push(item.photoUrl);
    }
    if (photoUrls.length === 0) {
      throw new BadRequestException(
        'Upload a photo before generating a 3D model',
      );
    }
    // Real-world width is required up front so the pipeline can always
    // scale the model it produces (documents/TASK-real-world-ar-sizing.md)
    // — a generated-but-unscaled model should never exist.
    if (!item.widthMm) {
      throw new BadRequestException(
        'Enter the dish width before generating a 3D model',
      );
    }
    // The item's own status is the debounce/guard (spec §7.4): only a
    // freshly-created or freshly-photographed item can trigger a job, so
    // a user can't fire this repeatedly while one is already in flight.
    if (item.arStatus !== 'pending') {
      throw new BadRequestException(
        `Cannot start generation while item is in "${item.arStatus}" status`,
      );
    }

    const callbackUrl = this.buildCallbackUrl();
    const generationOptions = {
      texture: true,
      pbr: true,
      textureQuality:
        this.config.get<string>('TRIPO_TEXTURE_QUALITY') ?? 'detailed',
      callbackUrl,
    };
    // Routing (documents/3d-model-enhancement.md §1): a single photo uses
    // Tripo's single-image endpoint; 2+ use multiview, which reconstructs
    // the model from real angles instead of hallucinating unseen sides —
    // the single biggest realism gain of this pipeline.
    const { taskId } =
      photoUrls.length === 1
        ? await this.tripo.submitImageToModel(photoUrls[0], generationOptions)
        : await this.tripo.submitMultiviewToModel(
            photoUrls.slice(0, MAX_MULTIVIEW_IMAGES),
            generationOptions,
          );
    this.logger.log(
      `Item ${itemId}: submitted Tripo task ${taskId} (${photoUrls.length === 1 ? 'single-image' : 'multiview'})`,
    );

    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: { arStatus: 'generating', tripoTaskId: taskId, qaNote: null },
    });
  }

  /** Shared by the webhook handler and the poll fallback. */
  async handleTaskResult(result: TripoTaskResult): Promise<void> {
    if (!result.taskId) {
      this.logger.warn(
        'Received a Tripo task result with no task_id — ignoring',
      );
      return;
    }

    const item = await this.prisma.menuItem.findFirst({
      where: { tripoTaskId: result.taskId },
    });
    if (!item) {
      // Can legitimately happen (item deleted, or a re-triggered job's
      // stale callback arriving late) — log and move on, not an error.
      this.logger.warn(`No menu item found for Tripo task ${result.taskId}`);
      return;
    }

    if (result.status === 'queued' || result.status === 'running') {
      return; // still working — nothing to do yet
    }

    if (result.status !== 'success') {
      // Spec §11.4: don't blindly retry a job that failed on bad input —
      // flag it for QA instead of silently resetting to pending.
      this.logger.warn(
        `Tripo task ${result.taskId} ended with status=${result.status}`,
      );
      await this.prisma.menuItem.update({
        where: { id: item.id },
        data: {
          arStatus: 'qa',
          qaNote: `3D generation did not succeed (status: ${result.status}, task ${result.taskId}).`,
        },
      });
      return;
    }

    if (!result.output?.modelUrl) {
      this.logger.error(
        `Tripo task ${result.taskId} succeeded but returned no model URL`,
      );
      await this.prisma.menuItem.update({
        where: { id: item.id },
        data: {
          arStatus: 'qa',
          qaNote: `3D generation succeeded but returned no model (task ${result.taskId}).`,
        },
      });
      return;
    }

    // Tripo's result URL expires in ~24h — download and re-host immediately,
    // never store their URL directly (spec §11.4).
    let glbBuffer = await this.downloadToBuffer(result.output.modelUrl);

    // Tripo returns models at an arbitrary normalized scale — resize to
    // the dish's true real-world width before anything else touches the
    // GLB, so both the hosted GLB and the USDZ derived from it are
    // life-size (documents/TASK-real-world-ar-sizing.md). triggerGeneration
    // requires widthMm before a job can even be submitted, so this should
    // always be set here; the `if` is defense in depth, not the norm.
    if (item.widthMm) {
      try {
        glbBuffer = await this.modelScaling.scaleToRealWidth(
          glbBuffer,
          item.widthMm,
        );
      } catch (err) {
        this.logger.error(
          `Real-world scaling failed for task ${result.taskId}: ${String(err)}`,
        );
        await this.prisma.menuItem.update({
          where: { id: item.id },
          data: {
            arStatus: 'qa',
            qaNote: `3D generation succeeded but real-world scaling failed (task ${result.taskId}). See server logs.`,
          },
        });
        return;
      }
    } else {
      this.logger.warn(
        `Item ${item.id} has no width_mm — Tripo task ${result.taskId}'s model will not be real-world scaled`,
      );
    }

    const { url: modelGlbUrl } = await this.storage.putObject({
      key: this.storage.generateKey('model-glb', 'glb'),
      body: glbBuffer,
      contentType: 'model/gltf-binary',
    });

    let previewImageUrl: string | null = null;
    if (result.output.renderedImageUrl) {
      try {
        const previewBuffer = await this.downloadToBuffer(
          result.output.renderedImageUrl,
        );
        const stored = await this.storage.putObject({
          key: this.storage.generateKey('model-preview', 'jpg'),
          body: previewBuffer,
          contentType: 'image/jpeg',
        });
        previewImageUrl = stored.url;
      } catch (err) {
        this.logger.warn(
          `Failed to re-host preview image for task ${result.taskId}: ${String(err)}`,
        );
      }
    }

    let modelUsdzUrl: string | null = null;
    let qaNote: string | null = null;
    try {
      const usdzBuffer = await this.usdz.convert(glbBuffer);
      const stored = await this.storage.putObject({
        key: this.storage.generateKey('model-usdz', 'usdz'),
        body: usdzBuffer,
        contentType: 'model/vnd.usdz+zip',
      });
      modelUsdzUrl = stored.url;
    } catch (err) {
      // Spec §11.3: an item isn't AR-ready without both files — leave
      // modelUsdzUrl unset and flag it. AdminService.approve refuses to
      // publish an item missing either URL, so this can't slip through.
      this.logger.warn(
        `USDZ conversion failed for task ${result.taskId}: ${String(err)}`,
      );
      qaNote = `GLB generated, but USDZ conversion failed (task ${result.taskId}). See server logs.`;
    }

    await this.prisma.menuItem.update({
      where: { id: item.id },
      data: {
        arStatus: 'qa',
        modelGlbUrl,
        modelUsdzUrl,
        previewImageUrl,
        qaNote,
      },
    });
    this.logger.log(
      `Item ${item.id}: Tripo task ${result.taskId} complete, moved to qa`,
    );
  }

  /** Poll fallback for missed webhooks (spec §11.1). */
  async pollPendingTasks(): Promise<number> {
    const cutoff = new Date(Date.now() - POLL_MIN_AGE_MS);
    const pending = await this.prisma.menuItem.findMany({
      where: {
        arStatus: 'generating',
        tripoTaskId: { not: null },
        updatedAt: { lt: cutoff },
      },
      select: { tripoTaskId: true },
    });

    for (const { tripoTaskId } of pending) {
      if (!tripoTaskId) continue;
      try {
        const result = await this.tripo.getTaskStatus(tripoTaskId);
        await this.handleTaskResult(result);
      } catch (err) {
        this.logger.error(
          `Poll failed for Tripo task ${tripoTaskId}: ${String(err)}`,
        );
      }
    }
    return pending.length;
  }

  private buildCallbackUrl(): string {
    const apiBaseUrl = (this.config.get<string>('API_BASE_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    const secret = this.config.get<string>('TRIPO_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException(
        '3D model generation is not configured (missing webhook secret)',
      );
    }
    return `${apiBaseUrl}/api/webhooks/tripo?token=${encodeURIComponent(secret)}`;
  }

  private async downloadToBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
