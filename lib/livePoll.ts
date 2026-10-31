/** Spectator poll cadence — faster while any match is live. */
export const LIVE_POLL_MS = 1_000;
export const IDLE_POLL_MS = 3_000;

/** Edge Cache-Control for public `/api/state` (scorers use ?fresh → no-store). */
export const STATE_EDGE_CACHE =
  "public, max-age=0, s-maxage=1, stale-while-revalidate=1";

export function pollIntervalMs(live: boolean): number {
  return live ? LIVE_POLL_MS : IDLE_POLL_MS;
}

/**
 * Delay until the next poll so a slow `/api/state` does not stack full intervals
 * on top of the request time (which stretched viewer lag under load).
 */
export function nextPollDelayMs(live: boolean, elapsedMs: number, minMs = 200): number {
  return Math.max(minMs, pollIntervalMs(live) - Math.max(0, elapsedMs));
}

export function stateCacheControl(fresh: boolean): string {
  return fresh ? "no-store" : STATE_EDGE_CACHE;
}

/** True when any derived match is currently live. */
export function anyMatchLive(ms: Record<string, { status?: string }> | null | undefined): boolean {
  if (!ms) return false;
  for (const m of Object.values(ms)) {
    if (m?.status === "live") return true;
  }
  return false;
}
