// @ts-check
/**
 * Jars: reading their flavour and ageing them.
 *
 * A jar's flavour is just age / recipe.hours, from 0 (crisp) to 1 (funky). At 1
 * the lid pops and it can't be sold.
 */

import { RECIPES } from "../content/recipes.js";
import { BANDS } from "../content/flavour.js";
import { SERVINGS } from "../content/tuning.js";
import { clamp, nextId } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Jar} Jar */

export const flavour = (/** @type {Jar} */ jar) => clamp(jar.age / RECIPES[jar.recipe].hours, 0, 1);
export const isOver = (/** @type {Jar} */ jar) => jar.age >= RECIPES[jar.recipe].hours;
export const bandOf = (/** @type {number} */ x) =>
  BANDS.find((b) => x < b.hi) ?? BANDS[BANDS.length - 1];

/** Where a jar of `recipe` started now will sit after `hours` more hours. */
export const forecast = (/** @type {string} */ recipe, /** @type {number} */ hours) =>
  hours / RECIPES[recipe].hours;

/** @returns {Jar} */
export function makeJar(/** @type {State} */ s, /** @type {string} */ recipe, age = 0) {
  return { id: nextId(s), recipe, age, servings: SERVINGS };
}

/** Age every jar on the shelf by `hours`. Returns the jars whose lid just popped. */
export function ageJars(/** @type {State} */ s, /** @type {number} */ hours) {
  /** @type {Jar[]} */
  const popped = [];
  for (const jar of s.shelf.slots) {
    if (!jar) continue;
    const was = isOver(jar);
    jar.age += hours;
    if (!was && isOver(jar)) popped.push(jar);
  }
  return popped;
}
