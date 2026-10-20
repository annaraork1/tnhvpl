"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { fetchPracticeHistory } from "@/lib/practiceApi";
import { listOpenHostIds } from "@/lib/practiceHost";
import type { PracticeSummary } from "@/lib/practiceTypes";

export default function PracticeHome() {
  const [matches, setMatches] = useState<PracticeSummary[] | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setOpenIds(listOpenHostIds());
    fetchPracticeHistory().then((r) => {
      if (!r.ok) {
        setError(r.error);
        setMatches([]);
        return;
      }
      setMatches(r.matches);
    });
  }, []);

  if (!matches) return <Loading />;

  return (
    <div className="stack">
      <div className="sechead">
        <h1>Practice</h1>
        <Link className="btn gold" href="/practice/new">
          New quick match
        </Link>
      </div>
      <p className="note">
        Practice matches are stored separately from tournaments. Only completed matches appear here;
        abandon a live match and it is not recorded.
      </p>
      {error && <p className="error">{error}</p>}

      {openIds.length > 0 && (
        <section className="card stack">
          <h2>Your open practices</h2>
          <p className="muted" style={{ margin: 0 }}>
            Matches this browser created that may still be in progress.
          </p>
          <div className="mlist">
            {openIds.map((id) => (
              <Link key={id} className="card row" href={`/practice/${id}`} style={{ padding: 12 }}>
                <b>{id}</b>
                <span className="muted">Continue</span>
              </Link>
            ))}
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
                {new Date(m.completedAt).toLocaleString()}
                {m.winner ? ` · Winner: ${m.winner === "A" ? m.labelA : m.labelB}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
