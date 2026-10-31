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

function parseIds(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.ids)) {
    return body.ids.map(String).filter((id) => /^g_[a-zA-Z0-9_-]+$/.test(id));
  }
  const id = String(body.id ?? "");
  return id && /^g_[a-zA-Z0-9_-]+$/.test(id) ? [id] : [];
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
  const ids = parseIds(body);
  if (!ids.length) return err("Bad photo id", 400);
  if (ids.length > 40) return err("Too many photos at once (max 40)", 400);

  const state = await loadState(typeof body.season === "string" ? body.season : null);
  const prefix = state.tournamentKey;

  try {
    if (action === "delete") {
      let removed = 0;
      for (const id of ids) {
        if (await removeGalleryPhoto(prefix, id)) removed += 1;
      }
      return NextResponse.json({ ok: true, removed }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "approve") {
      let published = await countPublished(prefix);
      const photos = [];
      let approved = 0;
      for (const id of ids) {
        const cur = await getGalleryPhoto(prefix, id);
        if (!cur) continue;
        if (cur.status === "published") {
          photos.push(cur);
          continue;
        }
        if (published >= GALLERY_MAX_PUBLISHED) {
          return err(
            `Season gallery is full (${GALLERY_MAX_PUBLISHED} published). Approved ${approved} of ${ids.length}.`,
            400,
          );
        }
        const photo = await updateGalleryPhoto(prefix, id, (p) => ({ ...p, status: "published" }));
        photos.push(photo);
        published += 1;
        approved += 1;
      }
      return NextResponse.json(
        { ok: true, approved, photos: ids.length === 1 ? photos[0] : photos },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (action === "reject") {
      const photos = [];
      for (const id of ids) {
        const cur = await getGalleryPhoto(prefix, id);
        if (!cur) continue;
        photos.push(await updateGalleryPhoto(prefix, id, (p) => ({ ...p, status: "rejected" })));
      }
      return NextResponse.json(
        { ok: true, rejected: photos.length, photos: ids.length === 1 ? photos[0] : photos },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return err("Unknown action", 400);
  } catch (e) {
    if (e instanceof ActionError) return err(e.message, 400);
    console.error("gallery moderate", e);
    return err("Failed", 500);
  }
}
