import { NextResponse } from "next/server";
import { galleryRoleFor, isGalleryAdmin } from "@/lib/galleryAuth";
import {
  ActionError,
  countPublished,
  GALLERY_MAX_PUBLISHED,
  getGalleryPhoto,
  removeGalleryPhoto,
  updateGalleryPhoto,
} from "@/lib/galleryStore";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";

function err(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const pin = req.headers.get("x-pin");
  const role = galleryRoleFor(pin);
  if (!isGalleryAdmin(role)) return err("Admin PIN required", 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Bad request", 400);
  }

  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  if (!id || !/^g_[a-zA-Z0-9_-]+$/.test(id)) return err("Bad photo id", 400);

  const state = await loadState(typeof body.season === "string" ? body.season : null);
  const prefix = state.tournamentKey;

  try {
    if (action === "delete") {
      const removed = await removeGalleryPhoto(prefix, id);
      if (!removed) return err("Photo not found", 404);
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "approve") {
      const cur = await getGalleryPhoto(prefix, id);
      if (!cur) return err("Photo not found", 404);
      if (cur.status === "published") {
        return NextResponse.json({ ok: true, photo: cur }, { headers: { "Cache-Control": "no-store" } });
      }
      const n = await countPublished(prefix);
      if (n >= GALLERY_MAX_PUBLISHED) {
        return err(`Season gallery is full (${GALLERY_MAX_PUBLISHED} published photos). Delete some first.`, 400);
      }
      const photo = await updateGalleryPhoto(prefix, id, (p) => ({ ...p, status: "published" }));
      return NextResponse.json({ ok: true, photo }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "reject") {
      const photo = await updateGalleryPhoto(prefix, id, (p) => ({ ...p, status: "rejected" }));
      return NextResponse.json({ ok: true, photo }, { headers: { "Cache-Control": "no-store" } });
    }

    return err("Unknown action", 400);
  } catch (e) {
    if (e instanceof ActionError) return err(e.message, 400);
    console.error("gallery moderate", e);
    return err("Failed", 500);
  }
}
