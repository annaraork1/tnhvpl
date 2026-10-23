# Cursor prompt: season workflow (Registration → Auction → Fixtures → Matches)

> Paste everything below the line into Cursor **Agent** (start in **Plan** mode). Attach the files listed in "Context to attach". Build it phase by phase, not in one go.

---

You are working in the **TNHVPL app**: Next.js 15 App Router, TypeScript, React 19, Upstash Redis (in-memory fallback for dev), deployed on Vercel. It already handles live volleyball scoring, fixtures, standings, playoffs, awards, a global Practice area and **multiple seasons keyed by a tournament key**.

Add the steps that come **before** the matches, so a whole season runs in the app:

**1. Registration → 2. Auction (draw + live bidding) → 3. Fixtures → 4. Matches**

Each stage is locked once the season moves on, and the admin can override that. Every auction rule is configurable **per season** by the admin.

## 0. How to work

1. **Plan first.** Read the attached files, then write a plan to `.cursor/plans/season_workflow_auction.plan.md` in the same format as `@.cursor/plans/quick_match_practice_2ffbc6f9.plan.md` (frontmatter todos, "Decisions locked in", data model, isolation rules). Stop and show me the plan before writing code.
2. **Then implement one phase at a time** (section 12). After each phase:
   - `npm test` and `npm run build` pass;
   - existing features still work (scoring, practice, seasons, awards, `?season=` archive links);
   - give a short summary of what changed and how I can try it.
3. **Follow the existing patterns.** Don't invent new ones:
   - Storage: `lib/store.ts`, with `readRaw`, `update()` (CAS with a Lua script, versioned docs `{ v }`), `ActionError`, the memory fallback and the `KV_*` / `UPSTASH_*` / `tnhvpl_KV_*` env names.
   - Season scoping: `resolveTournamentKey`, `loadState(season)`, keys `{tournamentKey}:…`, `?season=` via `seasonHref`/`withSeason` in `LiveProvider`, and `body.season` on actions.
   - Separate namespace per feature, like `lib/practiceStore.ts` (`tnhvpl:practice:*`). Auction and registration data live under the **season** prefix, never in `{key}:config` except where stated below.
   - Pure logic in `lib/*.ts` with unit tests in `tests/*.test.ts` (`node --experimental-strip-types --test`), the way `lib/engine.ts` is event-sourced and tested.
   - UI: reuse the `app/globals.css` tokens and classes (`card`, `btn gold`, `pill`, `kicker`, `mrow`, `skill Advanced|Intermediate|Beginner`, `.scorer` full-screen pattern), the `Loading` / `PinGate` / `StaffLogin` components, `ProcessingBar` and `lib/confirm.ts`. Phone first.
   - Images: resize client-side like `lib/logoUpload.ts` (`fileToLogoDataUrl`).
4. **No breaking changes** to existing seasons. `tnhvpl-s5` already has teams, squads and fixtures and must keep working (section 10).
5. **Dependencies:** pin exact versions. For `.xlsx` import, prefer the official SheetJS tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) over the outdated npm `xlsx` package. Use `jszip` only if needed for photo-zip import. Nothing else heavy.

## 1. Decisions locked in

- **Stages per season:** `registration → auction → fixtures → matches → completed`.
  - Moving forward locks the earlier stage.
  - Admin can **reopen** a stage, with a confirmation that says what will be affected.
  - Every stage change is written to a season audit log.
- **Players enter the season three ways, all of them supported:**
  1. Public sign-up form (pending until the admin approves).
  2. Excel/CSV import of the Google Form export, with column mapping, include/exclude per row, and duplicate detection.
  3. Admin adds and edits by hand, including reusing players from the existing master catalog (`/api/catalog`).
- **Owners** are per team, **not** in the player pool by default, and are never bid on. A setting decides whether the owner counts towards squad size.
- **Bidding is live in the app:**
  - The **auctioneer** can record a bid for any team (room auction).
  - **Owners bid from their phones**, either with a "+ increment" quick-raise button or by typing an amount.
  - The server validates every bid against the rules and rejects stale or illegal bids with a clear message.
  - The auctioneer (or admin) confirms **SOLD** or **UNSOLD**. Auto-sell when the timer ends is an optional setting, off by default.
