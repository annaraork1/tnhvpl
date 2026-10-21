import type { Format, MatchEvent, Side } from "./types";

/** Default practice format (safe for client + server). */
export function defaultPracticeFormat(): Format {
  return {
    bestOf: 3,
    targets: [21, 21, 15],
    winBy: 2,
    cap: 0,
    timeouts: 2,
    switchInDecider: true,
  };
}

export type PracticePlayerSource = "catalog" | "adhoc";

export interface PracticePlayer {
  name: string;
  skill?: string;
  photo?: string | null;
  source: PracticePlayerSource;
}

export interface PracticeMatch {
  v: number;
  id: string;
  status: "draft" | "live" | "done";
  mode: "live" | "quick";
  createdAt: number;
  completedAt?: number;
  /** SHA-256 hex of host token (plain token returned once on create). */
  hostTokenHash: string;
  allowPublicScore: boolean;
  labelA: string;
  labelB: string;
  sideA: PracticePlayer[];
  sideB: PracticePlayer[];
  format: Format;
  timeoutSeconds: number;
  ev: MatchEvent[];
  setsWon?: { a: number; b: number };
  setScores?: { a: number; b: number }[];
  winner?: Side | null;
}

/** Public-safe view (no hostTokenHash). */
export type PracticeMatchPublic = Omit<PracticeMatch, "hostTokenHash"> & {
  isHost?: boolean;
};

export interface PracticeSummary {
  id: string;
  mode: "live" | "quick";
  completedAt: number;
  labelA: string;
  labelB: string;
  setsWon: { a: number; b: number };
  setScores?: { a: number; b: number }[];
  winner: Side | null;
  sideACount: number;
  sideBCount: number;
}

/** Open live-mode practice (draft or in progress) for the public live board. */
export interface PracticeLiveRef {
  id: string;
  createdAt: number;
}

export interface PracticeIndex {
  v: number;
  matches: PracticeSummary[];
  /** IDs of open live-scored practices (not yet completed / abandoned). */
  live?: PracticeLiveRef[];
}
