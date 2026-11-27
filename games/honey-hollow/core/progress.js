// @ts-check
/**
 * Progress: renown and its tiers, what is unlocked, the goal list, the shop,
 * the running statistics, and the end of each year.
 *
 * track() runs after every accepted action: it counts what the action's
 * events say happened, lets the bee book react, and announces goals that have
 * just become ready.
 */

import { GOALS, TIERS } from "../content/goals.js";
import { FLOWERS, FLOWER_IDS } from "../content/flowers.js";
import { GOODS, RECIPES } from "../content/goods.js";
import { PLOTS, PLOT_IDS } from "../content/plots.js";
import { REGULAR_IDS } from "../content/regulars.js";
import { HIVE_IDS } from "../content/hives.js";
import { WARDROBE } from "../content/wardrobe.js";
import { FACTS } from "../content/facts.js";
import { SHOP, SHOP_ITEMS_FROM_DAY } from "../content/tuning.js";
import { calendarOf } from "./calendar.js";
import { hiveCost } from "./hives.js";
import { customersFor } from "./market.js";
import { addToWardrobe } from "./keeper.js";
import { raise } from "./book.js";
import { spend, earn, bump, isInt } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("../content/goals.js").Goal} Goal */
/** @typedef {import("../content/goals.js").Reward} Reward */

/** Goals open at a time. */
export const GOALS_OPEN = 3;

/** Counters track() keeps. Every one starts at 0 (or empty) and only goes up. */
export const freshStats = () => ({
  days: 0,
  jars: 0,
  pure: 0,
  stars3: 0,
  /** jars by honey id: a flower counts only its pure jars, "blend" the rest */
  jarsBy: /** @type {Record<string, number>} */ ({}),
  /** best stars ever jarred, by flower */
  stars: /** @type {Record<string, number>} */ ({}),
  wax: 0,
  customers: 0,
  sold: 0,
  delighted: 0,
  fine: 0,
  passed: 0,
  grocer: 0,
  earned: 0,
  fairSold: 0,
  planted: 0,
  dug: 0,
  picked: 0,
  hivesBought: 0,
  moved: 0,
  upgraded: 0,
  fed: 0,
  dusted: 0,
  remedies: 0,
  splits: 0,
  caught: 0,
  swarms: 0,
  swarmsLost: 0,
  fended: 0,
  raided: 0,
  hungry: 0,
  crafted: 0,
  craftedBy: /** @type {Record<string, number>} */ ({}),
  ribbons: 0,
  gold: 0,
  goodWinters: 0,
});

/** Today's tally, for the night card: jars taken, coins from the stall and from the grocer, hearts won. */
export const freshDay = () => ({ jars: 0, stall: 0, grocer: 0, hearts: 0 });

const freshYear = () => ({
  jars: 0,
  pure: 0,
  kinds: /** @type {string[]} */ ([]),
  earned: 0,
  hungryWinter: 0,
});

/** @returns {import("./types.js").ProgressSlice} */
export function freshProgress() {
  return {
    renown: 0,
    tier: 0,
    claimed: [],
    ready: [],
    stats: freshStats(),
    unlocked: {
      flowers: FLOWER_IDS.filter((id) => FLOWERS[id].unlock.start),
      recipes: Object.keys(RECIPES).filter((id) => RECIPES[id].unlock.start),
    },
    ribbons: [],
    year: freshYear(),
    today: freshDay(),
    almanac: [],
    yearsSeen: 0,
  };
}

// ---- renown and unlocks -----------------------------------------------------

/** The keeper's standing: tier, its name, renown, what the next tier needs, customers an evening. */
export function tierOf(/** @type {State} */ state) {
  const tier = state.progress.tier;
  const next = TIERS[tier + 1] ?? null;
  return {
    tier,
    name: TIERS[tier].name,
    renown: state.progress.renown,
    next: next && { tier: next.tier, name: next.name, renown: next.renown, blurb: next.blurb },
    customers: customersFor(tier),
  };
}

/**
 * Unlock every flower, recipe and wardrobe item whose `unlock[key]` is
 * `value`: { tier: 2 }, { plot: "pond" }, { ribbon: true }.
 */
export function unlockBy(
  /** @type {State} */ s,
  /** @type {string} */ key,
  /** @type {any} */ value,
  /** @type {GameEvent[]} */ events,
) {
  const u = s.progress.unlocked;
  for (const f of Object.values(FLOWERS))
    if (f.unlock[key] === value && f.seed !== null && !u.flowers.includes(f.id)) {
      u.flowers.push(f.id);
      events.push({ type: "unlocked", what: "flower", id: f.id });
    }
  for (const r of Object.values(RECIPES))
    if (r.unlock[key] === value && !u.recipes.includes(r.id)) {
      u.recipes.push(r.id);
      events.push({ type: "unlocked", what: "recipe", id: r.id });
    }
  for (const item of WARDROBE.hat)
    if (item.unlock[key] === value && addToWardrobe(s, item.id))
      events.push({ type: "unlocked", what: "wardrobe", id: item.id });
}

