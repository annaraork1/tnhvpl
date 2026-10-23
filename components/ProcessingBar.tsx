"use client";

import { useLive } from "./LiveProvider";

/** Global strip: initial load / in-flight tournament API writes. */
export function ProcessingBar() {
  const { state, loading, saving, error } = useLive();
  const showLoad = loading && !state;
  const showSave = saving > 0;
  if (!showLoad && !showSave && !error) return null;

  let label = "";
  if (error && !state) label = error;
  else if (showLoad) label = "Loading live data…";
  else if (showSave) label = saving === 1 ? "Saving…" : `Saving ${saving}…`;
  else if (error) label = error;

  return (
    <div
      className={`processing-bar ${error && !showSave ? "err" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={showLoad || showSave}
    >
      {(showLoad || showSave) && <span className="spinner" aria-hidden />}
      <span>{label}</span>
    </div>
  );
}
