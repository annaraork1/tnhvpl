"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useLive } from "@/components/LiveProvider";
import { Logo, Loading } from "@/components/ui";
import type { Row } from "@/lib/engine";
import { PLAYOFF_QUALIFY } from "@/lib/qualify";
import {
  COARSE_LABELS,
  COARSE_RESULTS,
  enumeratePathsToRank,
  formatPathLabel,
  leagueResultsSig,
  projectRace,
  type CoarseResult,
  type OutcomeMap,
  type RacePath,
} from "@/lib/raceWhatIf";

function ratio(r: Row): string {
  if (r.ptsAgainst === 0) return r.ptsFor === 0 ? "—" : "∞";
  return (r.ptsFor / r.ptsAgainst).toFixed(3);
}

export function RaceCalculator({
  initialTeamId,
  initialTarget,
}: {
  initialTeamId?: string | null;
  initialTarget?: number | null;
}) {
  const { state, calc, team, role } = useLive();
  const teams = state?.config.teams ?? [];
  const [teamId, setTeamId] = useState(initialTeamId || "");
  const [target, setTarget] = useState(() =>
    initialTarget && initialTarget > 0 ? initialTarget : PLAYOFF_QUALIFY,
  );
  const [outcomes, setOutcomes] = useState<OutcomeMap>({});
  const [paths, setPaths] = useState<RacePath[]>([]);
  const [pathsBusy, setPathsBusy] = useState(false);

  useEffect(() => {
    if (initialTeamId) setTeamId(initialTeamId);
  }, [initialTeamId]);

  useEffect(() => {
    if (initialTarget && initialTarget > 0) setTarget(initialTarget);
  }, [initialTarget]);

  const effectiveTeam = teamId || teams[0]?.id || "";

  useEffect(() => {
    if (!teamId && teams[0]?.id) setTeamId(teams[0].id);
  }, [teamId, teams]);

  const resultsSig = state ? leagueResultsSig(state) : "";
  const outcomesKey = JSON.stringify(outcomes);

  const projection = useMemo(() => {
    if (!state || !effectiveTeam) return null;
    return projectRace(state, effectiveTeam, target, outcomes);
    // outcomesKey tracks outcomes without depending on object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsSig, effectiveTeam, target, outcomesKey, state]);

  // Path search is heavier — defer so the what-if UI stays responsive.
  useEffect(() => {
    if (!state || !effectiveTeam) {
      setPaths([]);
      return;
    }
    let cancelled = false;
    setPathsBusy(true);
    startTransition(() => {
      const found = enumeratePathsToRank(state, effectiveTeam, target);
      if (cancelled) return;
      setPaths(found.slice(0, 8));
      setPathsBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [state, effectiveTeam, target, resultsSig]);

  if (!state || !calc) return <Loading />;
  if (!teams.length) return <p className="muted">No teams in this season.</p>;

  const t = team(effectiveTeam);
  const staff = role === "admin" || role === "scorer";
  const nameOf = (id: string) => team(id)?.name ?? id;
  const bestPath = paths[0] ?? null;
  const canReach = paths.length > 0;

  const setOutcome = (fxId: string, result: CoarseResult | null) => {
    setOutcomes((prev) => {
      const next = { ...prev };
      if (!result) delete next[fxId];
      else next[fxId] = result;
      return next;
    });
  };

  return (
    <div className="race-calc stack">
      <p className="muted" style={{ margin: 0 }}>
        What-if tool for the league table — pick coarse results (2–0 / 2–1) for your remaining matches.
        Point ratio uses typical set scores, so treat ratio as approximate. Other teams&apos; unfinished
        games stay unplayed.
      </p>

      <div className="row race-calc-controls">
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Team
          </span>
          <select
            className="btn"
            value={effectiveTeam}
            onChange={(e) => {
              setTeamId(e.target.value);
              setOutcomes({});
            }}
          >
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Target
          </span>
          <select className="btn" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            <option value={PLAYOFF_QUALIFY}>Top {PLAYOFF_QUALIFY} (playoffs)</option>
            {teams.map((_, i) => (
              <option key={i + 1} value={i + 1}>
                Finish #{i + 1}
              </option>
            ))}
          </select>
        </label>
        <button className="btn ghost" type="button" onClick={() => setOutcomes({})}>
          Clear what-ifs
        </button>
      </div>

      {projection && (
        <>
          <div className="card race-summary stack">
            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <Logo team={t} size={40} />
              <div>
                <b>
                  #{projection.currentRank}
                  {projection.projectedRank !== projection.currentRank
                    ? ` → #${projection.projectedRank}`
                    : ""}{" "}
                  · {t?.name}
                </b>
                <div className="muted" style={{ fontSize: 13 }}>
                  {pathsBusy ? (
                    <>Checking paths to top {target}…</>
                  ) : canReach ? (
                    <>
                      Can still finish top {target}
                      {bestPath
                        ? ` — e.g. ${formatPathLabel(bestPath, projection.remaining, nameOf)}`
                        : ""}
                    </>
                  ) : (
                    <>Cannot reach top {target} with remaining league matches alone (others unfinished).</>
                  )}
                </div>
              </div>
            </div>
            {projection.nextInsight.note && <p className="note">{projection.nextInsight.note}</p>}
            {projection.rivalsAboveCeiling.length > 0 && projection.projectedRow && (
              <p className="note">
                Rival ceiling (if they win all remaining):{" "}
                {projection.rivalsAboveCeiling
                  .slice(0, 3)
                  .map((c) => `${nameOf(c.teamId)} ≤${c.ceilingPoints} pts`)
                  .join(" · ")}
                . Your projected {projection.projectedRow.points} pts may not hold if those results go against
                you.
              </p>
            )}
            <p className="note" style={{ marginBottom: 0 }}>
              Assumption: only your selected results are applied; other unfinished league matches stay blank.
            </p>
          </div>

          {projection.next && (
            <section className="card stack">
              <span className="kicker">Next match</span>
              <h3 style={{ margin: 0 }}>
                vs {nameOf(projection.next.oppId)}{" "}
                <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>
                  · {projection.next.fx.date} · {projection.next.fx.time}
                </span>
              </h3>
              <div className="row race-outcome-row">
                {COARSE_RESULTS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`btn ${outcomes[projection.next!.fx.id] === r ? "gold" : "ghost"}`}
                    onClick={() =>
                      setOutcome(
                        projection.next!.fx.id,
                        outcomes[projection.next!.fx.id] === r ? null : r,
                      )
                    }
                  >
                    {COARSE_LABELS[r]}
                  </button>
                ))}
              </div>
              {outcomes[projection.next.fx.id] && (
                <MiniDelta
                  before={projection.baseTable}
                  after={projection.projectedTable}
                  focus={effectiveTeam}
                  teamName={nameOf}
                />
              )}
            </section>
          )}

          {projection.remaining.length > 0 && (
            <section className="card stack">
              <span className="kicker">Remaining league matches</span>
              {projection.remaining.map((rem) => (
                <div key={rem.fx.id} className="race-rem-row">
                  <div className="race-rem-meta">
                    <b>vs {nameOf(rem.oppId)}</b>
                    <span className="muted">
                      Match {rem.fx.no} · {rem.fx.date} · {rem.fx.time}
                    </span>
                  </div>
                  <div className="row race-outcome-row">
                    {COARSE_RESULTS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`btn ${outcomes[rem.fx.id] === r ? "gold" : "ghost"}`}
                        onClick={() => setOutcome(rem.fx.id, outcomes[rem.fx.id] === r ? null : r)}
                      >
                        {COARSE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {!projection.remaining.length && (
            <p className="note">No unfinished league matches left for this team.</p>
          )}

          {staff && (
            <section className="card stack race-staff">
              <span className="kicker">Staff detail</span>
              <p className="muted" style={{ margin: 0 }}>
                Signed in as {role}. Full projected table and alternate paths.
              </p>
              {projection.currentRow && projection.projectedRow && (
                <div className="race-staff-stats">
                  <span>
                    Pts {projection.currentRow.points}
                    {projection.projectedRow.points !== projection.currentRow.points
                      ? ` → ${projection.projectedRow.points}`
                      : ""}
                  </span>
                  <span>
                    SD {projection.currentRow.setsWon - projection.currentRow.setsLost}
                    {projection.projectedRow.setsWon - projection.projectedRow.setsLost !==
                    projection.currentRow.setsWon - projection.currentRow.setsLost
                      ? ` → ${projection.projectedRow.setsWon - projection.projectedRow.setsLost}`
                      : ""}
                  </span>
                  <span>
                    Sets {projection.currentRow.setsWon}–{projection.currentRow.setsLost}
                    {projection.projectedRow.setsWon !== projection.currentRow.setsWon ||
                    projection.projectedRow.setsLost !== projection.currentRow.setsLost
                      ? ` → ${projection.projectedRow.setsWon}–${projection.projectedRow.setsLost}`
                      : ""}
                  </span>
                  <span>
                    Ratio {ratio(projection.currentRow)}
                    {ratio(projection.projectedRow) !== ratio(projection.currentRow)
                      ? ` → ${ratio(projection.projectedRow)}`
                      : ""}
                  </span>
                </div>
              )}
              <div className="tablewrap">
                <table className="standings">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th className="l">Team</th>
                      <th>P</th>
                      <th>W</th>
                      <th>Pts</th>
                      <th>SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.projectedTable.map((r, i) => (
                      <tr key={r.team} className={r.team === effectiveTeam ? "q" : undefined}>
                        <td>{i + 1}</td>
                        <td className="l">{nameOf(r.team)}</td>
                        <td>{r.played}</td>
                        <td>{r.won}</td>
                        <td className="pts">{r.points}</td>
                        <td>{r.setsWon - r.setsLost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paths.length > 0 && (
                <div className="stack">
                  <b>Paths to top {target}</b>
                  <ol className="race-paths">
                    {paths.map((p, i) => (
                      <li key={i}>
                        <button type="button" className="btn ghost" onClick={() => setOutcomes({ ...p.outcomes })}>
                          Apply
                        </button>{" "}
                        → #{p.rank}: {formatPathLabel(p, projection.remaining, nameOf)}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MiniDelta({
  before,
  after,
  focus,
  teamName,
}: {
  before: Row[];
  after: Row[];
  focus: string;
  teamName: (id: string) => string;
}) {
  const focusIdx = after.findIndex((r) => r.team === focus);
  const start = Math.max(0, focusIdx - 2);
  const slice = after.slice(start, start + 5);
  return (
    <div className="tablewrap">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th className="l">Team</th>
            <th>Pts</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {slice.map((r) => {
            const old = before.findIndex((x) => x.team === r.team) + 1;
            const neu = after.findIndex((x) => x.team === r.team) + 1;
            return (
              <tr key={r.team} className={r.team === focus ? "q" : undefined}>
                <td>{neu}</td>
                <td className="l">{teamName(r.team)}</td>
                <td className="pts">{r.points}</td>
                <td className="muted">{old !== neu ? `was #${old}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
