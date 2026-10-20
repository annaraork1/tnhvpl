"use client";

import { useParams } from "next/navigation";
import { useLive } from "@/components/LiveProvider";
import { Loading, MatchRow } from "@/components/ui";

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { state, calc } = useLive();
  if (!state || !calc) return <Loading />;
  const t = state.config.teams.find((x) => x.id === id);
  if (!t) return <div className="empty">Team not found</div>;
  const squad = t.squad.map((n) => state.players.find((p) => p.no === n)!).filter(Boolean);
  const show = state.config.settings.showPhotos;
  const games = state.config.fixtures
    .filter((f) => calc.resolved[f.id].a === t.id || calc.resolved[f.id].b === t.id)
    .sort((a, b) => a.no - b.no);
  const row = calc.table.findIndex((r) => r.team === t.id);
  return (
    <div style={{ ["--tc" as string]: t.color, display: "grid", gap: 20 }}>
      <section className="card row" style={{ borderTop: `4px solid ${t.color}`, gap: 16 }}>
        <img className="logo" src={t.logo} alt="" width={96} height={96} />
        <div className="stack" style={{ gap: 4 }}>
          <h1>{t.name}</h1>
          <span className="muted">Owner: {t.owner}</span>
          <span className="muted">
            League position: {row + 1} · {calc.table[row]?.points ?? 0} pts
          </span>
        </div>
      </section>
      <section className="stack">
        <h2>Squad</h2>
        <div className="squad">
          <div className="card player">
            <div className="noimg">★</div>
            <b>{t.owner}</b>
            <span className="skill" style={{ background: "var(--gold)" }}>Owner</span>
          </div>
          {squad.map((p) => (
            <div key={p.no} className="card player">
              {show && p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <div className="noimg">{p.name[0]}</div>}
              <b>{p.name}</b>
              <span className={`skill ${p.skill}`}>{p.skill}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2>Matches</h2>
        <div className="mlist">
          {games.map((f) => (
            <MatchRow key={f.id} fx={f} />
          ))}
        </div>
      </section>
    </div>
  );
}
