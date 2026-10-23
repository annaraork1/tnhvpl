import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basePrice,
  checkAuctionEvent,
  deriveAuction,
  isValidBidAmount,
  leftoverCount,
  maxBidFor,
  nextBidAmounts,
  pickDrawNumber,
  stepForAmount,
} from "../lib/auction.ts";
import type { AuctionEvent, AuctionSettings, Player, Team } from "../lib/types.ts";

const settingsFlat: AuctionSettings = {
  purse: 10_000,
  minPlayers: 8,
  ownerCountsInSquad: false,
  basePriceBySkill: { Beginner: 100, Intermediate: 100, Advanced: 100 },
  increments: [{ upTo: null, step: 100 }],
  capUntilLeftover: true,
  timerSeconds: 0,
  antiSnipeSeconds: 0,
  autoSellOnTimer: false,
  rebid: { baseMultiplier: 0.5, maxRounds: null, floorPrice: 100 },
  finalUnsold: "keep-rebidding",
  drawOrder: "random",
  showPricesPublic: false,
};

const settingsTiered: AuctionSettings = {
  ...settingsFlat,
  increments: [
    { upTo: 1000, step: 100 },
    { upTo: null, step: 200 },
  ],
};

function makeTeams(n = 5): Team[] {
  const names = ["Spike Surge", "Eagle Squad", "Supreme Warriors", "Super Saiyans", "Pavilion Rovers"];
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: names[i] ?? `Team ${i + 1}`,
    short: `T${i + 1}`,
    color: "#000",
    owner: `Owner ${i + 1}`,
    logo: "",
    squad: [],
  }));
}

function makePlayers(n: number): Player[] {
  const skills = ["Beginner", "Intermediate", "Advanced"] as const;
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    name: `Player ${i + 1}`,
    skill: skills[i % 3],
    photo: null,
  }));
}

const t0 = 1_000_000;

test("max bid: balance 7300, 4 bought, min 8, base 100 → 7000", () => {
  assert.equal(maxBidFor(7300, 4, 8, 100), 7000);
});

test("leftover count: 43 players, 5 teams, min 8 → 3", () => {
  assert.equal(leftoverCount(43, 5, 8), 3);
});

test("cap until leftover: team at 8 cannot bid until 3 remain", () => {
  const teams = makeTeams(5);
  const players = makePlayers(43);
  const ev: AuctionEvent[] = [{ k: "start", t: t0, by: "admin" }];
  let t = t0;

  // Sell 8 players to t1 at base, then continue selling to others until 40 sold (all at min).
  const order: string[] = [];
  for (let slot = 0; slot < 8; slot++) {
    for (let ti = 0; ti < 5; ti++) order.push(`t${ti + 1}`);
  }
  // 40 sales
  for (let i = 0; i < 40; i++) {
    const no = i + 1;
    const teamId = order[i];
    t += 1;
    ev.push({ k: "draw", no, round: 1, t, by: "auctioneer" });
    t += 1;
    ev.push({ k: "reveal", t });
    t += 1;
    ev.push({ k: "bid", no, teamId, amount: 100, by: "auctioneer", t });
    t += 1;
    ev.push({ k: "sold", no, t, by: "auctioneer" });
  }

  // After 39 sold, notSold=4 > 3 → leftover closed; teams at 8 are ineligible
  const ev39 = ev.slice(0, 1 + 39 * 4);
  assert.equal(ev39.length, 1 + 39 * 4);
  let st = deriveAuction(ev39, settingsFlat, teams, players);
  assert.equal(st.leftover, 3);
  assert.equal(Object.keys(st.sold).length, 39);
  assert.equal(st.leftoverStage, false);
  const fullTeam = Object.values(st.teams).find((x) => x.bought >= 8);
  assert.ok(fullTeam);
  assert.equal(fullTeam!.eligible, false);
  assert.match(fullTeam!.reason ?? "", /Full until the last 3/);

  // After 40th sale, notSold=3 ≤ leftover → every team at 8 can bid again
  st = deriveAuction(ev, settingsFlat, teams, players);
  assert.equal(Object.keys(st.sold).length, 40);
  assert.equal(st.leftoverStage, true);
  assert.ok(Object.values(st.teams).every((x) => x.bought === 8 && x.eligible));
});

