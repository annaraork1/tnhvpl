import { NextResponse } from "next/server";
import { loadPhoto } from "@/lib/seasonStore";
import { isValidTournamentKey } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

/** Serve a resized player photo from Redis. Public + long cache (content-addressed via ?v=). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await ctx.params;
  if (!isValidTournamentKey(key) || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const photo = await loadPhoto(key, id);
  if (!photo?.dataUrl) return new NextResponse("Not found", { status: 404 });

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(photo.dataUrl);
  if (!m) return new NextResponse("Bad photo", { status: 500 });
  const contentType = m[1];
  const buf = Buffer.from(m[2], "base64");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
