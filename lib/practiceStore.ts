import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { derive } from "./engine";
import { resultFromEvents } from "./practiceResult";
import {
  defaultPracticeFormat,
  type PracticeIndex,
  type PracticeLiveRef,
  type PracticeMatch,
  type PracticeMatchPublic,
  type PracticePlayer,
  type PracticeSummary,
} from "./practiceTypes";
import type { Format, MatchState } from "./types";

export { defaultPracticeFormat, resultFromEvents };

/** Global practice keys — never under a tournament prefix. */
export const PRACTICE_INDEX_KEY = "tnhvpl:practice:index";
const practiceMatchKey = (id: string) => `tnhvpl:practice:m:${id}`;

const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.tnhvpl_KV_REST_API_URL;
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.tnhvpl_KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;
const g = globalThis as unknown as { __mem?: Map<string, string> };
const mem = (g.__mem ??= new Map<string, string>());

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

async function delKey(key: string) {
  if (redis) await redis.del(key);
  else mem.delete(key);
}

async function updateDoc<T extends { v: number }>(
  key: string,
  fallback: () => T,
  fn: (cur: T) => T | string,
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const [cur] = await readRaw<T>([key]);
    const base = cur ?? fallback();
    const next = fn(structuredClone(base));
    if (typeof next === "string") throw new PracticeError(next);
    next.v = (base.v ?? 0) + 1;
    if (await cas(key, next, base.v ?? 0)) return next;
  }
  throw new PracticeError("Busy, please try again");
}

export class PracticeError extends Error {}

