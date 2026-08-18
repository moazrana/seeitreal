/**
 * Tripo v3 API types, synthesized from public documentation (spec §11 plus
 * https://platform.tripo3d.ai/docs and https://developers.tripo3d.ai —
 * both are JS-rendered apps this environment couldn't fully scrape, and
 * third-party mirrors/aggregators disagree slightly on exact field names).
 *
 * VERIFY BEFORE PRODUCTION USE: no request in this module has been made
 * against a real Tripo account (no API key was available while building
 * this). The wire format is isolated entirely in TripoClientService's
 * private request-builder / response-parser methods — if field names are
 * off, that's the only place to fix.
 */

export type TripoTaskStatus =
  'pending' | 'processing' | 'success' | 'failed' | 'cancelled' | 'banned';

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