test("cannot outbid yourself; stale bid message; sold requires bid", () => {
  const teams = makeTeams(2);
  const players = makePlayers(5);
  const settings: AuctionSettings = { ...settingsFlat, minPlayers: 2, capUntilLeftover: false };
  const ev: AuctionEvent[] = [
    { k: "start", t: t0, by: "admin" },
    { k: "draw", no: 1, round: 1, t: t0 + 1, by: "auctioneer" },
    { k: "reveal", t: t0 + 2 },
    { k: "bid", no: 1, teamId: "t1", amount: 100, by: "owner", t: t0 + 3 },
  ];

  assert.equal(
    checkAuctionEvent(ev, settings, teams, players, {
      k: "bid",
      no: 1,
      teamId: "t1",
      amount: 200,
      by: "owner",
      t: t0 + 4,
    }),
    "Cannot outbid yourself",
  );

  assert.match(
    checkAuctionEvent(
      ev,
      settings,
      teams,
      players,
      { k: "bid", no: 1, teamId: "t2", amount: 200, by: "owner", t: t0 + 4 },
      { no: 1, highAmount: 0 },
    ) ?? "",
    /Outbid: current bid is 100 by Spike Surge/,
  );

  const noBid: AuctionEvent[] = [
    { k: "start", t: t0, by: "admin" },
    { k: "draw", no: 1, round: 1, t: t0 + 1, by: "auctioneer" },
    { k: "reveal", t: t0 + 2 },
  ];
  assert.equal(
    checkAuctionEvent(noBid, settings, teams, players, { k: "sold", no: 1, t: t0 + 3, by: "auctioneer" }),
    "Sold requires a bid",
  );
});

test("tiered increments: valid and invalid amounts", () => {
  assert.equal(stepForAmount(500, settingsTiered.increments), 100);
  assert.equal(stepForAmount(1000, settingsTiered.increments), 200);
  assert.equal(stepForAmount(999, settingsTiered.increments), 100);

  assert.equal(isValidBidAmount(100, null, 100, settingsTiered.increments), true);
  assert.equal(isValidBidAmount(200, null, 100, settingsTiered.increments), true);
  assert.equal(isValidBidAmount(150, null, 100, settingsTiered.increments), false);

  // From 900, step 100 → 1000 OK; from 1000, step 200 → 1200 OK, 1100 not
  assert.equal(isValidBidAmount(1000, 900, 100, settingsTiered.increments), true);
  assert.equal(isValidBidAmount(1100, 1000, 100, settingsTiered.increments), false);
  assert.equal(isValidBidAmount(1200, 1000, 100, settingsTiered.increments), true);
});

test("base price by skill and rebid multiplier with floor", () => {
  const settings: AuctionSettings = {
    ...settingsFlat,
    basePriceBySkill: { Beginner: 100, Intermediate: 200, Advanced: 300 },
    rebid: { baseMultiplier: 0.5, maxRounds: null, floorPrice: 100 },
  };
  const adv: Player = { no: 1, name: "A", skill: "Advanced", photo: null };
  const beg: Player = { no: 2, name: "B", skill: "Beginner", photo: null };
  assert.equal(basePrice(adv, settings, 1), 300);
  assert.equal(basePrice(beg, settings, 1), 100);
  // round 2: Advanced 300*0.5=150 → ceil to step 100 → 200? step from 0 is 100, ceil(150/100)*100=200
  assert.equal(basePrice(adv, settings, 2), 200);
  // Beginner 100*0.5=50, floor 100 → 100
  assert.equal(basePrice(beg, settings, 2), 100);
});

test("nextBidAmounts quick raise", () => {
  const teams = makeTeams(2);
  const players = makePlayers(3);
  const ev: AuctionEvent[] = [
    { k: "start", t: t0, by: "admin" },
    { k: "draw", no: 1, round: 1, t: t0 + 1, by: "auctioneer" },
    { k: "reveal", t: t0 + 2 },
    { k: "bid", no: 1, teamId: "t1", amount: 100, by: "auctioneer", t: t0 + 3 },
  ];
  const st = deriveAuction(ev, settingsFlat, teams, players);
  assert.deepEqual(nextBidAmounts(st, settingsFlat, "t2"), { quick: 200, min: 200 });
});

