# TNHVPL architecture

Phone-first web app for a housing-society volleyball tournament. One site covers a full season: public registration, a live auction, fixture generation, rally-by-rally scoring, standings, playoffs, awards, a venue display, a photo gallery, and casual practice matches. Several seasons can exist at once; one is the active season and the others stay readable as archives.

This file is the map for rebuilding or extending the product. Day-to-day use is in `README.md`. The season-workflow build brief is in `docs/season-workflow/`.

## What is saved where

| Copy | What it holds |
|---|---|
| This git repo | Application code, Season 5 seed (`lib/seed.json`), tests, this architecture |
| Upstash Redis | Live season data: scores, settings, registrations, auction, owner PIN hashes, gallery metadata, practice matches, viewer presence |
| Vercel Blob | Gallery photo bytes (and registration photos when uploaded there) |
| Vercel env vars | PINs and database/blob credentials. Never committed. See `.env.example` |

A fresh clone runs, but it does not contain match-day scores or uploaded photos. Those live only in Redis and Blob. Admin CSV export is `GET /api/export?kind=auction|registrations|squads` with header `x-pin: <ADMIN_PIN>`.

## Stack

- Next.js 15 App Router, React 19, TypeScript. No separate backend.
- Deployed on Vercel (free plan). `npm run build` is the production build.
- Upstash Redis via `@upstash/redis` when `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_*` / `tnhvpl_KV_*` aliases) are set.
- Without those variables the same store API uses an in-memory `Map` on `globalThis`. Fine for `npm run dev`. Data dies on restart and is not shared across serverless instances.
- Photos: `@vercel/blob`. `BLOB_ACCESS=private` (default) or `public`.
- Tests: `npm test` runs `tests/*.test.ts` with Node's built-in test runner. The scoring engine is covered in `tests/engine.test.ts`.

Dev PINs when `NODE_ENV !== "production"` and the env var is unset: admin `1234`, scorer `1111`, auctioneer `2222`, gallery `3333`. Production has no fallback; a missing PIN rejects the role.

## Shape of the system

```
Browsers (spectator, scorer, admin, owner, display, auction)
        │  poll /api/state          POST /api/action  (and a few dedicated routes)
        ▼
Next.js route handlers
        │  load / mutate
        ▼
lib/store.ts  ──compare-and-swap──►  Upstash Redis   (or memory)
lib/engine.ts ◄── derive scores, standings, playoff slots from events
lib/auction.ts, lib/registration.ts, lib/fixtures.ts, lib/galleryStore.ts
```

Spectators never write. Every mutation goes through a server route that checks a PIN and the season stage, then appends an event or replaces one document. The public score, table, and bracket are computed on read. They are not stored as a second source of truth.

## Read path

`GET /api/state?season=<key>` loads one season via `loadState` and returns `AppState`: config, public players, every match document, registry, and whether this view is an archive.

`LiveProvider` polls that endpoint. While any match is live the interval is 1 second; otherwise 3 seconds (`lib/livePoll.ts`). The response is cached at Vercel's edge for about 1 second so a crowd shares one Redis read. Scorer screens add `?fresh=1` and skip that cache.

`computeAll` in `lib/engine.ts` walks fixtures in order. A slot is a fixed team, a league rank, or the winner/loser of an earlier match. Playoff teams appear only after the matches they depend on are finished. League standings are recalculated from those derived results using `settings.points` and `settings.tiebreak`.

Private fields (phone, tower, age, email) never appear on `/api/state`. They live in a separate Redis document.

## Write path

`POST /api/action` with JSON `{ type, ... }` and header `x-pin`. Roles:

| Role | Env var | Can do |
|---|---|---|
| admin | `ADMIN_PIN` | Everything, including stage changes, rules, seasons, auction finish |
| scorer | `SCORER_PIN` | Score a match, set best player |
| auctioneer | `AUCTIONEER_PIN` | Run the auction console (admin can too) |
| owner | per-team PIN, stored as a hash | Bid for that team |
| gallery | `GALLERY_PIN` | Publish gallery photos without waiting for approval |

Owner PINs are salted hashes in `{prefix}:owners`, not env vars. `lib/stageLocks.ts` rejects actions that do not belong to the current season stage unless the caller passes an admin force flag. Legacy seasons with no `stage` field behave as `matches`.

