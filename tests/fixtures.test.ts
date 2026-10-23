import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRest, generateFixtures, type FixtureGenInput } from "../lib/fixtures.ts";

const teams5 = ["eagle", "saiyans", "supreme", "spike", "pavilion"];
const teams4 = ["a", "b", "c", "d"];
const teams6 = ["a", "b", "c", "d", "e", "f"];

const season5Days = [
  { date: "2026-10-31", label: "Day 1", start: "4:00 PM", end: "10:00 PM" },
  { date: "2026-11-01", label: "Day 2", start: "4:00 PM", end: "10:00 PM" },
];

const season5Input: FixtureGenInput = {
  teamIds: teams5,
  days: season5Days,
  leagueSlotMinutes: 45,
  playoffSlotMinutes: 60,
  breakBeforePlayoffsMinutes: 0,
  playoffFormat: "qualifier",
  roundRobin: "single",
};

test("Season 5: 5 teams → 0 back-to-backs, 6 short gaps, max 2 per team", () => {
  const { fixtures, report, error } = generateFixtures(season5Input);
  assert.equal(error, undefined);
  assert.equal(fixtures.filter((f) => f.stage === "League").length, 10);
  assert.equal(fixtures.filter((f) => f.stage !== "League").length, 4);

  const totalBtb = report.reduce((s, r) => s + r.backToBacks, 0);
  const totalShort = report.reduce((s, r) => s + r.shortGaps, 0);
  const maxShort = Math.max(...report.map((r) => r.shortGaps));

  assert.equal(totalBtb, 0);
  assert.equal(totalShort, 6);
  assert.equal(maxShort, 2);

  // Playoff shape
  const q1 = fixtures.find((f) => f.stage === "Qualifier 1")!;
  const elim = fixtures.find((f) => f.stage === "Eliminator")!;
  const q2 = fixtures.find((f) => f.stage === "Qualifier 2")!;
  const fin = fixtures.find((f) => f.stage === "Final")!;
  assert.deepEqual(q1.a, { rank: 1 });
  assert.deepEqual(q1.b, { rank: 2 });
  assert.deepEqual(elim.a, { rank: 3 });
  assert.deepEqual(elim.b, { rank: 4 });
  assert.deepEqual(q2.a, { loser: q1.id });
  assert.deepEqual(q2.b, { winner: elim.id });
  assert.deepEqual(fin.a, { winner: q1.id });
  assert.deepEqual(fin.b, { winner: q2.id });
  assert.equal(q1.time, "5:30 PM");
  assert.equal(elim.time, "6:30 PM");
  assert.equal(q2.time, "7:30 PM");
  assert.equal(fin.time, "8:30 PM");
});

test("4 teams → 6 matches, 0 back-to-backs", () => {
  // Two matches/day (4 teams need a full partition per pair of slots for 0 BTBs).
  const { fixtures, report, error } = generateFixtures({
    teamIds: teams4,
    days: [
      { date: "2026-10-31", label: "Day 1", start: "4:00 PM", end: "5:30 PM" },
      { date: "2026-11-01", label: "Day 2", start: "4:00 PM", end: "5:30 PM" },
      { date: "2026-11-02", label: "Day 3", start: "4:00 PM", end: "5:30 PM" },
    ],
    leagueSlotMinutes: 45,
    playoffSlotMinutes: 60,
    breakBeforePlayoffsMinutes: 0,
    playoffFormat: "none",
    roundRobin: "single",
  });
  assert.equal(error, undefined);
  assert.equal(fixtures.length, 6);
  const totalBtb = report.reduce((s, r) => s + r.backToBacks, 0);
  assert.equal(totalBtb, 0);
});

test("6 teams → 15 matches generates without throw", () => {
  const { fixtures, error } = generateFixtures({
    teamIds: teams6,
    days: [
      { date: "2026-10-31", label: "Day 1", start: "2:00 PM", end: "10:00 PM" },
      { date: "2026-11-01", label: "Day 2", start: "2:00 PM", end: "10:00 PM" },
    ],
    leagueSlotMinutes: 45,
    playoffSlotMinutes: 60,
    breakBeforePlayoffsMinutes: 0,
    playoffFormat: "none",
    roundRobin: "single",
  });
  assert.equal(error, undefined);
  assert.equal(fixtures.length, 15);
});

test("slots that do not fit → clear error naming how many", () => {
  const { fixtures, error } = generateFixtures({
    teamIds: teams5,
    days: [
      { date: "2026-10-31", label: "Day 1", start: "4:00 PM", end: "5:00 PM" },
    ],
    leagueSlotMinutes: 45,
    playoffSlotMinutes: 60,
    breakBeforePlayoffsMinutes: 0,
    playoffFormat: "none",
    roundRobin: "single",
  });
  assert.ok(error);
  assert.match(error!, /\d+ league match/);
  assert.equal(fixtures.length, 0);
});

test("analyzeRest counts back-to-backs and short gaps", () => {
  const fixtures = [
    {
      id: "m1",
      no: 1,
      stage: "League",
      day: "Day 1",
      date: "2026-10-31",
      time: "4:00 PM",
      a: { team: "a" },
      b: { team: "b" },
    },
    {
      id: "m2",
      no: 2,
      stage: "League",
      day: "Day 1",
      date: "2026-10-31",
      time: "4:45 PM",
      a: { team: "a" },
      b: { team: "c" },
    },
    {
      id: "m3",
      no: 3,
      stage: "League",
      day: "Day 1",
      date: "2026-10-31",
      time: "5:30 PM",
      a: { team: "b" },
      b: { team: "c" },
    },
  ];
  const report = analyzeRest(fixtures, ["a", "b", "c"]);
  const byId = Object.fromEntries(report.map((r) => [r.teamId, r]));
  assert.equal(byId.a!.backToBacks, 1);
  assert.equal(byId.b!.shortGaps, 1);
  assert.equal(byId.c!.backToBacks, 1);
});
