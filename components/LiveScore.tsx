"use client";

import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { WinConfetti } from "./Confetti";
import { useLive } from "./LiveProvider";
import { ShareMatch } from "./ShareMatch";
import { TimeoutOverlay } from "./TimeoutOverlay";
import { Logo, StatusPill, fmtDate } from "./ui";

/** Big read-only scoreboard for one match (home, match page, TV display). */
export function LiveScore({ fx, link = true, share = true }: { fx: Fixture; link?: boolean; share?: boolean }) {
  const { state, calc, team, updatedAt } = useLive();
  if (!calc || !state) return null;
  const m = calc.ms[fx.id];
  const r = calc.resolved[fx.id];
  const tA = team(r.a);
  const tB = team(r.b);
  const s = m.sets[m.cur];
  const winSide = m.status === "done" ? m.winner : m.awaitingNext ? s?.winner : null;
  const winTeam = winSide === "A" ? tA : winSide === "B" ? tB : null;
  const confettiColors = [winTeam?.color, tA?.color, tB?.color, "#f5bc28", "#f5f1e6"].filter((c): c is string => !!c);
  const shareTitle = `${tA?.name ?? r.labelA} vs ${tB?.name ?? r.labelB}`;
  const head = (
    <div className="sechead">
      <span className="kicker">
        {fx.stage === "League" ? `Match ${fx.no}` : fx.stage} · {fmtDate(fx.date)} · {fx.time}
      </span>
      <StatusPill m={m} />
    </div>
  );
  const side = (id: "A" | "B") => {
    const t = id === "A" ? tA : tB;
    const label = id === "A" ? r.labelA : r.labelB;
    const pts = s ? (id === "A" ? s.a : s.b) : 0;
    const won = m.status === "done" && m.winner === id;
    return (
      <div className="side" style={{ ["--tc" as string]: t?.color }}>
        <Logo team={t} size={64} />
        <h3 style={{ color: won ? "var(--gold)" : undefined }}>{t?.name ?? label}</h3>
        {m.status === "live" && <div className="bigpts">{pts}</div>}
        <div className="serve">
          {m.status === "live" && !m.awaitingNext && !m.timeout && m.serve === id ? "● Serving" : ""}
        </div>
      </div>
    );
  };
  const toTeam = m.timeout ? (m.timeout.side === "A" ? tA : tB) : null;
  const body = (
    <div className="card live-card">
      {head}
      <div className="scoreline">
        {side("A")}
        <div className="setsbox">
          <span>SETS</span>
          <b>
            {m.setsA}–{m.setsB}
          </b>
          {m.status === "live" && (
            <span>
              {m.timeout ? "Timeout" : m.awaitingNext ? "Set break" : `Set ${m.cur + 1} · to ${s.target}`}
            </span>
          )}
          {m.status === "scheduled" && <span>Not started</span>}
        </div>
        {side("B")}
      </div>
      {m.sets.some((x) => x.a + x.b > 0) && (
        <div className="sethist">
          {m.sets.map((x, i) =>
            x.a + x.b > 0 || x.winner ? (
              <span key={i} className={i === m.cur && m.status === "live" && !m.awaitingNext && !m.timeout ? "cur" : ""}>
                Set {i + 1}: {x.a}–{x.b}
              </span>
            ) : null,
          )}
        </div>
      )}
      {m.status === "live" && s && (s.toA > 0 || s.toB > 0) && (
        <p className="note" style={{ textAlign: "center" }}>
          Timeouts this set: {tA?.short ?? "A"} {s.toA} · {tB?.short ?? "B"} {s.toB}
        </p>
      )}
    </div>
  );
  return (
    <>
      <WinConfetti matchKey={fx.id} m={m} colors={confettiColors} />
      {link ? <Link href={`/match/${fx.id}`}>{body}</Link> : body}
      {share && (
        <div className="row share-row">
          <ShareMatch id={fx.id} title={shareTitle} className="btn ghost" />
          {link && (
            <Link className="btn ghost" href={`/match/${fx.id}`}>
              Open match
            </Link>
          )}
        </div>
      )}
      {m.timeout && (
        <TimeoutOverlay
          teamName={toTeam?.name ?? (m.timeout.side === "A" ? r.labelA : r.labelB)}
          teamColor={toTeam?.color}
          startedAt={m.timeout.startedAt}
          endsAt={m.timeout.endsAt}
          serverTime={state.serverTime}
          updatedAt={updatedAt}
        />
      )}
    </>
  );
}
