import { GALLERY_MAX_BYTES, GALLERY_MAX_EDGE, GALLERY_THUMB_EDGE } from "./galleryTypes";

export type CompressedGalleryImage = {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
};

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image. Use JPEG or PNG."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compress failed"))),
      type,
      quality,
    );
  });
}

async function encodeResized(
  img: HTMLImageElement,
  maxEdge: number,
  maxBytes: number,
): Promise<CompressedGalleryImage> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(img, 0, 0, width, height);

  const preferWebp = typeof canvas.toDataURL === "function" && canvas.toDataURL("image/webp").startsWith("data:image/webp");
  const type = preferWebp ? "image/webp" : "image/jpeg";
  let quality = 0.82;
  let blob = await canvasToBlob(canvas, type, quality);
  while (blob.size > maxBytes && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, type, quality);
  }
  if (blob.size > maxBytes) {
    // Second pass smaller edge
    const scale2 = Math.sqrt(maxBytes / blob.size) * 0.95;
    canvas.width = Math.max(1, Math.round(width * scale2));
    canvas.height = Math.max(1, Math.round(height * scale2));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, type, 0.72);
  }
  if (blob.size > maxBytes) throw new Error("Photo is still too large after compress. Try another shot.");
  return { blob, width: canvas.width, height: canvas.height, contentType: type };
}

/** Browser-only: resize/compress a photo for gallery upload. */
export async function compressGalleryPhoto(file: File): Promise<{
  full: CompressedGalleryImage;
  thumb: CompressedGalleryImage;
}> {
  if (!file.type.startsWith("image/")) throw new Error("Photos only — pick an image file.");
  if (/heic|heif/i.test(file.type) || /\.heic$/i.test(file.name)) {
    throw new Error("HEIC is not supported here — use JPEG or PNG.");
  }
  const img = await loadImage(file);
  const full = await encodeResized(img, GALLERY_MAX_EDGE, GALLERY_MAX_BYTES);
  const thumb = await encodeResized(img, GALLERY_THUMB_EDGE, Math.floor(GALLERY_MAX_BYTES / 4));
  return { full, thumb };
}
