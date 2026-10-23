import { deriveAuction, type AuctionState } from "./auction";
import { defaultAuctionSettings, playerId } from "./season";
import type { AuctionDoc, AuctionSettings, Config, Player, PlayerPrivate, Team } from "./types";

/** Public team fields for auction boards (no private contact data). */
export function publicTeamSummary(t: Team) {
  return {
    id: t.id,
    name: t.name,
    short: t.short,
    color: t.color,
    logo: t.logo,
    owner: t.owner,
  };
}

/** Public player fields for the auction board. */
export function publicPlayerSummary(p: Player) {
  return {
    no: p.no,
    id: playerId(p),
    name: p.name,
    skill: p.skill,
    photo: p.photo,
    team: p.team,
  };
}

/** Settings subset safe for public auction clients. */
export function publicAuctionSettings(settings: AuctionSettings) {
  return {
    purse: settings.purse,
    minPlayers: settings.minPlayers,
    maxPlayers: settings.maxPlayers ?? null,
    ownerCountsInSquad: settings.ownerCountsInSquad,
    timerSeconds: settings.timerSeconds,
    antiSnipeSeconds: settings.antiSnipeSeconds,
    showPricesPublic: settings.showPricesPublic,
    drawOrder: settings.drawOrder,
    capUntilLeftover: settings.capUntilLeftover,
    rebid: settings.rebid,
    finalUnsold: settings.finalUnsold,
    increments: settings.increments,
    basePriceBySkill: settings.basePriceBySkill,
  };
}

export interface PublicAuctionPayload {
  ok: true;
  season: string;
  auction: AuctionState & {
    v: number;
    startedAt?: number;
    completedAt?: number;
  };
  teams: ReturnType<typeof publicTeamSummary>[];
  players: ReturnType<typeof publicPlayerSummary>[];
  settings: ReturnType<typeof publicAuctionSettings>;
}

export function buildPublicAuctionPayload(
  prefix: string,
  config: Config,
  players: Player[],
  doc: AuctionDoc,
): PublicAuctionPayload {
  const settings = config.auction ?? defaultAuctionSettings();
  const state = deriveAuction(doc.ev, settings, config.teams, players);
  return {
    ok: true,
    season: prefix,
    auction: {
      ...state,
      v: doc.v,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
    },
    teams: config.teams.map(publicTeamSummary),
    players: players.map(publicPlayerSummary),
    settings: publicAuctionSettings(settings),
  };
}

export function privateForCurrent(
  players: Player[],
  privDoc: { players: Record<string, PlayerPrivate> },
  currentNo: number | undefined,
): PlayerPrivate | null {
  if (currentNo == null) return null;
  const pl = players.find((p) => p.no === currentNo);
  if (!pl) return null;
  return privDoc.players[playerId(pl)] ?? null;
}
