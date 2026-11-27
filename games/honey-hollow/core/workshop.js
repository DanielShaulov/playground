// @ts-check
/**
 * The workshop: beeswax, bunches and honey become candles, soap, balm and
 * the rest. Open in the morning and the evening once the keeper has held
 * their first wax; a few crafts a day, more in winter.
 */

import { GOODS, GOOD_IDS, RECIPES, RECIPE_IDS } from "../content/goods.js";
import { CRAFTS_PER_DAY, WINTER_CRAFTS, STARS } from "../content/tuning.js";
import { calendarOf } from "./calendar.js";
import { talentOf } from "./keeper.js";
import { productInfo, stockOf } from "./market.js";
import { bump, drop } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("../content/goods.js").Recipe} Recipe */

/** The workshop opens with the first beeswax. */
export const workshopOpen = (/** @type {State} */ state) => state.progress.stats.wax > 0;

/** Crafts allowed today. */
function craftLimit(/** @type {State} */ state) {
  const winter = calendarOf(state.clock.day).season === 3;
  return (winter ? WINTER_CRAFTS : CRAFTS_PER_DAY) + (talentOf(state).crafts ?? 0);
}

/** Crafts still to be made today. */
export function craftsLeft(/** @type {State} */ state) {
  const made = state.workshop.made.day === state.clock.day ? state.workshop.made.n : 0;
  return Math.max(0, craftLimit(state) - made);
}

/**
 * Whether anything at all can be made right now: true, or the `why` code
 * craft() would refuse every recipe with: "not-now" (the bees are out),
 * "workshop-closed" (no wax has ever been made) or "no-crafts-left".
 * @returns {true | string}
 */
export function canCraftNow(/** @type {State} */ state) {
  if (state.clock.phase === "day") return "not-now";
  if (!workshopOpen(state)) return "workshop-closed";
  if (craftsLeft(state) < 1) return "no-crafts-left";
  return true;
}

/** The wax a recipe needs from this keeper. */
export function waxFor(/** @type {State} */ state, /** @type {Recipe} */ recipe) {
  if (recipe.wax <= 0) return 0;
  return Math.max(1, recipe.wax + (talentOf(state).wax ?? 0));
}

/** Goods of a family that are in stock, cheapest first. */
function goodsOf(/** @type {State} */ state, /** @type {string} */ family) {
  return GOOD_IDS.filter(
    (id) => GOODS[id].family === family && (state.stock.goods[id] ?? 0) > 0,
  ).sort((a, b) => GOODS[a].price - GOODS[b].price);
}

/** Honeys in stock that a recipe may use, as product ids, cheapest first. */
function honeysFor(/** @type {State} */ state, /** @type {"any" | "pure"} */ need) {
  const out = [];
  for (const key of Object.keys(state.stock.honey)) {
    if (!(state.stock.honey[key] > 0)) continue;
    const info = productInfo(`honey:${key}`);
    if (!info || (need === "pure" && !info.pure)) continue;
    out.push({
      product: info.id,
      worth: info.price * (info.stars ? STARS[info.stars - 1].mult : 1),
    });
  }
  return out
    .sort((a, b) => a.worth - b.worth || (a.product < b.product ? -1 : 1))
    .map((x) => x.product);
}

/**
 * Every recipe the keeper knows, with what it needs, what there is to choose
 * from, and whether it can be made right now:
 * { recipe, name, makes, wax, options: { bunch, honey, candle, soap }, missing, canMake }.
 * `missing` lists `why` codes ("no-wax", "no-bunch", "no-honey", "no-candle",
 * "no-soap", and what canCraftNow() says: "not-now", "workshop-closed",
 * "no-crafts-left").
 */
