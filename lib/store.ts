import { Redis } from "@upstash/redis";
import { normalizeAwards } from "./awards";
import { defaultConfig, defaultSettings, players } from "./defaults";
import type { AppState, Config, MatchDoc } from "./types";

/**
 * Storage: Upstash Redis when its env vars are present (Vercel → Storage → Upstash for Redis),
 * otherwise an in-memory store that is fine for local testing but is NOT shared between
 * serverless instances, so it must not be used for the real event.
 */
// Prefer standard names; also accept Vercel Storage's project-prefixed names
// (e.g. tnhvpl_KV_*) when those were created because the unprefixed vars already existed.
const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.tnhvpl_KV_REST_API_URL;
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.tnhvpl_KV_REST_API_TOKEN;
const PREFIX = process.env.TOURNAMENT_KEY || "tnhvpl-s5";

const redis = url && token ? new Redis({ url, token }) : null;
const g = globalThis as unknown as { __mem?: Map<string, string> };
const mem = (g.__mem ??= new Map<string, string>());

export const storageKind: AppState["storage"] = redis ? "redis" : "memory";

const cfgKey = `${PREFIX}:config`;
const matchKey = (id: string) => `${PREFIX}:m:${id}`;

// Compare-and-set: write only if the stored version still equals the one we read.
const CAS = `
local cur = redis.call('GET', KEYS[1])
local expected = tonumber(ARGV[2])
if cur then
  local ok, d = pcall(cjson.decode, cur)
  local v = 0
  if ok and type(d) == 'table' and d.v then v = tonumber(d.v) end
  if v ~= expected then return 0 end
elseif expected ~= 0 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1])
return 1`;

async function readRaw<T>(keys: string[]): Promise<(T | null)[]> {
  if (redis) {
    if (!keys.length) return [];
    return (await redis.mget<(T | null)[]>(...keys)) as (T | null)[];
  }
  return keys.map((k) => (mem.has(k) ? (JSON.parse(mem.get(k)!) as T) : null));
}

async function cas(key: string, value: { v: number }, expected: number): Promise<boolean> {
  const json = JSON.stringify(value);
  if (redis) {
    const r = await redis.eval(CAS, [key], [json, String(expected)]);
    return Number(r) === 1;
  }
  const cur = mem.get(key);
  const v = cur ? Number(JSON.parse(cur).v ?? 0) : 0;
  if (v !== expected) return false;
  mem.set(key, json);
  return true;
}

function normalizeConfig(cfg: Config | null, fallback: Config): Config {
  const config = cfg ?? fallback;
  const sec = config.settings?.timeoutSeconds;
  const awards = normalizeAwards(config.awards);
  if (!Number.isInteger(sec) || (sec as number) < 5 || (sec as number) > 300) {
    return {
      ...config,
      awards,
      settings: { ...defaultSettings, ...config.settings, timeoutSeconds: defaultSettings.timeoutSeconds },
    };
  }
  return { ...config, awards };
}

export async function loadState(): Promise<AppState> {
  const base = defaultConfig();
  const keys = [cfgKey, ...base.fixtures.map((f) => matchKey(f.id))];
  const [cfg, ...ms] = await readRaw<Config | MatchDoc>(keys);
  const config = normalizeConfig(cfg as Config | null, base);
  const matches: Record<string, MatchDoc> = {};
  config.fixtures.forEach((f, i) => {
    matches[f.id] = (ms[i] as MatchDoc) ?? { v: 0, ev: [] };
  });
  return { config, players, matches, storage: storageKind, serverTime: Date.now() };
}

async function update<T extends { v: number }>(key: string, fallback: () => T, fn: (cur: T) => T | string): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const [cur] = await readRaw<T>([key]);
    const base = cur ?? fallback();
    const next = fn(structuredClone(base));
    if (typeof next === "string") throw new ActionError(next);
    next.v = (base.v ?? 0) + 1;
    if (await cas(key, next, base.v ?? 0)) return next;
  }
  throw new ActionError("Busy, please try again");
}

export class ActionError extends Error {}

export const updateConfig = (fn: (c: Config) => Config | string) => update<Config>(cfgKey, defaultConfig, fn);
export const updateMatch = (id: string, fn: (m: MatchDoc) => MatchDoc | string) =>
  update<MatchDoc>(matchKey(id), () => ({ v: 0, ev: [] }), fn);

export async function resetAll() {
  const base = defaultConfig();
  const keys = [cfgKey, ...base.fixtures.map((f) => matchKey(f.id))];
  if (redis) await redis.del(...keys);
  else keys.forEach((k) => mem.delete(k));
}
