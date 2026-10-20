export type Side = "A" | "B";

/** Where a fixture's team comes from: a fixed team, a league position, or the winner/loser of another match. */
export type Slot = { team: string } | { rank: number } | { winner: string } | { loser: string };

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  owner: string;
  logo: string;
  squad: number[];
}

export interface Player {
  no: number;
  name: string;
  skill: string;
  photo: string | null;
  team?: string;
}

export interface Fixture {
  id: string;
  no: number;
  stage: string; // "League" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final"
  day: string;
  date: string; // YYYY-MM-DD
  time: string; // "4:00 PM"
  a: Slot;
  b: Slot;
}

/** How a match is played. */
export interface Format {
  bestOf: number; // 3 or 5
  targets: number[]; // points needed per set, e.g. [21,21,15]; last value repeats
  winBy: number; // usually 2
  cap: number; // 0 = no cap; otherwise first to this score wins the set
  timeouts: number; // per team per set
  switchInDecider: boolean; // switch sides at half-way in the deciding set
}

export type TieKey =
  | "points"
  | "wins"
  | "setDiff"
  | "setsWon"
  | "setRatio"
  | "pointDiff"
  | "pointRatio"
  | "headToHead";

export interface Settings {
  league: Format;
  playoff: Format;
  /** League points by result, keyed "setsWinner-setsLoser" e.g. "2-0", "2-1". */
  points: Record<string, { w: number; l: number }>;
  tiebreak: TieKey[];
  showPhotos: boolean;
  /** Official timeout break length in seconds (countdown on scorer / display). */
  timeoutSeconds: number;
}

export interface Tournament {
  name: string;
  short: string;
  subtitle: string;
  dates: string;
}

/** Individual award after the Final (player + their team). Null / missing = not set. */
export type AwardId = "setter" | "attacker" | "server" | "mvp" | "emerging";

export interface AwardEntry {
  playerNo: number;
  teamId: string;
}

export type Awards = Record<AwardId, AwardEntry | null>;

export interface Config {
  v: number;
  tournament: Tournament;
  settings: Settings;
  teams: Team[];
  fixtures: Fixture[];
  awards: Awards;
  /** Squad players for this season (stored per tournament). */
  players: Player[];
}

/** Site-wide season registry (not prefixed by tournament key). */
export interface TournamentMeta {
  key: string;
  name: string;
  short: string;
  subtitle: string;
  dates: string;
  /** Data URL, public path, or absolute URL — used as nav brand logo. */
  logo: string;
  createdAt: number;
}

export interface Registry {
  v: number;
  activeKey: string;
  tournaments: TournamentMeta[];
}

export type MatchEvent =
  | { k: "start"; serve: Side; t?: number }
  | { k: "pt"; s: Side; t?: number }
  | { k: "to"; s: Side; t?: number }
  | { k: "resume"; t?: number }
  | { k: "next"; t?: number };

export interface MatchDoc {
  v: number;
  ev: MatchEvent[];
  /** Admin override of the teams in this match (team ids). */
  over?: { a?: string; b?: string };
  /** Optional man-of-the-match from either squad (suggestions for tournament MVP). */
  bestPlayer?: { playerNo: number; teamId: string } | null;
}

export interface AppState {
  config: Config;
  players: Player[];
  matches: Record<string, MatchDoc>;
  storage: "redis" | "memory";
  serverTime: number;
  /** Redis / storage key for this season. */
  tournamentKey: string;
  /** Season metadata (logo, labels) from the registry. */
  meta: TournamentMeta;
  /** True when viewing a season that is not the site-wide active one. */
  viewingArchive: boolean;
  /** All seasons (for admin / seasons page). */
  registry: Registry;
}

export interface SetState {
  a: number;
  b: number;
  target: number;
  winner: Side | null;
  toA: number;
  toB: number;
  firstServe: Side;
}

export interface ActiveTimeout {
  side: Side;
  startedAt: number;
  endsAt: number;
}

export interface MatchState {
  status: "scheduled" | "live" | "done";
  sets: SetState[];
  cur: number;
  awaitingNext: boolean;
  setsA: number;
  setsB: number;
  winner: Side | null;
  serve: Side | null;
  isDecider: boolean;
  switchNow: boolean;
  format: Format;
  /** Set while a timeout break is open (until resume). */
  timeout: ActiveTimeout | null;
}
