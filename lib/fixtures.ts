import type { Fixture, FixtureGenDay, Slot } from "./types";

export interface RestReport {
  teamId: string;
  matchesPerDay: Record<string, number>;
  backToBacks: number;
  shortGaps: number;
}

export interface FixtureGenInput {
  teamIds: string[];
  days: FixtureGenDay[];
  leagueSlotMinutes: number;
  playoffSlotMinutes: number;
  breakBeforePlayoffsMinutes: number;
  playoffFormat: "qualifier" | "semis" | "final" | "none";
  roundRobin: "single" | "double";
}

type Pair = { a: string; b: string };

type LeagueSlot = {
  day: string;
  date: string;
  time: string;
  dayIndex: number;
  indexOnDay: number;
};

/** Lexicographic: back-to-backs, short gaps, max short/team, balance, Q1 soft. */
type Score = [number, number, number, number, number];

const BYE = "__BYE__";

export function generateFixtures(
  input: FixtureGenInput,
): { fixtures: Fixture[]; report: RestReport[]; error?: string } {
  const teamIds = input.teamIds;
  if (teamIds.length < 2) {
    return { fixtures: [], report: [], error: "Need at least 2 teams" };
  }
  if (!input.days.length) {
    return { fixtures: [], report: [], error: "Need at least one day" };
  }

  const pairs = leaguePairings(teamIds, input.roundRobin);
  const playoffSpecs = playoffMatchSpecs(input.playoffFormat);
  const allocated = allocateSlots(
    input.days,
    pairs.length,
    playoffSpecs.length,
    input.leagueSlotMinutes,
    input.playoffSlotMinutes,
    input.breakBeforePlayoffsMinutes,
  );
  if (allocated.error) {
    return { fixtures: [], report: analyzeRest([], teamIds), error: allocated.error };
  }
  const { leagueSlots, playoffStarts } = allocated;

  const ordered = orderLeagueMatches(pairs, leagueSlots, teamIds, playoffSpecs.length > 0);
  const fixtures: Fixture[] = [];
  let no = 1;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    const s = leagueSlots[i]!;
    fixtures.push({
      id: `m${no}`,
      no,
      stage: "League",
      day: s.day,
      date: s.date,
      time: s.time,
      a: { team: p.a },
      b: { team: p.b },
    });
    no++;
  }

  const lastDay = input.days[input.days.length - 1]!;
  const idByStage: Record<string, string> = {};
  for (let i = 0; i < playoffSpecs.length; i++) {
    const spec = playoffSpecs[i]!;
    const id = `m${no}`;
    idByStage[spec.stage] = id;
    fixtures.push({
      id,
      no,
      stage: spec.stage,
      day: lastDay.label,
      date: lastDay.date,
      time: formatTime(playoffStarts[i]!),
      a: resolvePlayoffSlot(spec.a, idByStage),
      b: resolvePlayoffSlot(spec.b, idByStage),
    });
    no++;
  }

  return { fixtures, report: analyzeRest(fixtures, teamIds) };
}

export function analyzeRest(fixtures: Fixture[], teamIds: string[]): RestReport[] {
  const byDay = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    if (!("team" in f.a) || !("team" in f.b)) continue;
    const list = byDay.get(f.day) ?? [];
    list.push(f);
    byDay.set(f.day, list);
  }

  const reports = new Map<string, RestReport>();
  for (const id of teamIds) {
    reports.set(id, { teamId: id, matchesPerDay: {}, backToBacks: 0, shortGaps: 0 });
  }

  for (const [day, dayFixtures] of byDay) {
    const slotTeams = dayFixtures.map((f) =>
      "team" in f.a && "team" in f.b ? [f.a.team, f.b.team] : null,
    );

    for (const id of teamIds) {
      const indices: number[] = [];
      for (let i = 0; i < slotTeams.length; i++) {
        const t = slotTeams[i];
        if (t && (t[0] === id || t[1] === id)) indices.push(i);
      }
      const r = reports.get(id)!;
      if (indices.length) r.matchesPerDay[day] = indices.length;
      for (let k = 0; k < indices.length - 1; k++) {
        const gap = indices[k + 1]! - indices[k]!;
        if (gap === 1) r.backToBacks++;
        else if (gap === 2) r.shortGaps++;
      }
    }
  }

  return teamIds.map((id) => reports.get(id)!);
}