test("full sim ends 9/9/9/8/8 with all purses ≥ 0", () => {
  const teams = makeTeams(5);
  const players = makePlayers(43);
  const ev: AuctionEvent[] = [{ k: "start", t: t0, by: "admin" }];
  let t = t0;

  // First 40: each team buys 8 at 100 in round-robin
  const buyers: string[] = [];
  for (let slot = 0; slot < 8; slot++) {
    for (let ti = 0; ti < 5; ti++) buyers.push(`t${ti + 1}`);
  }
  for (let i = 0; i < 40; i++) {
    const no = i + 1;
    t += 1;
    ev.push({ k: "draw", no, round: 1, t, by: "auctioneer" });
    t += 1;
    ev.push({ k: "reveal", t });
    t += 1;
    ev.push({ k: "bid", no, teamId: buyers[i], amount: 100, by: "auctioneer", t });
    t += 1;
    ev.push({ k: "sold", no, t, by: "auctioneer" });
  }

  // Leftover 3 → t1, t2, t3 get a 9th
  for (let i = 0; i < 3; i++) {
    const no = 41 + i;
    const teamId = `t${i + 1}`;
    t += 1;
    ev.push({ k: "draw", no, round: 1, t, by: "auctioneer" });
    t += 1;
    ev.push({ k: "reveal", t });
    t += 1;
    ev.push({ k: "bid", no, teamId, amount: 100, by: "auctioneer", t });
    t += 1;
    ev.push({ k: "sold", no, t, by: "auctioneer" });
  }

  // Validate each step was legal
  for (let i = 0; i < ev.length; i++) {
    const err = checkAuctionEvent(ev.slice(0, i), settingsFlat, teams, players, ev[i]);
    assert.equal(err, null, `event ${i} ${ev[i].k}: ${err}`);
  }

  const st = deriveAuction(ev, settingsFlat, teams, players);
  assert.equal(st.status, "complete");
  assert.equal(Object.keys(st.sold).length, 43);

  const counts = teams.map((tm) => st.teams[tm.id].bought).sort((a, b) => b - a);
  assert.deepEqual(counts, [9, 9, 9, 8, 8]);

  for (const tm of teams) {
    assert.ok(st.teams[tm.id].balance >= 0, `${tm.id} purse negative`);
  }
});

test("round-complete when pool empty and unsold remain; nextRound redraws", () => {
  const teams = makeTeams(2);
  const players = makePlayers(2);
  const settings: AuctionSettings = { ...settingsFlat, minPlayers: 1, capUntilLeftover: false };
  const ev: AuctionEvent[] = [
    { k: "start", t: t0, by: "admin" },
    { k: "draw", no: 1, round: 1, t: t0 + 1, by: "auctioneer" },
    { k: "reveal", t: t0 + 2 },
    { k: "unsold", no: 1, t: t0 + 3, by: "auctioneer" },
    { k: "draw", no: 2, round: 1, t: t0 + 4, by: "auctioneer" },
    { k: "reveal", t: t0 + 5 },
    { k: "bid", no: 2, teamId: "t1", amount: 100, by: "auctioneer", t: t0 + 6 },
    { k: "sold", no: 2, t: t0 + 7, by: "auctioneer" },
  ];
  let st = deriveAuction(ev, settings, teams, players);
  assert.equal(st.status, "round-complete");
  assert.deepEqual(st.unsold, [1]);
  assert.equal(st.pool.length, 0);

  assert.equal(checkAuctionEvent(ev, settings, teams, players, { k: "draw", no: 1, round: 1, t: t0 + 8, by: "a" }), "Start the next round first");
  assert.equal(checkAuctionEvent(ev, settings, teams, players, { k: "nextRound", t: t0 + 8, by: "a" }), null);

  ev.push({ k: "nextRound", t: t0 + 8, by: "a" });
  st = deriveAuction(ev, settings, teams, players);
  assert.equal(st.round, 2);
  assert.deepEqual(st.pool, [1]);
  assert.deepEqual(st.unsold, []);
  assert.equal(st.status, "drawing");
});

test("paused blocks bids", () => {
  const teams = makeTeams(2);
  const players = makePlayers(3);
  const settings: AuctionSettings = { ...settingsFlat, minPlayers: 1, capUntilLeftover: false };
  const ev: AuctionEvent[] = [
    { k: "start", t: t0, by: "admin" },
    { k: "draw", no: 1, round: 1, t: t0 + 1, by: "auctioneer" },
    { k: "reveal", t: t0 + 2 },
    { k: "pause", t: t0 + 3, by: "auctioneer" },
  ];
  assert.equal(
    checkAuctionEvent(ev, settings, teams, players, {
      k: "bid",
      no: 1,
      teamId: "t1",
      amount: 100,
      by: "owner",
      t: t0 + 4,
    }),
    "Auction is paused",
  );
});

test("pickDrawNumber respects drawOrder", () => {
  const players: Player[] = [
    { no: 1, name: "A", skill: "Beginner", photo: null },
    { no: 2, name: "B", skill: "Advanced", photo: null },
    { no: 3, name: "C", skill: "Intermediate", photo: null },
  ];
  assert.equal(pickDrawNumber([3, 1, 2], players, "sequential", () => 0), 1);
  assert.equal(pickDrawNumber([1, 2, 3], players, "by-skill", () => 0), 2);
  assert.equal(pickDrawNumber([1, 3], players, "random", () => 1), 3);
});
