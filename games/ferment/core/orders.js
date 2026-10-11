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
import { REGULARS, REGULAR_IDS } from "../content/regulars.js";
import { BULK_MISS, PATIENCE, PREORDER_PATIENCE, WINDOW } from "../content/tuning.js";
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

/** Tick part: order customers come back on their due day, straight to the front. */
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

/**
 * An order is over: collected (`mood` is how the last jar went) or missed
 * (`mood` null). A regular's visit is counted and their next one booked.
 */
export function settle(
  /** @type {State} */ s,
  /** @type {Order} */ order,
  /** @type {string | null} */ mood,
  events,
) {
  s.orders.list = s.orders.list.filter((o) => o.id !== order.id);
  if (mood === null) {
    s.shop.today.missed++;
    addRep(s, order.kind === "bulk" ? -BULK_MISS : -2);
  }
  const met = order.regular ? s.regulars.met[order.regular] : null;
  if (!met) return;
  if (mood === null) met.missed++;
  else {
    met.visits++;
    if (mood === "delight") met.happy++;
  }
  const r = REGULARS[order.regular];
  if (r.kind === "standing") book(s, order.regular, order.due + r.every, events);
}

/** At closing: orders due today that never reached the counter; today's offers lapse. */
export function missOverdue(/** @type {State} */ s, events = []) {
  for (const o of s.orders.list.filter((o) => o.due <= s.clock.day)) settle(s, o, null, events);
  s.orders.offers = [];
}

/**
 * serve() for a bulk customer: they take the whole jar. They stay at the
 * counter (with fresh patience) until they have every jar they ordered.
 */
export function deliver(
  /** @type {State} */ s,
  /** @type {number} */ slot,
  /** @type {import("./types.js").Customer} */ c,
  /** @type {{ pay: number, tip: number, rep: number, mood: string, dist: number }} */ verdict,
  events,
) {
  const jar = s.shelf.slots[slot];
  const pay = verdict.pay * jar.servings;
  s.shelf.slots[slot] = null;
  s.shop.coins += pay;
  s.shop.today.served++;
  s.shop.today.earned += pay;
  s.shop.today.tips += verdict.tip * jar.servings;
  if (verdict.rep < 0) addRep(s, verdict.rep);
  const order = s.orders.list.find((o) => o.id === c.orderId);
  c.got = (c.got ?? 0) + 1;
  if (order) order.got = c.got;
  const done = c.got >= (c.qty ?? 1);
  events.push({ type: "delivered", slot, customer: c, jar, f: 0, ...verdict, pay, done });
  if (!done) {
    c.patience = PATIENCE * PREORDER_PATIENCE;
    return;
  }
  addRep(s, 2);
  s.customers.queue.shift();
  if (order) settle(s, order, verdict.mood, events);
}

/** A regular's order for `day`, built from their row in content/regulars.js. */
function orderFor(/** @type {State} */ s, /** @type {string} */ id, /** @type {number} */ day) {
  const r = REGULARS[id];
  /** @type {Order} */
  const order = {
    id: nextId(s),
    kind: r.kind,
    name: r.name,
    look: r.look,
    recipe: r.recipe,
    lo: clamp(r.spot - WINDOW / 2, 0, 1),
    hi: clamp(r.spot + WINDOW / 2, 0, 1),
    due: day,
    arriveAt: r.hour,
    arrived: false,
    regular: id,
  };
  if (r.kind === "bulk") Object.assign(order, { qty: r.qty, got: 0 });
  return order;
}

/** Put a standing regular's visit on `day` on the board. */
function book(/** @type {State} */ s, /** @type {string} */ id, /** @type {number} */ day, events) {
  const order = orderFor(s, id, day);
  s.orders.list.push(order);
  events.push({ type: "booked", order });
}

/** True once a regular's `joins` condition is met. */
const joinsNow = (/** @type {State} */ s, /** @type {import("./types.js").Regular} */ r) =>
  s.clock.day >= (r.joins.day ?? 1) && s.shop.rep >= (r.joins.rep ?? 0);

/**
 * Each new morning: regulars whose time has come start visiting (a standing
 * regular's first visit is booked for the next day), and bulk regulars whose
 * day it is offer an order, unless one of theirs is still open.
 */
export function newDay(/** @type {State} */ s, events) {
  const day = s.clock.day;
  for (const id of REGULAR_IDS) {
    const r = REGULARS[id];
    if (!s.regulars.met[id]) {
      if (!joinsNow(s, r)) continue;
      s.regulars.met[id] = { since: day, visits: 0, happy: 0, missed: 0 };
      events.push({ type: "regularJoined", regular: id });
      if (r.kind === "standing") book(s, id, day + 1, events);
    }
    if (r.kind !== "bulk") continue;
    if ((day - s.regulars.met[id].since) % r.every !== 0) continue;
    if (s.orders.list.some((o) => o.regular === id)) continue;
    const offer = orderFor(s, id, day + r.lead);
    s.orders.offers.push(offer);
    events.push({ type: "offered", order: offer });
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

/** The taken order a jar is set aside for, if any. */
export const heldFor = (/** @type {State} */ s, /** @type {number} */ jarId) =>
  s.orders.list.find((o) => o.jars?.includes(jarId));

/**
 * { type: "hold", orderId, slot } — set a jar already on the shelf aside for a
 * taken order. Only that order's customer can be served from it.
 */
export function hold(s, { orderId, slot }, events) {
  const order = findIn(s.orders.list, orderId);
  if (!order) return "no such order";
  const jar = Number.isInteger(slot) ? s.shelf.slots[slot] : null;
  if (!jar) return "empty slot";
  if (jar.recipe !== order.recipe) return "wrong recipe";
  if (heldFor(s, jar.id)) return "already set aside";
  (order.jars ??= []).push(jar.id);
  events.push({ type: "held", order, slot });
}

/** { type: "release", slot } — a set-aside jar goes back to everyone. */
export function release(s, { slot }, events) {
  const jar = Number.isInteger(slot) ? s.shelf.slots[slot] : null;
  const order = jar ? heldFor(s, jar.id) : null;
  if (!order) return "not set aside";
  order.jars = order.jars.filter((id) => id !== jar.id);
  events.push({ type: "released", order, slot });
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
