"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuctionState } from "@/lib/auction";
import type { PlayerPrivate } from "@/lib/types";
import { useLive } from "./LiveProvider";

export type AuctionPublicTeam = {
  id: string;
  name: string;
  short: string;
  color: string;
  logo: string;
  owner: string;
};

export type AuctionPublicPlayer = {
  no: number;
  id: string;
  name: string;
  skill: string;
  photo: string | null;
  team?: string;
};

export type AuctionSettingsView = {
  purse: number;
  minPlayers: number;
  maxPlayers: number | null;
  showPricesPublic: boolean;
  timerSeconds: number;
  antiSnipeSeconds: number;
  capUntilLeftover: boolean;
  increments: { upTo: number | null; step: number }[];
  basePriceBySkill: Record<string, number>;
  rebid: { baseMultiplier: number; maxRounds: number | null; floorPrice?: number };
  finalUnsold: string;
  drawOrder: string;
  ownerCountsInSquad: boolean;
};

export type AuctionView = AuctionState & {
  v: number;
  startedAt?: number;
  completedAt?: number;
};

export interface AuctionPollData {
  auction: AuctionView;
  teams: AuctionPublicTeam[];
  players: AuctionPublicPlayer[];
  settings: AuctionSettingsView;
  privateMap: Record<string, PlayerPrivate>;
}

function seasonQs(season: string | null) {
  return season ? `?season=${encodeURIComponent(season)}` : "";
}

/** Poll public (+ optional private) auction APIs every 1s while live. */
export function useAuctionPoll(opts?: { private?: boolean; intervalMs?: number }) {
  const { season, pin, ownerTeamId } = useLive();
  const [data, setData] = useState<AuctionPollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wantPrivate = opts?.private ?? false;
  const intervalMs = opts?.intervalMs ?? 1000;
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const teamRef = useRef(ownerTeamId);
  teamRef.current = ownerTeamId;

  const refresh = useCallback(async () => {
    try {
      const q = seasonQs(season);
      const pub = await fetch(`/api/auction${q}`, { cache: "no-store" }).then((r) => r.json());
      if (!pub?.ok && pub?.auction == null) throw new Error(pub?.error ?? "Bad auction response");

      let privateMap: Record<string, PlayerPrivate> = {};
      if (wantPrivate && pinRef.current) {
        const params = new URLSearchParams();
        if (season) params.set("season", season);
        if (teamRef.current) params.set("teamId", teamRef.current);
        const pq = params.toString() ? `?${params}` : "";
        const priv = await fetch(`/api/auction/private${pq}`, {
          cache: "no-store",
          headers: { "x-pin": pinRef.current },
        }).then((r) => r.json());
        if (priv?.ok && priv.private) {
          if (typeof priv.private === "object" && !Array.isArray(priv.private) && "phone" in priv.private) {
            const entry = priv.private as PlayerPrivate;
            privateMap = entry.id ? { [entry.id]: entry } : {};
          } else {
            privateMap = priv.private as Record<string, PlayerPrivate>;
          }
        }
      }

      const auction = (pub.auction ?? pub) as AuctionView;
      setData({
        auction,
        teams: (pub.teams ?? []) as AuctionPublicTeam[],
        players: (pub.players ?? []) as AuctionPublicPlayer[],
        settings: pub.settings as AuctionSettingsView,
        privateMap,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Can't load auction");
    }
  }, [season, wantPrivate]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!alive) return;
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await refresh();
      }
      timer = setTimeout(loop, intervalMs);
    };
    void loop();
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh, season };
}
