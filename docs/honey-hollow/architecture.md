# Architecture

Honey Hollow is built the way The Brine Nook was (see
`docs/ferment/architecture.md`), because that shape is what let agents build
a 10,000-line game without a person reading the code.

## The idea

All rules sit in a pure, seeded core that owns one plain JSON state object.
The screens never change the state: a tap becomes an action, the core applies
it, and the screens redraw from the new state and the events it returned.

```
tap ──▶ action ──▶ core.step(state, action) ──▶ { state, events } ──▶ ui redraws
                                │
                 createStore("honey-hollow") saves state as JSON
```

A seed plus a list of actions replays any game exactly. That is how bugs are
reproduced, how the balance is tuned by bots, and how browser tests jump
straight to any position.

## Where things live

```
games/honey-hollow/
  index.html          loads ui/*.css and ui/main.js
  art-gallery.html    every painted piece on one page, for looking at
  jsconfig.json       dev-only type check (files starting with // @ts-check)
  core/               pure rules. No DOM, no Date, no Math.random.
                      Everything outside imports only core/index.js.
    index.js          the public API (below)
    state.js          SLICES (slice → defaults), newGame, loadSave
    step.js           step() and ACTIONS (action type → handler)
    rng.js            named random streams
    calendar.js       seasons, weather, bloom stages
    land.js           plots, squares, planting, reach
    hives.js          forage plan, stores, harvest, growth, swarms, mites, wasps
    market.js         prices, customers, wishes, selling, show, fair
    workshop.js       recipes and crafting
    progress.js       renown, goals, unlocks, stats, year end
    book.js           trigger keys → facts
    keeper.js         the beekeeper's look, talents, wardrobe
    util.js           rounding, cloning, the purse
    types.js          JSDoc types for state, actions, events
  content/            data, no logic
    tuning.js         every number that is not in a table
    flowers.js  honeys.js  hives.js  plots.js  goods.js  regulars.js
    goals.js  talents.js  wardrobe.js  facts.js  words.js
  ui/
    main.js           boot, store, save, the loop, which screen is up
    paint/            the watercolour engine (below)
    art/              what gets painted: flowers, hives, bees, people, goods
    fonts/            vendored OFL fonts with their licences
    *.js, *.css       one module (and stylesheet) per screen
tests/honey-hollow/
  core/               node --test: rules, fuzzing, purity, saves, replays
  sim/                bots that play years; the balance report
  browser/            phone flows and screenshots (Chromium)
docs/honey-hollow/    these notes
```

## The core API

Everything is exported from `core/index.js`.

- `newGame(seed)` → a fresh state on the morning of day 1, before the keeper
  is made (`state.keeper.made === false`).
- `loadSave(raw)` → a playable state, or `null`. Fills any missing slice, any
  missing field in a slice and any missing field of a hive from its defaults,
  so old saves keep working, and mends what a damaged save gets wrong (an id
  counter behind its ids, a tier that does not follow renown, a colony too big
  for its hive). `null` only for something that was never a save or cannot be
  played. `tests/honey-hollow/core/fixtures/` holds saves every build must go
  on loading.