- **All auction rules are per-season settings** (section 4). The Season 5 values are the defaults when cloning from `tnhvpl-s5`. See `@docs/season-workflow/reference/season5-auction-rules.md`.
- **Draw:** random, server-side (`crypto.randomInt`), from the remaining pool. The number stays hidden until "Reveal". Re-bid rounds draw only the unsold players. Corrections and undo are supported. Port the UX from `@docs/season-workflow/reference/auction-draw-reference.html`.
- **Roles:**
  - `admin`, `scorer` (existing).
  - **`auctioneer`** (new): runs the auction console and projector. `AUCTIONEER_PIN` env var; the admin PIN also works.
  - **`owner`** (new): a **PIN per team per season**, set by the admin and stored **hashed** (scrypt or SHA-256 with a per-season salt). An owner only ever acts for their own team.
- **Privacy:** phone, tower/flat, age, email, availability and contribution are **private**.
  - Visible to **admin, auctioneer, owners (logged in) and the projector card** (the projector is a staff-logged-in screen).
  - **Never** included in `/api/state` or any public or edge-cached response.
  - Public pages show name, photo, skill and team only.
  - Auction prices are visible on the auction screens while it runs. After the auction, public team pages hide prices unless the season setting `showPricesPublic` is on (default off).
- **Fixtures:** auto-generated from settings with rest optimisation, then editable. See `@docs/season-workflow/reference/fixture-generator-notes.md`. Saved into the existing `config.fixtures` shape, so scoring, standings and playoffs keep working unchanged.

## 2. Data model

Add to `lib/types.ts` (names are suggestions; keep the style consistent).

```ts
export type SeasonStage = "registration" | "auction" | "fixtures" | "matches" | "completed";

// Config gains (all optional for back-compat):
//   stage?: SeasonStage                 // missing => "matches" for legacy seasons
//   stageLog?: { at: number; from: SeasonStage; to: SeasonStage; by: string; note?: string }[]
//   registration?: RegistrationSettings
//   auction?: AuctionSettings
//   fixtureGen?: FixtureGenSettings      // last used generator inputs

export interface Player {               // existing public shape, extended
  no: number;                           // auction number (assigned when registration is locked); squads keep using `no`
  id?: string;                          // stable id (e.g. "p_" + nanoid); legacy players get "p" + no
  name: string; skill: string; photo: string | null; team?: string;
}

export interface PlayerPrivate {        // NEVER in /api/state
  id: string; phone: string; tower: string; age: string; email?: string;
  available?: "Yes" | "No" | ""; contribution?: string; notes?: string;
  source: "signup" | "import" | "admin"; sourceRow?: number; photoRef?: string; // e.g. original Drive link
}

export interface RegistrationEntry {    // one per sign-up/import row
  id: string; createdAt: number; status: "pending" | "approved" | "rejected" | "excluded";
  excludeReason?: string; dupOf?: string;
  name: string; skill: "Beginner" | "Intermediate" | "Advanced"; photo: string | null;
  priv: Omit<PlayerPrivate, "id">;
  guardianConsent?: boolean; consentAt?: number;
}

export interface RegistrationSettings {
  open: boolean; closesAt?: number; consentText: string;
  requirePhoto: boolean; minAge?: number; guardianConsentUnder?: number; // e.g. 18
  skillLevels: string[];               // default ["Beginner","Intermediate","Advanced"]
  numbering: "form-order" | "random" | "by-skill";  // how auction numbers are assigned on lock
}

export interface AuctionSettings {
  purse: number;                       // 10000
  minPlayers: number;                  // 8 (owner not counted)
  maxPlayers?: number;                 // optional hard cap even in the leftover stage
  ownerCountsInSquad: boolean;         // false (Season 5)
  basePriceBySkill: Record<string, number>;    // { Beginner:100, Intermediate:100, Advanced:100 }
  increments: { upTo: number | null; step: number }[]; // [{upTo:null, step:100}] or tiers, e.g. [{upTo:1000,step:100},{upTo:null,step:200}]
  capUntilLeftover: boolean;           // true: teams at minPlayers are locked until leftover stage
  timerSeconds: number;                // 0 = off
  antiSnipeSeconds: number;            // add time on late bids (0 = off)
  autoSellOnTimer: boolean;            // false
  rebid: { baseMultiplier: number; maxRounds: number | null; floorPrice?: number }; // e.g. 0.5 → half base in later rounds
  finalUnsold: "keep-rebidding" | "assign-by-draw" | "leave-unsold";  // Season 5: keep-rebidding
  drawOrder: "random" | "sequential" | "by-skill";
  showPricesPublic: boolean;           // false
}

export type AuctionEvent =
  | { k: "start"; t: number; by: string }
  | { k: "draw"; no: number; round: number; t: number; by: string }   // server-chosen random no
  | { k: "reveal"; t: number }
  | { k: "bid"; no: number; teamId: string; amount: number; by: "owner" | "auctioneer"; t: number }
  | { k: "sold"; no: number; t: number; by: string }                   // to current leader at current price
  | { k: "unsold"; no: number; t: number; by: string }
  | { k: "fix"; no: number; to: { status: "sold"; teamId: string; amount: number } | { status: "unsold" } | { status: "pool" }; t: number; by: string }
  | { k: "nextRound"; t: number; by: string }
  | { k: "pause" | "resume"; t: number; by: string }
  | { k: "penalty"; teamId: string; no: number; t: number; by: string }; // rule 7: release highest-bid player, no refund
export interface AuctionDoc { v: number; ev: AuctionEvent[]; startedAt?: number; completedAt?: number; }
```

