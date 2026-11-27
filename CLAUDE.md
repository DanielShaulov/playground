# Working in this repo

Small, one-off HTML5 games played on a phone **in portrait, one-handed**. Read
`README.md` first for the layout and the shared API — this file covers the
conventions and the traps that aren't obvious from the code.

## The constraints that matter

Every decision here follows from three things:

1. **Portrait phone, one thumb.** Not a desktop game that happens to work on a
   phone. Touch targets ≥44px. Nothing important in the top corners.
2. **Zero build step.** No framework, no bundler, no runtime dependencies. Edit
   a file, refresh, done. Adding tooling is the one change that would ruin this
   repo's whole point — don't, unless explicitly asked.
3. **One-off games.** These are throwaway toys. Prefer a small self-contained
   game over an abstraction shared between two games. Duplication is cheaper
   here than coupling.

## Adding a game

```sh
npm run new -- <id> "<Title>" "<emoji>" "<one-line blurb>"
```

This creates `games/<id>/` from `scripts/template/` and registers it in
`games.js` — don't hand-roll either step. Then write the game in
`games/<id>/game.js`. `games/tap-rush/` is the reference implementation and
uses every part of the shared layer.

Only touch `shared/` when two or more games genuinely need the same thing. It
is deliberately small: canvas + loop + input, HUD/overlay chrome, namespaced
storage, base CSS.

A game too big for one sitting keeps its design in `docs/<id>/` (outside
`games/`, so `npm run new` can still scaffold it).

### Three things that bite

- **Coordinates are CSS pixels** and retina scaling is already applied to the
  context — but the play area is whatever the phone gives you. Size everything
  off `stage.width` / `stage.height`. Never hardcode pixel positions.
