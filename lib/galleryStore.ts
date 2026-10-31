import { randomBytes } from "node:crypto";
import { del, get, put, type PutBlobResult } from "@vercel/blob";
import {
  GALLERY_MAX_PUBLISHED,
  type GalleryIndex,
  type GalleryPhoto,
  type GalleryStatus,
} from "./galleryTypes";
import { ActionError, delRaw, readRaw, storageKind, update, writeRaw } from "./store";

export const galleryIndexKey = (prefix: string) => `${prefix}:gallery:index`;
export const galleryPhotoKey = (prefix: string, id: string) => `${prefix}:gallery:${id}`;
/** Local/dev fallback when BLOB_READ_WRITE_TOKEN is missing. */
export const galleryBlobMemKey = (prefix: string, id: string, kind: "full" | "thumb") =>
  `${prefix}:gallery:blob:${id}:${kind}`;

export function newGalleryId(): string {
  return `g_${randomBytes(8).toString("base64url")}`;
}

/** New Blob stores default to private; set BLOB_ACCESS=public only for a public store. */
export function blobAccess(): "public" | "private" {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

function blobToken(): string | undefined {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || undefined;
}

export function galleryFileUrl(prefix: string, id: string, thumb = false): string {
  const q = new URLSearchParams({ season: prefix });
  if (thumb) q.set("thumb", "1");
  return `/api/gallery/file/${id}?${q}`;
}

export function normalizeTags(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[,#]+/)
        .map((s) => s.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const slug = p
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= 12) break;
  }
  return out;
}

export async function loadGalleryIndex(prefix: string): Promise<GalleryIndex> {
  const [doc] = await readRaw<GalleryIndex>([galleryIndexKey(prefix)]);
  if (doc && Array.isArray(doc.ids)) return { v: doc.v ?? 0, ids: doc.ids.map(String) };
  return { v: 0, ids: [] };
}

export async function loadGalleryPhotos(prefix: string, ids: string[]): Promise<(GalleryPhoto | null)[]> {
  if (!ids.length) return [];
  return readRaw<GalleryPhoto>(ids.map((id) => galleryPhotoKey(prefix, id)));
}

export async function listGallery(
  prefix: string,
  opts?: { status?: GalleryStatus | "all"; matchId?: string | null; tag?: string | null },
): Promise<GalleryPhoto[]> {
  const index = await loadGalleryIndex(prefix);
  const photos = await loadGalleryPhotos(prefix, index.ids);
  const status = opts?.status ?? "published";
  const matchId = opts?.matchId ?? null;
  const tag = opts?.tag ? normalizeTags(opts.tag)[0] : null;
  return photos.filter((p): p is GalleryPhoto => {
    if (!p) return false;
    if (status !== "all" && p.status !== status) return false;
    if (matchId && p.matchId !== matchId) return false;
    if (tag && !p.tags.includes(tag)) return false;
    return true;
  });
}

export async function countPublished(prefix: string): Promise<number> {
  const list = await listGallery(prefix, { status: "published" });
  return list.length;
}

function extFor(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

async function putBytes(
  pathname: string,
  data: Buffer,
  contentType: string,
): Promise<PutBlobResult> {
  const token = blobToken();
  if (!token) throw new ActionError("BLOB_READ_WRITE_TOKEN is not set");
  return put(pathname, data, {
    access: blobAccess(),
    token,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function uploadGalleryBytes(
  prefix: string,
  id: string,
  full: { data: Buffer; contentType: string; width: number; height: number },
  thumb: { data: Buffer; contentType: string } | null,
): Promise<{ blobUrl: string; thumbUrl: string | null; pathname: string; thumbPathname: string | null; bytes: number }> {
  const ext = extFor(full.contentType);
  const thumbExt = thumb ? extFor(thumb.contentType) : "jpg";
  const pathname = `gallery/${prefix}/${id}.${ext}`;
  const thumbPathname = thumb ? `gallery/${prefix}/${id}-thumb.${thumbExt}` : null;
  const token = blobToken();

  // Always expose app proxy URLs — private Blob URLs are not browser-readable.
  const blobUrl = galleryFileUrl(prefix, id, false);
  const thumbUrl = thumb ? galleryFileUrl(prefix, id, true) : null;

  if (token) {
    const main = await putBytes(pathname, full.data, full.contentType);
    if (thumb && thumbPathname) {
      await putBytes(thumbPathname, thumb.data, thumb.contentType);
    }
    return {
      blobUrl,
      thumbUrl,
      pathname: main.pathname || pathname,
      thumbPathname,
      bytes: full.data.length,
    };
  }

  if (storageKind !== "memory" && process.env.NODE_ENV === "production") {
    throw new ActionError(
      "BLOB_READ_WRITE_TOKEN is not set. Add Vercel Blob in the project Storage tab.",
    );
  }

  // Local fallback: store buffers in memory/redis as base64 (dev only)
  await writeRaw(galleryBlobMemKey(prefix, id, "full"), {
    contentType: full.contentType,
    base64: full.data.toString("base64"),
  });
  if (thumb) {
    await writeRaw(galleryBlobMemKey(prefix, id, "thumb"), {
      contentType: thumb.contentType,
      base64: thumb.data.toString("base64"),
    });
  }
  return { blobUrl, thumbUrl, pathname, thumbPathname, bytes: full.data.length };
}

export async function deleteGalleryBytes(photo: GalleryPhoto): Promise<void> {
  const token = blobToken();
  if (token) {
    const paths = [photo.pathname, photo.thumbPathname].filter(Boolean) as string[];
    if (paths.length) await del(paths, { token });
    return;
  }
  const prefix = photo.pathname.split("/")[1] || "";
  await delRaw(galleryBlobMemKey(prefix, photo.id, "full"));
  await delRaw(galleryBlobMemKey(prefix, photo.id, "thumb"));
}

/** Fetch bytes from Vercel Blob (private or public store) by pathname. */
export async function loadBlobBytes(
  pathname: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const token = blobToken();
  if (!token || !pathname) return null;
  const result = await get(pathname, { access: blobAccess(), token });
  if (!result || result.statusCode === 304 || !result.stream) return null;
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const data = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const contentType = result.blob.contentType || "application/octet-stream";
  return { contentType, data };
}

export async function loadMemBlob(
  prefix: string,
  id: string,
  kind: "full" | "thumb",
): Promise<{ contentType: string; data: Buffer } | null> {
  const [doc] = await readRaw<{ contentType: string; base64: string }>([
    galleryBlobMemKey(prefix, id, kind),
  ]);
  if (!doc?.base64) return null;
  return { contentType: doc.contentType || "image/jpeg", data: Buffer.from(doc.base64, "base64") };
}

export async function saveGalleryPhoto(prefix: string, photo: Omit<GalleryPhoto, "v">): Promise<GalleryPhoto> {
  if (photo.status === "published") {
    const n = await countPublished(prefix);
    if (n >= GALLERY_MAX_PUBLISHED) {
      throw new ActionError(`Season gallery is full (${GALLERY_MAX_PUBLISHED} published photos). Delete some first.`);
    }
  }
  const saved = await update<GalleryPhoto>(
    galleryPhotoKey(prefix, photo.id),
    () => ({ ...photo, v: 0 }),
    () => ({ ...photo, v: 0 }),
  );
  await update<GalleryIndex>(
    galleryIndexKey(prefix),
    () => ({ v: 0, ids: [] }),
    (idx) => {
      const ids = [photo.id, ...idx.ids.filter((x) => x !== photo.id)];
      return { ...idx, ids };
    },
  );
  return saved;
}

export async function getGalleryPhoto(prefix: string, id: string): Promise<GalleryPhoto | null> {
  const [cur] = await readRaw<GalleryPhoto>([galleryPhotoKey(prefix, id)]);
  return cur?.id ? cur : null;
}

export async function updateGalleryPhoto(
  prefix: string,
  id: string,
  fn: (cur: GalleryPhoto) => GalleryPhoto | string,
): Promise<GalleryPhoto> {
  const existing = await getGalleryPhoto(prefix, id);
  if (!existing) throw new ActionError("Photo not found");
  return update<GalleryPhoto>(galleryPhotoKey(prefix, id), () => existing, fn);
}

export async function removeGalleryPhoto(prefix: string, id: string): Promise<GalleryPhoto | null> {
  const [cur] = await readRaw<GalleryPhoto>([galleryPhotoKey(prefix, id)]);
  if (!cur) return null;
  await update<GalleryIndex>(
    galleryIndexKey(prefix),
    () => ({ v: 0, ids: [] }),
    (idx) => ({ ...idx, ids: idx.ids.filter((x) => x !== id) }),
  );
  await delRaw(galleryPhotoKey(prefix, id));
  await deleteGalleryBytes(cur).catch(() => {});
  return cur;
}

export { ActionError, GALLERY_MAX_PUBLISHED };
