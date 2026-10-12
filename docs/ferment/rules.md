# Rules

How The Brine Nook plays as of Milestone 2 (regulars, bulk orders, off-menu
requests, kept portions and the order board). Numbers are the current tuning;
the code is the source of truth, and a PR that changes a rule updates this
file. Constant names are in brackets. Rules marked **(Hadash)** came from a
playtest decision; don't change them without asking Hadash.

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
- Each jar holds 2 servings, or portions (`SERVINGS`), and empties after the
  last sale. Nothing assumes 2: the count may go to 3 later **(Hadash)**, so
  code reads `jar.servings`, never a literal 2.
- Portions can be kept for orders (see Kept portions below); walk-ins can only
  buy portions nobody has kept.

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
- Each wants one recipe from the menu within a window 0.16 wide (`WINDOW`).
  Where that window sits follows a bell curve centred on the middle of the
  recipe's sweet spot, with a spread of 0.12 (`DEMAND_SPREAD`): about two in
  three walk-ins want it within 0.12 of the middle, and a few want it far off
  (window middles stay between 0.1 and 0.9). About 30% of walk-ins pick a
  recipe already on the shelf; their window follows the same curve.
- About 8% of walk-ins (`OFF_MENU`, drawn from its own "requests" random
  stream) ask instead for a discovered recipe that isn't on the menu yet, at
  the middle of its sweet spot. If it was hidden, the bench now hints at it.
  The request stays on the board (`state.orders.asked`, the latest asker per
  recipe) until that recipe is discovered.
  Sending them away, or letting them give up, costs no reputation. They can
  also pre-order it, which gives you until the due day to discover it: pre-
  ordering an undiscovered recipe is allowed **(Hadash)**. Only starting a jar
  for it from the board is not (see The order board).
- The customer at the counter can be:
  - **served** a jar of their recipe that hasn't gone over;
  - **pre-ordered**: they leave and come back on a later day, at the hour when
    a jar started right now would sit in the middle of their window;
  - **sent away**, costing 1 reputation (2 for a pre-order customer).
- A walk-in can't be served a jar whose free portions are all kept for other
  orders (`serve` rejects it: "set aside for someone else"). The screen offers
  "tap to sell it anyway", which lets go of one kept portion first.

## Pay and reputation

- Inside the window: full price plus a tip of up to 30% that is largest at the
  window's centre, and +1 reputation. A pre-order pays 25% extra and gives +2.
- Outside the window: pay drops by 4× the distance (never below 20% of price).
  A miss under 0.06 is forgiven; a bigger miss costs 1 reputation.
- A walk-in who gives up costs 1 reputation. An order that is missed (the
  customer leaves unserved, or never reaches the counter on their due day)
  costs 2, or 3 for a bulk order (`BULK_MISS`).
- Reputation runs 0 to 10 (`REP_MAX`) and speeds up arrivals.

## The bench and the pantry

- **Pantry.** In the evening you can buy ingredients at the market (`buy`,
  see The market). A pantry holds up to 9 of each (`MAX_STOCK`). A new game
  starts with 2 salt and 2 chili.
- **Add-ins.** Starting a jar can mix in up to 3 different ingredients
  (`MAX_ADDS`), one of each from the pantry. Each has a tag the screen shows:

| Ingredient | Tag    | Effect                                                      | Cost |
| ---------- | ------ | ----------------------------------------------------------- | ---- |
| Salt       | slower | ripens at 0.75× speed (a 48 h jar takes 64 h)               | 2    |
| Chili      | faster | ripens at 1.33× speed (72 h kimchi in 54 h)                 | 3    |
| Honey      | faster | ripens at 1.2× speed                                        | 4    |
| Pear       | sweet  | flavour only: no change to timing; makes discovered recipes | 3    |
| Garlic     | funk   | flavour only: no change to timing; makes discovered recipes | 2    |
| Oak leaves | slower | ripens at 0.9× speed                                        | 2    |
| Whey       | faster | ripens at 1.6× speed (rare at the market)                   | 6    |

Speeds multiply. A jar's life is its recipe's hours divided by its speed, and
flavour = age / life. A plain jar is exactly as before. (The core also
supports a `shift` along the strip, but no ingredient uses one: Hadash chose
flavour-only pear and garlic on 11 Oct 2026.)

