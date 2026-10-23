/**
 * Season workflow E2E: create → import sample CSV → approve → lock → auction bids → finish → fixtures → score one.
 * Usage: node scripts/season-e2e.mjs [baseUrl] [adminPin]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://localhost:3000";
const PIN = process.argv[3] || process.env.ADMIN_PIN || "1234";
const SEASON = `season-e2e-${Date.now().toString(36).slice(-6)}`;
const dir = dirname(fileURLToPath(import.meta.url));

async function act(type, payload = {}, pin = PIN) {
  const r = await fetch(`${BASE}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pin": pin },
    body: JSON.stringify({ type, season: SEASON, ...payload }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${type}: ${j.error || r.status}`);
  return j;
}

async function main() {
  console.log(`Season workflow E2E ${SEASON} @ ${BASE}`);

  let j = await act("createTournament", {
    key: SEASON,
    name: "Season E2E",
    short: "E2E",
    subtitle: "Registration → auction → fixtures",
    dates: "Test",
    mode: "clone",
    cloneFrom: "tnhvpl-s5",
  });
  await act("setActiveTournament", { key: SEASON });
  let state = j.state;
  console.log("stage", state.config.stage, "teams", state.config.teams.length, "players", state.players.length);
  if (state.config.stage !== "registration") throw new Error("expected registration stage");
  if (state.players.length !== 0) throw new Error("workflow clone should clear players");

  // Owner PINs
  for (const t of state.config.teams) {
    await act("setOwnerPin", { teamId: t.id, pin: `9${t.id.slice(0, 3)}99`.replace(/\D/g, "0").padEnd(4, "0").slice(0, 4) || "9999" });
  }
  // Use simple PINs
  const ownerPins = {};
  for (let i = 0; i < state.config.teams.length; i++) {
    const tid = state.config.teams[i].id;
    const pin = String(3000 + i);
    ownerPins[tid] = pin;
    await act("setOwnerPin", { teamId: tid, pin });
  }

  // Import a few rows from sample CSV via regImport (pre-normalized)
  const sample = [
    { name: "Ravi Kumar", skill: "Beginner", priv: { phone: "9000000000", tower: "21082", age: "17", available: "Yes", source: "import" } },
    { name: "Arjun S", skill: "Beginner", priv: { phone: "9000001111", tower: "T-4064", age: "34", available: "Yes", source: "import" } },
    { name: "Prakash N", skill: "Intermediate", priv: { phone: "9000002222", tower: "22021", age: "15", available: "Yes", source: "import" } },
    { name: "Kiran Rao", skill: "Advanced", priv: { phone: "9000003333", tower: "21042", age: "22", available: "No", source: "import" } },
    { name: "Deepak V", skill: "Beginner", priv: { phone: "9000008888", tower: "22021", age: "28", available: "Yes", source: "import" } },
    { name: "Tanvi Shah", skill: "Beginner", priv: { phone: "9845012345", tower: "21042", age: "41", available: "Yes", source: "import" } },
    { name: "Vikram", skill: "Intermediate", priv: { phone: "9000011110", tower: "09062", age: "28", available: "Yes", source: "import" } },
    { name: "Imran K", skill: "Advanced", priv: { phone: "9000012221", tower: "31043", age: "17", available: "Yes", source: "import" } },
    // pad to at least min*teams for leftover math with 5 teams * 8 = 40 — use 10 for a short auction demo
    { name: "Extra One", skill: "Beginner", priv: { phone: "9000090001", tower: "1", age: "25", available: "Yes", source: "import" } },
    { name: "Extra Two", skill: "Intermediate", priv: { phone: "9000090002", tower: "2", age: "26", available: "Yes", source: "import" } },
  ];
  // Need enough players for min 8 * 5 — too heavy for e2e. Lower minPlayers for the test season.
  await act("saveAuctionSettings", {
    auction: {
      ...(state.config.auction || {}),
      purse: 10000,
      minPlayers: 2,
      ownerCountsInSquad: false,
      basePriceBySkill: { Beginner: 100, Intermediate: 100, Advanced: 100 },
      increments: [{ upTo: null, step: 100 }],
      capUntilLeftover: true,
      timerSeconds: 0,
      antiSnipeSeconds: 0,
      autoSellOnTimer: false,
      rebid: { baseMultiplier: 0.5, maxRounds: null },
      finalUnsold: "keep-rebidding",
      drawOrder: "random",
      showPricesPublic: false,
    },
  });

  await act("regImport", { rows: sample });
  j = await act("listRegistrations");
  const entries = j.entries || [];
  console.log("imported", entries.length);
  for (const e of entries) {
    await act("regUpdate", { id: e.id, status: "approved" });
  }

  j = await act("lockRegistration", { confirm: "LOCK" });
  state = j.state;
  console.log("locked players", state.players.length, "stage", state.config.stage);
  if (state.config.stage !== "auction") throw new Error("expected auction stage");

  await act("auctionStart");
  // Sell every player quickly via auctioneer to first eligible team at base
  for (let n = 0; n < state.players.length; n++) {
    await act("auctionDraw");
    await act("auctionReveal");
    const pub = await fetch(`${BASE}/api/auction?season=${SEASON}`).then((r) => r.json());
    const teamId = Object.entries(pub.teams || pub.state?.teams || {})
      .find(([, t]) => t.eligible)?.[0] || state.config.teams[0].id;
    // Prefer response shape from /api/auction
    const auction = pub.auction || pub;
    const currentNo = auction.current?.no ?? pub.current?.no;
    const open = auction.current?.openingBase ?? 100;
    const tid =
      (auction.teams &&
        Object.keys(auction.teams).find((id) => auction.teams[id].eligible)) ||
      state.config.teams[n % state.config.teams.length].id;
    await act("auctionBid", { teamId: tid, amount: open, no: currentNo });
    await act("auctionSold", { no: currentNo });
  }

  j = await act("auctionFinish");
  state = j.state;
  console.log("finished stage", state.config.stage, "squad sizes", state.config.teams.map((t) => t.squad.length));

  const day1 = { date: "2026-10-31", label: "Day 1", start: "4:00 PM", end: "10:00 PM" };
  const day2 = { date: "2026-11-01", label: "Day 2", start: "4:00 PM", end: "10:00 PM" };
  const prev = await act("generateFixturesPreview", {
    input: {
      days: [day1, day2],
      leagueSlotMinutes: 45,
      playoffSlotMinutes: 60,
      breakBeforePlayoffsMinutes: 0,
      playoffFormat: "qualifier",
      roundRobin: "single",
      teamOrder: state.config.teams.map((t) => t.id),
    },
  });
  if (prev.error) throw new Error(prev.error);
  j = await act("saveGeneratedFixtures", { fixtures: prev.fixtures });
  state = j.state;
  console.log("fixtures", state.config.fixtures.length, "stage", state.config.stage);

  const first = state.config.fixtures.find((f) => f.stage === "League");
  if (first) {
    await act("saveSettings", {
      settings: {
        ...state.config.settings,
        league: { bestOf: 3, targets: [3, 3, 3], winBy: 1, cap: 0, timeouts: 2, switchInDecider: true },
        playoff: { bestOf: 3, targets: [3, 3, 3], winBy: 1, cap: 0, timeouts: 2, switchInDecider: true },
      },
    });
    await act("start", { id: first.id, serve: "A" });
    for (let i = 0; i < 3; i++) await act("point", { id: first.id, side: "A" });
    await act("nextSet", { id: first.id });
    for (let i = 0; i < 3; i++) await act("point", { id: first.id, side: "A" });
    console.log("scored", first.id);
  }

  console.log("OK season workflow e2e");
  void readFileSync; // silence if unused — sample path available for future
  void join;
  void dir;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
