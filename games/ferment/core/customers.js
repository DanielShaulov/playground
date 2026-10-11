// @ts-check
/**
 * Walk-in customers: who arrives, what they want, how they judge a jar, and
 * leaving (served elsewhere, sent away, impatient, or shop closed).
 * All randomness comes from the "customers" stream.
 */

import { RECIPES, RECIPE_IDS } from "../content/recipes.js";
import { NAMES } from "../content/names.js";
import { MAX_QUEUE, OPEN_HOURS, PATIENCE, WINDOW } from "../content/tuning.js";
import { random, between, pick } from "./rng.js";
import { clamp, nextId } from "./util.js";
import { flavour, isOver } from "./jars.js";
import { addRep } from "./shop.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Customer} Customer */

const STREAM = "customers";

/** How a customer feels about a jar at flavour `f`, and what they pay. */
export function judge(
  /** @type {{recipe: string, lo: number, hi: number, orderId?: number}} */ cust,
  /** @type {number} */ f,
) {
  const price = RECIPES[cust.recipe].price;
  const dist = f < cust.lo ? cust.lo - f : f > cust.hi ? f - cust.hi : 0;
  const bonus = cust.orderId ? 1.25 : 1;
  if (dist === 0) {
    const mid = (cust.lo + cust.hi) / 2;
    const centrality = 1 - Math.abs(f - mid) / ((cust.hi - cust.lo) / 2);
    const tip = Math.round(price * 0.3 * centrality);
    return {
      dist,
      mood: "delight",
      pay: Math.round(price * bonus) + tip,
      tip,
      rep: cust.orderId ? 2 : 1,
    };
  }
  // Close misses are forgiven; a clearly wrong jar costs a little reputation.
  const pay = Math.round(price * Math.max(0.2, 1 - dist * 4));
  const ok = dist < 0.06;
  return { dist, mood: ok ? "ok" : "meh", pay, tip: 0, rep: ok ? 0 : -1 };
}

/** @returns {Customer} */
function makeWalkIn(/** @type {State} */ s) {
  const live = s.shelf.slots.filter((j) => j && !isOver(j));
  let recipe, mid;
  if (live.length && random(s, STREAM) < 0.3) {
    // Sometimes ask for something on the shelf, often a bit riper than it is now.
    const jar = pick(s, STREAM, live);
    recipe = jar.recipe;
    mid = clamp(flavour(jar) + between(s, STREAM, -0.05, 0.3), 0.1, 0.9);
  } else {
    recipe = pick(s, STREAM, RECIPE_IDS);
    mid = between(s, STREAM, 0.12, 0.9);
  }
  return {
    id: nextId(s),
    name: pick(s, STREAM, NAMES),
    look: Math.floor(random(s, STREAM) * 1000),
    recipe,
    lo: clamp(mid - WINDOW / 2, 0, 1),
    hi: clamp(mid + WINDOW / 2, 0, 1),
    patience: PATIENCE,
  };
}

/** Hours until the next walk-in; a better reputation brings people in faster. */
function arrivalGap(/** @type {State} */ s) {
  return between(s, STREAM, 0.8, 1.5) * (1.3 - s.shop.rep / 20);
}

/** The first walk-in of the day, set when the shop opens. */
export function firstArrival(/** @type {State} */ s) {
  return between(s, STREAM, 0.15, 0.5);
}

/** Whoever is at the counter leaves. A pre-order that leaves unserved is missed. */
export function leave(/** @type {State} */ s, events, /** @type {string} */ why) {
  const c = s.customers.queue.shift();
  if (c.orderId) {
    s.orders.list = s.orders.list.filter((o) => o.id !== c.orderId);
    s.shop.today.missed++;
    addRep(s, -2);
  } else if (why !== "closed") {
    addRep(s, -1);
  }
  if (why === "impatient") s.shop.today.left++;
  events.push({ type: "left", customer: c, why });
  return c;
}

/** Tick part: walk-ins arrive on schedule while there is room in the queue. */
export function walkIns(/** @type {State} */ s, events) {
  const cs = s.customers;
  while (s.clock.hour >= cs.nextArrival && cs.nextArrival < OPEN_HOURS - 0.5) {
    if (cs.queue.length < MAX_QUEUE) {
      const c = makeWalkIn(s);
      cs.queue.push(c);
      events.push({ type: "arrived", customer: c });
    }
    cs.nextArrival += arrivalGap(s);
  }
}

/** Tick part: the customer at the counter loses patience, and leaves at zero. */
export function wearPatience(/** @type {State} */ s, /** @type {number} */ hours, events) {
  const front = s.customers.queue[0];
  if (!front) return;
  front.patience -= hours;
  if (front.patience <= 0) leave(s, events, "impatient");
}

/** { type: "sendAway" } — turn away whoever is at the counter. */
export function sendAway(s, _action, events) {
  if (!s.customers.queue[0]) return "nobody at the counter";
  leave(s, events, "sent");
}
