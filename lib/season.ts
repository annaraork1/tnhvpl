import type {
  AuctionSettings,
  Config,
  FixtureGenSettings,
  Player,
  RegistrationSettings,
  SeasonStage,
} from "./types";

export const SEASON_STAGES: SeasonStage[] = [
  "registration",
  "auction",
  "fixtures",
  "matches",
  "completed",
];

/** Legacy seasons without `stage` behave as matches (no new locks). */
export function effectiveStage(config: Pick<Config, "stage"> | null | undefined): SeasonStage {
  return config?.stage ?? "matches";
}

export function playerId(p: Pick<Player, "id" | "no">): string {
  return p.id || `p${p.no}`;
}

export const DEFAULT_CONSENT =
  "I consent to participate in this tournament and agree to the organisers' rules.";

export function defaultRegistrationSettings(): RegistrationSettings {
  return {
    open: true,
    consentText: DEFAULT_CONSENT,
    requirePhoto: false,
    guardianConsentUnder: 18,
    skillLevels: ["Beginner", "Intermediate", "Advanced"],
    numbering: "form-order",
  };
}

/** Season 5 auction defaults (flat 100). */
export function defaultAuctionSettings(): AuctionSettings {
  return {
    purse: 10_000,
    minPlayers: 8,
    ownerCountsInSquad: false,
    basePriceBySkill: { Beginner: 100, Intermediate: 100, Advanced: 100 },
    increments: [{ upTo: null, step: 100 }],
    capUntilLeftover: true,
    timerSeconds: 0,
    antiSnipeSeconds: 0,
    autoSellOnTimer: false,
    rebid: { baseMultiplier: 0.5, maxRounds: null },
    finalUnsold: "keep-rebidding",
    drawOrder: "random",
    showPricesPublic: false,
  };
}

/** Tiered increment preset for admin. */
export function tieredAuctionSettings(): AuctionSettings {
  return {
    ...defaultAuctionSettings(),
    increments: [
      { upTo: 1000, step: 100 },
      { upTo: null, step: 200 },
    ],
  };
}

/** Season 5 fixture windows (from fixture-generator notes). */
export function season5FixtureGen(teamOrder: string[] = []): FixtureGenSettings {
  return {
    days: [
      { date: "2026-10-31", label: "Day 1", start: "4:00 PM", end: "10:00 PM" },
      { date: "2026-11-01", label: "Day 2", start: "4:00 PM", end: "10:00 PM" },
    ],
    leagueSlotMinutes: 45,
    playoffSlotMinutes: 60,
    breakBeforePlayoffsMinutes: 0,
    playoffFormat: "qualifier",
    roundRobin: "single",
    teamOrder,
  };
}

/** Closed registration + S5 auction rules for a finished / live match season. */
export function season5WorkflowFields(teamIds: string[] = []): Pick<
  Config,
  "stage" | "stageLog" | "registration" | "auction" | "fixtureGen"
> {
  return {
    stage: "matches",
    stageLog: [
      {
        at: Date.parse("2026-09-20T12:00:00+05:30"),
        from: "registration",
        to: "auction",
        by: "admin",
        note: "Season 5 pool locked (43 players)",
      },
      {
        at: Date.parse("2026-10-15T20:00:00+05:30"),
        from: "auction",
        to: "fixtures",
        by: "admin",
        note: "Auction complete — squads locked",
      },
      {
        at: Date.parse("2026-10-20T12:00:00+05:30"),
        from: "fixtures",
        to: "matches",
        by: "admin",
        note: "Season 5 schedule saved",
      },
    ],
    registration: {
      ...defaultRegistrationSettings(),
      open: false,
      closesAt: Date.parse("2026-09-20T23:59:59+05:30"),
      consentText:
        "I hereby consent for playing and agreeing to the rules of TNHVPL Season 5.",
      requirePhoto: true,
      numbering: "form-order",
    },
    auction: defaultAuctionSettings(),
    fixtureGen: season5FixtureGen(teamIds),
  };
}

export function withWorkflowDefaults(config: Config): Config {
  const teamIds = config.teams?.map((t) => t.id) ?? [];
  // Legacy seasons (no stage): attach S5-style workflow metadata for admin UI.
  if (config.stage == null && (!config.auction || !config.registration)) {
    const s5 = season5WorkflowFields(teamIds);
    return {
      ...config,
      stage: config.stage ?? s5.stage,
      stageLog: config.stageLog ?? s5.stageLog,
      registration: config.registration ?? s5.registration,
      auction: config.auction ?? s5.auction,
      fixtureGen: config.fixtureGen ?? s5.fixtureGen,
    };
  }
  return {
    ...config,
    registration: config.registration ?? defaultRegistrationSettings(),
    auction: config.auction ?? defaultAuctionSettings(),
  };
}

/** True when config should be persisted with backfilled workflow fields. */
export function needsWorkflowBackfill(config: Config): boolean {
  return config.stage == null || config.auction == null || config.registration == null;
}
