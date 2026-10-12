// @ts-check
/**
 * The Brine Nook — game core. Pure: no DOM, no clock, no Math.random, no
 * storage. The UI and the tests import only this file.
 *
 *   newGame(seed)          a fresh state
 *   loadSave(raw)          a saved state made playable, or null to start fresh
 *   step(state, action)    → { state, events }; the only way the game changes
 *
 * The rest are read-only helpers the UI uses to draw the state.
 * Module map: state.js (slices) · step.js (action list) · clock.js (day cycle,
 * fixed steps) · shop.js (coins, rep, shelf actions) · customers.js (walk-ins)
 * · orders.js (orders, regulars, planFor) · jars.js (flavour, add-in maths)
 * · bench.js (pantry, experiments, discovery, recipe card) · market.js (stalls, buy)
 * · progress.js (upgrades, tiers, goals) · rng.js (named random streams).
 */

export { newGame, loadSave, SLICES } from "./state.js";
export { step, ACTIONS } from "./step.js";
export { STEP, STEPS_PER_HOUR } from "./clock.js";
export { flavour, isOver, bandOf, forecast, ageAt, lifeOf, mixOf } from "./jars.js";
export { previewCurve, recipeCard, resolveMix, menu, unlocked } from "./bench.js";
export { judge, demand, demandAt } from "./customers.js";
export { dueFor, planFor, holdsOn, freePortions } from "./orders.js";
export {
  tierOf,
  slotCount,
  jarSize,
  crockAt,
  upgradeOffers,
  goalAt,
  goalText,
  goalNow,
  measure,
} from "./progress.js";
export { marketToday, priceAt } from "./market.js";
