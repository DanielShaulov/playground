# Crownless — roadmap

Nine milestones, each one PR (or a short series) that lands on `main` with
something playable. The order is risk first: the battle is the part most
likely to be wrong on a phone, so it is built and held in a hand before
anything is built on top of it.

Estimates are in sessions (one agent session, roughly one PR) and are guesses
to plan by, not promises.

## Working on a milestone

1. Read [README.md](README.md), then the documents the milestone lists.
2. Branch, build, and land it as one squash-merged PR (CLAUDE.md).
3. Before merging: the milestone's checks pass and have each been seen
   failing once; the docs say what was actually built (change them in the
   same PR where the build had to differ); regenerated tables replace the
   old ones; the status table in the README is updated.
4. Say in the PR what only a phone can tell, and ask for it.

## M0 · Design — done

These documents, and `theory/` (retired in M1, in git history): a Node model of the battle rules with a
report that measures worth, counters, doctrines, scale, the value of a bonus,
battle length and cost. The numbers in `battle.md` §10 and `army.md` §2 came
from it.

## M1 · Battle sandbox ("Skirmish") — done

The battle layer as a game on its own: pick two armies, fight. Registered on
the launcher as Crownless with only Skirmish on its title screen. If nothing
else were ever built, this should still be worth playing.

Read: `battle.md`, `army.md` §1–7, `ui.md` §1, §5–7, `tech.md`.

- Scaffold it:

  ```sh
  npm run new -- crownless "Crownless" "👑" "Raise a warband. Take the crown."
  ```

  and add `test:crownless:*` scripts to `package.json` the way Checkwiz has
  `test:checkwiz:*`.

- `rules/`: `rng.js`, `data/troops.js` (generic tree, culture variants, the
  elites), `battle.js` ported from the theory model and extended with mixed
  squads, the Line and Wide formations, every order in `battle.md` §5, the
  AI's ability policy, the banner squad and
  aura, Valor, and the abilities that don't need the map (Rally, Hold the
  Line, Loose!, Charge!, Inspire, the four culture abilities). `battle-ai.js`
  with the role preferences and one addition: split a squad whose line
  overhangs nothing. `battle-setup.js` with the deployment presets, flat
  fields and woods.
- `view/`: the battlefield and soldiers, the command bar, deployment,
  continuous play with auto-pause, the result sheet.
- Skirmish setup: each side picks a culture, a doctrine (the six in
  `battle.md` §10.3 or random at a worth) and a hero level (the template in
  `army.md` §6). A doctrine is a share of worth by role; where a culture
  lacks a troop, it fields its nearest one of the same role (Ulus
  "shieldwall" is footmen and archers). Best record: the toughest win, by the
  odds it was shown at.
- `tests/crownless/`: `battle-sim.mjs` (the report, on the real rules — then
  delete `docs/crownless/theory/battle.mjs` and point the docs at it),
  `harness.mjs`, `play.mjs`, `shots.mjs`.

Done when:

- `battle-sim` reproduces the model's tables (worth within 10%, the same
  winner in every counter cell) before any rule is changed — the model is
  normative until then (`battle.md`, top); then measures culture variants,
  mixed squads, the hero and each ability in troops, and `battle.md` §10 is
  regenerated.
- A Playwright run deploys, gives orders, plays to the end through the bottom
  bar alone, finds the result in the save, and leaves the console clean.
- Screenshots at 390 × 844 and 375 × 667 show nothing clipped.
- A round computes in ≤ 10 ms and draws 400 soldiers at 60 fps on a phone.
- **On a real phone**: squads can be tapped reliably; a round feels the right
  length; the field reads at a glance. If not, fix before M2 (fallbacks: a
  6-squad cap, bigger hit areas, army-order-only play). Also decide the
  camera: whole field with marks, or the 2.5× follow camera with figures
  (`ui.md` §6 has both mocked up from the same frame).

**As built.** Everything above, measured in `battle.md` §10 and checked as
`tests/crownless/README.md` describes. Where the build went further or
differently, the docs now say so; the larger points:

