"use client";

import { effectiveStage, SEASON_STAGES } from "@/lib/season";
import type { SeasonStage } from "@/lib/types";
import { useLive } from "./LiveProvider";

const LABELS: Record<SeasonStage, string> = {
  registration: "Registration",
  auction: "Auction",
  fixtures: "Fixtures",
  matches: "Matches",
  completed: "Completed",
};

/** Read-only season workflow stage indicator (admin). */
export function AdminStageBar() {
  const { state } = useLive();
  if (!state) return null;
  const current = effectiveStage(state.config);
  const visible = SEASON_STAGES.filter((s) => s !== "completed");
  return (
    <section className="card stack" style={{ gap: 10 }}>
      <div className="sechead">
        <div>
          <span className="kicker">Season workflow</span>
          <h2 style={{ textTransform: "none", letterSpacing: 0, marginTop: 4 }}>Stage</h2>
        </div>
        <span className="pill live">{LABELS[current]}</span>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {visible.map((s) => {
          const on = s === current || (current === "completed" && s === "matches");
          const past = SEASON_STAGES.indexOf(s) < SEASON_STAGES.indexOf(current);
          return (
            <span
              key={s}
              className={`pill ${on ? "live" : past ? "done" : ""}`}
              style={{ opacity: on || past ? 1 : 0.45 }}
            >
              {LABELS[s]}
            </span>
          );
        })}
      </div>
      {!state.config.stage && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Legacy season (no stage set) — treated as Matches. New seasons start at Registration.
        </p>
      )}
    </section>
  );
}
