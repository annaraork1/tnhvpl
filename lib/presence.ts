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
    await redis.zadd(key, { score: exp, member: viewerId });
    await redis.zremrangebyscore(key, 0, now);
    await redis.expire(key, Math.ceil(PRESENCE_TTL_MS / 1000) + 60);
    return await redis.zcard(key);
  }

  let bucket = mem.get(key);
  if (!bucket) {
    bucket = new Map();
    mem.set(key, bucket);
  }
  pruneMem(bucket, now);
  bucket.set(viewerId, exp);
  return bucket.size;
}

/** Approximate spectator count (no heartbeat). */
export async function countViewers(
  kind: PresenceKind,
  id: string,
  season?: string | null,
): Promise<number> {
  const key = presenceKey(kind, id, season);
  const now = Date.now();

  if (redis) {
    await redis.zremrangebyscore(key, 0, now);
    return await redis.zcard(key);
  }

  const bucket = mem.get(key);
  if (!bucket) return 0;
  pruneMem(bucket, now);
  if (bucket.size === 0) mem.delete(key);
  return bucket.size;
}

export async function countMany(
  kind: PresenceKind,
  ids: string[],
  season?: string | null,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
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
