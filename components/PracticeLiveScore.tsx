"use client";

import Link from "next/link";
import { pressureBallForSide } from "@/lib/pressureBall";
import type { PracticeMatchPublic } from "@/lib/practiceTypes";
import type { MatchState, Side } from "@/lib/types";
import { WinConfetti } from "./Confetti";
import { PressureBallBadge } from "./PressureBallBadge";
import { MatchWatching } from "./Watching";
import { ShareMatch } from "./ShareMatch";
import { TimeoutOverlay } from "./TimeoutOverlay";
import { StatusPill } from "./ui";

const COLOR_A = "#4CC9F0";
const COLOR_B = "#F4A261";

function SideMark({ side, label, size = 64 }: { side: Side; label: string; size?: number }) {
  const color = side === "A" ? COLOR_A : COLOR_B;
  return (
    <span
      className="logo ph"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#0a1020",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--display)",
        fontWeight: 800,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {(label[0] || side).toUpperCase()}
    </span>
  );
}

/** Read-only practice scoreboard (same role as tournament LiveScore). */
export function PracticeLiveScore({
  match,
  state: m,
  link = true,
  share = true,
  updatedAt = 0,
  serverTime,
}: {
  match: PracticeMatchPublic;
  state: MatchState;
  link?: boolean;
  share?: boolean;
  updatedAt?: number;
  serverTime?: number;
}) {
  const fmt = match.format;
  const s = m.sets[m.cur];
  const formatLine = `Best of ${fmt.bestOf} · sets to ${fmt.targets.join("-")} · win by ${fmt.winBy}${fmt.cap ? ` · cap ${fmt.cap}` : ""}`;
  const winSide = m.status === "done" ? m.winner : m.awaitingNext ? s?.winner : null;
  const confettiColors = [
    winSide === "A" ? COLOR_A : winSide === "B" ? COLOR_B : null,
    COLOR_A,
    COLOR_B,
    "#f5bc28",
    "#f5f1e6",
  ].filter((c): c is string => !!c);

  const side = (id: Side) => {
    const label = id === "A" ? match.labelA : match.labelB;
    const color = id === "A" ? COLOR_A : COLOR_B;
    const pts = s ? (id === "A" ? s.a : s.b) : 0;
    const won = m.status === "done" && m.winner === id;
    const pressure =
      m.status === "live" && s && !m.awaitingNext && !m.timeout
        ? pressureBallForSide(id, s.a, s.b, s.target, fmt, m.setsA, m.setsB)
        : null;
    return (
      <div className="side" style={{ ["--tc" as string]: color }}>
        <SideMark side={id} label={label} size={64} />
        <h3 style={{ color: won ? "var(--gold)" : undefined }}>{label}</h3>
        <PressureBallBadge kind={pressure} />
        {m.status === "live" && <div className="bigpts">{pts}</div>}
        <div className="serve">
          {m.status === "live" && !m.awaitingNext && !m.timeout && m.serve === id ? "● Serving" : ""}
        </div>
      </div>
    );
  };

  const head = (
    <div className="sechead">
      <span className="kicker">Practice · {match.mode === "live" ? "Live scored" : "Quick"}</span>
      <span className="live-meta">
        <MatchWatching kind="p" id={match.id} live={m.status === "live"} />
        <StatusPill m={m} />
      </span>
    </div>
  );

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
              {m.timeout ? "Timeout" : m.awaitingNext ? "Set break" : s ? `Set ${m.cur + 1} · to ${s.target}` : ""}
            </span>
          )}
          {m.status === "scheduled" && <span>Not started</span>}
          {m.status === "done" && <span>{formatLine}</span>}
        </div>
        {side("B")}
      </div>
      {m.status === "scheduled" && (
        <p className="note" style={{ textAlign: "center" }}>
          {formatLine}
        </p>
      )}
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
          Timeouts this set: {match.labelA} {s.toA} · {match.labelB} {s.toB}
        </p>
      )}
    </div>
  );

  const toName = m.timeout ? (m.timeout.side === "A" ? match.labelA : match.labelB) : null;
  const toColor = m.timeout ? (m.timeout.side === "A" ? COLOR_A : COLOR_B) : undefined;
  const shareTitle = `${match.labelA} vs ${match.labelB}`;

  return (
    <>
      <WinConfetti matchKey={match.id} m={m} colors={confettiColors} />
      {link ? <Link href={`/practice/${match.id}`}>{body}</Link> : body}
      {share && (
        <div className="row share-row">
          <ShareMatch id={match.id} title={shareTitle} pathPrefix="/practice" className="btn ghost" />
          {link && (
            <Link className="btn ghost" href={`/practice/${match.id}`}>
              Open match
            </Link>
          )}
        </div>
      )}
      {m.timeout && (
        <TimeoutOverlay
          teamName={toName ?? ""}
          teamColor={toColor}
          startedAt={m.timeout.startedAt}
          endsAt={m.timeout.endsAt}
          serverTime={serverTime ?? Date.now()}
          updatedAt={updatedAt || Date.now()}
        />
      )}
    </>
  );
}