export function hashHostToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function newHostToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newPracticeId(): string {
  return `p_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function emptyIndex(): PracticeIndex {
  return { v: 0, matches: [], live: [] };
}

function liveList(idx: PracticeIndex): PracticeLiveRef[] {
  return Array.isArray(idx.live) ? idx.live : [];
}

async function trackLivePractice(id: string, createdAt: number) {
  await updateDoc(PRACTICE_INDEX_KEY, emptyIndex, (idx) => {
    const live = liveList(idx).filter((x) => x.id !== id);
    live.unshift({ id, createdAt });
    return { ...idx, live: live.slice(0, 40) };
  });
}

async function untrackLivePractice(id: string) {
  await updateDoc(PRACTICE_INDEX_KEY, emptyIndex, (idx) => ({
    ...idx,
    live: liveList(idx).filter((x) => x.id !== id),
  }));
}

/** Re-index an open live practice (backfill matches created before the live board existed). */
export async function ensureLiveTracked(m: PracticeMatch) {
  if (m.mode !== "live" || m.status === "done") return;
  const [idx] = await readRaw<PracticeIndex>([PRACTICE_INDEX_KEY]);
  if (liveList(idx ?? emptyIndex()).some((x) => x.id === m.id)) return;
  await trackLivePractice(m.id, m.createdAt);
}

function sanitizePlayers(list: unknown): PracticePlayer[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => {
      const o = p as PracticePlayer;
      const name = String(o?.name || "").trim().slice(0, 40);
      if (!name) return null;
      return {
        name,
        skill: o.skill ? String(o.skill).slice(0, 20) : undefined,
        photo: o.photo == null || o.photo === "" ? null : String(o.photo).slice(0, 400_000),
        source: o.source === "catalog" ? ("catalog" as const) : ("adhoc" as const),
      };
    })
    .filter(Boolean) as PracticePlayer[];
}

function sanitizeFormat(f: unknown): Format {
  const d = defaultPracticeFormat();
  if (!f || typeof f !== "object") return d;
  const x = f as Format;
  const bestOf = [1, 3, 5].includes(Number(x.bestOf)) ? Number(x.bestOf) : d.bestOf;
  const targets = Array.isArray(x.targets)
    ? x.targets.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100)
    : d.targets;
  return {
    bestOf,
    targets: targets.length ? targets : d.targets,
    winBy: Number.isInteger(x.winBy) && x.winBy >= 1 && x.winBy <= 5 ? x.winBy : d.winBy,
    cap: Number.isInteger(x.cap) && x.cap >= 0 ? x.cap : d.cap,
    timeouts: Number.isInteger(x.timeouts) && x.timeouts >= 0 && x.timeouts <= 5 ? x.timeouts : d.timeouts,
    switchInDecider: Boolean(x.switchInDecider ?? d.switchInDecider),
  };
}

export function toPublic(m: PracticeMatch, opts?: { hostToken?: string | null }): PracticeMatchPublic {
  const { hostTokenHash: _, ...rest } = m;
  return {
    ...rest,
    isHost: opts?.hostToken ? hashHostToken(opts.hostToken) === m.hostTokenHash : false,
  };
}

export async function listCompletedPractices(): Promise<PracticeSummary[]> {
  const [idx] = await readRaw<PracticeIndex>([PRACTICE_INDEX_KEY]);
  const list = idx?.matches ?? [];
  return [...list].sort((a, b) => b.completedAt - a.completedAt);
}

export type PracticeLiveBoardItem = {
  match: PracticeMatchPublic;
  state: MatchState;
};

/** Public live board: open live-mode practices (draft + in progress). */
export async function listLivePractices(): Promise<PracticeLiveBoardItem[]> {
  const [idx] = await readRaw<PracticeIndex>([PRACTICE_INDEX_KEY]);
  const refs = liveList(idx ?? emptyIndex());
  if (!refs.length) return [];
  const docs = await readRaw<PracticeMatch>(refs.map((r) => practiceMatchKey(r.id)));
  const out: PracticeLiveBoardItem[] = [];
  const stale: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    const m = docs[i];
    if (!m || m.mode !== "live" || m.status === "done") {
      stale.push(refs[i].id);
      continue;
    }
    out.push({
      match: toPublic(m),
      state: derive(m.ev, m.format, m.timeoutSeconds),
    });
  }
  if (stale.length) {
    void updateDoc(PRACTICE_INDEX_KEY, emptyIndex, (cur) => ({
      ...cur,
      live: liveList(cur).filter((x) => !stale.includes(x.id)),
    })).catch(() => {});
  }
  return out.sort((a, b) => b.match.createdAt - a.match.createdAt);
}

export async function getPractice(id: string): Promise<PracticeMatch | null> {
  if (!id || !/^p_[a-z0-9]+_[a-f0-9]+$/i.test(id)) return null;
  const [m] = await readRaw<PracticeMatch>([practiceMatchKey(id)]);
  return m && typeof m === "object" && m.id === id ? m : null;
}

export async function createPractice(input: {
  mode: "live" | "quick";
  labelA?: string;
  labelB?: string;
  sideA: unknown;
  sideB: unknown;
  format?: unknown;
  timeoutSeconds?: number;
  allowPublicScore?: boolean;
}): Promise<{ match: PracticeMatch; hostToken: string }> {
  const sideA = sanitizePlayers(input.sideA);
  const sideB = sanitizePlayers(input.sideB);
  if (sideA.length < 1 || sideB.length < 1) throw new PracticeError("Each side needs at least one player");
  const hostToken = newHostToken();
  const id = newPracticeId();
  const toSec = Number(input.timeoutSeconds);
  const match: PracticeMatch = {
    v: 0,
    id,
    status: "draft",
    mode: input.mode === "quick" ? "quick" : "live",
    createdAt: Date.now(),
    hostTokenHash: hashHostToken(hostToken),
    allowPublicScore: Boolean(input.allowPublicScore),
    labelA: String(input.labelA || "Team A").trim().slice(0, 40) || "Team A",
    labelB: String(input.labelB || "Team B").trim().slice(0, 40) || "Team B",
    sideA,
    sideB,
    format: sanitizeFormat(input.format),
    timeoutSeconds: Number.isInteger(toSec) && toSec >= 5 && toSec <= 300 ? toSec : 30,
    ev: [],
  };
  await updateDoc(practiceMatchKey(id), () => match, () => ({ ...match, v: 0 }));
  if (match.mode === "live") await trackLivePractice(id, match.createdAt);
  return { match, hostToken };
}

export function verifyHost(match: PracticeMatch, hostToken: string | null | undefined): boolean {
  if (!hostToken) return false;
  return hashHostToken(hostToken) === match.hostTokenHash;
}

export function canScore(match: PracticeMatch, hostToken: string | null | undefined): boolean {
  if (match.status === "done") return false;
  if (verifyHost(match, hostToken)) return true;
  return match.allowPublicScore;
}

export async function updatePracticeEvents(
  id: string,
  fn: (m: PracticeMatch) => PracticeMatch | string,
): Promise<PracticeMatch> {
  const existing = await getPractice(id);
  if (!existing) throw new PracticeError("Practice not found");
  return updateDoc(practiceMatchKey(id), () => existing, (m) => {
    if (!m || m.id !== id) return "Practice not found";
    return fn(m);
  });
}

function summaryFrom(m: PracticeMatch): PracticeSummary {
  const setsWon = m.setsWon ?? { a: 0, b: 0 };
  return {
    id: m.id,
    mode: m.mode,
    completedAt: m.completedAt ?? Date.now(),
    labelA: m.labelA,
    labelB: m.labelB,
    setsWon,
    setScores: m.setScores,
    winner: m.winner ?? null,
    sideACount: m.sideA.length,
    sideBCount: m.sideB.length,
  };
}

export async function completePractice(patch: PracticeMatch): Promise<PracticeMatch> {
  const saved = await updatePracticeEvents(patch.id, (cur) => {
    if (cur.status === "done") return cur;
    return {
      ...cur,
      ...patch,
      id: cur.id,
      hostTokenHash: cur.hostTokenHash,
      status: "done",
      completedAt: Date.now(),
      v: cur.v,
    };
  });
  await updateDoc(PRACTICE_INDEX_KEY, emptyIndex, (idx) => {
    const matches = idx.matches.filter((x) => x.id !== saved.id);
    matches.unshift(summaryFrom(saved));
    return {
      ...idx,
      matches: matches.slice(0, 200),
      live: liveList(idx).filter((x) => x.id !== saved.id),
    };
  });
  return saved;
}

export async function abandonPractice(id: string): Promise<void> {
  const m = await getPractice(id);
  if (!m) throw new PracticeError("Practice not found");
  if (m.status === "done") throw new PracticeError("Completed practices cannot be abandoned — delete instead");
  await delKey(practiceMatchKey(id));
  await untrackLivePractice(id);
}

export async function deleteCompletedPractice(id: string): Promise<void> {
  const m = await getPractice(id);
  if (!m) throw new PracticeError("Practice not found");
  if (m.status !== "done") throw new PracticeError("Only completed practices can be deleted from history");
  await delKey(practiceMatchKey(id));
  await updateDoc(PRACTICE_INDEX_KEY, emptyIndex, (idx) => ({
    ...idx,
    matches: idx.matches.filter((x) => x.id !== id),
  }));
}

