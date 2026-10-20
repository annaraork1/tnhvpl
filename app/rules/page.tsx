"use client";

import { useLive } from "@/components/LiveProvider";
import { Loading } from "@/components/ui";
import { resultKeys, TIE_LABELS } from "@/lib/engine";
import type { Format } from "@/lib/types";

const fmtText = (f: Format, timeoutSeconds: number) =>
  `Best of ${f.bestOf} sets (${f.targets.join(" – ")}), win each set by ${f.winBy}${f.cap ? `, capped at ${f.cap}` : ""}. ${f.timeouts} timeout${f.timeouts === 1 ? "" : "s"} per team per set (${timeoutSeconds}s each).${f.switchInDecider ? " Teams switch sides half-way through the deciding set." : ""}`;

export default function Rules() {
  const { state } = useLive();
  if (!state) return <Loading />;
  const s = state.config.settings;
  const toSec = s.timeoutSeconds ?? 30;
  return (
    <>
      <h1>Rules</h1>
      <section className="card rules stack">
        <h2>Match format</h2>
        <ol>
          <li><b>League:</b> {fmtText(s.league, toSec)}</li>
          <li><b>Playoffs and final:</b> {fmtText(s.playoff, toSec)}</li>
          <li>Rally point system: a point is scored on every rally, whichever team served.</li>
          <li>At least three players must serve for each team, on a rotating basis.</li>
          <li>Matches run 4:00 – 10:00 PM on 31 Oct and 1 Nov.</li>
          <li>Standard volleyball rules apply; the rules file is shared in the owners&apos; group.</li>
        </ol>
      </section>
      <section className="card rules stack">
        <h2>Points table</h2>
        <ol>
          {resultKeys(s.league).map((k) => (
            <li key={k}>
              Win {k}: <b>{s.points[k]?.w ?? 2} points</b> · Lose {k.split("-").reverse().join("-")}: <b>{s.points[k]?.l ?? 0} points</b>
            </li>
          ))}
          <li>Teams level on points are separated by: {s.tiebreak.map((k) => TIE_LABELS[k]).join(" → ")}.</li>
        </ol>
      </section>
      <section className="card rules stack">
        <h2>Playoffs</h2>
        <ol>
          <li>Group stage is a round robin: each team plays the other four, 10 matches in all.</li>
          <li><b>Qualifier 1:</b> 1st v 2nd. The winner goes to the final.</li>
          <li><b>Eliminator:</b> 3rd v 4th. The loser is out.</li>
          <li><b>Qualifier 2:</b> loser of Qualifier 1 v winner of the Eliminator.</li>
          <li><b>Final:</b> winner of Qualifier 1 v winner of Qualifier 2.</li>
        </ol>
      </section>
    </>
  );
}