- `step(state, action)` → `{ state, events }`. Never touches its input. A
  refused action returns the same state object and one
  `{ type: "rejected", action, why }` event (`action` is the action's type);
  `why` is a short stable code that the UI turns into words. All of them are
  listed under "Why codes" below, and a test holds the list to the code.
- Constants and content are re-exported: `TUNING` (every named number),
  `FLOWERS`, `HONEYS`, `TRAITS`, `HIVES`, `PLOTS`, `TERRAIN`, `START`,
  `GOODS`, `RECIPES`, `FAMILIES`, `BUNCHES`, `REGULARS`, `GOALS`, `TIERS`,
  `WARDROBE`, `LOOK_PARTS`, `DEFAULT_LOOK`, `HAIR_TWINS`, `TALENTS`, `FACTS`,
  each table with its `*_IDS` list in display order (`FLOWER_IDS`,
  `HONEY_IDS`, `HIVE_IDS`, `PLOT_IDS`, `GOOD_IDS`, `RECIPE_IDS`,
  `REGULAR_IDS`, `GOAL_IDS`, `TALENT_IDS`). Rows carry the player-facing
  `name` and `blurb`. `TRAIT_NAMES` gives each honey trait its word, in
  `TRAITS` order; `MEASURES` is what a goal can count and `GOALS_OPEN` how
  many goals show at once.

Randomness is five named streams kept in `meta.rng` (`weather`, `customers`,
`wishes`, `market`, `wasps`), so a seed plus an action list replays a game
exactly, and drawing one more customer never changes the weather.

### State

One slice per system; each is a key in `SLICES` with its defaults.

```
meta     { v, seed, nextId, rng: { [stream]: n } }
clock    { day, phase: "morning" | "day" | "evening", tick }       tick 0–240
weather  { today, tomorrow }      sunny | cloudy | windy | rain | frost | snow
keeper   { made, name, body, skin, hair, hairColor, overalls, shirt, hat,
           beard, glasses, talent }
wardrobe { owned: [hatId] }                       hats earned, beyond the free ones
purse    { coins, today: { earned, spent } }
land     { plots: { [plotId]: { owned, squares: [36 × null | bed | hiveRef] } } }
           bed     = { t: "bed", flower, planted: day, picked: day | 0, wild? }
           hiveRef = { t: "hive", id }
hives    { list: [hive], spare, swarms: [{ id, plot, x, y, strength, day, from }] }
           hive = { id, plot, x, y, type, strength, grow, stores: { [source]: units },
                    mites, sick, swarmCells, moved: day | 0, from: { plot, x, y } | null,
                    dusted: day | 0, hungry, raid: { until: tick } | null,
                    harvested: day | 0, swarmYear: year | 0,
                    today: { got, lost, by: { [source]: units }, raided } }
           source = a flower id, "wild" (the hedgerows) or "syrup"
plan     { day, hives: { [hiveId]: { total, wild, by: { [source]: units },
                                     beds: [{ x, y, flower, units }] } },
           wasps: null | { hive, at: tick } }
stock    { honey: { ["<flower>:<stars>" | "blend:0"]: jars }, wax, waxBits,
           bunches: { [flower]: n }, goods: { [goodId]: n }, seeds: { [flower]: n },
           remedy, syrup }
market   { day, mood: { [key]: mult }, glut: { [key]: n }, queue: [customer], at, open,
           show: null | { entered, entries }, fair }
           key      = "honey:<flower>" | "honey:blend" | "good:<goodId>"
           customer = { id, who: regularId | null, look: seed,
                        wish: { type: "any" | "kind" | "trait" | "finest" | "gift", value?, qty },
                        bought: null | { product, n, coins, mood } }
regulars { hearts: { [id]: n }, gifts: { [id]: n } }
workshop { made: { day, n } }
progress { renown, tier, claimed: [goalId], ready: [goalId], stats: { … },
           unlocked: { flowers: [id], recipes: [id] },
           ribbons: [{ year, honey, medal }], year: { … },
           today: { jars, stall, grocer, hearts }, almanac: [summary], yearsSeen }
book     { facts: [factId], unread: [factId], fired: [triggerKey] }
```

Squares are indexed `y * 6 + x`. Terrain is not in the save; it comes from
`PLOTS[plotId].terrain` (six strings of six: `.` grass, `h` hill, `~` water,
`r` rock, `T` apple tree). Products share one id space:
`honey:<flower>:<stars>`, `honey:blend:0`, `good:<goodId>`. A wish of type
`kind` has a value of `honey:<flower>`, `good:<goodId>` or `family:<family>`;
a `trait` wish has a trait id.

A hive's `harvested` is the day honey was last taken from it (which is what
keeps a colony with queen cells at home that night) and `swarmYear` the year
it last raised queen cells, was split or was caught: once a year at most.
`today.raided` is what wasps carried off today. `progress.today` is the day's
tally for the night card: jars taken, coins at the stall and from the grocer,
hearts won; `sleep` wipes it. An almanac `summary` is
`{ year, jars, pure, kinds, earned, ribbons, facts, hives, plots, renown, tier, goals, hearts, heartsBy: { [regularId]: n }, friends, hungryWinter, coins }`,
everything as it stood at that year's end (`friends` counts regulars with
three hearts or more). Years written by an older build have no `heartsBy` or
`friends`.

