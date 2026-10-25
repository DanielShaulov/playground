# Architecture

The shape the Milestone 0 core split moves the demo to. The thread that lands
a change to this shape updates this file in the same PR.

## The idea

All game rules sit in a pure, seeded core that owns one plain JSON state
object. The screens never change the state themselves: a tap becomes an
action, the core applies it, and the screens redraw from the new state and the
events it returned.

```
tap ──▶ action ──▶ core.step(state, action) ──▶ { state, events } ──▶ ui redraws
                                │
                     createStore("ferment") saves state as JSON
```

Because nothing outside the core changes the game, the Node tests cover every
rule, and a seed plus a list of actions replays any game exactly. That is how
a bug gets reproduced without a person.

## The pieces

- **`step(state, action)`** is the one entry point. Player inputs and the
  passing of time are both actions.
- **A fixed-step clock.** The open shop advances in fixed slices of in-game
  time. The screen accumulates real time and dispatches whole slices, so a
  fast and a slow phone play the same game.
- **Named random streams.** Customers, the market and jars each draw from
  their own seeded stream, so adding a draw to one system does not reshuffle
  the others and break unrelated tests.
- **State slices.** Each system owns one part of the save (`shelf`, `bench`,
  `orders`, `market`, `progress`) with its own defaults. Loading fills in any
  missing slice, so parallel PRs never fight over a save version number.
  Since the release, saves are kept: the release fixtures must always load,
  keep every saved field and play on. Renaming an id that a save stores (a
  recipe, a regular, an upgrade) breaks them; migrate in `loadSave()` instead.
- **Content as data.** Recipes, ingredients, regulars and upgrades are rows in
  `content/`. Adding a recipe is adding a row, not touching logic.
- **DOM and inline SVG, not canvas.** The game is jars, panels and buttons:
  SVG jars stay crisp on any phone, and tests tap real elements.

## Where things live

```
games/ferment/
  index.html        loads ui/style.css and ui/main.js
  core/             pure rules; import only core/index.js from outside
    index.js        public API (below) and a module map
    state.js        SLICES (slice name → defaults), newGame, loadSave
    step.js         step() and ACTIONS (action type → handler)
    clock.js        day cycle and the fixed-step tick
    shop.js         coins, reputation, brew / tipOut / serve
    customers.js    walk-ins, judging a jar, leaving
    orders.js       pre-orders, regulars (dropIn/welcome), bulk orders,
                    planFor, kept portions (hold/release)
    jars.js         flavour, ageing, add-in maths
    bench.js        pantry, experiments, discovery, recipe card, previewCurve
    progress.js     upgrades, shop tiers, goals ladder, shop pride (state.progress)
    decor.js        shop decor: what is owned and up in each spot (state.decor)
    market.js       today's stalls (stock, prices), buy, marketToday
    rng.js          named random streams
    types.js        JSDoc types for the state, actions and events
  content/          data: recipes, flavour bands, names, tuning numbers,
                    upgrades, tiers and goals
  ui/               main.js (state, input, loop, saving), shop.js (screen),
                    bench.js + recipe-card.js + bench.css (brewing bench),
                    board.js + board.css (order board and planner),
                    sheets.js, strip.js, text.js, dom.js, art/, style.css
    art/            jar.js (jars), customer.js (faces), ingredients.js
                    (pantry icons), scene.js (window + light by time of day);
                    every state is on art-gallery.html, all drawn in-house
```

## The core API

- `newGame(seed)` returns a fresh day-1 state.
- `loadSave(raw)` returns a playable state, filling missing slices (and
  missing fields inside a slice) from their defaults, or `null` to start fresh.
- `step(state, action)` returns `{ state, events }`. It never touches its
  input. A refused action returns the same state object and one
  `{ type: "rejected", action, why }` event.
- Read-only helpers for drawing: `flavour`, `isOver`, `bandOf`, `forecast`,
  `judge`, `dueFor`, plus `STEP` and `STEPS_PER_HOUR`. For the bench:
  `previewCurve(recipe, adds, n = 5)` (the time-lapse: `n` points from start
  to pop, the sweet spot in flavour and hours, `sooner` vs a plain jar, and
  the recipe the mix makes), `recipeCard(state, recipe)`, `resolveMix`,
  `menu(state)`, `unlocked(state, recipe)`, `lifeOf`, `ageAt`, `mixOf`, and `demand(recipe)` /
  `demandAt(recipe, f)` (the bell curve of where walk-ins want a recipe).
  For orders: `planFor(state, order, adds)` (where a jar started at the
  state's clock lands at pickup; the board passes the next morning after
  closing), `holdsOn(state, jar)` and `freePortions(state, jar, orderId?)`.
  `planFor(state, order, adds, slot)` uses the pace of the crock in `slot`.
  `forecast`, `lifeOf` and `ageAt` take a last `pace` argument (default 1):
  for a jar on the shelf pass `jar.pace ?? 1`, for a new one the slot's crock.
  For progression: `tierOf`, `slotCount`, `jarSize`, `crockAt(state, slot)`,
  `upgradeOffers(state)`, `goalNow(state)` (the open rung: `goal`, `text`,
  `have`, `ready`), `goalAt(i)`, `goalText(goal)` and `measure(state, kind)`.

