import { derive } from "./engine";
import type { Format, MatchEvent, Side } from "./types";

/** Build setsWon / setScores / winner from live events. */
export function resultFromEvents(
  ev: MatchEvent[],
  format: Format,
  timeoutSeconds: number,
): {
  setsWon: { a: number; b: number };
  setScores: { a: number; b: number }[];
  winner: Side | null;
} {
  const st = derive(ev, format, timeoutSeconds);
  const setScores = st.sets.filter((s) => s.winner).map((s) => ({ a: s.a, b: s.b }));
  return {
    setsWon: { a: st.setsA, b: st.setsB },
    setScores,
    winner: st.winner,
  };
}
