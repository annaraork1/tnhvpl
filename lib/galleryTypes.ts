export type GalleryStatus = "pending" | "published" | "rejected";
export type GalleryUploader = "admin" | "scorer" | "gallery" | "public";

export interface GalleryPhoto {
  id: string;
  v: number;
  createdAt: number;
  status: GalleryStatus;
  matchId: string | null;
  tags: string[];
  caption: string;
  blobUrl: string;
  thumbUrl: string | null;
  pathname: string;
  thumbPathname: string | null;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  uploader: GalleryUploader;
}

export interface GalleryIndex {
  v: number;
  ids: string[];
}

/** Free-tier guardrails. */
export const GALLERY_MAX_EDGE = 1920;
export const GALLERY_MAX_BYTES = Math.floor(1.2 * 1024 * 1024);
export const GALLERY_MAX_PUBLISHED = 80;
export const GALLERY_THUMB_EDGE = 480;
