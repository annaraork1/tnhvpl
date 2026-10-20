"use client";

import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import { LiveScore } from "@/components/LiveScore";
import { StaffLogin } from "@/components/StaffLogin";
import { Loading, MatchRow, StandingsTable } from "@/components/ui";

export default function Home() {
  const { state, calc, team } = useLive();
  if (!state || !calc) return <Loading />;
  const fx = [...state.config.fixtures].sort((a, b) => a.no - b.no);
  const live = fx.filter((f) => calc.ms[f.id].status === "live");
  const upcoming = fx.filter((f) => calc.ms[f.id].status === "scheduled").slice(0, live.length ? 2 : 3);
  const recent = fx.filter((f) => calc.ms[f.id].status === "done").slice(-3).reverse();
  const champ = team(calc.champion);

  return (
    <>
      <section className="stack">
        <span className="kicker">{state.config.tournament.subtitle} · {state.config.tournament.dates}</span>
        <h1>{state.config.tournament.name}</h1>
      </section>

      <StaffLogin />

      {champ && (
        <div className="card" style={{ textAlign: "center", borderColor: "var(--gold)" }}>
          <span className="kicker">Champions</span>
          <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
            <img className="logo" src={champ.logo} alt="" width={72} height={72} />
            <h1>{champ.name}</h1>
          </div>
        </div>
      )}

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