/** Add renown, climbing tiers and unlocking what they bring. */
export function addRenown(
  /** @type {State} */ s,
  /** @type {number} */ n,
  /** @type {GameEvent[]} */ events,
) {
  if (!(n > 0)) return;
  const p = s.progress;
  p.renown += n;
  while (p.tier + 1 < TIERS.length && p.renown >= TIERS[p.tier + 1].renown) {
    p.tier += 1;
    events.push({ type: "renownUp", tier: p.tier, name: TIERS[p.tier].name });
    unlockBy(s, "tier", p.tier, events);
  }
}

/** Hand over a reward (a goal's, or a regular's gift). */
export function grant(
  /** @type {State} */ s,
  /** @type {Reward} */ reward,
  /** @type {GameEvent[]} */ events,
) {
  if (reward.coins) earn(s, reward.coins);
  for (const [flower, n] of Object.entries(reward.seeds ?? {})) bump(s.stock.seeds, flower, n);
  for (const [item, n] of Object.entries(reward.items ?? {})) {
    if (item === "spare") s.hives.spare += n;
    else if (item === "syrup") s.stock.syrup += n;
    else if (item === "remedy") s.stock.remedy += n;
  }
  if (reward.recipe && !s.progress.unlocked.recipes.includes(reward.recipe)) {
    s.progress.unlocked.recipes.push(reward.recipe);
    events.push({ type: "unlocked", what: "recipe", id: reward.recipe });
  }
  if (reward.wardrobe && addToWardrobe(s, reward.wardrobe))
    events.push({ type: "unlocked", what: "wardrobe", id: reward.wardrobe });
  if (reward.renown) addRenown(s, reward.renown, events);
}

// ---- goals ------------------------------------------------------------------

const count = (/** @type {Record<string, number>} */ o, /** @type {(n: number) => boolean} */ ok) =>
  Object.values(o).filter(ok).length;

/**
 * What a goal can measure. Each is (state, arg) → a number that the goal
 * needs to reach. A goal in content/goals.js names one of these.
 * @type {Record<string, (state: State, arg?: string) => number>}
 */
export const MEASURES = {
  days: (s) => s.progress.stats.days,
  jars: (s) => s.progress.stats.jars,
  /** pure jars of one flower */
  jarsOf: (s, arg = "") => s.progress.stats.jarsBy[arg] ?? 0,
  /** kinds of pure honey ever jarred */
  kinds: (s) => count(s.progress.stats.stars, (n) => n >= 1),
  /** kinds ever jarred at three stars */
  kinds3: (s) => count(s.progress.stats.stars, (n) => n >= 3),
  customers: (s) => s.progress.stats.customers,
  delighted: (s) => s.progress.stats.delighted,
  planted: (s) => s.progress.stats.planted,
  picked: (s) => s.progress.stats.picked,
  moved: (s) => s.progress.stats.moved,
  upgraded: (s) => s.progress.stats.upgraded,
  /** colonies made by splitting or by catching a swarm */
  increase: (s) => s.progress.stats.splits + s.progress.stats.caught,
  dusted: (s) => s.progress.stats.dusted,
  fended: (s) => s.progress.stats.fended,
  fairSold: (s) => s.progress.stats.fairSold,
  ribbons: (s) => s.progress.stats.ribbons,
  gold: (s) => s.progress.stats.gold,
  goodWinters: (s) => s.progress.stats.goodWinters,
  hives: (s) => s.hives.list.length,
  /** the tallest hive: 0 skep, 1 box, 2 double, 3 stack */
  bestHive: (s) => Math.max(0, ...s.hives.list.map((h) => HIVE_IDS.indexOf(h.type))),
  /** goods of one family ever crafted */
  craftedOf: (s, arg = "") => {
    let n = 0;
    for (const [id, made] of Object.entries(s.progress.stats.craftedBy))
      if (GOODS[id]?.family === arg) n += /** @type {number} */ (made);
    return n;
  },
  plot: (s, arg = "") => (s.land.plots[arg]?.owned ? 1 : 0),
  maxHearts: (s) => Math.max(0, ...Object.values(s.regulars.hearts)),
  /** regulars with three hearts or more */
  friends: (s) => REGULAR_IDS.filter((id) => (s.regulars.hearts[id] ?? 0) >= 3).length,
  facts: (s) => s.book.facts.length,
  renown: (s) => s.progress.renown,
};

/** How far along a goal is (not capped at its need). */
export function measure(/** @type {State} */ state, /** @type {Goal} */ goal) {
  const m = MEASURES[goal.measure];
  return m ? m(state, goal.arg) : 0;
}

