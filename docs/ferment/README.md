# Ferment: The Brine Nook

A cosy pickle-shop sim for a portrait phone. You start jars, they ripen in
real (in-game) time from crisp to funky, and customers want each recipe at a
particular point on that strip. The game lives in `games/ferment/`.

This folder is the design notes for the Claudes who build it. No person reads
the code, so these notes and the tests are how one Claude hands work to the
next.

- [rules.md](rules.md): how the game plays, in words, with the numbers that matter.
- [architecture.md](architecture.md): how the code is shaped and why.
- This file: where things live, how to test, and the conventions every PR follows.

The build plan (milestones, tasks, who owns which files) is the
"Ferment build plan" doc in the Ferment project. Decisions already made there:
evolve the demo rather than rebuild; an endless shop with a goals ladder, not
a season; playtest saves are disposable until release; a PR with no visible
change may merge on green CI, anything a player would notice waits for
Hadash's playtest of its preview.

## Where things live

```
games/ferment/            the game, plain ES modules, no build step
  core/                   pure rules: step(), clock, random streams, state slices
  content/                recipes, ingredients, regulars, upgrades as data
  ui/                     screens; dispatch actions, draw state and events
  jsconfig.json           the dev-only type check (see below)
tests/ferment/            Node tests (rules, replay goldens, fuzzing)
  core/                   tests for games/ferment/core
  browser/                phone flows and the screenshot gallery (Chromium)
docs/ferment/             these notes
.github/workflows/test.yml  the PR gate
```

Until the Milestone 0 core split lands, the demo is still two files:
`games/ferment/rules.js` (pure rules) and `games/ferment/game.js` (screen).

## Testing

`npm test` runs everything the PR gate runs. Pieces:

| Command                        | What it does                                                                               | Time    |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| `npm run test:ferment`         | Every `tests/ferment/*.mjs` and `tests/ferment/core/**/*.mjs` under `node --test`          | seconds |
| `npm run typecheck`            | `tsc` over files under `games/ferment/` that start with `// @ts-check`                     | seconds |
| `npm run test:checkwiz`        | Another game's rules, kept green by the same gate (needs `npm start` running)              | ~40 s   |
| `npm run test:ferment:browser` | Plays the phone flows on a small (iPhone SE, 320 px) and a large (iPhone 15 Pro Max) phone | ~1 min  |

A Node test is any `.mjs` file that exits non-zero when something is wrong;
plain `node:assert` at top level is enough, `node:test` blocks also work. New
files under `tests/ferment/core/` are picked up with no registration.

The phone flows start their own static server, so nothing needs to be running
first. Each flow runs on both phones at once; every `snap()` saves a
screenshot and fails the flow if any element sticks out past the right edge of
the screen, and any console error fails it too. The shots land in
`tests/ferment/browser/shots/index.html` (git-ignored). On CI they are the
`ferment-shots` artifact of the Test run. Look at them before opening a PR
that changes a screen.

To add a flow, copy `tests/ferment/browser/day.mjs` (export `name` and
`async run(page, snap)`) and add it to `FLOWS` in `run.mjs`. Flows tap real
elements and read state through the test hook, so they depend on:

- `window.__ferment.state` (the live state, readable and assignable) and
  `window.__ferment.R` (the rules module);
- the `data-slot`, `data-act` and `data-recipe` attributes on the shelf slots,
  action buttons and recipe buttons.

A refactor that renames any of those updates the flows in the same PR.

Chromium comes from `$CHROMIUM`, else `/opt/pw-browsers/chromium` in agent
sessions. Never run `playwright install`. Feel (touch timing, thumb reach,
pacing) is not something a headless pass proves; that is Hadash's playtest.

## The type check

Dev-only: `typescript` is a dev dependency and nothing ships or builds. A file
is checked once its first line is `// @ts-check`, so the check grows one
module at a time. Every new module under `games/ferment/` starts with it.
Share shapes across modules with JSDoc (`@typedef` in the module that owns the
data, `@type {import("./state.js").Jar}` where it is used); that is what
catches a misspelt field in another module before a test runs.

## Conventions

- **Own your files.** A task edits only the files the build plan gives it.
  Elsewhere it may add one registration line (an action, a screen, a content
  row); when two PRs both add one, the later rebases and keeps both.
- **The core is pure.** No `Math.random`, `Date`, timers or DOM inside
  `games/ferment/core/`. Randomness comes from seeded streams in the state.
- **Replay goldens change only on purpose.** A PR that changes how a recorded
  game plays out updates the golden and says why in its description.
- **Saves go through `createStore("ferment")`**, never raw `localStorage`, so
  PR previews keep their own saves.
- **No runtime dependencies.** Third-party code is copied into the repo, never
  fetched at runtime.
- Repo-wide rules (branching, squash merges, terse commits, verifying on a
  phone viewport) are in the root `CLAUDE.md`.
