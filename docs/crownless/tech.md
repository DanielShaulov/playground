# Crownless — how it is built

Same rules as every game in the repo (CLAUDE.md): no build step, no runtime
dependencies, ES modules, canvas, `localStorage`. What is different is the
size, so this is mostly about keeping a large game testable and fast without
tooling.

## Contents

1. [Layout](#1-layout)
2. [Rules and views](#2-rules-and-views)
3. [Determinism](#3-determinism)
4. [Saves](#4-saves)
5. [Performance](#5-performance)
6. [Drawing](#6-drawing)
7. [Testing and tuning](#7-testing-and-tuning)

---

## 1. Layout

```
games/crownless/
  index.html          from the template, plus a <link> to style.css
  style.css           sheets, tab bar, chips — on top of shared/style.css
  game.js             boot: shell, stage, loop, screen router, save/load
  rules/              pure: no DOM, no canvas, no storage, no Math.random
    rng.js            seeded streams; derive child seeds
    hex.js            axial coordinates, neighbours, distance, A*
    data/troops.js    army.md §2–4 as data
    data/world.js     terrain, places, buildings, contracts
    data/hero.js      backgrounds, skills, abilities, items
    battle.js         the battle (successor of the theory model, retired in M1)
    battle-ai.js      the plain AI and lord personalities
    battle-setup.js   parties → squads; deployment presets; terrain from hex
    worldgen.js       seed → map
    world.js          world state, the tick, movement, encounters, the week
    party.js          recruiting, upgrades, XP, wages, wounded, prisoners
    lords.js          lord and faction AI
    standing.js       renown, relations, roles, your realm
    siege.js          the strategic siege
    hollow.js         the crisis
    save.js           (de)serialise, version, size check
  view/
    layout.js         pure geometry: canvases, bars, chips, hit areas
    theme.js          palette, fonts, glyphs and banners
    map-view.js       camera, hexes, fog, places, parties, paths
    battle-view.js    field, soldiers, pennants, volleys, effects
    sheets.js         DOM bottom sheets: a tiny h() helper and each sheet
    input.js          tap, drag, long-press over shared createInput (M2: M1's
                      long-press is a dozen lines in game.js)
tests/crownless/
  README.md           how to run, what each script proves
  rules.mjs           the battle rules, checked in Node
  battle-sim.mjs      the theory model's report, on the real rules
  world-sim.mjs       AI-only realms for 200 days over many seeds
  harness.mjs         Playwright helpers: launch, tap via layout.js, read the save
  play.mjs            scripted sessions, one block per milestone
  shots.mjs           screenshots at 390×844 and 375×667
```

**From the shared layer** it uses `createShell`, `createStage`,
`createLoop`, `createInput` and `createStore("crownless")`. The shell is made
with no stats, because the HUD's content changes per screen (`ui.md` §1) and
`createShell` fixes its stats at creation: `game.js` appends one status
element of its own to the shell's `.hud` and rewrites it per screen. Nothing
in `shared/` changes.
Long-press and the map's drag-to-pan are built in `view/input.js` on top of
`createInput`'s `onDown` / `onMove` / `onUp`. Per CLAUDE.md, nothing moves
into `shared/` unless a second game needs it.

**The service worker** needs nothing: it caches whatever is loaded, so the
game is offline-capable after one online session.

## 2. Rules and views

The split Checkwiz made (`rules.js` pure, `layout.js` pure) is what makes this
size workable. Here it is the law:

- **Rules** take plain-JSON state and an action, mutate or return the state,
  and return a list of **events** for whoever is watching. They import nothing
  from `view/` and never touch the DOM, canvas, storage, time or
  `Math.random`. Node can run all of them.
- **Views** read state, draw it, turn taps into actions, and animate events.
  They never decide an outcome.

```
tap ──▶ view/input ──▶ action ──▶ rules ──▶ state′ + events ──▶ save
                                                  └──▶ views animate events
```

**The battle round is computed, then played.** `playRound(battle)` runs all
30 steps at once and returns a **timeline**: `frames`, 31 of them (the start,
then after each step), each a row per squad of `[x, y, fx, fy, n, state,
engaged]`; and `events` with the step they happened at — volleys, charges,
waverings, routs, rallies, abilities used, a squad out of arrows or in
position, the banner down, the end. Orders are already on the squads: the
AI's written by `plan`, a person's standing commands (`squad.cmd`) turned
into orders by `command`, both in `battle-ai.js`. The view animates the
timeline over three seconds. Rules never wait on rendering, the view can't
drift from the outcome, and a round can be skipped instantly.

**The world tick** is the same idea: `advance(world, hours)` returns events
("party X now at hex Y", "Greyford besieged", "week turned"), and the map
view animates parties between their old and new positions.

## 3. Determinism

- **One RNG per concern**, each a mulberry32 stream whose state is saved: the
  world stream, and per battle a seed derived from the world stream when the
  battle starts. A battle replays identically from its seed and orders, which
  is what makes odds, auto-resolve and resuming a battle mid-round agree.
- **Worldgen** takes only the seed. Terrain is never saved, only regenerated,
  so **any change to worldgen output is a save-breaking change** (§4).
- **Floating point.** `+ − × ÷` are bit-identical across JavaScript engines;
  `Math.pow`, `Math.hypot`, `Math.sin` and friends are not guaranteed to be.
  A battle seeded in Node (V8) may diverge from the same battle in Safari
  (JavaScriptCore) in the last bit and then visibly. That is fine for play,
  where odds and outcome are computed on the same device. It matters for
  tests: run browser tests in Chromium (V8, like Node), and let rules use a
  lookup table for `edge()` over tenths of a point from −30 to +30 (pierce
  makes armour fractional) rather than `Math.pow`. The table is built by
  repeated multiplication, and the rules use `Math.sqrt`, never `Math.hypot`.
- **Mirror symmetry is a determinism property too.** Side 0's coordinates sit
  near y = 140 and side 1's near 0, so the same sum rounds differently on each
  side; a rule that compares floats can break every tie the same way.
  `battle.md` §3.6 has the two places that did, and `tests/crownless/rules.mjs`
  checks that a mirror match without fortune stays a mirror.

## 4. Saves

One campaign, autosaved under `playground:crownless:save`. Settings and best
scores have their own keys, so a broken save never loses them.

**M1 saves a Skirmish** there (`rules/save.js`):
`{ v, setup, odds, phase: "deploy" | "plan" | "over", battle, result }`, where
`battle` is the whole battle as the rules keep it — it is plain JSON by
design — and `result` the result sheet's numbers once it ends. The best
record is `playground:crownless:best`, the camera choice
`playground:crownless:settings`.

**When to save.** After every map action; every 6 in-game hours while
travelling and when travel stops; and on `pagehide`. In battle, **save the
outcome before showing it**: a round is computed and saved, then animated; an
auto-resolve is saved before its result sheet appears. Otherwise closing the
app mid-animation would let a player see the outcome and plan the round
again — ironman in name only.

```js
{
  v: 1,                                   // SAVE_VERSION
  seed: 12345, size: "medium", difficulty: "normal",
  rng: 2891004417,                        // world stream state
  t: 3361,                                // hours since day 1, 00:00
  explored: "<base64 bitset>",
  player: { hero, party: { troops: [{ type, n, xp, wounded }], prisoners },
            gold, iron, horses, renown, role, liege, companions },
  places: [{ id, owner, garrison, buildings, pools, raidedUntil, siege }],
  lords: [{ id, faction, rank, gold, traits, relations, fiefs, party, captive }],
  factions: [{ id, wars, truces, marshal, weariness }],
  parties: [{ id, kind, owner, at: { q, r, to, progress }, goal, troops, gold }],
  hollow: { risen, blight: "<base64 bitset>", held },
  regalia: { sceptre, orb, seal },
  contracts: [ … ], journal: [ …the last 60 ],
  battle: null | { seed, setup, orders, round, state }
}
```

Only mutable fields are saved; everything static about a place regenerates
from the seed. Paths are recomputed, not stored. Estimate on Medium: ~100 KB;
budget 300 KB; `save.js` warns in the console above 200 KB.

**Versions.** Any incompatible change bumps `SAVE_VERSION`. A save from
another version is not loaded: the title says so and offers a new campaign,
keeping settings and best scores. During development (M2–M8) this will happen
often and that is acceptable for a toy; from M8 on, write a migration instead.

**Eviction.** Safari may clear the storage of a site that isn't on the home
screen after about a week unused. The repo README already says to Add to Home
Screen; the title screen should nudge toward it when not running standalone,
because a lost campaign is worse here than a lost high score.

## 5. Performance

Budgets for a mid-range phone (an iPhone 11 or Pixel 6a). Node on a laptop is
roughly 3–5× faster; measure on a device before trusting a margin.

| Work                               | Budget   | Measured / note                      |
| ---------------------------------- | -------- | ------------------------------------ |
| Battle round (30 steps, 12 squads) | ≤ 10 ms  | model: ~0.4 ms per round in Node     |
| Auto-resolve one battle            | ≤ 15 ms  | model: 4 ms in Node, 200 v 200       |
| Odds (8 auto-resolves)             | ≤ 120 ms | spread over frames if it shows       |
| World tick, 80 parties             | ≤ 1 ms   | movement only; re-path ≤ 10 a tick   |
| A simulated day, battles included  | ≤ 30 ms  | 24 ticks plus a few 4 ms battles     |
| A\* on Medium (2128 hexes)         | ≤ 2 ms   | cache by (from, to, terrain version) |
| Map frame                          | ≤ 6 ms   | ~150 visible hexes, drawn directly   |
| Battle frame, 600 soldiers         | ≤ 6 ms   | one path per colour, not per man     |
| Save write                         | ≤ 5 ms   | JSON.stringify of ~100 KB            |

**Measured in M1** (`npm run test:crownless:sim -- perf`; the browser numbers
from `play.mjs`, Chromium with the CPU throttled 4× as a stand-in for a phone):

| Work                                  | Node    | Chromium, CPU ÷4           |
| ------------------------------------- | ------- | -------------------------- |
| Battle round, 16 squads, 400 men      | ~0.7 ms | median ~4 ms, p95 9–12 ms  |
| Auto-resolve one battle (no timeline) | 5.2 ms  | —                          |
| Odds, 8 auto-resolves of a 150-worth  | ~70 ms  | one a frame while you pick |
| Battle frame, 400 soldiers, 390 × 662 | —       | median ~7 ms, p95 13–15 ms |

The frame is the game's own work — updating and issuing the draw calls.
Headless Chromium then rasterises on the CPU, another ~12 ms unthrottled,
which a phone does on its GPU; `play.mjs` flushes it untimed each frame so it
can't pile up into one giant frame. The frame is over the 6 ms budget on the
stand-in and inside a 60 fps frame: the ground is cached, each soldier is one
arc in one path per colour, and the next saving would be fewer gradients for
dust. A phone will say which matters.

**Don't cache the whole map** in an offscreen canvas: at DPR 2 a Medium map
is ~60 MB of pixels. Draw the visible hexes each frame; cache only the small
overview image.

## 6. Drawing

- **Map**: visible hexes are filled from the terrain table with a seeded
  per-hex tint, then glyphs, roads, rivers, places, fog, parties, the path and
  selection, in that order. Panning moves the camera, a world-space offset;
  the camera clamps to the map.
- **Battle**: scale is `min(W / 100, H / 140)` px per metre for the field
  area from `layout.js`, centred. Soldiers are drawn from each squad's
  formation slots (computed from files, ranks and facing) plus a small
  per-soldier jitter seeded by squad and index, so they stay put frame to
  frame. All marks of one colour go in one `beginPath` / `fill`.
- **Sheets** are DOM, absolutely positioned in `.stage` above the canvas like
  the shared overlay; `sheets.js` builds them with a ~20-line `h(tag, props,
...children)` helper. They are re-rendered from state on each change; they
  are small enough that diffing isn't worth it.

## 7. Testing and tuning

The Checkwiz harness (`tests/checkwiz/README.md`) is the model. Its rules
carry over unchanged: expected values are literals worked out by hand; input
is taps at the coordinates `layout.js` gives the game; output and setup go
through the save in `localStorage`; and **every check is watched failing once**
before it is trusted.

**Simulators** (Node, no browser). These are the tuning tools, and the only
honest way to set a number that says how hard the game is.

- `battle-sim.mjs` — the theory report, ported to import `rules/battle.js`:
  worth, counters, armies, scale, modifiers, length, perf. Its tables replace
  the ones in `battle.md` §10. It also gains the culture variants, mixed
  squads and abilities the model lacks.
- `world-sim.mjs` — whole realms with no player, 200 days, across ~50 seeds.
  Reports and asserts: wars and peaces per faction; settlements changing hands
  by week; the largest faction's share at days 50, 100, 150 (fails above
  60%); lords bankrupt or stuck; parties that can't path; the Hollow's
  strongholds by week (alone, it must end the realm between days 110 and 150
  on Normal); battles per day; ms per simulated day.
- `campaign-bot.mjs` (M8) — a scripted player policy (hunt what it can beat,
  recruit, upgrade, take contracts, go for the Regalia) checked against the
  pacing table in `world.md` §14.

**Browser** (Playwright, `playwright-core` against `/opt/pw-browsers/chromium`,
`devices["iPhone 13"]`, `hasTouch: true`):

- Tap canvases at `layout.js` coordinates; press DOM buttons by their visible
  name (`getByRole("button", { name: "Go" })`) — the sheet's own labels, not
  test ids.
- Seed positions by writing a save and pressing Continue: a battle at round 5,
  a town with a full recruit pool, a siege on its last day of food. A
  battle's state is too long to write by hand, so the rules may _build_ one
  (setup); what a check expects stays a literal.
- Assert on gameplay through the save: a squad's count dropped, a troop
  upgraded, the day advanced, the week paid wages; and that the console is
  clean.
- `shots.mjs` screenshots every sheet and both canvases at 390 × 844 and
  375 × 667 for anything that overflows.

What each milestone must prove is in `roadmap.md`. What none of it proves is
whether the game is fun, or how it feels under a thumb. That needs a phone.
