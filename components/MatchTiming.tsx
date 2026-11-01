"use client";

import { ClientTime } from "@/components/ClientTime";
import { formatDuration, type MatchTiming as Timing } from "@/lib/matchTiming";

/** Compact line for fixture rows: start–end · total · per-set. */
export function MatchTimingCompact({ timing }: { timing: Timing }) {
  if (!timing.done) return null;
  const total = formatDuration(timing.durationMs);
  const setParts = timing.sets
    .map((s) => {
      const d = formatDuration(s.durationMs);
      return d ? `S${s.set} ${d}` : null;
    })
    .filter(Boolean);

  return (
    <div className="match-timing match-timing-compact">
      {(timing.startedAt || timing.endedAt || total) && (
        <small className="muted">
          {timing.startedAt ? <ClientTime value={timing.startedAt} mode="time" /> : null}
          {timing.startedAt && timing.endedAt ? " – " : null}
          {timing.endedAt ? <ClientTime value={timing.endedAt} mode="time" /> : null}
          {total ? (
            <>
              {(timing.startedAt || timing.endedAt) && " · "}
              {total}
            </>
          ) : null}
        </small>
      )}
      {setParts.length > 0 && <small className="muted">{setParts.join(" · ")}</small>}
    </div>
  );
}

/** Full block under a finished LiveScore card. */
export function MatchTimingDetail({ timing }: { timing: Timing }) {
  if (!timing.done) return null;
  const total = formatDuration(timing.durationMs);

  return (
    <div className="match-timing match-timing-detail">
      <p className="note" style={{ textAlign: "center", marginTop: 10 }}>
        {timing.startedAt ? (
          <>
            Started <ClientTime value={timing.startedAt} mode="time" />
          </>
        ) : (
          "Start time unavailable"
        )}
        {timing.endedAt ? (
          <>
            {" · "}Ended <ClientTime value={timing.endedAt} mode="time" />
          </>
        ) : null}
        {total ? <> · {total} total</> : null}
      </p>
      <div className="sethist set-timing">
        {timing.sets.map((s) => {
          const d = formatDuration(s.durationMs);
          return (
            <span key={s.set}>
              Set {s.set}: {s.a}–{s.b}
              {d ? <em> · {d}</em> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
