// @ts-check
/**
 * The market: where the pantry is restocked. Each morning the market sets out
 * today's stalls (state.market.items: ingredient → { price, left }), and in
 * the evening `buy` takes from them at today's price.
 *
 * state.market.day is the day the stalls were set out; on any other day
 * nothing is on sale (an old save sees the market from its next morning).
 *
 * Interface stub: every ingredient is on sale at its listed cost, with a
 * pantry's worth of stock. The full rules roll stock and prices from the
 * "market" random stream.
 */

import { INGREDIENTS, INGREDIENT_IDS, MAX_STOCK } from "../content/ingredients.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").MarketItem} MarketItem */

/** Set out today's stalls. Called by newGame (day 1) and every morning. */
export function openMarket(/** @type {State} */ s) {
  s.market.day = s.clock.day;
  s.market.items = Object.fromEntries(
    INGREDIENT_IDS.map((id) => [id, { price: INGREDIENTS[id].cost, left: MAX_STOCK }]),
  );
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
