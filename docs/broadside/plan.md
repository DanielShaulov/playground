# Broadside! — Architecture & Game Design (Pocket World of Warships)

A one-handed portrait **live slow-moving tactical warship campaign** across **3 Sea Theaters** (_Sunlit Strait_, _Iron Sound_, _Abyssal Reach_), combining authentic **World of Warships** combat (heavy ship inertia, bow armor angling & AP ricochets vs broadside Citadels, ballistic shell flight-time leading, turret bearing arcs, island cover, and slow area-denial torpedoes) with **The Bridge** mission hub, a **Single Persistent Warship** with branching trade-off refits, and **"Escaped With Injuries"** retreat stakes.

Zero build step, vanilla ES modules, pure testable naval simulation/campaign core, procedural Web Audio synthesis, and Playwright portrait-phone verification.

## Core Pillars

1. **The Bridge & Handcrafted Naval Encounter Maps:**
   - Look out over your warship's live animated bow turret across the Theater horizon, and pick from **3 Brass Admiralty Dispatches** (`Safe Patrol`, `Tactical Contract`, `High-Stakes Raid / Sector Flagship`).
   - Every dispatch renders a **1:1 mini-map thumbnail** of **6 handcrafted encounter arenas** (`Sunlit Headlands`, `Twin Fang Narrows`, `Foggy Shipping Lane`, `Breakwater Harbor`, `Squall Skerries`, `Caldera Stronghold`) featuring sculpted rocky peninsulas, curved stone breakwaters, wooden harbor piers, rotating coastal lighthouses, bobbing channel buoys, drifting stealth **Sea-Fog Banks** (`👻 Hidden`), and squall rain / volcanic embers.
2. **One Persistent Warship — Branching Trade-Off Drydock & Visual Ship Evolution:**
   - Start weak as a scrappy **Coastal Gunboat** (`6 HP`, `1+1` guns, no auxiliary) and build your ship over time across **4 Hardpoint Bays** (`🛡️ Hull`, `🔫 Guns`, `🚀 Deck`, `📡 Tech`) spanning Tiers I–III.
   - Every upgrade carries real trade-offs — **Armor vs Speed** (_Ironclad Belt / Dreadnought_ vs _Hydrofoil Raider_), **Broadside Turrets vs Torpedo Conversion** (_Twin Broadsides_ vs sacrificing stern guns for `+2` torps & `-30%` CD), **Torpedoes vs Smoke vs Repair** (pairing Torpedo Conversion with Repair/Smoke unlocks a 4-pill dual-ability dock!), and **Dispersion vs Rudder Agility**.
   - **Visual Ship Evolution:** Your warship sprite (in Battle, Drydock, and on The Bridge rail) visibly transforms to match your equipped bays — single/twin/triple turret barrels, Hydrofoil wings, Ironclad side armor belts, port/starboard torpedo racks, Smoke/Repair deck gear, and spinning Admiralty Radar / Optical Rangefinder masts — alongside distinct enemy silhouettes for Patrol Boats, Destroyers, Cruisers, Battleships, Gold Convoys, Fire-Ships, Octagonal Coastal Forts, and Boss Flagships.
3. **No Global Lives or Run Wipes — "Escaped With Injuries":**
   - Sinking in battle never wipes your campaign. Your ship limps safely back to Port, **but** `1–2` equipped upgrades are knocked offline (**`DAMAGED IN RETREAT`**) until you repair them in Drydock (~45% cost) or swap in spare gear.
4. **Live One-Thumb Portrait Naval Combat:**
   - **Tap Water:** Brass Course Waypoint with heavy smooth rudder inertia.
   - **Tap Enemy:** Fire-Control Target Lock (converging rangefinder ticks, `~1.7×` faster settling, `0.62×` pinpoint dispersion floor).
   - **Hold & Drag Anywhere:** `74px` upward-offset **Rangefinder Stylus** with Viewport-Adaptive Bottom Sea Lift, live slew bloom + hold-to-settle dispersion, and broadside (`40°–140°`) island-clipped torpedo fans; lift to fire.
   - **Uncapped Ballistics & Bow-Only Armor Angling:** Every connecting shell deals full damage (`1` pen/HE, `2` AP Citadel); only the pointed armored **bow** bounces AP (never stern!), and bow-into-broadside T-bone ramming + symmetric Sea-Fog gun-bloom + symmetric naval mines apply to both sides.
   - **Bottom Thumb Dock:** `[ ⚫ AP / 🔥 HE ]` · `[ ⏹ STOP / ▲ FULL ]` · `[ 🚀 TORP / 💨 SMOKE / 🛠️ REPAIR ]` (automatically expanding to 4 pills when combining Gun-bay Torpedoes with Smoke/Repair).

## Modules

- `games/broadside/core/rng.js` — Deterministic Mulberry32 PRNG and seed hashing.
- `games/broadside/core/arenas.js` — 6 handcrafted naval arenas (composite collision circle-chains paired with sculpted rocky peninsulas, stone breakwaters, wooden piers, lighthouses, channel buoys, drifting fog banks, and weather).
- `games/broadside/core/content.js` — 4 Hardpoint Bays, 16 branching trade-off Parts across Tiers I–III, 3 Sea Theaters, and enemy warship classes.
- `games/broadside/core/campaign.js` — Persistent single-ship campaign (`SAVE_V = 6`), modular stat aggregation (`computeShipStats`), independent torpedo cooldowns, Drydock buy/equip/repair economy, Option A retreat damage (`applyRetreatDamage`), and Bridge Dispatch generation.
- `games/broadside/core/sim.js` — Live heavy rudder/throttle physics, parabolic uncapped ballistic shells, bow-only AP Ricochet vs Citadel armor math, hold-to-settle fire-control bloom (`stepAimBloom`, `isAimOnLockedEnemy`), symmetric broadside torpedo arcs (`canLaunchTorpedoAt`), shoreline torpedo blocking & raycast (`raycastIslandDist`), symmetric fog/mines/angle-aware ramming (`computeRamDamage`), live incoming armor-angle detection, HE deck fires, turret arcs, and enemy AI.
- `games/broadside/audio.js` — Procedural Web Audio synthesizer.
- `games/broadside/screens.js` — Title, Bridge Horizon + 1:1 Handcrafted Mini-Map Dispatches, Blueprint Trade-Off Drydock with evolved ship preview, and Aftermath screen renderers.
- `games/broadside/render.js` — Single-screen strait arena renderer, Visual Ship Evolution (`buildPlayerShipVisual`, `buildEnemyShipVisual`, `drawSteelWarship`), octagonal coastal forts, segmented steel HP bars, Rangefinder Stylus + Viewport-Adaptive Bottom Sea Lift, multi-pass handcrafted coastlines/fog/weather, and 3/4-pill battle HUD.
- `games/broadside/game.js` — Connects `shared/engine.js`, `shared/ui.js`, and `shared/storage.js`.

## Verification

- `npm run test:broadside` — Pure Node tests verifying trade-off ship math, Option A retreat damage & repair, rudder inertia, Ricochet vs Citadel angles, island raycasting, and a Live Campaign Balance Gate (`tests/broadside/core.test.mjs`).
- `npm run test:broadside:browser` — Headless Chrome portrait-phone verification on iPhone 13 & iPhone SE (`tests/broadside/browser.test.mjs`).
