/**
 * The staging server's link to Tripo (US West) is slow and lossy: TLS
 * handshakes take 4-11s, and Node's fetch gives up connecting after 10s
 * with "TypeError: fetch failed". These helpers retry such network-level
 * failures; HTTP error responses are returned as-is, never retried here.
 */

const RETRY_DELAYS_MS = [1_000, 3_000];

// Failures where the request never reached the server, so retrying can't
// create a duplicate (e.g. a second paid Tripo task).
const CONNECT_PHASE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

function causeCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

/** True for fetch's own network failure (a TypeError), not HTTP errors. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function isConnectPhaseError(err: unknown): boolean {
  const code = causeCode(err);
  return isNetworkError(err) && !!code && CONNECT_PHASE_CODES.has(code);
}

/**
 * fetch with retries. `idempotent` requests (GETs, downloads) retry any
 * network failure; others (a paid submit) retry only failures where the
 * request provably never left this machine.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { idempotent }: { idempotent: boolean },
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const retryable = idempotent
        ? isNetworkError(err)
        : isConnectPhaseError(err);
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
