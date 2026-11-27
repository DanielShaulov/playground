// @ts-check
/**
 * The market stall: products and prices, the evening's customers and what
 * they wish for, regulars and their hearts, the grocer, the Honey Show and
 * the Winter Fair.
 */

import {
  STARS,
  CUSTOMERS_BASE,
  CUSTOMERS_MAX,
  DELIGHTED_PAY,
  FINE_PAY,
  GROCER_PAY,
  WOBBLE,
  GLUT_STEP,
  GLUT_HEAL,
  GLUT_FLOOR,
  REGULAR_CHANCE,
  HEART_GIFTS,
  WISH_WEIGHTS,
  QTY_WEIGHTS,
  IN_STOCK_WEIGHT,
  SHOW_DOY,
  SHOW_ENTRIES,
  RIBBONS,
  FAIR_DOY,
  FAIR_CUSTOMERS,
  FAIR_PAY,
} from "../content/tuning.js";
import { HONEYS, HONEY_IDS, HONEY_SEASON } from "../content/honeys.js";
import { GOODS, GOOD_IDS } from "../content/goods.js";
import { REGULARS, REGULAR_IDS } from "../content/regulars.js";
import { calendarOf } from "./calendar.js";
import { talentOf } from "./keeper.js";
import { addRenown, grant, unlockBy } from "./progress.js";
import { random, below, weighted } from "./rng.js";
import { r3, earn, bump, drop, isInt, isObj } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("./types.js").Wish} Wish */
/** @typedef {import("./types.js").Customer} Customer */
/** @typedef {import("./types.js").ProductInfo} ProductInfo */

// ---- products ---------------------------------------------------------------

/**
 * Everything about a product id, or null when it is not one. Products share
 * one id space: `honey:<flower>:<stars>` (stars 1–3), `honey:blend:0`,
 * `good:<goodId>`. `key` is what moods and gluts are kept by: all stars of a
 * honey rise and fall together.
 * @returns {ProductInfo | null}
 */
export function productInfo(/** @type {any} */ product) {
  if (typeof product !== "string") return null;
  const parts = product.split(":");
  if (parts[0] === "honey" && parts.length === 3) {
    const id = parts[1];
    if (!Object.hasOwn(HONEYS, id)) return null;
    const stars =
      id === "blend" ? (parts[2] === "0" ? 0 : -1) : ["1", "2", "3"].indexOf(parts[2]) + 1;
    if (stars < 0 || (id !== "blend" && stars === 0)) return null;
    const h = HONEYS[id];
    return {
      id: product,
      kind: "honey",
      name: h.name,
      price: h.price,
      key: `honey:${id}`,
      stockKey: `${id}:${stars}`,
      honey: id,
      flower: id === "blend" ? null : id,
      stars,
      pure: id !== "blend",
      traits: h.traits,
      good: null,
      family: null,
    };
  }
  if (parts[0] === "good" && parts.length === 2) {
    const id = parts[1];
    if (!Object.hasOwn(GOODS, id)) return null;
    const g = GOODS[id];
    return {
      id: product,
      kind: "good",
      name: g.name,
      price: g.price,
      key: product,
      stockKey: id,
      honey: null,
      flower: null,
      stars: 0,
      pure: false,
      traits: [],
      good: id,
      family: g.family,
    };
  }
  return null;
}

/** How many of a product are in stock. */
export function stockOf(/** @type {State} */ state, /** @type {ProductInfo} */ info) {
  const shelf = info.kind === "honey" ? state.stock.honey : state.stock.goods;
  return shelf[info.stockKey] ?? 0;
}

function takeStock(
  /** @type {State} */ s,
  /** @type {ProductInfo} */ info,
  /** @type {number} */ n,
) {
  drop(info.kind === "honey" ? s.stock.honey : s.stock.goods, info.stockKey, n);
}

/** How the season moves a product's price. */
function seasonMood(/** @type {ProductInfo} */ info, /** @type {string} */ season) {
  if (info.kind === "honey") return HONEY_SEASON[season] ?? 1;
  return GOODS[/** @type {string} */ (info.good)].season?.[season] ?? 1;
}

const glutFactor = (/** @type {number} */ units) => Math.max(GLUT_FLOOR, 1 - GLUT_STEP * units);

