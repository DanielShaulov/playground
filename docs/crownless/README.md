# Crownless — design

> The king is dead and the crown is lost. Raise a warband from peasants, win
> battles, take castles, and decide who rules the realm. Maybe you.

A strategy game with two layers: a **living world map** where lords march, raid
and besiege while you travel (Mount & Blade), dotted with mines, lairs and
treasure to flag and take (Heroes of Might and Magic III); and **battles** where
you command squads of soldiers in pause-and-plan rounds. Built for a phone in
portrait, played with one thumb, in five-minute sittings that add up to a
campaign of a few hours.

This is by far the biggest thing in the repo. It is meant to be built over
many sessions, one milestone per PR, and these documents are how each session
knows what the others decided.

**Nobody reviews Crownless PRs**; the owner playtests on a phone instead. When
a change's checks pass, squash-merge its PR yourself (that deploys it), and
end by listing what to try on the phone — what a headless run can't judge.

## Status

| Milestone                                           | State       |
| --------------------------------------------------- | ----------- |
| M0 Design, battle theory model, mockups             | done        |
| M1 Battle sandbox (Skirmish)                        | done        |
| M2 World map, travel, bandits, saves                | in progress |
| M3 Army, economy, hero progression                  | not started |
| M4 Factions, lords, strategic AI                    | not started |
| M5 Sieges and fiefs                                 | not started |
| M6 Standing: contracts, vassals, companions, quests | not started |
| M7 The Hollow, the Regalia, endings                 | not started |
| M8 Tuning, onboarding, polish                       | not started |

Details, acceptance criteria and the cut list are in [roadmap.md](roadmap.md).

## How to use these documents

| File                     | Read it when you are working on                                   |
| ------------------------ | ----------------------------------------------------------------- |
| this README              | anything — pillars, the big decisions, and why                    |
| [battle.md](battle.md)   | the battle layer: the model, orders, morale, sieges, auto-resolve |
| [world.md](world.md)     | the map: terrain, time, places, economy, lords, AI, the Hollow    |
| [army.md](army.md)       | troops, factions, the hero, skills, abilities, items, companions  |
| [ui.md](ui.md)           | screens, wireframes, one-thumb interaction rules, art direction   |
| [tech.md](tech.md)       | module layout, determinism, saves, performance, testing           |
| [roadmap.md](roadmap.md) | what to build next and how to know it is done                     |

The game is in `games/crownless/`; its tests and simulators, and how each was
checked, are in [`tests/crownless/`](../../tests/crownless/README.md). The
theory model the first battle numbers came from (`theory/`) was retired in M1
once the rules reproduced it; it lives in git history.

Rules for keeping them true:

- **The docs are the spec until the code exists; then the code is.** When an
  implementation has to deviate, change the doc in the same PR, and say why in
  a line. A doc that silently disagrees with the game is worse than none.
- **Every number has one home.** Troop stats, troop prices and the hero live
  in `army.md`; the economy, the map and pacing in `world.md`; battle
  constants in `battle.md`. Elsewhere, link. Code that needs them mirrors
  them, and the mirror is named in the doc: troop stats and worth in
  `rules/data/troops.js`, prices in `PRICE` in `tests/crownless/battle-sim.mjs`.
- **The battle is now code:** `games/crownless/rules/battle.js` and
  `battle-ai.js` are the spec for everything M1 built, and `battle.md`
  describes them. If they disagree, the code is right and the doc has a bug.
- **Numbers that say how hard the game is come out of a simulator**, never a
  guess: `tests/crownless/battle-sim.mjs` for battles, `world-sim` from M2.
- **Update the status table** when a milestone lands.

## Pillars

Every system below is judged against these. When two conflict, the earlier one
wins.

1. **One thumb, any moment.** Everything you do every minute sits in the
   bottom 45% of the screen. Nothing is timed against your reflexes. The game
   saves after every action, so closing it mid-battle costs nothing.
2. **The world moves when you move.** Time passes only while you travel or
   wait, but while it does, everyone else is marching, raiding and besieging.
   You come back from a lair to find the border has moved.
3. **Your warband is your character.** Troops you recruited as peasants become
   veterans through the fights you chose. Losing them hurts; that is the point.
4. **A battle is a few decisions, not a chore.** Battles are decided by morale,
   not by killing every last man, so most last 5–12 rounds. Lopsided fights
   auto-resolve with the same simulation, so the odds shown are honest.
5. **It ends.** A campaign is a story with a finish — a crisis that rises,
   three relics to take, a last siege — not a sandbox that peters out.

## What it borrows, changes and drops

|              | Taken from HoMM3                                     | Taken from Mount & Blade                                  |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| **Borrowed** | Map dotted with mines to flag, lairs, treasure piles | Lords with parties who march, raid, besiege, get captured |
|              | Weekly growth and income                             | Recruit peasants, upgrade along troop trees by XP         |
|              | Level-up: pick one of two skills                     | Wages, party size limit, wounded vs. killed, prisoners    |
|              | Stacks that hit as one (pooled damage)               | Mercenary → vassal → ruler; fiefs; marshal campaigns      |
|              | Artifacts in slots; a grail-like relic hunt          | Battles of formations, flanks, charges and routs          |
| **Changed**  | Movement points → continuous time on a hex map       | Real-time battles → planned rounds (WeGo)                 |
|              | 7 resources → gold, iron, horses                     | You don't swing a sword: your banner is a squad           |
|              | Creatures → soldiers; monsters stay as neutrals      | Endless sandbox → a crisis and an ending                  |
| **Dropped**  | Town screens with 20 buildings, spell books          | Trade goods, food, smithing, marriage, tournaments        |
|              | Hero-vs-hero chess of multiple heroes                | First-person combat, horse archery skill                  |

