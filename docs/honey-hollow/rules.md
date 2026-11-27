# Rules

How Honey Hollow plays. Numbers are the starting tuning; `content/tuning.js`
and the content tables are the source of truth, and a change to a rule updates
this file in the same commit. Constant names are in brackets.

Three promises the rules keep, whatever else changes:

1. **Time only moves while you play.** No real-time timers, nothing happens
   while the phone is away.
2. **You cannot lose the farm.** Colonies weaken, they never die. The grocer
   always buys. There is no state with no way to earn.
3. **Everything about bees is true.** Rules are simplified from real
   beekeeping, never invented against it, and the bee book cites sources.

## Calendar

- A year is 28 days: four seasons of 7 (`SEASON_DAYS`). Day 1 is spring day 1.
  `doy` (day of year) runs 0–27: spring 0–6, summer 7–13, autumn 14–20,
  winter 21–27.
- A day has three phases: **morning → day → evening**, then sleep.
  - **Morning**: no clock. Plant, move hives, harvest, craft, shop.
  - **Day**: the bees fly for `TICKS_PER_DAY` = 240 ticks. The screen runs 4
    ticks a second (60 s), or 12 at fast speed. Harvesting, planting and care
    still work; moving hives does not (the bees are out).
  - **Evening**: the market stall, then the workshop if you like, then sleep.
- In winter the bees stay in: `startDay` goes straight from morning to evening.

## Weather

Each day has one weather, drawn at the previous sleep, so **tomorrow's
forecast is always known**. Weather scales how much the bees can fly:

| Weather | Flight | Notes                                        |
| ------- | ------ | -------------------------------------------- |
| sunny   | 1.0    |                                              |
| cloudy  | 0.8    |                                              |
| windy   | 0.6    | 0.4 on Heather Hill                          |
| rain    | 0.15   | beds keep their nectar; nothing else changes |

Odds by season live in `WEATHER_ODDS`. Days 1 and 2 of a new game are sunny.
Winter weather is `snow` or `frost`, for show only.

## Land

The Hollow is four plots, each a grid of 6 × 6 squares (`PLOT_W`, `PLOT_H`).
You own the Home Meadow from the start and buy the others in any order.

| Plot         | Price | Terrain                                                            |
| ------------ | ----- | ------------------------------------------------------------------ |
| Home Meadow  | owned | all grass; six wild dandelion beds already growing                 |
| Pond Bank    | 150   | a pond of water squares; water mint grows only beside water        |
| Old Orchard  | 320   | six old apple trees (fixed); the rest grass                        |
| Heather Hill | 600   | hill ground and a few rocks; heather and wild thyme grow only here |

A square is grass, hill, water, rock or tree. Beds and hives go on grass or
hill only. A hive within 2 squares of water gets +10% flight in summer (bees
need water to cool the hive).

On the first morning of spring, summer and autumn a Home Meadow with fewer
than six beds (`WILD_BEDS`) seeds itself up to six with that season's wild
flower: dandelion, clover, ivy (`WILD_FLOWERS`). A meadow dug bare always
feeds a hive again.

## Flowers

A bed holds one flower. Planting costs the seed price and the bed is
established the next morning; after that it blooms every year inside its
window. Digging a bed up is free and refunds nothing. Each blooming bed offers
its nectar once per day, shared between the hives that reach it.

