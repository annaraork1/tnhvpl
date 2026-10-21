import type { Format, Side } from "./types";

/** Pressure-point cue while a set is in progress. */
export type PressureBall = "notice" | "opal" | "game" | "match";

export const PRESSURE_BALL_LABEL: Record<PressureBall, string> = {
  notice: "Notice Ball",
  opal: "Opal Ball",
  game: "Game Ball",
  match: "Match Ball",
};

function setsToWin(f: Format) {
  return Math.floor(f.bestOf / 2) + 1;
}

/** Same rules as engine.setWinner, scoped to whether `mine` has won. */
function sideWinsSet(mine: number, theirs: number, target: number, f: Format): boolean {
  if (mine <= theirs) return false;
  if (f.cap > 0 && mine >= f.cap) return true;
  return mine >= target && mine - theirs >= Math.max(1, f.winBy);
}

/**
 * How many unanswered points would win the set for `mine` (1–3), or null if more than 3.
 * Used for Notice (3) / Opal (2) / Game|Match (1) with win-by-2 / deuce rules.
 */
export function pointsToSetWin(
  mine: number,
  theirs: number,
  target: number,
  f: Format,
): 1 | 2 | 3 | null {
  if (sideWinsSet(mine, theirs, target, f)) return null;
  for (const n of [1, 2, 3] as const) {
    if (sideWinsSet(mine + n, theirs, target, f)) return n;
  }
  return null;
}

/** Pressure ball for one side during a live set (not on set break / finished). */
export function pressureBallForSide(
  side: Side,
  a: number,
  b: number,
  target: number,
  f: Format,
  setsA: number,
  setsB: number,
): PressureBall | null {
  const mine = side === "A" ? a : b;
  const theirs = side === "A" ? b : a;
  const mySets = side === "A" ? setsA : setsB;
  const n = pointsToSetWin(mine, theirs, target, f);
  if (!n) return null;
  if (n === 1) {
    const winsMatch = mySets + 1 >= setsToWin(f);
    return winsMatch ? "match" : "game";
  }
  if (n === 2) return "opal";
  return "notice";
}

/** Labels for both sides; null when the set is already decided or not live. */
export function pressureBalls(
  a: number,
  b: number,
  target: number,
  f: Format,
  setsA: number,
  setsB: number,
  opts?: { live?: boolean },
): { A: PressureBall | null; B: PressureBall | null } {
  if (opts?.live === false) return { A: null, B: null };
  if (sideWinsSet(a, b, target, f) || sideWinsSet(b, a, target, f)) return { A: null, B: null };
  return {
    A: pressureBallForSide("A", a, b, target, f, setsA, setsB),
    B: pressureBallForSide("B", a, b, target, f, setsA, setsB),
  };
}
