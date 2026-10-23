/**
 * Live E2E: complete league → verify playoff slots → finish Q1/Elim/Q2/Final.
 * Usage: node scripts/playoff-e2e.mjs [baseUrl] [adminPin]
 */
const BASE = process.argv[2] || "http://localhost:3000";
const PIN = process.argv[3] || process.env.ADMIN_PIN || "562162";
const SEASON = `playoff-demo-${Date.now().toString(36).slice(-6)}`;

async function act(type, payload = {}) {
  const r = await fetch(`${BASE}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pin": PIN },
    body: JSON.stringify({ type, season: SEASON, ...payload }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${type}: ${j.error || r.status}`);
  return j.state;
}

function nameOf(state, id) {
  return state.config.teams.find((t) => t.id === id)?.name ?? id ?? "(TBD)";
}

function summarize(state, calcHint) {
  const fixtures = state.config.fixtures;
  const league = fixtures.filter((f) => f.stage === "League");
  // Recompute lightly from returned state via labels in resolved isn't available;
  // caller passes resolved ids from a parallel check using /api/state + client logic.
  return { leagueCount: league.length };
}

async function finishMatch(id, winnerSide, target) {
  await act("start", { id, serve: "A" });
  // Two straight sets to `target`
  for (let set = 0; set < 2; set++) {
    for (let i = 0; i < target; i++) {
      await act("point", { id, side: winnerSide });
    }
    if (set === 0) await act("nextSet", { id });
  }
}

