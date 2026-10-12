// @ts-check
/**
 * Jars: reading their flavour and ageing them.
 *
 * A plain jar's flavour is just age / recipe.hours, from 0 (crisp) to 1
 * (funky). At 1 the lid pops and it can't be sold.
 *
 * Add-ins (content/ingredients.js) bend that line. Their speeds multiply into
 * the jar's life, `life = hours / speed`, and their shifts add into an offset
 * along the strip, so flavour = (age + shift × life) / life. A plain jar has
 * speed 1 and shift 0, and every formula below reduces to the plain one
 * exactly (same floating-point operations), which keeps old games replaying.
 *
 * A crock (content/upgrades.js) multiplies a jar's speed by its `pace`. The
 * pace is stored on the jar when it is started, so a jar ripens the same way
 * wherever it sits later, and every forecast of it stays true.
 */

import { RECIPES } from "../content/recipes.js";
import { BANDS } from "../content/flavour.js";
import { INGREDIENTS, MAX_ADDS } from "../content/ingredients.js";
import { SERVINGS } from "../content/tuning.js";
import { clamp, nextId } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Jar} Jar */

/** Most a jar's add-ins can shift it along the strip, either way. */
export const MAX_SHIFT = 0.3;

/** True when `adds` is a valid add-in list: known ingredients, no repeats, at most MAX_ADDS. */
export function validAdds(/** @type {unknown} */ adds) {
  if (adds === undefined) return true;
  if (!Array.isArray(adds) || adds.length > MAX_ADDS) return false;
  if (new Set(adds).size !== adds.length) return false;
  return adds.every((a) => typeof a === "string" && Object.hasOwn(INGREDIENTS, a));
}

/** Speed and shift of a set of add-ins (1 and 0 for none). */
export function mixOf(/** @type {readonly string[] | undefined} */ adds) {
  let speed = 1,
    shift = 0;
  for (const a of adds ?? []) {
    speed *= INGREDIENTS[a].speed;
    shift += INGREDIENTS[a].shift;
  }
  return { speed, shift: clamp(shift, -MAX_SHIFT, MAX_SHIFT) };
}

/**
 * Hours a jar of `recipe` with `adds`, in a crock of `pace`, takes to cross
 * the whole strip.
 */
export const lifeOf = (
  /** @type {string} */ recipe,
  /** @type {readonly string[]} */ adds,
  pace = 1,
) => RECIPES[recipe].hours / (mixOf(adds).speed * pace);

/** Head start in hours along the strip (negative: a lag before it starts to turn). */
const leadOf = (
  /** @type {string} */ recipe,
  /** @type {readonly string[] | undefined} */ adds,
  pace = 1,
) => {
  const { speed, shift } = mixOf(adds);
  return shift * (RECIPES[recipe].hours / (speed * pace));
};

/** Flavour of a jar of `recipe` with `adds` in a crock of `pace` at `age` hours, unclamped. */
const rawFlavour = (recipe, adds, age, pace = 1) =>
  (age + leadOf(recipe, adds, pace)) / (RECIPES[recipe].hours / (mixOf(adds).speed * pace));

export const flavour = (/** @type {Jar} */ jar) =>
  clamp(rawFlavour(jar.recipe, jar.adds, jar.age, jar.pace ?? 1), 0, 1);
export const isOver = (/** @type {Jar} */ jar) =>
  jar.age + leadOf(jar.recipe, jar.adds, jar.pace ?? 1) >=
  RECIPES[jar.recipe].hours / (mixOf(jar.adds).speed * (jar.pace ?? 1));
export const bandOf = (/** @type {number} */ x) =>
  BANDS.find((b) => x < b.hi) ?? BANDS[BANDS.length - 1];

/**
 * Where a jar of `recipe` (with `adds`, in a crock of `pace`) will sit at
 * `hours` old. For a jar on the shelf pass its own adds and pace.
 */
export const forecast = (
  /** @type {string} */ recipe,
  /** @type {number} */ hours,
  /** @type {readonly string[]} */ adds = [],
  pace = 1,
) =>
  adds.length || pace !== 1
    ? clamp(rawFlavour(recipe, adds, hours, pace), 0, 1)
    : hours / RECIPES[recipe].hours;

/** Age (hours since started) at which a jar of `recipe` with `adds` in a crock of `pace` reaches flavour `f`. */
export const ageAt = (
  /** @type {string} */ recipe,
  /** @type {readonly string[]} */ adds,
  /** @type {number} */ f,
  pace = 1,
) => Math.max(0, f * lifeOf(recipe, adds, pace) - leadOf(recipe, adds, pace));

/**
 * A new jar holding `size` portions, started in a crock of `pace` (stored on
 * the jar only when it isn't 1, like `adds`).
 * @returns {Jar}
 */
export function makeJar(
  /** @type {State} */ s,
  /** @type {string} */ recipe,
  age = 0,
  /** @type {string[]} */ adds = [],
  { pace = 1, size = SERVINGS } = {},
) {
  /** @type {Jar} */
  const jar = { id: nextId(s), recipe, age, servings: size, size };
  if (adds.length) jar.adds = [...adds];
  if (pace !== 1) jar.pace = pace;
  return jar;
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
