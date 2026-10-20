import { NextResponse } from "next/server";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public read of the whole tournament. Cached at Vercel's edge for 2 seconds so that
 * many spectators polling at once cost only one database read every 2 seconds.
 * Scorers add ?fresh=<timestamp> to bypass the cache.
 * Optional ?season=<key> views an archive season without changing the active key.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fresh = url.searchParams.has("fresh");
  const season = url.searchParams.get("season");
  const state = await loadState(season);
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": fresh ? "no-store" : "public, max-age=0, s-maxage=2, stale-while-revalidate=4",
    },
  });
}
