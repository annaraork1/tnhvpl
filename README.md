# TNHVPL Season 5 — Live Scoring App

A phone-first web app for the TNH Volleyball tournament: live scoring, fixtures, an automatic points table, playoffs, team squads and a big-screen view. It is built with Next.js and runs on Vercel's free plan with a free Upstash Redis database.

It comes preloaded with Season 5:

- the 5 teams, their owners, logos and squads (auction prices are **not** included),
- all 14 fixtures for 31 Oct and 1 Nov in the current order,
- the Season 5 rules: league best of 3 at 21–21–15, playoffs best of 3 at 21–21–25, **2 points per win, 0 per loss**.

Points, tie-breaks and set formats can all be changed from the Admin page.

## Pages

| Page | Who | What |
|---|---|---|
| `/` | Everyone | Live match, points table, latest results, next matches, champion |
| `/fixtures` | Everyone | All matches by day with results |
| `/standings` | Everyone | Full points table and the playoff bracket |
| `/teams`, `/teams/<id>` | Everyone | Teams, owners, squads with photos and skill level |
| `/match/<id>` | Everyone | Live score for one match (share this link) |
| `/rules` | Everyone | Match format and points rules (built from the settings) |
| `/awards` | Everyone / staff | Tournament awards after the Final; admin or scorer can set them |
| `/seasons` | Everyone | List of all tournament seasons; open or share archive links |
| `/s/<key>` | Everyone | Shareable link that opens that season (`/?season=<key>`) |
| `/display` | TV at the venue | Big live score, points table, results and what's next |
| `/score` | Scorers (PIN) | Pick a match, tap points, timeouts, undo |
| `/admin` | Organiser (admin PIN) | Season stages, registration, auction settings, owner PINs, fixtures generator, scoring rules |
| `/register` | Public | Player sign-up while registration is open |
| `/admin/registrations` | Admin | Review / import / lock registrations |
| `/auction/console` | Auctioneer / admin | Live draw, bids, sold/unsold |
| `/auction/projector` | Auctioneer / admin | Full-screen player card for the room |
| `/auction/board` | Everyone | Live purse board |
| `/auction/owner` | Team owner PIN | Bid from phone |

Pages refresh themselves every 3 seconds, so nobody has to reload.

## Deploy to Vercel (about 10 minutes)

1. **Put the code on GitHub.** Create a new private repo and push this folder:
   ```bash
   git init && git add . && git commit -m "TNHVPL Season 5 app"
   git branch -M main
   git remote add origin https://github.com/<you>/tnhvpl-app.git
   git push -u origin main
   ```
2. **Import it in Vercel.** vercel.com → Add New → Project → pick the repo → Deploy. The defaults are right (Next.js, `npm install`, `npm run build`).
3. **Add the database.** In the project: Storage → Create Database → **Upstash for Redis** (free plan) → connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
4. **Set the PINs.** Settings → Environment Variables:
   - `ADMIN_PIN`: for you (organiser). Pick something only you know.
   - `SCORER_PIN`: for the people scoring on court.
   - `AUCTIONEER_PIN`: for the auction console / projector (admin PIN also works). Owner PINs are set per team in Admin.
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
6. Open the site. If you see an orange "Demo mode" bar, the database isn't connected yet; recheck step 3 and redeploy.

Optional: add a custom domain under Settings → Domains.

## Match day

1. **Before the first match:** open `/admin`, check the rules, dates and times. Changing set rules after matches are scored re-checks those matches with the new rules, so settle them first.
2. **Scorer:** open `/score` on a phone, enter the scorer PIN once (it stays on the phone), pick the match, choose who serves first, then tap the team that wins each rally.
   - The 🏐 marker shows who is serving.
   - At the end of a set the app shows the result; tap **Start set 2**. The screen swaps sides with the teams; use ⇄ to swap by hand.
   - In the deciding set it shows **Switch sides!** half-way (e.g. at 8 in a set to 15).
   - **Undo** removes the last tap, even after the match has finished.
   - The screen stays on while scoring (on phones that support it).
   - Use one phone per match.