/** Circle method; double RR appends home/away swapped. */
export function leaguePairings(teamIds: string[], roundRobin: "single" | "double"): Pair[] {
  const arr = [...teamIds];
  if (arr.length % 2 === 1) arr.push(BYE);
  const n = arr.length;
  const rounds = n - 1;
  const half = n / 2;
  const rotating = [...arr];
  const firstHalf: Pair[] = [];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      let a = rotating[i]!;
      let b = rotating[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      if (r % 2 === 1) [a, b] = [b, a];
      firstHalf.push({ a, b });
    }
    const last = rotating.pop()!;
    rotating.splice(1, 0, last);
  }

  if (roundRobin === "single") return firstHalf;
  return [...firstHalf, ...firstHalf.map((p) => ({ a: p.b, b: p.a }))];
}

type PlayoffRef = { rank: number } | { winnerOf: string } | { loserOf: string };

function playoffMatchSpecs(
  format: FixtureGenInput["playoffFormat"],
): { stage: string; a: PlayoffRef; b: PlayoffRef }[] {
  if (format === "none") return [];
  if (format === "final") {
    return [{ stage: "Final", a: { rank: 1 }, b: { rank: 2 } }];
  }
  if (format === "semis") {
    return [
      { stage: "Semi 1", a: { rank: 1 }, b: { rank: 4 } },
      { stage: "Semi 2", a: { rank: 2 }, b: { rank: 3 } },
      { stage: "Final", a: { winnerOf: "Semi 1" }, b: { winnerOf: "Semi 2" } },
    ];
  }
  return [
    { stage: "Qualifier 1", a: { rank: 1 }, b: { rank: 2 } },
    { stage: "Eliminator", a: { rank: 3 }, b: { rank: 4 } },
    { stage: "Qualifier 2", a: { loserOf: "Qualifier 1" }, b: { winnerOf: "Eliminator" } },
    { stage: "Final", a: { winnerOf: "Qualifier 1" }, b: { winnerOf: "Qualifier 2" } },
  ];
}

function resolvePlayoffSlot(ref: PlayoffRef, idByStage: Record<string, string>): Slot {
  if ("rank" in ref) return { rank: ref.rank };
  if ("winnerOf" in ref) return { winner: idByStage[ref.winnerOf]! };
  return { loser: idByStage[ref.loserOf]! };
}

function allocateSlots(
  days: FixtureGenDay[],
  leagueCount: number,
  playoffCount: number,
  leagueMins: number,
  playoffMins: number,
  breakMins: number,
): { leagueSlots: LeagueSlot[]; playoffStarts: number[]; error?: string } {
  const lastIdx = days.length - 1;
  const capacities: number[] = [];

  for (let d = 0; d < days.length; d++) {
    const day = days[d]!;
    const start = parseTime(day.start);
    const end = parseTime(day.end);
    if (end <= start) {
      return {
        leagueSlots: [],
        playoffStarts: [],
        error: `Day "${day.label}" has invalid time window`,
      };
    }
    const window = end - start;
    if (d < lastIdx || playoffCount === 0) {
      capacities.push(Math.floor(window / leagueMins));
    } else {
      const reserved = playoffCount * playoffMins + breakMins;
      if (reserved > window) {
        return {
          leagueSlots: [],
          playoffStarts: [],
          error: `${playoffCount} playoff match(es) do not fit on ${day.label}`,
        };
      }
      capacities.push(Math.floor((window - reserved) / leagueMins));
    }
  }

  const totalCap = capacities.reduce((a, b) => a + b, 0);
  if (totalCap < leagueCount) {
    const missing = leagueCount - totalCap;
    return {
      leagueSlots: [],
      playoffStarts: [],
      error: `${missing} league match(es) do not fit in the day windows`,
    };
  }

  const perDay = capacities.map(() => 0);
  let remaining = leagueCount;
  for (let d = 0; d < days.length && remaining > 0; d++) {
    const take = Math.min(capacities[d]!, remaining);
    perDay[d] = take;
    remaining -= take;
  }

  const leagueSlots: LeagueSlot[] = [];
  for (let d = 0; d < days.length; d++) {
    const day = days[d]!;
    const start = parseTime(day.start);
    for (let i = 0; i < perDay[d]!; i++) {
      leagueSlots.push({
        day: day.label,
        date: day.date,
        time: formatTime(start + i * leagueMins),
        dayIndex: d,
        indexOnDay: i,
      });
    }
  }

  const playoffStarts: number[] = [];
  if (playoffCount > 0) {
    const day = days[lastIdx]!;
    const start = parseTime(day.start);
    const leagueOnLast = perDay[lastIdx]!;
    let t = start + leagueOnLast * leagueMins + breakMins;
    for (let i = 0; i < playoffCount; i++) {
      playoffStarts.push(t);
      t += playoffMins;
    }
  }

  return { leagueSlots, playoffStarts };
}

