// @ts-check
/**
 * The game state: one JSON-safe object made of slices, each with its own
 * defaults. A new system registers its slice with one line in SLICES.
 *
 * Saves carry no version number. loadSave() fills any slice (or field) a save
 * is missing from its defaults, so parallel PRs never fight over a version.
 * From the release on, saves are kept: tests/ferment/core/fixtures/ holds
 * real saves every build must load as they are. Only something that was never
 * a sliced save (the first demo's, or junk) starts a fresh game instead.
 */

import { RECIPES, VARIANT_IDS } from "../content/recipes.js";
import { START_PANTRY } from "../content/ingredients.js";
import { SLOTS, START_COINS, START_REP, START_SHELF, START_GIFT } from "../content/tuning.js";
import { makeJar, validAdds } from "./jars.js";
import { freshToday } from "./shop.js";
import { freshProgress, slotCount } from "./progress.js";
import { openMarket } from "./market.js";
import { freshTutorial } from "./tutorial.js";
import { freshDecor } from "./decor.js";
import { freshEnding } from "./ending.js";

/** @typedef {import("./types.js").State} State */

/** Slice name → fresh defaults. Order is the order keys appear in a save. */
export const SLICES = {
  meta: () => ({ seed: 0, nextId: 1, rng: {} }),
  clock: () => ({ day: 1, phase: "morning", hour: 0 }),
  shop: () => ({ coins: START_COINS, rep: START_REP, today: freshToday(START_REP) }),
  shelf: () => ({ slots: Array(SLOTS).fill(null) }),
  customers: () => ({ queue: [], nextArrival: 0 }),
  orders: () => ({ list: [], offers: [], asked: [] }),
  bench: () => ({ known: [], hints: VARIANT_IDS.filter((id) => RECIPES[id].hinted), tried: {} }),
  pantry: () => ({ stock: { ...START_PANTRY } }),
  regulars: () => ({ met: {} }),
  progress: freshProgress,
  market: () => ({ day: 0, items: {}, drift: {} }),
  tutorial: () => freshTutorial(),
  decor: freshDecor,
  ending: freshEnding,
};

/** @returns {State} */
function defaults() {
  const s = /** @type {any} */ ({});
  for (const [name, make] of Object.entries(SLICES)) s[name] = make();
  return s;
}

/**
 * A new shop on day 1, with a shelf already in progress so there's something to sell.
 * `tutorial`: the player's start instead (core/tutorial.js): the intro scene and
 * the first days' notes, and an empty shelf but for the old keeper's parting jars.
 * Without it (the bots, goldens and tests) the shelf starts as START_SHELF.
 */
export function newGame(seed = 1, { tutorial = false } = {}) {
  const s = defaults();
  s.meta.seed = seed | 0;
  if (tutorial) s.tutorial = freshTutorial(true);
  for (const [slot, recipe, f] of tutorial ? START_GIFT : START_SHELF) {
    s.shelf.slots[slot] = makeJar(s, recipe, f * RECIPES[recipe].hours);
  }
  openMarket(s);
  return s;
}

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * Turn whatever was saved into a playable state, or null to start fresh.
 * Missing slices and missing fields inside a slice take their defaults.
 * @returns {State | null}
 */
export function loadSave(/** @type {any} */ raw) {
  if (!isObj(raw) || !isObj(raw.meta) || !isObj(raw.clock)) return null;
  const s = /** @type {any} */ ({});
  for (const [name, make] of Object.entries(SLICES)) {
    const saved = raw[name];
    s[name] = isObj(saved) ? { ...make(), ...saved } : make();
  }
  if (!isObj(s.progress.upgrades) || !isObj(s.progress.crocks) || !isObj(s.progress.stats))
    return null;
  s.progress.stats = { ...freshProgress().stats, ...s.progress.stats };
  if (!Array.isArray(s.progress.pride) || !Array.isArray(s.decor.owned) || !isObj(s.decor.on))
    return null;
  if (!Array.isArray(s.shelf.slots) || s.shelf.slots.length !== slotCount(s)) return null;
  if (s.shelf.slots.some((j) => j && !Object.hasOwn(RECIPES, j.recipe))) return null;
  if (s.shelf.slots.some((j) => j && !validAdds(j.adds))) return null;
  return s;
}
