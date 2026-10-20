"use client";

import Link from "next/link";
import { useLive } from "@/components/LiveProvider";
import { Loading } from "@/components/ui";
import { DEFAULT_LOGO } from "@/lib/tournaments";

export default function SeasonsPage() {
  const { state } = useLive();
  if (!state) return <Loading />;
  const list = [...state.registry.tournaments].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <h1>Seasons</h1>
      <p className="note">
        Browse past and current tournaments. The site default is{" "}
        <b>{state.registry.activeKey}</b>
        {state.viewingArchive ? (
          <>
            {" "}
            — you are viewing archive <b>{state.tournamentKey}</b>.
          </>
        ) : null}
      </p>
      <div className="season-grid">
        {list.map((t) => {
          const active = t.key === state.registry.activeKey;
          const viewing = t.key === state.tournamentKey;
          return (
            <article key={t.key} className={`card season-card ${active ? "active" : ""} ${viewing ? "viewing" : ""}`}>
              <img className="season-logo" src={t.logo || DEFAULT_LOGO} alt="" width={72} height={72} />
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <span className="kicker">{t.key}</span>
                <h2 style={{ margin: 0, fontSize: 22 }}>{t.name}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {t.dates || t.subtitle}
                </p>
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  <Link className="btn gold" href={`/?season=${encodeURIComponent(t.key)}`}>
                    Open
                  </Link>
                  <Link className="btn ghost" href={`/s/${encodeURIComponent(t.key)}`}>
                    Share link
                  </Link>
                  {active && <span className="pill done">Active</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
