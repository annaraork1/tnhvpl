import type { MetadataRoute } from "next";
import { loadState } from "@/lib/store";

/** Dynamic web app manifest — name follows the active season. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "TNHVPL";
  let shortName = "TNHVPL";
  try {
    const state = await loadState();
    name = state.meta?.name || state.config.tournament.name || name;
    shortName = state.meta?.short || state.config.tournament.short || shortName;
  } catch {
    // Build / offline cold start — keep defaults.
  }

  return {
    name,
    short_name: shortName,
    description: "Live scores, fixtures and points table for TNH Volleyball",
    start_url: "/",
    display: "standalone",
    // Allow auto-rotate (portrait + landscape). portrait-primary locks PWAs upright.
    orientation: "any",
    background_color: "#070B16",
    theme_color: "#070B16",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