Writes use optimistic concurrency. Each document has `v`. `update()` in `lib/store.ts` reads `v`, applies the change, and commits with a Redis Lua compare-and-swap (or the memory equivalent). A lost race retries. Two courts scoring two matches do not overwrite each other because each match is its own key.

## Event-sourced matches

A match is not a score. It is `MatchDoc`: `{ v, ev[], over?, bestPlayer? }`.

Events (`MatchEvent`):

| `k` | Meaning |
|---|---|
| `start` | First serve side |
| `pt` | Rally won by side A or B (also rotates serve) |
| `adj` | Score correction `+1` or `-1` on one side. Does not change serve |
| `to` | Timeout taken by a side |
| `resume` | Timeout finished |
| `next` | Start the next set |

`derive()` folds `ev` into `MatchState`: set scores, who is serving, timeouts used, whether the deciding set should switch sides, and `scheduled | live | done`. Undo deletes the last event, so it stays exact even after the match is finished. `checkAction()` rejects illegal taps (timeout still running, no timeouts left, point before the next set starts, and so on).

Format comes from settings, separately for league and playoffs (`Format`): best of, points per set (last value repeats), win-by, optional cap, timeouts per set, switch in the decider. Default Season 5: league 21–21–15, playoffs 21–21–25, 2 points for a win and 0 for a loss.

## Season workflow

Stages on `Config.stage`: `registration → auction → fixtures → matches → completed`.

1. **Registration.** Public `POST /api/register`, or admin CSV/XLSX import (`regImport`). Rows are pending / approved / rejected / excluded. `lockRegistration` assigns player numbers and moves the stage to auction.
2. **Auction.** Same event style as matches (`AuctionDoc.ev` in `lib/auction.ts`): draw, reveal, bid, sold, unsold, re-bid rounds, penalties. Projector, purse board, and owner phones all read the derived view. `auctionFinish` (admin only) writes squads onto the teams.
3. **Fixtures.** `lib/fixtures.ts` builds a rest-aware schedule from `fixtureGen` settings. Admin previews, then saves. Playoff slots stay symbolic (`rank`, `winner`, `loser`) until results exist.
4. **Matches.** Scoring as above. When every league match is done, qualifier / eliminator / final teams resolve themselves. Admin can still override a fixture's teams (`over` on the match doc).
5. **Awards** after the final: setter, attacker, server, mvp, emerging. Optional per-match best player feeds MVP suggestions.

`createTournament` clones a season shell (teams kept, players and fixtures cleared, stage reset to registration) or starts blank. The registry key `tnhvpl:registry` lists seasons and which one is active. Archive links are `/s/<key>` and `?season=<key>`.

## Redis keys

Prefix is the tournament key, default `tnhvpl-s5` (`TOURNAMENT_KEY`).

| Key | Document |
|---|---|
| `tnhvpl:registry` | Season list and active key |
| `{prefix}:config` | Tournament, settings, teams, fixtures, players, awards, stage, auction and registration settings |
| `{prefix}:m:{matchId}` | One match's events |
| `{prefix}:private` | Phone, tower, age, email by player id |
| `{prefix}:auction` | Auction event log |
| `{prefix}:owners` | Salt + PIN hash per team |
| `{prefix}:reg:index` and `{prefix}:reg:{id}` | Registration rows |
| `{prefix}:ph:{playerId}` | Player photo reference |
| `{prefix}:gallery:index` and `{prefix}:gallery:{id}` | Gallery metadata (bytes are in Blob) |
| `tnhvpl:practice:index` and practice match keys | Casual matches, not part of a season |
| presence keys | Short-lived viewer heartbeats (`lib/presence.ts`, about 35s TTL) |

## HTTP surface

| Route | Role |
|---|---|
| `GET /api/state` | Public season snapshot |
| `POST /api/action` | All PIN-gated mutations (score, admin, auction, registration review, seasons) |
| `POST /api/register` | Public sign-up while registration is open |
| `GET/POST /api/auction` and `/api/auction/private` | Auction board vs staff/owner detail |
| `GET /api/export` | Admin CSV |
| `GET/POST /api/gallery`, `/upload`, `/moderate`, `/file/[id]` | List, upload, approve, serve bytes |
| `GET /api/photo/[key]/[id]` | Player photo |
| `/api/practice`, `/api/practice/[id]` | Create and score a practice match (host token, not the season PIN) |
| `GET /api/catalog` | Cross-season player catalog |
| `POST /api/presence` | "Watching now" heartbeat |

