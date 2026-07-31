# Checkwiz test harness

Three scripts that play the real game in a real browser. Start the server first:

```sh
npm start                    # http://localhost:8000
npm run test:checkwiz        # rules — the balance rules, as positions
npm run test:checkwiz:bot    # bot — plays whole runs on generated chambers
npm run test:checkwiz:shots  # shots — screenshots of everything that can overflow
```

The one dev dependency is `playwright-core`, which drives a browser but never
downloads one — this repo is not about to start shipping a 150MB postinstall for
a folder of phone games. It uses the Chromium already on the machine: in this
repo's agent sessions that is `/opt/pw-browsers/chromium`, which is the default.
Point `CHECKWIZ_CHROMIUM` at your own if it lives elsewhere.

## How it talks to the game

The game has no test hooks and should not grow any. It is a canvas and a tap
handler, and the moment it starts exporting internals for a test, the test stops
proving anything about the thing people actually play. So:

- **Input is taps.** Real coordinates, real touch events. `harness.mjs` mirrors
  `layout()` from `game.js` — the single piece of duplicated knowledge here, and
  the thing to fix if the bar gets taller or the board moves.
- **Output is `localStorage`.** The game persists the entire run at the end of
  every turn, so the save is a complete state dump that costs the game nothing.
- **Setup is also `localStorage`.** Write a save, reload, press Continue, and it
  resumes any position you like — which is how a test asks "does a beam kill a
  warded king" without playing to chamber four.

## Writing checks that mean something

Two traps, both of which have already produced a green run that proved nothing:

**Clearing a chamber does not persist immediately.** `clearChamber()` waits
~1.1s so the death burst can land before the draft replaces the board. A read
taken straight after a killing blow still shows the old chamber, so anything
asserting a chamber did _not_ clear has to outwait that first.

**A refused tap leaves a panel open, and the next tap only dismisses it.** A
loop that taps, reads, and taps again can run for hundreds of iterations without
a single turn passing — and a board frozen that way looks exactly like a game
bug. The bot watches for its own state not changing and forces a real turn.

## Proving a regression test is a regression test

The suite seeds saves at the current `SAVE_V`, so pointing it at an older build
is one variable:

```sh
git stash push games/checkwiz/game.js
SAVE_V=1 node tests/checkwiz/rules.mjs   # the pre-tuning game
git stash pop
```

The pre-tuning build fails half of these — beaming a warded throne, walking up
to a guarded Sovereign, a queen handing herself over, every strike costing one,
holding paying nothing. A check that passes against both builds is not testing
what you think.

## What the bot is and is not

It is a smoke test. It finds the class of problem no hand-written position will:
chambers that cannot be finished, courts that lock solid, promotions that
avalanche, a console that starts throwing on turn 200.

It is **not** a difficulty oracle. It has no lookahead, will not spend life to
buy a capture, and barely touches the spellbook, so it dies to things a person
walks around and stalls in positions a person solves for two life. Read its
depth as a floor.

And none of this measures whether the game is _fun_ to play, or how it feels
under a thumb. That still needs a phone.
