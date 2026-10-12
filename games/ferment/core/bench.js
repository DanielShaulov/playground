// @ts-check
/**
 * The bench and the pantry: add-ins, experiments, recipe discovery and the
 * recipe card.
 *
 * Ingredients are bought at the market in the evening (market.js) and kept
 * in state.pantry.stock. Mixing them into a jar bends how it ripens (the maths is
 * in jars.js). Some mixes make a different recipe: a base recipe brewed with
 * every ingredient a discovered recipe `needs` becomes that recipe, and the
 * first time that happens (on the shelf or in an evening experiment) the
 * recipe joins the menu, so walk-ins start asking for it.
 *
 * state.bench remembers what the player has learned: `known` (discovered
 * recipes), `hints` (discovered recipes the recipe card hints at) and `tried`
 * (base recipe → ingredients mixed into it at least once, which the card ticks).
 */

import { RECIPES, RECIPE_IDS, TIER_IDS, VARIANT_IDS } from "../content/recipes.js";
import { INGREDIENTS, INGREDIENT_IDS } from "../content/ingredients.js";
import { ageAt, forecast, mixOf, validAdds } from "./jars.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Curve} Curve */
/** @typedef {import("./types.js").RecipeCard} RecipeCard */

const isRecipe = (r) => typeof r === "string" && Object.hasOwn(RECIPES, r);

/**
 * Recipes on the menu right now: the starting four, those the shop's
 * tier has unlocked, then whatever has been discovered.
 */
export function menu(/** @type {State} */ s) {
  return [
    ...RECIPE_IDS,
    ...TIER_IDS.filter((id) => (RECIPES[id].tier ?? 0) <= s.progress.tier),
    ...VARIANT_IDS.filter((id) => s.bench.known.includes(id)),
  ];
}

/**
 * What a mix makes. `recipe` may be a base or a discovered recipe (which is
 * shorthand for its base plus its `needs`). The result is the discovered
 * recipe whose `needs` the add-ins cover, preferring the one that needs most,
 * else the base itself. Null when the recipe or the add-ins are not valid.
 * @returns {{ recipe: string, base: string, adds: string[] } | null}
 */
export function resolveMix(/** @type {unknown} */ recipe, /** @type {unknown} */ adds = []) {
  if (!isRecipe(recipe) || !validAdds(adds)) return null;
  const r = RECIPES[/** @type {string} */ (recipe)];
  const base = r.base ?? /** @type {string} */ (recipe);
  const all = [...new Set([...(r.needs ?? []), .../** @type {string[]} */ (adds)])];
  if (!validAdds(all)) return null;
  let made = base;
  for (const id of VARIANT_IDS) {
    const v = RECIPES[id];
    if (v.base !== base || !v.needs.every((n) => all.includes(n))) continue;
    if (made === base || v.needs.length > RECIPES[made].needs.length) made = id;
  }
  return { recipe: made, base, adds: all };
}

/**
 * The bench time-lapse for a mix, with no state needed: `points` are `n`
 * evenly spaced moments from starting the jar (hour 0) to its lid popping,
 * each with the flavour then; `sweet` is the recipe's best stretch, as
 * flavour and as hours since starting; `sooner` is how many hours earlier
 * the middle of that stretch comes than for a plain jar of the base recipe
 * (negative: later). Null for an unknown recipe or bad add-ins.
 * @returns {Curve | null}
 */
export function previewCurve(
  /** @type {unknown} */ recipe,
  /** @type {unknown} */ adds = [],
  n = 5,
) {
  const mix = resolveMix(recipe, adds);
  if (!mix || !Number.isInteger(n) || n < 2) return null;
  const { speed, shift } = mixOf(mix.adds);
  const popAt = ageAt(mix.recipe, mix.adds, 1);
  const points = Array.from({ length: n }, (_, i) => {
    const hour = (popAt * i) / (n - 1);
    return { hour, f: Math.min(1, forecast(mix.recipe, hour, mix.adds)) };
  });
  const [lo, hi] = RECIPES[mix.recipe].sweet;
  const from = ageAt(mix.recipe, mix.adds, lo);
  const to = ageAt(mix.recipe, mix.adds, hi);
  const [plo, phi] = RECIPES[mix.base].sweet;
  const plainMid = ((plo + phi) / 2) * RECIPES[mix.base].hours;
  return {
    ...mix,
    speed,
    shift,
    popAt,
    points,
    sweet: { lo, hi, from, to },
    sooner: plainMid - (from + to) / 2,
  };
}

