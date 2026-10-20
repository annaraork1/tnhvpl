import type { Player, Team } from "./types";

export interface CatalogTeam {
  /** Preferred id from the newest season that had this team. */
  id: string;
  name: string;
  short: string;
  owner: string;
  color: string;
  logo: string;
  seasons: string[];
  seasonNames: string[];
}

export interface CatalogPlayer {
  name: string;
  skill: string;
  photo: string | null;
  seasons: string[];
  seasonNames: string[];
}

export interface MasterCatalog {
  teams: CatalogTeam[];
  players: CatalogPlayer[];
}

export type CatalogSeasonInput = {
  key: string;
  name: string;
  createdAt: number;
  teams: Team[];
  players: Player[];
};

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merge teams/players from every season (newest wins for display fields). */
export function buildMasterCatalog(entries: CatalogSeasonInput[]): MasterCatalog {
  const teamMap = new Map<string, CatalogTeam>();
  const playerMap = new Map<string, CatalogPlayer>();
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  for (const e of sorted) {
    for (const t of e.teams) {
      const k = norm(t.name);
      if (!k) continue;
      const cur = teamMap.get(k);
      if (!cur) {
        teamMap.set(k, {
          id: t.id,
          name: t.name,
          short: t.short,
          owner: t.owner,
          color: t.color,
          logo: t.logo,
          seasons: [e.key],
          seasonNames: [e.name],
        });
      } else if (!cur.seasons.includes(e.key)) {
        cur.seasons.push(e.key);
        cur.seasonNames.push(e.name);
      }
    }
    for (const p of e.players) {
      const k = norm(p.name);
      if (!k) continue;
      const cur = playerMap.get(k);
      if (!cur) {
        playerMap.set(k, {
          name: p.name,
          skill: p.skill,
          photo: p.photo,
          seasons: [e.key],
          seasonNames: [e.name],
        });
      } else {
        if (!cur.photo && p.photo) cur.photo = p.photo;
        if (!cur.seasons.includes(e.key)) {
          cur.seasons.push(e.key);
          cur.seasonNames.push(e.name);
        }
      }
    }
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    teams: [...teamMap.values()].sort(byName),
    players: [...playerMap.values()].sort(byName),
  };
}

export function filterCatalogTeams(teams: CatalogTeam[], query: string, excludeNames: Set<string>) {
  const q = norm(query);
  return teams.filter((t) => {
    if (excludeNames.has(norm(t.name))) return false;
    if (!q) return true;
    return (
      norm(t.name).includes(q) ||
      norm(t.owner).includes(q) ||
      norm(t.short).includes(q) ||
      t.seasons.some((s) => s.includes(q))
    );
  });
}

export function filterCatalogPlayers(players: CatalogPlayer[], query: string, excludeNames: Set<string>) {
  const q = norm(query);
  return players.filter((p) => {
    if (excludeNames.has(norm(p.name))) return false;
    if (!q) return true;
    return norm(p.name).includes(q) || norm(p.skill).includes(q) || p.seasons.some((s) => s.includes(q));
  });
}
