"use client";

import { useLive } from "@/components/LiveProvider";
import { LiveScore } from "@/components/LiveScore";
import { Loading, MatchRow, StandingsTable } from "@/components/ui";

/** Big-screen view for a TV or projector at the venue. */
export default function Display() {
  const { state, calc } = useLive();
  if (!state || !calc) return <Loading />;
  const fx = [...state.config.fixtures].sort((a, b) => a.no - b.no);
  const live = fx.filter((f) => calc.ms[f.id].status === "live");
  const next = fx.filter((f) => calc.ms[f.id].status === "scheduled").slice(0, 3);
  const last = fx.filter((f) => calc.ms[f.id].status === "done").slice(-2).reverse();
  const main = live[0] ?? next[0] ?? last[0];
  return (
    <div className="tv">
      <div className="stack">
        <div className="row" style={{ gap: 14 }}>
          <img src="/logo.png" alt="" width={72} height={72} />
          <div>
            <span className="kicker">{state.config.tournament.subtitle}</span>
            <h1>{live.length ? "Live now" : next.length ? "Next match" : "Results"}</h1>
          </div>
        </div>
        {main && <LiveScore fx={main} link={false} share={false} />}
        {live.slice(1).map((f) => (
          <LiveScore key={f.id} fx={f} link={false} share={false} />
        ))}
      </div>
      <div className="stack">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Points table</h2>
          <StandingsTable compact />
        </div>
        {last.length > 0 && <h2>Latest results</h2>}
        <div className="mlist">{last.map((f) => <MatchRow key={f.id} fx={f} />)}</div>
        {next.length > (live.length ? 0 : 1) && <h2>Coming up</h2>}
        <div className="mlist">{next.slice(live.length ? 0 : 1).map((f) => <MatchRow key={f.id} fx={f} />)}</div>
      </div>
    </div>
  );
}