/**
 * What the recipe card shows for a base recipe: its best stretch for a plain
 * jar, each ingredient's effect (`known` once mixed into this recipe), and the
 * recipes discovered from it: "known" (with what it needs), "hinted" (only the
 * tags of what it needs) or "hidden". Null for an unknown or discovered recipe.
 * @returns {RecipeCard | null}
 */
export function recipeCard(/** @type {State} */ s, /** @type {unknown} */ recipe) {
  if (!isRecipe(recipe) || RECIPES[/** @type {string} */ (recipe)].base) return null;
  const id = /** @type {string} */ (recipe);
  const curve = /** @type {Curve} */ (previewCurve(id));
  const tried = s.bench.tried[id] ?? [];
  return {
    recipe: id,
    sweet: curve.sweet,
    effects: INGREDIENT_IDS.map((ingredient) => ({
      ingredient,
      tag: INGREDIENTS[ingredient].tag,
      known: tried.includes(ingredient),
    })),
    found: VARIANT_IDS.filter((v) => RECIPES[v].base === id).map((v) => {
      const state = s.bench.known.includes(v)
        ? "known"
        : s.bench.hints.includes(v)
          ? "hinted"
          : "hidden";
      return {
        recipe: v,
        state,
        tags: state === "hidden" ? [] : RECIPES[v].needs.map((n) => INGREDIENTS[n].tag),
        needs: state === "known" ? [...RECIPES[v].needs] : [],
      };
    }),
  };
}

/**
 * Check a mix against the menu and the pantry, without changing anything.
 * Returns a reason to refuse, or the resolved mix.
 */
export function checkMix(
  /** @type {State} */ s,
  /** @type {unknown} */ recipe,
  /** @type {unknown} */ adds,
) {
  const mix = resolveMix(recipe, adds ?? []);
  if (!mix) return isRecipe(recipe) ? "bad add-ins" : "no such recipe";
  const r = RECIPES[/** @type {string} */ (recipe)];
  if (r.base && !s.bench.known.includes(/** @type {string} */ (recipe)))
    return "recipe not discovered";
  if ((r.tier ?? 0) > s.progress.tier) return "recipe not unlocked";
  if (mix.adds.some((a) => (s.pantry.stock[a] ?? 0) < 1)) return "not in the pantry";
  return mix;
}

/** Use up a checked mix's add-ins and learn from it. Pushes `discovered` when it is new. */
export function useMix(
  /** @type {State} */ s,
  /** @type {{ recipe: string, base: string, adds: string[] }} */ mix,
  events,
) {
  for (const a of mix.adds) s.pantry.stock[a]--;
  if (mix.adds.length) {
    const tried = (s.bench.tried[mix.base] ??= []);
    for (const a of mix.adds) if (!tried.includes(a)) tried.push(a);
  }
  if (mix.recipe !== mix.base && !s.bench.known.includes(mix.recipe)) {
    s.bench.known.push(mix.recipe);
    s.bench.hints = s.bench.hints.filter((h) => h !== mix.recipe);
    s.orders.asked = s.orders.asked.filter((x) => x.recipe !== mix.recipe);
    events.push({ type: "discovered", recipe: mix.recipe, base: mix.base, adds: [...mix.adds] });
  }
}

/**
 * { type: "experiment", recipe, adds } — in the evening, try a mix at the
 * bench without using a shelf slot: it uses up one of each add-in (no coins)
 * and teaches the recipe card exactly what brewing it would.
 */
export function experiment(s, { recipe, adds }, events) {
  if (s.clock.phase !== "evening") return "bench opens in the evening";
  const mix = checkMix(s, recipe, adds);
  if (typeof mix === "string") return mix;
  if (!mix.adds.length) return "nothing to try";
  useMix(s, mix, events);
  events.push({ type: "experimented", ...mix, curve: previewCurve(mix.recipe, mix.adds) });
}
