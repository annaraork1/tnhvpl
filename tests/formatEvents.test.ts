import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEventLog } from "../lib/formatEvents.ts";
import type { Format, MatchEvent } from "../lib/types.ts";

const F: Format = { bestOf: 3, targets: [15, 15, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true };

test("formats start, points, set win, next set", () => {
  const ev: MatchEvent[] = [
    { k: "start", serve: "A", t: 1_000 },
    ...Array.from({ length: 15 }, () => ({ k: "pt" as const, s: "A" as const })),
    { k: "next" },
    { k: "pt", s: "B" },
  ];
  const lines = formatEventLog(ev, { labelA: "Blue", labelB: "Red", format: F });
  assert.equal(lines[0].text, "Match started — Blue serves first");
  assert.ok(lines.some((l) => l.text.includes("Point — Blue (1–0)")));
  assert.ok(lines.some((l) => l.text === "Set 1 won by Blue 15–0"));
  assert.ok(lines.some((l) => l.text === "Set 2 started"));
  assert.ok(lines.some((l) => l.text === "Point — Red (0–1) · Set 2"));
});

test("formats timeout and resume", () => {
  const ev: MatchEvent[] = [
    { k: "start", serve: "B" },
    { k: "pt", s: "A" },
    { k: "to", s: "B", t: 2_000 },
    { k: "resume", t: 3_000 },
  ];
  const lines = formatEventLog(ev, { labelA: "A-Team", labelB: "B-Team", format: F });
  assert.equal(lines[0].text, "Match started — B-Team serves first");
  assert.equal(lines[2].text, "Timeout — B-Team (1–0) · Set 1");
  assert.equal(lines[3].text, "Timeout ended — play resumed");
});
