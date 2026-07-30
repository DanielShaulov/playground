# Playground

A pile of small, one-off HTML5 games, built to be played on a phone in portrait.

No build step, no framework, no dependencies at runtime. Each game is a folder
with an `index.html` and a `game.js` that imports a few shared helpers. Open a
file, edit it, refresh — that's the whole loop.

## Playing on your phone

The site deploys to GitHub Pages whenever something lands on `main`
(`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source →
GitHub Actions**. After that it's live at
`https://<user>.github.io/playground/`.

Open that on your phone and **Add to Home Screen** — it then runs fullscreen
with no browser chrome, locked to portrait, and works offline.

## Developing

```sh
npm start           # serves the repo at http://localhost:8000
```

Then open `http://<your-computer's-LAN-ip>:8000` on your phone to test on the
real device — a desktop browser's phone emulator gets touch latency, thumb
reach, and screen size wrong, and those are most of what makes a phone game
feel good or bad.

### Adding a game

```sh
npm run new -- flappy-thing "Flappy Thing" "🐦" "Tap to flap, don't hit stuff."
```

That creates `games/flappy-thing/` from the template and registers it in
`games.js`, so it shows up on the launcher. Then edit `games/flappy-thing/game.js`.

### Conventions

Work on a branch and land it via a squash-merged PR — that keeps `main` linear
while still allowing fix-ups on the branch. One commit per change once it
lands, terse messages, rebase rather than merge. Merging to `main` is what
deploys.

`CLAUDE.md` has the full working notes, including the deploy failure modes
worth knowing before you go debugging a red Actions run.

## Layout

```
index.html          launcher — grid of game tiles
games.js            the registry; add a game here and it appears
games/<id>/         one folder per game (index.html + game.js)
shared/
  engine.js         canvas sizing, game loop, pointer input, small math helpers
  ui.js             HUD bar, stat readouts, start/game-over overlays
  storage.js        namespaced localStorage for high scores
  style.css         base mobile styling — safe areas, no zoom, no scroll
scripts/
  new-game.sh       scaffold a new game
  make-icons.py     regenerate the PWA icons
  template/         what new-game.sh copies
sw.js               service worker — offline play
```

## Writing a game

The shared layer handles the fiddly mobile bits so a game is mostly just
update-and-draw:

```js
import { createLoop, createInput } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const shell = createShell({ title: "My Game", stats: ["Score"] });
const { stage } = shell;

createInput(stage, {
  onTap({ x, y }) {},
  onSwipe({ dir }) {},
  onMove({ x, y, dx, dy }) {},
});

createLoop((dt) => {
  const { ctx, width, height } = stage;
  ctx.clearRect(0, 0, width, height);
  // update and draw
});
```

Two things to keep in mind:

- **Coordinates are CSS pixels**, and retina scaling is already applied to the
  context. But the play area is whatever the phone gives you, so size things off
  `stage.width` / `stage.height` rather than hardcoding positions.
- **Touch targets should be at least ~44px.** A thumb is not a mouse pointer,
  and it covers up the thing it's tapping.

`games/tap-rush/` is the reference implementation — it uses every part of the
shared layer, so it's a reasonable thing to copy.
