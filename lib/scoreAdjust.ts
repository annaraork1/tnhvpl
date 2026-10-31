import type { MatchEvent, Side } from "./types";

/** Build a score-only adjust event (does not change serve). */
export function adjustEvent(side: Side, delta: 1 | -1, t = Date.now()): MatchEvent {
  return { k: "adj", s: side, n: delta, t };
}
