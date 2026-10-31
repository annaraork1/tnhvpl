import {
  computeAll,
  formatFor,
  pointsFor,
  resultKeys,
  standings,
  targetFor,
  type Row,
} from "./engine.ts";
import { PLAYOFF_QUALIFY } from "./qualify.ts";
import type { AppState, Fixture, Format, MatchState, SetState, Side } from "./types.ts";

/** Coarse result from the selected team's perspective. */
export type CoarseResult = "win-2-0" | "win-2-1" | "lose-0-2" | "lose-1-2";

export const COARSE_RESULTS: CoarseResult[] = ["win-2-0", "win-2-1", "lose-0-2", "lose-1-2"];

export const COARSE_LABELS: Record<CoarseResult, string> = {
  "win-2-0": "Win 2–0",
  "win-2-1": "Win 2–1",
  "lose-0-2": "Lose 0–2",
  "lose-1-2": "Lose 1–2",
};

export type OutcomeMap = Partial<Record<string, CoarseResult>>;

export interface RemainingFixture {
  fx: Fixture;
  side: Side;
  oppId: string;
  oppLabel: string;
}

function emptySet(a: number, b: number, target: number, winner: Side, firstServe: Side = "A"): SetState {
  return {
    a,
    b,
    target,
    winner,
    toA: 0,
    toB: 0,
    firstServe,
  };
}

/** Deterministic plausible set scores for coarse what-ifs (point ratio is approximate). */
export function syntheticMatchState(format: Format, teamSide: Side, result: CoarseResult): MatchState {
  const opp: Side = teamSide === "A" ? "B" : "A";
  const sequence: Side[] =
    result === "win-2-0"
      ? [teamSide, teamSide]
      : result === "win-2-1"
        ? [teamSide, opp, teamSide]
        : result === "lose-0-2"
          ? [opp, opp]
          : [teamSide, opp, opp];

  const sets: SetState[] = [];
  for (let i = 0; i < sequence.length; i++) {
    const target = targetFor(format, i);
    const losePts = Math.max(0, Math.min(target - format.winBy, Math.floor(target * 0.7)));
    const w = sequence[i]!;
    sets.push(emptySet(w === "A" ? target : losePts, w === "B" ? target : losePts, target, w));
  }

  const setsA = sets.filter((s) => s.winner === "A").length;
  const setsB = sets.filter((s) => s.winner === "B").length;

  return {
    status: "done",
    sets,
    cur: sets.length - 1,
    awaitingNext: false,
    setsA,
    setsB,
    winner: setsA > setsB ? "A" : "B",
    serve: null,
    isDecider: sets.length === format.bestOf,
    switchNow: false,
    format,
    timeout: null,
  };
}

function teamSideInFixture(
  fx: Fixture,
  teamId: string,
  resolvedA: string | null,
  resolvedB: string | null,
): Side | null {
  if (resolvedA === teamId) return "A";
  if (resolvedB === teamId) return "B";
  if ("team" in fx.a && fx.a.team === teamId) return "A";
  if ("team" in fx.b && fx.b.team === teamId) return "B";
  return null;
}