function orderLeagueMatches(
  pairs: Pair[],
  slots: LeagueSlot[],
  teamIds: string[],
  hasPlayoffs: boolean,
): Pair[] {
  if (pairs.length === 0) return [];
  if (teamIds.length <= 6) {
    return exhaustiveSearch(pairs, slots, teamIds, hasPlayoffs);
  }
  return greedyRandom(pairs, slots, teamIds, hasPlayoffs, 300);
}

function dayGroups(slots: LeagueSlot[]): LeagueSlot[][] {
  const groups: LeagueSlot[][] = [];
  for (const s of slots) {
    const g = groups[groups.length - 1];
    if (g && g[0]!.dayIndex === s.dayIndex) g.push(s);
    else groups.push([s]);
  }
  return groups;
}

function exhaustiveSearch(
  pairs: Pair[],
  slots: LeagueSlot[],
  teamIds: string[],
  hasPlayoffs: boolean,
): Pair[] {
  const groups = dayGroups(slots);
  const t0 = Date.now();
  const budgetMs = 8_000;

  let best = greedyBuild(pairs, slots);
  let bestScore = scoreOrder(best, slots, teamIds, hasPlayoffs);

  // Random restarts first — often hit the optimum quickly for Season 5.
  while (Date.now() - t0 < 400) {
    const sh = shuffle([...pairs]);
    for (const cand of [greedyBuild(sh, slots), sh]) {
      const sc = scoreOrder(cand, slots, teamIds, hasPlayoffs);
      if (cmpScore(sc, bestScore) < 0) {
        best = cand;
        bestScore = sc;
      }
    }
  }

  // Two-day Season 5 shape: pick the smaller day via combinations, DFS the larger.
  if (groups.length === 2) {
    const c0 = groups[0]!.length;
    const c1 = groups[1]!.length;
    const pickSmall = c1 <= c0;
    const smallCount = pickSmall ? c1 : c0;
    const largeCount = pickSmall ? c0 : c1;

    forEachCombination(pairs.length, smallCount, (idxs) => {
      if (Date.now() - t0 > budgetMs) return;
      if (cmpScore(bestScore, [0, 0, 0, 0, 0]) === 0) return;

      const smallSet = new Set(idxs);
      const smallPairs: Pair[] = [];
      const largePairs: Pair[] = [];
      for (let i = 0; i < pairs.length; i++) {
        if (smallSet.has(i)) smallPairs.push(pairs[i]!);
        else largePairs.push(pairs[i]!);
      }
      if (smallPairs.length !== smallCount || largePairs.length !== largeCount) return;

      // Skip partitions that force a back-to-back on a 2-slot day.
      if (smallCount === 2 && sharesTeam(smallPairs[0]!, smallPairs[1]!)) return;

      const smallSlots = pickSmall ? groups[1]! : groups[0]!;
      const largeSlots = pickSmall ? groups[0]! : groups[1]!;

      const smallOrders = allOrders(smallPairs);
      for (const smallOrd of smallOrders) {
        if (Date.now() - t0 > budgetMs) return;
        const largeOrd = optimizeDay(largePairs, largeSlots.length, teamIds, bestScore, t0, budgetMs);
        if (!largeOrd) continue;

        const ordered = pickSmall
          ? [...largeOrd, ...smallOrd]
          : [...smallOrd, ...largeOrd];
        const sc = scoreOrder(ordered, slots, teamIds, hasPlayoffs);
        if (cmpScore(sc, bestScore) < 0) {
          best = ordered;
          bestScore = sc;
        }
      }
    });
    return best;
  }

  // Single day: full DFS.
  if (groups.length === 1 && pairs.length <= 9) {
    const ord = optimizeDay(pairs, pairs.length, teamIds, bestScore, t0, budgetMs);
    if (ord) {
      const sc = scoreOrder(ord, slots, teamIds, hasPlayoffs);
      if (cmpScore(sc, bestScore) < 0) best = ord;
    }
    return best;
  }

  // 3+ days: assign combinations recursively when the branching factor is small.
  if (groups.length >= 3 && pairs.length <= 15) {
    searchMultiDay(pairs, groups, teamIds, hasPlayoffs, slots, t0, budgetMs, (ord, sc) => {
      if (cmpScore(sc, bestScore) < 0) {
        best = ord;
        bestScore = sc;
      }
    });
  }
  return best;
}

