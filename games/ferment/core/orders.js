// @ts-check
/**
 * Orders: everyone who will come to the counter on a known day.
 *
 * - preorder: a customer whose jar isn't ready books a later day. They come
 *   back on the due day at an hour chosen so that a jar started right now
 *   sits in the middle of their window.
 * - standing: a regular's next visit (content/regulars.js).
 * - bulk: a business offers an order for several whole jars; it sits in
 *   state.orders.offers until accepted or the shop closes.
 *
 * Missing an order costs reputation. planFor() says where a jar started now
 * would be when the order is collected, which is what morning planning shows.
 */

import { RECIPES } from "../content/recipes.js";
import { PATIENCE, PREORDER_PATIENCE } from "../content/tuning.js";
import { clamp, nextId } from "./util.js";
import { addRep, brew } from "./shop.js";
import { resolveMix } from "./bench.js";
import { ageAt, forecast } from "./jars.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Order} Order */
/** @typedef {import("./types.js").Plan} Plan */
/** @typedef {import("./types.js").DayHour} DayHour */

/** The day and hour a pre-order for `c` would come back. Fair by construction. */
export function dueFor(
  /** @type {State} */ s,
  /** @type {{recipe: string, lo: number, hi: number}} */ c,
) {
  const need = ((c.lo + c.hi) / 2) * RECIPES[c.recipe].hours;
  const k = Math.max(1, Math.round((need + s.clock.hour - 3) / 24));
  return { due: s.clock.day + k, arriveAt: clamp(need - 24 * k + s.clock.hour, 0.5, 9) };
}

/** { type: "preorder" } — the customer at the counter books a later day. */
export function preorder(s, _action, events) {
  const c = s.customers.queue[0];
  if (!c) return "nobody at the counter";
  if (c.orderId) return "already a pre-order";
  /** @type {Order} */
  const order = {
    id: nextId(s),
    kind: "preorder",
    name: c.name,
    look: c.look,
    recipe: c.recipe,
    lo: c.lo,
    hi: c.hi,
    ...dueFor(s, c),
    arrived: false,
  };
  s.orders.list.push(order);
  s.shop.today.preorders++;
  s.customers.queue.shift();
  events.push({ type: "preordered", order, customer: c });
}

/** Tick part: pre-order customers come back on their due day, straight to the front. */
export function orderArrivals(/** @type {State} */ s, events) {
  const queue = s.customers.queue;
  for (const o of s.orders.list) {
    if (o.due === s.clock.day && !o.arrived && s.clock.hour >= o.arriveAt) {
      o.arrived = true;
      const c = { ...o, id: nextId(s), orderId: o.id, patience: PATIENCE * PREORDER_PATIENCE };
      queue.splice(queue.length ? 1 : 0, 0, c);
      events.push({ type: "arrived", customer: c });
    }
  }
}

/** At closing: anyone whose pre-order was due today and never made it to the counter. */
export function missOverdue(/** @type {State} */ s) {
  for (const o of s.orders.list.filter((o) => o.due <= s.clock.day)) {
    s.orders.list = s.orders.list.filter((x) => x !== o);
    s.shop.today.missed++;
    addRep(s, -2);
  }
}

/** Hours since the start of day 0 (hour counts from opening). */
const timeOf = (/** @type {number} */ day, /** @type {number} */ hour) => day * 24 + hour;
/** @returns {DayHour} */
const dayHourOf = (/** @type {number} */ t) => {
  const day = Math.floor(t / 24);
  return { day, hour: t - day * 24 };
};

/**
 * Where a jar for `order`, started right now with `adds`, will be when the
 * order is collected. `adds` work as they do for brew: the order's recipe
 * plus them must still make that recipe (`right`), and a discovered recipe
 * brings what it needs. Null when the recipe or the add-ins are not valid.
 * @returns {Plan | null}
 */
export function planFor(
  /** @type {State} */ s,
  /** @type {{ recipe: string, lo: number, hi: number, due: number, arriveAt: number }} */ order,
  /** @type {unknown} */ adds = [],
) {
  const mix = resolveMix(order?.recipe, adds ?? []);
  if (!mix) return null;
  const now = timeOf(s.clock.day, s.clock.hour);
  const age = Math.max(0, timeOf(order.due, order.arriveAt) - now);
  const f = Math.min(1, forecast(mix.recipe, age, mix.adds));
  const right = mix.recipe === order.recipe;
  const enter = ageAt(mix.recipe, mix.adds, order.lo);
  const exit = ageAt(mix.recipe, mix.adds, order.hi);
  return {
    recipe: mix.recipe,
    adds: mix.adds,
    right,
    f,
    fits: right && f < 1 && f >= order.lo && f <= order.hi,
    lands: dayHourOf(now + enter),
    leaves: dayHourOf(now + exit),
    late: age - (enter + exit) / 2,
  };
}

/** Find an order by id in a list. */
const findIn = (/** @type {Order[]} */ list, /** @type {unknown} */ id) =>
  list.find((o) => o.id === id);

/**
 * { type: "startForOrder", orderId, slot, adds? } — start a jar for a taken
 * order: brew its recipe in `slot` with `adds` (which must still make that
 * recipe). An undiscovered recipe is brewed from its base, so getting the
 * add-ins right discovers it.
 */
export function startForOrder(s, { orderId, slot, adds }, events) {
  const order = findIn(s.orders.list, orderId);
  if (!order) return "no such order";
  const mix = resolveMix(order.recipe, adds ?? []);
  if (!mix) return "bad add-ins";
  if (mix.recipe !== order.recipe) return "mix makes something else";
  // Brewed from the base with everything it needs, so an undiscovered recipe works too.
  const why = brew(s, { slot, recipe: mix.base, adds: mix.adds }, events);
  if (why) return why;
  (order.jars ??= []).push(s.shelf.slots[slot].id);
  events.push({ type: "startedForOrder", order, slot });
}

/** { type: "acceptOrder", orderId } — take a bulk order on offer today. */
export function acceptOrder(s, { orderId }, events) {
  const order = findIn(s.orders.offers, orderId);
  if (!order) return "no such offer";
  if (s.clock.phase === "evening") return "shop is closed";
  s.orders.offers = s.orders.offers.filter((o) => o !== order);
  s.orders.list.push(order);
  events.push({ type: "accepted", order });
}

/** { type: "declineOrder", orderId } — turn down a bulk order on offer. No cost. */
export function declineOrder(s, { orderId }, events) {
  const order = findIn(s.orders.offers, orderId);
  if (!order) return "no such offer";
  s.orders.offers = s.orders.offers.filter((o) => o !== order);
  events.push({ type: "declined", order });
}