| Flower        | Where        | Blooms (doy) | Nectar | Seed | Honey: colour, taste           | Base price |
| ------------- | ------------ | ------------ | ------ | ---- | ------------------------------ | ---------- |
| Dandelion     | anywhere     | 0–3          | 4      | 2    | bright yellow, bold            | 9          |
| Apple blossom | orchard tree | 1–4          | 8      | –    | light, fruity, delicate        | 16         |
| Clover        | anywhere     | 4–10         | 5      | 4    | pale, mild                     | 8          |
| Borage        | anywhere     | 5–15         | 6      | 8    | water-white, mild              | 10         |
| Lavender      | anywhere     | 7–12         | 5      | 6    | pale gold, floral              | 14         |
| Wild thyme    | hill         | 8–13         | 4      | 9    | amber, herbal, strong          | 18         |
| Water mint    | beside water | 9–15         | 5      | 7    | amber, fresh, herbal           | 15         |
| Sunflower     | anywhere     | 10–16        | 6      | 6    | golden yellow, mild, fruity    | 11         |
| Buckwheat     | anywhere     | 12–17        | 6      | 6    | very dark, malty, strong       | 13         |
| Heather       | hill         | 14–19        | 5      | 12   | red-amber, strong, jelly-thick | 22         |
| Ivy           | anywhere     | 16–20        | 5      | 5    | pale, sets hard, bitter        | 5          |

Dandelion, clover and lavender are in the seed shop from the start. The rest unlock with
renown or with their plot (see Progression). Ivy sells badly on purpose: it is
the bees' own winter larder, planted to refill hives after the last harvest.

A bed has a stage for drawing and for rules: `seed` (planted today), `leaf`
(out of window), `bud` (window opens tomorrow), `bloom`, `faded` (window
closed, until winter), `dormant` (winter).

**Picking a bunch.** A blooming bed of lavender, water mint or wild thyme can
be picked once per year: you get one bunch of that flower for the workshop,
and the bed gives no nectar that day.

## Hives and foraging

A hive stands on a square and reaches the 24 squares around it: the 8 next to
it at weight 1 (`NEAR`), the next ring of 16 at weight 0.5 (`FAR`). Reach does
not cross plot edges.

At `startDay` the day's forage plan is fixed:

- A hive can carry `strength × FORAGE_PER_STRENGTH` (6) nectar that day, times
  the weather's flight, times bonuses.
- It asks each blooming bed in reach for a share in proportion to
  `weight × nectar the bed offers`. A bed asked for more than it has gives
  each hive its fair fraction; what a hive could not get from a crowded bed
  it asks of its other beds (two more rounds).
- A hive that finds less than 30% (`WILD_SHARE`) of what it could carry in the
  beds makes its load up to that share beyond the hedge. Hedgerow nectar is
  stored as `wild`: on a fine day it feeds the colony, it never grows it, it
  never names a honey, and it counts against purity.
- During the day each tick delivers 1/240 of the plan into the hive's stores.

The range preview (`forecast`) runs the same sharing and the same pouring into
the stores, for a hive where it stands, on another square, or for a colony
that is not standing yet (a new skep, a split, a caught swarm), so what it
shows is what the day gives.

So one hive in the middle of a field gets the most, and hives packed together
split the same flowers. That is the layout puzzle.

**Stores.** A hive keeps what it gathered by source: `stores[flower]` in
nectar units, plus `syrup` if you fed it. `NECTAR_PER_JAR` = 10 units make one
jar. A hive holds `capacity × 10` units; nectar past that is wasted.

**Eating.** At sleep a colony eats `strength × EAT_PER_STRENGTH` (1) units,
taken from every source in proportion (`WINTER_EAT` = 0.6 of that in winter).
A hive that cannot eat is **hungry**: it eats what there is. The first hungry
night is a warning; every hungry night in a row after it costs 1 strength
(never below 1). One full supper ends it.

**Growing.** In spring and summer, a day when a colony gathered at least twice
what it eats adds a growth day; `GROW_DAYS` (2) growth days add 1 strength, up
to the hive type's limit. No growth in autumn or winter, none for a hungry
colony, none with 60 mites or more.

| Hive       | Jars held | Strength limit | Cost           |
| ---------- | --------- | -------------- | -------------- |
| Straw skep | 6         | 4              | first one free |
| Box hive   | 10        | 6              | upgrade 60     |
| Double box | 16        | 8              | upgrade 120    |
| Tall stack | 24        | 10             | upgrade 240    |

