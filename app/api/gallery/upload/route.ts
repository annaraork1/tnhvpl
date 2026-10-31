import { NextResponse } from "next/server";
import { canPublishImmediately, galleryRoleFor } from "@/lib/galleryAuth";
import {
  ActionError,
  GALLERY_MAX_PUBLISHED,
  newGalleryId,
  normalizeTags,
  saveGalleryPhoto,
  uploadGalleryBytes,
} from "@/lib/galleryStore";
import { GALLERY_MAX_BYTES, type GalleryUploader } from "@/lib/galleryTypes";
import { loadState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function err(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readPart(form: FormData, name: string): Promise<{ data: Buffer; contentType: string } | null> {
  const f = form.get(name);
  if (!(f instanceof File) || !f.size) return null;
  const contentType = (f.type || "application/octet-stream").toLowerCase();
  const data = Buffer.from(await f.arrayBuffer());
  return { data, contentType };
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Bad upload", 400);
  }

  const pin = req.headers.get("x-pin");
  const role = galleryRoleFor(pin);
  const uploader: GalleryUploader = canPublishImmediately(role)
    ? (role === "admin" || role === "scorer" || role === "gallery" ? role : "public")
    : "public";
  const status = canPublishImmediately(role) ? "published" : "pending";

  const seasonParam = typeof form.get("season") === "string" ? String(form.get("season")) : null;
  const state = await loadState(seasonParam);
  const prefix = state.tournamentKey;

  const matchRaw = form.get("matchId");
  const matchId =
    typeof matchRaw === "string" && matchRaw.trim()
      ? matchRaw.trim()
      : null;
  if (matchId && !state.config.fixtures.some((f) => f.id === matchId)) {
    return err("Unknown match", 400);
  }

  const tags = normalizeTags(typeof form.get("tags") === "string" ? String(form.get("tags")) : "");
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")).trim().slice(0, 200) : "";

  const fullPart = await readPart(form, "file");
  if (!fullPart) return err("Photo required", 400);
  if (!ALLOWED.has(fullPart.contentType) && !fullPart.contentType.startsWith("image/")) {
    return err("Photos only — JPEG, PNG or WebP", 400);
  }
  if (/heic|heif/i.test(fullPart.contentType)) {
    return err("HEIC is not supported — use JPEG or PNG", 400);
  }
  if (fullPart.data.length > GALLERY_MAX_BYTES) {
    return err("Photo too large after compress (max ~1.2 MB)", 400);
  }

  const thumbPart = await readPart(form, "thumb");
  if (thumbPart && thumbPart.data.length > GALLERY_MAX_BYTES) {
    return err("Thumb too large", 400);
  }

  const width = Math.max(1, Math.min(8000, Number(form.get("width")) || 0));
  const height = Math.max(1, Math.min(8000, Number(form.get("height")) || 0));
  if (!width || !height) return err("Missing image size", 400);

  const id = newGalleryId();

  try {
    const uploaded = await uploadGalleryBytes(
      prefix,
      id,
      {
        data: fullPart.data,
        contentType: ALLOWED.has(fullPart.contentType) ? fullPart.contentType : "image/jpeg",
        width,
        height,
      },
      thumbPart
        ? {
            data: thumbPart.data,
            contentType: ALLOWED.has(thumbPart.contentType) ? thumbPart.contentType : "image/jpeg",
          }
        : null,
    );

    const photo = await saveGalleryPhoto(prefix, {
      id,
      createdAt: Date.now(),
      status,
      matchId,
      tags,
      caption,
      blobUrl: uploaded.blobUrl,
      thumbUrl: uploaded.thumbUrl,
      pathname: uploaded.pathname,
      thumbPathname: uploaded.thumbPathname,
      width,
      height,
      bytes: uploaded.bytes,
      contentType: ALLOWED.has(fullPart.contentType) ? fullPart.contentType : "image/jpeg",
      uploader,
    });

    return NextResponse.json(
      {
        ok: true,
        photo: {
          id: photo.id,
          status: photo.status,
          blobUrl: photo.blobUrl,
          thumbUrl: photo.thumbUrl || photo.blobUrl,
          matchId: photo.matchId,
          tags: photo.tags,
          caption: photo.caption,
        },
        message:
          status === "pending"
            ? "Thanks — photo submitted for approval."
            : "Photo published.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ActionError) {
      return err(e.message || `Gallery full (${GALLERY_MAX_PUBLISHED})`, 400);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("gallery upload", e);
    if (/private store|public access|BLOB_/i.test(msg)) {
      return err(msg, 500);
    }
    return err("Upload failed", 500);
  }
}