The state's slices are `meta` (seed, id counter, `rng` stream positions),
`clock` (`day`, `phase`: morning | open | evening, `hour` since opening),
`shop` (`coins`, `rep`, `today`), `shelf` (`slots`), `customers` (`queue`,
`nextArrival`), `orders` (`list`, `offers`, `asked`), `bench` (`known` discovered recipes,
`hints`, `tried`: base recipe → ingredients mixed in) `pantry` (`stock`:
ingredient → count), `regulars` (`met`: regular → visits, plus `pending`/`seen` while a
standing regular is still dropping in as a walk-in), `market` (`day` the stalls were
set out, `items`: ingredient → `{ price, left }` for today) and `progress` (`upgrades`: id → levels,
`crocks`: shelf spot → crock, `tier`, `goal`, `stats`). A jar carries `servings` (left)
and `size` (portions it started with); one with add-ins carries `adds`, and one started in
a crock other than a plain one carries `pace`. The shelf's length is `slotCount(state)`, never `SLOTS`. A new system adds its slice with one
line in `SLICES`.

The actions are `tick { n }` (n fixed steps of 1/120 in-game hour; the screen
turns real time into whole steps at `HOUR_SECONDS` per hour), `open`, `close`,
`sleep`, `brew { slot, recipe, adds? }`, `tipOut { slot }`, `serve { slot }`,
`preorder`, `sendAway`, `buy { ingredient, n? }` (evening, at today's market) and
`experiment { recipe, adds }` (evening), and for orders
`startForOrder { orderId, slot, adds? }`, `hold { orderId, slot }`,
`release { slot, orderId? }`, `acceptOrder { orderId }` and
`declineOrder { orderId }`, and for progression `upgrade { id, slot? }` (evening; a
crock needs the slot) and `claimGoal`. After every accepted action `step()` calls
`progress.track`, which counts the goal stats, climbs tiers and says when a goal is met. A new action is one line in `ACTIONS` pointing at a
handler `(state, action, events) => reason | undefined` that mutates the copy
`step()` made. The events are `popped`, `arrived`, `left` (with `why`:
impatient | sent | closed), `served`, `preordered`, `brewed`, `tippedOut`,
`opened`, `closed`, `slept`, `bought`, `experimented` (with its `curve`),
`discovered` (`recipe`, `base`, `adds`), and for orders `booked`, `offered`,
`accepted`, `declined`, `regularJoined`, `startedForOrder`, `held`,
`released`, `delivered` (one per whole jar a bulk buyer takes) and `hinted`, and for
progression `upgraded`, `tierUp` (`tier`), `goalReady` and `claimedGoal` (`i`, `goal`).
The rules themselves, including the playtest decisions behind orders and the
board, are in rules.md.

The browser test hook is `window.__ferment`: `state` (get or set),
`dispatch(action)` returning the events, and `core`.

## Tests that lean on this shape

| Layer                 | Catches                                                                               | Lives in                 |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| Rule tests            | A single rule is wrong (pay, ripening, due dates)                                     | `tests/ferment/core/`    |
| Replay goldens        | Anything that changed how a recorded game plays out (`UPDATE_GOLDENS=1` regenerates)  | `tests/ferment/core/`    |
| Invariant fuzzing     | Impossible states: negative coins, a jar in two slots, a save that doesn't round-trip | `tests/ferment/core/`    |
| Purity check          | `Math.random`, `Date` or DOM inside the core                                          | `tests/ferment/core/`    |
| Release saves         | A build that can't load, or changes, a save players already have                      | `tests/ferment/core/`    |
| Balance sim           | The game got too easy or too hard (Milestone 3)                                       | `tests/ferment/sim/`     |
| Phone flows + gallery | The real screen breaks or overflows on a small or large phone                         | `tests/ferment/browser/` |
| Offline + phone speed | The installed game fails offline; a tap is slow on a slowed-down phone                | `tests/ferment/browser/` |
| Type check            | A wrong field name across modules                                                     | `npm run typecheck`      |