- **Store widths/positions in pixels and a resize breaks them.** If a game
  keeps persistent geometry (like Stack's tower), handle `stage.onResize` and
  rescale. The iOS URL bar collapsing counts as a resize.
- **Keep the iOS status bar `black`, never `black-translucent`** (the
  `apple-mobile-web-app-status-bar-style` meta). Translucent, iOS 26 sizes a
  home-screen app one status bar short and paints nothing below it: a dead
  band under every game that no CSS unit, `lvh` included, reaches past
  (WebKit bug 301108). iOS reads the style only when the app is added to the
  home screen.

### Designing for feel

- **Match progression to the core mechanic.** Don't default to a generic
  between-level power-up picker if it interrupts the loop. Progression should
  grow out of the game's own verb (maps, mastery goals, unlockable tools) and
  gate unlocks sequentially so players can't skip ahead by grinding early
  stages.
- **Teach by doing on screen 1.** Tiny HUD hints get ignored. Show the first
  gesture with an animated cue, guide any timing-sensitive mechanic with a
  forgiving slow-down on the first try, and point diegetic labels directly at
  newly introduced elements.
- **Keep timing windows honest to the genre.** Don't mix deliberate
  aim-and-think mechanics with accidental twitch-reflex windows. Check reaction
  windows in milliseconds during simulation; if an action is meant to feel
  deliberate, give the thumb generous time (slow-mo, magnetic detents, readable
  rates).
- **Previews must be WYSIWYG.** Trajectory guides, aim assists, and indicators
  must share the exact collision math of live play, never use a looser hit
  threshold than the real check, and only highlight the currently valid
  objective.
- **Protect the bottom thumb spot.** The primary continue/next action belongs
  in the easiest bottom thumb target — never a secondary mode. Provide a safe
  2-step progress reset early so replaying from scratch is painless.
- **Verify solvability and screenshots before opening a PR.** Sweep generated
  or handcrafted levels in Node to confirm collectibles and win paths actually
  line up, and visually inspect Playwright screenshots on both small (320px)
  and standard portrait viewports to catch text overflow and overlapping cues.

## Git

Keep the history **linear and tidy** — `main` should read as one commit per
change, with no merge commits anywhere in it.

### Flow

Work on a branch and land it through a PR — don't commit straight to `main`.

1. Branch from the latest `main`. In an agent session, use the branch the
   session was assigned (`claude/<something>`); otherwise any short name.
2. Commit, push with `git push -u origin <branch>`, open a PR against `main`.
3. **Squash-merge** it. That's what keeps `main` linear while leaving you free
   to push fix-ups on the branch. Merging is what deploys the site.

Sessions that skip the PR and push to `main` directly leave the task looking
unfinished in the UI, because there's no PR lifecycle to close.

A merged PR is finished — never stack follow-up work on its branch. Start
again from the updated `main`, even if you reuse the branch name.

### Commits

- **One commit per change** by the time it lands. Amend or squash rather than
  pushing a fix-up on top. No "wip" or "fix typo" commits in `main`.
- **Terse messages.** Imperative subject under ~50 chars, then 1–3 lines on
  what and why if it isn't obvious. No bullet-point essays.
- **Never a merge commit.** If `main` has moved under you, `git pull --rebase`.

```
Add Stack game

Slide-and-drop tower builder. Overhang is sliced off as falling debris;
flush landings keep full width. Camera follows the tower as it rises.
```

## Deploying

Merging a PR to `main` → `.github/workflows/deploy.yml` → GitHub Pages.
Nothing to run by hand; the site is the repo root, there's no build.

**Every open PR is playable before it merges**, at
`https://danielshaulov.github.io/playground/pr/<number>/` (all of them listed
at `.../pr/`, and in a Builds list at the bottom of the launcher, which is
how a Home Screen install switches builds). The workflow posts the link as a
PR comment. Each deploy
rebuilds `main` plus every open PR (`scripts/build-pages.sh`), so a closed PR's
preview disappears on the next one. Previews share main's origin, so
`shared/storage.js` namespaces saves as `playground:pr-<n>:...` under a preview
path — always go through `createStore`, never raw `localStorage`, or a branch
will read and write the real save.

**The deployed pages are not quite the repo's files.** A phone brings back a
days-old tab from whatever it kept and fetches the rest new, and an old
build's files beside a new one's do not fit: stale CSS under new screens once,
a screen that would not load another time. So `scripts/stamp-build.mjs` gives
every file a new URL per deploy: `?v=<commit>` on each game page's stylesheets
and script, and an import map that adds it to every module the game and
`shared/` have. Three consequences: a stylesheet loaded from JS needs the
mark too (take it from `import.meta.url`), a game page must not carry an
import map of its own, and a page can break only once stamped — `npm run
test:site` loads every game from a stamped copy.

Two things that have already broken this once each:

- The `github-pages` **environment** carries a deployment branch rule pinned to
  whatever the default branch was when Pages was enabled. If a deploy fails in
  ~1 second with no step logs, that's it — the reason only appears in the
  check-run _annotations_, not the job log. Fixed under Settings →
  Environments → `github-pages` → Deployment branches. Needs a human; the API
  is not reachable from an agent session.
- **Ref deletion and repo-settings writes are blocked** for agent sessions
  (`403 ... not permitted through this proxy`). Deleting a branch or changing
  a setting is a human step — ask, don't retry.

## Verifying a change

Play it. A game that compiles is not a game that works.

Every PR runs `.github/workflows/test.yml` and merges only when it is green;
`npm test` runs the same checks locally. Ferment's testing notes are in
`docs/ferment/README.md`.

```sh
npm start   # http://localhost:8000
```

Drive it with Playwright in a portrait viewport (`devices["iPhone 13"]`,
`hasTouch: true`) and assert on real gameplay: that the score moves, the lose
condition fires, the best score persists, and the console is clean. To hit a
canvas target with no test hooks in the game, scan the canvas pixels for what
was actually drawn and tap those coordinates.

Chromium is at `/opt/pw-browsers/chromium` — pass it as `executablePath`, and
never run `playwright install`.

A game with rules worth protecting can keep a harness next to it; `checkwiz` has
one in `tests/checkwiz/` (`npm run test:checkwiz`) that is worth reading before
writing another. Four tricks generalise:

- A game that persists its state is readable _and_ seedable through
  `localStorage`, so a test can resume any position instead of playing to it.
- A turn-based game whose rules live in a pure module (no DOM) can be played
  thousands of times in Node. That is the only honest way to tune difficulty;
  `npm run test:checkwiz:sim` is the example.
- A check you have never seen fail proves nothing. Break the rule it guards,
  or point it at the previous commit, and watch it go red.
- A two-sided simulation can be checked by symmetry: two identical armies
  with the dice switched off must stay mirror images. That once caught a
  battle model giving the first side to move 83 wins in 96, when nothing else
  did.

In remote agent sessions **browser egress is blocked**: Chromium cannot reach
any external host, though `curl` can. To verify something already deployed,
mirror it with `curl` and serve the downloaded files over localhost — that is
still a secure context, so service workers still register.

Real feel — touch latency, thumb reach, difficulty tuning — can only be judged
on a real phone. Say so rather than implying a headless pass proves it.