/** One unit's price today, unrounded, once `sold` more of it have gone tonight. */
function unitPrice(/** @type {State} */ state, /** @type {ProductInfo} */ info, sold = 0) {
  const star = info.stars > 0 ? STARS[info.stars - 1].mult : 1;
  const season = seasonMood(info, calendarOf(state.clock.day).seasonName);
  const wobble = state.market.mood[info.key] ?? 1;
  return (
    info.price * star * season * wobble * glutFactor((state.market.glut[info.key] ?? 0) + sold)
  );
}

/**
 * Today's price of one unit: base price × stars × the product's mood (season
 * × daily wobble × glut). What a buyer pays is a share of this; see quote().
 */
export function priceOf(/** @type {State} */ state, /** @type {string} */ product) {
  const info = productInfo(product);
  return info ? Math.max(1, Math.round(unitPrice(state, info))) : 0;
}

/**
 * The coins a sale of `n` units would bring: to a customer who is
 * "delighted" or finds it "fine", or to the "grocer". Each unit sold knocks
 * the price of the next, and the keeper's talent and the Fair are counted.
 */
export function quote(
  /** @type {State} */ state,
  /** @type {string} */ product,
  n = 1,
  /** @type {"delighted" | "fine" | "grocer"} */ to = "grocer",
) {
  const info = productInfo(product);
  if (!info || !isInt(n, 1)) return 0;
  return coinsFor(state, info, n, to);
}

/** The coins one sale of `n` units brings, once `already` more of that kind have gone tonight. */
function coinsFor(
  /** @type {State} */ state,
  /** @type {ProductInfo} */ info,
  /** @type {number} */ n,
  /** @type {"delighted" | "fine" | "grocer"} */ to,
  already = 0,
) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += unitPrice(state, info, already + i);
  let pay = GROCER_PAY;
  if (to !== "grocer") {
    pay = to === "delighted" ? DELIGHTED_PAY : FINE_PAY;
    pay *= talentOf(state).pay ?? 1;
    if (state.market.fair) pay *= FAIR_PAY;
  }
  return Math.max(1, Math.round(sum * pay));
}

/**
 * The coins the grocer would pay right now for a whole basket
 * { [product]: n }: exactly what sellToGrocer would bring for each entry in
 * turn, the glut each sale leaves counted against the next (every star of a
 * honey shares one glut). An entry asks for no more than is in stock; things
 * that are not products, and counts under one, add nothing.
 */
export function grocerQuote(
  /** @type {State} */ state,
  /** @type {Record<string, number>} */ basket,
) {
  if (!isObj(basket)) return 0;
  /** @type {Record<string, number>} */
  const gone = {};
  let coins = 0;
  for (const product of Object.keys(basket)) {
    const info = productInfo(product);
    if (!info) continue;
    const n = Math.min(basket[product], stockOf(state, info));
    if (!isInt(n, 1)) continue;
    coins += coinsFor(state, info, n, "grocer", gone[info.key] ?? 0);
    gone[info.key] = (gone[info.key] ?? 0) + n;
  }
  return coins;
}

/**
 * Everything that can be sold, with counts and today's prices: honey in
 * flower order with the best stars first, then goods.
 */
export function shelf(/** @type {State} */ state) {
  const out = [];
  const add = (/** @type {string} */ product) => {
    const info = /** @type {ProductInfo} */ (productInfo(product));
    const n = stockOf(state, info);
    if (n > 0) out.push({ product, n, price: priceOf(state, product), info });
  };
  for (const id of HONEY_IDS)
    if (id === "blend") add("honey:blend:0");
    else for (let stars = 3; stars >= 1; stars--) add(`honey:${id}:${stars}`);
  for (const id of GOOD_IDS) add(`good:${id}`);
  return out;
}

/**
 * Whether a product is what a wish asks for.
 *   any     anything
 *   kind    value "honey:<flower>" (any stars; "honey:blend" too), "good:<id>" or "family:<family>"
 *   trait   a pure honey with that trait
 *   finest  a pure honey of two stars or better
 *   gift    any workshop good
 */
export function satisfies(
  /** @type {{ type: string, value?: string }} */ wish,
  /** @type {string} */ product,
) {
  const info = productInfo(product);
  if (!info || !wish) return false;
  switch (wish.type) {
    case "any":
      return true;
    case "kind":
      if (info.key === wish.value) return true;
      return info.kind === "good" && wish.value === `family:${info.family}`;
    case "trait":
      return info.pure && info.traits.includes(/** @type {string} */ (wish.value));
    case "finest":
      return info.pure && info.stars >= 2;
    case "gift":
      return info.kind === "good";
    default:
      return false;
  }
}

