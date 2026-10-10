/**
 * Tripo v3 API types, synthesized from public documentation (spec §11 plus
 * https://platform.tripo3d.ai/docs and https://developers.tripo3d.ai —
 * both are JS-rendered apps this environment couldn't fully scrape, and
 * third-party mirrors/aggregators disagree slightly on exact field names).
 *
 * TripoTaskStatus confirmed 2026-08-18 against a real Tripo account/task on
 * staging: the original guess ('pending'/'processing') was wrong — Tripo
 * actually returns 'queued'/'running', which silently fell through to the
 * "ended in failure" branch in TripoGenerationService and flagged a
 * still-running item for QA. Full 8-value enum confirmed via
 * https://github.com/VAST-AI-Research/tripo-python-sdk/blob/master/docs/API.md.
 * The rest of the wire format (request/response field names) is still
 * unverified — isolated in TripoClientService's private request-builder /
 * response-parser methods if something else turns out to be off.
 */

export type TripoTaskStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'unknown'
  | 'banned'
  | 'expired';

export interface TripoSubmitResult {
  taskId: string;
}

export interface TripoTaskResult {
  taskId: string;
  status: TripoTaskStatus;
  progress: number;
  /** Present only when status === 'success'. */
  output?: {
    modelUrl: string;
    renderedImageUrl?: string;
  };
}

export interface TripoGenerationOptions {
  texture?: boolean;
  pbr?: boolean;
  /** Highest-quality texture option available (documents/3d-model-enhancement.md
   * §2), e.g. 'detailed'. Configurable via TRIPO_TEXTURE_QUALITY, not
   * hardcoded, so it can be tuned without a code change. Omitted from the
   * request body entirely when unset, rather than guessing a value. */
  textureQuality?: string;
  /** Upper bound on the generated mesh's face count. Tripo otherwise
   * returns ~1.4M triangles that we only shrink to ~150k afterwards;
   * asking for the budget up front cuts generation, download and
   * optimization time. Omitted from the request when unset. */
  faceLimit?: number;
  /** Regeneration guidance (regeneration-guidance.ts): fresh seeds make a
   * regenerated model actually differ from the rejected one, and
   * 'original_image' alignment keeps texture colors closer to the photo. */
  modelSeed?: number;
  textureSeed?: number;
  textureAlignment?: 'original_image' | 'geometry';
  /** Tripo notifies this URL via POST when the task finishes (spec §11.1).
   * We append a shared-secret token as a query param for verification. */
  callbackUrl?: string;
}
