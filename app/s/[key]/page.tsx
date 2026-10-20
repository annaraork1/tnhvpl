import { redirect } from "next/navigation";

/** Shareable season entry: /s/tnhvpl-s5 → /?season=tnhvpl-s5 */
export default async function SeasonSharePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const safe = encodeURIComponent(String(key || "").trim().toLowerCase());
  redirect(`/?season=${safe}`);
}