function parseTimeToMinutes(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

export function remainingLeagueFixtures(state: AppState, teamId: string): RemainingFixture[] {
  const { resolved, ms } = computeAll(state);
  const out: RemainingFixture[] = [];
  for (const fx of state.config.fixtures) {
    if (fx.stage !== "League") continue;
    const r = resolved[fx.id];
    if (!r?.a || !r?.b) continue;
    if (r.a !== teamId && r.b !== teamId) continue;
    if (ms[fx.id]?.status === "done") continue;
    const side = teamSideInFixture(fx, teamId, r.a, r.b);
    if (!side) continue;
    const oppId = side === "A" ? r.b! : r.a!;
    out.push({
      fx,
      side,
      oppId,
      oppLabel: side === "A" ? r.labelB : r.labelA,
    });
  }
  out.sort((x, y) => {
    const d = x.fx.date.localeCompare(y.fx.date);
    if (d) return d;
    const t = parseTimeToMinutes(x.fx.time) - parseTimeToMinutes(y.fx.time);
    if (t) return t;
    return x.fx.no - y.fx.no;
  });
  return out;
}

export function rankOf(table: Row[], teamId: string): number {
  const i = table.findIndex((r) => r.team === teamId);
  return i < 0 ? table.length + 1 : i + 1;
}

export function maxWinPoints(settings: AppState["config"]["settings"]): number {
  let max = 0;
  for (const v of Object.values(settings.points)) {
    if (v.w > max) max = v.w;
  }
  if (max > 0) return max;
  for (const k of resultKeys(settings.league)) {
    const [wSets, lSets] = k.split("-").map(Number);
    if (!Number.isFinite(wSets) || !Number.isFinite(lSets)) continue;
    max = Math.max(max, pointsFor(settings, wSets!, lSets!).w);
  }
  return max || 2;
}

/** Apply coarse outcomes for one team; other unfinished league games stay unplayed. */
export function applyWhatIf(state: AppState, teamId: string, outcomes: OutcomeMap) {
  const base = computeAll(state);
  const ms = { ...base.ms };
  const format = state.config.settings.league;

  for (const [id, result] of Object.entries(outcomes)) {
    if (!result) continue;
    const fx = state.config.fixtures.find((f) => f.id === id);
    if (!fx || fx.stage !== "League") continue;
    const r = base.resolved[id];
    if (!r?.a || !r?.b) continue;
    if (base.ms[id]?.status === "done") continue;
    const side = teamSideInFixture(fx, teamId, r.a, r.b);
    if (!side) continue;
    ms[id] = syntheticMatchState(formatFor(fx, state.config.settings) ?? format, side, result);
  }

  const table = standings(state, base.resolved, ms);
  return { resolved: base.resolved, ms, table, baseTable: base.table };
}

function pathCost(results: CoarseResult[]): [number, number, number] {
  let wins = 0;
  let straight = 0;
  let softLoss = 0;
  for (const r of results) {
    if (r.startsWith("win")) {
      wins++;
      if (r === "win-2-0") straight++;
    } else if (r === "lose-1-2") softLoss++;
  }
  // Prefer fewer wins, then fewer straight-set wins, then more soft losses (1-2 over 0-2)
  return [wins, straight, -softLoss];
}

function cmpCost(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

export interface RacePath {
  outcomes: OutcomeMap;
  results: CoarseResult[];
  rank: number;
  cost: [number, number, number];
}

const MAX_ENUM = 5; // 4^5 = 1024 — keep UI responsive

/** Enumerate coarse assignments for remaining games; return paths that hit targetRank. */
export function enumeratePathsToRank(
  state: AppState,
  teamId: string,
  targetRank: number,
  remaining = remainingLeagueFixtures(state, teamId),
): RacePath[] {
  const slice = remaining.slice(0, MAX_ENUM);
  if (!slice.length) {
    const { table } = applyWhatIf(state, teamId, {});
    const rank = rankOf(table, teamId);
    return rank <= targetRank ? [{ outcomes: {}, results: [], rank, cost: [0, 0, 0] }] : [];
  }

  const paths: RacePath[] = [];
  const n = slice.length;
  const total = COARSE_RESULTS.length ** n;
  /** Precompute base once — applyWhatIf only overlays outcomes. */
  const base = computeAll(state);

  for (let mask = 0; mask < total; mask++) {
    const outcomes: OutcomeMap = {};
    const results: CoarseResult[] = [];
    let x = mask;
    for (let i = 0; i < n; i++) {
      const r = COARSE_RESULTS[x % COARSE_RESULTS.length]!;
      x = Math.floor(x / COARSE_RESULTS.length);
      outcomes[slice[i]!.fx.id] = r;
      results.push(r);
    }
    const ms = { ...base.ms };
    for (const [id, result] of Object.entries(outcomes)) {
      if (!result) continue;
      const fx = state.config.fixtures.find((f) => f.id === id);
      if (!fx || fx.stage !== "League") continue;
      const r = base.resolved[id];
      if (!r?.a || !r?.b) continue;
      if (base.ms[id]?.status === "done") continue;
      const side = teamSideInFixture(fx, teamId, r.a, r.b);
      if (!side) continue;
      ms[id] = syntheticMatchState(formatFor(fx, state.config.settings), side, result);
    }
    const table = standings(state, base.resolved, ms);
    const rank = rankOf(table, teamId);
    if (rank <= targetRank) {
      paths.push({ outcomes, results, rank, cost: pathCost(results) });
    }
  }

  paths.sort((a, b) => cmpCost(a.cost, b.cost) || a.rank - b.rank);
  return paths;
}

export interface RivalCeiling {
  teamId: string;
  currentPoints: number;
  remainingGames: number;
  ceilingPoints: number;
}

export function rivalCeilings(state: AppState, teamId: string): RivalCeiling[] {
  const { table } = computeAll(state);
  const winPts = maxWinPoints(state.config.settings);
  return table
    .filter((r) => r.team !== teamId)
    .map((r) => {
      const rem = remainingLeagueFixtures(state, r.team).length;
      return {
        teamId: r.team,
        currentPoints: r.points,
        remainingGames: rem,
        ceilingPoints: r.points + rem * winPts,
      };
    });
}

export function formatPathLabel(
  path: RacePath,
  remaining: RemainingFixture[],
  teamName: (id: string) => string,
): string {
  if (!path.results.length) return "Already in position with results so far";
  return path.results
    .map((r, i) => {
      const rem = remaining[i];
      const vs = rem ? teamName(rem.oppId) || rem.oppLabel : "opponent";
      return `${COARSE_LABELS[r]} vs ${vs}`;
    })
    .join(", then ");
}

export interface NextMatchInsight {
  locksTarget: boolean;
  eliminatesFromTarget: boolean;
  note: string | null;
}

/** Whether the next match alone can lock or eliminate under “others unfinished”. */
export function nextMatchInsight(
  state: AppState,
  teamId: string,
  targetRank: number,
  next: RemainingFixture | undefined,
): NextMatchInsight {
  if (!next) {
    const rank = rankOf(computeAll(state).table, teamId);
    return {
      locksTarget: rank <= targetRank,
      eliminatesFromTarget: rank > targetRank,
      note:
        rank <= targetRank
          ? `Already inside top ${targetRank} with no league matches left.`
          : `No league matches left — currently #${rank}, outside top ${targetRank}.`,
    };
  }

  let anyReach = false;
  let allReach = true;
  let allMiss = true;
  for (const r of COARSE_RESULTS) {
    const { table } = applyWhatIf(state, teamId, { [next.fx.id]: r });
    const rank = rankOf(table, teamId);
    if (rank <= targetRank) {
      anyReach = true;
      allMiss = false;
    } else {
      allReach = false;
    }
  }

  if (allReach) {
    return {
      locksTarget: true,
      eliminatesFromTarget: false,
      note: `Next match locks a top-${targetRank} finish under current assumptions (other unfinished games ignored).`,
    };
  }
  if (allMiss) {
    return {
      locksTarget: false,
      eliminatesFromTarget: true,
      note: `Next match alone cannot reach top ${targetRank} — later results still matter (or it may be out of reach).`,
    };
  }
  if (anyReach) {
    return {
      locksTarget: false,
      eliminatesFromTarget: false,
      note: `Next match outcome changes the race — some results keep top ${targetRank} alive.`,
    };
  }
  return { locksTarget: false, eliminatesFromTarget: false, note: null };
}

/** Stable fingerprint of league results — use as React memo key so live polls don't recompute. */
export function leagueResultsSig(state: AppState): string {
  return state.config.fixtures
    .filter((f) => f.stage === "League")
    .map((f) => {
      const m = state.matches[f.id];
      return `${f.id}:${m?.v ?? 0}:${m?.ev?.length ?? 0}`;
    })
    .join("|");
}

export interface RaceProjection {
  currentRank: number;
  projectedRank: number;
  currentRow: Row | undefined;
  projectedRow: Row | undefined;
  baseTable: Row[];
  projectedTable: Row[];
  remaining: RemainingFixture[];
  next: RemainingFixture | undefined;
  nextInsight: NextMatchInsight;
  rivalsAboveCeiling: RivalCeiling[];
  qualifyDefault: number;
}

/** Fast what-if for the selected outcomes (no path enumeration). */
export function projectRace(
  state: AppState,
  teamId: string,
  targetRank: number,
  outcomes: OutcomeMap,
): RaceProjection {
  const base = computeAll(state);
  const remaining = remainingLeagueFixtures(state, teamId);
  const next = remaining[0];
  const applied = applyWhatIf(state, teamId, outcomes);
  const projectedPts = applied.table.find((r) => r.team === teamId)?.points ?? 0;
  const ceilings = rivalCeilings(state, teamId);
  const rivalsAboveCeiling = ceilings
    .filter((c) => c.ceilingPoints > projectedPts)
    .sort((a, b) => b.ceilingPoints - a.ceilingPoints)
    .slice(0, 5);

  return {
    currentRank: rankOf(base.table, teamId),
    projectedRank: rankOf(applied.table, teamId),
    currentRow: base.table.find((r) => r.team === teamId),
    projectedRow: applied.table.find((r) => r.team === teamId),
    baseTable: base.table,
    projectedTable: applied.table,
    remaining,
    next,
    nextInsight: nextMatchInsight(state, teamId, targetRank, next),
    rivalsAboveCeiling,
    qualifyDefault: PLAYOFF_QUALIFY,
  };
}

export interface RaceAnalysis extends RaceProjection {
  canReach: boolean;
  bestPath: RacePath | null;
  topPaths: RacePath[];
}

export function analyzeRace(
  state: AppState,
  teamId: string,
  targetRank: number,
  outcomes: OutcomeMap,
): RaceAnalysis {
  const projection = projectRace(state, teamId, targetRank, outcomes);
  const paths = enumeratePathsToRank(state, teamId, targetRank, projection.remaining);
  return {
    ...projection,
    canReach: paths.length > 0,
    bestPath: paths[0] ?? null,
    topPaths: paths.slice(0, 8),
  };
}

export { PLAYOFF_QUALIFY };
