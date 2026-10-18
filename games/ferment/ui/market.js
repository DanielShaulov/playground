// @ts-check
/**
 * The market stall, one corner of the evening (ui/evening.js). Every
 * ingredient has a crate: what's in it today (one pip per unit left), today's
 * price on a tag with an arrow when it is off its usual price, and how many
 * the pantry holds. An ingredient that isn't out today shows an empty crate;
 * a rare one that is out gets a gold crate and a ribbon.
 *
 * Buttons carry data-act="mk-buy" data-ingredient; marketAct() dispatches `buy`.
 */

import { INGREDIENTS, INGREDIENT_IDS, MAX_STOCK } from "../content/ingredients.js";
import { ingredientSvg } from "./art/ingredients.js";
import { marketToday } from "../core/index.js";

/** True for an ingredient the market only has now and then (its `stall`, content/ingredients.js). */
const isRare = (id) => /** @type {{ stall?: string }} */ (INGREDIENTS[id]).stall === "rare";

/** Ingredients out today that the market only has now and then. */
export const rareToday = (s) =>
  marketToday(s)
    .filter((m) => isRare(m.ingredient))
    .map((m) => m.ingredient);

const TAG_ICON = { slower: "⏪", faster: "⏩", sweet: "✨", funk: "✨" };

export function marketHtml(s) {
  const today = marketToday(s);
  const crates = INGREDIENT_IDS.map((id) => {
    const g = INGREDIENTS[id];
    const m = today.find((x) => x.ingredient === id);
    const have = s.pantry.stock[id] ?? 0;
    const rare = isRare(id);
    const pantry = `<span class="have${have >= MAX_STOCK ? " full" : ""}">${have} in pantry</span>`;
    const head = `<span class="ico">${ingredientSvg(id)}</span><b class="nm">${g.name}</b><span class="tag t-${g.tag}">${TAG_ICON[g.tag] ?? ""} ${g.tag}</span>`;
    if (!m)
      return `<div class="crate none" data-ingredient="${id}">${head}<div class="empty">Not out today</div>${pantry}</div>`;
    const diff = m.price - g.cost;
    const price = `<span class="price${diff < 0 ? " low" : diff > 0 ? " high" : ""}">🪙 ${m.price}${
      diff ? `<small>${diff < 0 ? "▼" : "▲"} usually ${g.cost}</small>` : ""
    }</span>`;
    const pips = `<span class="pips" aria-label="${m.left} left">${"<i></i>".repeat(m.left)}</span>`;
    const why =
      m.left < 1
        ? "Sold out"
        : m.room < 1
          ? "Pantry full"
          : s.shop.coins < m.price
            ? "Short of coins"
            : "";
    const buy = `<button class="buy" data-act="mk-buy" data-ingredient="${id}" ${why ? "disabled" : ""}>${why || "Buy one"}</button>`;
    return `<div class="crate${rare ? " rare" : ""}" data-ingredient="${id}">${rare ? `<span class="ribbon">✨ Rare today</span>` : ""}${head}${price}${pips}${pantry}${buy}</div>`;
  }).join("");
  return `<div class="awning"></div>
    <p class="lead">${today.length ? "Fresh from the stalls tonight. Prices change by the day." : "The stalls are packed away."}</p>
    <div class="crates">${crates}</div>`;
}

/**
 * Handle a market button. Returns false for anything that isn't the market's.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {(action: any) => any[]} dispatch
 * @param {(text: string) => void} toast
 */
export function marketAct(act, t, dispatch, toast) {
  if (act !== "mk-buy") return false;
  const id = /** @type {string} */ (t.dataset.ingredient);
  const events = dispatch({ type: "buy", ingredient: id });
  const no = events.find((e) => e.type === "rejected");
  if (no) toast(no.why[0].toUpperCase() + no.why.slice(1));
  return true;
}
