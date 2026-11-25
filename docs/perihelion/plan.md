# Perihelion — Architecture & Design

A one-handed portrait orbital slingshot across **24 handcrafted orbits** grouped into **4 Constellations** (*Helios*, *Pulsar*, *Harmonic*, *Singularity*), with **4 star-unlockable Probe Ships**, an interactive hands-on tutorial, and a **5-stage Daily Gauntlet**.

Zero build step, vanilla ES modules, pure testable physics/campaign core, procedural Web Audio synthesis, Playwright phone verification.

## Core Modules

- `games/perihelion/core/rng.js` — Deterministic Mulberry32 PRNG + Daily seed helper.
- `games/perihelion/core/ships.js` — 4 Probe Chassis unlocked via Constellation Stars (`Solaris`, `Aegis`, `Tachyon`, `Gemini`).
- `games/perihelion/core/campaign.js` — 24 handcrafted orbits across 4 themed chapters + deterministic 5-stage Daily Gauntlet generator.
- `games/perihelion/core/physics.js` — RK4 N-body gravity, live trajectory preview, real-time curved Orbit Grapple exit-arc prediction, spacetime grid warping, and collision/graze resolution.
- `games/perihelion/core/progress.js` — Pure Constellation progression (3 mastery stars per orbit: Clear, Par Shots, All Crystals), ship/chapter unlocks, interactive Orbit-2 slow-mo grapple tutorial assist, Daily Gauntlet state, and save sanitization (`SAVE_V = 2`).
- `games/perihelion/audio.js` — Procedural Web Audio synthesizer (pentatonic crystal combos, tether lock/charge/whip sweeps, graze shimmer, star-ignite chords).
- `games/perihelion/render.js` — Warped spacetime grid, living Constellation Star Chart, Probe Hangar, animated Ghost-Thumb & Slow-Mo Grapple tutorials, diegetic leader-line callouts, ghost previous-shot trace, live curved exit arc, and sleek 3-star Clear Sheet.
- `games/perihelion/game.js` — Wires shared `engine.js`, `ui.js`, and `storage.js` (PR-isolated saves).

## Tests

- `npm run test:perihelion` — Pure Node tests (`tests/perihelion/core.test.mjs`).
- `npm run test:perihelion:browser` — Headless Chromium portrait-phone verification on iPhone 13 & iPhone SE (`tests/perihelion/browser.test.mjs`).
