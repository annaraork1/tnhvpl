import { NextResponse } from "next/server";
import { galleryRoleFor, isGalleryAdmin } from "@/lib/galleryAuth";
import { listGallery } from "@/lib/galleryStore";
import type { GalleryStatus } from "@/lib/galleryTypes";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const state = await loadState(seasonParam);
  const prefix = state.tournamentKey;
  const matchId = url.searchParams.get("matchId");
  const tag = url.searchParams.get("tag");
  const statusParam = url.searchParams.get("status");
  const pin = req.headers.get("x-pin");
  const role = galleryRoleFor(pin);

  let status: GalleryStatus | "all" = "published";
  if (statusParam && isGalleryAdmin(role)) {
    if (statusParam === "all" || statusParam === "pending" || statusParam === "published" || statusParam === "rejected") {
      status = statusParam;
    }
  } else if (statusParam && statusParam !== "published") {
    return NextResponse.json({ ok: false, error: "Admin PIN required for that filter" }, { status: 403 });
  }

  const photos = await listGallery(prefix, {
    status,
    matchId: matchId || null,
    tag: tag || null,
  });

  return NextResponse.json(
    {
      ok: true,
      season: prefix,
      photos: photos.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        status: p.status,
        matchId: p.matchId,
        tags: p.tags,
        caption: p.caption,
        blobUrl: p.blobUrl,
        thumbUrl: p.thumbUrl || p.blobUrl,
        width: p.width,
        height: p.height,
        bytes: p.bytes,
        contentType: p.contentType,
        uploader: p.uploader,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
