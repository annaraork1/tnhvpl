"use client";

import Link from "next/link";
import { useState } from "react";
import { formatFor, scoreLine, TIE_LABELS } from "@/lib/engine";
import type { Fixture, MatchState, Team } from "@/lib/types";
import { useLive } from "./LiveProvider";

export function Loading({ label }: { label?: string }) {
  const { error, loading } = useLive();
  const text = error ?? label ?? (loading ? "Loading live data…" : "Loading…");
  return (
    <div className="empty" role="status" aria-busy="true" aria-live="polite">
      <span className="spinner lg" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

export function Logo({ team, size = 36 }: { team?: Team; size?: number }) {
  if (!team)
    return (
      <span className="logo ph" style={{ width: size, height: size }} aria-hidden>
        ?
      </span>
    );
  return <img className="logo" src={team.logo} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

export function TeamName({ id, label, size = 32 }: { id: string | null; label: string; size?: number }) {
  const { team } = useLive();
  const t = team(id);
  return (
    <span className="tname">
      <Logo team={t} size={size} />
      <span className={t ? "" : "muted"}>{t?.name ?? label}</span>
    </span>
  );
}

export function StatusPill({ m }: { m: MatchState }) {
  if (m.status === "live" && m.timeout) return <span className="pill live">Timeout</span>;
  if (m.status === "live") return <span className="pill live">● Live</span>;
  if (m.status === "done") return <span className="pill done">Final</span>;
  return null;
}


const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
export { fmtDate };

/** One fixture row: time, teams, result. */
export function MatchRow({ fx }: { fx: Fixture }) {
  const { calc, state } = useLive();
  if (!calc || !state) return null;
  const m = calc.ms[fx.id];
  const r = calc.resolved[fx.id];
  const fmt = formatFor(fx, state.config.settings);
  const wA = m.status === "done" && m.winner === "A";
  const wB = m.status === "done" && m.winner === "B";
  return (
    <Link href={`/match/${fx.id}`} className={`mrow ${m.status}`}>
      <div className="mmeta">
        <b>{fx.time}</b>
        <span>{fx.stage === "League" ? `Match ${fx.no}` : fx.stage}</span>
        {m.status === "scheduled" && <small className="muted">{fmt.targets.join("-")}</small>}
      </div>
      <div className="mteams">
        <div className={wA ? "win" : wB ? "lose" : ""}>
          <TeamName id={r.a} label={r.labelA} size={26} />
          {m.status !== "scheduled" && <b className="sets">{m.setsA}</b>}
        </div>
        <div className={wB ? "win" : wA ? "lose" : ""}>
          <TeamName id={r.b} label={r.labelB} size={26} />
          {m.status !== "scheduled" && <b className="sets">{m.setsB}</b>}
        </div>
      </div>
      <div className="mside">
        <StatusPill m={m} />
        {m.status !== "scheduled" && <small className="muted">{scoreLine(m)}</small>}
      </div>
    </Link>
  );
}

export function StandingsTable({ compact = false }: { compact?: boolean }) {
  const { calc, state, team } = useLive();
  if (!calc || !state) return <Loading />;
  const qualify = 4;
  return (
    <div className="tablewrap">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th className="l">Team</th>
            <th>P</th>
            <th>W</th>
            <th>L</th>
            {!compact && <th>Sets</th>}
            {!compact && <th>SD</th>}
            {!compact && <th>Pts ±</th>}
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {calc.table.map((r, i) => {
            const t = team(r.team);
            return (
              <tr key={r.team} className={i < qualify ? "q" : ""}>
                <td>{i + 1}</td>
                <td className="l">
                  <Link href={`/teams/${r.team}`} className="tname">
                    <Logo team={t} size={26} />
                    <span>{t?.name}</span>
                  </Link>
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.lost}</td>
                {!compact && (
                  <td>
                    {r.setsWon}–{r.setsLost}
                  </td>
                )}
                {!compact && <td>{fmtSigned(r.setsWon - r.setsLost)}</td>}
                {!compact && <td>{fmtSigned(r.ptsFor - r.ptsAgainst)}</td>}
                <td className="pts">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!compact && (
        <p className="note">
          Top {qualify} reach the playoffs. Ties broken by:{" "}
          {state.config.settings.tiebreak.map((k) => TIE_LABELS[k]).join(" → ")}.
        </p>
      )}
    </div>
  );
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : String(n));

export function PinGate({ need, children }: { need: "scorer" | "admin"; children: React.ReactNode }) {
  const { role, roleReady, login, logout } = useLive();
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!roleReady) return <div className="empty">Checking PIN…</div>;
  const ok = role === "admin" || (need === "scorer" && role === "scorer");
  if (ok) return <>{children}</>;
  return (
    <form
      className="card pingate"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await login(val);
        setBusy(false);
        if (!r.ok) setMsg(r.error ?? "Wrong PIN");
        else if (need === "admin" && r.role !== "admin") {
          logout();
          setMsg("This page needs the admin PIN.");
        } else setMsg("");
      }}
    >
      <h2>{need === "admin" ? "Admin" : "Staff"} PIN</h2>
      <p className="muted">
        {role === "scorer" && need === "admin"
          ? "This page needs the admin PIN."
          : need === "scorer"
            ? "Enter the admin or scorer PIN to continue. It stays on this phone."
            : "Enter the PIN to continue. It stays on this phone."}
      </p>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="PIN"
        aria-label="PIN"
      />
      <button className="btn gold" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Continue"}
      </button>
      {msg && <p className="error">{msg}</p>}
    </form>
  );
}
