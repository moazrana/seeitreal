import { useEffect, useRef } from 'react';
import { ApiError } from '../api/client';

// Back off when the API says we're over the rate limit (spec §7.4) instead
// of hammering it; resume the normal cadence after the next success.
const RATE_LIMITED_BACKOFF_MS = 60_000;

interface LiveRefreshOptions {
  /** Delay between refreshes while the tab is visible. */
  intervalMs: number;
  enabled?: boolean;
}

/**
 * Keeps a page's data current without a manual reload ("live app"):
 * re-runs `refresh` on an interval while the tab is visible, immediately
 * when the tab regains focus/visibility, and never while hidden.
 *
 * Deliberately polling the existing authenticated REST endpoints rather
 * than a push channel: every refresh goes through the same JWT guard and
 * per-restaurant ownership checks as a normal request, works across any
 * number of API instances, and needs no long-lived connection state.
 *
 * `refresh` must be a background refresh — it should not surface
 * transient errors to the user (the next tick retries). Requests never
 * overlap: a slow response delays the next tick instead of stacking.
 */
export function useLiveRefresh(
  refresh: () => Promise<unknown>,
  { intervalMs, enabled = true }: LiveRefreshOptions,
) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;
    let inFlight = false;
    let stopped = false;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (!stopped && document.visibilityState === 'visible') {
        timer = window.setTimeout(() => void tick(), delay);
      }
    };

    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      let delay = intervalMs;
      try {
        await refreshRef.current();
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          delay = RATE_LIMITED_BACKOFF_MS;
        }
      } finally {
        inFlight = false;
      }
      schedule(delay);
    };

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        void tick();
      } else {
        window.clearTimeout(timer);
      }
    };

    schedule(intervalMs);
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [intervalMs, enabled]);
}
