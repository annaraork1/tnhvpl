import type { AppState, AwardEntry, AwardId, Awards, Config, MatchState, Player, Team } from "./types";

/** Minimal shape from computeAll used for MOTM aggregation. */
type CalcLike = { ms: Record<string, MatchState> };

export const AWARD_IDS: AwardId[] = ["setter", "attacker", "server", "mvp", "emerging"];

export const AWARD_LABELS: Record<AwardId, string> = {
  setter: "Best Setter",
  attacker: "Best Attacker",
  server: "Best Server",
  mvp: "MVP",
  emerging: "Best Emerging Player",
};

export function emptyAwards(): Awards {
  return { setter: null, attacker: null, server: null, mvp: null, emerging: null };
}

export function teamForPlayer(playerNo: number, teams: Team[], players: Player[]): Team | undefined {
  const p = players.find((x) => x.no === playerNo);
  if (p?.team) return teams.find((t) => t.id === p.team);
  return teams.find((t) => t.squad.includes(playerNo));
}

export function normalizeAwards(raw: Awards | null | undefined): Awards {
  const base = emptyAwards();
  if (!raw || typeof raw !== "object") return base;
  for (const id of AWARD_IDS) {
    const e = raw[id];
    if (e && Number.isInteger(e.playerNo) && typeof e.teamId === "string" && e.teamId) {
      base[id] = { playerNo: e.playerNo, teamId: e.teamId };
    } else {
      base[id] = null;
    }
  }
  return base;
}

/** Validate awards payload; returns error message or null. */
export function validateAwards(awards: Awards, config: Config, players: Player[]): string | null {
  if (!awards || typeof awards !== "object") return "Bad awards";
  const teamIds = new Set(config.teams.map((t) => t.id));
  const playerNos = new Set(players.map((p) => p.no));
  for (const id of AWARD_IDS) {
    if (!(id in awards)) continue;
    const e = awards[id];
    if (e == null) continue;
    if (!Number.isInteger(e.playerNo) || !playerNos.has(e.playerNo)) return `Unknown player for ${AWARD_LABELS[id]}`;
    if (!e.teamId || !teamIds.has(e.teamId)) return `Unknown team for ${AWARD_LABELS[id]}`;
    const t = teamForPlayer(e.playerNo, config.teams, players);
    if (!t || t.id !== e.teamId) return `${AWARD_LABELS[id]}: player is not on that team`;
  }
  return null;
}

export function filledAwards(awards: Awards | null | undefined): { id: AwardId; entry: AwardEntry }[] {
  const a = normalizeAwards(awards);
  return AWARD_IDS.flatMap((id) => {
    const entry = a[id];
    return entry ? [{ id, entry }] : [];
  });
}

export interface MotmSuggestion {
  playerNo: number;
  teamId: string;
  count: number;
  matchIds: string[];
}

/** Aggregate optional per-match best players for MVP suggestions. */
export function motmSuggestions(state: AppState, calc: CalcLike): MotmSuggestion[] {
  const map = new Map<number, MotmSuggestion>();
  for (const fx of state.config.fixtures) {
    if (calc.ms[fx.id]?.status !== "done") continue;
    const bp = state.matches[fx.id]?.bestPlayer;
    if (!bp || !Number.isInteger(bp.playerNo) || !bp.teamId) continue;
    const cur = map.get(bp.playerNo);
    if (cur) {
      cur.count++;
      cur.matchIds.push(fx.id);
    } else {
      map.set(bp.playerNo, { playerNo: bp.playerNo, teamId: bp.teamId, count: 1, matchIds: [fx.id] });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.playerNo - b.playerNo);
}
