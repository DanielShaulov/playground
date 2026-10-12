// Balance-sim bots: three ways of playing The Brine Nook, each a function
// (state) => action that only reads the state through the core's helpers and
// only changes it through step(). See run.mjs for how they are scored.
//
// - careful: plans like a player who reads the board. It keeps portions of
//   jars that will fit (hold), starts new jars for orders in the morning when
//   none will (startForOrder), takes bulk orders, pre-orders walk-ins it can
//   cover, discovers recipes at the bench, shops the market and buys upgrades.
// - careless: fills the shelf and sells whatever matches the recipe asked for,
//   whatever its flavour. Never plans, pre-orders, shops or upgrades.
// - idle: opens the shop and ignores everyone.
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";

/** Steps per bot tick while nobody is at the counter: 6 × 1/120 h = 3 in-game minutes. */
export const BOT_TICK = 6;

/** Coins the careful bot keeps back in the evening so the morning can still start jars. */
const RESERVE = 60;
/** Upgrades the careful bot buys, most wanted first; one cellar crock, for the goal ladder. */
const UPGRADE_ORDER = ["shelf", "bigjars", "cool"];
/** Pantry the careful bot keeps of each add-in its recipes need. */
const STOCK_TO = 3;
/** Timing add-ins the planner may try on a new jar for an order. */
const TIMING = ["salt", "chili", "honey", "oak", "whey"];

const hoursOf = (day, hour) => day * 24 + hour;
const now = (s) => hoursOf(s.clock.day, s.clock.hour);
const mid = (o) => (o.lo + o.hi) / 2;
const live = (j) => j && !C.isOver(j);

/** Where a jar on the shelf will sit when `order` comes for it. */
function flavourAt(s, jar, order) {
  const wait = Math.max(0, hoursOf(order.due, order.arriveAt) - now(s));
  return C.forecast(jar.recipe, jar.age + wait, jar.adds ?? [], jar.pace ?? 1);
}

const fitsAt = (f, o) => f < 1 && f >= o.lo && f <= o.hi;

/** Portions (or, for bulk, whole jars) an order still needs set aside. */
function stillNeeds(s, order) {
  const held = s.shelf.slots.filter((j) => j && order.jars?.includes(j.id) && !C.isOver(j));
  if (order.kind === "bulk") return (order.qty ?? 1) - (order.got ?? 0) - held.length;
  return held.length ? 0 : 1;
}

/** First kept jar of `order` that won't suit it by pickup, as a slot, or -1. */
function badHold(s, order) {
  return s.shelf.slots.findIndex(
    (j) => j && order.jars?.includes(j.id) && !fitsAt(flavourAt(s, j, order), order),
  );
}

/** The free shelf jar that fits `order` best at pickup, as a slot, or -1. */
function jarFor(s, order) {
  let best = -1,
    bestD = Infinity;
  s.shelf.slots.forEach((j, i) => {
    if (!live(j) || j.recipe !== order.recipe || order.jars?.includes(j.id)) return;
    const need = order.kind === "bulk" ? j.servings : 1;
    if (C.freePortions(s, j) < need) return;
    if (order.kind === "bulk" && j.servings < j.size) return;
    const f = flavourAt(s, j, order);
    if (!fitsAt(f, order)) return;
    const d = Math.abs(f - mid(order));
    if (d < bestD) ((best = i), (bestD = d));
  });
  return best;
}

/** Add-in sets worth trying on a new jar: none, then each timing add-in in the pantry. */
function addSets(s) {
  return [[], ...TIMING.filter((a) => (s.pantry.stock[a] ?? 0) > 0).map((a) => [a])];
}

/**
 * A new jar that would fit `order` if started now: { slot, adds }, or null.
 * Tries every empty spot (crocks change the pace) with each add-in set and
 * keeps the plan that lands nearest the middle of the window.
 */
