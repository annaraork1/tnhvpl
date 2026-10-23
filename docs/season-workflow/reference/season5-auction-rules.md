# Season 5 auction: rules and worked numbers (reference)

How the TNHVPL Season 5 auction actually ran, worked out in Excel and a single-page draw tool. Every number here becomes a **per-season setting** in the app; these are the Season 5 values, and they are the defaults when a season is cloned from Season 5.

## Inputs

| Setting | Season 5 value |
|---|---|
| Teams | 5 (Spike Surge, Eagle Squad, Supreme Warriors, Super Saiyans, Pavilion Rovers) |
| Owners | 1 per team, **not** in the player pool, never bid on |
| Player pool | 43 registered players (50 sign-ups; 7 excluded by the organisers) |
| Purse per team | 10,000 points |
| Base price | 100 (same for every skill level) |
| Bid increment | 100 (flat) |
| Minimum players to buy per team | 8 (owner not counted) |
| Squad size | owner + at least 8 = at least 9 |

## The squad cap and the leftover players (the rule that needs care)

- `leftover = poolSize − teams × minPlayers` → `43 − 5 × 8 = 3`.
- **Before the leftover stage:** a team that already has `minPlayers` players is **full** and cannot be picked or bid for.
- **Leftover stage starts** when the number of players not yet sold is `≤ leftover`. From then on **every** team can bid again, including teams that already have 8.
- **Every player is sold.** Unsold players come back in re-bid rounds until all are sold. (Season 5 had no "stays unsold" outcome.)
- Result in Season 5: three teams ended with 9 players and two with 8 (43 = 9 + 9 + 9 + 8 + 8).

## Max bid ("Max bid now")

So a team can always complete its minimum squad at base price:

```
slotsToMin = max(0, minPlayers − bought)
maxBid     = slotsToMin > 0
               ? balance − basePrice × (slotsToMin − 1)
               : balance
```

With base prices by skill, reserve the **lowest** base price for each remaining slot (the cheapest way to fill the squad).

Example: balance 7,300, 4 bought (4 to go) → max bid = 7,300 − 100 × 3 = **7,000**.

## Draw and re-bid rounds (from the draw tool)

1. "Draw number" picks a **random** player from the remaining pool. The number stays hidden as "?" until revealed.
2. "Show number" runs a short spin, then reveals the number, name and skill.
3. **Sold** → pick the team (keys 1–9). **Unsold** → the player goes to the unsold list.
4. When the pool is empty and unsold players remain: "Start round N" re-draws **only** the unsold players at random. Those players show an R2/R3 tag.
5. When everyone is sold: "Auction complete".
6. Corrections: tap any number to Mark sold / Change team, Mark unsold, or Put back in pool. Undo goes back up to 200 steps.

## Rules shown to owners (Season 5 deck, "Auction rules" slide)

1. 10,000 points for each team to spend in the auction.
2. At least 9 per team: the owner plus a minimum of 8 players bought at auction.
3. Base price is 100 points for every player. Bids go up in multiples of 100.
4. Owners can open with any bid for a player, at or above the base price.
5. "SOLD" is final. The auctioneer's call closes the bid for that player.
6. Once claimed, a team must take the player, whoever the player is.
7. Every team must buy at least 8 players within 10,000 points. Otherwise the team's highest-bid player goes back to the pool for the other teams, with no points refunded.
8. No past seasons or examples may be raised by owners as an argument or concern.

Rule 7's penalty is applied by the organisers by hand. In the app it is an admin action ("Release highest-bid player to pool, no refund"), not automatic.

## Season 5 outcome (aggregates only)

| Team | Players bought | Spent | Balance left |
|---|---|---|---|
| Spike Surge | 9 | 9,700 | 300 |
| Eagle Squad | 8 | 9,900 | 100 |
| Supreme Warriors | 9 | 8,400 | 1,600 |
| Super Saiyans | 8 | 6,200 | 3,800 |
| Pavilion Rovers | 9 | 10,000 | 0 |
| **Total** | **43** | **44,200** | |

The highest single bid was 5,000. Several players went at the 100 base price, so the base price really does get used.

## What was shown where

| Screen | Showed |
|---|---|
| Projector player card (`projector-player-card.png`) | Photo in a ring, "PLAYER #nn", name, skill pill coloured by skill, tower/flat, age, phone |
| Live purse board (`live-purse-board.png`, sample data) | Per team: players bought vs minimum, balance, players left to buy, max bid now, squad list with winning bids |
| Draw screen (`auction-draw-screen.png`) | Number ball, name and skill, Sold/Unsold, 1–N board coloured by team, team squads |

Skill colours: Advanced `#E4572E`, Intermediate `#2EAD6B`, Beginner `#3FA7D6`.
