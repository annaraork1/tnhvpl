"use client";

import Link from "next/link";
import { AwardsGrid } from "@/components/AwardsGrid";
import { useLive } from "@/components/LiveProvider";
import { LiveScore } from "@/components/LiveScore";
import { StageHomeCta } from "@/components/StageHomeCta";
import { Loading, MatchRow, StandingsTable } from "@/components/ui";
import { emptyAwards, filledAwards } from "@/lib/awards";

export default function Home() {
  const { state, calc, team } = useLive();
  if (!state || !calc) return <Loading />;
  const fx = [...state.config.fixtures].sort((a, b) => a.no - b.no);
  const live = fx.filter((f) => calc.ms[f.id].status === "live");
  const upcoming = fx.filter((f) => calc.ms[f.id].status === "scheduled").slice(0, live.length ? 2 : 3);
  const recent = fx.filter((f) => calc.ms[f.id].status === "done").slice(-3).reverse();
  const champ = team(calc.champion);
  const runner = team(calc.runnerUp);
  const final = state.config.fixtures.find((f) => f.stage === "Final");
  const finalDone = !!final && calc.ms[final.id]?.status === "done";
  const awards = state.config.awards ?? emptyAwards();
  const hasAwards = filledAwards(awards).length > 0;

  return (
    <>
      <section className="stack">
        <span className="kicker">{state.config.tournament.subtitle} · {state.config.tournament.dates}</span>
        <h1>{state.config.tournament.name}</h1>
      </section>

      {live.length > 0 ? (
        <section className="stack">
          <h2>Live now</h2>
          {live.map((f) => (
            <LiveScore key={f.id} fx={f} />
          ))}
        </section>
      ) : (
        upcoming[0] && (
          <section className="stack">
            <h2>Next match</h2>
            <LiveScore fx={upcoming[0]} />
          </section>
        )
      )}

      <StageHomeCta />

      {champ && (
        <div className="podium">
          <div className="card podium-card champ" style={{ ["--tc" as string]: champ.color }}>
            <span className="kicker">Champions</span>
            <img className="logo" src={champ.logo} alt="" width={72} height={72} />
            <h2>{champ.name}</h2>
          </div>
          {runner && (
            <div className="card podium-card runner" style={{ ["--tc" as string]: runner.color }}>
              <span className="kicker">Runner-up</span>
              <img className="logo" src={runner.logo} alt="" width={56} height={56} />
              <h3>{runner.name}</h3>
            </div>
          )}
        </div>
      )}

      {finalDone && (
        <section className="stack">
          <div className="sechead">
            <h2>Awards</h2>
            <Link href="/awards">{hasAwards ? "All awards →" : "Set awards →"}</Link>
          </div>
          <AwardsGrid awards={awards} emptyNote="Awards will appear here once announced." />
        </section>
      )}

      <div className="grid2">
        <section className="stack">
          <div className="sechead">
            <h2>Points table</h2>
            <Link href="/standings">Full table →</Link>
          </div>
          <div className="card">
            <StandingsTable compact />
          </div>
        </section>
        <section className="stack">
          <div className="sechead">
            <h2>{recent.length ? "Results & next up" : "Coming up"}</h2>
            <Link href="/fixtures">All fixtures →</Link>
          </div>
          <div className="mlist">
            {recent.map((f) => (
              <MatchRow key={f.id} fx={f} />
            ))}
            {upcoming.slice(live.length ? 0 : 1).map((f) => (
              <MatchRow key={f.id} fx={f} />
            ))}
          </div>
        </section>
      </div>

      <p className="note" style={{ textAlign: "center" }}>
        Scores update by themselves. Share a match link so others can watch live.
      </p>
    </>
  );
}
