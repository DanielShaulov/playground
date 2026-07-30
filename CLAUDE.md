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

### Two things that bite

- **Coordinates are CSS pixels** and retina scaling is already applied to the
  context — but the play area is whatever the phone gives you. Size everything
  off `stage.width` / `stage.height`. Never hardcode pixel positions.
- **Store widths/positions in pixels and a resize breaks them.** If a game
  keeps persistent geometry (like Stack's tower), handle `stage.onResize` and
  rescale. The iOS URL bar collapsing counts as a resize.

## Git

Keep the history **linear and tidy** — it should read as one commit per change.

- **Commit directly to `main`.** No feature branches, no PRs, unless the user
  asks for one. Pushing to `main` is what deploys the site.
- **One commit per change.** Squash or amend before pushing rather than pushing
  a fix-up commit on top. Never push a "wip" or "fix typo" commit.
- **Terse messages.** Imperative subject under ~50 chars, then 1–3 lines on
  what and why if it isn't obvious. No bullet-point essays.
- **Never merge commits.** If `main` has moved, `git pull --rebase`.

```
Add Stack game

Slide-and-drop tower builder. Overhang is sliced off as falling debris;
flush landings keep full width. Camera follows the tower as it rises.
```

## Deploying

Push to `main` → `.github/workflows/deploy.yml` → GitHub Pages. Nothing to run
by hand; the site is the repo root, there's no build.

Two things that have already broken this once each:

- The `github-pages` **environment** carries a deployment branch rule pinned to
  whatever the default branch was when Pages was enabled. If a deploy fails in
  ~1 second with no step logs, that's it — the reason only appears in the
  check-run *annotations*, not the job log. Fixed under Settings →
  Environments → `github-pages` → Deployment branches. Needs a human; the API
  is not reachable from an agent session.
- **Ref deletion and repo-settings writes are blocked** for agent sessions
  (`403 ... not permitted through this proxy`). Deleting a branch or changing
  a setting is a human step — ask, don't retry.

## Verifying a change

Play it. A game that compiles is not a game that works.

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

In remote agent sessions **browser egress is blocked**: Chromium cannot reach
any external host, though `curl` can. To verify something already deployed,
mirror it with `curl` and serve the downloaded files over localhost — that is
still a secure context, so service workers still register.

Real feel — touch latency, thumb reach, difficulty tuning — can only be judged
on a real phone. Say so rather than implying a headless pass proves it.
