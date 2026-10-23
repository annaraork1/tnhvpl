import { readRaw, writeRaw } from "./store";

/** Simple sliding counter in Redis/memory with TTL-ish expiry via stored until. */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; remaining: number }> {
  const full = `tnhvpl:rl:${key}`;
  const now = Date.now();
  const [cur] = await readRaw<{ count: number; resetAt: number }>([full]);
  if (!cur || cur.resetAt < now) {
    await writeRaw(full, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0 };
  const next = { count: cur.count + 1, resetAt: cur.resetAt };
  await writeRaw(full, next);
  return { ok: true, remaining: limit - next.count };
}