**Redis keys** (all under the season prefix; add helpers in `lib/store.ts` or a new `lib/seasonStore.ts`):

| Key | Contents | Public? |
|---|---|---|
| `{key}:config` | existing + `stage`, `stageLog`, `registration`, `auction`, `fixtureGen`, `players` (public fields only) | yes (via `/api/state`) |
| `{key}:private` | `{ v, players: Record<id, PlayerPrivate> }` | **no** |
| `{key}:reg:index` + `{key}:reg:{id}` | registration entries (one doc each; keeps each value small) | **no** |
| `{key}:auction` | `AuctionDoc` (event log; CAS on every write) | derived public view only |
| `{key}:owners` | `{ v, salt, teams: Record<teamId, { pinHash, updatedAt }> }` | **no** |
| `{key}:ph:{playerId}` | photo data URL (resized to 320px, about 30 KB) | served by `/api/photo` |

**Photos:** today photos are data URLs inside `{key}:config`. With 40–60 registrations that one Redis value gets too large and slows every `/api/state` poll. Store new player photos in `{key}:ph:{id}` and set `player.photo = "/api/photo/{key}/{id}?v={hash}"` (route returns the image with `Cache-Control: public, max-age=31536000, immutable`). Existing data-URL and `/players/*.jpg` photos keep working as they are.

## 3. Auction engine (`lib/auction.ts`, pure, event-sourced like `lib/engine.ts`)

`deriveAuction(ev, settings, teams, players) → AuctionState`:

- `status`: `not-started | drawing | revealed | bidding | paused | round-complete | complete`.
- `round`, `pool` (not drawn this round), `unsold`, `sold: Record<no, { teamId, amount, round }>`, `current?: { no, revealed, highBid?: { teamId, amount, by, t }, bids: [...] , timerEndsAt? }`.
- Per team: `bought`, `spent`, `balance`, `slotsToMin`, `maxBid`, `eligible` (and `reason` when not), `squad[]`.
- `leftoverStage: boolean`, where `leftover = poolSize − teams × minPlayers`, and the stage starts when `notSoldCount ≤ leftover`.
- `nextBidAmounts(teamId)`: the legal quick-raise amount (current + step from the tier table), and the minimum valid amount for a typed bid.

Rules to enforce in `checkAuctionEvent(ev, settings, …, e) → string | null` (server-side, used by the API):

1. **Opening bid** ≥ the player's base price for the current round: `basePriceBySkill[skill] × (round > 1 ? rebid.baseMultiplier : 1)`, rounded to the step, not below `floorPrice`.
2. **Every later bid** > the current high bid, and a valid step from the tier table. A typed amount must land on a step boundary. Say which amount is valid next.
3. **A team cannot outbid itself.** No bids while paused, before reveal, or after the timer ends.
4. **`amount ≤ maxBid`**, where `maxBid = slotsToMin > 0 ? balance − minBase × (slotsToMin − 1) : balance` and `minBase` is the lowest base price across skills. Also respect `maxPlayers`.
5. **Squad cap:** if `capUntilLeftover` and `bought ≥ minPlayers` and not `leftoverStage`, the team is not eligible ("Full until the last N players").
6. **Stale bids:** owner bids include `expect: { no, highAmount }`. If it no longer matches, reject with "Outbid: current bid is 900 by Eagle Squad".
7. **Sold** requires a high bid. **Unsold** is allowed only with no bids, or by the auctioneer explicitly.
8. **Undo** pops the last event (auctioneer/admin only). **`fix`** handles corrections after the fact; it must not break purse rules unless confirmed with `force` by the admin.
9. **Draw** is chosen on the server: a random choice among `pool` (or `unsold` in later rounds), following `drawOrder`.
10. **Round end:** when the pool is empty and `unsold.length > 0`, only `nextRound` is allowed. When everything is sold, or according to `finalUnsold` in the last allowed round, the status is `complete`.