### Actions

| Action         | Fields                                                                                          | What it does                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `createKeeper` | `keeper: { name, body, skin, hair, hairColor, overalls, shirt, hat, beard?, glasses?, talent }` | Makes the beekeeper. Until then everything else is refused.                                                                               |
| `setLook`      | `look: { any look part, name? }`                                                                | Changes clothes, hair or name from the wardrobe. Never the talent.                                                                        |
| `startDay`     |                                                                                                 | Fixes the forage plan and sends the bees out. In winter, straight to the evening.                                                         |
| `tick`         | `n?`                                                                                            | Flies up to `n` ticks (default 1). Stops early when wasps arrive. The day ends at tick 240.                                               |
| `sleep`        |                                                                                                 | Closes the stall, feeds the colonies, grows them, turns the page.                                                                         |
| `plant`        | `plot, x, y, flower`                                                                            | A bed, from a seed in stock or bought on the spot.                                                                                        |
| `dig`          | `plot, x, y`                                                                                    | Removes a bed. No refund.                                                                                                                 |
| `pickBunch`    | `plot, x, y`                                                                                    | Morning only: a bunch from a blooming lavender, mint or thyme bed. It gives no nectar that day.                                           |
| `buyPlot`      | `plot`                                                                                          |                                                                                                                                           |
| `buyHive`      | `plot, x, y`                                                                                    | A straw skep with a small colony.                                                                                                         |
| `moveHive`     | `hive, plot, x, y`                                                                              | Morning only. Half a day's flying, unless moved back.                                                                                     |
| `upgradeHive`  | `hive`                                                                                          | The next hive type.                                                                                                                       |
| `harvest`      | `hive, jars?`                                                                                   | Jars from the stores (default 1), each of the honey the stores are now.                                                                   |
| `feed`         | `hive, n?`                                                                                      | Syrup into the stores.                                                                                                                    |
| `dust`         | `hive`                                                                                          | Sugar dusting, once a day for each hive.                                                                                                  |
| `remedy`       | `hive`                                                                                          | Thyme remedy.                                                                                                                             |
| `split`        | `hive, plot, x, y`                                                                              | Morning only. Half the colony into a spare hive.                                                                                          |
| `catchSwarm`   | `swarm, plot, x, y`                                                                             | A hanging swarm into a spare hive.                                                                                                        |
| `fendWasps`    | `hive`                                                                                          | Narrows the entrance during a raid.                                                                                                       |
| `buy`          | `item, n?`                                                                                      | `syrup`, `spare` or `remedy` from the shop.                                                                                               |
| `enterShow`    | `honeys: [product]`                                                                             | One to three pure honeys of different flowers, on the Honey Show evening.                                                                 |
| `openStall`    |                                                                                                 | Tonight's customers step up.                                                                                                              |
| `offer`        | `product, customer?, n?`                                                                        | Sells the customer at the stall one product: `n` of it (from 1 up to what they want and what there is), or left out as many as they want. |
| `pass`         | `customer?`                                                                                     | Lets them go.                                                                                                                             |
| `sellToGrocer` | `product, n`                                                                                    | Evening, any amount.                                                                                                                      |
| `craft`        | `recipe, bunch?, honey?, candle?, soap?`                                                        | Makes one thing; the optional fields choose what goes in.                                                                                 |
| `claimGoal`    | `goal`                                                                                          | Takes a met goal's reward.                                                                                                                |
| `readFact`     | `fact`                                                                                          | Marks a bee book page read.                                                                                                               |
| `seenYear`     | `year`                                                                                          | Marks a year page seen.                                                                                                                   |

A new action is one line in `ACTIONS` pointing at a handler
`(state, action, events) => why | undefined` that mutates the copy `step()`
made. After every accepted action `step()` runs `progress.track(state, events)`:
it tallies the events into `progress.stats`, raises the bee book's trigger
keys, grants what a new tier or plot unlocks and marks goals ready.

### Events

