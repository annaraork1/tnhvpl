"use client";

import { useMemo, useState } from "react";
import { teamForPlayer } from "@/lib/awards";
import { useLive } from "./LiveProvider";

/** Optional man-of-the-match picker (players from the two teams in this fixture). */
export function BestPlayerPicker({
  matchId,
  teamA,
  teamB,
  compact = false,
}: {
  matchId: string;
  teamA: string;
  teamB: string;
  compact?: boolean;
}) {
  const { state, act, team } = useLive();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const list = useMemo(() => {
    if (!state) return [];
    const ids = [teamA, teamB];
    return ids.flatMap((tid) => {
      const t = state.config.teams.find((x) => x.id === tid);
      if (!t) return [];
      return t.squad
        .map((n) => state.players.find((p) => p.no === n))
        .filter(Boolean)
        .map((p) => ({ player: p!, team: t }));
    });
  }, [state, teamA, teamB]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      ({ player: p, team: t }) =>
        p.name.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q),
    );
  }, [list, query]);

  if (!state) return null;
  const show = state.config.settings.showPhotos;
  const current = state.matches[matchId]?.bestPlayer ?? null;
  const curPlayer = current ? state.players.find((p) => p.no === current.playerNo) : null;
  const curTeam = current ? team(current.teamId) : null;

  const save = async (playerNo: number | null) => {
    setBusy(true);
    const r = await act("setBestPlayer", { id: matchId, playerNo });
    setBusy(false);
    setMsg(r.ok ? (playerNo == null ? "Best player cleared" : "Best player saved") : r.error ?? "Failed");
    if (r.ok) setQuery("");
    setTimeout(() => setMsg((m) => (m.includes("Best") || m === r.error ? "" : m)), 2200);
  };

  return (
    <div className={`stack best-pick ${compact ? "compact" : ""}`}>
      <div className="sechead" style={{ margin: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Best player (optional)</h3>
      </div>
      {curPlayer && curTeam ? (
        <p className="note" style={{ margin: 0 }}>
          Selected: <b>{curPlayer.name}</b> ({curTeam.name}){" "}
          <button className="btn ghost" type="button" disabled={busy} onClick={() => save(null)} style={{ padding: "4px 10px" }}>
            Clear
          </button>
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pick from either squad — used as MVP suggestions later.
        </p>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player…"
        aria-label="Search best player"
        autoComplete="off"
      />
      <div className="player-pick-list best-pick-list" role="listbox" aria-label="Match players">
        {filtered.map(({ player: p, team: t }) => {
          const on = current?.playerNo === p.no;
          return (
            <button
              key={p.no}
              type="button"
              role="option"
              aria-selected={on}
              className={`player-pick ${on ? "on" : ""}`}
              style={{ ["--tc" as string]: t.color }}
              disabled={busy}
              onClick={() => save(p.no)}
            >
              {show && p.photo ? <img src={p.photo} alt="" /> : <span className="noimg">{p.name[0]}</span>}
              <span className="player-pick-meta">
                <b>{p.name}</b>
                <small>
                  {t.name} · {p.skill}
                </small>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="note">No players match.</p>}
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

/** Read-only line for spectators when a match has a best player. */
export function BestPlayerNote({ matchId }: { matchId: string }) {
  const { state, team } = useLive();
  if (!state) return null;
  const bp = state.matches[matchId]?.bestPlayer;
  if (!bp) return null;
  const p = state.players.find((x) => x.no === bp.playerNo);
  const t = team(bp.teamId) ?? teamForPlayer(bp.playerNo, state.config.teams, state.players);
  if (!p || !t) return null;
  return (
    <p className="note" style={{ textAlign: "center" }}>
      Best player: <b>{p.name}</b> ({t.name})
    </p>
  );
}
