"use client";

import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import { Loading, MatchRow, StandingsTable } from "@/components/ui";
import { resultKeys } from "@/lib/engine";

export default function Standings() {
  const { state, calc, team, seasonHref } = useLive();
  if (!state || !calc) return <Loading />;
  const s = state.config.settings;
  const playoffs = state.config.fixtures.filter((f) => f.stage !== "League").sort((a, b) => a.no - b.no);
  const champ = team(calc.champion);
  const runner = team(calc.runnerUp);
  return (
    <>
      <div className="sechead">
        <h1>Points table</h1>
        <Link className="btn gold" href={seasonHref("/standings/race")}>
          Race calculator
        </Link>
      </div>
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
          <div className="podium">
            <div className="card podium-card champ" style={{ ["--tc" as string]: champ.color }}>
              <span className="kicker">Champions</span>
              <img className="logo" src={champ.logo} alt="" width={48} height={48} />
              <h2>{champ.name}</h2>
            </div>
            {runner && (
              <div className="card podium-card runner" style={{ ["--tc" as string]: runner.color }}>
                <span className="kicker">Runner-up</span>
                <img className="logo" src={runner.logo} alt="" width={40} height={40} />
                <h3>{runner.name}</h3>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
