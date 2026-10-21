import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsToSetWin, pressureBallForSide, pressureBalls } from "../lib/pressureBall.ts";
import type { Format } from "../lib/types.ts";

const F25: Format = { bestOf: 3, targets: [25, 25, 25], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };
const F21: Format = { bestOf: 3, targets: [21, 21, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };

test("to-25: Notice / Opal / Game at target−3/−2/−1", () => {
  assert.equal(pressureBallForSide("A", 22, 10, 25, F25, 0, 0), "notice");
  assert.equal(pressureBallForSide("A", 23, 10, 25, F25, 0, 0), "opal");
  assert.equal(pressureBallForSide("A", 24, 10, 25, F25, 0, 0), "game");
  assert.equal(pressureBallForSide("A", 21, 10, 25, F25, 0, 0), null);
});

test("to-21 and to-15 scale the same way", () => {
  assert.equal(pressureBallForSide("A", 18, 5, 21, F21, 0, 0), "notice");
  assert.equal(pressureBallForSide("A", 19, 5, 21, F21, 0, 0), "opal");
  assert.equal(pressureBallForSide("A", 20, 5, 21, F21, 0, 0), "game");
  assert.equal(pressureBallForSide("B", 5, 12, 15, F21, 0, 0), "notice");
  assert.equal(pressureBallForSide("B", 5, 13, 15, F21, 0, 0), "opal");
  assert.equal(pressureBallForSide("B", 5, 14, 15, F21, 0, 0), "game");
});

test("deuce: points-away, not absolute score", () => {
  // 24–24: neither can win on the next point → both Opal (2 away)
  assert.equal(pointsToSetWin(24, 24, 25, F25), 2);
  assert.deepEqual(pressureBalls(24, 24, 25, F25, 0, 0), { A: "opal", B: "opal" });
  // 25–24: leader Game, trailer Notice (3 away)
  assert.deepEqual(pressureBalls(25, 24, 25, F25, 0, 0), { A: "game", B: "notice" });
  // 25–25: both Opal
  assert.deepEqual(pressureBalls(25, 25, 25, F25, 0, 0), { A: "opal", B: "opal" });
  // 26–25: leader Game
  assert.deepEqual(pressureBalls(26, 25, 25, F25, 0, 0), { A: "game", B: "notice" });
});

test("Match Ball when next point wins the match", () => {
  // Sets 1–0, A at game point → Match Ball
  assert.equal(pressureBallForSide("A", 24, 20, 25, F25, 1, 0), "match");
  // Sets 0–0, same score → only Game Ball
  assert.equal(pressureBallForSide("A", 24, 20, 25, F25, 0, 0), "game");
  // Sets 1–1, B one away → Match Ball for B
  assert.equal(pressureBallForSide("B", 20, 24, 25, F25, 1, 1), "match");
});

test("both sides can show labels; finished set clears", () => {
  assert.deepEqual(pressureBalls(24, 23, 25, F25, 0, 0), { A: "game", B: "notice" });
  assert.deepEqual(pressureBalls(25, 23, 25, F25, 0, 0), { A: null, B: null });
  assert.deepEqual(pressureBalls(24, 20, 25, F25, 0, 0, { live: false }), { A: null, B: null });
});
