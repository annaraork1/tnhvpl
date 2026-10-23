import type { SeasonStage } from "./types";
import { effectiveStage } from "./season";

/** Actions blocked when season is in a given stage (unless admin force/override). */
const BLOCKED: Record<SeasonStage, Set<string>> = {
  registration: new Set([
    ...auctionActions(),
    "generateFixturesPreview",
    "saveGeneratedFixtures",
    "start",
    "point",
    "timeout",
    "resume",
    "nextSet",
    "undo",
  ]),
  auction: new Set([
    "generateFixturesPreview",
    "saveGeneratedFixtures",
    "start",
    "point",
    "timeout",
    "resume",
    "nextSet",
    "undo",
  ]),
  fixtures: new Set([...auctionActions()]),
  matches: new Set([...auctionActions(), "lockRegistration", "regImport", "regAddManual"]),
  completed: new Set([
    ...auctionActions(),
    "lockRegistration",
    "regImport",
    "regAddManual",
    "generateFixturesPreview",
    "saveGeneratedFixtures",
  ]),
};

function auctionActions() {
  return [
    "auctionStart",
    "auctionDraw",
    "auctionReveal",
    "auctionBid",
    "auctionSold",
    "auctionUnsold",
    "auctionUndo",
    "auctionFix",
    "auctionNextRound",
    "auctionPause",
    "auctionResume",
    "auctionPenalty",
    "auctionFinish",
  ];
}

const ALWAYS_OK = new Set([
  "checkPin",
  "ownerPinStatus",
  "setOwnerPin",
  "clearOwnerPin",
  "setStage",
  "saveAuctionSettings",
  "saveRegistrationSettings",
  "saveSettings",
  "saveTeams",
  "saveTournament",
  "saveAwards",
  "createTournament",
  "setActiveTournament",
  "updateTournamentMeta",
  "listRegistrations",
  "regUpdate",
  "unlockRegistration",
  "resetAll",
  "resetMatch",
  "setTeams",
  "setBestPlayer",
  "saveFixtures",
]);

export function stageBlocksAction(
  config: { stage?: SeasonStage },
  type: string,
  opts?: { force?: boolean },
): string | null {
  if (opts?.force) return null;
  if (ALWAYS_OK.has(type)) return null;
  const stage = effectiveStage(config);
  const blocked = BLOCKED[stage];
  if (blocked?.has(type)) {
    return `Action "${type}" is locked in the ${stage} stage. Reopen the stage or confirm an admin override.`;
  }
  if (
    (stage === "auction" || stage === "fixtures" || stage === "matches" || stage === "completed") &&
    (type === "regImport" || type === "regAddManual" || type === "lockRegistration")
  ) {
    return `Registration changes are locked in the ${stage} stage.`;
  }
  return null;
}
