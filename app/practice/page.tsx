"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientTime } from "@/components/ClientTime";
import { useLive } from "@/components/LiveProvider";
import { PracticeLiveScore } from "@/components/PracticeLiveScore";
import { Loading } from "@/components/ui";
import { askConfirm } from "@/lib/confirm";
import { fetchPracticeBoard, practiceAct, type PracticeLiveBoardItem } from "@/lib/practiceApi";
import { clearHostToken, getHostToken, listOpenHostIds } from "@/lib/practiceHost";
import type { PracticeSummary } from "@/lib/practiceTypes";

export default function PracticeHome() {
  const { role, pin, roleReady } = useLive();
  const isAdmin = role === "admin";
  const [matches, setMatches] = useState<PracticeSummary[] | null>(null);
  const [live, setLive] = useState<PracticeLiveBoardItem[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);

  const reload = useCallback(async () => {
    setOpenIds(listOpenHostIds());
    const r = await fetchPracticeBoard();
    if (!r.ok) {
      setError(r.error);
      setMatches((m) => m ?? []);
      return;
    }
    setMatches(r.matches);
    setLive(r.live ?? []);
    setUpdatedAt(Date.now());
    setError("");
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [reload]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2800);
  };

  const abandonAsAdmin = async (id: string, label: string) => {
    if (!askConfirm(`Abandon ${label}? It will not be saved to history.`)) return;
    const adminPin =
      (pin || (typeof window !== "undefined" ? localStorage.getItem("tnhvpl-pin") : "") || "").trim() ||
      window.prompt("Admin PIN") ||
      "";
    if (!adminPin.trim()) {
      flash("Admin PIN required");
      return;
    }
    setBusyId(id);
    const r = await practiceAct({ type: "abandon", id }, { pin: adminPin.trim() });
    setBusyId(null);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    clearHostToken(id);
    flash("Practice abandoned");
    await reload();
  };

  if (!matches) return <Loading />;

  const hostOpen = openIds.filter((id) => {
    const row = live.find((x) => x.match.id === id);
    return row && Boolean(getHostToken(id));
  });

  return (
    <div className="stack">
      <div className="sechead">
        <h1>Practice</h1>
        <Link className="btn gold" href="/practice/new">
          New quick match
        </Link>
      </div>
      <p className="note">
        Practice matches are separate from tournaments. Anyone can watch live practices here; only the host (or
        public scoring, if enabled) can score. Hosts and admins can abandon open practices — abandoned matches are
        not kept in history.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && <div className="toast">{msg}</div>}

      {live.length > 0 ? (
        <section className="stack">
          <h2>Live now</h2>
          {live.map(({ match, state }) => {
            const label = `${match.labelA} vs ${match.labelB}`;
            const iAmHost = Boolean(getHostToken(match.id));
            return (
              <div key={match.id} className="stack" style={{ gap: 8 }}>
                <PracticeLiveScore
                  match={match}
                  state={state}
                  updatedAt={updatedAt}
                  serverTime={Date.now()}
                />
                {roleReady && isAdmin && (
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
                    {!iAmHost && (
                      <span className="muted" style={{ fontSize: 13, marginRight: "auto" }}>
                        Guest practice · admin can abandon
                      </span>
                    )}
                    <Link className="btn ghost" href={`/practice/${match.id}`}>
                      Open
                    </Link>
                    <button
                      className="btn red"
                      type="button"
                      disabled={busyId === match.id}
                      onClick={() => void abandonAsAdmin(match.id, label)}
                    >
                      {busyId === match.id ? "Abandoning…" : iAmHost ? "Abandon" : "Abandon (admin)"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <section className="card stack">
          <h2>Live now</h2>
          <p className="muted" style={{ margin: 0 }}>
            No practice match in progress. Start one to appear here for everyone.
          </p>
        </section>
      )}

      {hostOpen.length > 0 && (
        <section className="card stack">
          <h2>Your open practices</h2>
          <p className="muted" style={{ margin: 0 }}>
            You are the host — open to score.
          </p>
          <div className="mlist">
            {hostOpen.map((id) => {
              const row = live.find((x) => x.match.id === id);
              return (
                <Link key={id} className="card row" href={`/practice/${id}`} style={{ padding: 12 }}>
                  <b>
                    {row ? `${row.match.labelA} vs ${row.match.labelB}` : id}
                  </b>
                  <span className="muted">Score</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Completed</h2>
        {matches.length === 0 && <p className="muted">No completed practice matches yet.</p>}
        <div className="mlist">
          {matches.slice(0, 50).map((m) => (
            <Link key={m.id} className="card stack" href={`/practice/${m.id}`} style={{ padding: 12, gap: 4 }}>
              <span className="row" style={{ justifyContent: "space-between" }}>
                <b>
                  {m.labelA} {m.setsWon.a}–{m.setsWon.b} {m.labelB}
                </b>
                <span className="muted">{m.mode === "live" ? "Live" : "Quick"}</span>
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                <ClientTime value={m.completedAt} />
                {m.winner ? ` · Winner: ${m.winner === "A" ? m.labelA : m.labelB}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
