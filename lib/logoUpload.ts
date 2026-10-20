/** Resize / compress an image file to a data URL suitable for Redis (nav logo). */
export async function fileToLogoDataUrl(file: File, maxPx = 256, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > 8_000_000) throw new Error("Image must be under 8MB");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (dataUrl.length > 350_000) throw new Error("Logo is still too large — try a simpler image");
  return dataUrl;
}