## The three loops

```
 Round (seconds)    plan orders ─▶ watch 3 s play out ─▶ read what changed ─┐
                         ▲                                                  │
                         └──────────────────────────────────────────────────┘

 Sitting (minutes)  pick a destination ─▶ travel; the world moves ─▶ encounter
                    ─▶ fight / auto-resolve / flee ─▶ loot, XP, prisoners
                    ─▶ recruit, upgrade, heal in a town ─▶ next destination

 Campaign (hours)   renown ─▶ contracts ─▶ a fief ─▶ wars and sieges ─▶ the
                    Hollow rises ─▶ the three Regalia ─▶ storm Crownhold
```

## The campaign arc

A Medium campaign is aimed at **120–180 in-game days and 4–6 hours** of play.

- **Act I — Sellsword (days 1 – ~40).** You start with a dozen levies in a
  random corner of a procedurally generated realm split between four claimants
  at war. Hunt bandits, clear small lairs, flag a mine, grow from 12 men to 60.
  Pick a side or stay free.
- **Act II — The Hollow (day ~40).** The dead walk out of Crownhold, the ruined
  capital at the centre of the map. Blight spreads from it, Hollow warbands
  raid and besiege, and the three Regalia of the old crown are revealed in
  great lairs. The claimants keep fighting each other anyway.
- **Act III — The Crown (day ~100+).** With fiefs, allies and the Regalia, you
  storm Crownhold and kill the Hollow King. Who you are by then — free captain,
  a claimant's vassal, or a ruler in your own right — decides the ending.

**Winning** is killing the Hollow King. **Losing** is the Hollow holding a third
of the realm's towns and castles. There is no other game over: a lost battle
means capture, a ransom or an escape, and a rebuilt warband — expensive, never
final. Details in [world.md § The Hollow](world.md#12-the-hollow-the-regalia-and-the-end).

## Constraints, and what they force

- **Portrait phone, one thumb.** The battlefield is tall, armies deploy top and
  bottom, and your own army is the half nearest your thumb. Menus are bottom
  sheets. No pinch, no two-finger anything, no long reach to the top corners.
- **Zero build step.** Plain ES modules, canvas 2D, no dependencies, no assets
  that need a pipeline. All art is drawn in code. This is also why the docs are
  plain Markdown.
- **localStorage only.** One autosaved campaign, kept under ~300 KB by
  regenerating the terrain from its seed instead of storing it.
- **Deterministic rules.** Everything that decides an outcome is pure and
  seeded, so the same battle function auto-resolves, predicts odds, and runs ten
  thousand times in Node for tuning.
- **This repo prefers throwaway toys.** So every milestone ships something
  playable on its own, starting with a battle sandbox that would be a decent
  game even if nothing else were ever built.

## The big decisions

Each was weighed against the alternative named; the reasons are the pillars.

**D1 · Battles are WeGo rounds, not real time and not turn-based.** You give
standing orders, press Go, and three seconds of simulation play out for both
sides at once; then it pauses. A toggle plays rounds back to back and pauses
only on events. Real time with pause punishes a one-handed player on a bus;
HoMM-style alternating turns are slow with many squads and lose the spectacle
of two lines meeting. WeGo keeps both: no clock on your thinking, and charges
that crash into lines while you watch.

**D2 · Squads are simulated; soldiers are drawn.** The rules see "34 footmen
in a 9×4 block", not 34 agents. That keeps the battle deterministic, cheap
(about 4 ms to auto-resolve 200 v 200 in Node) and legible on a 390 px screen,
while still drawing every man so a battle looks like one.

**D3 · The map is hexes in continuous time, not movement points.** Each hour,
every party advances along its path at its own pace. That gives Mount &
Blade's chases, interceptions and relief armies, which a day-turn system
can't. Hexes keep it a board you can read and tap.

**D4 · Three resources: gold, iron, horses.** Gold pays for everything; iron
gates armoured troops and buildings; horses gate cavalry. Mines and ranches are
worth flagging, and the map decides what your army can become. Seven HoMM
resources would be bookkeeping on a phone.

**D5 · Canvas for the map and battlefield, DOM for everything else.** The two
big views are drawn every frame. The troop lists, town menus and dialogs are
HTML bottom sheets: native momentum scrolling, text that wraps, and buttons a
test can find by name. Firewall Mage drew its menus on canvas; at this game's
volume of lists, that would be most of the code.

**D6 · Low fantasy.** The four claimants field ordinary medieval troops. The
fantasy is at the edges: monsters in lairs, a few blessings learned at
shrines, and the Hollow — the undead crisis that gives the campaign its
clock, its villain and its ending.

**D7 · Losing a battle is expensive, never final.** Ironman by default (one
autosave, no reloading), but a defeat captures you instead of ending the run.
The only loss is the realm falling to the Hollow.

**D8 · Design docs live in `docs/crownless/`, not `games/crownless/`.**
`npm run new` refuses to scaffold into an existing folder, and the game should
be scaffolded by it (CLAUDE.md). M1 ran the scaffold; these docs stayed put.

## Open questions

Defaults are chosen and the docs are written against them. Any of these can be
overruled before the milestone that depends on them.

1. **The name.** "Crownless", id `crownless`, 👑. Cheap to change until M1.
2. **How much fantasy?** Default: low, as in D6. The alternative, a fully
   historical game, would need a different crisis for Act II (a foreign
   invasion works) and loses the monster lairs.
3. **Permadeath option.** Default: none. An "Iron Crown" difficulty where
   losing a battle you were in kills the hero is easy to add in M8.
4. **Campaign length.** Default 4–6 h on Medium, 2–3 h on Small. Both are
   numbers in `world.md`'s pacing table, tuned by the world simulator in M4+.
