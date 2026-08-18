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
  /** Tripo notifies this URL via POST when the task finishes (spec §11.1).
   * We append a shared-secret token as a query param for verification. */
  callbackUrl?: string;
}
