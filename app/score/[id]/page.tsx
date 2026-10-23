"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BestPlayerPicker } from "@/components/BestPlayerPicker";
import { WinConfetti } from "@/components/Confetti";
import { useLive } from "@/components/LiveProvider";
import { PressureBallBadge } from "@/components/PressureBallBadge";
import { TimeoutOverlay } from "@/components/TimeoutOverlay";
import { WhistleButton } from "@/components/WhistleButton";
import { Loading, Logo, PinGate } from "@/components/ui";
import { DEFAULT_TIMEOUT_SECONDS, derive, formatFor, other } from "@/lib/engine";
import { pressureBallForSide } from "@/lib/pressureBall";
import type { MatchEvent, Side } from "@/lib/types";

type Op = { kind: "ev"; e: MatchEvent } | { kind: "undo" };

export default function ScorePage() {
  return (
    <PinGate need="scorer">
      <Console />
    </PinGate>
  );
}

function Console() {
  const { id } = useParams<{ id: string }>();
  const { state, calc, act, accept, setHold, team, refresh, updatedAt } = useLive();
  const [pending, setPending] = useState<Op[]>([]);
  const [flip, setFlip] = useState(false);
  const [toast, setToast] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const say = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? "" : t)), 2200);
  }, []);

  // Keep the screen awake while scoring.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    refresh(true);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [refresh]);

  useEffect(() => setHold(pending.length > 0), [pending.length, setHold]);
  useEffect(() => () => setHold(false), [setHold]);

  const fx = state?.config.fixtures.find((f) => f.id === id);
  const doc = state?.matches[id];
  const fmt = fx && state ? formatFor(fx, state.config.settings) : null;
  const toSec = state?.config.settings.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  const shownEv = useMemo(() => {
    const ev = [...(doc?.ev ?? [])];
    for (const op of pending) {
      if (op.kind === "undo") ev.pop();
      else ev.push(op.e);
    }
    return ev;
  }, [doc, pending]);

  const send = useCallback(
    (op: Op, type: string, payload: Record<string, unknown> = {}) => {
      setHold(true);
      setPending((p) => [...p, op]);
      if (navigator.vibrate) navigator.vibrate(op.kind === "undo" ? [20, 40, 20] : 25);
      queue.current = queue.current.then(async () => {
        const r = await act(type, { id, ...payload }, { noAccept: true });
        // Apply server state before dropping the optimistic op so the pad never
        // flashes the pre-tap score (or a full-page Loading) for a frame.
        if (r.state) accept(r.state);
        setPending((p) => p.slice(1));
        if (!r.ok) {
          say(r.error ?? "Not saved");
          refresh(true);
        }
      });
    },
    [act, accept, setHold, id, refresh, say],
  );

  if (!state || !calc || !fx || !fmt) return state && !fx ? <div className="empty">Match not found</div> : <Loading />;

  const m = derive(shownEv, fmt, toSec);
  const r = calc.resolved[fx.id];
  const T = { A: team(r.a), B: team(r.b) };
  const name = (s: Side) => T[s]?.name ?? (s === "A" ? r.labelA : r.labelB);
  const set = m.sets[m.cur];
  const left: Side = flip ? "B" : "A";
  const right = other(left);

  if (!r.a || !r.b)
    return (
      <div className="wrap">
        <div className="card stack">
          <h2>Teams not decided yet</h2>
          <p className="muted">
            {r.labelA} vs {r.labelB}. The teams fill in when earlier results are in, or an admin can set them.
          </p>
          <Link className="btn" href="/score">Back to matches</Link>
        </div>
      </div>
    );

  if (m.status === "scheduled")
    return (
      <div className="wrap">
        <div className="card stack" style={{ textAlign: "center" }}>
          <span className="kicker">{fx.stage === "League" ? `Match ${fx.no}` : fx.stage} · {fx.time}</span>
          <div className="row" style={{ justifyContent: "center", gap: 20, marginTop: 8 }}>
            {(["A", "B"] as Side[]).map((s) => (
              <div key={s} className="stack" style={{ alignItems: "center", gap: 6 }}>
                <Logo team={T[s]} size={64} />
                <h2 style={{ margin: 0, fontSize: 20 }}>{name(s)}</h2>
              </div>
            ))}
          </div>
          <p className="muted">
            Best of {fmt.bestOf} · sets to {fmt.targets.join("-")} · win by {fmt.winBy} · {fmt.timeouts} timeouts per set
          </p>
          <h2>Who serves first?</h2>
          <div className="row" style={{ justifyContent: "center" }}>
            {(["A", "B"] as Side[]).map((s) => (
              <button
                key={s}
                className="btn"
                style={{ borderColor: T[s]?.color, padding: "16px 20px", fontSize: 18 }}
                onClick={() => send({ kind: "ev", e: { k: "start", serve: s } }, "start", { serve: s })}
              >
                <span className="row" style={{ gap: 8 }}>
                  <Logo team={T[s]} size={28} />
                  {name(s)}
                </span>
              </button>
            ))}
          </div>
          <Link className="btn ghost" href="/score">Back</Link>
        </div>
      </div>
    );

  const inTimeout = !!m.timeout;
  const pad = (s: Side) => {
    const pts = s === "A" ? set.a : set.b;
    const sets = s === "A" ? m.setsA : m.setsB;
    const blocked = m.status !== "live" || m.awaitingNext || inTimeout;
    const pressure =
      m.status === "live" && !m.awaitingNext && !inTimeout
        ? pressureBallForSide(s, set.a, set.b, set.target, fmt, m.setsA, m.setsB)
        : null;
    return (
      <button
        className="pad"
        style={{ ["--tc" as string]: T[s]?.color ?? "#555" }}
        disabled={blocked}
        onClick={() => send({ kind: "ev", e: { k: "pt", s, t: Date.now() } }, "point", { side: s })}
        aria-label={`Point to ${name(s)}`}
      >
        <span className="pteam">
          <Logo team={T[s]} size={48} />
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
      className="btn"
      disabled={m.status !== "live" || m.awaitingNext || inTimeout || toLeft(s) <= 0}
      onClick={() => {
        send({ kind: "ev", e: { k: "to", s, t: Date.now() } }, "timeout", { side: s });
        say(`Timeout ${name(s)} (${fmt.timeouts - toLeft(s) + 1} of ${fmt.timeouts})`);
      }}
    >
      Timeout {T[s]?.short ?? s} · {toLeft(s)} left
    </button>
  );
  const undo = () => send({ kind: "undo" }, "undo");
  const resumePending = pending.some((op) => op.kind === "ev" && op.e.k === "resume");
  const winSide = m.status === "done" ? m.winner : m.awaitingNext ? set.winner : null;
  const confettiColors = [winSide ? T[winSide]?.color : null, T.A?.color, T.B?.color, "#f5bc28", "#f5f1e6"].filter(
    (c): c is string => !!c,
  );

  return (
    <div className="scorer">
      <WinConfetti matchKey={id} m={m} colors={confettiColors} />
      <div className="sbar">
        <Link href="/score" className="btn ghost" aria-label="Back">←</Link>
        <div className="mid">
          <b>
            Set {m.cur + 1} · to {set.target}
          </b>
          <div className="muted" style={{ fontSize: 14 }}>
            {fx.stage === "League" ? `Match ${fx.no}` : fx.stage} · sets {m.setsA}–{m.setsB}
            {pending.length ? " · saving…" : ""}
          </div>
        </div>
        <div className="sbar-actions">
          <WhistleButton />
          <button className="btn ghost" onClick={() => setFlip((f) => !f)} aria-label="Swap sides on screen">
            ⇄
          </button>
        </div>
      </div>
      <div className="pads">
        {pad(left)}
        {pad(right)}
      </div>
      <div className="sfoot">
        {timeoutBtn(left)}
        <button className="btn" onClick={undo} disabled={shownEv.length === 0}>
          ↶ Undo
        </button>
        {timeoutBtn(right)}
      </div>

      {m.switchNow && !inTimeout && <div className="switchnote">Switch sides!</div>}

      {m.timeout && (
        <TimeoutOverlay
          teamName={name(m.timeout.side)}
          teamColor={T[m.timeout.side]?.color}
          startedAt={m.timeout.startedAt}
          endsAt={m.timeout.endsAt}
          serverTime={state.serverTime}
          updatedAt={updatedAt}
          resumePending={resumePending}
          onResume={() => {
            send({ kind: "ev", e: { k: "resume", t: Date.now() } }, "resume");
            say("Match resumed");
          }}
          onUndo={undo}
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
              onClick={() => {
                send({ kind: "ev", e: { k: "next" } }, "nextSet");
                setFlip((f) => !f);
              }}
            >
              Start set {m.cur + 2}
            </button>
            <button className="btn ghost" onClick={undo}>
              ↶ Undo last point
            </button>
          </div>
        </div>
      )}

      {m.status === "done" && (
        <div className="banner">
          <div className="card stack" style={{ maxWidth: 420, width: "100%", maxHeight: "92vh", overflow: "auto" }}>
            <span className="kicker">Match over</span>
            <div className="row" style={{ justifyContent: "center", gap: 12 }}>
              <Logo team={T[m.winner!]} size={48} />
              <h2 style={{ margin: 0 }}>
                {name(m.winner!)} win {Math.max(m.setsA, m.setsB)}–{Math.min(m.setsA, m.setsB)}
              </h2>
            </div>
            <p className="muted">{m.sets.map((s) => `${s.a}–${s.b}`).join(", ")}</p>
            <p className="note">The points table has been updated.</p>
            <BestPlayerPicker matchId={id} teamA={r.a!} teamB={r.b!} compact />
            <Link className="btn gold" href="/score">
              Back to matches
            </Link>
            <button className="btn ghost" onClick={undo}>
              ↶ Undo last point (correct a mistake)
            </button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