/** Whether a goal may be on the list right now. A goal that is already met always may. */
function shown(
  /** @type {State} */ state,
  /** @type {Goal} */ g,
  /** @type {number} */ doy,
  /** @type {boolean} */ ready,
) {
  if (g.after && !state.progress.claimed.includes(g.after)) return false;
  if (g.fromDay && state.clock.day < g.fromDay) return false;
  if (g.tier && state.progress.tier < g.tier) return false;
  if (g.plot && !state.land.plots[g.plot]?.owned) return false;
  // A page goal waits until the book has that many pages to find.
  if (g.measure === "facts" && FACTS.length < g.need) return false;
  if (g.season && !ready && (doy < g.season[0] || doy > g.season[1])) return false;
  return true;
}

/**
 * The open goals: the first GOALS_OPEN unclaimed goals, in list order, that
 * may be shown now. Each comes as { goal, have, need, ready }.
 */
export function goalsNow(/** @type {State} */ state) {
  const out = [];
  const { doy } = calendarOf(state.clock.day);
  for (const goal of GOALS) {
    if (out.length >= GOALS_OPEN) break;
    if (state.progress.claimed.includes(goal.id)) continue;
    const have = measure(state, goal);
    const ready = have >= goal.need;
    if (!shown(state, goal, doy, ready)) continue;
    out.push({ goal, have: Math.min(have, goal.need), need: goal.need, ready });
  }
  return out;
}

/** claimGoal { goal }: take the reward of an open goal that has been met. */
export function claimGoal(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const open = goalsNow(s).find((g) => g.goal.id === a.goal);
  if (!open) return GOALS.some((g) => g.id === a.goal) ? "goal-not-open" : "no-goal";
  if (!open.ready) return "goal-not-ready";
  s.progress.claimed.push(open.goal.id);
  s.progress.ready = s.progress.ready.filter((id) => id !== open.goal.id);
  events.push({ type: "goalClaimed", goal: open.goal.id, reward: open.goal.reward });
  grant(s, open.goal.reward, events);
}

// ---- the shop ---------------------------------------------------------------

/**
 * What can be bought right now: seeds (those in the shop, and any the keeper
 * holds), the three items with whether they are on sale yet, the price of
 * the next hive, and the plots not yet owned.
 */
export function shopNow(/** @type {State} */ state) {
  const seeds = [];
  for (const id of FLOWER_IDS) {
    const f = FLOWERS[id];
    if (f.seed === null) continue;
    const inShop = state.progress.unlocked.flowers.includes(id);
    const have = state.stock.seeds[id] ?? 0;
    if (inShop || have > 0) seeds.push({ flower: id, name: f.name, price: f.seed, have, inShop });
  }
  const open = state.clock.day >= SHOP_ITEMS_FROM_DAY;
  const have = { syrup: state.stock.syrup, remedy: state.stock.remedy, spare: state.hives.spare };
  const items = Object.values(SHOP).map((i) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    have: have[i.id],
    open,
  }));
  const plots = PLOT_IDS.filter((id) => !state.land.plots[id].owned).map((id) => ({
    plot: id,
    name: PLOTS[id].name,
    price: PLOTS[id].price,
  }));
  return { seeds, items, hive: { price: hiveCost(state) }, plots };
}

/** buy { item, n }: syrup, a spare hive or a thyme remedy. */
export function buy(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (typeof a.item !== "string" || !Object.hasOwn(SHOP, a.item)) return "not-for-sale";
  if (s.clock.day < SHOP_ITEMS_FROM_DAY) return "not-yet";
  const n = a.n === undefined ? 1 : a.n;
  if (!isInt(n, 1, 99)) return "bad-args";
  const coins = SHOP[a.item].price * n;
  if (s.purse.coins < coins) return "no-coins";
  spend(s, coins);
  grant(s, { items: { [a.item]: n } }, events);
  events.push({ type: "bought", item: a.item, n, coins });
}

// ---- counting ---------------------------------------------------------------

