import type { AuctionEvent, AuctionSettings, Player, Team } from "./types";

export type AuctionStatus =
  | "not-started"
  | "drawing"
  | "revealed"
  | "bidding"
  | "paused"
  | "round-complete"
  | "complete";

export interface AuctionBid {
  teamId: string;
  amount: number;
  by: "owner" | "auctioneer";
  t: number;
}

export interface AuctionTeamState {
  bought: number;
  spent: number;
  balance: number;
  slotsToMin: number;
  maxBid: number;
  eligible: boolean;
  reason?: string;
  squad: { no: number; amount: number; round: number }[];
}

export interface AuctionState {
  status: AuctionStatus;
  round: number;
  pool: number[];
  unsold: number[];
  sold: Record<number, { teamId: string; amount: number; round: number }>;
  current?: {
    no: number;
    revealed: boolean;
    /** Base for this round (skill × rebid rules), set at draw. */
    openingBase: number;
    highBid?: AuctionBid;
    bids: AuctionBid[];
    timerEndsAt?: number;
  };
  teams: Record<string, AuctionTeamState>;
  leftoverStage: boolean;
  leftover: number;
}

export function leftoverCount(poolSize: number, teams: number, minPlayers: number): number {
  return poolSize - teams * minPlayers;
}

export function maxBidFor(balance: number, bought: number, minPlayers: number, minBase: number): number {
  const slotsToMin = Math.max(0, minPlayers - bought);
  return slotsToMin > 0 ? balance - minBase * (slotsToMin - 1) : balance;
}

export function stepForAmount(
  amount: number,
  increments: AuctionSettings["increments"],
): number {
  for (const tier of increments) {
    if (tier.upTo === null || amount < tier.upTo) return tier.step;
  }
  return increments[increments.length - 1]?.step ?? 100;
}

/** True when `amount` is reachable by successive steps from `from` (or from base when opening). */
export function isValidBidAmount(
  amount: number,
  from: number | null,
  base: number,
  increments: AuctionSettings["increments"],
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (from == null) {
    if (amount < base) return false;
    let a = base;
    if (amount === a) return true;
    while (a < amount) {
      a += stepForAmount(a, increments);
      if (a === amount) return true;
      if (a > amount) return false;
    }
    return false;
  }
  if (amount <= from) return false;
  let a = from;
  while (a < amount) {
    a += stepForAmount(a, increments);
    if (a === amount) return true;
    if (a > amount) return false;
  }
  return false;
}

export function minBasePrice(settings: AuctionSettings): number {
  const vals = Object.values(settings.basePriceBySkill);
  return vals.length ? Math.min(...vals) : 100;
}

export function basePrice(player: Player, settings: AuctionSettings, round: number): number {
  const skillBase = settings.basePriceBySkill[player.skill] ?? minBasePrice(settings);
  let p = skillBase * (round > 1 ? settings.rebid.baseMultiplier : 1);
  if (settings.rebid.floorPrice != null) p = Math.max(p, settings.rebid.floorPrice);
  const step = stepForAmount(0, settings.increments);
  if (step <= 0) return Math.ceil(p);
  return Math.ceil(p / step) * step;
}

function playerByNo(players: Player[], no: number): Player | undefined {
  return players.find((p) => p.no === no);
}

function emptyTeamState(purse: number, minPlayers: number, minBase: number): AuctionTeamState {
  return {
    bought: 0,
    spent: 0,
    balance: purse,
    slotsToMin: Math.max(0, minPlayers),
    maxBid: maxBidFor(purse, 0, minPlayers, minBase),
    eligible: true,
    squad: [],
  };
}

function refreshTeamDerived(
  t: AuctionTeamState,
  settings: AuctionSettings,
  leftoverStage: boolean,
  leftover: number,
): void {
  const minBase = minBasePrice(settings);
  t.slotsToMin = Math.max(0, settings.minPlayers - t.bought);
  t.maxBid = maxBidFor(t.balance, t.bought, settings.minPlayers, minBase);
  t.reason = undefined;
  t.eligible = true;

  if (settings.maxPlayers != null && t.bought >= settings.maxPlayers) {
    t.eligible = false;
    t.reason = `Squad full (${settings.maxPlayers} max)`;
    return;
  }
  if (settings.capUntilLeftover && t.bought >= settings.minPlayers && !leftoverStage) {
    t.eligible = false;
    t.reason = `Full until the last ${leftover} players`;
    return;
  }
  if (t.maxBid < 0) {
    t.eligible = false;
    t.reason = "Insufficient purse for minimum squad";
  }
}

