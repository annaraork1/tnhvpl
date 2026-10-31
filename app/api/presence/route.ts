import { NextResponse } from "next/server";
import {
  countMany,
  countViewers,
  heartbeat,
  validPresenceId,
  validViewerId,
  type PresenceKind,
} from "@/lib/presence";
import { loadRegistry } from "@/lib/store";

export const dynamic = "force-dynamic";

function parseKind(v: string | null): PresenceKind | null {
  return v === "t" || v === "p" ? v : null;
}

/** Prefer client season; else registry activeKey (1 GET) — never full loadState. */
async function resolveSeason(season?: string | null): Promise<string> {
  if (season && season.trim()) return season.trim();
  const registry = await loadRegistry();
  return registry.activeKey;
}

/** GET ?kind=t|p&id=…&season=…  or  ?kind=…&ids=a,b&season=… */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "kind" }, { status: 400 });

  let season = url.searchParams.get("season");
  if (kind === "t") {
    season = await resolveSeason(season);
  }

  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(validPresenceId)
      .slice(0, 40);
    const counts = await countMany(kind, ids, season);
    return NextResponse.json(
      { counts },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const id = url.searchParams.get("id");
  if (!id || !validPresenceId(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  const count = await countViewers(kind, id, season);
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}

/** POST { kind, id, viewerId, season? } — spectator heartbeat. */
export async function POST(req: Request) {
  let body: { kind?: string; id?: string; viewerId?: string; season?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body" }, { status: 400 });
  }

  const kind = parseKind(body.kind ?? null);
  const id = body.id ?? "";
  const viewerId = body.viewerId ?? "";
  if (!kind || !validPresenceId(id) || !validViewerId(viewerId)) {
    return NextResponse.json({ error: "params" }, { status: 400 });
  }

  let season = body.season ?? null;
  if (kind === "t") {
    season = await resolveSeason(season);
  }

  const count = await heartbeat(kind, id, viewerId, season);
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
