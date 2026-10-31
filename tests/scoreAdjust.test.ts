import assert from "node:assert/strict";
import test from "node:test";
import { derive } from "../lib/engine.ts";
import type { Format, MatchEvent } from "../lib/types.ts";

const F: Format = {
  bestOf: 3,
  targets: [15, 15, 15],
  winBy: 2,
  cap: 0,
  timeouts: 2,
  switchInDecider: true,
};

test("adjust +/− changes score but not serve", () => {
  const ev: MatchEvent[] = [
    { k: "start", serve: "A" },
    { k: "pt", s: "A" }, // A scores, A serves
    { k: "pt", s: "B" }, // B scores, B serves
  ];
  const before = derive(ev, F);
  assert.equal(before.serve, "B");
  assert.equal(before.sets[0].a, 1);
  assert.equal(before.sets[0].b, 1);

  const plusA: MatchEvent[] = [...ev, { k: "adj", s: "A", n: 1 }];
  const afterPlus = derive(plusA, F);
  assert.equal(afterPlus.sets[0].a, 2);
  assert.equal(afterPlus.sets[0].b, 1);
  assert.equal(afterPlus.serve, "B", "adjust + must not steal serve");

  const minusB: MatchEvent[] = [...plusA, { k: "adj", s: "B", n: -1 }];
  const afterMinus = derive(minusB, F);
  assert.equal(afterMinus.sets[0].a, 2);
  assert.equal(afterMinus.sets[0].b, 0);
  assert.equal(afterMinus.serve, "B", "adjust − must not change serve");
});

test("rally point still changes serve", () => {
  const ev: MatchEvent[] = [
    { k: "start", serve: "A" },
    { k: "pt", s: "B" },
  ];
  assert.equal(derive(ev, F).serve, "B");
});
