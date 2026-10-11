// @ts-check
/**
 * Pre-orders: a customer whose jar isn't ready can book a later day. They come
 * back on the due day at an hour chosen so that a jar started right now sits
 * in the middle of their window. Missing them costs reputation.
 */

import { RECIPES } from "../content/recipes.js";
import { PATIENCE, PREORDER_PATIENCE } from "../content/tuning.js";
import { clamp, nextId } from "./util.js";
import { addRep } from "./shop.js";

/** @typedef {import("./types.js").State} State */

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
  const order = {
    id: nextId(s),
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
