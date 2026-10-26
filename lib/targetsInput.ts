/** Parse "21, 21, 15" / "21-21-15" / "21 21 15" into set targets. */
export function parseTargetsText(raw: string): number[] {
  return raw
    .split(/[,;\s\-/|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0 && n < 100);
}

export function formatTargetsText(targets: number[]): string {
  return targets.join(", ");
}

export function targetsPlaceholder(bestOf: number): string {
  if (bestOf <= 1) return "25";
  if (bestOf === 3) return "21, 21, 15";
  return "25, 25, 25, 25, 15";
}

/**
 * A match of best-of N has at most N sets, so at most N point targets.
 * Fewer targets is OK (the last value repeats for later sets).
 */
export function targetsFitBestOf(bestOf: number, targets: number[]): string | null {
  if (![1, 3, 5].includes(bestOf)) return "Best of must be 1, 3 or 5";
  if (!Array.isArray(targets) || !targets.length) return "Enter at least one points-per-set value";
  if (targets.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) {
    return "Set targets must be whole numbers from 1–99";
  }
  if (targets.length > bestOf) {
    if (bestOf === 1) return "Best of 1 needs a single number (e.g. 25), not multiple set targets";
    return `Best of ${bestOf} allows at most ${bestOf} set targets (e.g. ${targetsPlaceholder(bestOf)})`;
  }
  return null;
}

/** Keep at most `bestOf` targets when the format shrinks. */
export function trimTargetsToBestOf(bestOf: number, targets: number[]): number[] {
  if (!targets.length) return targets;
  return targets.slice(0, Math.max(1, bestOf));
}
