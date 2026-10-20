import { test } from "node:test";
import assert from "node:assert/strict";
import { derive, checkAction, setWinner, computeAll } from "../lib/engine.ts";
import type { AppState, Format, MatchEvent, Side } from "../lib/types.ts";
import seed from "../lib/seed.json" with { type: "json" };

const L: Format = { bestOf: 3, targets: [15, 15, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };
const P: Format = { bestOf: 3, targets: [21, 21, 25], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };
const pts = (s: Side, n: number): MatchEvent[] => Array.from({ length: n }, () => ({ k: "pt", s }));

test("set needs target and 2-point lead", () => {
  assert.equal(setWinner(15, 13, 15, L), "A");
  assert.equal(setWinner(15, 14, 15, L), null);
  assert.equal(setWinner(16, 14, 15, L), "A");
  assert.equal(setWinner(14, 16, 15, L), "B");
  assert.equal(setWinner(17, 16, 15, { ...L, cap: 17 }), "A");
});

test("full match 2-1 with set break, serve and timeouts", () => {
  const ev: MatchEvent[] = [{ k: "start", serve: "A" }, ...pts("A", 15)];
  let m = derive(ev, L);
  assert.equal(m.setsA, 1); assert.ok(m.awaitingNext); assert.equal(m.status, "live");
  assert.equal(checkAction(ev, L, { k: "pt", s: "A" }), "Start the next set first");
  ev.push({ k: "next" });
  m = derive(ev, L);
  assert.equal(m.cur, 1); assert.equal(m.serve, "B"); // set 2 first serve alternates
  const t0 = 1_000_000;
  ev.push({ k: "to", s: "A", t: t0 }, { k: "resume", t: t0 + 30_000 }, { k: "to", s: "A", t: t0 + 31_000 }, { k: "resume", t: t0 + 61_000 });
  assert.equal(checkAction(ev, L, { k: "to", s: "A" }, 30, t0 + 62_000), "No timeouts left this set");
  ev.push(...pts("B", 15), { k: "next" });
  m = derive(ev, L);
  assert.equal(m.setsB, 1); assert.ok(m.isDecider); assert.equal(m.serve, "A");
  ev.push(...pts("A", 8));
  assert.ok(derive(ev, L).switchNow, "switch sides at 8 in deciding set");
  ev.push(...pts("B", 1));
  assert.ok(!derive(ev, L).switchNow);
  ev.push(...pts("A", 7));
  m = derive(ev, L);
  assert.equal(m.status, "done"); assert.equal(m.winner, "A"); assert.equal(m.setsA, 2);
  assert.equal(checkAction(ev, L, { k: "pt", s: "B" }), "Match is finished");
  ev.pop(); // undo reopens the match
  assert.equal(derive(ev, L).status, "live");
});

test("timeout countdown blocks scoring until resume", () => {
  const t0 = 5_000_000;
  const ev: MatchEvent[] = [{ k: "start", serve: "A" }, { k: "to", s: "B", t: t0 }];
  const m = derive(ev, L, 30);
  assert.ok(m.timeout);
  assert.equal(m.timeout!.side, "B");
  assert.equal(m.timeout!.endsAt, t0 + 30_000);
  assert.equal(checkAction(ev, L, { k: "pt", s: "A" }, 30, t0 + 5_000), "Timeout in progress — resume when the timer ends");
  assert.equal(checkAction(ev, L, { k: "resume" }, 30, t0 + 5_000), "Timeout still running");
  assert.equal(checkAction(ev, L, { k: "resume" }, 30, t0 + 30_000), null);
  ev.push({ k: "resume", t: t0 + 30_000 });
  assert.equal(derive(ev, L, 30).timeout, null);
  assert.equal(checkAction(ev, L, { k: "pt", s: "A" }, 30, t0 + 31_000), null);
});

test("playoff targets 21-21-25", () => {
  const ev: MatchEvent[] = [{ k: "start", serve: "B" }, ...pts("A", 21), { k: "next" }, ...pts("B", 21), { k: "next" }];
  const m = derive(ev, P);
  assert.equal(m.sets[2].target, 25);
});

function play(ev: Record<string, MatchEvent[]>): AppState {
  const config = {
    v: 1,
    tournament: seed.tournament,
    teams: seed.teams,
    fixtures: seed.fixtures,
    settings: { league: L, playoff: P, points: { "2-0": { w: 2, l: 0 }, "2-1": { w: 2, l: 0 } }, tiebreak: ["points", "setDiff", "setsWon", "pointRatio"], showPhotos: true, timeoutSeconds: 30 },
    awards: { setter: null, attacker: null, server: null, mvp: null, emerging: null },
  } as AppState["config"];
  const matches: AppState["matches"] = {};
  for (const [id, e] of Object.entries(ev)) matches[id] = { v: 1, ev: e };
  return { config, players: [], matches, storage: "memory", serverTime: 0 };
}
const win = (s: Side, close = false): MatchEvent[] =>
  close
    ? [{ k: "start", serve: "A" }, ...pts(s, 15), { k: "next" }, ...pts(s === "A" ? "B" : "A", 15), { k: "next" }, ...pts(s, 15)]
    : [{ k: "start", serve: "A" }, ...pts(s, 15), { k: "next" }, ...pts(s, 15)];

test("standings and playoff resolution", () => {
  const ev: Record<string, MatchEvent[]> = {};
  // m1 Eagle v Saiyans ... make Eagle win everything, Pavilion second
  const results: Record<string, Side> = { m1: "A", m2: "A", m3: "B", m4: "A", m5: "A", m6: "A", m7: "A", m8: "A", m9: "A", m10: "A" };
  for (const [id, s] of Object.entries(results)) ev[id] = win(s, id === "m6");
  const st = computeAll(play(ev));
  assert.ok(st.leagueDone);
  assert.equal(st.table[0].team, "eagle");
  assert.equal(st.table[0].points, 8);
  assert.equal(st.resolved.m11.a, st.table[0].team);
  assert.equal(st.resolved.m12.b, st.table[3].team);
  assert.equal(st.resolved.m13.a, null);
  ev.m11 = [{ k: "start", serve: "A" }, ...pts("B", 21), { k: "next" }, ...pts("B", 21)];
  ev.m12 = [{ k: "start", serve: "A" }, ...pts("A", 21), { k: "next" }, ...pts("A", 21)];
  const st2 = computeAll(play(ev));
  assert.equal(st2.resolved.m13.a, st.table[0].team); // loser of Q1
  assert.equal(st2.resolved.m13.b, st.table[2].team); // winner of eliminator
  assert.equal(st2.resolved.m14.a, st.table[1].team); // winner of Q1
});

test("3-2-1-0 points option", () => {
  const ev: Record<string, MatchEvent[]> = { m1: win("A", true), m2: win("A") };
  const s = play(ev);
  s.config.settings.points = { "2-0": { w: 3, l: 0 }, "2-1": { w: 2, l: 1 } };
  const t = computeAll(s).table;
  const row = (id: string) => t.find((r) => r.team === id)!;
  assert.equal(row("eagle").points, 2);
  assert.equal(row("saiyans").points, 1);
  assert.equal(row("supreme").points, 3);
});
