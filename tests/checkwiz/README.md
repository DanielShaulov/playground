# Checkwiz test harness

Checkwiz keeps its rules in `games/checkwiz/rules.js` and its screen geometry in
`games/checkwiz/layout.js`, both pure — no DOM, no canvas. That split is what
this folder is built on: the simulator plays the rules directly in Node, and the
browser scripts tap the real game at the coordinates the game itself uses.

```sh
npm run test:checkwiz:sim    # sim   — thousands of runs in Node; the balance oracle
npm start                    # then, in another terminal:
npm run test:checkwiz        # rules — every rule, as a position, in a real browser
npm run test:checkwiz:bot    # bot   — whole runs from the title screen, by tapping
npm run test:checkwiz:shots  # shots — screenshots of everything that can overflow
```

The one dev dependency is `playwright-core`, which drives a browser but never
downloads one. It uses the Chromium already on the machine: in this repo's agent
sessions that is `/opt/pw-browsers/chromium`, which is the default. Point
`CHECKWIZ_CHROMIUM` at your own if it lives elsewhere.

## The simulator is how the game was tuned

`sim.mjs` plays seeded runs with `policy.mjs` — a player that tries every move,
plays the court's reply on a copy, and looks one exchange further at the best
few — spread over every core. It prints a table per chamber: how often it kills,
how much it hurts, how long it takes, how often it is cleared untouched.

Every number in `rules.js` that says how hard the game is came out of this
table, and so did several rules. The first draft let a soul take the crown, and
simulated runs cleared a dozen chambers without fighting — hence "by hand". A
relic that let souls take it back was held by three of every four runs that
never died; it is gone. Deep chambers got _easier_ than middle ones once a run
held every relic, which is why a run now ends at fifteen. Banning each relic in
turn found Discovered Attack worth more than all the others together (54% of
runs won with it, 8% without), which is why it now fires once a chamber.

Read it as a floor: the policy is careful and exact, but it never plans past
two exchanges or sets a trap. `SEED=7 RUNS=1 TRACE=1` replays one run move by
move; `BAN=blitz` makes the player refuse a relic, which is how to measure what
one is worth.

Chambers that run past the turn cap are listed at the end. Usually that is the
policy on its last life refusing every price, which a person would not do. But
it is also how a real bug surfaced — a wizard walled into a pocket by pieces
that could neither strike his square nor leave it, waiting out the game while
reinforcements piled up into thirty queens — so read the positions it prints.

## How the browser scripts talk to the game

The game has no test hooks and should not grow any. It is a canvas and a tap
handler, and the moment it exports internals for a test, the test stops proving
anything about what people play. So:

- **Input is taps**, at the coordinates `layout.js` gives the game itself.
  There is no second copy of where the buttons are to drift out of date.
- **Output is `localStorage`.** The game saves the whole run after every move,
  so the save is a complete state dump that costs the game nothing.
- **Setup is also `localStorage`.** Write a save, reload, press Continue, and it
  resumes any position — which is how a check asks "does a rook really cost two"
  without playing to chamber four.

## Writing checks that mean something

**Expected values are literals.** Work the number out from the position by
hand. `rules.js` may be imported to _plan_ — which square is quiet, what the bot
should do — but never to compute what a check expects; a test that asks the
rules what the rules should do cannot fail.

**Put the wizard where the piece really strikes.** A rook owns the rank it sits
on; a pawn only the two squares diagonally below it. Stand him in the wrong
place and the turn passes quietly, and "costs one" proves zero equals zero.

**A refused tap leaves a panel open, and the next tap only dismisses it.** A
loop that taps and reads can run for hundreds of iterations without a turn
passing — and a frozen board looks exactly like a game bug. The bot watches for
its own state not changing and stops.

**Watch every check fail once.** When this suite was written, each rule it
guards was broken in turn — no hold, souls taking the crown, no untouched heal,
a free crown, a court with no self-preservation, no castling — and in every case
the check written for that rule, and only that one, went red. A check that
passes against a broken game is not testing what you think.

## What none of this measures

Whether it is fun, and how it feels under a thumb. The simulator says how hard
the game is for a patient machine that never mis-taps; a person reads a board
differently. That still needs a phone.
