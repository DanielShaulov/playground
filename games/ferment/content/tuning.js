// @ts-check
/**
 * Tuning numbers for the shop. Changing one changes how games play out, so the
 * replay goldens in tests/ferment/core/ must be regenerated in the same PR.
 * Time is in in-game hours.
 */

export const SLOTS = 9; // shelf spots (3 × 3)
export const SERVINGS = 2; // sales per jar
export const OPEN_AT = 8; // shop opens 08:00 (display only)
export const OPEN_HOURS = 12; // and closes 20:00
export const HOUR_SECONDS = 12.5; // real seconds per in-game hour while open
export const PATIENCE = 2.2; // hours a customer waits at the counter
export const PREORDER_PATIENCE = 1.5; // multiplier for someone collecting a pre-order
export const WINDOW = 0.16; // width of a customer's flavour window
export const DEMAND_SPREAD = 0.12; // spread (std dev) of where walk-ins want a recipe around its sweet spot
export const MAX_QUEUE = 3;
export const BULK_MISS = 3; // reputation lost when a bulk order is missed
export const OFF_MENU = 0.08; // chance a walk-in asks for a recipe not on the menu yet
export const REP_MAX = 10;

export const START_COINS = 40;
export const START_REP = 5;
/** Day 1 starts with a shelf in progress: [slot, recipe, flavour]. */
/** @type {[number, string, number][]} */
export const START_SHELF = [
  [0, "dill", 0.4],
  [1, "kimchi", 0.2],
  [2, "hotsauce", 0.62],
  [3, "kraut", 0.33],
  [4, "dill", 0.08],
  [6, "kimchi", 0.5],
];
