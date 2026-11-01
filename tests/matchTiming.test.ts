import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, matchTiming } from "../lib/matchTiming.ts";
import type { Format, MatchEvent } from "../lib/types.ts";

const F: Format = { bestOf: 3, targets: [15, 15, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };

function pts(side: "A" | "B", n: number, t0: number, step = 1000): MatchEvent[] {
  return Array.from({ length: n }, (_, i) => ({ k: "pt" as const, s: side, t: t0 + i * step }));
}

describe("formatDuration", () => {
  it("formats seconds, minutes, hours", () => {
    assert.equal(formatDuration(5_000), "5s");
    assert.equal(formatDuration(65_000), "1m 5s");
    assert.equal(formatDuration(120_000), "2m");
    assert.equal(formatDuration(3_661_000), "1h 1m 1s");
    assert.equal(formatDuration(null), null);
  });
});

describe("matchTiming", () => {
  it("returns null before start", () => {
    assert.equal(matchTiming([], F), null);
    assert.equal(matchTiming([{ k: "pt", s: "A", t: 1 }], F), null);
  });

  it("computes start, end, and per-set duration for a 2-0 match", () => {
    const t0 = 1_700_000_000_000;
    const ev: MatchEvent[] = [
      { k: "start", serve: "A", t: t0 },
      ...pts("A", 15, t0 + 60_000), // set 1 ends at t0+60k+14k
      { k: "next", t: t0 + 90_000 },
      ...pts("A", 15, t0 + 100_000),
    ];
    const timing = matchTiming(ev, F);
    assert.ok(timing);
    assert.equal(timing!.done, true);
    assert.equal(timing!.startedAt, t0);
    assert.equal(timing!.sets.length, 2);

    assert.equal(timing!.sets[0]!.a, 15);
    assert.equal(timing!.sets[0]!.b, 0);
    assert.equal(timing!.sets[0]!.startedAt, t0);
    assert.equal(timing!.sets[0]!.endedAt, t0 + 60_000 + 14_000);
    assert.equal(timing!.sets[0]!.durationMs, 74_000);

    assert.equal(timing!.sets[1]!.startedAt, t0 + 90_000);
    assert.equal(timing!.sets[1]!.endedAt, t0 + 100_000 + 14_000);
    assert.equal(timing!.sets[1]!.durationMs, 24_000);

    assert.equal(timing!.endedAt, t0 + 100_000 + 14_000);
    assert.equal(timing!.durationMs, timing!.endedAt! - t0);
  });

  it("handles missing timestamps without throwing", () => {
    const ev: MatchEvent[] = [
      { k: "start", serve: "B" },
      ...Array.from({ length: 15 }, () => ({ k: "pt" as const, s: "A" as const })),
      { k: "next" },
      ...Array.from({ length: 15 }, () => ({ k: "pt" as const, s: "A" as const })),
    ];
    const timing = matchTiming(ev, F);
    assert.ok(timing);
    assert.equal(timing!.done, true);
    assert.equal(timing!.startedAt, null);
    assert.equal(timing!.endedAt, null);
    assert.equal(timing!.durationMs, null);
    assert.equal(timing!.sets[0]!.durationMs, null);
    assert.equal(timing!.sets.length, 2);
  });
});
