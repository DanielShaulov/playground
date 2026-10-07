# Crownless test harness

Crownless keeps its rules in `games/crownless/rules/` and its screen geometry in
`games/crownless/view/layout.js`, both pure — no DOM, no canvas, no storage, no
`Math.random`. Everything here is built on that split, the way the Checkwiz
harness is (`tests/checkwiz/README.md`, read it first).

```sh
npm run test:crownless:rules  # rules — the battle rules, checked in Node (a second)
npm run test:crownless:sim    # sim   — battle.md §10, measured (a few minutes)
npm start                     # then, in another terminal:
npm run test:crownless        # play  — whole Skirmishes, tapped through in a browser
npm run test:crownless:shots  # shots — every screen on a 390 × 844 and a 375 × 667 phone
```

`playwright-core` drives the Chromium already on the machine
(`/opt/pw-browsers/chromium`; point `CROWNLESS_CHROMIUM` elsewhere if yours
lives somewhere else). `CROWNLESS_URL` points the browser scripts at another
server.

## What each script proves

**`rules.mjs`** checks that the rules do what `battle.md` and `army.md` say:
the edge curve, the culture variants and their traits, the Skirmish hero and
that it falls last, squads splitting by role, mixed squads, formations, orders,
the deployment presets, woods, each ability, determinism and save round-trips, the AI's split, the
aftermath — and that a mirror match with fortune off stays a mirror (below).

**`battle-sim.mjs`** is the theory model's report, asked of the real rules:
worth, counters, doctrines at equal worth and gold, formations, scale, what a
bonus is worth, and what the model never had — culture variants, mixed squads,
the hero, each ability. Its tables are `battle.md` §10. Its `parity` section is
a check rather than a report: in model mode (`opts.model`: no split, no
heroes, the model's movement) the rules must still reproduce the model's
published worth table within 10% and its counter matrix cell for cell. They
did step for step, bit for bit, before anything was changed; the model itself
lives in git history (`docs/crownless/theory/`, removed in M1).

**`play.mjs`** plays the game the way a thumb does: a Skirmish from the title
screen to the result sheet through the bottom bar alone, then squads and
ground tapped on the field, deployment, Valor spent, retreat, Auto finish, the
best record, the long press on a squad or a button that reads and never
acts, and the save written
before a round is shown. Last, it measures a round and a frame with the CPU
throttled 4× — a stand-in for a phone, not a phone.

**`shots.mjs`** screenshots every screen at both sizes, and fails if any of the
game's buttons is under 44 px or off the screen. Look at the pictures: an
assertion can't see a label cut off by its chip.

## How the browser scripts talk to the game

As in Checkwiz, the game has no test hooks:

- **Input** is taps. Buttons are DOM and are pressed by their visible names
  (`getByRole("button", { name: "Go ▶" })`); the field is a canvas tapped at
  the coordinates `layout.js` gives the game itself.
- **Output** is `localStorage`. The save (`playground:crownless:save`) is the
  whole battle as the rules keep it, written after every action and every
  round — and a round is written before it is animated.
- **Setup** is also `localStorage`: write a save, reload, press Continue.

One difference from Checkwiz: a battle's state is too long to write out by
hand, so positions are _built_ with the rules (`createBattle` with squads
placed where a check wants them). That is setup, like a bot planning its move.
What a check _expects_ is still a literal worked out by hand — 13.5 m for a
round's march, 3 men for a rearguard of 15% of 20 — never something the rules
computed.

## Every check has been seen failing

Each check in `rules.mjs` and `play.mjs` was watched going red against a copy
of the game with the rule it guards broken (a mutation run: one sabotage per
copy, the suite pointed at it). Seven of the first 56 rules sabotages slipped
through, and each found a check that couldn't fail: a hero at level 10 gets
the same attributes from ⌊L/4⌋ and ⌊L/5⌋; a squad marching straight ahead
keeps its facing whether or not the rule exists; a mirror match can end in a
draw with one side quietly ahead. Those checks now test at values that tell
the rules apart.

The mirror check is worth knowing about. The theory model gave side 0 an
83–13 record against its own mirror, because squads moved one at a time and
the second side steered for where the first had already gone; then equal
lines wrapped each other by a rounding error and side 1 broke a hair early.
Both are fixed (`battle.md` §3.6). With fortune off, two identical armies now
stay mirror images round after round; with fortune on, they win about equally.

## What none of this measures

Whether a battle is fun, whether a squad can be tapped reliably while it moves,
whether three seconds is the right length for a round, and how the field reads
at a glance. Those are for a person holding a phone.
