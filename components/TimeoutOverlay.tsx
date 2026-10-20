"use client";

import { useEffect, useState } from "react";

/** Approximate server time from the last state payload (for synced countdowns). */
export function approxServerNow(serverTime: number, updatedAt: number) {
  return serverTime + (Date.now() - updatedAt);
}

function formatClock(totalSec: number) {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : String(r);
}

interface Props {
  teamName: string;
  teamColor?: string;
  startedAt: number;
  endsAt: number;
  serverTime: number;
  updatedAt: number;
  /** Scorer can resume after the timer; spectators are read-only. */
  onResume?: () => void;
  onUndo?: () => void;
  resumePending?: boolean;
}

export function TimeoutOverlay({
  teamName,
  teamColor,
  startedAt,
  endsAt,
  serverTime,
  updatedAt,
  onResume,
  onUndo,
  resumePending,
}: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);
  void tick;

  const now = approxServerNow(serverTime, updatedAt);
  const leftMs = endsAt - now;
  const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
  const done = leftSec <= 0;
  const duration = Math.max(endsAt - (startedAt || endsAt - 30_000), 1);
  const progress = done ? 0 : Math.min(1, Math.max(0, leftMs / duration));

  return (
    <div className="banner timeout-banner" role="dialog" aria-live="polite" aria-label="Timeout">
      <div className="card timeout-card" style={{ ["--tc" as string]: teamColor ?? "var(--gold)" }}>
        <span className="kicker">Timeout</span>
        <h2>{teamName}</h2>
        {!done ? (
          <>
            <div className="timeout-clock" aria-label={`${leftSec} seconds remaining`}>
              {formatClock(leftSec)}
            </div>
            <div className="timeout-bar" aria-hidden>
              <div className="timeout-bar-fill" style={{ transform: `scaleX(${progress})` }} />
            </div>
            <p className="muted">Play resumes when the timer ends</p>
          </>
        ) : (
          <>
            <div className="timeout-clock done">0</div>
            <p className="muted">Timeout over</p>
            {onResume ? (
              <button className="btn gold timeout-resume" disabled={resumePending} onClick={onResume}>
                {resumePending ? "Resuming…" : "Resume match"}
              </button>
            ) : (
              <p className="note">Waiting for scorer to resume</p>
            )}
          </>
        )}
        {onUndo && (
          <button className="btn ghost" onClick={onUndo} disabled={resumePending}>
            ↶ Undo timeout
          </button>
        )}
      </div>
    </div>
  );
}
