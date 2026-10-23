"use client";

import { useLive } from "@/components/LiveProvider";
import { Loading, PinGate } from "@/components/ui";

export default function SquadsPrintPage() {
  return (
    <PinGate need="admin">
      <Inner />
    </PinGate>
  );
}

function Inner() {
  const { state } = useLive();
  if (!state) return <Loading />;

  return (
    <div className="stack" style={{ padding: 16 }}>
      <div className="sechead no-print">
        <h1>Squad sheets</h1>
        <button type="button" className="btn gold" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {state.config.teams.map((t) => (
        <section key={t.id} className="card stack" style={{ breakInside: "avoid", marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>
            {t.name} <span className="muted">· Owner {t.owner || "—"}</span>
          </h2>
          <ol>
            {t.squad.map((no) => {
              const p = state.players.find((x) => x.no === no);
              return (
                <li key={no}>
                  #{no} {p?.name ?? "?"} <span className={`skill ${p?.skill}`}>{p?.skill}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <style>{`
        @media print {
          .no-print, nav, header, footer { display: none !important; }
        }
      `}</style>
    </div>
  );
}
