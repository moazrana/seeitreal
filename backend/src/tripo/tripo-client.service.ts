import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TripoGenerationOptions,
  TripoSubmitResult,
  TripoTaskResult,
  TripoTaskStatus,
} from './tripo.types';

const DEFAULT_BASE_URL = 'https://openapi.tripo3d.ai/v3';

/**
 * Thin wrapper around the Tripo REST API. Server-side only — the API key
 * never leaves this process (spec §11.4: browser → our API → Tripo only,
 * key never reaches the frontend).
 *
 * All Tripo-specific wire format lives in the private request-builder /
 * response-parser methods below (`buildSubmitBody`, `submitMultiviewToModel`'s
 * body, `parseTaskResult`) — see tripo.types.ts for why this needs a live
 * sanity check before production use.
 */
@Injectable()
export class TripoClientService {
  private readonly logger = new Logger(TripoClientService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('TRIPO_BASE_URL') ?? DEFAULT_BASE_URL;
  }

  async submitImageToModel(
    imageUrl: string,
    options: TripoGenerationOptions = {},
  ): Promise<TripoSubmitResult> {
    return this.submit(
      'generation/image-to-model',
      this.buildSubmitBody(imageUrl, options),
    );
  }

  /**
   * Multiview generation (documents/3d-model-enhancement.md §1) — 2-5 input
   * photos of the same dish reconstructed from real angles instead of the
   * AI hallucinating unseen sides. `imageUrls` must already be capped to
   * whatever Tripo's multiview endpoint accepts (the caller,
   * TripoGenerationService, caps at 4 and picks the most distinct angles
   * available — we don't capture per-photo angle labels from the owner).
   *
   * Endpoint/body shape extrapolated from the single-image call above (same
   * `file: {type, url}` shape, pluralized to `files: [...]`) — like the
   * rest of this file's request-builder, this is NOT yet confirmed against
   * a live task reaching 'success' and needs a real smoke test before
   * production use; only `submitImageToModel`'s single-image shape has been
   * confirmed live (see tripo.types.ts).
   */
  async submitMultiviewToModel(
    imageUrls: string[],
    options: TripoGenerationOptions = {},
  ): Promise<TripoSubmitResult> {
    if (imageUrls.length < 2) {
      throw new InternalServerErrorException(
        'Multiview generation requires at least 2 images',
      );
    }
    const body: Record<string, unknown> = {
      files: imageUrls.map((url) => ({
        type: this.imageTypeFromUrl(url),
        url,
      })),
      model: this.config.get<string>('TRIPO_MODEL_VERSION') ?? 'v3.1-20260211',
      texture: options.texture ?? true,
      pbr: options.pbr ?? true,
    };
    if (options.textureQuality) {
      body.texture_quality = options.textureQuality;
    }
    if (options.callbackUrl) {
      body.callback_url = options.callbackUrl;
    }
    return this.submit('generation/multiview-to-model', body);
  }

  private async submit(
    path: string,
    body: Record<string, unknown>,
  ): Promise<TripoSubmitResult> {
    const res = await fetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      this.logger.error(
        `Tripo submit (${path}) failed: ${res.status} ${bodyText}`,
      );
      throw new InternalServerErrorException(
        '3D model generation could not be started',
      );
    }

    const json = (await res.json()) as { data?: { task_id?: string } };
    const taskId = json.data?.task_id;
    if (!taskId) {
      this.logger.error(
        `Tripo submit (${path}) returned no task_id: ${JSON.stringify(json)}`,
      );
      throw new InternalServerErrorException(
        '3D model generation could not be started',
      );
    }

    this.logger.log(`Submitted Tripo task ${taskId} (${path})`);
    return { taskId };
  }

  async getTaskStatus(taskId: string): Promise<TripoTaskResult> {
    const res = await fetch(
      `${this.baseUrl}/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey()}` },
      },
    );

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      this.logger.error(
        `Tripo status check failed for ${taskId}: ${res.status} ${bodyText}`,
      );
      throw new InternalServerErrorException(
        'Could not check 3D model generation status',
      );
    }

    return this.parseTaskResult(await res.json());
  }

  /** Exposed so the webhook controller can parse Tripo's callback payload
   * with the same logic used for polling (spec says the callback body has
   * "the same shape as the status response"). */
  parseWebhookPayload(json: unknown): TripoTaskResult {
    return this.parseTaskResult(json);
  }

  private buildSubmitBody(
    imageUrl: string,
    options: TripoGenerationOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      // `file` is a discriminated object, not a bare URL string — a plain
      // string 400s with "no String-argument constructor/factory method to
      // deserialize" (confirmed live against a real Tripo account). The
      // `type` sub-field is the *image* format (jpg/png), required
      // alongside whichever of file_token/url/object identifies the image.
      // We always have a public HTTPS URL already (photo re-hosted on our
      // own storage before this is called), so we use the `url` variant.
      file: {
        type: this.imageTypeFromUrl(imageUrl),
        url: imageUrl,
      },
      // `model` is required — confirmed live: a submit without it 400s
      // with "model is required, allowed values: ...". Overridable via env
      // so a new model version doesn't require a code change/redeploy.
      model: this.config.get<string>('TRIPO_MODEL_VERSION') ?? 'v3.1-20260211',
      texture: options.texture ?? true,
      pbr: options.pbr ?? true,
    };
    if (options.textureQuality) {
      body.texture_quality = options.textureQuality;
    }
    if (options.callbackUrl) {
      body.callback_url = options.callbackUrl;
    }
    return body;
  }

  /** Declares the *actual* format of the bytes at imageUrl — our own
   * storage always re-encodes uploads to webp (spec §7.5 EXIF-strip step).
   * Some third-party docs claim the URL-based `file.type` only accepts
   * jpg/png, but lying about the declared type risks a decode mismatch if
   * Tripo trusts this field over sniffing the bytes; pass the true value
   * and let a real 400 (if any) name the accepted enum, same as the
   * file-shape bug this replaced — not yet confirmed against a live task
   * reaching 'success'. */
  private imageTypeFromUrl(imageUrl: string): string {
    const ext = imageUrl.split('.').pop()?.toLowerCase().split('?')[0];
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
    if (ext === 'png') return 'png';
    if (ext === 'webp') return 'webp';
    this.logger.warn(
      `Unrecognized image extension for Tripo submit, defaulting to jpg: ${imageUrl}`,
    );
    return 'jpg';
  }

  private parseTaskResult(json: unknown): TripoTaskResult {
    const data = (json as { data?: Record<string, unknown> }).data ?? {};
    const status = data.status as TripoTaskStatus;
    const output = data.output as Record<string, string> | undefined;

    return {
      taskId: typeof data.task_id === 'string' ? data.task_id : '',
      status,
      progress: typeof data.progress === 'number' ? data.progress : 0,
      output: output
        ? {
            // Prefer the PBR/textured variant when present (we always
            // request texture+pbr), falling back to the base model URL.
            modelUrl:
              output.pbr_model_url ?? output.model_url ?? output.base_model_url,
            renderedImageUrl: output.rendered_image_url,
          }
        : undefined,
    };
  }

  private apiKey(): string {
    const key = this.config.get<string>('TRIPO_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        '3D model generation is not configured',
      );
    }
    return key;
  }
}
