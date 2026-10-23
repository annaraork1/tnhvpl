import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveStage, playerId } from "../lib/season.ts";
import type { Config, Player, PlayerPrivate } from "../lib/types.ts";

/** Fields that must never appear in public /api/state payloads. */
const PRIVATE_KEYS = ["phone", "tower", "age", "email", "contribution", "pinHash", "salt"];

function assertNoPrivateFields(obj: unknown, path = "root"): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoPrivateFields(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    assert.ok(!PRIVATE_KEYS.includes(k), `private field "${k}" at ${path}`);
    assertNoPrivateFields(v, `${path}.${k}`);
  }
}

const samplePlayers: Player[] = [
  { no: 1, name: "A", skill: "Beginner", photo: null },
  { no: 2, id: "p_x", name: "B", skill: "Advanced", photo: "/api/photo/tnhvpl-s6/p_x?v=1" },
];

function sampleConfig(stage?: Config["stage"]): Config {
  return {
    v: 0,
    tournament: { name: "T", short: "T", subtitle: "", dates: "" },
    settings: {
      league: { bestOf: 3, targets: [21, 21, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true },
      playoff: { bestOf: 3, targets: [21, 21, 25], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true },
      points: { "2-0": { w: 2, l: 0 } },
      tiebreak: ["points"],
      showPhotos: true,
      timeoutSeconds: 30,
    },
    teams: [],
    fixtures: [],
    awards: { setter: null, attacker: null, server: null, mvp: null, emerging: null },
    players: samplePlayers,
    stage,
  };
}

test("legacy config has no private fields and stage defaults to matches", () => {
  const cfg = sampleConfig();
  assert.equal(effectiveStage(cfg), "matches");
  assert.equal(cfg.stage, undefined);
  assertNoPrivateFields(cfg);
});

test("public players shape has no private contact fields", () => {
  for (const p of samplePlayers) {
    assertNoPrivateFields(p);
    assert.ok(playerId(p).length > 0);
  }
  assert.equal(playerId(samplePlayers[0]), "p1");
  assert.equal(playerId(samplePlayers[1]), "p_x");
});

test("PlayerPrivate is separate from config players", () => {
  const priv: PlayerPrivate = {
    id: "p_test",
    phone: "9000000000",
    tower: "21082",
    age: "25",
    email: "a@b.c",
    source: "admin",
  };
  const cfg = sampleConfig("registration");
  assertNoPrivateFields(cfg);
  assert.equal(priv.phone, "9000000000");
  assert.ok(!("phone" in (cfg.players[0] as object)));
});

test("auction public view helpers omit private keys", () => {
  const publicAuctionView = {
    status: "bidding",
    round: 1,
    sold: {},
    teams: [{ id: "a", balance: 10000, bought: 0 }],
    current: { no: 1, revealed: true, highBid: { teamId: "a", amount: 100 } },
  };
  assertNoPrivateFields(publicAuctionView);
});