function newJarFor(s, order) {
  const r = RECIPES[order.recipe];
  if (r.base && !s.bench.known.includes(order.recipe)) return null;
  if (!C.menu(s).includes(order.recipe)) return null;
  if (s.shop.coins < r.cost) return null;
  let best = null,
    bestD = Infinity;
  s.shelf.slots.forEach((j, slot) => {
    if (j) return;
    for (const adds of addSets(s)) {
      const p = C.planFor(s, order, adds, slot);
      if (!p?.fits) continue;
      if (p.adds.some((a) => (s.pantry.stock[a] ?? 0) < 1)) continue;
      const d = Math.abs(p.f - mid(order));
      if (d < bestD) ((best = { slot, adds }), (bestD = d));
    }
  });
  return best;
}

/**
 * The next planning move for the open orders, soonest due first: let go of a
 * kept jar that won't suit, keep a portion of a jar that will, or start a jar.
 */
function planOrders(s) {
  const orders = [...s.orders.list].sort((a, b) => a.due - b.due || a.arriveAt - b.arriveAt);
  for (const o of orders) {
    if (o.arrived) continue;
    const bad = badHold(s, o);
    if (bad >= 0) return { type: "release", slot: bad, orderId: o.id };
    if (stillNeeds(s, o) <= 0) continue;
    const slot = jarFor(s, o);
    if (slot >= 0) return { type: "hold", orderId: o.id, slot };
    const plan = newJarFor(s, o);
    if (plan) return { type: "startForOrder", orderId: o.id, slot: plan.slot, adds: plan.adds };
  }
  return null;
}

/** Could a bulk offer be covered by jars on the shelf plus jars started now? */
function canCover(s, offer) {
  let have = 0;
  const free = s.shelf.slots.filter((j) => !j).length;
  for (const j of s.shelf.slots) {
    if (!live(j) || j.recipe !== offer.recipe || C.holdsOn(s, j).length) continue;
    if (fitsAt(flavourAt(s, j, offer), offer)) have++;
  }
  const plan = C.planFor(s, offer, [], s.shelf.slots.indexOf(null));
  const fresh = plan?.fits
    ? Math.min(free, Math.floor(s.shop.coins / RECIPES[offer.recipe].cost))
    : 0;
  return have + fresh >= (offer.qty ?? 1);
}

/** The jar that pays most for the customer at the counter, with its verdict, or null. */
function bestServe(s, c) {
  let best = null;
  s.shelf.slots.forEach((j, slot) => {
    if (!live(j) || j.recipe !== c.recipe) return;
    const need = c.kind === "bulk" ? j.servings : 1;
    if (C.freePortions(s, j, c.orderId) < need) return;
    const v = C.judge(c, C.flavour(j));
    // An order's own customer is served from what was kept for them first.
    const mine = c.orderId && C.holdsOn(s, j).some((h) => h.order.id === c.orderId);
    const score = v.pay + (mine ? 1000 : 0);
    if (!best || score > best.score) best = { slot, v, score };
  });
  return best;
}

/** How much the careful bot wants a recipe on the shelf now. */
function want(s, id, onShelf) {
  return RECIPES[id].price / (1 + onShelf[id] * 1.5);
}

/** Morning restock: fill empty spots (but one, kept for pre-orders) with the most wanted recipe. */
function restock(s) {
  const empty = s.shelf.slots.map((j, i) => (j ? -1 : i)).filter((i) => i >= 0);
  if (empty.length <= 1) return null;
  const onShelf = {};
  for (const id of C.menu(s)) onShelf[id] = 0;
  for (const j of s.shelf.slots) if (live(j) && j.recipe in onShelf) onShelf[j.recipe]++;
  const options = C.menu(s)
    .filter((id) => s.shop.coins >= RECIPES[id].cost)
    .filter((id) => (RECIPES[id].needs ?? []).every((a) => (s.pantry.stock[a] ?? 0) > 0))
    .sort((a, b) => want(s, b, onShelf) - want(s, a, onShelf));
  if (!options.length) return null;
  return { type: "brew", slot: empty[0], recipe: options[0] };
}

/** Evening shopping: add-ins for every discovered or hinted recipe, and the planner's salt and chili. */
function shop(s) {
  const wanted = new Set(["salt", "chili"]);
  for (const id of [...s.bench.known, ...s.bench.hints].filter((id) => C.unlocked(s, id)))
    for (const a of RECIPES[id].needs ?? []) wanted.add(a);
  for (const item of C.marketToday(s)) {
    if (!wanted.has(item.ingredient)) continue;
    if (item.have >= STOCK_TO || item.left < 1 || item.room < 1) continue;
    if (s.shop.coins - item.price < RESERVE) continue;
    return { type: "buy", ingredient: item.ingredient };
  }
  return null;
}