function notSoldCount(st: Pick<AuctionState, "sold">, poolSize: number): number {
  return poolSize - Object.keys(st.sold).length;
}

function applySold(
  st: AuctionState,
  no: number,
  teamId: string,
  amount: number,
  round: number,
  settings: AuctionSettings,
): void {
  st.sold[no] = { teamId, amount, round };
  const tm = st.teams[teamId];
  if (tm) {
    tm.bought++;
    tm.spent += amount;
    tm.balance -= amount;
    tm.squad.push({ no, amount, round });
  }
}

function removeFromSquad(tm: AuctionTeamState, no: number): { amount: number; round: number } | null {
  const i = tm.squad.findIndex((s) => s.no === no);
  if (i < 0) return null;
  const [row] = tm.squad.splice(i, 1);
  tm.bought--;
  tm.spent -= row.amount;
  tm.balance += row.amount;
  return row;
}

function computeStatus(
  st: AuctionState,
  paused: boolean,
  started: boolean,
  poolSize: number,
  settings: AuctionSettings,
): AuctionStatus {
  if (!started) return "not-started";
  if (paused) return "paused";
  if (Object.keys(st.sold).length >= poolSize) return "complete";
  if (
    settings.rebid.maxRounds != null &&
    st.round >= settings.rebid.maxRounds &&
    settings.finalUnsold !== "keep-rebidding" &&
    !st.current &&
    st.pool.length === 0
  ) {
    return "complete";
  }
  if (!st.current && st.pool.length === 0 && st.unsold.length > 0) return "round-complete";
  if (!st.current) return "drawing";
  if (!st.current.revealed) return "drawing";
  if (st.current.highBid) return "bidding";
  return "revealed";
}

function recomputeLeftoverStage(st: AuctionState, poolSize: number): boolean {
  return notSoldCount(st, poolSize) <= st.leftover;
}

function refreshAllTeams(st: AuctionState, settings: AuctionSettings): void {
  for (const tm of Object.values(st.teams)) {
    refreshTeamDerived(tm, settings, st.leftoverStage, st.leftover);
  }
}

