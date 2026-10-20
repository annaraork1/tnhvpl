import { NextResponse } from "next/server";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public read of the whole tournament. Cached at Vercel's edge for 2 seconds so that
 * many spectators polling at once cost only one database read every 2 seconds.
 * Scorers add ?fresh=<timestamp> to bypass the cache.
 */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.has("fresh");
  const state = await loadState();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": fresh ? "no-store" : "public, max-age=0, s-maxage=2, stale-while-revalidate=4",
    },
  });
}