- **Sweet spot.** Every recipe has a best stretch of the strip (dill 0.2–0.4,
  hot sauce 0.45–0.65, kimchi 0.35–0.55, kraut 0.5–0.7). The bench
  time-lapse highlights the hours a mix spends there; add-ins move it. It is
  where most walk-ins want the recipe (see Customers); serving there pays
  nothing extra by itself.
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
  hidden. An off-menu request turns a hidden recipe into a hinted one.

## Orders and regulars

Everyone who will come on a known day is an order (`state.orders.list`), of
one of three kinds:

- **Pre-order**: a walk-in booked a later day (see Customers).
- **Standing**: a regular's next visit.
- **Bulk**: a business wants several whole jars on a due day.

All of them arrive on their due day at their hour, go straight to the
counter (or right behind whoever is there), pay 25% extra and give +2
reputation when served inside their window.

**Regulars** (`content/regulars.js`) have a favourite recipe and their own spot
on the strip, always within one spread of where walk-ins want that recipe.
Each starts coming on a given day, some only once the shop's reputation is
high enough too.

- **First visit is a plain walk-in (Hadash).** A standing regular's first
  visit never goes on the board, because you'd have no time to prepare. From
  their start day they are `pending` in `state.regulars.met` and drop in as an
  ordinary walk-in at about their usual hour (`dropIn`, at most once a day,
  `seen`). Serving them, or taking their pre-order, makes them a regular
  (`welcome`, event `regularJoined`). If they're sent away or give up, they
  drop in again the next day.
- Served on that first visit, their next visit is booked `every` days later.
  Pre-ordered, the pre-order becomes their first standing order (kind
  `standing`), and the next one is booked when it is settled.
- After every booked visit, served or missed, the next one is booked `every`
  days after its due day. `state.regulars.met` counts each one's visits,
  delighted visits and misses.
- Bulk regulars don't drop in: their first contact is an offer with `lead`
  days of notice (below).

| Regular                  | Kind     | Wants               | Every  | Arrives | Starts              |
| ------------------------ | -------- | ------------------- | ------ | ------- | ------------------- |
| Mrs. Okafor              | standing | dill at 0.25        | 2 days | 09:30   | day 2               |
| Old Bram                 | standing | sauerkraut at 0.68  | 4 days | 17:00   | day 3               |
| Mei from Lucky Noodle    | bulk     | 4 dill at 0.2       | 5 days | 11:00   | day 4               |
| Kenji                    | standing | kimchi at 0.52      | 3 days | 13:00   | day 5, reputation 6 |
| Noor                     | standing | hot sauce at 0.6    | 3 days | 15:30   | day 6, reputation 7 |
| Luis from the taco truck | bulk     | 3 hot sauce at 0.52 | 6 days | 14:00   | day 7, reputation 7 |

Each window is 0.16 wide around the spot.

**Bulk orders.** A bulk regular offers an order on their first morning and
every `every` days after (not while one of theirs is still open), due `lead`
days later (3 for the noodle bar, 2 for the taco truck). Offers sit in
`state.orders.offers` until accepted (`acceptOrder`) or declined
(`declineOrder`), and lapse at closing at no cost. On the due day the buyer
takes **whole jars**: each serve hands over the whole jar and pays the
per-serving price for every serving left in it. They wait, with fresh
patience after each jar, until they have them all (+2 reputation).

**Planning.** `planFor(state, order, adds)` says where a jar started at the
state's clock, with those add-ins, would be at pickup: its flavour, whether it
fits, and the day and hour it enters and leaves the window. `right` is false
when the add-ins turn the recipe into another one (chili on sauerkraut makes
fire kraut); such a plan never fits. `startForOrder` starts that jar (brewed
from the base with whatever the recipe needs, so the core would discover an
undiscovered recipe this way; the board never offers it, see below) and keeps
a portion of the new jar for the order.

**Kept portions (Hadash).** Holding is per portion, not per jar.

- An order with a jar in `order.jars` keeps one portion of it; a bulk order
  keeps the whole jar. One jar can hold portions for several orders.
- `hold { orderId, slot }` keeps a portion of a jar already on the shelf
  (same recipe, enough free portions). `release { slot, orderId? }` lets it
  go; without `orderId` the hold due latest goes. `holdsOn(state, jar)` and
  `freePortions(state, jar, orderId?)` are the read helpers.
