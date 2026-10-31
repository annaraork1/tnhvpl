"use client";

/** Compact − / + under each scoring pad for corrections. */
export function ScoreAdjust({
  canMinus,
  canPlus,
  onMinus,
  onPlus,
  sideLabel,
}: {
  canMinus: boolean;
  canPlus: boolean;
  onMinus: () => void;
  onPlus: () => void;
  sideLabel: string;
}) {
  return (
    <div className="pad-adjust" role="group" aria-label={`Adjust score for ${sideLabel}`}>
      <span className="pad-adjust-label">Adjust</span>
      <div className="pad-adjust-row">
        <button
          type="button"
          className="pad-adjust-btn"
          disabled={!canMinus}
          onClick={(e) => {
            e.stopPropagation();
            onMinus();
          }}
          aria-label={`Minus one point for ${sideLabel}`}
        >
          −
        </button>
        <button
          type="button"
          className="pad-adjust-btn pad-adjust-plus"
          disabled={!canPlus}
          onClick={(e) => {
            e.stopPropagation();
            onPlus();
          }}
          aria-label={`Plus one point for ${sideLabel}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
