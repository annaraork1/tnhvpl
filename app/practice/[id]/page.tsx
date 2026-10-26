"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientTime } from "@/components/ClientTime";
import { fireConfetti, WinConfetti } from "@/components/Confetti";
import { PracticeLiveScore } from "@/components/PracticeLiveScore";
import { PressureBallBadge } from "@/components/PressureBallBadge";
import { ShareMatch } from "@/components/ShareMatch";
import { TimeoutOverlay } from "@/components/TimeoutOverlay";
import { WhistleButton } from "@/components/WhistleButton";
import { Loading } from "@/components/ui";
import { useLive } from "@/components/LiveProvider";
import { askConfirm } from "@/lib/confirm";
import { derive, other } from "@/lib/engine";
import { formatEventLog } from "@/lib/formatEvents";
import { fetchPractice, practiceAct } from "@/lib/practiceApi";
import { clearHostToken, getHostToken } from "@/lib/practiceHost";
import type { PracticeMatchPublic } from "@/lib/practiceTypes";
import { pressureBallForSide } from "@/lib/pressureBall";
import type { MatchEvent, MatchState, Side } from "@/lib/types";

type ScoreOp =
  | { kind: "start"; serve: Side }
  | { kind: "point"; side: Side }
  | { kind: "timeout"; side: Side }
  | { kind: "resume" }
  | { kind: "nextSet" }
  | { kind: "undo" };

function applyScoreOp(ev: MatchEvent[], op: ScoreOp): MatchEvent[] {
  const t = Date.now();
  if (op.kind === "undo") {
    const next = [...ev];
    next.pop();
    return next;
  }
  if (op.kind === "start") return [{ k: "start", serve: op.serve, t }];
  const next = [...ev];
  if (op.kind === "point") next.push({ k: "pt", s: op.side, t });
  else if (op.kind === "timeout") next.push({ k: "to", s: op.side, t });
  else if (op.kind === "resume") next.push({ k: "resume", t });
  else if (op.kind === "nextSet") next.push({ k: "next", t });
  return next;
}

function scoreOpToBody(op: ScoreOp): Record<string, unknown> {
  if (op.kind === "undo") return { action: "undo" };
  if (op.kind === "start") return { action: "start", serve: op.serve };
  if (op.kind === "point") return { action: "point", side: op.side };
  if (op.kind === "timeout") return { action: "timeout", side: op.side };
  if (op.kind === "resume") return { action: "resume" };
  return { action: "nextSet" };
}

const COLOR_A = "#4CC9F0";
const COLOR_B = "#F4A261";