**On complete** (admin confirms "Finish auction & lock squads"):

- write `teams[].squad` and `players[].team` into `{key}:config`;
- set `stage = "fixtures"`;
- make it idempotent and safe to rerun.

## 4. Admin: settings and stage control (`/admin` → new sections, plus a stage bar)

- **Stage bar** at the top of admin: `Registration · Auction · Fixtures · Matches`, showing the current stage, a "Move to next stage" button with a checklist of preconditions (e.g. all teams have owners and owner PINs; pool locked; purses valid), and "Reopen…" with a confirmation.
- **Registration settings:** open/close and close date; consent text; photo required; min age; guardian consent under X; skill levels; numbering mode.
- **Auction settings:** every field in `AuctionSettings`, plus:
  - presets **"Season 5 (flat 100)"** and **"Tiered"**;
  - a **live preview**: "With 43 players and 5 teams: leftover = 3; max opening bid for a team with 0 bought = 9,300".
- **Owner PINs:** per team, set or reset; show "set" or "not set", never the PIN itself.
- **Teams:** keep the existing team editor. The owner name is required before the auction.

## 5. Registration

- **Public `/register?season=key`** (only while `stage === "registration"` and open):
  - fields: name, phone, tower/flat, age, skill, availability (yes/no for the season dates), photo (camera or gallery, resized), consent checkbox, guardian consent when under the threshold;
  - honeypot field plus per-IP rate limiting (store small counters in Redis with a TTL);
  - after submit: "Thanks, the organisers will confirm your place." No private data is shown back.
- **Admin `/admin/registrations`:**
  - table and cards with filters: pending / approved / excluded / rejected / duplicates;
  - approve, exclude (with reason; this replaces the red/green row colouring), reject, edit, merge duplicates;
  - **duplicates** are flagged by the same normalised phone (last 10 digits) or the same name and tower; a resubmission keeps the newest by default;
  - flags: under 18, "Sr citizen" style ages, availability "No", missing photo.
- **Import Excel/CSV** (`@docs/season-workflow/reference/registration-sample.csv` has the exact Google Form headers and the messy cases):
  - upload the file, then map columns (auto-guess from header text; save the mapping in `config.registration` for next time);
  - preview rows with an include checkbox and the issues above;
  - normalise: trim names; Title Case all-caps or all-lower names; `"Begineer" → "Beginner"`; phone to digits (keep `+91` display); tower as text (`"Tower 21042" → "21042"`, keep `"T-4064"`); age as text;
  - Drive photo links can't be fetched (they need the owner's login), so keep the link in `priv.photoRef` and offer:
    1. **photo zip upload** with auto-match on the text after the last `" - "` in the filename (`IMG_123 - Respondent Name.jpg`), flagging anything uncertain;
    2. per-row upload.

    Never guess a match silently.
- **Lock registration:**
  - all approved entries become `config.players` (public fields) plus `{key}:private` (private fields);
  - auction numbers are assigned by `numbering`;
  - `stage = "auction"`.
- **Pick from master catalog:** keep the existing flow for reusing players from past seasons.

## 6. Auction screens (polling every 1 s while the auction is live)

Add `GET /api/auction?season=` (public view, no private fields, `Cache-Control: no-store`, small payload) and `GET /api/auction/private?season=` (role-checked; adds the current player's private details and every player's private details for staff and owners). Writes go through `POST /api/action` with new types (`auctionStart`, `auctionDraw`, `auctionReveal`, `auctionBid`, `auctionSold`, `auctionUnsold`, `auctionUndo`, `auctionFix`, `auctionNextRound`, `auctionPause`, `auctionResume`, `auctionPenalty`, `auctionFinish`, `saveAuctionSettings`, `setOwnerPin`, `setStage`, registration actions…), each with a role check. `checkPin` returns `{ role, teamId? }`. Extend `StaffLogin` with **Auctioneer** and **Owner** (owner picks the team, then enters the PIN).

