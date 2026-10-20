"use client";

import { useLive } from "@/components/LiveProvider";
import { Loading, MatchRow, StandingsTable } from "@/components/ui";
import { resultKeys } from "@/lib/engine";

export default function Standings() {
  const { state, calc, team } = useLive();
  if (!state || !calc) return <Loading />;
  const s = state.config.settings;
  const playoffs = state.config.fixtures.filter((f) => f.stage !== "League").sort((a, b) => a.no - b.no);
  const champ = team(calc.champion);
  return (
    <>
      <h1>Points table</h1>
      <div className="card">
        <StandingsTable />
        <p className="note">
          League points:{" "}
          {resultKeys(s.league)
            .map((k) => `${k} win ${s.points[k]?.w ?? 2}, ${k.split("-").reverse().join("-")} loss ${s.points[k]?.l ?? 0}`)
            .join(" · ")}
          . P played, W won, L lost, SD set difference, Pts ± points scored minus conceded.
        </p>
      </div>
      <section className="stack">
        <h2>Playoffs</h2>
        {!calc.leagueDone && <p className="note">Playoff teams fill in when all league matches are finished.</p>}
        <div className="mlist">
          {playoffs.map((f) => (
            <MatchRow key={f.id} fx={f} />
          ))}
        </div>
        {champ && (
          <div className="card row" style={{ justifyContent: "center", borderColor: "var(--gold)" }}>
            <span className="kicker">🏆 Champions</span>
            <img className="logo" src={champ.logo} alt="" width={48} height={48} />
            <h2>{champ.name}</h2>
          </div>
        )}
      </section>
    </>
  );
}
