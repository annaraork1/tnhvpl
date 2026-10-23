import { NextResponse } from "next/server";
import { buildPublicAuctionPayload, privateForCurrent } from "@/lib/auctionView";
import { verifyOwnerPin } from "@/lib/ownerAuth";
import { playerId } from "@/lib/season";
import { loadAuction, loadOwners, loadPrivate } from "@/lib/seasonStore";
import { loadState } from "@/lib/store";
import type { PlayerPrivate } from "@/lib/types";

export const dynamic = "force-dynamic";

const dev = process.env.NODE_ENV !== "production";
const ADMIN_PIN = process.env.ADMIN_PIN || (dev ? "1234" : "");
const AUCTIONEER_PIN = process.env.AUCTIONEER_PIN || (dev ? "2222" : "");

type Role = "admin" | "auctioneer" | "owner";

function staffRole(pin: string | null): Role | null {
  if (!pin) return null;
  if (ADMIN_PIN && pin === ADMIN_PIN) return "admin";
  if (AUCTIONEER_PIN && pin === AUCTIONEER_PIN) return "auctioneer";
  return null;
}

/**
 * Private auction details. Requires x-pin.
 * Admin/auctioneer: all PlayerPrivate for the season.
 * Owner: private for the current player on the block only.
 */
export async function GET(req: Request) {
  const pin = req.headers.get("x-pin");
  if (!pin) {
    return NextResponse.json(
      { ok: false, error: "PIN required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const season = url.searchParams.get("season");
  const teamIdHint = url.searchParams.get("teamId");

  const state = await loadState(season);
  const prefix = state.tournamentKey;

  let role: Role | null = staffRole(pin);
  let ownerTeamId: string | undefined;

  if (!role) {
    try {
      const owners = await loadOwners(prefix);
      const teamId = teamIdHint || undefined;
      if (teamId && owners.teams[teamId] && verifyOwnerPin(pin, owners.salt, owners.teams[teamId].pinHash)) {
        role = "owner";
        ownerTeamId = teamId;
      }
    } catch {
      /* fall through */
    }
  }

  if (!role) {
    return NextResponse.json(
      { ok: false, error: "Wrong PIN" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const doc = await loadAuction(prefix);
  const privDoc = await loadPrivate(prefix);
  const auction = buildPublicAuctionPayload(prefix, state.config, state.players, doc);

  let privatePayload: Record<string, PlayerPrivate> | PlayerPrivate | null;
  if (role === "admin" || role === "auctioneer") {
    privatePayload = privDoc.players;
  } else {
    const cur = privateForCurrent(state.players, privDoc, auction.auction.current?.no);
    privatePayload = cur;
    // Also expose keyed by player id when present, for convenience.
    if (cur) {
      const pl = state.players.find((p) => p.no === auction.auction.current?.no);
      if (pl) privatePayload = { [playerId(pl)]: cur };
      else privatePayload = { [cur.id]: cur };
    } else {
      privatePayload = {};
    }
  }

  return NextResponse.json(
    {
      ok: true,
      role,
      ...(ownerTeamId ? { teamId: ownerTeamId } : {}),
      private: privatePayload,
      auction: auction.auction,
      teams: auction.teams,
      players: auction.players,
      settings: auction.settings,
      season: auction.season,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