A new skep with a small colony (strength 2) costs 40 (`HIVE_PRICE`), and 20
more (`HIVE_PRICE_STEP`) for each hive you own beyond the first. At most 4
hives stand on one plot.

**Moving.** A hive moves only in the morning, when the bees are home, to any
free grass or hill square you own. A hive moved today flies at half strength
that day while its foragers relearn the way home. Put back where it woke up,
it loses nothing.

## Honey

Taking `k` jars removes `k × 10` units from every source in proportion and
gives `k` identical jars:

- The biggest flower share is the honey's **purity**. At 80% or more it is
  that flower's **pure honey**: ★ from 80%, ★★ from 90%, ★★★ from 97%.
  Stars multiply the price by 1, 1.2 and 1.45.
- Below 80% it is **meadow blend** (base price 6).
- Syrup counts against purity like any other source and never names a honey.

Because a hive's stores mix, the way to pure honey is to keep one flower in
reach at a time, or to empty a hive before the next flower opens. The night
card warns the evening before a bloom starts or ends, and names the hives
whose pure honey tomorrow's flight would turn into a blend or cost a star.

Every 2 jars taken also give 1 beeswax.

**Winter needs.** `winterNeed(hive)` is what the colony must hold to see the
winter out unfed: tonight's meal and every winter night after it, at the
strength it has now. From autumn on, the hive sheet marks it on the stores
bar. Taking honey below the mark is allowed; the hive will go hungry later
unless you feed it. **Sugar syrup** costs 8 coins for 10 units (in the shop
from the first summer) and can be fed whenever the hive has room for it.

## Living hives

Introduced by goals, so a new keeper is not hit with all of it on day 1.

- **Swarming.** From the first summer (`SWARMS_FROM_DAY`, day 8), between doy
  3 and 12 (`SWARM_DOY`), a colony as strong as its hive allows has outgrown
  it: at sleep it builds queen cells (`swarmCells`, a warning on the hive; the
  hive is flagged the day before as well). With queen cells it swarms on any
  night it still holds a jar of stores and no honey was taken from it that
  day: half the colony leaves (the hive keeps the bigger half) and hangs on a
  nearby square for the next day. A bigger hive or a split takes the cells
  down for good. Taking honey keeps the colony home one night at a time. The
  cells also come down when the season ends or the colony is no longer at its
  limit. A colony raises queen cells once a year at most, and one that was
  split or caught this year is settled until next spring. So a keeper who
  feeds their bees well meets queen cells in the first summer, and chooses:
  split, upgrade, keep taking honey, or lose half the colony.
- **Catching.** While the swarm hangs (the whole of the next day, in any
  phase), a spare hive (25 coins from the shop) turns it into a new colony on
  a square you choose, at the strength that left, as far as a skep allows (4).
  Uncaught at sleep, it is gone.
- **Splitting.** In the morning, a colony of strength 4 or more
  (`SPLIT_MIN_STRENGTH`) can be split into a spare hive: half the colony
  (rounded down, 4 at most) and half the stores (or as much of half as a skep
  holds) move across, mites and all.
- **Mites.** From the first summer, each hive's `mites` (0–100) rise each
  sleep outside winter by `MITE_RATE` × strength. At 40 the hive shows "mites
  spotted". At 60 the colony stops growing; at 80 (`MITES_HARM`) it loses 1
  strength that same night and again every second sleep while they stay that
  high (never its last strength). **Dusting with sugar** is free, once a day per hive, −20. A
  **thyme remedy** (15 coins, or made from a thyme bunch) is −70.
- **Wasps.** In late summer and autumn, a hive of strength 3 or less may be
  raided during the day: you have 40 ticks to tap it and narrow its entrance,
  or it loses 5 units of stores. At most one raid a day.

## The market stall

Evening. `2 + renown tier` customers come one at a time (at most 6). Each has
a **wish** and wants 1–3 of something:

