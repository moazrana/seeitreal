import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ModelMaterialService } from './model-material.service';
import { fetchWithRetry } from './fetch-retry';
import { TARGET_TRIANGLES } from './model-budget';
import { ModelOptimizationService } from './model-optimization.service';
import { ModelScalingService } from './model-scaling.service';
import { TripoClientService } from './tripo-client.service';
import { UsdzConversionService } from './usdz-conversion.service';
import {
  guidanceOptions,
  parseIssues,
  resolveIssues,
  serializeIssues,
  type RegenerationIssue,
} from './regeneration-guidance';
import type { TripoGenerationOptions, TripoTaskResult } from './tripo.types';

// Poll fallback only looks at jobs that have had a fair chance to arrive
// via webhook first (spec §11.2: webhook preferred, polling is fallback).
// Kept short: a missed webhook shouldn't add minutes to a ~1-minute job.
const POLL_MIN_AGE_MS = 30 * 1000;

// Tripo's multiview endpoint has a fixed max input count. If an owner
// uploaded more than this, we cap it here — see
// TripoClientService.submitMultiviewToModel's doc comment for why (we
// don't capture per-photo angle labels to pick "the most distinct" by, so
// this takes the first N in upload order).
const MAX_MULTIVIEW_IMAGES = 4;

// Every submit is a paid Tripo call. Without a cap, any new signup could
// burn credits by creating dishes and generating repeatedly. Overridable
// with TRIPO_DAILY_GENERATIONS_PER_USER.
const DEFAULT_DAILY_GENERATIONS_PER_USER = 20;
// Admins regenerate across every restaurant, so their cap is higher.
// Overridable with TRIPO_DAILY_GENERATIONS_PER_ADMIN.
const DEFAULT_DAILY_GENERATIONS_PER_ADMIN = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    private readonly modelOptimization: ModelOptimizationService,
    private readonly modelMaterial: ModelMaterialService,
    private readonly config: ConfigService,
  ) {}

  /** Owner-triggered: kick off generation for one menu item (spec §4.4, §11.1). */
  async triggerGeneration(
    restaurantId: number,
    itemId: number,
    user: AuthenticatedUser,
  ) {
    await this.restaurants.assertOwnership(restaurantId, user);
    const item = await this.loadItemWithPhotos(itemId);
    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException('Item not found');
    }
    const photoUrls = this.photoUrlsOf(item);
    // The item's own status is the debounce/guard (spec §7.4): only a
    // freshly-created or freshly-photographed item can trigger a job, so
    // a user can't fire this repeatedly while one is already in flight.
    if (item.arStatus !== 'pending') {
      throw new BadRequestException(
        `Cannot start generation while item is in "${item.arStatus}" status`,
      );
    }
    await this.assertUnderDailyCap({ userId: user.userId });

    // After an admin rejection, the next generation addresses what the
    // admin flagged (qaIssues, or keywords in the rejection note).
    const guidance = item.qaNote
      ? guidanceOptions(resolveIssues(item.qaNote, parseIssues(item.qaIssues)))
      : {};
    const taskId = await this.submitJob(itemId, photoUrls, guidance);

    const [updated] = await this.prisma.$transaction([
      this.prisma.menuItem.update({
        where: { id: itemId },
        data: {
          arStatus: 'generating',
          tripoTaskId: taskId,
          qaNote: null,
          qaIssues: null,
        },
      }),
      this.prisma.modelGeneration.create({
        data: {
          restaurantId,
          userId: user.userId,
          menuItemId: itemId,
          tripoTaskId: taskId,
        },
      }),
    ]);
    return updated;
  }

  /**
   * Admin-triggered regeneration from the Root App QA screen, for a model
   * awaiting QA or already live. The admin's reason is kept on the item
   * (shown to the owner) and its flagged issues steer the new job's
   * settings. A live dish leaves the diner page until the new model is
   * approved.
   */
  async regenerateAsAdmin(
    itemId: number,
    rootAdminId: number,
    note: string,
    issues?: readonly RegenerationIssue[],
  ) {
    const item = await this.loadItemWithPhotos(itemId);
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    if (item.arStatus !== 'qa' && item.arStatus !== 'live') {
      throw new BadRequestException(
        `Cannot regenerate while item is in "${item.arStatus}" status`,
      );
    }
    const photoUrls = this.photoUrlsOf(item);
    await this.assertUnderDailyCap({ rootAdminId });

    const resolved = resolveIssues(note, issues);
    const taskId = await this.submitJob(
      itemId,
      photoUrls,
      guidanceOptions(resolved),
    );

    const [updated] = await this.prisma.$transaction([
      this.prisma.menuItem.update({
        where: { id: itemId },
        data: {
          arStatus: 'generating',
          tripoTaskId: taskId,
          qaNote: note,
          qaIssues: serializeIssues(resolved),
          // A new job supersedes any QA preview link for the old model.
          previewLinkNonce: null,
          previewLinkExpiresAt: null,
        },
      }),
      this.prisma.modelGeneration.create({
        data: {
          restaurantId: item.restaurantId,
          rootAdminId,
          menuItemId: itemId,
          tripoTaskId: taskId,
        },
      }),
    ]);
    return updated;
  }

  private loadItemWithPhotos(itemId: number) {
    return this.prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  private photoUrlsOf(item: {
    photos?: { url: string }[];
    photoUrl: string | null;
  }): string[] {
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
    return photoUrls;
  }

  /** Submits one paid Tripo job and returns its task id. */
  private async submitJob(
    itemId: number,
    photoUrls: string[],
    guidance: Partial<TripoGenerationOptions>,
  ): Promise<string> {
    const generationOptions: TripoGenerationOptions = {
      texture: true,
      // Off by default: PBR maps lengthen every job. Metallic is forced to
      // 0 afterwards either way (ModelMaterialService), so turning it on —
      // via TRIPO_PBR=true or "wrong colors" guidance — never brings back
      // the chrome look.
      pbr: this.config.get<string>('TRIPO_PBR') === 'true',
      // 'standard' by default — 'detailed' texturing noticeably lengthens
      // every job; set TRIPO_TEXTURE_QUALITY=detailed to trade speed back
      // for texture sharpness.
      textureQuality:
        this.config.get<string>('TRIPO_TEXTURE_QUALITY') ?? 'standard',
      faceLimit: this.faceLimit(),
      callbackUrl: this.buildCallbackUrl(),
      ...guidance,
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
    return taskId;
  }

  /** 429 once the user (rolling 24 hours, across all their restaurants)
   * or admin has submitted their daily number of Tripo jobs. */
  private async assertUnderDailyCap(
    who: { userId: number } | { rootAdminId: number },
  ): Promise<void> {
    const isAdmin = 'rootAdminId' in who;
    const raw = this.config.get<string>(
      isAdmin
        ? 'TRIPO_DAILY_GENERATIONS_PER_ADMIN'
        : 'TRIPO_DAILY_GENERATIONS_PER_USER',
    );
    const fallback = isAdmin
      ? DEFAULT_DAILY_GENERATIONS_PER_ADMIN
      : DEFAULT_DAILY_GENERATIONS_PER_USER;
    const limit = raw === undefined || raw === '' ? fallback : Number(raw);
    const recent = await this.prisma.modelGeneration.count({
      where: { ...who, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= limit) {
      this.logger.warn(
        `${isAdmin ? 'Admin' : 'User'} ${Object.values(who)[0]} hit the daily 3D generation cap (${limit})`,
      );
      throw new HttpException(
        `Daily 3D generation limit reached (${limit} per 24 hours). Please try again later.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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

    // The preview thumbnail doesn't depend on the model — re-host it while
    // the GLB is processed instead of after (never rejects).
    const previewPromise = this.rehostPreview(result.taskId, result.output);

    // Tripo's result URL expires in ~24h — download and re-host immediately,
    // never store their URL directly (spec §11.4).
    let glbBuffer = await this.downloadToBuffer(result.output.modelUrl);

    // Tripo returns models at an arbitrary normalized scale — resize to
    // the dish's real footprint before anything else touches the GLB, so
    // both the hosted GLB and the USDZ derived from it are life-size
    // (documents/TASK-real-world-ar-sizing.md). Dimensions are optional:
    // without them the model gets the default plate-sized footprint rather
    // than Tripo's arbitrary (often metre-scale) size.
    try {
      glbBuffer = await this.modelScaling.scaleToRealSize(glbBuffer, {
        widthMm: item.widthMm,
        lengthMm: item.lengthMm,
      });
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

    // ~1.4M triangles -> ~150k: the difference between a slow and a fast
    // AR load on phones. Before USDZ conversion, so iOS benefits too.
    glbBuffer = await this.modelOptimization.optimizeOrOriginal(
      glbBuffer,
      `Tripo task ${result.taskId}`,
    );
    // After optimizing (a smaller file to rewrite), before the GLB is
    // stored and converted, so neither format renders the dish as chrome.
    glbBuffer = await this.modelMaterial.makeNonMetallic(
      glbBuffer,
      `Tripo task ${result.taskId}`,
    );

    // Uploading the GLB and converting it to USDZ are independent — run
    // them together rather than back to back.
    const [{ url: modelGlbUrl }, { modelUsdzUrl, qaNote }, previewImageUrl] =
      await Promise.all([
        this.storage.putObject({
          key: this.storage.generateKey('model-glb', 'glb'),
          body: glbBuffer,
          contentType: 'model/gltf-binary',
        }),
        this.convertAndStoreUsdz(glbBuffer, result.taskId),
        previewPromise,
      ]);

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

  /** Best-effort: a missing preview never blocks the model from QA. */
  private async rehostPreview(
    taskId: string,
    output: NonNullable<TripoTaskResult['output']>,
  ): Promise<string | null> {
    if (!output.renderedImageUrl) return null;
    try {
      const previewBuffer = await this.downloadToBuffer(
        output.renderedImageUrl,
      );
      const stored = await this.storage.putObject({
        key: this.storage.generateKey('model-preview', 'jpg'),
        body: previewBuffer,
        contentType: 'image/jpeg',
      });
      return stored.url;
    } catch (err) {
      this.logger.warn(
        `Failed to re-host preview image for task ${taskId}: ${String(err)}`,
      );
      return null;
    }
  }

  /** Never rejects — a failed conversion becomes a QA note instead. */
  private async convertAndStoreUsdz(
    glbBuffer: Buffer,
    taskId: string,
  ): Promise<{ modelUsdzUrl: string | null; qaNote: string | null }> {
    try {
      const usdzBuffer = await this.usdz.convert(glbBuffer);
      const stored = await this.storage.putObject({
        key: this.storage.generateKey('model-usdz', 'usdz'),
        body: usdzBuffer,
        contentType: 'model/vnd.usdz+zip',
      });
      return { modelUsdzUrl: stored.url, qaNote: null };
    } catch (err) {
      // Spec §11.3: an item isn't AR-ready without both files — leave
      // modelUsdzUrl unset and flag it. AdminService.approve refuses to
      // publish an item missing either URL, so this can't slip through.
      this.logger.warn(
        `USDZ conversion failed for task ${taskId}: ${String(err)}`,
      );
      return {
        modelUsdzUrl: null,
        qaNote: `GLB generated, but USDZ conversion failed (task ${taskId}). See server logs.`,
      };
    }
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

  /** TRIPO_FACE_LIMIT, defaulting to our own optimization budget; 0
   * leaves the face count to Tripo. */
  private faceLimit(): number | undefined {
    const raw = this.config.get<string>('TRIPO_FACE_LIMIT');
    const limit =
      raw === undefined || raw === '' ? TARGET_TRIANGLES : Number(raw);
    return limit > 0 ? limit : undefined;
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
    const res = await fetchWithRetry(url, {}, { idempotent: true });
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
