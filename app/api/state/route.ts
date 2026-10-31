import { NextResponse } from "next/server";
import { stateCacheControl } from "@/lib/livePoll";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public read of the whole tournament. Cached briefly at Vercel's edge so many
 * spectators polling at once share one database read. Scorers add ?fresh= to
 * bypass the cache. Optional ?season=<key> views an archive season.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fresh = url.searchParams.has("fresh");
  const season = url.searchParams.get("season");
  const state = await loadState(season);
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": stateCacheControl(fresh),
    },
  });
}