/** Count what an action's events say happened. */
function tally(/** @type {State} */ s, /** @type {GameEvent[]} */ events) {
  const st = s.progress.stats;
  const yr = s.progress.year;
  const day = s.progress.today;
  // The last night of winter: endYear has already counted tonight's hungry colonies into the year it closed.
  const yearEnded = events.some((e) => e.type === "yearEnded");
  for (const e of events) {
    switch (e.type) {
      case "dayStarted":
        st.days += 1;
        break;
      case "harvested":
        st.jars += e.jars;
        yr.jars += e.jars;
        day.jars += e.jars;
        st.wax += e.wax;
        bump(st.jarsBy, e.flower ?? "blend", e.jars);
        if (e.stars > 0) {
          st.pure += e.jars;
          yr.pure += e.jars;
          if (e.stars === 3) st.stars3 += e.jars;
          st.stars[e.flower] = Math.max(st.stars[e.flower] ?? 0, e.stars);
          if (!yr.kinds.includes(e.flower)) yr.kinds.push(e.flower);
        }
        break;
      case "sold":
        st.customers += 1;
        st.sold += e.n;
        st.earned += e.coins;
        yr.earned += e.coins;
        st[e.mood] += 1;
        day.stall += e.coins;
        if (e.fair) st.fairSold += e.n;
        break;
      case "heart":
        day.hearts += 1;
        break;
      case "passed":
        st.passed += 1;
        break;
      case "soldToGrocer":
        st.grocer += e.n;
        st.earned += e.coins;
        yr.earned += e.coins;
        day.grocer += e.coins;
        break;
      case "showJudged":
        st.ribbons += e.entries.length;
        st.gold += e.entries.filter((/** @type {any} */ x) => x.medal === "gold").length;
        st.earned += e.coins;
        yr.earned += e.coins;
        break;
      case "planted":
        st.planted += 1;
        break;
      case "dug":
        st.dug += 1;
        break;
      case "picked":
        st.picked += 1;
        break;
      case "hiveBought":
        st.hivesBought += 1;
        break;
      case "hiveMoved":
        st.moved += 1;
        break;
      case "hiveUpgraded":
        st.upgraded += 1;
        break;
      case "fed":
        st.fed += e.n;
        break;
      case "dusted":
        st.dusted += 1;
        break;
      case "remedied":
        st.remedies += 1;
        break;
      case "split":
        st.splits += 1;
        break;
      case "swarmCaught":
        st.caught += 1;
        break;
      case "swarmed":
        st.swarms += 1;
        break;
      case "swarmLost":
        st.swarmsLost += 1;
        break;
      case "waspsFended":
        st.fended += 1;
        break;
      case "waspsRaided":
        st.raided += 1;
        break;
      case "hungry":
        st.hungry += 1;
        if (e.winter && !yearEnded) yr.hungryWinter += 1;
        break;
      case "crafted":
        st.crafted += 1;
        bump(st.craftedBy, e.made);
        break;
    }
  }
}

/**
 * After every accepted action: count it, let the bee book react, and
 * announce goals that have just been met.
 */
export function track(/** @type {State} */ s, /** @type {GameEvent[]} */ events) {
  tally(s, events);
  raise(s, events);
  for (const g of goalsNow(s)) {
    if (!g.ready || s.progress.ready.includes(g.goal.id)) continue;
    s.progress.ready.push(g.goal.id);
    events.push({ type: "goalReady", goal: g.goal.id });
  }
}

// ---- the year ---------------------------------------------------------------

/** The last sleep of winter: write the year into the almanac and start a fresh one. */
export function endYear(
  /** @type {State} */ s,
  /** @type {number} */ year,
  /** @type {GameEvent[]} */ events,
) {
  const p = s.progress;
  // Tonight's hungry colonies are in `events` but not yet counted (track() runs
  // after the action): they belong to the winter that is ending.
  const hungryWinter =
    p.year.hungryWinter + events.filter((e) => e.type === "hungry" && e.winter).length;
  if (hungryWinter === 0) p.stats.goodWinters += 1;
  const summary = {
    year,
    jars: p.year.jars,
    pure: p.year.pure,
    kinds: [...p.year.kinds],
    earned: p.year.earned,
    ribbons: p.ribbons
      .filter((r) => r.year === year)
      .map((r) => ({ honey: r.honey, medal: r.medal })),
    facts: s.book.facts.length,
    hives: s.hives.list.length,
    plots: PLOT_IDS.filter((id) => s.land.plots[id].owned).length,
    renown: p.renown,
    tier: p.tier,
    goals: p.claimed.length,
    hearts: Object.values(s.regulars.hearts).reduce((a, b) => a + b, 0),
    heartsBy: Object.fromEntries(REGULAR_IDS.map((id) => [id, s.regulars.hearts[id] ?? 0])),
    friends: MEASURES.friends(s),
    hungryWinter,
    coins: s.purse.coins,
  };
  p.almanac.push(summary);
  p.year = freshYear();
  events.push({ type: "yearEnded", year, summary });
}

/** The year page waiting to be shown ("A year in Honey Hollow"), oldest first, or null. */
export function yearDue(/** @type {State} */ state) {
  return state.progress.almanac.find((y) => y.year > state.progress.yearsSeen) ?? null;
}

/** seenYear { year }: the keeper has read that year's page. */
export function seenYear(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (
    !isInt(a.year, s.progress.yearsSeen + 1) ||
    !s.progress.almanac.some((y) => y.year === a.year)
  )
    return "nothing-to-see";
  s.progress.yearsSeen = a.year;
  events.push({ type: "yearSeen", year: a.year });
}