3. **Big screen:** open `/display` on the laptop connected to the TV, press F11 for full screen.
4. **Everyone else:** share the site link, or `/match/m1` etc. for one match.
5. **Playoffs** fill in automatically when all 10 league matches are finished: Qualifier 1 (1st v 2nd), Eliminator (3rd v 4th), Qualifier 2 (loser Q1 v winner Eliminator), Final (winner Q1 v winner Q2). If something needs changing, set the teams by hand on the Admin page.

## Points table rules

Set on the Admin page:

- **Points per result:** for best of 3, "2-0" and "2-1" results each have points for the winner and loser. Presets: *2 per win, 0 per loss* (Season 5) or *3 / 2 / 1 / 0* (2-0 win 3, 2-1 win 2, 1-2 loss 1, 0-2 loss 0, the FIVB-style scale adapted to best of 3).
- **Tie-break order:** league points, set difference, sets won, point ratio, head-to-head by default. Add, remove or reorder: matches won, set ratio, point difference.
- **Match format** separately for league and playoffs: best of 1/3/5, points per set (e.g. `21,21,15` or `21,21,25`), win by, optional cap, timeouts per set, switch sides in the deciding set. These drive scoring and the Rules / match screens — change them on the Admin page.

The table always recalculates from the scored rallies, so a rule change applies to every match at once. Change points rules before the playoffs start, because the playoff pairings follow the table.

## Run it on your computer

```bash
npm install
npm run dev        # http://localhost:3000  (dev PINs: admin 1234, scorer 1111, auctioneer 2222)
npm test           # scoring engine tests
```

Without the Upstash variables the app keeps everything in memory. That is fine for trying it out, but data is lost on restart and is not shared between Vercel's servers, so always connect the database for the real event.

## Free-plan limits

Spectator pages share one cached copy of the scores for 2 seconds at Vercel's edge, so 50 people watching costs about one database read every 2 seconds. That is well inside the free plans of Vercel and Upstash for a two-day tournament. Scorers bypass the cache, so their screen is always exact.

## Privacy

The app shows player names, skill level and photos only: no phone numbers, tower numbers, ages or auction prices. Anyone with the link can see it. To hide photos, untick **Show player photos** on the Admin page.

## Season workflow (Registration → Auction → Fixtures → Matches)

New seasons (blank or clone from S5) start at **registration**:

1. Open public `/register`, or import the Google Form CSV on `/admin/registrations`.
2. Approve / exclude rows, set owner PINs, then **Lock → Auction** (assigns player numbers).
3. Run the auction on `/auction/console` with projector + owner phones; **Finish auction** writes squads.
4. **Generate fixtures** on Admin (rest-optimised), save → **Matches** stage; score as before.

Legacy seasons without a `stage` field behave as **Matches** (unchanged). Private fields (phone, tower, age, email) never appear in `/api/state`. See `docs/season-workflow/`.

### Match-day auction checklist

1. Set `AUCTIONEER_PIN` and each team’s owner PIN in Admin.
2. Open `/auction/projector` on the room laptop (auctioneer/admin login), `/auction/board` on the TV if useful.
3. Owners open `/auction/owner` on their phones and log in as Owner.
4. Auctioneer uses `/auction/console`: Draw → Reveal → bids → SOLD/UNSOLD.
5. After all sold: Finish auction → generate fixtures → score.

## Next season

- Clone from `tnhvpl-s5` in Admin (keeps team shells, clears players/fixtures, starts at registration).
- Seed data for the original S5 archive still lives in `lib/seed.json` / `public/players/`.

## How it works

- `lib/engine.ts`: the scoring engine. Every tap is stored as an event; the score, sets, server, timeouts, side switches, standings and playoff teams are all worked out from those events, so undo is always exact.
- `lib/store.ts`: Upstash Redis storage, one record for settings and one per match, with safe concurrent writes (two scorers on two courts can't overwrite each other).
- `app/api/state`: public read. `app/api/action`: PIN-protected writes, validated on the server.
