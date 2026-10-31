import type { Format, MatchEvent, Side } from "./types";

export type EventLogLine = {
  n: number;
  text: string;
  time?: string;
};

function sideName(side: Side, labelA: string, labelB: string) {
  return side === "A" ? labelA : labelB;
}

function fmtTime(t?: number) {
  if (typeof t !== "number" || t <= 0) return undefined;
  try {
    // Fixed locale so SSR / client never disagree on formatting.
    return new Date(t).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return undefined;
  }
}

/** Same win rule as the engine (kept local so Node tests don't need engine imports). */
function setWon(a: number, b: number, target: number, f: Format): Side | null {
  if (a === b) return null;
  const lead: Side = a > b ? "A" : "B";
  const top = Math.max(a, b);
  if (f.cap > 0 && top >= f.cap) return lead;
  if (top >= target && Math.abs(a - b) >= Math.max(1, f.winBy)) return lead;
  return null;
}

function targetFor(f: Format, setIndex: number) {
  return f.targets[Math.min(setIndex, f.targets.length - 1)] ?? 25;
}

/**
 * Turn a raw match event log into short human-readable lines
 * (e.g. "Point — Blue (12–5) · Set 1").
 */
export function formatEventLog(
  ev: MatchEvent[],
  opts: { labelA: string; labelB: string; format: Format },
): EventLogLine[] {
  const { labelA, labelB, format: f } = opts;
  const lines: EventLogLine[] = [];
  let setIndex = 0;
  let a = 0;
  let b = 0;
  let n = 0;

  const push = (text: string, t?: number) => {
    n++;
    lines.push({ n, text, time: fmtTime(t) });
  };

  for (const e of ev) {
    if (e.k === "start") {
      setIndex = 0;
      a = 0;
      b = 0;
      push(`Match started — ${sideName(e.serve, labelA, labelB)} serves first`, e.t);
    } else if (e.k === "pt" || e.k === "adj") {
      if (e.k === "adj") {
        if (e.n === 1) {
          if (e.s === "A") a++;
          else b++;
        } else if (e.s === "A" && a > 0) a--;
        else if (e.s === "B" && b > 0) b--;
      } else if (e.s === "A") a++;
      else b++;
      const target = targetFor(f, setIndex);
      const w = setWon(a, b, target, f);
      if (w) {
        push(
          `Set ${setIndex + 1} won by ${sideName(w, labelA, labelB)} ${Math.max(a, b)}–${Math.min(a, b)}`,
          e.t,
        );
      } else if (e.k === "adj") {
        push(
          `Adjust ${e.n > 0 ? "+" : "−"}1 — ${sideName(e.s, labelA, labelB)} (${a}–${b}) · Set ${setIndex + 1}`,
          e.t,
        );
      } else {
        push(`Point — ${sideName(e.s, labelA, labelB)} (${a}–${b}) · Set ${setIndex + 1}`, e.t);
      }
    } else if (e.k === "to") {
      push(`Timeout — ${sideName(e.s, labelA, labelB)} (${a}–${b}) · Set ${setIndex + 1}`, e.t);
    } else if (e.k === "resume") {
      push(`Timeout ended — play resumed`, e.t);
    } else if (e.k === "next") {
      setIndex++;
      a = 0;
      b = 0;
      push(`Set ${setIndex + 1} started`, e.t);
    }
  }

  return lines;
}
