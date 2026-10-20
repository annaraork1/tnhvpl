import assert from "node:assert/strict";
import { test } from "node:test";
import { derive } from "../lib/engine.ts";
import { defaultPracticeFormat } from "../lib/practiceTypes.ts";
import type { MatchEvent } from "../lib/types.ts";

test("default practice format is league-like", () => {
  const f = defaultPracticeFormat();
  assert.equal(f.bestOf, 3);
  assert.deepEqual(f.targets, [21, 21, 15]);
});

test("live practice-style match finishes 2-0", () => {
  const fmt = defaultPracticeFormat();
  const short = { ...fmt, targets: [15, 15, 15] };
  const pts = (n: number): MatchEvent[] => Array.from({ length: n }, () => ({ k: "pt" as const, s: "A" as const }));
  const ev: MatchEvent[] = [{ k: "start", serve: "A" }, ...pts(15), { k: "next" }, ...pts(15)];
  const st = derive(ev, short);
  assert.equal(st.status, "done");
  assert.equal(st.setsA, 2);
  assert.equal(st.setsB, 0);
  assert.equal(st.winner, "A");
});
