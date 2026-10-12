// @ts-check
/**
 * The market: where the pantry is restocked. Each morning (and on day 1) the
 * market sets out today's stalls (state.market.items: ingredient →
 * { price, left }), and in the evening `buy` takes from them at today's price.
 *
 * Stalls are rolled from the "market" random stream, ingredient by ingredient
 * in content order, so nothing else's draws move. Staples are out every day;
 * the rest only on some days (content/market.js), except that day 1 has
 * every stall but the rare ones. Each ingredient's price
 * multiplier (state.market.drift) takes a small random step every morning,
 * whether its stall is out or not, and stays within a band around its cost.
 *
 * state.market.day is the day the stalls were set out; on any other day
 * nothing is on sale (an old save sees the market from its next morning).
 */

import { INGREDIENTS, INGREDIENT_IDS, MAX_STOCK } from "../content/ingredients.js";
import { STALLS, PRICE_BAND, PRICE_STEP } from "../content/market.js";
import { between, random } from "./rng.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").MarketItem} MarketItem */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Today's price for an ingredient at a drift multiplier: whole coins, at least 1. */
export const priceAt = (/** @type {string} */ id, /** @type {number} */ drift) =>
  Math.max(1, Math.round(INGREDIENTS[id].cost * drift));

/**
 * Set out today's stalls. Called by newGame (day 1) and every morning.
 * Pushes `rareAtMarket` when a rare ingredient is out.
 */
export function openMarket(/** @type {State} */ s, events = []) {
  /** @type {State["market"]["items"]} */
  const items = {};
  const rare = [];
  for (const id of INGREDIENT_IDS) {
    const g = INGREDIENTS[id];
    const drift = clamp(
      (s.market.drift[id] ?? 1) + between(s, "market", -PRICE_STEP, PRICE_STEP),
      1 - PRICE_BAND,
      1 + PRICE_BAND,
    );
    s.market.drift[id] = Math.round(drift * 1000) / 1000;
    const stall = STALLS[g.stall];
    // Day 1 shows everything but the rare stalls, so a new shop sees what the market can have.
    const firstDay = s.clock.day === 1 && g.stall !== "rare";
    if (stall.chance < 1 && random(s, "market") >= stall.chance && !firstDay) continue;
    const [lo, hi] = stall.stock;
    const left = lo + Math.floor(random(s, "market") * (hi - lo + 1));
    items[id] = { price: priceAt(id, s.market.drift[id]), left };
    if (g.stall === "rare") rare.push(id);
  }
  s.market.day = s.clock.day;
  s.market.items = items;
  if (rare.length) events.push({ type: "rareAtMarket", ingredients: rare });
}

/**
 * What the market has today, in ingredient order: price, how many are left,
 * how many the pantry has and how many more it can take. Empty when the
 * stalls aren't out today.
 * @returns {MarketItem[]}
 */
export function marketToday(/** @type {State} */ s) {
  if (s.market.day !== s.clock.day) return [];
  return INGREDIENT_IDS.filter((id) => Object.hasOwn(s.market.items, id)).map((id) => {
    const { price, left } = s.market.items[id];
    const have = s.pantry.stock[id] ?? 0;
    return { ingredient: id, price, left, have, room: Math.max(0, MAX_STOCK - have) };
  });
}

/** { type: "buy", ingredient, n? } — buy n (default 1) of an ingredient at the market in the evening. */
export function buy(/** @type {State} */ s, { ingredient, n = 1 }, events) {
  if (typeof ingredient !== "string" || !Object.hasOwn(INGREDIENTS, ingredient))
    return "no such ingredient";
  if (!Number.isInteger(n) || n < 1) return "bad amount";
  if (s.clock.phase !== "evening") return "market opens in the evening";
  const item = s.market.day === s.clock.day ? s.market.items[ingredient] : undefined;
  if (!item) return "not at the market today";
  if (item.left < n) return "sold out";
  const have = s.pantry.stock[ingredient] ?? 0;
  if (have + n > MAX_STOCK) return "pantry is full";
  const cost = item.price * n;
  if (s.shop.coins < cost) return "not enough coins";
  s.shop.coins -= cost;
  item.left -= n;
  s.pantry.stock[ingredient] = have + n;
  events.push({ type: "bought", ingredient, n, cost });
}
