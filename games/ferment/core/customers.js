// @ts-check
/**
 * Walk-in customers: who arrives, what they want, how they judge a jar, and
 * leaving (served elsewhere, sent away, impatient, or shop closed).
 * Randomness comes from the "customers" stream; whether a walk-in asks for
 * something off the menu comes from the "requests" stream, so that choice
 * never reshuffles who walks in.
 */

import { RECIPES, VARIANT_IDS } from "../content/recipes.js";
import { NAMES } from "../content/names.js";
import {
  DEMAND_SPREAD,
  MAX_QUEUE,
  OFF_MENU,
  OPEN_HOURS,
  PATIENCE,
  WINDOW,
} from "../content/tuning.js";
import { random, between, pick } from "./rng.js";
import { clamp, nextId } from "./util.js";
import { isOver } from "./jars.js";
import { addRep } from "./shop.js";
import { settle, dropIn } from "./orders.js";
import { menu, unlocked } from "./bench.js";

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

/**
 * Where walk-ins want `recipe` on the flavour strip: a bell curve with its
 * peak (`mean`) in the middle of the recipe's sweet spot and spread `sd`.
 * Most windows land in or near the sweet spot; a few land far off.
 */
export function demand(/** @type {string} */ recipe) {
  const [lo, hi] = RECIPES[recipe].sweet;
  return { mean: (lo + hi) / 2, sd: DEMAND_SPREAD };
}

/** How much walk-ins want `recipe` at flavour `f`, relative to the peak (1 at the mean). */
export function demandAt(/** @type {string} */ recipe, /** @type {number} */ f) {
  const { mean, sd } = demand(recipe);
  return Math.exp(-(((f - mean) / sd) ** 2) / 2);
}

/** Lowest and highest middle a walk-in's window can have. */
const MID_RANGE = [0.1, 0.9];

/** The middle of a walk-in's window: one draw from the recipe's demand curve (Box–Muller). */
function wantedMid(/** @type {State} */ s, /** @type {string} */ recipe) {
  const { mean, sd } = demand(recipe);
  const u = 1 - random(s, STREAM); // (0, 1], so the log is finite
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random(s, STREAM));
  return clamp(mean + sd * z, MID_RANGE[0], MID_RANGE[1]);
}

/**
 * Now and then a walk-in asks for a recipe that isn't on the menu yet, at the
 * middle of its sweet spot. Hearing about one puts a hint for it on the bench,
 * and the request stays on the board (state.orders.asked) until it is discovered.
 */
function askOffMenu(/** @type {State} */ s, /** @type {Customer} */ c, events) {
  if (random(s, "requests") >= OFF_MENU) return;
  const unknown = VARIANT_IDS.filter((id) => !s.bench.known.includes(id) && unlocked(s, id));
  if (!unknown.length) return;
  const recipe = pick(s, "requests", unknown);
  const [lo, hi] = RECIPES[recipe].sweet;
  const mid = (lo + hi) / 2;
  Object.assign(c, { recipe, lo: mid - WINDOW / 2, hi: mid + WINDOW / 2, offMenu: true });
  const asked = s.orders.asked.filter((a) => a.recipe !== recipe);
  asked.push({ recipe, name: c.name, look: c.look, day: s.clock.day });
  s.orders.asked = asked;
  if (s.bench.hints.includes(recipe)) return;
  s.bench.hints.push(recipe);
  events.push({ type: "hinted", recipe, customer: c });
}

/** @returns {Customer} */
function makeWalkIn(/** @type {State} */ s) {
  const live = s.shelf.slots.filter((j) => j && !isOver(j));
  // Sometimes ask for a recipe that is on the shelf; the window follows demand either way.
  const recipe =
    live.length && random(s, STREAM) < 0.3
      ? pick(s, STREAM, live).recipe
      : pick(s, STREAM, menu(s));
  const mid = wantedMid(s, recipe);
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

/**
 * Whoever is at the counter leaves. An order that leaves unserved is missed.
 * Someone who asked for a recipe not on the menu leaves without a grudge.
 */
export function leave(/** @type {State} */ s, events, /** @type {string} */ why) {
  const c = s.customers.queue.shift();
  const order = c.orderId ? s.orders.list.find((o) => o.id === c.orderId) : null;
  if (order) settle(s, order, null, events);
  else if (why !== "closed" && !c.offMenu) {
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
      const regular = dropIn(s);
      const c = regular ?? makeWalkIn(s);
      if (!regular) askOffMenu(s, c, events);
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