- The model reproduced exactly (in model mode, step for step), then three
  things it got wrong were fixed, each found by a test: squads moved one at a
  time, so side 0 won 83 of 96 decisive mirror matches; equal lines wrapped
  each other by a rounding error; horse archers slid one way round, which a
  mirror reverses (`battle.md` §3.6).
- The AI's ability triggers had to be by men, not squads ("two ranged
  squads"), or armies with one squad of archers never loosed (§5).
- Shield Wall's "shields work in melee" means against arrows: shields never
  stop a sword in this game (§3.5, §6).
- A front wider than the field forms a second line (§2): a horde in squads of
  forty is one.
- The Skirmish hero is strong: level 1 is worth nearly +50% troops and level 20
  more than doubles an army (§10.10). That is the template in `army.md` §6
  measured, not changed; it is a design question for M3.
- The Skirmish title has Continue as well as Skirmish: a battle in progress
  survives closing the app.

**Still for a phone** (the headless runs can't say): tapping squads while they
move, whether three seconds is a round, how the field reads, the camera
choice (both are built; ⋯ → Camera), and real frame and round times — the 4×
throttled Chromium numbers are a stand-in (`tech.md` §5).

## M2 · The map — 2–3 sessions

Travel a generated realm, meet brigands, fight them with M1's battle, keep
the loot. Saves.

Read: `world.md` §1–5, `ui.md` §2–4, `tech.md` §3–6.

- `worldgen.js` (all of `world.md` §1), `hex.js`, `world.js` (the tick,
  movement, sight, encounters), brigands and wolves with a hunt-or-flee AI,
  pickups.
- The map view: camera, hexes, fog, places, parties, paths; the context bar
  and tab bar; the encounter sheet with odds.
- Battle terrain from the hex: slope, river, mud, houses.
- `save.js` with `SAVE_VERSION`; Continue and New campaign (culture and
  background only).
- `world-sim.mjs`, first version: brigands only.

Done when:

- Seeds 1–50 each generate a valid map in under 300 ms; the same seed always
  makes the same map (a hash over the terrain).
- In the browser: cross the map, get stopped by brigands, win, see loot in
  the save; reload mid-travel and mid-battle and resume exactly.
- `world-sim` runs 200 days on 50 seeds with no party that can't path and no
  tick over budget.

Built so far, in three PRs worked beside M1's battle rework:

1. **A realm to walk** (done): worldgen, hex, travel, the clock, sight and
   fog, watchtowers, the campaign save under its own key, the map screen with
   its context bar and tabs, Continue and New campaign. Checked by
   `world.mjs` (seeds 1–50, travel and sight by hand-worked numbers) and
   `campaign.mjs` (a journey with a reload in the middle lands exactly where
   the unbroken one does).
2. **Brigands**: parties, contact, the encounter sheet with odds, battle
   terrain from the hex, loot; `world-sim.mjs`.
3. **Places**: pickups, lairs, shrines, stones and camps worth stopping for.

## M3 · The warband — 2–3 sessions

Recruit, pay, upgrade, heal, level up. The economy exists.

Read: `army.md` §3, §6–9 (companions only as data), `world.md` §4, §6–7.

- Recruit pools, wages and the week, XP and upgrades with iron and horses,
  wounded, prisoners and ransom, party morale and desertion, party size,
  capture and ransom of the player.
- The hero: XP, levels, attributes, skills, the level-up choice, ability
  slots, equipment; shrines, standing stones, markets, smiths.
- Sites to flag; small and medium lairs, barrows included (their dead follow
  `battle.md` §9's barrow rule, so they don't wait for M7).
- The Army and Hero sheets.

Done when:

- A Node policy that hunts what it can beat and recruits sensibly lands
  within 30% of the day-15 row of the pacing table (`world.md` §14).
- In the browser: recruit at a village, upgrade at a town, watch wages leave
  at the week's turn — all read back from the save.

## M4 · The realm at war — 3 sessions

Lords, factions, war and peace. The world moves without you.

Read: `world.md` §8–9.

- Lords and factions as data; lord behaviours; faction wars, truces,
  coalitions; settlement ownership and AI garrisons; raids; caravans;
  relations; talking to lords; the Realm sheet and the Journal.
- `world-sim` in full (no Hollow yet).

Done when, across 50 seeds of 200 days with no player:

- every faction fights at least two wars, and settlements change hands;
- no faction holds over 60% of towns and castles at days 100 and 150;
- no lord is broke or stuck for more than a week;
- a simulated day, battles included, costs ≤ 30 ms (`tech.md` §5).

## M5 · Sieges and fiefs — 2–3 sessions

Take castles. Hold them.

Read: `world.md` §10, `battle.md` §8.

- The siege flow: works, starvation, sallies, relief.
- The assault battle: wall, entries, merlons, the ram, and squads routed
  through entries by waypoints. The Deep and Square formations, which only
  earn their place here.
- Fiefs for the player (a free company that takes a castle founds a realm),
  garrisons, buildings. Marshal campaigns for the AI.

Done when:

- `battle-sim` gains assaults: defenders at a ladder hold against about four
  times their number; a breached gate changes that; Deep beats Line at an
  entry, and Square holds spears against horse from every side, or both are
  cut.
- `world-sim`: AI armies besiege and take castles at a steady rate; no
  settlement is taken and retaken every week.
- In the browser: besiege, build ladders, assault, own the castle.

## M6 · Standing — 2–3 sessions

From sellsword to vassal to ruler.

Read: `world.md` §9, §11, `army.md` §9.

- Renown and the four roles; mercenary contracts; vassalage and fiefs
  granted; marshal; your realm with companion lords and defections.
- Companions: taverns, party roles, captains.
- Contracts (the eight templates).

Done when a scripted run in the browser goes mercenary → vassal → granted a
fief, and another takes a castle as a free company and becomes a ruler.

## M7 · The Hollow and the end — 2–3 sessions

The crisis, the Regalia, the last siege, the endings.

Read: `world.md` §12–13, `battle.md` §9, `army.md` §5.

- The rising, blight, warbands, the Hollow's AI; Hollow units with binding,
  crumbling and Raise Dead; great lairs and the Regalia; Call the Banners;
  the Hollow King; endings and the score.

Done when:

- `battle-sim`: against a Hollow host, an army that kills the captains wins
  at a worth disadvantage that an army ignoring them loses at — the mechanic
  must matter, measured.
- `world-sim` with the Hollow and no player: the realm falls between days
  110 and 150 on Normal — late enough to play, soon enough to matter.
- A campaign can be won and lost in the browser from seeded saves.

## M8 · Tuning and polish — 2+ sessions

- `campaign-bot.mjs` against the pacing table; difficulty levels tuned.
- First-campaign hints, the Codex, Settings (left-handed, reduce motion,
  auto-pause events), the art pass, performance on an older phone.
- From here on, save migrations instead of version bumps.

## Cut list

If the whole is too much, cut from the top. Nothing below the line is cut.

1. Caravans.
2. Contracts beyond Bounty and Clear the lair.
3. Companions as lords, and defections.
4. Marshal armies (lords campaign alone or in pairs).
5. Buildings beyond Walls, Barracks and Granary.
6. Recruiting prisoners.
7. The Small map size.
8. Battle terrain beyond woods and rivers.

---

Never cut: planned-round battles, the living map, saves, the Hollow and an
ending.

## Risks

| Risk                                     | Mitigation                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Too big for a repo of throwaway toys     | every milestone ships something playable; Skirmish stands alone; the cut list |
| Squads too small to command with a thumb | M1 first and checked on a phone; 6-squad cap and army orders as fallbacks     |
| Strategic AI that snowballs or stalls    | `world-sim` from M2 with hard assertions; few behaviours, scored              |
| Saves breaking on every deploy           | version check, terrain from seed; migrations only from M8                     |
| Slow on older phones                     | budgets in `tech.md` §5, measured on a device at M1 and M2                    |
| The game drifting from the model         | `battle-sim` must reproduce the model before changing rules                   |
| Battles diverging between engines        | `edge()` as a table; browser tests in Chromium                                |
| Too much text to write                   | templated events, generated names, two sentences at most                      |