function searchMultiDay(
  pairs: Pair[],
  groups: LeagueSlot[][],
  teamIds: string[],
  hasPlayoffs: boolean,
  allSlots: LeagueSlot[],
  t0: number,
  budgetMs: number,
  onFound: (ordered: Pair[], sc: Score) => void,
) {
  const counts = groups.map((g) => g.length);

  function rec(dayIdx: number, remaining: Pair[], placed: Pair[][]) {
    if (Date.now() - t0 > budgetMs) return;
    if (dayIdx === groups.length) {
      const ordered = placed.flat();
      onFound(ordered, scoreOrder(ordered, allSlots, teamIds, hasPlayoffs));
      return;
    }
    const need = counts[dayIdx]!;
    if (dayIdx === groups.length - 1) {
      if (remaining.length !== need) return;
      const ord =
        optimizeDay(remaining, need, teamIds, [Infinity, Infinity, Infinity, Infinity, Infinity], t0, budgetMs) ??
        remaining;
      placed.push(ord);
      rec(dayIdx + 1, [], placed);
      placed.pop();
      return;
    }
    forEachCombination(remaining.length, need, (idxs) => {
      if (Date.now() - t0 > budgetMs) return;
      const pick = new Set(idxs);
      const chosen: Pair[] = [];
      const next: Pair[] = [];
      for (let i = 0; i < remaining.length; i++) {
        if (pick.has(i)) chosen.push(remaining[i]!);
        else next.push(remaining[i]!);
      }
      if (need === 2 && chosen.length === 2 && sharesTeam(chosen[0]!, chosen[1]!)) return;
      const ord =
        optimizeDay(chosen, need, teamIds, [Infinity, Infinity, Infinity, Infinity, Infinity], t0, budgetMs) ??
        chosen;
      placed.push(ord);
      rec(dayIdx + 1, next, placed);
      placed.pop();
    });
  }

  rec(0, pairs, []);
}

function sharesTeam(x: Pair, y: Pair): boolean {
  return x.a === y.a || x.a === y.b || x.b === y.a || x.b === y.b;
}

function allOrders(pairs: Pair[]): Pair[][] {
  if (pairs.length <= 1) return [[...pairs]];
  if (pairs.length === 2) {
    return [
      [pairs[0]!, pairs[1]!],
      [pairs[1]!, pairs[0]!],
    ];
  }
  // Fallback: just greedy + identity for larger "small" days
  return [greedyBuild(pairs, pairs.map((_, i) => ({
    day: "d",
    date: "",
    time: "",
    dayIndex: 0,
    indexOnDay: i,
  }))), [...pairs]];
}

