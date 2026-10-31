import { NextResponse } from "next/server";
import { getGalleryPhoto, loadBlobBytes, loadMemBlob } from "@/lib/galleryStore";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Serve gallery bytes (mem fallback or authenticated Vercel Blob get). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || !/^g_[a-zA-Z0-9_-]+$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const thumb = url.searchParams.get("thumb") === "1";
  const download = url.searchParams.get("download") === "1";

  const state = await loadState(seasonParam);
  const prefix = state.tournamentKey;
  const photo = await getGalleryPhoto(prefix, id);
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const kind = thumb ? "thumb" : "full";
  let payload = await loadMemBlob(prefix, id, kind);

  if (!payload) {
    const pathname = thumb ? photo.thumbPathname || photo.pathname : photo.pathname;
    try {
      payload = await loadBlobBytes(pathname);
      if (!payload && thumb && photo.thumbPathname && photo.pathname !== photo.thumbPathname) {
        payload = await loadBlobBytes(photo.pathname);
      }
    } catch (e) {
      console.error("gallery file blob get", e);
      return new NextResponse("Blob fetch failed", { status: 502 });
    }
  }

  if (!payload) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": payload.contentType || photo.contentType || "image/jpeg",
    "Cache-Control": "public, max-age=86400",
  };
  if (download) {
    const ct = headers["Content-Type"];
    const ext = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
    headers["Content-Disposition"] = `attachment; filename="${id}${thumb ? "-thumb" : ""}.${ext}"`;
  }
  return new NextResponse(new Uint8Array(payload.data), { status: 200, headers });
}
