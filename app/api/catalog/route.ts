import { NextResponse } from "next/server";
import { loadMasterCatalog } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Cross-season team/player master list for admin reuse. */
export async function GET() {
  const catalog = await loadMasterCatalog();
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": "no-store" },
  });
}
