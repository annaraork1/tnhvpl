import type { Format, MatchEvent, Side } from "./types";

/** Local copies of engine helpers so Node tests can load this file without path aliases. */
function setsToWin(f: Format) {
  return Math.floor(f.bestOf / 2) + 1;
}
function targetFor(f: Format, setIndex: number) {
  return f.targets[Math.min(setIndex, f.targets.length - 1)] ?? 25;
}
function setWinner(a: number, b: number, target: number, f: Format): Side | null {
  if (a === b) return null;
  const lead: Side = a > b ? "A" : "B";
  const top = Math.max(a, b);
  if (f.cap > 0 && top >= f.cap) return lead;
  if (top >= target && Math.abs(a - b) >= Math.max(1, f.winBy)) return lead;
  return null;
}

export type SetTiming = {
  /** 1-based set number */
  set: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  a: number;
  b: number;
};

export type MatchTiming = {
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  sets: SetTiming[];
  /** True when either side reached sets-to-win. */
  done: boolean;
};

function ts(t?: number): number | null {
  return typeof t === "number" && t > 0 ? t : null;
}

/** Human duration: `46m 12s`, `1h 2m`, `58s`. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    if (m === 0 && s === 0) return `${h}h`;
    if (s === 0) return `${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Derive match start/end and per-set wall-clock durations from the event log.
 * Uses the same set-win rules as the scoring engine. Missing `t` stamps yield nulls.
 */
export function matchTiming(ev: MatchEvent[], f: Format): MatchTiming | null {
  if (!ev.length || ev[0]!.k !== "start") return null;

  const need = setsToWin(f);
  const startT = ts(ev[0]!.t);

  const sets: SetTiming[] = [];
  let setIndex = 0;
  let a = 0;
  let b = 0;
  let setsA = 0;
  let setsB = 0;
  let done = false;
  let awaitingNext = false;
  let setStartedAt = startT;
  let setClosed = false;

  const closeSet = (endedAt: number | null) => {
    if (setClosed) return;
    const durationMs =
      setStartedAt != null && endedAt != null && endedAt >= setStartedAt ? endedAt - setStartedAt : null;
    sets.push({
      set: setIndex + 1,
      startedAt: setStartedAt,
      endedAt,
      durationMs,
      a,
      b,
    });
    setClosed = true;
  };

  for (let i = 1; i < ev.length; i++) {
    const e = ev[i]!;
    if (done && e.k !== "adj") break;

    if (e.k === "pt") {
      if (awaitingNext || setClosed) continue;
      if (e.s === "A") a++;
      else b++;
      const w = setWinner(a, b, targetFor(f, setIndex), f);
      if (w) {
        if (w === "A") setsA++;
        else setsB++;
        closeSet(ts(e.t));
        if (setsA >= need || setsB >= need) {
          done = true;
          awaitingNext = false;
        } else {
          awaitingNext = true;
        }
      }
    } else if (e.k === "adj") {
      if (setClosed && !awaitingNext && !done) continue;
      if (e.n === 1) {
        if (awaitingNext || done || setClosed) continue;
        if (e.s === "A") a++;
        else b++;
      } else {
        // Timing for finished matches rarely needs reopen; ignore −1 after close.
        if (setClosed) continue;
        if (e.s === "A" && a > 0) a--;
        else if (e.s === "B" && b > 0) b--;
      }
      const w = setWinner(a, b, targetFor(f, setIndex), f);
      if (w && !setClosed) {
        if (w === "A") setsA++;
        else setsB++;
        closeSet(ts(e.t));
        if (setsA >= need || setsB >= need) {
          done = true;
          awaitingNext = false;
        } else {
          awaitingNext = true;
        }
      }
    } else if (e.k === "next") {
      if (!awaitingNext || !setClosed) continue;
      setIndex++;
      a = 0;
      b = 0;
      awaitingNext = false;
      setClosed = false;
      setStartedAt = ts(e.t) ?? sets[sets.length - 1]?.endedAt ?? null;
    }
  }

  if (!sets.length) return null;

  const startedAt = startT ?? sets[0]!.startedAt;
  const endedAt = done ? sets[sets.length - 1]!.endedAt : null;
  const durationMs =
    startedAt != null && endedAt != null && endedAt >= startedAt ? endedAt - startedAt : null;

  return { startedAt, endedAt, durationMs, sets, done };
}
