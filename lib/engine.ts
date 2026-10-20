import type {
  AppState,
  Config,
  Fixture,
  Format,
  MatchDoc,
  MatchEvent,
  MatchState,
  SetState,
  Settings,
  Side,
  Slot,
  TieKey,
} from "./types";

export const other = (s: Side): Side => (s === "A" ? "B" : "A");
export const setsToWin = (f: Format) => Math.floor(f.bestOf / 2) + 1;
export const targetFor = (f: Format, setIndex: number) =>
  f.targets[Math.min(setIndex, f.targets.length - 1)] ?? 25;

export function formatFor(fx: Fixture, settings: Settings): Format {
  return fx.stage === "League" ? settings.league : settings.playoff;
}

/** Has this set been won, given the format? */
export function setWinner(a: number, b: number, target: number, f: Format): Side | null {
  const top = Math.max(a, b);
  if (a === b) return null;
  const lead: Side = a > b ? "A" : "B";
  if (f.cap > 0 && top >= f.cap) return lead;
  if (top >= target && Math.abs(a - b) >= Math.max(1, f.winBy)) return lead;
  return null;
}

export const DEFAULT_TIMEOUT_SECONDS = 30;

/** Replays the event log of a match into its current state. Invalid events are skipped. */
export function derive(ev: MatchEvent[], f: Format, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): MatchState {
  const toSec = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;
  const need = setsToWin(f);
  const base: MatchState = {
    status: "scheduled",
    sets: [],
    cur: 0,
    awaitingNext: false,
    setsA: 0,
    setsB: 0,
    winner: null,
    serve: null,
    isDecider: false,
    switchNow: false,
    format: f,
    timeout: null,
  };
  if (!ev.length || ev[0].k !== "start") return base;
  const first = ev[0].serve;
  const st: MatchState = { ...base, status: "live", serve: first };
  const newSet = (i: number): SetState => {
    const fs = i % 2 === 0 ? first : other(first);
    return { a: 0, b: 0, target: targetFor(f, i), winner: null, toA: 0, toB: 0, firstServe: fs };
  };
  st.sets.push(newSet(0));
  for (let i = 1; i < ev.length; i++) {
    const e = ev[i];
    if (st.status === "done") break;
    const s = st.sets[st.cur];
    if (e.k === "pt") {
      if (st.awaitingNext || st.timeout) continue;
      if (e.s === "A") s.a++;
      else s.b++;
      st.serve = e.s;
      const w = setWinner(s.a, s.b, s.target, f);
      if (w) {
        s.winner = w;
        if (w === "A") st.setsA++;
        else st.setsB++;
        if (st.setsA >= need || st.setsB >= need) {
          st.status = "done";
          st.winner = st.setsA > st.setsB ? "A" : "B";
        } else st.awaitingNext = true;
      }
    } else if (e.k === "to") {
      if (st.awaitingNext || st.timeout) continue;
      if (e.s === "A" && s.toA < f.timeouts) s.toA++;
      else if (e.s === "B" && s.toB < f.timeouts) s.toB++;
      else continue;
      const startedAt = typeof e.t === "number" && e.t > 0 ? e.t : 0;
      st.timeout = { side: e.s, startedAt, endsAt: startedAt + toSec * 1000 };
    } else if (e.k === "resume") {
      if (!st.timeout) continue;
      st.timeout = null;
    } else if (e.k === "next") {
      if (!st.awaitingNext) continue;
      st.cur++;
      st.sets.push(newSet(st.cur));
      st.serve = st.sets[st.cur].firstServe;
      st.awaitingNext = false;
      st.timeout = null;
    }
  }
  const s = st.sets[st.cur];
  st.isDecider = st.cur === f.bestOf - 1;
  if (st.status === "live" && !st.awaitingNext && !st.timeout && st.isDecider && f.switchInDecider) {
    const half = Math.ceil(s.target / 2);
    const last = ev[ev.length - 1];
    if (last.k === "pt") {
      const mine = last.s === "A" ? s.a : s.b;
      const theirs = last.s === "A" ? s.b : s.a;
      st.switchNow = mine === half && theirs < half; // the point that first takes a team to half-way
    }
  }
  return st;
}

