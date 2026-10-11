# Rules

How The Brine Nook plays as of Milestone 1 (bench rules; the bench screen
is a separate task). Numbers are the
current tuning; the code is the source of truth, and a PR that changes a rule
updates this file. Constant names are in brackets.

## Time

Everything is in in-game hours. A day has three phases:
**morning → open → evening**, then sleep into the next morning.

- The shop is open 08:00 to 20:00 (`OPEN_AT`, `OPEN_HOURS` = 12). Only this
  part runs in real time: one in-game hour is 12.5 real seconds
  (`HOUR_SECONDS`), so a full day open is 2.5 minutes.
- Closing early is allowed. Sleeping passes the rest of the 24 hours at once,
  and every jar ages by that much overnight.

## Jars

- The shelf has 9 slots (`SLOTS`). Starting a jar costs coins and fills an
  empty slot; you can start jars in the morning or while open.
- A jar's flavour is its age divided by its recipe's ripening time, from 0 to 1.
  The strip is split into four bands: crisp (below 0.3), tangy (to 0.55), sour
  (to 0.8) and funky (to 1).
- At 1 the lid pops: the jar has gone over, can't be sold and can only be
  tipped out.
- Each jar holds 2 servings (`SERVINGS`) and empties after the second sale.

| Recipe       | Ripens in | Price | Cost |
| ------------ | --------- | ----- | ---- |
| Dill pickles | 48 h      | 12    | 7    |
| Hot sauce    | 36 h      | 15    | 9    |
| Kimchi       | 72 h      | 18    | 11   |
| Sauerkraut   | 120 h     | 22    | 12   |

A new game starts with 40 coins, reputation 5 of 10, and six jars already
part-way along so day 1 has something to sell.

## Customers

- Walk-ins arrive every 0.8 to 1.5 hours, sooner at higher reputation. At most
  3 wait (`MAX_QUEUE`); the one at the counter loses patience over 2.2 hours
  (`PATIENCE`) and leaves if it runs out.
- Each wants one recipe within a window 0.16 wide (`WINDOW`) somewhere on the
  flavour strip. About 30% of walk-ins ask for a recipe already on the shelf,
  usually a bit riper than it is now.
- The customer at the counter can be:
  - **served** a jar of their recipe that hasn't gone over;
  - **pre-ordered**: they leave and come back on a later day, at the hour when
    a jar started right now would sit in the middle of their window;
  - **sent away**, costing 1 reputation (2 for a pre-order customer).

## Pay and reputation

- Inside the window: full price plus a tip of up to 30% that is largest at the
  window's centre, and +1 reputation. A pre-order pays 25% extra and gives +2.
- Outside the window: pay drops by 4× the distance (never below 20% of price).
  A miss under 0.06 is forgiven; a bigger miss costs 1 reputation.
- A walk-in who gives up costs 1 reputation. A pre-order customer who is
  missed (leaves, or never reaches the counter on their due day) costs 2.
- Reputation runs 0 to 10 (`REP_MAX`) and speeds up arrivals.

## The bench and the pantry

- **Pantry.** In the evening you can buy ingredients (`buy`). A pantry holds
  up to 9 of each (`MAX_STOCK`). A new game starts with 2 salt and 2 chili.
- **Add-ins.** Starting a jar can mix in up to 3 different ingredients
  (`MAX_ADDS`), one of each from the pantry. Each has a tag the screen shows:

| Ingredient | Tag    | Effect                                                      | Cost |
| ---------- | ------ | ----------------------------------------------------------- | ---- |
| Salt       | slower | ripens at 0.75× speed (a 48 h jar takes 64 h)               | 2    |
| Chili      | faster | ripens at 1.33× speed (72 h kimchi in 54 h)                 | 3    |
| Honey      | faster | ripens at 1.2× speed                                        | 4    |
| Pear       | sweet  | flavour only: no change to timing; makes discovered recipes | 3    |
| Garlic     | funk   | flavour only: no change to timing; makes discovered recipes | 2    |

Speeds multiply. A jar's life is its recipe's hours divided by its speed, and
flavour = age / life. A plain jar is exactly as before. (The core also
supports a `shift` along the strip, but no ingredient uses one: Hadash chose
flavour-only pear and garlic on 11 Oct 2026.)

- **Sweet spot.** Every recipe has a best stretch of the strip (dill 0.2–0.4,
  hot sauce 0.45–0.65, kimchi 0.35–0.55, kraut 0.5–0.7). The bench
  time-lapse highlights the hours a mix spends there; add-ins move it. In
  Milestone 1 it guides the player and pays nothing extra; customers' windows
  are still drawn as before.
- **Discovered recipes.** A base recipe brewed with everything a discovered
  recipe needs becomes that recipe (the most specific match wins). The first
  time, it is discovered and joins the menu, so walk-ins can ask for it; after
  that it can be brewed by name, which uses what it needs from the pantry. It
  costs the same as its base and ripens like it, but sells for more:

| Recipe              | Base       | Needs         | Price | Starts hinted |
| ------------------- | ---------- | ------------- | ----- | ------------- |
| Garlic dills        | Dill       | garlic        | 16    | yes           |
| Honey hot sauce     | Hot sauce  | honey         | 20    | yes           |
| Pear kimchi         | Kimchi     | pear          | 24    | yes           |
| Fire kraut          | Sauerkraut | chili         | 28    | yes           |
| Black garlic kimchi | Kimchi     | garlic, chili | 30    | no            |

- **Experiments.** In the evening the bench can try a mix without a shelf
  slot (`experiment`): it uses up one of each add-in, costs no coins, and
  teaches (and discovers) exactly what brewing that mix would.
- **Recipe card.** For each base recipe: its sweet spot, a tick for every
  ingredient you have mixed into it, and its discovered recipes as known
  (with what they need), hinted (only the tags, e.g. "something sweet") or
  hidden. Off-menu requests that add hints arrive with Milestone 2.

## Not in the game yet

Regulars and the order board
(2), the market, upgrades and goals ladder (3). The game is endless with a
goals ladder; there is no season end.