| Wish   | Example line                | Satisfied by                   |
| ------ | --------------------------- | ------------------------------ |
| kind   | "Lavender honey, please"    | that product                   |
| trait  | "Something dark and strong" | a honey with that trait        |
| finest | "The best jar you have"     | any pure honey of ★★ or better |
| gift   | "A present for my sister"   | any workshop good              |
| any    | "Surprise me"               | anything                       |

Honey traits: `light`, `amber`, `dark`, `mild`, `floral`, `fruity`, `herbal`,
`strong`. Customers only wish for things you have made at least once.

- Offer something that satisfies the wish: they are **delighted**, pay 125% of
  today's price and add renown (+1, or +2 for ★★★).
- Offer anything else: they take it at 85%, no renown.
- You may sell them fewer than they want (`offer` with `n`), never more.
- Or let them go with nothing: no penalty.
- **The grocer** buys any amount of anything at 60%, any time in the evening,
  no renown. So stock never rots and nobody is stuck.

**Prices** are base price × stars × the product's market mood. The mood is a
season curve (honey +10% in winter, candles +40% in winter and +15% in
autumn, lip balm +30% in winter) times a daily wobble of ±10%, times a glut
factor: each unit you sell knocks 3% off that product, healing by a third of
the gap each night, never below 60%.

**Regulars.** Eight villagers with their own tastes come back again and
again, each once you have made something they love. Each delighted sale to one adds a heart; at 3, 7 and 12 hearts they
bring a gift (seeds, a hat, a bee fact) and a line of their story.

| Id           | Who                            | Loves                |
| ------------ | ------------------------------ | -------------------- |
| `hattie`     | Hattie Crumb, baker            | dark, strong         |
| `fenwick`    | Old Mr Fenwick, retired keeper | finest               |
| `posy`       | Posy, eight years old          | mild; candles        |
| `linden`     | Dr Linden, the village doctor  | herbal; lip balm     |
| `marguerite` | Marguerite, tea-room owner     | floral, fruity       |
| `tobias`     | Tobias Reed, angler            | mint; anything amber |
| `wren`       | Wren, painter                  | soap; anything light |
| `barley`     | Farmer Barley                  | mild, in threes      |

**The Honey Show** is the evening of autumn day 7. Before the stall opens you
may enter up to three different pure honeys (one jar each). Each entry earns
a ribbon by its stars (★ bronze, ★★ silver, ★★★ gold), coins (20 / 45 / 90)
and renown (2 / 4 / 8). **The Winter Fair** is winter day 4: six customers,
all wishing for gifts, candles or finest, paying half as much again.

## The workshop

Open in the morning and the evening once you hold your first beeswax. You can
make `CRAFTS_PER_DAY` (3) things a day, 6 in winter.

| Recipe          | Needs                                | Base price |
| --------------- | ------------------------------------ | ---------- |
| Beeswax candle  | 2 wax                                | 14         |
| Lavender candle | 2 wax, 1 lavender bunch              | 24         |
| Flower soap     | 1 wax, 1 bunch (lavender/mint/thyme) | 18         |
| Honey lip balm  | 1 wax, 1 jar of any honey            | 20         |
| Wax wraps       | 3 wax                                | 22         |
| Thyme remedy    | 1 thyme bunch                        | not sold   |
| Gift basket     | 1 pure honey, 1 candle, 1 soap       | 75         |

Soap comes in three kinds, one per bunch. Recipes unlock with goals and
renown.

## Your beekeeper

Made on the first screen and changeable later at the wardrobe: `body`
(`woman` or `man`), skin (6), hair style (5 per body), hair colour (8),
overalls (6), shirt (6), hat, name. Hats and extra outfits are earned.

One **talent**, chosen once:

| Talent           | Effect                                                     |
| ---------------- | ---------------------------------------------------------- |
| Green thumb      | every bloom window lasts one day longer                    |
| Gift for selling | every customer pays 10% more                               |
| Bee whisperer    | colonies grow in 1 growth day; mites rise 30% slower       |
| Clever hands     | one more craft a day; recipes need 1 less wax (at least 1) |

