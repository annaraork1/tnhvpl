import type { GalleryUploader } from "./galleryTypes";

const dev = process.env.NODE_ENV !== "production";

export function galleryPins() {
  return {
    admin: process.env.ADMIN_PIN || (dev ? "1234" : ""),
    scorer: process.env.SCORER_PIN || (dev ? "1111" : ""),
    gallery: process.env.GALLERY_PIN || (dev ? "3333" : ""),
  };
}

/** Resolve upload/list privilege from x-pin. null = anonymous (public). */
export function galleryRoleFor(pin: string | null): GalleryUploader | "admin" | "scorer" | null {
  if (!pin) return null;
  const pins = galleryPins();
  if (pins.admin && pin === pins.admin) return "admin";
  if (pins.scorer && pin === pins.scorer) return "scorer";
  if (pins.gallery && pin === pins.gallery) return "gallery";
  return null;
}

export function canPublishImmediately(role: ReturnType<typeof galleryRoleFor>): boolean {
  return role === "admin" || role === "scorer" || role === "gallery";
}

export function isGalleryAdmin(role: ReturnType<typeof galleryRoleFor>): boolean {
  return role === "admin";
}