// ---- who comes, and what they wish for --------------------------------------

/**
 * What the keeper has ever made, which is all a customer will wish for:
 * honeys jarred, the traits those have, whether any had two stars, goods
 * crafted and their families.
 */
export function makeable(/** @type {State} */ state) {
  const st = state.progress.stats;
  const honeys = HONEY_IDS.filter((id) => (st.jarsBy[id] ?? 0) > 0);
  const traits = new Set();
  for (const id of honeys) for (const t of HONEYS[id].traits) traits.add(t);
  const goods = GOOD_IDS.filter((id) => (st.craftedBy[id] ?? 0) > 0);
  const families = new Set(goods.map((id) => GOODS[id].family));
  const finest = Object.values(st.stars).some((n) => n >= 2);
  return { honeys, traits: [...traits], goods, families: [...families], finest };
}

/** Whether something the keeper has made could satisfy this love. */
function canWish(
  /** @type {ReturnType<typeof makeable>} */ can,
  /** @type {{ type: string, value?: string }} */ love,
) {
  const v = love.value ?? "";
  if (love.type === "trait") return can.traits.includes(v);
  if (love.type === "finest") return can.finest;
  if (love.type === "gift") return can.goods.length > 0;
  if (love.type === "kind") {
    if (v.startsWith("honey:")) return can.honeys.includes(v.slice(6));
    if (v.startsWith("good:")) return can.goods.includes(v.slice(5));
    if (v.startsWith("family:")) return can.families.includes(v.slice(7));
  }
  return love.type === "any";
}

/** 1, 2 or 3, by QTY_WEIGHTS. */
function drawQty(/** @type {State} */ s) {
  return Number(weighted(s, "wishes", { 1: QTY_WEIGHTS[0], 2: QTY_WEIGHTS[1], 3: QTY_WEIGHTS[2] }));
}

/** A passing villager's wish. */
function villagerWish(/** @type {State} */ s, /** @type {ReturnType<typeof makeable>} */ can) {
  /** @type {Record<string, number>} */
  const weights = { any: WISH_WEIGHTS.any };
  const kinds = [...can.honeys.map((id) => `honey:${id}`), ...can.goods.map((id) => `good:${id}`)];
  if (kinds.length) weights.kind = WISH_WEIGHTS.kind;
  if (can.traits.length) weights.trait = WISH_WEIGHTS.trait;
  if (can.finest) weights.finest = WISH_WEIGHTS.finest;
  if (can.goods.length) weights.gift = WISH_WEIGHTS.gift;
  const type = weighted(s, "wishes", weights);
  if (type === "kind") {
    /** @type {Record<string, number>} */
    const w = {};
    for (const k of kinds) w[k] = inStock(s, k) ? IN_STOCK_WEIGHT : 1;
    const value = weighted(s, "wishes", w);
    return { type, value, qty: value.startsWith("honey:") ? drawQty(s) : 1 };
  }
  if (type === "trait")
    return { type, value: can.traits[below(s, "wishes", can.traits.length)], qty: drawQty(s) };
  if (type === "finest" || type === "gift") return { type, qty: 1 };
  return { type: "any", qty: drawQty(s) };
}

/** True when any product of this kind key ("honey:<id>", "good:<id>") is on the shelf. */
function inStock(/** @type {State} */ s, /** @type {string} */ key) {
  if (key.startsWith("good:")) return (s.stock.goods[key.slice(5)] ?? 0) > 0;
  const id = key.slice(6);
  for (let stars = 0; stars <= 3; stars++)
    if ((s.stock.honey[`${id}:${stars}`] ?? 0) > 0) return true;
  return false;
}

/** A regular wishes for one of their loves that the keeper has made before. */
function regularWish(
  /** @type {State} */ s,
  /** @type {string} */ who,
  /** @type {ReturnType<typeof makeable>} */ can,
) {
  const r = REGULARS[who];
  const loves = r.loves.filter((l) => canWish(can, l));
  const love = loves[below(s, "wishes", loves.length)];
  const goods = love.type === "kind" && !String(love.value).startsWith("honey:");
  const qty = r.qty ?? (goods || love.type === "finest" ? 1 : 1 + below(s, "wishes", 2));
  return love.value === undefined
    ? { type: love.type, qty }
    : { type: love.type, value: love.value, qty };
}

