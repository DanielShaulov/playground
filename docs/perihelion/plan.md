# Perihelion — Build Plan

An ambitious one-handed portrait orbital slingshot roguelike.
Zero build step, vanilla ES modules, pure testable physics/run core, procedural Web Audio synthesis, Playwright phone verification.

## Milestones

- [x] **M0: Branch & Scaffold** — `perihelion` branch, `npm run new` registration in `games.js`, design doc.
- [x] **M1: Pure Simulation Core** (`games/perihelion/core/`)
  - `rng.js` — deterministic Mulberry32 PRNG + daily seed helper
  - `relics.js` — 12 synergistic relics with helpers
  - `sectors.js` — 12 curated/procedural sector archetypes + endless scaling (planets, repulsors, binaries, singularities, wormholes, keyed prism gates, bumpers, mines)
  - `physics.js` — RK4 N-body gravity, orbit grapple tether + tangential overcharge, Perihelion Graze detection, trajectory prediction, wormholes, Twin Probe, Aegis bounce, Ricochet walls
  - `run.js` — pure run state machine (title, play, draft, victory, over), scoring, save/resume serialization
  - `tests/perihelion/core.test.mjs` — Node tests covering physics, relics, solvability across seeds, save roundtrip
- [x] **M2: Audio & Visual Craft**
  - `games/perihelion/audio.js` — Web Audio procedural synth (pentatonic crystal chimes, tension hum, grapple charge, whip release, graze shimmer, warp chord)
  - `games/perihelion/render.js` — full-bleed starfield/nebula, shaded procedural planets & rings, black-hole accretion disks, wormhole swirls, bending dotted trajectory preview, comet plasma trails, shockwaves, floating popups, crisp canvas UI (title, draft cards, pause/recall, victory/game-over, relic bar)
- [x] **M3: Playable Game Wiring**
  - `games/perihelion/game.js` & `index.html` — shared engine/shell/storage integration, responsive scaling across portrait viewports, mute toggle, Daily Run & Standard Run, interactive title demo, clean `window.__perihelion` test hook
- [x] **M4: Verification & Polish**
  - `tests/perihelion/browser.test.mjs` — Playwright verification on iPhone 13 & iPhone SE viewports (gameplay, scoring, warp/draft, lose condition, best-score persistence, console cleanliness, visual screenshots)
  - Run full repo `npm test` (Checkwiz + Ferment + Typecheck + Perihelion)
  - Push branch and open PR for GitHub Pages preview
