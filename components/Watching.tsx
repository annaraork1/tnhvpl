"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/LiveProvider";

/** Keep in sync with lib/presence.ts PRESENCE_BEAT_MS. */
const PRESENCE_BEAT_MS = 12_000;
const VIEWER_KEY = "tnhvpl-viewer-id";

export type PresenceKind = "t" | "p";

function viewerId(): string {
  try {
    let id = sessionStorage.getItem(VIEWER_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
          : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(VIEWER_KEY, id);
    }
    return id;
  } catch {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function formatViewers(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Hotstar-style eye + live viewer count. */
export function WatchingLine({ count }: { count: number | null }) {
  if (count == null) return null;
  const label = count === 1 ? "1 watching" : `${count} watching`;
  return (
    <span className="watching-badge" title={label} aria-label={label}>
      <svg className="watching-eye" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 5c-5.5 0-9.7 4.1-11 7 1.3 2.9 5.5 7 11 7s9.7-4.1 11-7c-1.3-2.9-5.5-7-11-7zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        />
      </svg>
      <span className="watching-num">{formatViewers(count)}</span>
    </span>
  );
}

/**
 * Live spectator presence. `beat` true = count this tab as a spectator (match / Live home).
 * Scorer consoles pass beat=false and only poll the count.
 */
export function usePresence(opts: {
  kind: PresenceKind;
  id: string;
  live: boolean;
  beat: boolean;
}): number | null {
  const { kind, id, live, beat } = opts;
  const { season } = useLive();
  const [count, setCount] = useState<number | null>(null);
  const seasonRef = useRef(season);
  seasonRef.current = season;

  useEffect(() => {
    if (!live || !id) {
      setCount(null);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        if (beat) {
          const r = await fetch("/api/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              id,
              viewerId: viewerId(),
              ...(kind === "t" && seasonRef.current ? { season: seasonRef.current } : {}),
            }),
          });
          if (!r.ok || cancelled) return;
          const data = (await r.json()) as { count?: number };
          if (typeof data.count === "number" && !cancelled) setCount(data.count);
        } else {
          const params = new URLSearchParams({ kind, id });
          if (kind === "t" && seasonRef.current) params.set("season", seasonRef.current);
          const r = await fetch(`/api/presence?${params}`, { cache: "no-store" });
          if (!r.ok || cancelled) return;
          const data = (await r.json()) as { count?: number };
          if (typeof data.count === "number" && !cancelled) setCount(data.count);
        }
      } catch {
        /* ignore transient errors */
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), PRESENCE_BEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [kind, id, live, beat]);

  return count;
}

/** Drop-in for LiveScore / PracticeLiveScore (always beats when live). */
export function MatchWatching({
  kind,
  id,
  live,
  beat = true,
}: {
  kind: PresenceKind;
  id: string;
  live: boolean;
  beat?: boolean;
}) {
  const count = usePresence({ kind, id, live, beat });
  if (!live || count == null) return null;
  return <WatchingLine count={count} />;
}
