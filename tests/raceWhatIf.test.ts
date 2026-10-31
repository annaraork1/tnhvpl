import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAll } from "../lib/engine.ts";
import {
  applyWhatIf,
  enumeratePathsToRank,
  rankOf,
  remainingLeagueFixtures,
  syntheticMatchState,
} from "../lib/raceWhatIf.ts";
import { PLAYOFF_QUALIFY } from "../lib/qualify.ts";
import type { AppState, Format, MatchEvent, Side } from "../lib/types.ts";
import seed from "../lib/seed.json" with { type: "json" };

const L: Format = { bestOf: 3, targets: [15, 15, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };
const P: Format = { bestOf: 3, targets: [21, 21, 25], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };
const pts = (s: Side, n: number): MatchEvent[] => Array.from({ length: n }, () => ({ k: "pt", s }));
const win = (s: Side, close = false): MatchEvent[] =>
  close
    ? [{ k: "start", serve: "A" }, ...pts(s, 15), { k: "next" }, ...pts(s === "A" ? "B" : "A", 15), { k: "next" }, ...pts(s, 15)]
    : [{ k: "start", serve: "A" }, ...pts(s, 15), { k: "next" }, ...pts(s, 15)];

function blankState(): AppState {
  return {
    config: {
      v: 1,
      tournament: seed.tournament,
      teams: seed.teams,
      fixtures: seed.fixtures,
      settings: {
        league: L,
        playoff: P,
        points: { "2-0": { w: 2, l: 0 }, "2-1": { w: 2, l: 0 } },
        tiebreak: ["points", "setDiff", "setsWon", "pointRatio"],
        showPhotos: true,
        timeoutSeconds: 30,
      },
      awards: { setter: null, attacker: null, server: null, mvp: null, emerging: null },
    } as AppState["config"],
    players: [],
    matches: {},
    storage: "memory",
    serverTime: 0,
    tournamentKey: "test",
    meta: { key: "test", name: "Test", short: "T", subtitle: "", dates: "", logo: "/logo.png", createdAt: 0 },
    viewingArchive: false,
    registry: { v: 0, activeKey: "test", tournaments: [] },
  };
}

test("syntheticMatchState 2-0 and 2-1 from either side", () => {
  const a20 = syntheticMatchState(L, "A", "win-2-0");
  assert.equal(a20.status, "done");
  assert.equal(a20.winner, "A");
  assert.equal(a20.setsA, 2);
  assert.equal(a20.setsB, 0);

  const b21 = syntheticMatchState(L, "B", "win-2-1");
  assert.equal(b21.winner, "B");
  assert.equal(b21.setsB, 2);
  assert.equal(b21.setsA, 1);

  const lose = syntheticMatchState(L, "A", "lose-1-2");
  assert.equal(lose.winner, "B");
  assert.equal(lose.setsA, 1);
  assert.equal(lose.setsB, 2);
});

test("applyWhatIf awards points and setDiff for a coarse win", () => {
  const state = blankState();
  const rem = remainingLeagueFixtures(state, "eagle");
  assert.ok(rem.length >= 1);
  const first = rem[0]!;
  const { table, baseTable } = applyWhatIf(state, "eagle", { [first.fx.id]: "win-2-0" });
  const before = baseTable.find((r) => r.team === "eagle")!;
  const after = table.find((r) => r.team === "eagle")!;
  assert.equal(before.played, 0);
  assert.equal(after.played, 1);
  assert.equal(after.won, 1);
  assert.equal(after.points, 2);
  assert.equal(after.setsWon - after.setsLost, 2);
  assert.ok(rankOf(table, "eagle") <= rankOf(baseTable, "eagle"));
});

test("enumeratePaths finds a path to top 4 when enough wins remain", () => {
  const state = blankState();
  // Leave eagle with all games; winning all should put them in top 4 easily
  const paths = enumeratePathsToRank(state, "eagle", PLAYOFF_QUALIFY);
  assert.ok(paths.length > 0, "expected at least one path to top 4");
  assert.ok(paths[0]!.rank <= PLAYOFF_QUALIFY);
  // Easiest path should not require more wins than a harder one
  for (let i = 1; i < Math.min(paths.length, 5); i++) {
    assert.ok(paths[0]!.cost[0]! <= paths[i]!.cost[0]!);
  }
});

test("finished matches are not what-if'd again", () => {
  const state = blankState();
  const rem = remainingLeagueFixtures(state, "eagle");
  const id = rem[0]!.fx.id;
  const side = rem[0]!.side;
  state.matches[id] = { v: 1, ev: win(side) };
  assert.equal(computeAll(state).ms[id].status, "done");
  const afterRem = remainingLeagueFixtures(state, "eagle");
  assert.ok(!afterRem.some((r) => r.fx.id === id));
  const { table } = applyWhatIf(state, "eagle", { [id]: "lose-0-2" });
  // Real win stands; what-if lose ignored
  const row = table.find((r) => r.team === "eagle")!;
  assert.equal(row.won, 1);
  assert.equal(row.points, 2);
});