/** At the Winter Fair everyone is after a present, a candle or the best jar. */
function fairWish(/** @type {State} */ s) {
  const type = weighted(s, "wishes", { gift: 2, candle: 2, finest: 1 });
  const qty = 1 + below(s, "wishes", 2);
  if (type === "candle") return { type: "kind", value: "family:candle", qty };
  return { type, qty: type === "finest" ? 1 : qty };
}

/** How many customers come on an ordinary evening at this renown. */
export const customersFor = (/** @type {number} */ tier) =>
  Math.min(CUSTOMERS_MAX, CUSTOMERS_BASE + tier);

/** Tonight's queue. @returns {Customer[]} */
function makeQueue(/** @type {State} */ s) {
  const fair = s.market.fair;
  const n = fair ? FAIR_CUSTOMERS : customersFor(s.progress.tier);
  const can = makeable(s);
  const around = REGULAR_IDS.filter((id) => REGULARS[id].loves.some((l) => canWish(can, l)));
  /** @type {Customer[]} */
  const queue = [];
  for (let i = 0; i < n; i++) {
    /** @type {string | null} */
    let who = null;
    if (around.length && random(s, "customers") < REGULAR_CHANCE)
      who = around.splice(below(s, "customers", around.length), 1)[0];
    const look = below(s, "customers", 1000000);
    const wish = fair ? fairWish(s) : who ? regularWish(s, who, can) : villagerWish(s, can);
    queue.push({ id: s.meta.nextId++, who, look, wish: /** @type {Wish} */ (wish), bought: null });
  }
  return queue;
}

// ---- the evening ------------------------------------------------------------

/** The evening begins: the stall is shut, and tonight may be the Show or the Fair. */
export function setStall(/** @type {State} */ s) {
  const { doy } = calendarOf(s.clock.day);
  s.market.day = s.clock.day;
  s.market.queue = [];
  s.market.at = 0;
  s.market.open = false;
  s.market.show = doy === SHOW_DOY ? { entered: false, entries: [] } : null;
  s.market.fair = doy === FAIR_DOY;
}

/** Sleep: whoever was still waiting goes home. */
export function closeStall(/** @type {State} */ s) {
  s.market.queue = [];
  s.market.at = 0;
  s.market.open = false;
  s.market.show = null;
  s.market.fair = false;
}

/** Overnight a third of every glut heals and each product's price wobbles afresh. */
export function nightMarket(/** @type {State} */ s) {
  for (const k of Object.keys(s.market.glut)) {
    const left = r3(s.market.glut[k] * (1 - GLUT_HEAL));
    if (left >= 0.05) s.market.glut[k] = left;
    else delete s.market.glut[k];
  }
  /** @type {Record<string, number>} */
  const mood = {};
  for (const id of HONEY_IDS)
    mood[`honey:${id}`] = r3(1 - WOBBLE + 2 * WOBBLE * random(s, "market"));
  for (const id of GOOD_IDS) mood[`good:${id}`] = r3(1 - WOBBLE + 2 * WOBBLE * random(s, "market"));
  s.market.mood = mood;
}

/** openStall: tonight's customers line up. */
export function openStall(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "evening") return "not-evening";
  if (s.market.open) return "stall-open";
  s.market.open = true;
  s.market.queue = makeQueue(s);
  s.market.at = 0;
  events.push({
    type: "stallOpened",
    queue: s.market.queue.map((c) => ({ ...c, wish: { ...c.wish } })),
    fair: s.market.fair,
  });
}

/** The customer at the stall, or a `why` code. */
function atStall(/** @type {State} */ s, /** @type {Action} */ a) {
  if (s.clock.phase !== "evening") return "not-evening";
  if (!s.market.open) return "stall-closed";
  const c = s.market.queue[s.market.at];
  if (!c) return "no-customer";
  if (a.customer !== undefined && a.customer !== c.id) return "not-your-turn";
  return c;
}

/** A delighted sale to a regular: a heart, and at 3, 7 and 12 hearts a gift. */
function heart(
  /** @type {State} */ s,
  /** @type {string} */ who,
  /** @type {GameEvent[]} */ events,
) {
  const hearts = (s.regulars.hearts[who] ?? 0) + 1;
  s.regulars.hearts[who] = hearts;
  const n = HEART_GIFTS.indexOf(hearts) + 1;
  if (n > (s.regulars.gifts[who] ?? 0)) {
    s.regulars.gifts[who] = n;
    const reward = REGULARS[who].gifts[n - 1];
    events.push({ type: "heart", regular: who, hearts, gift: { n, reward } });
    grant(s, reward, events);
  } else events.push({ type: "heart", regular: who, hearts });
}

