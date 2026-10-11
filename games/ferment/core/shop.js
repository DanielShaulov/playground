// @ts-check
/**
 * The shop's money and reputation, and the shelf actions: brew, tip out, serve.
 * Action handlers take (state, action, events), mutate the state copy that
 * step() made, and return a reason string to reject the action.
 */

import { RECIPES } from "../content/recipes.js";
import { REP_MAX, SLOTS } from "../content/tuning.js";
import { clamp } from "./util.js";
import { flavour, isOver, makeJar } from "./jars.js";
import { judge } from "./customers.js";
import { checkMix, useMix } from "./bench.js";
import { deliver, settle, freePortions } from "./orders.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Today} Today */

export function addRep(/** @type {State} */ s, /** @type {number} */ d) {
  s.shop.rep = clamp(s.shop.rep + d, 0, REP_MAX);
}

/** @returns {Today} */
export function freshToday(/** @type {number} */ rep) {
  return { served: 0, earned: 0, tips: 0, repStart: rep, missed: 0, preorders: 0, left: 0 };
}

const badSlot = (slot) => !Number.isInteger(slot) || slot < 0 || slot >= SLOTS;

/**
 * { type: "brew", slot, recipe, adds? } — start a jar in an empty slot, with
 * optional add-ins from the pantry. A mix can make a discovered recipe (see
 * bench.js); a discovered recipe can be brewed by name once it is known.
 */
export function brew(s, { slot, recipe, adds }, events) {
  if (typeof recipe !== "string" || !Object.hasOwn(RECIPES, recipe)) return "no such recipe";
  const r = RECIPES[recipe];
  if (badSlot(slot)) return "no such slot";
  if (s.clock.phase === "evening") return "shop is closed";
  if (s.shelf.slots[slot]) return "slot is full";
  if (s.shop.coins < r.cost) return "not enough coins";
  const mix = checkMix(s, recipe, adds);
  if (typeof mix === "string") return mix;
  s.shop.coins -= r.cost;
  useMix(s, mix, events);
  const jar = makeJar(s, mix.recipe, 0, mix.adds);
  s.shelf.slots[slot] = jar;
  events.push({ type: "brewed", slot, jar });
}

/** { type: "tipOut", slot } — throw a jar away. */
export function tipOut(s, { slot }, events) {
  if (badSlot(slot) || !s.shelf.slots[slot]) return "empty slot";
  const jar = s.shelf.slots[slot];
  s.shelf.slots[slot] = null;
  events.push({ type: "tippedOut", slot, jar });
}

/** { type: "serve", slot } — sell a serving from `slot` to whoever is at the counter. */
export function serve(s, { slot }, events) {
  const c = s.customers.queue[0];
  const jar = badSlot(slot) ? null : s.shelf.slots[slot];
  if (!c) return "nobody at the counter";
  if (!jar) return "empty slot";
  if (jar.recipe !== c.recipe) return "wrong recipe";
  if (isOver(jar)) return "jar has gone over";
  if (freePortions(s, jar, c.orderId) < (c.kind === "bulk" ? jar.servings : 1))
    return "set aside for someone else";
  const f = flavour(jar);
  const verdict = judge(c, f);
  if (c.kind === "bulk") {
    deliver(s, slot, c, verdict, events);
    return;
  }
  s.shop.coins += verdict.pay;
  addRep(s, verdict.rep);
  s.shop.today.served++;
  s.shop.today.earned += verdict.pay;
  s.shop.today.tips += verdict.tip;
  if (--jar.servings <= 0) s.shelf.slots[slot] = null;
  s.customers.queue.shift();
  events.push({ type: "served", slot, customer: c, f, ...verdict });
  const order = c.orderId ? s.orders.list.find((o) => o.id === c.orderId) : null;
  if (order) settle(s, order, verdict.mood, events);
}
