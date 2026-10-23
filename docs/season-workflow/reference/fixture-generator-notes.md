# Fixture generator: notes and findings (reference)

## Season 5 format

- 5 teams, single round robin: `n × (n − 1) / 2 = 10` league matches, each team plays 4.
- One court, matches back to back.
- Day 1 (Sat 31 Oct), 4:00–10:00 PM: 8 league matches in 45-minute slots (4:00, 4:45 … 9:15).
- Day 2 (Sun 1 Nov), 4:00–10:00 PM: 2 league matches (45 min), then 4 playoff matches (1 hour each) at 5:30, 6:30, 7:30, 8:30.
- Playoffs, qualifier style: Qualifier 1 = 1st v 2nd (winner to the final); Eliminator = 3rd v 4th; Qualifier 2 = loser of Q1 v winner of Eliminator; Final = winner of Q1 v winner of Q2.
- Matches may not run past the day's end time. With 6 hours per day, 8 + 2 league matches was the only split that fit.

## Rest rules: what "back to back" means

- **Back to back** = a team plays in two consecutive slots on the same day. Target: **0**.
- **Short gap** = a team plays in slot `i` and `i + 2` (one match of rest). Minimise these, then spread them fairly.

## Proven limit for 5 teams on one court

Any 3 consecutive slots hold 6 team-appearances, but there are only 5 teams, so at least one team plays twice in every 3-slot window. With 0 back-to-backs, that team plays in slots `i` and `i + 2`. A day with 8 consecutive slots has 6 such windows, so **at least 6 short gaps are unavoidable**.

All 1,814,400 ways to split and order the 10 matches were checked:

- the minimum really is 6 short gaps, with 0 back-to-backs;
- one team must play 4 matches on Day 1 (16 appearances ÷ 5 teams), and that team gets at least 2 short gaps;
- the best spread is short gaps of (0, 0, 2, 2, 2) per team; (2, 1, 1, 1, 1) is impossible.

The generator should therefore report these numbers rather than promise "no short gaps".

## Algorithm for the app

Inputs: ordered team list; days `[{ date, label, start, end }]`; league slot minutes; playoff slot minutes; optional break before playoffs; playoff format (`qualifier` | `semis` (1v4, 2v3, final) | `final` (1v2) | `none`); single or double round robin.

1. Generate all league pairings (circle method; double round robin swaps home/away in the second half).
2. Fill each day's slots in time order until the day's end time; playoffs go on the last day after the league.
3. Order the matches with a search that scores, in this order:
   1. back-to-backs (must be 0 when possible),
   2. total short gaps,
   3. the highest short-gap count for any single team,
   4. balance of matches per team per day.

   Use exhaustive DFS with pruning when there are 6 teams or fewer (15 matches); otherwise use greedy plus random restarts with a time budget (around 300 ms on the server).
4. Do not let a team's last league match be the slot right before Qualifier 1 when it can be avoided (a top-2 team would play back to back).
5. Output fixtures in the existing `Fixture` shape (`id`, `no`, `stage`, `day`, `date`, `time`, `a`, `b` slots: `{team}`, `{rank}`, `{winner}`, `{loser}`), plus a rest report per team (matches per day, back-to-backs, short gaps) for the admin to review before saving.
6. If the slots don't fit within the day windows, return a clear error naming how many matches don't fit.

Test cases: 5 teams with the Season 5 windows → 0 back-to-backs, 6 short gaps, max 2 per team; 4 teams → 6 matches, 0 back-to-backs; 6 teams → 15 matches.
