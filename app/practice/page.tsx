"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientTime } from "@/components/ClientTime";
import { PracticeLiveScore } from "@/components/PracticeLiveScore";
import { Loading } from "@/components/ui";
import { fetchPracticeBoard, type PracticeLiveBoardItem } from "@/lib/practiceApi";
import { getHostToken, listOpenHostIds } from "@/lib/practiceHost";
import type { PracticeSummary } from "@/lib/practiceTypes";

export default function PracticeHome() {
  const [matches, setMatches] = useState<PracticeSummary[] | null>(null);
  const [live, setLive] = useState<PracticeLiveBoardItem[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [error, setError] = useState("");
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
        public scoring, if enabled) can score. Abandoned matches are not kept in history.
      </p>
      {error && <p className="error">{error}</p>}

      {live.length > 0 ? (
        <section className="stack">
          <h2>Live now</h2>
          {live.map(({ match, state }) => (
            <PracticeLiveScore
              key={match.id}
              match={match}
              state={state}
              updatedAt={updatedAt}
              serverTime={Date.now()}
            />
          ))}
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
