import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anyMatchLive,
  IDLE_POLL_MS,
  LIVE_POLL_MS,
  nextPollDelayMs,
  pollIntervalMs,
  stateCacheControl,
} from "../lib/livePoll.ts";
import { presenceKey, validPresenceId, validViewerId } from "../lib/presence.ts";

describe("livePoll", () => {
  it("uses 1s cadence while live and 3s otherwise", () => {
    assert.equal(pollIntervalMs(true), LIVE_POLL_MS);
    assert.equal(pollIntervalMs(false), IDLE_POLL_MS);
    assert.equal(LIVE_POLL_MS, 1_000);
    assert.equal(IDLE_POLL_MS, 3_000);
  });

  it("subtracts request time so slow polls do not stack full intervals", () => {
    assert.equal(nextPollDelayMs(true, 0), 1_000);
    assert.equal(nextPollDelayMs(true, 400), 600);
    assert.equal(nextPollDelayMs(true, 950), 200);
    assert.equal(nextPollDelayMs(true, 2_000), 200);
    assert.equal(nextPollDelayMs(false, 500), 2_500);
  });

  it("detects any live match", () => {
    assert.equal(anyMatchLive(null), false);
    assert.equal(anyMatchLive({ a: { status: "scheduled" }, b: { status: "done" } }), false);
    assert.equal(anyMatchLive({ a: { status: "live" } }), true);
  });

  it("serves a short edge cache for spectators and no-store when fresh", () => {
    assert.equal(stateCacheControl(true), "no-store");
    assert.match(stateCacheControl(false), /s-maxage=1/);
    assert.match(stateCacheControl(false), /stale-while-revalidate=1/);
  });
});

describe("presence keys", () => {
  it("scopes tournament presence by season", () => {
    assert.equal(presenceKey("t", "m1", "s5"), "presence:t:s5:m1");
    assert.equal(presenceKey("t", "m1", null), "presence:t:default:m1");
    assert.equal(presenceKey("p", "p1"), "presence:p:p1");
  });

  it("validates ids", () => {
    assert.equal(validPresenceId("league-1"), true);
    assert.equal(validPresenceId(""), false);
    assert.equal(validViewerId("abcdefgh"), true);
    assert.equal(validViewerId("short"), false);
  });
});