/** Validates a scoring action against the current state; returns an error message or null. */
export function checkAction(
  ev: MatchEvent[],
  f: Format,
  e: MatchEvent,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  now = Date.now(),
): string | null {
  const st = derive(ev, f, timeoutSeconds);
  if (e.k === "start") return ev.length ? "Match already started" : null;
  if (st.status === "scheduled") return "Start the match first";
  if (st.status === "done") return "Match is finished";
  if (e.k === "resume") {
    if (!st.timeout) return "No timeout to resume";
    // 1s grace for clock skew between scorer phone and server.
    if (st.timeout.startedAt > 0 && now + 1000 < st.timeout.endsAt) return "Timeout still running";
    return null;
  }
  if (st.timeout) return "Timeout in progress — resume when the timer ends";
  if (e.k === "pt") return st.awaitingNext ? "Start the next set first" : null;
  if (e.k === "next") return st.awaitingNext ? null : "Current set is not finished";
  if (e.k === "to") {
    if (st.awaitingNext) return "Set is finished";
    const s = st.sets[st.cur];
    const used = e.s === "A" ? s.toA : s.toB;
    return used >= f.timeouts ? "No timeouts left this set" : null;
  }
  return null;
}

// ---------- Teams in a fixture ----------

export interface Resolved {
  a: string | null;
  b: string | null;
  labelA: string;
  labelB: string;
}

const stageShort: Record<string, string> = {
  "Qualifier 1": "Q1",
  Eliminator: "Eliminator",
  "Qualifier 2": "Q2",
  Final: "Final",
};

export function slotLabel(slot: Slot, config: Config): string {
  if ("team" in slot) return config.teams.find((t) => t.id === slot.team)?.name ?? slot.team;
  if ("rank" in slot) return `League #${slot.rank}`;
  const ref = "winner" in slot ? slot.winner : slot.loser;
  const fx = config.fixtures.find((f) => f.id === ref);
  const name = fx ? stageShort[fx.stage] ?? `Match ${fx.no}` : ref;
  return `${"winner" in slot ? "Winner" : "Loser"} of ${name}`;
}

/** Works out every fixture's teams and every match's state in one pass (playoffs depend on earlier results). */
export function computeAll(state: AppState) {
  const { config, matches } = state;
  const resolved: Record<string, Resolved> = {};
  const ms: Record<string, MatchState> = {};
  const doc = (id: string): MatchDoc => matches[id] ?? { v: 0, ev: [] };

  const toSec = config.settings.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const league = config.fixtures.filter((f) => f.stage === "League");
  // league first
  for (const fx of league) {
    const o = doc(fx.id).over ?? {};
    resolved[fx.id] = {
      a: o.a ?? ("team" in fx.a ? fx.a.team : null),
      b: o.b ?? ("team" in fx.b ? fx.b.team : null),
      labelA: slotLabel(fx.a, config),
      labelB: slotLabel(fx.b, config),
    };
    ms[fx.id] = derive(doc(fx.id).ev, formatFor(fx, config.settings), toSec);
  }
  const table = standings(state, resolved, ms);
  const leagueDone = league.length > 0 && league.every((f) => ms[f.id].status === "done");

  const resolveSlot = (slot: Slot): string | null => {
    if ("team" in slot) return slot.team;
    if ("rank" in slot) return leagueDone ? table[slot.rank - 1]?.team ?? null : null;
    const ref = "winner" in slot ? slot.winner : slot.loser;
    const m = ms[ref];
    const r = resolved[ref];
    if (!m || !r || m.status !== "done" || !m.winner) return null;
    const winnerId = m.winner === "A" ? r.a : r.b;
    const loserId = m.winner === "A" ? r.b : r.a;
    return "winner" in slot ? winnerId : loserId;
  };
  for (const fx of [...config.fixtures].filter((f) => f.stage !== "League").sort((x, y) => x.no - y.no)) {
    const o = doc(fx.id).over ?? {};
    resolved[fx.id] = {
      a: o.a ?? resolveSlot(fx.a),
      b: o.b ?? resolveSlot(fx.b),
      labelA: slotLabel(fx.a, config),
      labelB: slotLabel(fx.b, config),
    };
    ms[fx.id] = derive(doc(fx.id).ev, formatFor(fx, config.settings), toSec);
  }
  const final = config.fixtures.find((f) => f.stage === "Final");
  let champion: string | null = null;
  let runnerUp: string | null = null;
  if (final && ms[final.id]?.status === "done") {
    const r = resolved[final.id];
    const w = ms[final.id].winner;
    champion = w === "A" ? r.a : r.b;
    runnerUp = w === "A" ? r.b : r.a;
  }
  return { resolved, ms, table, leagueDone, champion, runnerUp };
}