async function main() {
  console.log(`Season ${SEASON} @ ${BASE}`);

  let state = await act("createTournament", {
    key: SEASON,
    name: "Playoff Demo",
    short: "DEMO",
    subtitle: "League → playoffs E2E",
    dates: "Local test",
    mode: "clone",
    cloneFrom: "tnhvpl-s5",
  });
  await act("setActiveTournament", { key: SEASON });

  // Tiny formats so scoring is fast
  const tiny = {
    bestOf: 3,
    targets: [3, 3, 3],
    winBy: 1,
    cap: 0,
    timeouts: 2,
    switchInDecider: true,
  };
  state = await act("saveSettings", {
    settings: {
      ...state.config.settings,
      league: tiny,
      playoff: tiny,
      points: { "2-0": { w: 2, l: 0 }, "2-1": { w: 2, l: 0 } },
    },
  });

  const league = state.config.fixtures.filter((f) => f.stage === "League").sort((a, b) => a.no - b.no);
  console.log(`League matches: ${league.length}`);

  // Deterministic results: A wins every match → standings driven by schedule
  // Override with a curated map for clearer top-4
  const winners = {
    m1: "A", // eagle
    m2: "A", // supreme
    m3: "B", // pavilion
    m4: "A", // eagle
    m5: "B", // supreme
    m6: "A", // saiyans
    m7: "A", // eagle
    m8: "A", // pavilion
    m9: "B", // supreme
    m10: "A", // eagle
  };

  for (const fx of league) {
    const side = winners[fx.id] || "A";
    console.log(`  finish ${fx.id} → ${side}`);
    await finishMatch(fx.id, side, 3);
  }

  state = await (await fetch(`${BASE}/api/state?season=${SEASON}&fresh=1`)).json();

  // Import compute via dynamic eval — call our own resolution using returned matches
  const { computeAll } = await import("../lib/engine.ts");
  let calc = computeAll(state);
  console.log("\nStandings:");
  for (let i = 0; i < calc.table.length; i++) {
    const r = calc.table[i];
    console.log(`  ${i + 1}. ${nameOf(state, r.team)}  P${r.played} W${r.won} Pts${r.points}`);
  }
  console.log(`leagueDone=${calc.leagueDone}`);

  const expect = {
    m11a: calc.table[0].team,
    m11b: calc.table[1].team,
    m12a: calc.table[2].team,
    m12b: calc.table[3].team,
  };
  const got = {
    m11a: calc.resolved.m11.a,
    m11b: calc.resolved.m11.b,
    m12a: calc.resolved.m12.a,
    m12b: calc.resolved.m12.b,
  };
  console.log("\nQ1 (1st vs 2nd):", nameOf(state, got.m11a), "vs", nameOf(state, got.m11b));
  console.log("Elim (3rd vs 4th):", nameOf(state, got.m12a), "vs", nameOf(state, got.m12b));
  console.log("Q2 before playoffs:", nameOf(state, calc.resolved.m13.a), "vs", nameOf(state, calc.resolved.m13.b));
  console.log("Final before playoffs:", nameOf(state, calc.resolved.m14.a), "vs", nameOf(state, calc.resolved.m14.b));

  const fail = [];
  if (!calc.leagueDone) fail.push("leagueDone false");
  for (const k of Object.keys(expect)) {
    if (got[k] !== expect[k]) fail.push(`${k}: got ${got[k]} want ${expect[k]}`);
  }
  if (calc.resolved.m13.a || calc.resolved.m13.b || calc.resolved.m14.a || calc.resolved.m14.b) {
    fail.push("Q2/Final should be TBD until Q1/Elim finish");
  }

  // Q1: #2 wins → #1 is loser to Q2, #2 to Final
  console.log("\nPlaying Q1 (#2 wins)…");
  await finishMatch("m11", "B", 3);
  // Elim: #3 wins
  console.log("Playing Eliminator (#3 wins)…");
  await finishMatch("m12", "A", 3);

  state = await (await fetch(`${BASE}/api/state?season=${SEASON}&fresh=1`)).json();
  calc = computeAll(state);
  console.log("\nQ2:", nameOf(state, calc.resolved.m13.a), "vs", nameOf(state, calc.resolved.m13.b));
  console.log("Final:", nameOf(state, calc.resolved.m14.a), "vs", nameOf(state, calc.resolved.m14.b));

  if (calc.resolved.m13.a !== expect.m11a) fail.push(`Q2.a should be Q1 loser (${expect.m11a}), got ${calc.resolved.m13.a}`);
  if (calc.resolved.m13.b !== expect.m12a) fail.push(`Q2.b should be Elim winner (${expect.m12a}), got ${calc.resolved.m13.b}`);
  if (calc.resolved.m14.a !== expect.m11b) fail.push(`Final.a should be Q1 winner (${expect.m11b}), got ${calc.resolved.m14.a}`);
  if (calc.resolved.m14.b) fail.push(`Final.b should still be TBD, got ${calc.resolved.m14.b}`);

  console.log("\nPlaying Q2 (A wins)…");
  await finishMatch("m13", "A", 3);
  state = await (await fetch(`${BASE}/api/state?season=${SEASON}&fresh=1`)).json();
  calc = computeAll(state);
  console.log("Final now:", nameOf(state, calc.resolved.m14.a), "vs", nameOf(state, calc.resolved.m14.b));
  if (calc.resolved.m14.b !== calc.resolved.m13.a && calc.resolved.m14.b !== expect.m11a) {
    // Q2 A was Q1 loser = expect.m11a
    if (calc.resolved.m14.b !== expect.m11a) fail.push(`Final.b should be Q2 winner (${expect.m11a}), got ${calc.resolved.m14.b}`);
  }

  console.log("\nPlaying Final (B wins)…");
  await finishMatch("m14", "B", 3);
  state = await (await fetch(`${BASE}/api/state?season=${SEASON}&fresh=1`)).json();
  calc = computeAll(state);
  console.log("Champion:", nameOf(state, calc.champion));
  console.log("Runner-up:", nameOf(state, calc.runnerUp));
  if (!calc.champion) fail.push("no champion after Final");
  if (calc.champion !== expect.m11a) fail.push(`champion should be Q2 winner / Final B (${expect.m11a}), got ${calc.champion}`);

  if (fail.length) {
    console.error("\nFAILURES:\n - " + fail.join("\n - "));
    process.exit(1);
  }
  console.log(`\nOK — season=${SEASON}`);
  console.log(`Open: ${BASE}/standings?season=${SEASON}`);
  console.log(`Score Q-list: ${BASE}/score?season=${SEASON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