/**
 * offer { customer, product, n? }: sell the customer at the stall one
 * product: `n` of it, from one up to what they want and what there is, or
 * left out as many as they want (or as many as there are). Delighted if it
 * is what they wished for; otherwise they take it for less.
 */
export function offer(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const c = atStall(s, a);
  if (typeof c === "string") return c;
  const info = productInfo(a.product);
  if (!info) return "no-product";
  const have = stockOf(s, info);
  if (have < 1) return "no-stock";
  const most = Math.min(c.wish.qty, have);
  const n = a.n === undefined ? most : a.n;
  if (!isInt(n, 1)) return "bad-args";
  if (n > have) return "no-stock";
  if (n > most) return "bad-args";
  const happy = satisfies(c.wish, info.id);
  const mood = happy ? "delighted" : "fine";
  const coins = quote(s, info.id, n, mood);
  takeStock(s, info, n);
  bump(s.market.glut, info.key, n);
  earn(s, coins);
  const renown = happy ? (info.stars === 3 ? 2 : 1) : 0;
  c.bought = { product: info.id, n, coins, mood };
  s.market.at += 1;
  events.push({
    type: "sold",
    customer: c.id,
    who: c.who,
    wish: { ...c.wish },
    product: info.id,
    n,
    coins,
    mood,
    renown,
    fair: s.market.fair,
  });
  if (happy && c.who) heart(s, c.who, events);
  if (renown) addRenown(s, renown, events);
}

/** pass { customer }: let the customer at the stall go with nothing. No penalty. */
export function pass(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const c = atStall(s, a);
  if (typeof c === "string") return c;
  c.bought = { product: null, n: 0, coins: 0, mood: "passed" };
  s.market.at += 1;
  events.push({ type: "passed", customer: c.id, who: c.who });
}

/** sellToGrocer { product, n }: any amount of anything, any time in the evening, for less. */
export function sellToGrocer(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "evening") return "not-evening";
  const info = productInfo(a.product);
  if (!info) return "no-product";
  const n = a.n === undefined ? 1 : a.n;
  if (!isInt(n, 1)) return "bad-args";
  if (stockOf(s, info) < n) return "no-stock";
  const coins = quote(s, info.id, n, "grocer");
  takeStock(s, info, n);
  bump(s.market.glut, info.key, n);
  earn(s, coins);
  events.push({ type: "soldToGrocer", product: info.id, n, coins });
}

/**
 * enterShow { honeys: [product, ...] }: on the evening of the Honey Show,
 * before the stall opens, up to three pure honeys of different flowers, one
 * jar each. Every entry wins a ribbon by its stars.
 */
export function enterShow(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "evening") return "not-evening";
  if (!s.market.show) return "no-show";
  if (s.market.show.entered) return "show-done";
  if (s.market.open) return "stall-open";
  const list = a.honeys;
  if (!Array.isArray(list) || list.length < 1 || list.length > SHOW_ENTRIES) return "bad-entry";
  const infos = [];
  for (const p of list) {
    const info = productInfo(p);
    if (!info) return "no-product";
    if (!info.pure) return "not-pure";
    if (infos.some((i) => i.flower === info.flower)) return "same-honey";
    if (stockOf(s, info) < 1) return "no-stock";
    infos.push(info);
  }
  const year = calendarOf(s.clock.day).year;
  const entries = [];
  let coins = 0;
  let renown = 0;
  for (const info of infos) {
    const prize = RIBBONS[info.stars - 1];
    takeStock(s, info, 1);
    s.progress.ribbons.push({
      year,
      honey: /** @type {string} */ (info.flower),
      medal: prize.medal,
    });
    coins += prize.coins;
    renown += prize.renown;
    entries.push({
      product: info.id,
      flower: info.flower,
      stars: info.stars,
      medal: prize.medal,
      coins: prize.coins,
      renown: prize.renown,
    });
  }
  s.market.show = { entered: true, entries };
  earn(s, coins);
  events.push({ type: "showJudged", year, entries, coins, renown });
  unlockBy(s, "ribbon", true, events);
  addRenown(s, renown, events);
}