- The order's own customer can be served from their kept portion; everyone
  else only from free ones. Once an order is settled its holds vanish with
  it. A kept jar that is tipped out or emptied simply stops counting.

## The order board

The board (`ui/board.js`) is the morning planning screen. These are playtest
decisions **(Hadash)**, not just layout:

- **Tickets** show each order's face, recipe and window on the strip, when
  they come, a "regular" stamp, and pips for a bulk order's jars. Today's bulk
  offers show too (Take it / Pass); off-menu requests get their own ticket
  that opens the bench.
- **The planner is a choice of which jar serves the order.** Every free,
  un-popped shelf jar of the recipe that won't have popped by pickup is listed
  with its marker on the strip at pickup and a word ("Just right", "Not
  ready", "Gone sour"), followed by "A new jar, started now"
  (or "in the morning" after closing). The best-fitting one is preselected.
  The big strip, the day timeline and the verdict follow the choice.
- **The main button matches the choice:** "Keep a portion for Sam" (or "Keep it"
  for bulk) or "Start a jar". Options stop at what the order still needs, so
  you can never keep more than it needs. A covered order shows "All set" and
  the kept jars with Let go.
- **A kept jar that won't suit** by pickup turns the main button into "Pick
  another jar", which lets it go and brings the list back.
- **Add-ins** on a new jar: only timing add-ins (speed ≠ 1) the recipe
  doesn't already contain are shown. One that would turn the jar into another
  recipe is locked and labelled with what it makes ("makes fire kraut", or
  "makes something new" if undiscovered). The verdict's tips only suggest
  add-ins that are in the pantry and keep the recipe.
- **After closing** (including closing early) a new jar is previewed as
  started at the next morning's opening, since that's the earliest it can go
  on, and "start it at …" tips never suggest a time the shop is closed.
- **Undiscovered recipes:** the order can exist (pre-order is fine), but the
  planner offers no new jar for it. It says we don't know how to make it yet
  and the main button goes to the bench. Once discovered it plans like any
  other order.
- **Regulars' planner** explains the rhythm ("comes in every other day for
  crisp dill pickles") and shows past visits as dots (delighted, fine,
  missed), because "regular" was otherwise unexplained.
- **On the shelf** each jar shows one chip per portion; a chip with a face is
  kept for that customer. A walk-in picking a jar whose free portions are all
  kept sees "For Sam, tap to sell it anyway".

## The market

Every morning (and on day 1) the market sets out its stalls, rolled from its
own "market" random stream so no other draws move: `state.market.items` is
ingredient → `{ price, left }` for that day. In the evening `buy` pays today's
price and takes from the stall. It is refused when the ingredient isn't at
the market today, the stall has too few left ("sold out"), the pantry would
go over `MAX_STOCK`, or coins are short. `marketToday(state)` lists today's
stalls for the screen. Until the market screen lands, the bench pantry's +1
buttons buy from today's stalls at today's price, and read "Not today" for an
ingredient that isn't out.

- **Stalls** (`STALLS` in `content/market.js`, by each ingredient's `stall`):

| Stall  | Out on      | Stock | Ingredients         |
| ------ | ----------- | ----- | ------------------- |
| staple | every day   | 5–9   | salt, chili, garlic |
| often  | 65% of days | 2–6   | honey, pear, oak    |
| rare   | 20% of days | 1–3   | whey                |

Day 1 has every stall but the rare ones. A rare stall being out pushes a
`rareAtMarket` event. Ingredients a discovered recipe needs are never rare.

- **Prices.** The table cost above is an ingredient's usual price. Each
  morning its price multiplier (`state.market.drift`) moves by up to 12%
  of the cost either way (`PRICE_STEP`), whether its stall is out or not,
  and never strays more than 30% from it (`PRICE_BAND`). Today's price is
  the cost times that, rounded, at least 1 coin.
- **New ingredients.** A timing ingredient is just a row in
  `content/ingredients.js` with a `speed` and a `stall`: the bench, the
  board planner (which lists every timing add-in) and the market pick it up.
  An add-in that turns the recipe into another is locked in the planner
  automatically, because `planFor` reports it as not `right`.

## Not in the game yet

Upgrades and the goals ladder (Milestone 3). The game is endless with a
goals ladder; there is no season end.