/** Replays the auction event log into current state. Invalid events are skipped. */
export function deriveAuction(
  ev: AuctionEvent[],
  settings: AuctionSettings,
  teams: Team[],
  players: Player[],
): AuctionState {
  const poolSize = players.length;
  const leftover = leftoverCount(poolSize, teams.length, settings.minPlayers);
  const minBase = minBasePrice(settings);
  const teamIds = teams.map((t) => t.id);

  const st: AuctionState = {
    status: "not-started",
    round: 0,
    pool: players.map((p) => p.no),
    unsold: [],
    sold: {},
    teams: Object.fromEntries(
      teamIds.map((id) => [id, emptyTeamState(settings.purse, settings.minPlayers, minBase)]),
    ),
    leftoverStage: poolSize <= leftover,
    leftover,
  };

  let started = false;
  let paused = false;

  for (const e of ev) {
    if (e.k === "start") {
      if (started) continue;
      started = true;
      st.round = 1;
      st.pool = players.map((p) => p.no);
      st.unsold = [];
      st.sold = {};
      st.current = undefined;
      for (const id of teamIds) st.teams[id] = emptyTeamState(settings.purse, settings.minPlayers, minBase);
      st.leftoverStage = poolSize <= leftover;
      refreshAllTeams(st, settings);
      continue;
    }
    if (!started) continue;

    if (e.k === "pause") {
      paused = true;
      continue;
    }
    if (e.k === "resume") {
      paused = false;
      continue;
    }

    if (e.k === "draw") {
      if (st.current) continue;
      const idx = st.pool.indexOf(e.no);
      if (idx < 0) continue;
      st.pool.splice(idx, 1);
      if (e.round > 0) st.round = e.round;
      const pl = playerByNo(players, e.no);
      const openingBase = pl ? basePrice(pl, settings, st.round) : minBasePrice(settings);
      st.current = { no: e.no, revealed: false, openingBase, bids: [] };
      continue;
    }

    if (e.k === "reveal") {
      if (!st.current || st.current.revealed) continue;
      st.current.revealed = true;
      if (settings.timerSeconds > 0) {
        st.current.timerEndsAt = e.t + settings.timerSeconds * 1000;
      }
      continue;
    }

    if (e.k === "bid") {
      if (!st.current || !st.current.revealed || st.current.no !== e.no) continue;
      if (paused) continue;
      const bid: AuctionBid = { teamId: e.teamId, amount: e.amount, by: e.by, t: e.t };
      st.current.bids.push(bid);
      st.current.highBid = bid;
      if (
        st.current.timerEndsAt != null &&
        settings.antiSnipeSeconds > 0 &&
        st.current.timerEndsAt - e.t <= settings.antiSnipeSeconds * 1000
      ) {
        st.current.timerEndsAt = e.t + settings.antiSnipeSeconds * 1000;
      }
      continue;
    }

    if (e.k === "sold") {
      if (!st.current || st.current.no !== e.no || !st.current.highBid) continue;
      const { teamId, amount } = st.current.highBid;
      const round = st.round;
      st.current = undefined;
      applySold(st, e.no, teamId, amount, round, settings);
      st.leftoverStage = recomputeLeftoverStage(st, poolSize);
      refreshAllTeams(st, settings);
      continue;
    }

    if (e.k === "unsold") {
      if (!st.current || st.current.no !== e.no) continue;
      st.unsold.push(e.no);
      st.current = undefined;
      st.leftoverStage = recomputeLeftoverStage(st, poolSize);
      refreshAllTeams(st, settings);
      continue;
    }

    if (e.k === "nextRound") {
      if (st.current) continue;
      if (st.pool.length > 0 || st.unsold.length === 0) continue;
      st.pool = [...st.unsold];
      st.unsold = [];
      st.round++;
      st.leftoverStage = recomputeLeftoverStage(st, poolSize);
      refreshAllTeams(st, settings);
      continue;
    }

    if (e.k === "penalty") {
      const sale = st.sold[e.no];
      if (!sale || sale.teamId !== e.teamId) continue;
      const tm = st.teams[e.teamId];
      if (!tm) continue;
      // Release to pool with no refund: drop from squad/bought, purse stays spent.
      const i = tm.squad.findIndex((s) => s.no === e.no);
      if (i >= 0) tm.squad.splice(i, 1);
      tm.bought = Math.max(0, tm.bought - 1);
      delete st.sold[e.no];
      if (!st.pool.includes(e.no) && !st.unsold.includes(e.no) && st.current?.no !== e.no) {
        st.pool.push(e.no);
      }
      st.leftoverStage = recomputeLeftoverStage(st, poolSize);
      refreshAllTeams(st, settings);
      continue;
    }

    if (e.k === "fix") {
      const no = e.no;
      if (st.current?.no === no) st.current = undefined;
      st.pool = st.pool.filter((n) => n !== no);
      st.unsold = st.unsold.filter((n) => n !== no);
      const prev = st.sold[no];
      if (prev) {
        const tm = st.teams[prev.teamId];
        if (tm) removeFromSquad(tm, no);
        delete st.sold[no];
      }
      if (e.to.status === "sold") {
        applySold(st, no, e.to.teamId, e.to.amount, st.round || 1, settings);
      } else if (e.to.status === "unsold") {
        st.unsold.push(no);
      } else {
        st.pool.push(no);
      }
      st.leftoverStage = recomputeLeftoverStage(st, poolSize);
      refreshAllTeams(st, settings);
      continue;
    }
  }

  st.leftoverStage = recomputeLeftoverStage(st, poolSize);
  refreshAllTeams(st, settings);
  st.status = computeStatus(st, paused, started, poolSize, settings);
  return st;
}

/** Quick-raise and minimum typed bid for the current player (teamId reserved for UI). */
export function nextBidAmounts(
  state: AuctionState,
  settings: AuctionSettings,
  _teamId: string,
): { quick: number; min: number } {
  void _teamId;
  const high = state.current?.highBid?.amount ?? null;
  if (high == null) {
    const min = state.current?.openingBase ?? minBasePrice(settings);
    return { quick: min, min };
  }
  const quick = high + stepForAmount(high, settings.increments);
  return { quick, min: quick };
}

function teamName(teams: Team[], id: string): string {
  return teams.find((t) => t.id === id)?.name ?? id;
}

/** Pick the next pool number according to drawOrder. `randomInt(max)` returns [0, max). */
export function pickDrawNumber(
  pool: number[],
  players: Player[],
  drawOrder: AuctionSettings["drawOrder"],
  randomInt: (max: number) => number,
): number {
  if (!pool.length) throw new Error("Pool is empty");
  if (drawOrder === "sequential") return Math.min(...pool);
  if (drawOrder === "by-skill") {
    const rank = (skill: string) =>
      skill === "Advanced" ? 0 : skill === "Intermediate" ? 1 : 2;
    let best = 99;
    const candidates: number[] = [];
    for (const no of pool) {
      const pl = playerByNo(players, no);
      const r = rank(pl?.skill ?? "Beginner");
      if (r < best) {
        best = r;
        candidates.length = 0;
        candidates.push(no);
      } else if (r === best) {
        candidates.push(no);
      }
    }
    return candidates[randomInt(candidates.length)]!;
  }
  return pool[randomInt(pool.length)]!;
}