/**
 * DFS order for one day with incremental rest metrics and pruning against `bound`.
 */
function optimizeDay(
  dayPairs: Pair[],
  slotCount: number,
  teamIds: string[],
  bound: Score,
  t0: number,
  budgetMs: number,
): Pair[] | null {
  const n = dayPairs.length;
  if (n !== slotCount) return null;
  if (n === 0) return [];
  if (n > 9) {
    const slots = fakeSlots(n);
    return greedyBuild(dayPairs, slots);
  }

  const teamIndex = new Map(teamIds.map((id, i) => [id, i]));
  const T = teamIds.length;
  const used = new Uint8Array(n);
  const current: Pair[] = new Array(n);
  const lastSlot = new Int16Array(T).fill(-1);
  const counts = new Uint8Array(T);
  const shortPer = new Uint8Array(T);

  let best: Pair[] | null = null;
  let bestScore: Score = [...bound] as Score;

  // Seed with greedy
  {
    const g = greedyBuild(dayPairs, fakeSlots(n));
    const sc = dayScoreFromOrder(g, teamIds);
    if (cmpScore(sc, bestScore) < 0) {
      bestScore = sc;
      best = g;
    }
  }

  function dfs(i: number, btb: number, shorts: number) {
    if (Date.now() - t0 > budgetMs) return;
    if (btb > bestScore[0]!) return;
    if (btb === bestScore[0]! && shorts > bestScore[1]!) return;

    if (i === n) {
      let maxShort = 0;
      let sumSq = 0;
      let maxDay = 0;
      for (let t = 0; t < T; t++) {
        if (shortPer[t]! > maxShort) maxShort = shortPer[t]!;
        const c = counts[t]!;
        sumSq += c * c;
        if (c > maxDay) maxDay = c;
      }
      const sc: Score = [btb, shorts, maxShort, maxDay * 10_000 + sumSq, 0];
      if (cmpScore(sc, bestScore) < 0) {
        bestScore = sc;
        best = current.map((p) => ({ ...p }));
      }
      return;
    }

    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const p = dayPairs[j]!;
      const ia = teamIndex.get(p.a)!;
      const ib = teamIndex.get(p.b)!;

      let addBtb = 0;
      let addShort = 0;
      const la = lastSlot[ia]!;
      const lb = lastSlot[ib]!;
      if (la === i - 1) addBtb++;
      else if (la === i - 2) addShort++;
      if (lb === i - 1) addBtb++;
      else if (lb === i - 2) addShort++;

      const nb = btb + addBtb;
      const ns = shorts + addShort;
      if (nb > bestScore[0]!) continue;
      if (nb === bestScore[0]! && ns > bestScore[1]!) continue;

      used[j] = 1;
      current[i] = p;
      const prevLa = lastSlot[ia]!;
      const prevLb = lastSlot[ib]!;
      lastSlot[ia] = i;
      lastSlot[ib] = i;
      counts[ia]!++;
      counts[ib]!++;
      if (la === i - 2) shortPer[ia]!++;
      if (lb === i - 2) shortPer[ib]!++;

      dfs(i + 1, nb, ns);

      if (la === i - 2) shortPer[ia]!--;
      if (lb === i - 2) shortPer[ib]!--;
      counts[ia]!--;
      counts[ib]!--;
      lastSlot[ia] = prevLa;
      lastSlot[ib] = prevLb;
      used[j] = 0;
    }
  }

  dfs(0, 0, 0);
  return best;
}

function dayScoreFromOrder(ordered: Pair[], teamIds: string[]): Score {
  const slots = fakeSlots(ordered.length);
  return scoreOrder(ordered, slots, teamIds, false);
}

function fakeSlots(n: number): LeagueSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    day: "Day",
    date: "",
    time: "",
    dayIndex: 0,
    indexOnDay: i,
  }));
}

