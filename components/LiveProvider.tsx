"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { computeAll } from "@/lib/engine";
import type { AppState, Team } from "@/lib/types";

type Computed = ReturnType<typeof computeAll>;
export type StaffRole = "admin" | "scorer" | "auctioneer" | "owner";

interface Ctx {
  state: AppState | null;
  calc: Computed | null;
  error: string | null;
  updatedAt: number;
  /** True until the first successful /api/state load (and while season switches). */
  loading: boolean;
  /** Count of in-flight /api/action writes. */
  saving: number;
  /** Season key from ?season= or active season. */
  season: string | null;
  seasonHref: (path: string) => string;
  refresh: (fresh?: boolean) => Promise<void>;
  act: (
    type: string,
    payload?: Record<string, unknown>,
    opts?: { noAccept?: boolean },
  ) => Promise<{ ok: boolean; error?: string; state?: AppState }>;
  accept: (s: AppState) => void;
  setHold: (h: boolean) => void;
  team: (id: string | null | undefined) => Team | undefined;
  pin: string;
  role: StaffRole | null;
  /** Set when role === "owner". */
  ownerTeamId: string | null;
  roleReady: boolean;
  setPin: (p: string) => void;
  login: (
    pin: string,
    opts?: { teamId?: string },
  ) => Promise<{ ok: boolean; role?: StaffRole; teamId?: string; error?: string }>;
  logout: () => void;
}

const LiveCtx = createContext<Ctx | null>(null);
const PIN_KEY = "tnhvpl-pin";
const OWNER_TEAM_KEY = "tnhvpl-owner-team";

const STAFF_ROLES: StaffRole[] = ["admin", "scorer", "auctioneer", "owner"];
function asStaffRole(r: unknown): StaffRole | null {
  return typeof r === "string" && (STAFF_ROLES as string[]).includes(r) ? (r as StaffRole) : null;
}

/** Monotonic write watermark — match CAS `v` only rises on successful writes. */
function matchesRevision(s: AppState): number {
  let n = 0;
  for (const m of Object.values(s.matches)) n += m?.v ?? 0;
  return n;
}

function readPin() {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

async function checkPin(
  p: string,
  opts?: { teamId?: string; season?: string | null },
): Promise<{ ok: boolean; role?: StaffRole; teamId?: string; error?: string }> {
  try {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pin": p },
      body: JSON.stringify({
        type: "checkPin",
        ...(opts?.teamId ? { teamId: opts.teamId } : {}),
        ...(opts?.season ? { season: opts.season } : {}),
      }),
    }).then((x) => x.json());
    if (!r.ok) return { ok: false, error: r.error ?? "Wrong PIN" };
    const role = asStaffRole(r.role);
    if (!role) return { ok: false, error: "Wrong PIN" };
    return { ok: true, role, teamId: typeof r.teamId === "string" ? r.teamId : undefined };
  } catch {
    return { ok: false, error: "No connection" };
  }
}

function readOwnerTeam() {
  try {
    return localStorage.getItem(OWNER_TEAM_KEY) ?? "";
  } catch {
    return "";
  }
}