1. **Auctioneer console `/auction/console`** (auctioneer/admin; laptop or phone):
   - "Draw" → "Reveal" (with the spin animation from the reference) → player card with private details;
   - a bid panel with **one button per team** showing its quick-raise amount, plus a typed-amount field and the team picker; ineligible teams are greyed out with the reason;
   - a live bid feed (owner bids appear instantly, marked "from owner phone");
   - **SOLD** (to the current leader), **UNSOLD**, Pause/Resume, Undo, "Start round N";
   - a 1–N board coloured by team (as in the reference) where tapping a number corrects it;
   - keyboard: Space draw/reveal, `1`–`9` quick-raise for team n, `S` sold, `U` unsold, `Z` undo, `P` pause.
2. **Projector `/auction/projector`** (staff login on the projector laptop; full screen, no nav):
   - the player card styled like `@docs/season-workflow/reference/projector-player-card.png`: photo in a gold ring, "PLAYER #nn", name, skill pill in the skill colour, tower/flat, age, phone;
   - current bid in large type, the leading team's logo and name, and a countdown ring when the timer is on;
   - "SOLD to {team} for {amount}" with the team colour (reuse `Confetti.tsx`); "UNSOLD" state; "Round 2 · re-bid" tag;
   - between players: the purse board.
3. **Live purse board `/auction/board`** (public, read-only; layout from `@docs/season-workflow/reference/live-purse-board.png`):
   - per team: players bought / minimum, balance, players left to buy, **max bid now**, and the squad with prices while `stage === "auction"`;
   - header: "Sold X · Left in pool Y of N · Round R · Leftover stage: open to all teams";
   - must work on a 1080p TV and on a phone.