| Event           | Carries                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `keeperMade`    | `keeper`                                                                               |
| `lookSet`       | `keeper`                                                                               |
| `dayStarted`    | `day, weather, flying, plan` (the plan slice's `hives`)                                |
| `dayEnded`      | `day, hives: [{ id, got, lost, by }]`                                                  |
| `slept`         | `day, eaten: [{ hive, units, hungry }], weather, tomorrow`                             |
| `seasonChanged` | `season, year`                                                                         |
| `yearEnded`     | `year, summary` (the almanac entry: see State)                                         |
| `yearSeen`      | `year`                                                                                 |
| `wildflowers`   | `plot, flower, squares` (the season's wild flower seeded itself on a bare Home Meadow) |
| `planted`       | `plot, x, y, flower, cost`                                                             |
| `dug`           | `plot, x, y, flower`                                                                   |
| `picked`        | `plot, x, y, flower`                                                                   |
| `plotBought`    | `plot, price`                                                                          |
| `hiveBought`    | `hive, plot, x, y, cost, hives`                                                        |
| `hiveMoved`     | `hive, from, to, half`                                                                 |
| `hiveUpgraded`  | `hive, hiveType, cost, rank`                                                           |
| `harvested`     | `hive, jars, product, flower, stars, purity, wax`                                      |
| `fed`           | `hive, n, units`                                                                       |
| `dusted`        | `hive, mites`                                                                          |
| `remedied`      | `hive, mites`                                                                          |
| `hungry`        | `hive, strength, lost, winter`                                                         |
| `grew`          | `hive, strength, max`                                                                  |
| `queenCells`    | `hive`                                                                                 |
| `swarmed`       | `hive, strength, swarm`                                                                |
| `swarmCaught`   | `swarm, hive, strength, plot, x, y, hives`                                             |
| `swarmLost`     | `swarm, strength`                                                                      |
| `split`         | `hive, strength, made, madeStrength, plot, x, y, hives`                                |
| `mitesSpotted`  | `hive, mites`                                                                          |
| `mitesHarmed`   | `hive, strength`                                                                       |
| `waspsCame`     | `hive, until`                                                                          |
| `waspsFended`   | `hive`                                                                                 |
| `waspsRaided`   | `hive, lost`                                                                           |
| `bought`        | `item, n, coins`                                                                       |
| `stallOpened`   | `queue, fair`                                                                          |
| `sold`          | `customer, who, wish, product, n, coins, mood: "delighted" or "fine", renown, fair`    |
| `passed`        | `customer, who`                                                                        |
| `soldToGrocer`  | `product, n, coins`                                                                    |
| `showJudged`    | `year, entries: [{ product, flower, stars, medal, coins, renown }], coins, renown`     |
| `crafted`       | `recipe, made, product, family, used, left`                                            |
| `goalReady`     | `goal`                                                                                 |
| `goalClaimed`   | `goal, reward`                                                                         |
| `renownUp`      | `tier, name`                                                                           |
| `unlocked`      | `what: "flower", "recipe" or "wardrobe", id`                                           |
| `heart`         | `regular, hearts, gift?: { n, reward }`                                                |
| `factUnlocked`  | `fact, trigger`                                                                        |
| `factRead`      | `fact`                                                                                 |
| `rejected`      | `action, why`                                                                          |

There is no tick event: the UI reads `clock.tick` and each hive's `today`.

### Why codes

| `why`             | From                                                               | Meaning                                                                                             |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `unknown-action`  | any                                                                | Not an action the game knows.                                                                       |
| `no-keeper`       | any but `createKeeper`                                             | The beekeeper has not been made yet.                                                                |
| `already-made`    | `createKeeper`                                                     | There is a beekeeper already.                                                                       |
| `bad-look`        | `createKeeper`, `setLook`                                          | A look part is missing or not one the wardrobe lists.                                               |
| `bad-name`        | `createKeeper`, `setLook`                                          | The name is empty or longer than 14 characters once trimmed.                                        |
| `bad-talent`      | `createKeeper`                                                     | Not one of the four talents.                                                                        |
| `not-in-wardrobe` | `setLook`                                                          | A hat that has not been earned yet.                                                                 |
| `not-morning`     | `startDay`, `moveHive`, `split`, `pickBunch`                       | Only in the morning.                                                                                |
| `not-day`         | `tick`, `fendWasps`                                                | Only while the bees are out.                                                                        |
| `not-evening`     | `sleep`, `openStall`, `offer`, `pass`, `sellToGrocer`, `enterShow` | Only in the evening.                                                                                |
| `not-now`         | `craft`                                                            | Not while the bees are out.                                                                         |
| `bad-args`        | `tick`, `harvest`, `feed`, `buy`, `offer`, `sellToGrocer`          | A count that is not a whole number of one or more (for `offer`, also more than the customer wants). |
| `no-plot`         | land and hive actions                                              | Not a plot.                                                                                         |
| `off-plot`        | land and hive actions                                              | Not a square on the plot.                                                                           |
| `not-owned`       | land and hive actions                                              | That plot has not been bought.                                                                      |
| `bad-ground`      | `plant`, `buyHive`, `moveHive`, `split`, `catchSwarm`              | Water, rock or an apple tree.                                                                       |
| `square-taken`    | the same                                                           | Something is on that square already.                                                                |
| `plot-full`       | `buyHive`, `moveHive`, `split`, `catchSwarm`                       | The plot has its four hives.                                                                        |
| `no-flower`       | `plant`                                                            | Not a flower.                                                                                       |
| `not-plantable`   | `plant`                                                            | Apple trees are not planted.                                                                        |
| `needs-hill`      | `plant`                                                            | Thyme and heather only grow on hill ground.                                                         |
| `needs-water`     | `plant`                                                            | Mint only grows on a square beside water.                                                           |
| `flower-locked`   | `plant`                                                            | The seed is not in the shop yet and there is none in stock.                                         |
| `no-coins`        | anything that costs                                                | Not enough coins.                                                                                   |
| `no-bed`          | `dig`, `pickBunch`                                                 | No bed on that square.                                                                              |
| `no-bunch`        | `pickBunch`, `craft`                                               | That flower gives no bunch; or the recipe needs a bunch you do not have.                            |
| `not-blooming`    | `pickBunch`                                                        | The bed is not in bloom today.                                                                      |
| `already-picked`  | `pickBunch`                                                        | A bunch was cut from that bed this year already.                                                    |
| `owned`           | `buyPlot`                                                          | The plot is already yours.                                                                          |
| `no-hive`         | hive actions                                                       | No hive with that id.                                                                               |
| `same-square`     | `moveHive`                                                         | It is standing there.                                                                               |
| `top-hive`        | `upgradeHive`                                                      | A tall stack is as big as hives get.                                                                |
| `no-jars`         | `harvest`                                                          | Fewer whole jars in the stores than asked for.                                                      |
| `no-syrup`        | `feed`                                                             | No syrup in stock.                                                                                  |
| `hive-full`       | `feed`                                                             | No room for a portion of syrup.                                                                     |
| `no-mites`        | `dust`, `remedy`                                                   | The colony has no mites.                                                                            |
| `already-dusted`  | `dust`                                                             | Dusted once today already.                                                                          |
| `no-remedy`       | `remedy`                                                           | No remedy in stock.                                                                                 |
| `too-weak`        | `split`                                                            | A colony under strength 4 cannot be split.                                                          |
| `no-spare`        | `split`, `catchSwarm`                                              | No spare hive to put them in.                                                                       |
| `no-swarm`        | `catchSwarm`                                                       | No swarm with that id.                                                                              |
| `no-raid`         | `fendWasps`                                                        | No wasps at that hive.                                                                              |
| `not-for-sale`    | `buy`                                                              | Not something the shop sells.                                                                       |
| `not-yet`         | `buy`                                                              | The shop does not stock it until the second week.                                                   |
| `stall-open`      | `openStall`, `enterShow`                                           | The stall is already open (the show is judged before it opens).                                     |
| `stall-closed`    | `offer`, `pass`                                                    | Open the stall first.                                                                               |
| `no-customer`     | `offer`, `pass`                                                    | Nobody is waiting.                                                                                  |
| `not-your-turn`   | `offer`, `pass`                                                    | That customer is not the one at the stall.                                                          |
| `no-product`      | `offer`, `sellToGrocer`, `enterShow`                               | Not a product id.                                                                                   |
| `no-stock`        | `offer`, `sellToGrocer`, `enterShow`                               | None of it (or not that many) in stock.                                                             |
| `no-show`         | `enterShow`                                                        | The Honey Show is not this evening.                                                                 |
| `show-done`       | `enterShow`                                                        | Already entered this year.                                                                          |
| `bad-entry`       | `enterShow`                                                        | Not a list of one to three honeys.                                                                  |
| `not-pure`        | `enterShow`                                                        | Blends cannot be entered.                                                                           |
| `same-honey`      | `enterShow`                                                        | Each entry must be a different flower.                                                              |
| `workshop-closed` | `craft`                                                            | No wax has ever been made.                                                                          |
| `no-recipe`       | `craft`                                                            | Not a recipe.                                                                                       |
| `recipe-locked`   | `craft`                                                            | Not unlocked yet.                                                                                   |
| `no-crafts-left`  | `craft`                                                            | Today's crafts are used up.                                                                         |
| `no-wax`          | `craft`                                                            | Not enough wax.                                                                                     |
| `no-honey`        | `craft`                                                            | The recipe needs a jar you do not have (the gift basket needs a pure one).                          |
| `no-candle`       | `craft`                                                            | The gift basket needs a candle.                                                                     |
| `no-soap`         | `craft`                                                            | The gift basket needs a soap.                                                                       |
| `no-goal`         | `claimGoal`                                                        | Not a goal.                                                                                         |
| `goal-not-open`   | `claimGoal`                                                        | Claimed already, or not on the list yet.                                                            |
| `goal-not-ready`  | `claimGoal`                                                        | Not met yet.                                                                                        |
| `no-fact`         | `readFact`                                                         | Not a fact you have found.                                                                          |
| `already-read`    | `readFact`                                                         | Read already.                                                                                       |
| `nothing-to-see`  | `seenYear`                                                         | No year page is waiting for that year.                                                              |

`canPlant`, `canPlaceHive`, `canBuyPlot`, `canBuyHive`, `canCatchSwarm`,
`canCraftNow` and `careOf` return the same codes, so the UI can say why a
square or a button is greyed out before anything is tapped.

### Read-only helpers

For drawing and for the bots; all pure. A helper that answers "may I?" returns
`true` or the `why` code `step()` would refuse with. It asks the same code the
handler runs, and the fuzzer holds the two equal.

- Calendar: `calendarOf(day)` → `{ day, year, doy, season, seasonName, dayOfSeason }`
  (`doy` 0–27, `season` 0–3), `bloomWindow(state, flower)` → `{ from, to }` in
  `doy`, with the keeper's talent applied, `inBloom(state, flower, day)`,
  `stageOf(state, bed, day?)` → `"seed" | "leaf" | "bud" | "bloom" | "faded" | "dormant"`,
  `treeStageOf(state, day?)` → `"leaf" | "bud" | "bloom" | "fruit" | "dormant"`
  for the orchard's trees, `flightOf(state, plot)` and
  `flightFor(weather, plot)` → the flying factor, `fliesToday(state, plot)` →
  whether the bees fly there at all today, `daysUntil(state, doy)` → days to
  the next day that falls on that day of the year (0 when it is today),
  `bloomsWith(state, flower)` → `[{ flower, from, to, days }]`, the flowers
  whose windows overlap it and the days they share, `flowersKnown(state)` →
  the flower ids the keeper knows (seed in the shop or in hand, a bed on owned
  land, apple blossom once the orchard is owned).
- Night card: `tomorrow(state)` → `{ day, season, weather, starts, lastDay, ended, hives: [{ id, flags }], spoils: [hiveId], show, fair }`.
- Land: `terrainAt(plot, x, y)`, `squareAt(state, plot, x, y)`,
  `reachOf(plot, x, y)` → `[{ x, y, w }]`, `nearWater(plot, x, y)`,
  `flowerOpen(state, flower)`, `whereGrows(state, flower)` → the plot ids with
  ground the flower could ever stand on (by terrain alone, owned or not),
  `canPlant(state, plot, x, y, flower)`,
  `canPlaceHive(state, plot, x, y, movingHiveId?)` and
  `canBuyPlot(state, plot)` → `true` or a `why` code.
- Hives: `forecast(state, hiveId, at?, opts?)` → what a hive will bring home on
  its next flight (today's in the morning and while the bees are out,
  tomorrow's after that), where it stands or at `at` `{ plot, x, y }`:
  `{ day, weather, hive, plot, x, y, carry, total, wild, by, beds, got, left, room, stored, storesAfter, verdict, moved, settled, others }`.
  `total`, `by` and `beds` are the whole day's flight; `got` is what of it is
  home already and `left` what is still to come, so during the day nothing is
  counted twice; `room` is what the hive can still hold, `stored` what of
  `total` ends up in it, `storesAfter` its stores by source after the flight
  (tonight's meal taken first when the flight is tomorrow's) and `verdict` the
  honey they will be; `moved` says the half day of a moved hive is in the
  numbers, and `settled` `{ total, by }` is the same day without it; `others`
  lists the hives whose day would change, as `{ id, total, was }`. `hiveId`
  may be `null` with `at` for a colony that is not standing yet: a skep bought
  there, or with `opts.split` (a hive id) the half a split would put there,
  with `opts.swarm` (a swarm id) that swarm caught, with `opts.strength` and
  `opts.stores` any colony. Other `opts`: `day`, `weather`, `settled` (leave
  the half day out). It is the same code that makes and delivers the day's
  plan, and tests hold the two equal. `forecastPlot(state, plot, opts?)` → the
  plan for every hive on a plot. `spoils(state, hiveId)` → true when the next
  flight would turn a whole jar of pure honey in that hive into a blend,
  another flower's honey or a jar with fewer stars.
  `careOf(state, hiveId)` → `{ harvest, feed, dust, remedy, upgrade, split, move, fendWasps }`,
  each `true` or a `why` code (`harvest` and `feed` for one jar and one
  portion; `split` and `move` say whether any square could take the hive:
  `plot-full` or `square-taken` when none can). `canBuyHive(state)` → `true`,
  `plot-full`, `square-taken` or `no-coins`; `canCatchSwarm(state, swarmId)` →
  `true`, `no-swarm`, `no-spare`, `plot-full` or `square-taken`;
  `newHiveType(state)` → the hive type a purchase, a split or a caught swarm
  gives; `hiveNumber(state, hiveId)` → the number a hive goes by on screen
  (its place in `hives.list` from 1; 0 for none). Also `verdictOf(stores)` →
  `{ product, flower, purity, stars }`, `totalOf(stores)`, `jarsIn(hive)`,
  `capacityOf(hive)`, `limitOf(hive)`, `mealOf(hive, day)`,
  `winterNeed(state, hive)`, `hiveCost(state)`, `upgradeOf(hive)`,
  `hiveById(state, id)`, and `attentionOf(state, hive)` → flags for the hive's
  badge: `wasps`, `queen-cells` (it swarms tonight unless honey is taken from
  it today, it gets a bigger hive or it is split), `swarm-risk` (as strong as
  its hive allows in swarm season: it builds queen cells tonight), `hungry`,
  `low`, `winter-short`, `mites-bad`, `mites`, `full`.
- Market: `productInfo(product)`, `priceOf(state, product)` (today's price of
  one unit, before the buyer's share), `quote(state, product, n, "delighted" | "fine" | "grocer")`
  → the coins a sale would bring, `grocerQuote(state, basket)` → the coins the
  grocer would pay right now for a whole basket `{ [product]: n }`, glut
  included, `shelf(state)` → what you can sell, with counts and prices,
  `satisfies(wish, product)`, `makeable(state)` → what customers may wish for,
  `customersFor(tier)`.
- Workshop: `workshopOpen(state)`, `canCraftNow(state)` → `true`, `not-now`,
  `workshop-closed` or `no-crafts-left`, `recipesNow(state)` → each unlocked
  recipe with `{ recipe, name, makes, wax, options, missing, canMake }`
  (`missing` lists `why` codes, what `canCraftNow` says among them),
  `craftsLeft(state)`, `waxFor(state, recipe)`.
- Progress: `goalsNow(state)` → up to three `{ goal, have, need, ready }`,
  `measure(state, goal)`, `tierOf(state)` → `{ tier, name, renown, next, customers }`,
  `shopNow(state)` → `{ seeds, items, plots, hive }` on sale with prices,
  `yearDue(state)` → the year page waiting to be shown, or `null`.
- Keeper: `talentOf(state)`, `owns(state, part, id)`, `hairFor(body, hair)` →
  the same hair on the other body (by `HAIR_TWINS`), `wardrobeNow(state)` →
  every look part with rows `{ id, name, owned, unlock }`. `unlock` is the
  content's own row with `type` and `id` added: `start` (id `null`), `goal`
  (the goal's id), `tier` (the tier), `regular` (the regular's id, with `n`,
  which of their gifts, and `hearts`, the hearts that bring it) or `show` (the
  first ribbon at the Honey Show; id `null`).
- `TRIGGERS`: every bee book key the core can raise.

## The watercolour engine

`ui/paint/` turns simple shapes into watercolour once, into cached bitmaps;
the screens then only draw bitmaps. Nothing is painted per frame.

- `paint/rng.js`: a seeded generator, so a sprite looks the same every time.
- `paint/wash.js`: `wash(ctx, points, color, opts)` lays a shape down as many
  nearly transparent, slightly deformed copies of itself, which is what gives
  soft bleeding edges and uneven pigment. Also `wetBlend` (two colours running
  into each other), `drybrush`, `pencil` (a wobbly graphite line), `splatter`,
  `bloomSpot` (a water mark).
- `paint/paper.js`: cold-press paper grain, multiplied over every sprite.
- `paint/sprite.js`: `sprite(key, w, h, draw)` paints into an offscreen
  canvas at device pixel ratio, once, and returns it. `await paintAll(list,
onProgress)` spreads the work over frames for the loading screen.
- `paint/palette.js`: the named colours. Art uses palette names, never hex.

`ui/art/*.js` export functions that return sprites: `bed(flower, stage,
variant)`, `hive(type, state)`, `bee(frame)`, `ground(plot, season)`,
`keeper(look, pose)`, `villager(id | seed)`, `jar(flower, stars)`,
`good(id)`, `icon(name)`. Every one appears on `art-gallery.html`.

## The screens

The meadow is a canvas that draws cached sprites every frame: ground, beds,
hives, the keeper, bees, weather, light. Everything with words on it (the top
bar, the action bar, sheets, the stall, the workshop, the bee book) is DOM, so
text wraps properly and tests tap real elements.

Grid positions are the only geometry that is stored; pixels are worked out
from the canvas size on every frame, so a resize (the iOS URL bar) cannot
break anything.

The browser test hook is `window.__hollow`: `state` (get or set),
`dispatch(action)` returning the events, `core`, and `squareRect(plot, x, y)`
(the on-screen rectangle of a square, for tapping the canvas).

## Tests

| Layer             | Catches                                                                                                                                           | Lives in                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Rule tests        | a single rule is wrong: one file for each core module (`calendar`, `land`, `forage`, `hives`, `market`, `workshop`, `progress`, `book`, `keeper`) | `tests/honey-hollow/core/*.test.mjs`                  |
| Replay goldens    | anything that changed how a recorded game plays out (`UPDATE_GOLDENS=1` records them again)                                                       | `tests/honey-hollow/core/replay.test.mjs`, `goldens/` |
| Save fixtures     | a build that can no longer load an old save, or that loses something from it                                                                      | `tests/honey-hollow/core/save.test.mjs`, `fixtures/`  |
| Invariant fuzzing | impossible states; a save that does not round-trip; a helper that says something `step()` does not                                                | `tests/honey-hollow/core/fuzz.test.mjs`               |
| Purity check      | `Math.random`, `Date` or DOM inside the core; a screen importing past `core/index.js`                                                             | `tests/honey-hollow/core/purity.test.mjs`             |
| Content checks    | a fact with no source, a goal that measures nothing, a reward that does not exist                                                                 | `tests/honey-hollow/core/content.test.mjs`            |
| Notes check       | these notes and `rules.md` saying something the code does not                                                                                     | `tests/honey-hollow/core/docs.test.mjs`               |
| Balance sim       | the game got too easy, too hard or pointless; a goal nobody can reach                                                                             | `tests/honey-hollow/sim/`                             |
| Phone flows       | the real screen breaks or overflows on a small or large phone                                                                                     | `tests/honey-hollow/browser/`                         |
| Type check        | a wrong field name across modules                                                                                                                 | `npm run typecheck`                                   |
