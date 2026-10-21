import { PRESSURE_BALL_LABEL, type PressureBall } from "@/lib/pressureBall";

/** Compact cue under a team name on scorer / live / TV. */
export function PressureBallBadge({ kind }: { kind: PressureBall | null | undefined }) {
  if (!kind) return null;
  return (
    <span className={`pball pball-${kind}`} aria-label={PRESSURE_BALL_LABEL[kind]}>
      {PRESSURE_BALL_LABEL[kind]}
    </span>
  );
}