function forEachCombination(n: number, k: number, fn: (idxs: number[]) => void) {
  const cur: number[] = [];
  function rec(start: number) {
    if (cur.length === k) {
      fn(cur.slice());
      return;
    }
    const need = k - cur.length;
    for (let i = start; i <= n - need; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  }
  rec(0);
}

function greedyRandom(
  pairs: Pair[],
  slots: LeagueSlot[],
  teamIds: string[],
  hasPlayoffs: boolean,
  budgetMs: number,
): Pair[] {
  const t0 = Date.now();
  let best = greedyBuild(pairs, slots);
  let bestScore = scoreOrder(best, slots, teamIds, hasPlayoffs);

  while (Date.now() - t0 < budgetMs) {
    const shuffled = shuffle([...pairs]);
    for (const cand of [greedyBuild(shuffled, slots), shuffled]) {
      const sc = scoreOrder(cand, slots, teamIds, hasPlayoffs);
      if (cmpScore(sc, bestScore) < 0) {
        best = cand;
        bestScore = sc;
      }
    }
  }
  return best;
}

function greedyBuild(pairs: Pair[], slots: LeagueSlot[]): Pair[] {
  const remaining = [...pairs];
  const out: Pair[] = [];
  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s]!;
    const prev = out.length && slots[s - 1]?.dayIndex === slot.dayIndex ? out[out.length - 1]! : null;
    let bestIdx = 0;
    let bestPenalty = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]!;
      let pen = 0;
      if (prev) {
        if (prev.a === p.a || prev.a === p.b) pen += 1000;
        if (prev.b === p.a || prev.b === p.b) pen += 1000;
      }
      if (out.length >= 2 && slots[s - 2]?.dayIndex === slot.dayIndex) {
        const p2 = out[out.length - 2]!;
        if (p2.a === p.a || p2.a === p.b) pen += 10;
        if (p2.b === p.a || p2.b === p.b) pen += 10;
      }
      if (pen < bestPenalty) {
        bestPenalty = pen;
        bestIdx = i;
      }
    }
    out.push(remaining.splice(bestIdx, 1)[0]!);
  }
  return out;
}

function scoreOrder(
  ordered: Pair[],
  slots: LeagueSlot[],
  teamIds: string[],
  hasPlayoffs: boolean,
): Score {
  const fixtures: Fixture[] = ordered.map((p, i) => ({
    id: `t${i}`,
    no: i + 1,
    stage: "League",
    day: slots[i]!.day,
    date: slots[i]!.date,
    time: slots[i]!.time,
    a: { team: p.a },
    b: { team: p.b },
  }));
  const reports = analyzeRest(fixtures, teamIds);
  let btb = 0;
  let shortGaps = 0;
  let maxShort = 0;
  for (const r of reports) {
    btb += r.backToBacks;
    shortGaps += r.shortGaps;
    if (r.shortGaps > maxShort) maxShort = r.shortGaps;
  }

  let sumSq = 0;
  let maxDay = 0;
  for (const r of reports) {
    for (const c of Object.values(r.matchesPerDay)) {
      sumSq += c * c;
      if (c > maxDay) maxDay = c;
    }
  }
  const balance = maxDay * 10_000 + sumSq;

  let q1Soft = 0;
  if (hasPlayoffs && ordered.length > 0) {
    const last = slots[slots.length - 1]!;
    const lastPair = ordered[ordered.length - 1]!;
    const lastDayLen = slots.filter((s) => s.dayIndex === last.dayIndex).length;
    if (last.indexOnDay === lastDayLen - 1) {
      for (const tid of [lastPair.a, lastPair.b]) {
        const onDay = reports.find((x) => x.teamId === tid)?.matchesPerDay[last.day] ?? 0;
        if (onDay <= 1) q1Soft++;
      }
    }
  }

  return [btb, shortGaps, maxShort, balance, q1Soft];
}

function cmpScore(a: Score, b: Score): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

export function parseTime(s: string): number {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`Invalid time: ${s}`);
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]!.toUpperCase();
  if (h === 12) h = 0;
  if (ap === "PM") h += 12;
  return h * 60 + min;
}

export function formatTime(mins: number): string {
  let h = Math.floor(mins / 60) % 24;
  const min = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min.toString().padStart(2, "0")} ${ap}`;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