/** Validates an auction action against the current state; returns an error message or null. */
export function checkAuctionEvent(
  ev: AuctionEvent[],
  settings: AuctionSettings,
  teams: Team[],
  players: Player[],
  e: AuctionEvent,
  expect?: { no: number; highAmount: number },
): string | null {
  const st = deriveAuction(ev, settings, teams, players);

  if (e.k === "start") {
    return st.status === "not-started" ? null : "Auction already started";
  }
  if (st.status === "not-started") return "Start the auction first";
  if (st.status === "complete") return "Auction is complete";

  if (e.k === "pause") {
    return st.status === "paused" ? "Already paused" : null;
  }
  if (e.k === "resume") {
    return st.status === "paused" ? null : "Not paused";
  }

  if (e.k === "nextRound") {
    if (st.status !== "round-complete") return "Round is not complete";
    if (settings.rebid.maxRounds != null && st.round >= settings.rebid.maxRounds) {
      return "Maximum re-bid rounds reached";
    }
    return null;
  }

  if (e.k === "draw") {
    if (st.status === "paused") return "Auction is paused";
    if (st.status === "round-complete") return "Start the next round first";
    if (st.current) return "Finish the current player first";
    if (!st.pool.includes(e.no)) return "Player is not in the pool";
    if (e.round !== st.round) return `Draw must be for round ${st.round}`;
    return null;
  }

  if (e.k === "reveal") {
    if (st.status === "paused") return "Auction is paused";
    if (!st.current) return "No player drawn";
    if (st.current.revealed) return "Already revealed";
    return null;
  }

  if (e.k === "bid") {
    if (st.status === "paused") return "Auction is paused";
    if (!st.current) return "No player on the block";
    if (!st.current.revealed) return "Reveal the player first";
    if (st.current.no !== e.no) return "Bid is for a different player";
    if (st.current.timerEndsAt != null && e.t > st.current.timerEndsAt) return "Bidding time is over";

    if (e.by === "owner" && expect) {
      const highAmt = st.current.highBid?.amount ?? 0;
      if (expect.no !== st.current.no || expect.highAmount !== highAmt) {
        if (st.current.highBid) {
          return `Outbid: current bid is ${st.current.highBid.amount} by ${teamName(teams, st.current.highBid.teamId)}`;
        }
        return "Outbid: auction state changed";
      }
    }

    const tm = st.teams[e.teamId];
    if (!tm) return "Unknown team";
    if (!tm.eligible) return tm.reason ?? "Team is not eligible";
    if (st.current.highBid?.teamId === e.teamId) return "Cannot outbid yourself";

    const pl = playerByNo(players, e.no);
    if (!pl) return "Unknown player";
    const base = basePrice(pl, settings, st.round);
    const high = st.current.highBid?.amount ?? null;

    if (high == null) {
      if (e.amount < base) return `Opening bid must be at least ${base}`;
    } else if (e.amount <= high) {
      const next = high + stepForAmount(high, settings.increments);
      return `Bid must be greater than ${high}; next valid is ${next}`;
    }

    if (!isValidBidAmount(e.amount, high, base, settings.increments)) {
      const next =
        high == null ? base : high + stepForAmount(high, settings.increments);
      return `Invalid amount; next valid bid is ${next}`;
    }

    if (e.amount > tm.maxBid) return `Bid exceeds max bid of ${tm.maxBid}`;
    return null;
  }

  if (e.k === "sold") {
    if (st.status === "paused") return "Auction is paused";
    if (!st.current) return "No player on the block";
    if (st.current.no !== e.no) return "Sold is for a different player";
    if (!st.current.highBid) return "Sold requires a bid";
    return null;
  }

  if (e.k === "unsold") {
    if (st.status === "paused") return "Auction is paused";
    if (!st.current) return "No player on the block";
    if (st.current.no !== e.no) return "Unsold is for a different player";
    // No bids → always OK. With bids → auctioneer may still mark unsold (API enforces role).
    return null;
  }

  if (e.k === "penalty") {
    const sale = st.sold[e.no];
    if (!sale) return "Player is not sold";
    if (sale.teamId !== e.teamId) return "Player is not on that team";
    return null;
  }

  if (e.k === "fix") {
    if (!playerByNo(players, e.no)) return "Unknown player";
    if (e.to.status === "sold") {
      if (!st.teams[e.to.teamId]) return "Unknown team";
      if (e.to.amount <= 0) return "Amount must be positive";
    }
    return null;
  }

  return null;
}