## Progression

**Renown** comes from delighted customers, goals and ribbons.

| Tier | Name                    | Renown | Brings                              |
| ---- | ----------------------- | ------ | ----------------------------------- |
| 0    | New in the Hollow       | 0      | clover, lavender                    |
| 1    | Known at the market     | 10     | borage, sunflower; a third customer |
| 2    | The village’s beekeeper | 30     | buckwheat, ivy; lip balm, wax wraps |
| 3    | Talk of the valley      | 70     | gift basket                         |
| 4    | Pride of the county     | 140    | a golden veil for the wardrobe      |

**Goals.** Up to three goals are open at a time, taken in order from the list
in `content/goals.js`, skipping any whose season or prerequisite is not met.
A met goal is claimed with a tap for its reward (coins, seeds, a recipe, a
hat). The first few are the tutorial: start a day, harvest a jar, sell it,
plant clover, make a pure honey. Later ones introduce second hives, the
workshop, swarms, mites, each plot, the Honey Show and winter. The list runs
past the first year: every honey, every ★★★, every fact, every heart.

**The bee book.** Facts unlock at firsts. The core raises a trigger key and
`content/facts.js` maps keys to facts; a key with no fact is ignored. Keys:

`first-day`, `first-harvest`, `first-pure`, `first-blend`, `first-three-star`,
`first-sale`, `first-rain`, `first-move`, `first-wax`, `first-candle`,
`first-soap`, `first-balm`, `first-bunch`, `first-queen-cells`, `first-swarm`,
`first-catch`, `first-split`, `first-mites`, `first-remedy`, `first-wasps`,
`first-feed`, `first-hungry`, `first-upgrade`, `second-hive`, `strength-max`,
`season-summer`, `season-autumn`, `season-winter`, `second-spring`,
`plot-pond`, `plot-orchard`, `plot-hill`, `first-ribbon`, `honey-<flower>`
(first jar of each of the 11 honeys), `renown-<tier>` (1–4) and
`gift-<regular>-<n>` for regulars' gifts.

**The first year ends** on the morning of day 29 with "A year in Honey
Hollow": jars made, kinds found, ribbons, facts, then the credits ("An idea
from Sari"). The game then carries on for as long as you like, with a shorter
almanac page each new spring. The almanac keeps every year as it stood at its
end: jars, kinds, coins earned, ribbons, hives, plots, renown, goals, and the
hearts each regular had.

## Balance targets

What the simulator's four keepers should show over many seeds
(`npm run test:honey-hollow:sim`; the numbers are `TARGETS` in
`tests/honey-hollow/sim/run.mjs`):

- A sensible keeper has a first jar by day 3 and 120–220 coins earned by the
  end of spring.
- They can afford the Pond Bank during the first summer (days 8–14) and the
  Old Orchard by the end of the first year, and buy Heather Hill in the second
  year.
- They end year 1 with 4–7 hives, at least 4 kinds of honey (5 by the end of
  the second spring) and tier 2–3.
- They meet queen cells in the first year on every seed, split a hive at least
  once, and lose no strength to mites.
- A lazy keeper (never moves anything, never looks in, sells everything to the
  grocer) still grows year on year, at 15–50% of the sensible keeper's pace;
  they lose a swarm, catch one, and lose strength to mites.
- A greedy keeper (takes every jar in autumn) comes out of winter weaker but
  has recovered by summer.
- Purity matters: the sensible keeper earns at least 25% more per jar than
  the lazy one.
- A completionist (the sensible keeper, also chasing every goal) has claimed
  every goal within 4 years on at least two seeds in three, and has every
  flower's honey at three stars. Every goal is claimed by some keeper.
- Nobody reaches a dead end: stripped of every bed, coin and jar, each keeper
  earns again.