4. **Owner view `/auction/owner`** (owner PIN):
   - own purse, max bid, slots to minimum, squad;
   - the current player (with private details), current high bid and leader;
   - **"Bid {next amount}"** big button plus a typed-amount input;
   - disabled states with the reason (full until the last N, over max bid, you're leading, paused, not revealed yet);
   - toast and vibrate when outbid.

Bid latency: aim for under 1.5 s from an owner's tap to the projector. Use optimistic UI on the bidder's own screen only, and reconcile with the server response, like the scorer's pending-ops pattern in `app/score/[id]/page.tsx`.

## 7. Fixtures (`lib/fixtures.ts` + admin "Generate fixtures")

- Inputs: days (date, label, start, end), league slot minutes, playoff slot minutes, break before playoffs, playoff format (`qualifier` / `semis` / `final` / `none`), single or double round robin, team order (default: the order teams appear in admin).
- Algorithm and test cases: `@docs/season-workflow/reference/fixture-generator-notes.md`. With 5 teams on one court and 8 consecutive slots, at least 6 short gaps are unavoidable. The generator must minimise back-to-backs (target 0), then short gaps, then the maximum per team, and **show a per-team rest report** before saving.
- **Preview, then edit** (reorder by drag or up/down, change times), then **Save**. This writes `config.fixtures` in the existing `Fixture` shape (playoff slots use `{rank}`, `{winner}`, `{loser}`) and sets `stage = "matches"`.
- Regenerating is blocked once any match has events (admin override with a warning).

## 8. Stage locks (enforced on the server in `/api/action`, not only in the UI)

| Stage | Allowed | Locked |
|---|---|---|
| registration | sign-up, import, edit players, auction settings, teams/owners, owner PINs | auction actions, fixture generation, scoring |
| auction | auction actions, auction settings that don't change completed sales (warn otherwise) | sign-up, player add/remove (admin can still edit names and photos), fixture generation, scoring |
| fixtures | generate and edit fixtures, team names and logos | auction actions, squads (admin override) |
| matches | everything that exists today | auction, registration, regenerating fixtures once scoring has started |

The admin override needs a typed confirmation and is written to `stageLog`.

## 9. Exports

Admin only:

- **Auction results CSV:** player #, name, skill, team, price, round, plus private contact details.
- **Registrations CSV.**
- **Squads by team.**

Add a print-friendly squad sheet.

## 10. Back-compat and migration

- A season with no `stage` is treated as `"matches"`: no lock changes and nothing new required.
- Players without an `id` get `"p" + no` when read. Existing `teams[].squad` (arrays of `no`) stay valid.
- A season created with **clone** from `tnhvpl-s5` copies the auction and registration settings but **not** registrations, private data, the auction log or owner PINs; its stage starts at `"registration"`.
- **Blank** seasons start at `"registration"` with the defaults.
- `/api/state` must keep the same shape for existing clients. Write a test (section 11) proving it contains no private fields.

## 11. Tests (add to `tests/`)

- **`auction.test.ts`:**
  - max bid formula (balance 7,300, 4 bought, min 8, base 100 → 7,000);
  - base price by skill; tiered increments (valid and invalid typed amounts);
  - re-bid base multiplier and floor;
  - cap until leftover (43 players, 5 teams, min 8 → leftover 3; a team at 8 can't bid until 3 remain, then can);
  - cannot outbid yourself; stale-bid rejection; sold requires a bid; undo; corrections;
  - full simulated auction that ends with 9/9/9/8/8 and every purse ≥ 0.
- **`fixtures.test.ts`:** the cases in the fixture notes (5 teams, Season 5 windows → 0 back-to-back, 6 short gaps, max 2 per team; 4 and 6 teams; slots that don't fit → error).
- **`registration.test.ts`:** CSV mapping with the sample file; name/skill/tower/phone normalisation; duplicate detection; photo filename matching.
- **`privacy.test.ts`:** `loadState()` / `/api/state` JSON contains none of `phone`, `tower`, `age`, `email`, PIN hashes; `/api/auction` public view has no private fields.
- Extend `scripts/playoff-e2e.mjs` or add `scripts/season-e2e.mjs`: create a season → import the sample CSV → approve → lock → auction (owners bid from two sessions at once) → finish → generate fixtures → score one match.

## 12. Phases (each phase ends green: tests plus build)

1. **Foundation:**
   - types; stage field and stage bar (read-only);
   - new store helpers and keys;
   - private store and `/api/photo`;
   - roles (`auctioneer`, `owner` with per-team hashed PINs) and `StaffLogin` changes;
   - privacy test.
2. **Registration:** public form, admin review, import (CSV/XLSX + photo zip), lock → players + private data + numbering.
3. **Auction engine:** `lib/auction.ts` + tests (no UI yet).
4. **Auction API and console:** actions, `/api/auction`, `/api/auction/private`, auctioneer console.
5. **Projector, purse board and owner view**, with owners bidding from their phones, timer and anti-snipe.
6. **Finish auction → squads; fixtures generator** + tests + admin preview/edit; stage locks enforced on the server.
7. **Exports, README update** (new env var `AUCTIONEER_PIN`, the season workflow, match-day auction checklist), **end-to-end script.**

## 13. Acceptance (I'll check these)

- I can clone a new season from `tnhvpl-s5`, open registration, sign up from a phone, import the sample CSV, approve and exclude rows, and lock: players get numbers 1–N.
- I can set Season 5 rules or tiered rules. The preview numbers are right.
- Running the auction:
  - draw/reveal works on the console;
  - two owners bidding on two phones at once never end up with an illegal state;
  - the stale bidder sees "Outbid";
  - a full team can't bid until the leftover stage;
  - the projector and purse board update within about 1.5 s;
  - undo and corrections work.
- Finishing the auction fills the squads. Team pages show squads without prices (unless `showPricesPublic` is on).
- The fixture generator produces the Season 5 schedule quality (0 back-to-back, 6 short gaps) and saves fixtures that score and feed standings and playoffs exactly as before.
- `tnhvpl-s5` (legacy, no `stage`) behaves exactly as it does today.
- Public pages and `/api/state` never expose phone, tower, age or PIN data.

## Context to attach

`@lib/types.ts` `@lib/store.ts` `@lib/tournaments.ts` `@lib/defaults.ts` `@lib/catalog.ts` `@lib/logoUpload.ts` `@lib/practiceStore.ts` `@lib/engine.ts` `@app/api/action/route.ts` `@app/api/state/route.ts` `@app/api/catalog/route.ts` `@components/LiveProvider.tsx` `@components/StaffLogin.tsx` `@components/Nav.tsx` `@components/ui.tsx` `@app/admin/page.tsx` `@components/AdminSeasons.tsx` `@app/score/[id]/page.tsx` `@app/globals.css` `@tests/engine.test.ts` `@scripts/playoff-e2e.mjs` `@README.md` `@.cursor/plans/quick_match_practice_2ffbc6f9.plan.md`

`@docs/season-workflow/reference/season5-auction-rules.md` `@docs/season-workflow/reference/fixture-generator-notes.md` `@docs/season-workflow/reference/registration-sample.csv` `@docs/season-workflow/reference/auction-draw-reference.html` and the images `projector-player-card.png`, `live-purse-board.png`, `auction-draw-screen.png`, `season5-auction-rules-slide.png`.