// ---------- Standings ----------

export interface Row {
  team: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  ptsFor: number;
  ptsAgainst: number;
  points: number;
}

export function pointsFor(settings: Settings, winSets: number, loseSets: number) {
  return settings.points[`${winSets}-${loseSets}`] ?? { w: 2, l: 0 };
}

/** Every possible final set score for a format, e.g. best of 3 → ["2-0","2-1"]. */
export function resultKeys(f: Format): string[] {
  const n = setsToWin(f);
  return Array.from({ length: n }, (_, i) => `${n}-${i}`);
}

export function standings(
  state: AppState,
  resolved: Record<string, Resolved>,
  ms: Record<string, MatchState>,
): Row[] {
  const { config } = state;
  const rows: Record<string, Row> = {};
  for (const t of config.teams)
    rows[t.id] = { team: t.id, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, ptsFor: 0, ptsAgainst: 0, points: 0 };
  const h2h: Record<string, string> = {}; // "x|y" -> winner id
  for (const fx of config.fixtures) {
    if (fx.stage !== "League") continue;
    const m = ms[fx.id];
    const r = resolved[fx.id];
    if (!m || m.status !== "done" || !r?.a || !r?.b || !rows[r.a] || !rows[r.b]) continue;
    const A = rows[r.a];
    const B = rows[r.b];
    A.played++;
    B.played++;
    A.setsWon += m.setsA;
    A.setsLost += m.setsB;
    B.setsWon += m.setsB;
    B.setsLost += m.setsA;
    for (const s of m.sets) {
      A.ptsFor += s.a;
      A.ptsAgainst += s.b;
      B.ptsFor += s.b;
      B.ptsAgainst += s.a;
    }
    const aWon = m.winner === "A";
    const W = aWon ? A : B;
    const L = aWon ? B : A;
    W.won++;
    L.lost++;
    const p = pointsFor(config.settings, Math.max(m.setsA, m.setsB), Math.min(m.setsA, m.setsB));
    W.points += p.w;
    L.points += p.l;
    h2h[[r.a, r.b].sort().join("|")] = W.team;
  }
  const ratio = (x: number, y: number) => (y === 0 ? (x === 0 ? 0 : Infinity) : x / y);
  const val = (r: Row, k: TieKey): number => {
    switch (k) {
      case "points": return r.points;
      case "wins": return r.won;
      case "setDiff": return r.setsWon - r.setsLost;
      case "setsWon": return r.setsWon;
      case "setRatio": return ratio(r.setsWon, r.setsLost);
      case "pointDiff": return r.ptsFor - r.ptsAgainst;
      case "pointRatio": return ratio(r.ptsFor, r.ptsAgainst);
      default: return 0;
    }
  };
  const order = config.teams.map((t) => t.id);
  return Object.values(rows).sort((x, y) => {
    for (const k of config.settings.tiebreak) {
      if (k === "headToHead") {
        const w = h2h[[x.team, y.team].sort().join("|")];
        if (w) return w === x.team ? -1 : 1;
        continue;
      }
      const d = val(y, k) - val(x, k);
      if (d !== 0 && !Number.isNaN(d)) return d > 0 ? 1 : -1;
    }
    return order.indexOf(x.team) - order.indexOf(y.team);
  });
}

export const TIE_LABELS: Record<TieKey, string> = {
  points: "League points",
  wins: "Matches won",
  setDiff: "Set difference",
  setsWon: "Sets won",
  setRatio: "Set ratio (won ÷ lost)",
  pointDiff: "Point difference",
  pointRatio: "Point ratio (scored ÷ conceded)",
  headToHead: "Head-to-head result",
};

export function scoreLine(m: MatchState): string {
  return m.sets
    .filter((s) => s.a + s.b > 0 || s.winner)
    .map((s) => `${s.a}–${s.b}`)
    .join(", ");
}
