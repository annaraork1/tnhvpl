import { NextResponse } from "next/server";
import { buildPublicAuctionPayload } from "@/lib/auctionView";
import { loadAuction } from "@/lib/seasonStore";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Public auction view — derived state only, no private contact fields. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const season = url.searchParams.get("season");
  const state = await loadState(season);
  const doc = await loadAuction(state.tournamentKey);
  const payload = buildPublicAuctionPayload(
    state.tournamentKey,
    state.config,
    state.players,
    doc,
  );
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
