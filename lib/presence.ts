import { Redis } from "@upstash/redis";

/**
 * Approximate live spectator presence via short-lived heartbeats.
 * Redis ZSET score = expiry ms; memory Map for local/dev without Redis.
 */
const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.tnhvpl_KV_REST_API_URL;
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.tnhvpl_KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

/** How long a heartbeat keeps a viewer alive (ms). */
export const PRESENCE_TTL_MS = 35_000;
/** Client should beat about this often. */
export const PRESENCE_BEAT_MS = 12_000;

const g = globalThis as unknown as { __presence?: Map<string, Map<string, number>> };
const mem = (g.__presence ??= new Map());

/** Short process-local cache so GET stamps under load skip Redis. */
const countCache = new Map<string, { n: number; until: number }>();
const COUNT_CACHE_MS = 1_500;

export type PresenceKind = "t" | "p";

export function presenceKey(kind: PresenceKind, id: string, season?: string | null): string {
  if (kind === "p") return `presence:p:${id}`;
  return `presence:t:${season || "default"}:${id}`;
}

function pruneMem(bucket: Map<string, number>, now: number) {
  for (const [vid, exp] of bucket) {
    if (exp <= now) bucket.delete(vid);
  }
}

function cacheCount(key: string, n: number): number {
  countCache.set(key, { n, until: Date.now() + COUNT_CACHE_MS });
  return n;
}

function cachedCount(key: string): number | null {
  const hit = countCache.get(key);
  if (!hit) return null;
  if (hit.until < Date.now()) {
    countCache.delete(key);
    return null;
  }
  return hit.n;
}

/** Record a spectator heartbeat; returns current approximate count. */
export async function heartbeat(
  kind: PresenceKind,
  id: string,
  viewerId: string,
  season?: string | null,
): Promise<number> {
  const key = presenceKey(kind, id, season);
  const now = Date.now();
  const exp = now + PRESENCE_TTL_MS;

  if (redis) {
    const pipe = redis.pipeline();
    pipe.zadd(key, { score: exp, member: viewerId });
    pipe.zremrangebyscore(key, 0, now);
    pipe.expire(key, Math.ceil(PRESENCE_TTL_MS / 1000) + 60);
    pipe.zcard(key);
    const res = await pipe.exec();
    const n = Number(res?.[3] ?? 0);
    return cacheCount(key, Number.isFinite(n) ? n : 0);
  }

  let bucket = mem.get(key);
  if (!bucket) {
    bucket = new Map();
    mem.set(key, bucket);
  }
  pruneMem(bucket, now);
  bucket.set(viewerId, exp);
  return cacheCount(key, bucket.size);
}

/** Approximate spectator count (no heartbeat). */
export async function countViewers(
  kind: PresenceKind,
  id: string,
  season?: string | null,
): Promise<number> {
  const key = presenceKey(kind, id, season);
  const hit = cachedCount(key);
  if (hit != null) return hit;
  const now = Date.now();

  if (redis) {
    // Count only non-expired members; prune on heartbeat instead of every GET.
    const n = await redis.zcount(key, now, "+inf");
    return cacheCount(key, Number(n) || 0);
  }

  const bucket = mem.get(key);
  if (!bucket) return cacheCount(key, 0);
  pruneMem(bucket, now);
  if (bucket.size === 0) mem.delete(key);
  return cacheCount(key, bucket.size);
}

export async function countMany(
  kind: PresenceKind,
  ids: string[],
  season?: string | null,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!ids.length) return out;

  if (redis) {
    const now = Date.now();
    const keys = ids.map((id) => presenceKey(kind, id, season));
    const missing: { id: string; key: string; i: number }[] = [];
    ids.forEach((id, i) => {
      const key = keys[i]!;
      const hit = cachedCount(key);
      if (hit != null) out[id] = hit;
      else missing.push({ id, key, i });
    });
    if (missing.length) {
      const pipe = redis.pipeline();
      for (const m of missing) pipe.zcount(m.key, now, "+inf");
      const res = await pipe.exec();
      missing.forEach((m, j) => {
        const n = Number(res?.[j] ?? 0) || 0;
        out[m.id] = cacheCount(m.key, n);
      });
    }
    return out;
  }

  await Promise.all(
    ids.map(async (id) => {
      out[id] = await countViewers(kind, id, season);
    }),
  );
  return out;
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const VIEWER_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function validPresenceId(id: string): boolean {
  return ID_RE.test(id);
}

export function validViewerId(id: string): boolean {
  return VIEWER_RE.test(id);
}