function SideMark({ side, label, size = 48 }: { side: Side; label: string; size?: number }) {
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

export default function PracticeMatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const live = useLive();
  const role = live.role;
  const [match, setMatch] = useState<PracticeMatchPublic | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ScoreOp[]>([]);
  const [flip, setFlip] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const scoreQueue = useRef(Promise.resolve());
  const pendingCount = useRef(0);
  /** Highest match.v applied locally — blocks stale poll responses after a score write. */
  const matchRev = useRef(0);

  const applyMatch = useCallback((m: PracticeMatchPublic, s: MatchState | null | undefined) => {
    matchRev.current = Math.max(matchRev.current, m.v ?? 0);
    setMatch(m);
    if (s !== undefined) {
      setState(s);
      setUpdatedAt(Date.now());
    }
  }, []);

  const reload = useCallback(async () => {
    const token = getHostToken(id);
    setHostToken(token);
    const r = await fetchPractice(id, token);
    if (!r.ok) {
      setError(r.error);
      setMatch(null);
      return;
    }
    // Don't clobber optimistic taps still in flight, or apply a poll that lost the race
    // to a score write (fetch started before write, finished after pending cleared).
    if (pendingCount.current > 0) return;
    if ((r.match.v ?? 0) < matchRev.current) return;
    applyMatch(r.match, r.state);
    setError("");
  }, [applyMatch, id]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 2500);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? "" : x)), 2500);
  };

  const act = async (body: Record<string, unknown>, pin?: string) => {
    setBusy(true);
    const prev = state;
    const r = await practiceAct({ ...body, id, hostToken }, { pin });
    setBusy(false);
    if (!r.ok) {
      flash(r.error);
      await reload();
      return false;
    }
    if (r.match) applyMatch(r.match, r.state ?? (r.match.status === "done" ? null : undefined));
    else if (r.state) {
      setState(r.state);
      setUpdatedAt(Date.now());
    }
    if (prev && r.state?.status === "done" && prev.status !== "done") {
      fireConfetti({ intensity: "match", colors: [COLOR_A, COLOR_B, "#f5bc28", "#f5f1e6"] });
    }
    return true;
  };

  const enqueueScore = useCallback(
    (op: ScoreOp) => {
      setPending((p) => [...p, op]);
      pendingCount.current += 1;
      if (navigator.vibrate) navigator.vibrate(op.kind === "undo" ? [20, 40, 20] : 25);
      scoreQueue.current = scoreQueue.current.then(async () => {
        const prevStatus = state?.status;
        const r = await practiceAct({ type: "score", id, hostToken, ...scoreOpToBody(op) });
        pendingCount.current = Math.max(0, pendingCount.current - 1);
        // Apply server docs before dropping the optimistic op so the pad never flashes
        // back to the pre-tap score for a frame.
        if (!r.ok) {
          setPending((p) => p.slice(1));
          flash(r.error);
          await reload();
          return;
        }
        if (r.match) applyMatch(r.match, r.state ?? (r.match.status === "done" ? null : undefined));
        else if (r.state) {
          setState(r.state);
          setUpdatedAt(Date.now());
        }
        setPending((p) => p.slice(1));
        if (r.state?.status === "done" && prevStatus !== "done") {
          fireConfetti({ intensity: "match", colors: [COLOR_A, COLOR_B, "#f5bc28", "#f5f1e6"] });
        }
      });
    },
    [applyMatch, hostToken, id, reload, state?.status],
  );

  const shownEv = useMemo(() => {
    if (!match) return [] as MatchEvent[];
    let ev = [...match.ev];
    for (const op of pending) ev = applyScoreOp(ev, op);
    return ev;
  }, [match, pending]);

  if (error && !match) {
    return (
      <div className="wrap">
        <div className="card stack">
          <h1>Practice not found</h1>
          <p className="muted">{error}</p>
          <Link className="btn" href="/practice">
            Back to practice
          </Link>
        </div>
      </div>
    );
  }
  if (!match) return <Loading />;

  const isHost = Boolean(hostToken && match.isHost);
  const canScore = isHost || match.allowPublicScore;
  const isAdmin = role === "admin";
  /** Admin abandon of guest/host matches needs x-pin; prefer staff session PIN. */
  const adminPinForAct = () =>
    (adminPin || live.pin || (typeof window !== "undefined" ? localStorage.getItem("tnhvpl-pin") : "") || "").trim();
  const color = (s: Side) => (s === "A" ? COLOR_A : COLOR_B);

  const confettiColors = [COLOR_A, COLOR_B, "#f5bc28", "#f5f1e6"];

  if (match.status === "done") {
    return (
      <div className="wrap stack">
        <div className="sechead">
          <h1>Practice result</h1>
          <Link className="btn ghost" href="/practice">
            ← Back to practice
          </Link>
        </div>
        <section className="card stack">
          <h2>
            {match.labelA} {match.setsWon?.a ?? 0}–{match.setsWon?.b ?? 0} {match.labelB}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {match.mode === "live" ? "Live scored" : "Quick result"}
            {match.completedAt ? (
              <>
                {" · "}
                <ClientTime value={match.completedAt} />
              </>
            ) : null}
            {match.winner ? ` · Winner: ${match.winner === "A" ? match.labelA : match.labelB}` : ""}
          </p>
          {match.setScores && match.setScores.length > 0 && (
            <div>
              <h3>Sets</h3>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {match.setScores.map((s, i) => (
                  <li key={i}>
                    {s.a}–{s.b}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="fields">
            <div>
              <b>{match.labelA}</b>
              <ul>
                {match.sideA.map((p) => (
                  <li key={p.name}>{p.name}</li>
                ))}
              </ul>
            </div>
            <div>
              <b>{match.labelB}</b>
              <ul>
                {match.sideB.map((p) => (
                  <li key={p.name}>{p.name}</li>
                ))}
              </ul>
            </div>
          </div>
          {match.mode === "live" && match.ev.length > 0 && (
            <details>
              <summary>Event log ({match.ev.length})</summary>
              <ol className="event-log">
                {formatEventLog(match.ev, {
                  labelA: match.labelA,
                  labelB: match.labelB,
                  format: match.format,
                }).map((line) => (
                  <li key={line.n}>
                    <span className="event-log-text">{line.text}</span>
                    {line.time ? <span className="event-log-time">{line.time}</span> : null}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
        <section className="card stack">
          <h3>Admin — delete from history</h3>
          <p className="muted" style={{ margin: 0 }}>
            Permanently removes <b>{match.labelA} vs {match.labelB}</b> from practice history. Type DELETE, enter the
            admin PIN, then tap the button.
          </p>
          <div className="fields">
            <label>
              Type DELETE to confirm
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                aria-label="Type DELETE to confirm"
              />
            </label>
            <label>
              Admin PIN
              <input
                type="password"
                placeholder="Admin PIN"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <button
            className="btn red"
            type="button"
            disabled={busy || deleteConfirm !== "DELETE"}
            onClick={async () => {
              if (deleteConfirm !== "DELETE") {
                flash("Type DELETE to confirm");
                return;
              }
              if (!askConfirm(`Delete ${match.labelA} vs ${match.labelB} from practice history? This cannot be undone.`)) {
                return;
              }
              const stored = typeof window !== "undefined" ? localStorage.getItem("tnhvpl-pin") || "" : "";
              const pin = (adminPin || stored).trim();
              if (!pin) {
                flash("Enter admin PIN");
                return;
              }
              setBusy(true);
              const r = await practiceAct({ type: "delete", id }, { pin });
              setBusy(false);
              if (r.ok) {
                clearHostToken(id);
                setDeleteConfirm("");
                router.push("/practice");
              } else {
                flash(!r.ok ? r.error : "Delete failed");
              }
            }}
          >
            {busy ? "Deleting…" : "Delete from history"}
          </button>
        </section>
        {msg && <div className="toast">{msg}</div>}
      </div>
    );
  }

  const m = derive(shownEv, match.format, match.timeoutSeconds);
  const name = (s: Side) => (s === "A" ? match.labelA : match.labelB);
  const set = m.sets[m.cur] ?? { a: 0, b: 0, target: match.format.targets[0], winner: null, toA: 0, toB: 0, firstServe: "A" as Side };
  const left: Side = flip ? "B" : "A";
  const right = other(left);
  const fmt = match.format;
  const inTimeout = !!m.timeout;
  const saving = pending.length > 0;

  const score = (op: ScoreOp) => {
    if (!canScore) {
      flash("Only the host can score (unless public scoring is on)");
      return;
    }
    enqueueScore(op);
  };

  const undo = () => score({ kind: "undo" });

  // Spectators get the same read-only live board as tournament matches.
  if (!canScore) {
    return (
      <div className="wrap stack">
        <div className="sechead">
          <h1>Practice</h1>
          <Link className="btn ghost" href="/practice">
            ← Back to practice
          </Link>
        </div>
        <PracticeLiveScore
          match={match}
          state={m}
          link={false}
          share
          updatedAt={updatedAt}
          serverTime={Date.now()}
        />
        <p className="note">
          Watching live
          {match.allowPublicScore
            ? " — public scoring is on for this match."
            : " — only the host can score."}
        </p>
      </div>
    );
  }

  if (m.status === "scheduled") {
    return (
      <div className="wrap">
        <div className="card stack" style={{ textAlign: "center" }}>
          <span className="kicker">Practice</span>
          <div className="row" style={{ justifyContent: "center", gap: 20, marginTop: 8 }}>
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s} className="stack" style={{ alignItems: "center", gap: 6 }}>
                <SideMark side={s} label={name(s)} size={64} />
                <h2 style={{ margin: 0, fontSize: 20 }}>{name(s)}</h2>
              </div>
            ))}
          </div>
          <p className="muted">
            Best of {fmt.bestOf} · sets to {fmt.targets.join("-")} · win by {fmt.winBy} · {fmt.timeouts} timeouts per
            set
          </p>
          {!canScore && <p className="note">Viewing only — host scores this match.</p>}
          <h2>Who serves first?</h2>
          <div className="row" style={{ justifyContent: "center" }}>
            {(["A", "B"] as Side[]).map((s) => (
              <button
                key={s}
                className="btn"
                style={{ borderColor: color(s), padding: "16px 20px", fontSize: 18 }}
                disabled={!canScore}
                onClick={() => score({ kind: "start", serve: s })}
              >
                <span className="row" style={{ gap: 8 }}>
                  <SideMark side={s} label={name(s)} size={28} />
                  {name(s)}
                </span>
              </button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="btn ghost" href="/practice">
              ← Back to practice
            </Link>
            {(isHost || isAdmin) && (
              <button
                className="btn red"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!askConfirm("Abandon this practice? It will not be saved to history.")) return;
                  let pin: string | undefined;
                  if (isAdmin && !isHost) {
                    pin = adminPinForAct() || window.prompt("Admin PIN") || "";
                    if (!pin.trim()) {
                      flash("Admin PIN required to abandon a guest practice");
                      return;
                    }
                  }
                  const ok = await act({ type: "abandon" }, pin);
                  if (ok) {
                    clearHostToken(id);
                    router.push("/practice");
                  }
                }}
              >
                {isAdmin && !isHost ? "Abandon (admin)" : "Abandon"}
              </button>
            )}
          </div>
          {msg && <div className="toast">{msg}</div>}
        </div>
      </div>
    );
  }

  const pad = (s: Side) => {
    const pts = s === "A" ? set.a : set.b;
    const sets = s === "A" ? m.setsA : m.setsB;
    const blocked = !canScore || m.status !== "live" || m.awaitingNext || inTimeout;
    const pressure =
      m.status === "live" && !m.awaitingNext && !inTimeout
        ? pressureBallForSide(s, set.a, set.b, set.target, fmt, m.setsA, m.setsB)
        : null;
    return (
      <button
        className="pad"
        style={{ ["--tc" as string]: color(s) }}
        disabled={blocked}
        onClick={() => score({ kind: "point", side: s })}
        aria-label={`Point to ${name(s)}`}
      >
        <span className="pteam">
          <SideMark side={s} label={name(s)} size={48} />
          <span className="pname">{name(s)}</span>
          <PressureBallBadge kind={pressure} />
        </span>
        <span className="ppts">{pts}</span>
        <span className="pset">
          {m.serve === s && !blocked ? <b className="ball">🏐 Serving · </b> : null}Sets {sets}
        </span>
      </button>
    );
  };

  const toLeft = (s: Side) => fmt.timeouts - (s === "A" ? set.toA : set.toB);
  const timeoutBtn = (s: Side) => (
    <button
      className="btn ghost timeout-mini"
      disabled={!canScore || m.status !== "live" || m.awaitingNext || inTimeout || toLeft(s) <= 0}
      onClick={() => {
        score({ kind: "timeout", side: s });
        flash(`Timeout ${name(s)}`);
      }}
      aria-label={`Timeout ${name(s)}, ${toLeft(s)} left`}
    >
      TO {s} · {toLeft(s)}
    </button>
  );

  const abandonLive = async () => {
    if (!askConfirm("Abandon this practice? It will not be saved to history.")) return;
    let pin: string | undefined;
    if (isAdmin && !isHost) {
      pin = adminPinForAct() || window.prompt("Admin PIN") || "";
      if (!pin.trim()) {
        flash("Admin PIN required to abandon a guest practice");
        return;
      }
    }
    const ok = await act({ type: "abandon" }, pin);
    if (ok) {
      clearHostToken(id);
      router.push("/practice");
    }
  };

  const showAbandon = isHost || isAdmin;

  return (
    <div className="scorer">
      <WinConfetti matchKey={id} m={m} colors={confettiColors} />
      <div className="sbar">
        <Link href="/practice" className="btn ghost" aria-label="Back to practice">
          ←
        </Link>
        <div className="mid">
          <b>
            Set {m.cur + 1} · to {set.target}
          </b>
          <div className="muted" style={{ fontSize: 14 }}>
            Practice · sets {m.setsA}–{m.setsB}
            {saving ? " · saving…" : ""}
            {!canScore ? " · view only" : ""}
          </div>
        </div>
        <div className="sbar-actions">
          <ShareMatch
            id={id}
            title={`${match.labelA} vs ${match.labelB}`}
            pathPrefix="/practice"
            className="btn ghost"
          />
          <WhistleButton />
          <button className="btn ghost" type="button" onClick={() => setFlip((f) => !f)} aria-label="Swap sides on screen">
            ⇄
          </button>
        </div>
      </div>

      <div className="pads">
        {pad(left)}
        {pad(right)}
      </div>

      <div className={`sfoot${showAbandon ? " sfoot-with-abandon" : ""}`}>
        {timeoutBtn(left)}
        <button className="btn" type="button" onClick={undo} disabled={!canScore || shownEv.length === 0}>
          ↶ Undo
        </button>
        {showAbandon && (
          <button
            className="btn red"
            type="button"
            disabled={busy}
            onClick={() => void abandonLive()}
            title={isAdmin && !isHost ? "Admin: abandon guest practice" : undefined}
          >
            {isAdmin && !isHost ? "Abandon (admin)" : "Abandon"}
          </button>
        )}
        {timeoutBtn(right)}
      </div>

      {m.switchNow && !inTimeout && <div className="switchnote">Switch sides!</div>}

      {m.timeout && (
        <TimeoutOverlay
          teamName={name(m.timeout.side)}
          teamColor={color(m.timeout.side)}
          startedAt={m.timeout.startedAt}
          endsAt={m.timeout.endsAt}
          serverTime={Date.now()}
          updatedAt={updatedAt}
          onResume={
            canScore
              ? () => {
                  score({ kind: "resume" });
                  flash("Match resumed");
                }
              : undefined
          }
          onUndo={canScore ? undo : undefined}
        />
      )}

      {m.awaitingNext && (
        <div className="banner">
          <div className="card">
            <span className="kicker">Set {m.cur + 1} finished</span>
            <h2>
              {name(set.winner!)} win {Math.max(set.a, set.b)}–{Math.min(set.a, set.b)}
            </h2>
            <p className="muted">
              Sets {name("A")} {m.setsA} – {m.setsB} {name("B")}. Teams switch sides.
            </p>
            <button
              className="btn gold"
              type="button"
              disabled={!canScore}
              onClick={() => {
                score({ kind: "nextSet" });
                setFlip((f) => !f);
              }}
            >
              Start set {m.cur + 2}
            </button>
            <button className="btn ghost" type="button" disabled={!canScore} onClick={undo}>
              ↶ Undo last point
            </button>
          </div>
        </div>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
