"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { computeAll } from "@/lib/engine";
import type { AppState, Team } from "@/lib/types";

type Computed = ReturnType<typeof computeAll>;
export type StaffRole = "admin" | "scorer";

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
  roleReady: boolean;
  setPin: (p: string) => void;
  login: (pin: string) => Promise<{ ok: boolean; role?: StaffRole; error?: string }>;
  logout: () => void;
}

const LiveCtx = createContext<Ctx | null>(null);
const PIN_KEY = "tnhvpl-pin";

function readPin() {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

async function checkPin(p: string): Promise<{ ok: boolean; role?: StaffRole; error?: string }> {
  try {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pin": p },
      body: JSON.stringify({ type: "checkPin" }),
    }).then((x) => x.json());
    if (!r.ok) return { ok: false, error: r.error ?? "Wrong PIN" };
    const role = r.role === "admin" || r.role === "scorer" ? (r.role as StaffRole) : null;
    if (!role) return { ok: false, error: "Wrong PIN" };
    return { ok: true, role };
  } catch {
    return { ok: false, error: "No connection" };
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
  const [roleReady, setRoleReady] = useState(false);
  const fastUntil = useRef(0);
  const lastServer = useRef(0);
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
      setRoleReady(true);
    }
  }, []);

  const login = useCallback(
    async (raw: string) => {
      const p = raw.trim();
      if (!p) return { ok: false, error: "Enter a PIN" };
      const r = await checkPin(p);
      if (!r.ok || !r.role) {
        setPin("");
        setRole(null);
        setRoleReady(true);
        return { ok: false, error: r.error ?? "Wrong PIN" };
      }
      setPin(p);
      setRole(r.role);
      setRoleReady(true);
      return { ok: true, role: r.role };
    },
    [setPin],
  );

  const logout = useCallback(() => {
    setPin("");
  }, [setPin]);

  useEffect(() => {
    const stored = readPin();
    if (!stored) {
      setRoleReady(true);
      return;
    }
    setPinState(stored);
    void checkPin(stored).then((r) => {
      if (r.ok && r.role) setRole(r.role);
      else {
        try {
          localStorage.removeItem(PIN_KEY);
        } catch {}
        setPinState("");
        setRole(null);
      }
      setRoleReady(true);
    });
  }, []);

  const accept = useCallback((s: AppState, fromPoll = false) => {
    if (fromPoll && hold.current) return;
    if (s.serverTime < lastServer.current) return;
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
      setSaving((n) => n + 1);
      try {
        const season = seasonRef.current;
        const r = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json", "x-pin": readPin() },
          body: JSON.stringify({ type, ...payload, ...(season ? { season } : {}) }),
        });
        const j = await r.json();
        if (!j.ok) return { ok: false, error: j.error ?? "Something went wrong" };
        if (j.state && !opts?.noAccept) accept(j.state);
        fastUntil.current = Date.now() + 60_000;
        return { ok: true, state: j.state as AppState };
      } catch {
        return { ok: false, error: "No connection. Your tap was not saved." };
      } finally {
        setSaving((n) => Math.max(0, n - 1));
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