Action `type` values worth knowing when extending the app: `start`, `point`, `adjust`, `timeout`, `resume`, `undo`, `resetMatch`, `setTeams`, `setBestPlayer`, `saveSettings`, `saveTeams`, `saveFixtures`, `generateFixturesPreview`, `saveGeneratedFixtures`, `saveTournament`, `saveAwards`, `createTournament`, `setActiveTournament`, `updateTournamentMeta`, `resetAll`, `setOwnerPin`, `saveAuctionSettings`, `saveRegistrationSettings`, `setStage`, `listRegistrations`, `regUpdate`, `regImport`, `regAddManual`, `lockRegistration`, `unlockRegistration`, and the `auction*` types listed in `lib/stageLocks.ts`.

## Pages

| Path | Who |
|---|---|
| `/` | Home: live match, table, results, what is next, champion |
| `/fixtures`, `/standings`, `/standings/race` | Schedule, table, bracket, "what if" race |
| `/teams`, `/teams/[id]` | Public squads. Photos obey `settings.showPhotos` |
| `/match/[id]` | One match, shareable |
| `/rules` | Rules rendered from current settings |
| `/awards` | Awards; staff can set them |
| `/seasons`, `/s/[key]` | Season list and archive entry |
| `/display` | Venue TV |
| `/score`, `/score/[id]` | Scorer PIN, one phone per court |
| `/admin`, `/admin/registrations`, `/admin/squads-print` | Organiser |
| `/register` | Public sign-up |
| `/auction/console`, `/projector`, `/board`, `/owner`, `/live` | Auction room |
| `/gallery` | Photos; staff publishes, everyone else submits for approval |
| `/practice`, `/practice/new`, `/practice/[id]` | Unofficial matches |
| `/staff` | Shared PIN entry |

The UI is client components fed by `LiveProvider`. There is no global client store beyond that poll plus `localStorage` for the PIN and the PWA install prompt (`lib/pwaInstall.ts`).

## Module map

| File | Job |
|---|---|
| `lib/types.ts` | All domain types. Start here |
| `lib/engine.ts` | Derive a match, validate a tap, resolve slots, standings |
| `lib/store.ts` | Redis/memory, keys, CAS, load season, create/reset season |
| `lib/season.ts` | Stage list, registration and auction setting defaults |
| `lib/seasonStore.ts` | Registration, private, auction, owner documents |
| `lib/auction.ts` | Fold auction events into the live board (purse, max bid, sold) |
| `lib/registration.ts` | Import, duplicates, numbering, lock |
| `lib/fixtures.ts` | Rest-aware generator |
| `lib/stageLocks.ts` | Which actions each stage allows |
| `lib/defaults.ts`, `lib/seed.json` | Season 5 teams, players, fixtures |
| `lib/tournaments.ts` | Registry and key rules (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–40 chars) |
| `lib/galleryStore.ts` | Gallery index in Redis, bytes in Blob, cap of 80 published photos |
| `lib/practiceStore.ts` | Practice matches and host-token auth |
| `lib/raceWhatIf.ts` | Standings race calculator |
| `lib/awards.ts` | Award ids and normalisation |
| `components/LiveProvider.tsx` | Spectator/scorer polling |
| `app/api/action/route.ts` | The write API. Large on purpose: one gate for PIN + stage + CAS |

## Rules that are easy to break

- Do not store a computed score. Append an event and let `derive` / `computeAll` rebuild it.
- Do not put private registration fields on `AppState` or `/api/state`.
- Do not write a season document without `update()` / CAS. A plain SET drops concurrent scorers.
- Changing points or the format recomputes every match already scored. Settle the format before the first rally, and points rules before playoffs, because the bracket follows the table.
- Gallery bytes and Redis metadata must stay in step. Deleting a photo removes both.
- `.env*` is gitignored. PINs, Redis tokens, and Blob tokens stay in Vercel env vars (or a local `.env` that is never committed).

## Run and restore the code

```bash
npm install
npm test
npm run dev          # http://localhost:3000
```

The saved code copy is the GitHub repo this folder already tracks. To put it on Vercel again: import the repo, attach Upstash Redis and (optional) Blob, set `ADMIN_PIN`, `SCORER_PIN`, `AUCTIONEER_PIN`, and optional `GALLERY_PIN`, then redeploy. An orange "Demo mode" bar means Redis is not connected.

To start another season inside a running site: Admin → create/clone tournament. That does not need a new deploy. The clone keeps team shells, clears players and fixtures, and opens at registration.
