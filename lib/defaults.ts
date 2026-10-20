import { emptyAwards } from "./awards";
import seed from "./seed.json";
import type { Config, Player, Settings } from "./types";

/** Season 5 rules: league best of 3 at 21-21-15; playoffs best of 3 at 21-21-25; 2 points per win, 0 per loss. */
export const defaultSettings: Settings = {
  league: { bestOf: 3, targets: [21, 21, 15], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true },
  playoff: { bestOf: 3, targets: [21, 21, 25], winBy: 2, cap: 0, timeouts: 2, switchInDecider: true },
  points: { "2-0": { w: 2, l: 0 }, "2-1": { w: 2, l: 0 } },
  tiebreak: ["points", "setDiff", "setsWon", "pointRatio", "headToHead"],
  showPhotos: true,
  timeoutSeconds: 30,
};

export function seedPlayers(): Player[] {
  return structuredClone(seed.players) as Player[];
}

export function defaultConfig(): Config {
  return {
    v: 0,
    tournament: seed.tournament,
    settings: structuredClone(defaultSettings),
    teams: structuredClone(seed.teams),
    fixtures: structuredClone(seed.fixtures) as Config["fixtures"],
    awards: emptyAwards(),
    players: seedPlayers(),
  };
}