/** Evening: try a hinted recipe at the bench as soon as the pantry has what it needs. */
function tryHinted(s) {
  for (const id of s.bench.hints) {
    const r = RECIPES[id];
    if (C.unlocked(s, id) && r.needs.every((a) => (s.pantry.stock[a] ?? 0) > 0))
      return { type: "experiment", recipe: r.base, adds: [...r.needs] };
  }
  return null;
}

/** Evening: the next upgrade in UPGRADE_ORDER that is unlocked and leaves the reserve. */
function upgradeNext(s) {
  const offers = C.upgradeOffers(s);
  for (const id of UPGRADE_ORDER) {
    const o = offers.find((x) => x.id === id);
    if (!o?.next || o.locked) continue;
    if (o.kind === "crock" && o.level > 0) continue;
    if (s.shop.coins - o.next.cost < RESERVE) continue;
    if (o.kind === "crock") return { type: "upgrade", id, slot: 0 };
    return { type: "upgrade", id };
  }
  return null;
}

/** Tip out the first popped jar nobody is waiting on, or null. */
function tipPopped(s) {
  const i = s.shelf.slots.findIndex((j) => j && C.isOver(j));
  return i >= 0 ? { type: "tipOut", slot: i } : null;
}

export const BOTS = {
  careful(s) {
    if (C.goalNow(s).ready) return { type: "claimGoal" };
    const phase = s.clock.phase;
    if (phase === "evening") return upgradeNext(s) ?? shop(s) ?? tryHinted(s) ?? { type: "sleep" };
    if (phase === "morning") {
      const offer = s.orders.offers[0];
      if (offer)
        return canCover(s, offer)
          ? { type: "acceptOrder", orderId: offer.id }
          : { type: "declineOrder", orderId: offer.id };
      return tipPopped(s) ?? planOrders(s) ?? restock(s) ?? { type: "open" };
    }
    // Open: pre-orders taken at the counter get their jar at once.
    const plan = tipPopped(s) ?? planOrders(s);
    if (plan) return plan;
    const c = s.customers.queue[0];
    if (!c) return { type: "tick", n: BOT_TICK };
    if (c.offMenu && !C.menu(s).includes(c.recipe)) return { type: "sendAway" };
    const best = bestServe(s, c);
    if (best && (c.orderId || best.v.rep >= 0)) return { type: "serve", slot: best.slot };
    if (!c.orderId) {
      const order = { recipe: c.recipe, lo: c.lo, hi: c.hi, ...C.dueFor(s, c) };
      if (newJarFor(s, order)) return { type: "preorder" };
    }
    return { type: "sendAway" };
  },

  careless(s) {
    if (C.goalNow(s).ready) return { type: "claimGoal" };
    if (s.clock.phase === "evening") return { type: "sleep" };
    if (s.clock.phase === "morning") {
      const pop = tipPopped(s);
      if (pop) return pop;
      const recipes = C.menu(s).filter((id) => !RECIPES[id].base);
      for (let i = 0; i < s.shelf.slots.length; i++) {
        const recipe = recipes[(i + s.clock.day) % recipes.length];
        if (!s.shelf.slots[i] && s.shop.coins >= RECIPES[recipe].cost)
          return { type: "brew", slot: i, recipe };
      }
      return { type: "open" };
    }
    const c = s.customers.queue[0];
    if (!c) return { type: "tick", n: BOT_TICK };
    const i = s.shelf.slots.findIndex(
      (j) =>
        live(j) &&
        j.recipe === c.recipe &&
        C.freePortions(s, j, c.orderId) >= (c.kind === "bulk" ? j.servings : 1),
    );
    return i >= 0 ? { type: "serve", slot: i } : { type: "sendAway" };
  },

  idle(s) {
    if (s.clock.phase === "morning") return { type: "open" };
    if (s.clock.phase === "evening") return { type: "sleep" };
    return { type: "tick", n: BOT_TICK };
  },
};