function withSeason(path: string, season: string | null) {
  if (!season) return path;
  const [base, hash] = path.split("#");
  const [pathname, qs] = base.split("?");
  const params = new URLSearchParams(qs || "");
  params.set("season", season);
  const q = params.toString();
  return `${pathname}?${q}${hash ? `#${hash}` : ""}`;
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const seasonParam = searchParams.get("season");
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(0);
  const [pin, setPinState] = useState("");
  const [role, setRole] = useState<StaffRole | null>(null);
  const [ownerTeamId, setOwnerTeamId] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const ownerTeamRef = useRef<string | null>(null);
  const fastUntil = useRef(0);
  const lastServer = useRef(0);
  const lastRev = useRef(0);
  const hold = useRef(false);
  const seasonRef = useRef(seasonParam);
  seasonRef.current = seasonParam;
  const hasState = useRef(false);

  const setHold = useCallback((h: boolean) => {
    hold.current = h;
  }, []);

  const setPin = useCallback((p: string) => {
    setPinState(p);
    try {
      if (p) localStorage.setItem(PIN_KEY, p);
      else localStorage.removeItem(PIN_KEY);
    } catch {}
    if (!p) {
      setRole(null);
      setOwnerTeamId(null);
      ownerTeamRef.current = null;
      try {
        localStorage.removeItem(OWNER_TEAM_KEY);
      } catch {}
      setRoleReady(true);
    }
  }, []);

  const login = useCallback(
    async (raw: string, opts?: { teamId?: string }) => {
      const p = raw.trim();
      if (!p) return { ok: false, error: "Enter a PIN" };
      const r = await checkPin(p, { teamId: opts?.teamId, season: seasonRef.current });
      if (!r.ok || !r.role) {
        setPin("");
        setRole(null);
        setOwnerTeamId(null);
        ownerTeamRef.current = null;
        setRoleReady(true);
        return { ok: false, error: r.error ?? "Wrong PIN" };
      }
      setPin(p);
      setRole(r.role);
      const tid = r.role === "owner" ? r.teamId || opts?.teamId || null : null;
      setOwnerTeamId(tid);
      ownerTeamRef.current = tid;
      try {
        if (tid) localStorage.setItem(OWNER_TEAM_KEY, tid);
        else localStorage.removeItem(OWNER_TEAM_KEY);
      } catch {}
      setRoleReady(true);
      return { ok: true, role: r.role, teamId: tid ?? undefined };
    },
    [setPin],
  );

  const logout = useCallback(() => {
    setPin("");
  }, [setPin]);

  useEffect(() => {
    const stored = readPin();
    const storedTeam = readOwnerTeam();
    if (!stored) {
      setRoleReady(true);
      return;
    }
    setPinState(stored);
    void checkPin(stored, {
      teamId: storedTeam || undefined,
      season: seasonRef.current,
    }).then((r) => {
      if (r.ok && r.role) {
        setRole(r.role);
        const tid = r.role === "owner" ? r.teamId || storedTeam || null : null;
        setOwnerTeamId(tid);
        ownerTeamRef.current = tid;
      } else {
        try {
          localStorage.removeItem(PIN_KEY);
          localStorage.removeItem(OWNER_TEAM_KEY);
        } catch {}
        setPinState("");
        setRole(null);
        setOwnerTeamId(null);
        ownerTeamRef.current = null;
      }
      setRoleReady(true);
    });
  }, []);

  const accept = useCallback((s: AppState, fromPoll = false) => {
    if (fromPoll && hold.current) return;
    const rev = matchesRevision(s);
    // `/api/state` stamps serverTime with Date.now() on every read, so a stale poll
    // can look "newer" while carrying older match docs — prefer CAS revision.
    if (rev < lastRev.current) return;
    if (rev === lastRev.current && s.serverTime < lastServer.current) return;
    lastRev.current = rev;
    lastServer.current = s.serverTime;
    setState(s);
    hasState.current = true;
    setUpdatedAt(Date.now());
    setError(null);
    setLoading(false);
  }, []);

  const refresh = useCallback(
    async (fresh = false) => {
      if (!hasState.current) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fresh) params.set("fresh", String(Date.now()));
        const s = seasonRef.current;
        if (s) params.set("season", s);
        const q = params.toString();
        const r = await fetch(q ? `/api/state?${q}` : "/api/state", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        accept(await r.json(), true);
      } catch {
        setError("Can't reach the server. Retrying…");
        if (!hasState.current) setLoading(false);
      }
    },
    [accept],
  );

  // Reset poll clock when season query changes.
  useEffect(() => {
    lastServer.current = 0;
    lastRev.current = 0;
    hasState.current = false;
    setState(null);
    setLoading(true);
    void refresh(true);
    // intentionally only when ?season= changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonParam]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!alive) return;
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await refresh(Date.now() < fastUntil.current);
      }
      timer = setTimeout(loop, 3000);
    };
    loop();
    const onVis = () => document.visibilityState === "visible" && refresh(true);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const act = useCallback(
    async (type: string, payload: Record<string, unknown> = {}, opts?: { noAccept?: boolean }) => {
      // Optimistic scorers use noAccept + local pending; skip the global Saving bar
      // so the pad doesn't jump when the strip mounts/unmounts.
      const trackSave = !opts?.noAccept;
      if (trackSave) setSaving((n) => n + 1);
      try {
        const season = seasonRef.current;
        const ot = ownerTeamRef.current;
        const r = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json", "x-pin": readPin() },
          body: JSON.stringify({
            type,
            ...payload,
            ...(season ? { season } : {}),
            ...(ot && !payload.teamId ? { teamId: ot } : {}),
          }),
        });
        const j = await r.json();
        if (!j.ok) return { ok: false, error: j.error ?? "Something went wrong" };
        if (j.state && !opts?.noAccept) accept(j.state);
        fastUntil.current = Date.now() + 60_000;
        return { ok: true, state: j.state as AppState };
      } catch {
        return { ok: false, error: "No connection. Your tap was not saved." };
      } finally {
        if (trackSave) setSaving((n) => Math.max(0, n - 1));
      }
    },
    [accept],
  );

  const calc = useMemo(() => (state ? computeAll(state) : null), [state]);
  const team = useCallback((id: string | null | undefined) => state?.config.teams.find((t) => t.id === id), [state]);
  const season = seasonParam || state?.tournamentKey || null;
  const seasonHref = useCallback((path: string) => withSeason(path, seasonParam), [seasonParam]);

  return (
    <LiveCtx.Provider
      value={{
        state,
        calc,
        error,
        updatedAt,
        loading,
        saving,
        season,
        seasonHref,
        refresh,
        act,
        accept,
        setHold,
        team,
        pin,
        role,
        ownerTeamId,
        roleReady,
        setPin,
        login,
        logout,
      }}
    >
      {children}
    </LiveCtx.Provider>
  );
}

export function useLive() {
  const c = useContext(LiveCtx);
  if (!c) throw new Error("useLive outside LiveProvider");
  return c;
}