export function recipesNow(/** @type {State} */ state) {
  const out = [];
  const now = canCraftNow(state);
  for (const id of RECIPE_IDS) {
    if (!state.progress.unlocked.recipes.includes(id)) continue;
    const r = RECIPES[id];
    const wax = waxFor(state, r);
    /** @type {Record<string, string[]>} */
    const options = {};
    const missing = [];
    if (now !== true) missing.push(now);
    if (state.stock.wax < wax) missing.push("no-wax");
    if (r.bunch) {
      options.bunch = r.bunch.filter((f) => (state.stock.bunches[f] ?? 0) > 0);
      if (!options.bunch.length) missing.push("no-bunch");
    }
    if (r.honey) {
      options.honey = honeysFor(state, r.honey);
      if (!options.honey.length) missing.push("no-honey");
    }
    if (r.candle) {
      options.candle = goodsOf(state, "candle");
      if (!options.candle.length) missing.push("no-candle");
    }
    if (r.soap) {
      options.soap = goodsOf(state, "soap");
      if (!options.soap.length) missing.push("no-soap");
    }
    const makes = r.makes === "soap-*" ? (r.bunch ?? []).map((f) => `soap-${f}`) : [r.makes];
    out.push({ recipe: id, name: r.name, makes, wax, options, missing, canMake: !missing.length });
  }
  return out;
}

/**
 * craft { recipe, bunch?, honey?, candle?, soap? }: make one thing. The
 * optional fields choose what goes in (a bunch's flower, a honey product id,
 * a candle's or soap's good id); left out, the cheapest that will do is used.
 */
export function craft(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase === "day") return "not-now";
  if (!workshopOpen(s)) return "workshop-closed";
  if (typeof a.recipe !== "string" || !Object.hasOwn(RECIPES, a.recipe)) return "no-recipe";
  if (!s.progress.unlocked.recipes.includes(a.recipe)) return "recipe-locked";
  if (craftsLeft(s) < 1) return "no-crafts-left";
  const r = RECIPES[a.recipe];
  const wax = waxFor(s, r);
  if (s.stock.wax < wax) return "no-wax";
  /** @type {{ wax: number, bunch?: string, honey?: string, candle?: string, soap?: string }} */
  const used = { wax };

  if (r.bunch) {
    const bunch = a.bunch ?? r.bunch.find((f) => (s.stock.bunches[f] ?? 0) > 0);
    if (!r.bunch.includes(bunch) || !((s.stock.bunches[bunch] ?? 0) > 0)) return "no-bunch";
    used.bunch = bunch;
  }
  if (r.honey) {
    const honey = a.honey ?? honeysFor(s, r.honey)[0];
    const info = productInfo(honey);
    if (
      !info ||
      info.kind !== "honey" ||
      (r.honey === "pure" && !info.pure) ||
      stockOf(s, info) < 1
    )
      return "no-honey";
    used.honey = info.id;
  }
  for (const part of /** @type {const} */ (["candle", "soap"])) {
    if (!r[part]) continue;
    const id = a[part] ?? goodsOf(s, part)[0];
    if (
      typeof id !== "string" ||
      !Object.hasOwn(GOODS, id) ||
      GOODS[id].family !== part ||
      !((s.stock.goods[id] ?? 0) > 0)
    )
      return `no-${part}`;
    used[part] = id;
  }

  s.stock.wax -= wax;
  if (used.bunch) drop(s.stock.bunches, used.bunch);
  if (used.honey) drop(s.stock.honey, used.honey.slice("honey:".length));
  if (used.candle) drop(s.stock.goods, used.candle);
  if (used.soap) drop(s.stock.goods, used.soap);

  const made = r.makes === "soap-*" ? `soap-${used.bunch}` : r.makes;
  const isGood = Object.hasOwn(GOODS, made);
  if (isGood) bump(s.stock.goods, made);
  else s.stock.remedy += 1;
  s.workshop.made = {
    day: s.clock.day,
    n: (s.workshop.made.day === s.clock.day ? s.workshop.made.n : 0) + 1,
  };
  events.push({
    type: "crafted",
    recipe: r.id,
    made,
    product: isGood ? `good:${made}` : null,
    family: isGood ? GOODS[made].family : null,
    used,
    left: craftsLeft(s),
  });
}
