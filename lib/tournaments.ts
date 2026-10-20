import type { Registry, TournamentMeta } from "./types";

export const REGISTRY_KEY = "tnhvpl:registry";
export const DEFAULT_TOURNAMENT_KEY = process.env.TOURNAMENT_KEY || "tnhvpl-s5";
export const DEFAULT_LOGO = "/logo.png";

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidTournamentKey(key: string): boolean {
  return KEY_RE.test(key) && key.length >= 2 && key.length <= 40;
}

export function emptyRegistry(seed?: TournamentMeta): Registry {
  const meta =
    seed ??
    ({
      key: DEFAULT_TOURNAMENT_KEY,
      name: "TNHVPL Season 5",
      short: "TNHVPL",
      subtitle: "TNH Volleyball · Season 5",
      dates: "31 Oct – 1 Nov 2026",
      logo: DEFAULT_LOGO,
      createdAt: Date.now(),
    } satisfies TournamentMeta);
  return { v: 0, activeKey: meta.key, tournaments: [meta] };
}

export function normalizeRegistry(raw: Registry | null | undefined, fallbackMeta?: TournamentMeta): Registry {
  if (!raw || !Array.isArray(raw.tournaments) || !raw.tournaments.length) {
    return emptyRegistry(fallbackMeta);
  }
  const tournaments = raw.tournaments
    .filter((t) => t && typeof t.key === "string" && isValidTournamentKey(t.key))
    .map((t) => ({
      key: t.key,
      name: String(t.name || t.key).slice(0, 60),
      short: String(t.short || "TNHVPL").slice(0, 20),
      subtitle: String(t.subtitle || "").slice(0, 80),
      dates: String(t.dates || "").slice(0, 60),
      logo: String(t.logo || DEFAULT_LOGO).slice(0, 400_000),
      createdAt: Number(t.createdAt) || Date.now(),
    }));
  if (!tournaments.length) return emptyRegistry(fallbackMeta);
  const activeKey = tournaments.some((t) => t.key === raw.activeKey) ? raw.activeKey : tournaments[0].key;
  return { v: Number(raw.v) || 0, activeKey, tournaments };
}

export function metaFor(reg: Registry, key: string): TournamentMeta {
  return reg.tournaments.find((t) => t.key === key) ?? reg.tournaments[0];
}
