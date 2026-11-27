// @ts-check
/**
 * Hives: the forage plan, stores, harvest, growth, and the living things
 * that go wrong (swarms, mites, wasps).
 *
 * The plan is the heart of the game. At startDay every hive's share of every
 * blooming bed in its reach is fixed; each tick then delivers 1/240 of it.
 * forecast() runs the same sharing for a hive where it stands or anywhere
 * else, so the range preview the screen draws is what the day will give.
 */

import {
  TICKS_PER_DAY,
  SEASON_DAYS,
  YEAR_DAYS,
  PLOT_W,
  FORAGE_PER_STRENGTH,
  SHARE_ROUNDS,
  MOVED_FLIGHT,
  WILD_SHARE,
  WATER_BONUS,
  NECTAR_PER_JAR,
  EAT_PER_STRENGTH,
  WINTER_EAT,
  GROW_DAYS,
  GROW_FACTOR,
  NEW_HIVE_STRENGTH,
  HIVE_PRICE,
  HIVE_PRICE_STEP,
  STARS,
  JARS_PER_WAX,
  SYRUP_UNITS,
  SWARMS_FROM_DAY,
  SWARM_DOY,
  SPLIT_MIN_STRENGTH,
  MITES_FROM_DAY,
  MITE_RATE,
  MITES_SPOTTED,
  MITES_STALL,
  MITES_HARM,
  MITES_HARM_SLEEPS,
  DUST_MITES,
  REMEDY_MITES,
  WASP_DOY,
  WASP_MAX_STRENGTH,
  WASP_CHANCE,
  WASP_WINDOW,
  WASP_TICKS,
  WASP_LOSS,
} from "../content/tuning.js";
import { HIVES, HIVE_IDS } from "../content/hives.js";
import { FLOWERS } from "../content/flowers.js";
import { PLOT_IDS } from "../content/plots.js";
import { calendarOf, inBloom, flightFor } from "./calendar.js";
import { at, SQUARES, reachAt, groundOf, canPlaceHive, nearWater } from "./land.js";
import { talentOf } from "./keeper.js";
import { random, below } from "./rng.js";
import { r3, spend, bump, isInt } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("./types.js").Hive} Hive */
/** @typedef {import("./types.js").HivePlan} HivePlan */

const EPS = 1e-9;
const WINTER = 3;
const SUMMER = 1;
/** The hive a purchase, a split or a caught swarm gives. */
const NEW_HIVE_TYPE = HIVE_IDS[0];

// ---- a hive and its stores --------------------------------------------------

/** @returns {import("./types.js").HiveToday} */
export const freshToday = () => ({ got: 0, lost: 0, by: {}, raided: 0 });

/** A hive's defaults; loadSave fills any field a saved hive is missing from here. @returns {Hive} */
export function freshHive() {
  return {
    id: 0,
    plot: "home",
    x: 0,
    y: 0,
    type: "skep",
    strength: NEW_HIVE_STRENGTH,
    grow: 0,
    stores: {},
    mites: 0,
    sick: 0,
    swarmCells: false,
    moved: 0,
    from: null,
    dusted: 0,
    hungry: false,
    raid: null,
    harvested: 0,
    swarmYear: 0,
    today: freshToday(),
  };
}

/** @returns {import("./types.js").PlanSlice} */
export const freshPlan = () => ({ day: 0, hives: {}, wasps: null });

export const hiveById = (/** @type {State} */ s, /** @type {any} */ id) =>
  s.hives.list.find((h) => h.id === id);

/** Units in a set of stores, all sources together. */
export function totalOf(/** @type {Record<string, number>} */ stores) {
  let t = 0;
  for (const k in stores) t += stores[k];
  return t;
}

/** Units a hive can hold. */
export const capacityOf = (/** @type {{ type: string }} */ hive) =>
  HIVES[hive.type].jars * NECTAR_PER_JAR;
/** The strength a hive's colony can grow to. */
export const limitOf = (/** @type {{ type: string }} */ hive) => HIVES[hive.type].limit;
/** Whole jars that could be taken from a hive right now. */
export const jarsIn = (/** @type {{ stores: Record<string, number> }} */ hive) =>
  Math.floor((totalOf(hive.stores) + 1e-6) / NECTAR_PER_JAR);

/**
 * What a jar from these stores would be. Purity is the biggest flower's share
 * of everything in the hive (syrup and hedgerow nectar count against it and
 * never name a honey). From 80% it is that flower's pure honey, with one to
 * three stars; below, meadow blend.
 * @returns {{ product: string | null, flower: string | null, purity: number, stars: number }}
 */
export function verdictOf(/** @type {Record<string, number>} */ stores) {
  let total = 0;
  let best = 0;
  /** @type {string | null} */
  let flower = null;
  for (const k in stores) {
    const v = stores[k];
    total += v;
    if (v > best && Object.hasOwn(FLOWERS, k)) {
      best = v;
      flower = k;
    }
  }
  if (total <= 0) return { product: null, flower: null, purity: 0, stars: 0 };
  const purity = best / total;
  let stars = 0;
  for (let i = 0; i < STARS.length; i++) if (purity + EPS >= STARS[i].at) stars = i + 1;
  if (!stars || !flower) return { product: "honey:blend:0", flower: null, purity, stars: 0 };
  return { product: `honey:${flower}:${stars}`, flower, purity, stars };
}

/** Remove `units` from stores, from every source in proportion. Returns what was taken. */
function take(/** @type {Record<string, number>} */ stores, /** @type {number} */ units) {
  const total = totalOf(stores);
  if (total <= 0 || units <= 0) return 0;
  const keep = Math.max(0, 1 - units / total);
  for (const k in stores) {
    const v = r3(stores[k] * keep);
    if (v > 0) stores[k] = v;
    else delete stores[k];
  }
  return Math.min(units, total);
}

/** What a new skep with its colony costs today. */
export const hiveCost = (/** @type {State} */ state) =>
  HIVE_PRICE + HIVE_PRICE_STEP * Math.max(0, state.hives.list.length - 1);

/** The next hive up from this one, with its price, or null at the top. */
export function upgradeOf(/** @type {{ type: string }} */ hive) {
  const next = HIVES[hive.type]?.next;
  if (!next) return null;
  const t = HIVES[next];
  return { type: t.id, name: t.name, cost: t.cost, jars: t.jars, limit: t.limit };
}

/** What the colony eats at tonight's sleep. */
export function mealOf(/** @type {{ strength: number }} */ hive, /** @type {number} */ day) {
  const meal = hive.strength * EAT_PER_STRENGTH;
  return r3(calendarOf(day).season === WINTER ? meal * WINTER_EAT : meal);
}

/**
 * The stores a colony needs to see the winter out without feeding: tonight's
 * meal and every winter night after it, at the strength it has now. Before
 * winter that is tonight plus all seven winter nights; in winter it shrinks
 * by a night each day.
 */
export function winterNeed(
  /** @type {State} */ state,
  /** @type {{ strength: number }} */ hive,
  day = state.clock.day,
) {
  const cal = calendarOf(day);
  const meal = hive.strength * EAT_PER_STRENGTH;
  if (cal.season === WINTER) return r3(meal * WINTER_EAT * (YEAR_DAYS - cal.doy));
  return r3(meal + meal * WINTER_EAT * SEASON_DAYS);
}

/**
 * True when a colony is as strong as its hive allows in swarm season: it has
 * outgrown its home, and that is what sets it raising queen cells.
 */
function crowded(/** @type {Hive} */ h, /** @type {number} */ day) {
  const { doy } = calendarOf(day);
  return (
    day >= SWARMS_FROM_DAY &&
    doy >= SWARM_DOY[0] &&
    doy <= SWARM_DOY[1] &&
    h.strength >= 2 &&
    h.strength >= limitOf(h)
  );
}

/** True when this colony would start queen cells at tonight's sleep as things stand. Once a year at most. */
const cellsDue = (/** @type {Hive} */ h, /** @type {number} */ day) =>
  !h.swarmCells && h.swarmYear !== calendarOf(day).year && crowded(h, day);

/**
 * What about a hive wants the keeper's eye, as short codes: "wasps",
 * "queen-cells" (it swarms tonight unless honey is taken from it today, it
 * gets a bigger hive or it is split), "swarm-risk" (as strong as its hive
 * allows in swarm season: it will build queen cells tonight), "hungry"
 * (it went hungry last night, and loses strength if it does again), "low" (it cannot eat tonight), "winter-short"
 * (autumn and winter: less than winterNeed), "mites" (spotted), "mites-bad"
 * (the colony is being harmed), "full" (nine tenths full or more).
 * @returns {string[]}
 */
export function attentionOf(/** @type {State} */ state, /** @type {Hive} */ hive) {
  const day = state.clock.day;
  const { season } = calendarOf(day);
  const total = totalOf(hive.stores);
  const flags = [];
  if (hive.raid) flags.push("wasps");
  if (hive.swarmCells) flags.push("queen-cells");
  else if (cellsDue(hive, day)) flags.push("swarm-risk");
  if (hive.hungry) flags.push("hungry");
  if (total + EPS < mealOf(hive, day)) flags.push("low");
  else if (season >= 2 && total + EPS < winterNeed(state, hive)) flags.push("winter-short");
  if (hive.mites >= MITES_HARM) flags.push("mites-bad");
  else if (hive.mites >= MITES_SPOTTED) flags.push("mites");
  if (total >= 0.9 * capacityOf(hive)) flags.push("full");
  return flags;
}

// ---- the forage plan --------------------------------------------------------

/** @returns {HivePlan} */
const emptyPlan = () => ({ total: 0, wild: 0, by: {}, beds: [] });

/** Nectar a hive could carry home on `day` in `weather`, where it stands. */
export function carryOf(
  /** @type {{ strength: number, plot: string, x: number, y: number, moved: number }} */ hive,
  /** @type {number} */ day,
  /** @type {string} */ weather,
) {
  let c = hive.strength * FORAGE_PER_STRENGTH * flightFor(weather, hive.plot);
  if (calendarOf(day).season === SUMMER && nearWater(hive.plot, hive.x, hive.y))
    c *= 1 + WATER_BONUS;
  if (hive.moved === day) c *= MOVED_FLIGHT;
  return c;
}

/**
 * Share one plot's nectar between the hives standing on it.
 *
 * Each hive asks every blooming bed in its reach for a share of what it can
 * carry, in proportion to weight × the nectar the bed still has. A bed asked
 * for more than it has gives each hive its fair fraction. What a hive could
 * not get it asks of its other beds, for SHARE_ROUNDS rounds in all. A hive
 * left with less than WILD_SHARE of its load tops up from the hedgerows.
 *
 * @param {State} state
 * @param {string} plot
 * @param {number} day
 * @param {string} weather
 * @param {Hive[]} hives  the hives on this plot (real or imagined)
 * @param {Record<string, HivePlan>} out  filled with each hive's plan, by id
 */
function planPlot(state, plot, day, weather, hives, out) {
  const n = hives.length;
  if (!n) return;
  if (calendarOf(day).season === WINTER) {
    for (const h of hives) out[h.id] = emptyPlan();
    return;
  }
  const squares = state.land.plots[plot].squares;
  const ground = groundOf(plot);
  const left = new Array(SQUARES).fill(0);
  /** @type {(string | null)[]} */
  const flowerAt = new Array(SQUARES).fill(null);
  /** @type {Record<string, boolean>} */
  const open = {};
  let any = false;
  for (let i = 0; i < SQUARES; i++) {
    const sq = squares[i];
    let fl = null;
    if (sq) {
      if (sq.t === "bed" && sq.planted < day && sq.picked !== day) fl = sq.flower;
    } else if (ground[i] === "T") fl = "apple";
    if (!fl) continue;
    if (open[fl] === undefined) open[fl] = inBloom(state, fl, day);
    if (!open[fl]) continue;
    left[i] = FLOWERS[fl].nectar;
    flowerAt[i] = fl;
    any = true;
  }
  const carry = hives.map((h) => carryOf(h, day, weather));
  const need = carry.slice();
  const got = hives.map(() => new Array(SQUARES).fill(0));
  for (let round = 0; any && round < SHARE_ROUNDS; round++) {
    const asked = new Array(SQUARES).fill(0);
    /** @type {(number[] | null)[]} */
    const asks = [];
    let asking = false;
    for (let k = 0; k < n; k++) {
      asks.push(null);
      if (need[k] <= EPS) continue;
      const reach = reachAt(at(hives[k].x, hives[k].y));
      let sum = 0;
      for (const r of reach) if (left[r.i] > EPS) sum += r.w * left[r.i];
      if (sum <= EPS) continue;
      const mine = [];
      for (const r of reach)
        if (left[r.i] > EPS) {
          const q = (need[k] * r.w * left[r.i]) / sum;
          mine.push(r.i, q);
          asked[r.i] += q;
        }
      asks[k] = mine;
      asking = true;
    }
    if (!asking) break;
    const given = new Array(SQUARES).fill(0);
    for (let k = 0; k < n; k++) {
      const mine = asks[k];
      if (!mine) continue;
      for (let j = 0; j < mine.length; j += 2) {
        const i = mine[j];
        let q = mine[j + 1];
        if (asked[i] > left[i]) q = (q * left[i]) / asked[i];
        got[k][i] += q;
        need[k] -= q;
        given[i] += q;
      }
    }
    for (let i = 0; i < SQUARES; i++) if (given[i]) left[i] = Math.max(0, left[i] - given[i]);
  }
  for (let k = 0; k < n; k++) {
    const plan = emptyPlan();
    let sum = 0;
    for (let i = 0; i < SQUARES; i++) {
      const u = r3(got[k][i]);
      if (u <= 0) continue;
      const fl = /** @type {string} */ (flowerAt[i]);
      plan.beds.push({ x: i % PLOT_W, y: Math.floor(i / PLOT_W), flower: fl, units: u });
      plan.by[fl] = r3((plan.by[fl] ?? 0) + u);
      sum += u;
    }
    const wild = r3(Math.max(0, carry[k] * WILD_SHARE - sum));
    if (wild > 0) plan.by.wild = wild;
    plan.wild = wild;
    plan.total = r3(sum + wild);
    out[hives[k].id] = plan;
  }
}

/**
 * The forage plan for every hive in `hives` on `day` in `weather`.
 * @returns {Record<string, HivePlan>}
 */
export function planDay(
  /** @type {State} */ state,
  /** @type {number} */ day,
  /** @type {string} */ weather,
  hives = state.hives.list,
) {
  /** @type {Record<string, HivePlan>} */
  const out = {};
  for (const plot of PLOT_IDS) {
    const here = hives.filter((h) => h.plot === plot);
    if (here.length) planPlot(state, plot, day, weather, here, out);
  }
  return out;
}

/** The day a forecast is about when none is named: today until the bees are out, then tomorrow. */
function nextFlight(/** @type {State} */ state, /** @type {boolean} */ moving) {
  const today = state.clock.day;
  if (state.clock.phase === "morning") return today;
  if (state.clock.phase === "day" && !moving) return today;
  return today + 1;
}

/** The weather known for `day`, or sunny when it is too far off to know. */
function weatherOn(/** @type {State} */ state, /** @type {number} */ day) {
  if (day === state.clock.day) return state.weather.today;
  if (day === state.clock.day + 1) return state.weather.tomorrow;
  return "sunny";
}

/**
 * The plan for every hive on one plot, for a day and weather (by default the
 * next flight and its known weather). For planners that want to look at a
 * whole plot, or at a later day of the year.
 * @param {State} state
 * @param {string} plot
 * @param {{ day?: number, weather?: string }} [opts]
 * @returns {Record<string, HivePlan>}
 */
export function forecastPlot(state, plot, opts = {}) {
  const day = opts.day ?? nextFlight(state, false);
  const weather = opts.weather ?? weatherOn(state, day);
  /** @type {Record<string, HivePlan>} */
  const out = {};
  if (!Object.hasOwn(state.land.plots, plot)) return out;
  planPlot(
    state,
    plot,
    day,
    weather,
    state.hives.list.filter((h) => h.plot === plot),
    out,
  );
  return out;
}

/** The strength a colony has once it is in a spare hive: what came, as far as a skep allows. */
const spareStrength = (/** @type {number} */ n) =>
  Math.max(1, Math.min(Math.floor(n) || 1, HIVES[NEW_HIVE_TYPE].limit));

/**
 * What a split would put in the spare hive and what it would leave behind:
 * half the colony, and half the stores or as much of half as a skep holds.
 * split() and forecast() both read this, so the preview is the split.
 */
function splitOf(/** @type {Hive} */ h) {
  const strength = spareStrength(h.strength / 2);
  const total = totalOf(h.stores);
  const share = total > 0 ? Math.min(0.5, (HIVES[NEW_HIVE_TYPE].jars * NECTAR_PER_JAR) / total) : 0;
  /** @type {Record<string, number>} */
  const stores = {};
  /** @type {Record<string, number>} */
  const kept = {};
  for (const k in h.stores) {
    const v = Math.max(0, Math.floor(h.stores[k] * share * 1000) / 1000);
    if (v > 0) stores[k] = v;
    const left = r3(h.stores[k] - v);
    if (left > 0) kept[k] = left;
  }
  return { strength, stores, kept };
}

/**
 * What a hive will bring home, where it stands or at another square.
 *
 * - `hiveId`: a hive, or null with `at` for a colony that is not standing
 *   yet: a new skep bought there or, with `opts`, a split or a caught swarm.
 * - `at` { plot, x, y }: try it there instead. Whether the square is free is
 *   canPlaceHive's business; the forecast only answers "what if".
 * - `opts.day`, `opts.weather`: by default the next flight (today in the
 *   morning, tomorrow once the bees are out) and the weather known for it.
 * - `opts.settled`: leave out the half day a moved hive loses.
 * - With `hiveId` null: `opts.split` (a hive id) is the colony a split of
 *   that hive would stand there, with its share of the stores, and the hive
 *   it comes out of is counted at what it keeps; `opts.swarm` (a swarm id)
 *   is that swarm caught; `opts.strength` is any strength (as far as a skep
 *   allows) and `opts.stores` what the colony would hold.
 *
 * In the morning this is exactly what startDay will fix for today: the same
 * sharing, the same rounding, the same pouring into the stores. During the
 * day a hive where it stands reads its plan, and only what is still to come
 * is added to what it holds, so nothing is counted twice.
 *
 * Returns { day, weather, hive, plot, x, y, carry, total, wild, by, beds,
 * got, left, room, stored, storesAfter, verdict, moved, settled, others }:
 * `total`, `by` (units by source; "wild" is hedgerow nectar) and `beds` (the
 * squares they come from) are the whole day's flight; `got` is what of it is
 * home already and `left` what is still to come (in the morning, 0 and
 * `total`); `room` is what the hive can still hold and `stored` what of
 * `total` will be in it by the evening; `storesAfter` is its stores by
 * source after the flight and `verdict` the honey they will be; `moved` is
 * true when the half day is in the numbers, and then `settled`
 * { total, by } is the same day without it; `others` lists the other hives
 * whose day changes, as { id, total, was }.
 */
export function forecast(
  /** @type {State} */ state,
  /** @type {number | null} */ hiveId,
  /** @type {{ plot: string, x: number, y: number } | null} */ at = null,
  /** @type {{ day?: number, weather?: string, settled?: boolean, strength?: number, stores?: Record<string, number>, split?: number, swarm?: number }} */ opts = {},
) {
  const real = hiveId ? hiveById(state, hiveId) : null;
  if (hiveId && !real) return null;
  if (!real && !at) return null;
  if (at && !Object.hasOwn(state.land.plots, at.plot)) return null;
  const today = state.clock.day;
  const elsewhere = !!at && (!real || at.plot !== real.plot || at.x !== real.x || at.y !== real.y);
  const day = opts.day ?? nextFlight(state, elsewhere);
  const weather = opts.weather ?? weatherOn(state, day);

  /** @type {Hive} */
  let subject;
  let hives = state.hives.list;
  /** The hive a split comes out of. @type {Hive | undefined} */
  let parent;
  if (!real) {
    const where = /** @type {{ plot: string, x: number, y: number }} */ (at);
    /** @type {Partial<Hive>} */
    let colony = {};
    if (opts.split !== undefined) {
      parent = hiveById(state, opts.split);
      if (!parent) return null;
      const from = parent;
      const half = splitOf(from);
      colony = { strength: half.strength, stores: half.stores, mites: from.mites };
      const rest = { ...from, strength: from.strength - half.strength, stores: half.kept };
      hives = hives.map((h) => (h === from ? rest : h));
    } else if (opts.swarm !== undefined) {
      const sw = state.hives.swarms.find((w) => w.id === opts.swarm);
      if (!sw) return null;
      colony = { strength: spareStrength(sw.strength) };
    } else if (opts.strength !== undefined) colony = { strength: spareStrength(opts.strength) };
    if (opts.stores) colony.stores = { ...opts.stores };
    subject = { ...freshHive(), ...colony, plot: where.plot, x: where.x, y: where.y };
    hives = [...hives, subject];
  } else if (elsewhere && at) {
    // A move happens on the first morning it can: this one, or tomorrow's.
    const moveDay = state.clock.phase === "morning" ? today : today + 1;
    const home = real.moved === today && real.from ? real.from : real;
    const back = home.plot === at.plot && home.x === at.x && home.y === at.y;
    subject = {
      ...real,
      plot: at.plot,
      x: at.x,
      y: at.y,
      moved: back && moveDay === today ? 0 : moveDay,
    };
    hives = hives.map((h) => (h === real ? subject : h));
  } else subject = real;

  const onPlot = (/** @type {Hive[]} */ list, /** @type {string} */ plot) =>
    list.filter((h) => h.plot === plot);
  /** @type {Record<string, HivePlan>} */
  let plans = {};
  const fixed =
    state.clock.phase === "day" && day === today && !elsewhere && opts.weather === undefined;
  if (fixed) plans = state.plan.hives;
  else {
    const penalty = subject.moved === day;
    if (opts.settled && penalty) {
      const calm = { ...subject, moved: 0 };
      hives = hives.map((h) => (h === subject ? calm : h));
      subject = calm;
    }
    planPlot(state, subject.plot, day, weather, onPlot(hives, subject.plot), plans);
  }
  const plan = plans[subject.id] ?? emptyPlan();
  const moved = !fixed && subject.moved === day;

  let settled = null;
  if (moved) {
    const calm = { ...subject, moved: 0 };
    /** @type {Record<string, HivePlan>} */
    const p = {};
    planPlot(
      state,
      subject.plot,
      day,
      weather,
      onPlot(
        hives.map((h) => (h === subject ? calm : h)),
        subject.plot,
      ),
      p,
    );
    settled = { total: p[subject.id].total, by: p[subject.id].by };
  }

  const others = [];
  if (elsewhere) {
    /** @type {Record<string, HivePlan>} */
    const before = {};
    /** @type {Record<string, HivePlan>} */
    const after = { ...plans };
    const touched = new Set([subject.plot]);
    if (real) touched.add(real.plot);
    if (parent) touched.add(parent.plot);
    for (const plot of touched) {
      planPlot(state, plot, day, weather, onPlot(state.hives.list, plot), before);
      if (plot !== subject.plot) planPlot(state, plot, day, weather, onPlot(hives, plot), after);
    }
    for (const h of state.hives.list) {
      if (h === real || !before[h.id] || !after[h.id]) continue;
      if (before[h.id].total !== after[h.id].total)
        others.push({ id: h.id, total: after[h.id].total, was: before[h.id].total });
    }
  }

  // The stores after the flight: poured in by the same code that delivers the day.
  const cap = capacityOf(subject);
  /** @type {Record<string, number>} */
  const storesAfter = { ...subject.stores };
  // A flight that is tomorrow's comes after tonight's supper.
  if (day === today + 1 && state.clock.phase !== "morning")
    take(storesAfter, mealOf(subject, today));
  const room = r3(Math.max(0, cap - totalOf(storesAfter)));
  const rest = stow(storesAfter, cap, dueOf(plan.by, fixed ? state.clock.tick : 0, TICKS_PER_DAY));
  const got = fixed ? subject.today.got : 0;
  return {
    day,
    weather,
    hive: subject.id,
    plot: subject.plot,
    x: subject.x,
    y: subject.y,
    carry: r3(carryOf(subject, day, weather)),
    total: plan.total,
    wild: plan.wild,
    by: plan.by,
    beds: plan.beds,
    got,
    left: r3(rest.got + rest.lost),
    room,
    stored: r3(got + rest.got),
    storesAfter,
    verdict: verdictOf(storesAfter),
    moved,
    settled,
    others,
  };
}

/**
 * True when the next flight would spoil the honey a hive holds now: there is
 * a whole jar of pure honey in it, and unless the jars are taken first, what
 * comes home next (another flower opening, hedgerow nectar once its own has
 * gone over) turns them into a blend or costs them a star.
 */
export function spoils(/** @type {State} */ state, /** @type {number} */ hiveId) {
  const h = hiveById(state, hiveId);
  if (!h || jarsIn(h) < 1) return false;
  const now = verdictOf(h.stores);
  if (now.stars < 1) return false;
  const next = forecast(state, hiveId);
  return !!next && (next.verdict.flower !== now.flower || next.verdict.stars < now.stars);
}

// ---- the flying day ---------------------------------------------------------

/** Decide whether wasps come today, to which weak hive and at which tick. */
function scheduleWasps(/** @type {State} */ s) {
  const { doy } = calendarOf(s.clock.day);
  if (doy < WASP_DOY[0] || doy > WASP_DOY[1]) return null;
  const weak = s.hives.list.filter((h) => h.strength <= WASP_MAX_STRENGTH);
  if (!weak.length) return null;
  if (random(s, "wasps") >= WASP_CHANCE) return null;
  const hive = weak[below(s, "wasps", weak.length)];
  const tick = WASP_WINDOW[0] + below(s, "wasps", WASP_WINDOW[1] - WASP_WINDOW[0] + 1);
  return { hive: hive.id, at: tick };
}

/** startDay's half: fix today's plan for every hive. */
export function planFlight(/** @type {State} */ s) {
  s.plan = {
    day: s.clock.day,
    hives: planDay(s, s.clock.day, s.weather.today),
    wasps: scheduleWasps(s),
  };
}

/** The part of a day's plan that comes home between ticks t0 and t1, by source. */
function dueOf(
  /** @type {Record<string, number>} */ by,
  /** @type {number} */ t0,
  /** @type {number} */ t1,
) {
  /** @type {Record<string, number>} */
  const due = {};
  for (const k in by) {
    const v = r3(r3((by[k] * t1) / TICKS_PER_DAY) - r3((by[k] * t0) / TICKS_PER_DAY));
    if (v > 0) due[k] = v;
  }
  return due;
}

/**
 * Pour a load into `stores` (changed in place), as much of it as fits under
 * `cap`. Returns what went in (`got`, and `by` source) and what did not
 * (`lost`). The day's delivery and the forecast both pour through here.
 */
function stow(
  /** @type {Record<string, number>} */ stores,
  /** @type {number} */ cap,
  /** @type {Record<string, number>} */ due,
) {
  /** @type {Record<string, number>} */
  const by = {};
  let sum = 0;
  for (const k in due) sum += due[k];
  if (sum <= 0) return { got: 0, lost: 0, by };
  const room = Math.max(0, cap - totalOf(stores));
  const keep = sum > room ? room / sum : 1;
  let kept = 0;
  for (const k in due) {
    const v = keep === 1 ? due[k] : Math.floor(due[k] * keep * 1000) / 1000;
    if (v <= 0) continue;
    stores[k] = r3((stores[k] ?? 0) + v);
    by[k] = v;
    kept += v;
  }
  return { got: r3(kept), lost: r3(sum - kept), by };
}

/** Deliver the plan's share for ticks t0..t1 into every hive's stores. */
function deliver(/** @type {State} */ s, /** @type {number} */ t0, /** @type {number} */ t1) {
  if (t1 <= t0) return;
  for (const h of s.hives.list) {
    const p = s.plan.hives[h.id];
    if (!p || p.total <= 0) continue;
    const res = stow(h.stores, capacityOf(h), dueOf(p.by, t0, t1));
    for (const k in res.by) h.today.by[k] = r3((h.today.by[k] ?? 0) + res.by[k]);
    h.today.got = r3(h.today.got + res.got);
    h.today.lost = r3(h.today.lost + res.lost);
  }
}

/** A raid nobody saw off: the wasps carry stores away. */
function raided(/** @type {Hive} */ h, /** @type {GameEvent[]} */ events) {
  const lost = r3(take(h.stores, WASP_LOSS));
  h.raid = null;
  h.today.raided = r3((h.today.raided ?? 0) + lost);
  events.push({ type: "waspsRaided", hive: h.id, lost });
}

/**
 * Fly for up to n ticks. Delivery is split at every tick where something
 * happens, so one big tick and many small ones play out the same; the stretch
 * ends early at the tick wasps arrive.
 */
export function fly(
  /** @type {State} */ s,
  /** @type {number} */ n,
  /** @type {GameEvent[]} */ events,
) {
  const end = Math.min(TICKS_PER_DAY, s.clock.tick + n);
  while (s.clock.tick < end) {
    let stop = end;
    const w = s.plan.wasps;
    if (w && w.at > s.clock.tick && w.at < stop) stop = w.at;
    for (const h of s.hives.list)
      if (h.raid && h.raid.until > s.clock.tick && h.raid.until < stop) stop = h.raid.until;
    deliver(s, s.clock.tick, stop);
    s.clock.tick = stop;
    for (const h of s.hives.list) if (h.raid && h.raid.until <= stop) raided(h, events);
    if (w && w.at === stop) {
      s.plan.wasps = null;
      const h = hiveById(s, w.hive);
      if (h) {
        h.raid = { until: Math.min(TICKS_PER_DAY, stop + WASP_TICKS) };
        events.push({ type: "waspsCame", hive: h.id, until: h.raid.until });
        return;
      }
    }
  }
}

/**
 * A bed was dug up while the bees were out: nobody gathers from it for the
 * rest of the day. What it has already given stays in the hives; deliver()
 * hands out the plan by the tick, so taking the bed's units out of the plan
 * takes exactly the ticks still to come.
 */
export function dropBed(
  /** @type {State} */ s,
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
) {
  for (const h of s.hives.list) {
    if (h.plot !== plot) continue;
    const p = s.plan.hives[h.id];
    if (!p) continue;
    const i = p.beds.findIndex((b) => b.x === x && b.y === y);
    if (i < 0) continue;
    const [bed] = p.beds.splice(i, 1);
    const left = r3((p.by[bed.flower] ?? 0) - bed.units);
    if (left > 0) p.by[bed.flower] = left;
    else delete p.by[bed.flower];
    p.total = r3(Math.max(0, p.total - bed.units));
  }
}

// ---- the night --------------------------------------------------------------

/** A square near the hive where a swarm can hang: free of beds and hives, not water. */
function swarmSpot(/** @type {State} */ s, /** @type {Hive} */ h) {
  const squares = s.land.plots[h.plot].squares;
  const ground = groundOf(h.plot);
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < SQUARES; i++) {
    if (squares[i] || ground[i] === "~") continue;
    const x = i % PLOT_W;
    const y = Math.floor(i / PLOT_W);
    // Nearest first; a tree is where a swarm likes to hang.
    const score = Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) * 2 - (ground[i] === "T" ? 1 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best ?? { x: h.x, y: h.y };
}

/**
 * Sleep, for the hives: swarms nobody caught are gone; every colony eats,
 * may grow, gathers mites, and may build queen cells or swarm. Returns what
 * each colony ate.
 */
export function nightHives(/** @type {State} */ s, /** @type {GameEvent[]} */ events) {
  const day = s.clock.day;
  const cal = calendarOf(day);
  const winter = cal.season === WINTER;
  const growing = cal.season <= SUMMER;
  const talent = talentOf(s);
  for (const sw of s.hives.swarms)
    if (sw.day <= day) events.push({ type: "swarmLost", swarm: sw.id, strength: sw.strength });
  s.hives.swarms = s.hives.swarms.filter((sw) => sw.day > day);

  const eaten = [];
  for (const h of s.hives.list) {
    // Wasps still at the door when the day ends get in.
    if (h.raid) raided(h, events);
    const meal = h.strength * EAT_PER_STRENGTH;
    const need = mealOf(h, day);
    const gathered = h.today.got + h.today.lost;
    const total = totalOf(h.stores);
    if (total + EPS >= need) {
      take(h.stores, need);
      h.hungry = false;
      eaten.push({ hive: h.id, units: need, hungry: false });
    } else {
      // The first hungry night is a warning; every hungry night after it costs a strength.
      const lost = h.hungry && h.strength > 1 ? 1 : 0;
      h.stores = {};
      h.hungry = true;
      h.strength -= lost;
      eaten.push({ hive: h.id, units: r3(total), hungry: true });
      events.push({ type: "hungry", hive: h.id, strength: h.strength, lost, winter });
    }

    if (
      growing &&
      !h.hungry &&
      h.mites < MITES_STALL &&
      h.strength < limitOf(h) &&
      gathered + EPS >= GROW_FACTOR * meal
    ) {
      h.grow += 1;
      if (h.grow >= (talent.growDays ?? GROW_DAYS)) {
        h.grow = 0;
        h.strength += 1;
        events.push({
          type: "grew",
          hive: h.id,
          strength: h.strength,
          max: h.strength >= limitOf(h),
        });
      }
    }

    if (day >= MITES_FROM_DAY && !winter) {
      const was = h.mites;
      h.mites = Math.min(100, r3(h.mites + MITE_RATE * h.strength * (talent.mites ?? 1)));
      if (was < MITES_SPOTTED && h.mites >= MITES_SPOTTED)
        events.push({ type: "mitesSpotted", hive: h.id, mites: h.mites });
    }
    if (h.mites >= MITES_HARM) {
      // Harm begins the night the mites get this bad, then comes every MITES_HARM_SLEEPS-th sleep.
      h.sick += 1;
      if ((h.sick - 1) % MITES_HARM_SLEEPS === 0 && h.strength > 1) {
        h.strength -= 1;
        events.push({ type: "mitesHarmed", hive: h.id, strength: h.strength });
      }
    } else h.sick = 0;

    // Swarming. A colony that has outgrown its hive raises queen cells; with
    // queen cells it leaves on any night it still has a jar to spare and no
    // honey was taken from it that day. More room (a bigger hive, a split)
    // or the end of the season and the cells are torn down.
    if (h.swarmCells && !crowded(h, day)) h.swarmCells = false;
    if (h.swarmCells) {
      if (h.harvested !== day && totalOf(h.stores) + EPS >= NECTAR_PER_JAR) {
        const lost = Math.floor(h.strength / 2);
        h.strength -= lost;
        h.swarmCells = false;
        const spot = swarmSpot(s, h);
        const swarm = {
          id: s.meta.nextId++,
          plot: h.plot,
          x: spot.x,
          y: spot.y,
          strength: lost,
          day: day + 1,
          from: h.id,
        };
        s.hives.swarms.push(swarm);
        events.push({ type: "swarmed", hive: h.id, strength: h.strength, swarm: { ...swarm } });
      }
    } else if (cellsDue(h, day)) {
      h.swarmCells = true;
      h.swarmYear = cal.year;
      events.push({ type: "queenCells", hive: h.id });
    }

    h.today = freshToday();
    h.moved = 0;
    h.from = null;
  }
  return eaten;
}

// ---- actions ----------------------------------------------------------------

/** Stand a new hive on a square. The caller has checked the square. @returns {Hive} */
function standHive(
  /** @type {State} */ s,
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {Partial<Hive>} */ fields,
) {
  const hive = { ...freshHive(), ...fields, id: s.meta.nextId++, plot, x, y };
  s.hives.list.push(hive);
  s.land.plots[plot].squares[at(x, y)] = { t: "hive", id: hive.id };
  return hive;
}

/** The first hive of a new game: a free skep with a colony already settled. @returns {Hive} */
export function firstHive(
  /** @type {number} */ id,
  /** @type {{ plot: string, x: number, y: number }} */ where,
  /** @type {number} */ strength,
) {
  return { ...freshHive(), id, plot: where.plot, x: where.x, y: where.y, strength };
}

/** buyHive { plot, x, y }: a skep with a small colony. */
export function buyHive(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const ok = canPlaceHive(s, a.plot, a.x, a.y);
  if (ok !== true) return ok;
  const cost = hiveCost(s);
  if (s.purse.coins < cost) return "no-coins";
  spend(s, cost);
  const hive = standHive(s, a.plot, a.x, a.y, {});
  events.push({
    type: "hiveBought",
    hive: hive.id,
    plot: a.plot,
    x: a.x,
    y: a.y,
    cost,
    hives: s.hives.list.length,
  });
}

/** moveHive { hive, plot, x, y }: mornings only. It flies at half strength today, unless it goes back where it woke. */
export function moveHive(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "morning") return "not-morning";
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  if (h.plot === a.plot && h.x === a.x && h.y === a.y) return "same-square";
  const ok = canPlaceHive(s, a.plot, a.x, a.y, h.id);
  if (ok !== true) return ok;
  const day = s.clock.day;
  const was = { plot: h.plot, x: h.x, y: h.y };
  const home = h.moved === day && h.from ? h.from : was;
  s.land.plots[h.plot].squares[at(h.x, h.y)] = null;
  s.land.plots[a.plot].squares[at(a.x, a.y)] = { t: "hive", id: h.id };
  h.plot = a.plot;
  h.x = a.x;
  h.y = a.y;
  const back = home.plot === a.plot && home.x === a.x && home.y === a.y;
  h.moved = back ? 0 : day;
  h.from = back ? null : home;
  events.push({
    type: "hiveMoved",
    hive: h.id,
    from: was,
    to: { plot: a.plot, x: a.x, y: a.y },
    half: !back,
  });
}

// Why each kind of care cannot be given, or null when it can. The handlers and
// careOf() both ask here, so the hive sheet's greyed-out buttons are the rules.

function whyUpgrade(/** @type {State} */ s, /** @type {Hive} */ h) {
  const up = upgradeOf(h);
  if (!up) return "top-hive";
  if (s.purse.coins < up.cost) return "no-coins";
  return null;
}

function whyHarvest(/** @type {Hive} */ h, /** @type {any} */ k) {
  if (!isInt(k, 1)) return "bad-args";
  if (k > jarsIn(h) || !verdictOf(h.stores).product) return "no-jars";
  return null;
}

function whyFeed(/** @type {State} */ s, /** @type {Hive} */ h, /** @type {any} */ n) {
  if (!isInt(n, 1)) return "bad-args";
  if (s.stock.syrup < n) return "no-syrup";
  if (totalOf(h.stores) + n * SYRUP_UNITS > capacityOf(h) + EPS) return "hive-full";
  return null;
}

function whyDust(/** @type {State} */ s, /** @type {Hive} */ h) {
  if (h.mites <= 0) return "no-mites";
  if (h.dusted === s.clock.day) return "already-dusted";
  return null;
}

function whyRemedy(/** @type {State} */ s, /** @type {Hive} */ h) {
  if (s.stock.remedy < 1) return "no-remedy";
  if (h.mites <= 0) return "no-mites";
  return null;
}

function whySplit(/** @type {State} */ s, /** @type {Hive} */ h) {
  if (s.clock.phase !== "morning") return "not-morning";
  if (h.strength < SPLIT_MIN_STRENGTH) return "too-weak";
  if (s.hives.spare < 1) return "no-spare";
  return null;
}

function whyFend(/** @type {State} */ s, /** @type {Hive} */ h) {
  if (s.clock.phase !== "day") return "not-day";
  if (!h.raid) return "no-raid";
  return null;
}

/**
 * Why no square anywhere could take a hive (`moving`: one being moved, which
 * may stay on its own full plot), or null when some square could.
 */
function whyNoRoom(/** @type {State} */ s, moving = 0) {
  let why = "square-taken";
  for (const plot of PLOT_IDS) {
    if (!s.land.plots[plot].owned) continue;
    for (let i = 0; i < SQUARES; i++) {
      const ok = canPlaceHive(s, plot, i % PLOT_W, Math.floor(i / PLOT_W), moving);
      if (ok === true) return null;
      if (ok === "plot-full") why = ok;
    }
  }
  return why;
}

/**
 * What can be done for a hive right now: for each kind of care, `true` or the
 * `why` code step() would refuse it with. `harvest` and `feed` are asked for
 * one jar and one portion. `split` and `move` say whether the action could go
 * ahead on some square (which one is canPlaceHive's business): when no square
 * anywhere is free they are "plot-full" (every plot has its four hives) or
 * "square-taken". An unknown hive is "no-hive" all round.
 * @returns {{ harvest: true | string, feed: true | string, dust: true | string, remedy: true | string, upgrade: true | string, split: true | string, move: true | string, fendWasps: true | string }}
 */
export function careOf(/** @type {State} */ state, /** @type {number} */ hiveId) {
  const h = hiveById(state, hiveId);
  const say = (/** @type {string | null} */ why) => why ?? true;
  if (!h) {
    const no = "no-hive";
    return {
      harvest: no,
      feed: no,
      dust: no,
      remedy: no,
      upgrade: no,
      split: no,
      move: no,
      fendWasps: no,
    };
  }
  return {
    harvest: say(whyHarvest(h, 1)),
    feed: say(whyFeed(state, h, 1)),
    dust: say(whyDust(state, h)),
    remedy: say(whyRemedy(state, h)),
    upgrade: say(whyUpgrade(state, h)),
    split: say(whySplit(state, h) ?? whyNoRoom(state)),
    move: say(state.clock.phase !== "morning" ? "not-morning" : whyNoRoom(state, h.id)),
    fendWasps: say(whyFend(state, h)),
  };
}

/** The number a hive goes by on screen: its place in `hives.list`, counted from 1 (0 for no such hive). */
export const hiveNumber = (/** @type {State} */ state, /** @type {number} */ hiveId) =>
  state.hives.list.findIndex((h) => h.id === hiveId) + 1;

/** The hive type a purchase (or a split, or a caught swarm) gives. */
export const newHiveType = (/** @type {State} */ state) => NEW_HIVE_TYPE;

/**
 * Whether a new hive could be bought now: true, or "plot-full" (every plot
 * owned has its four hives), "square-taken" (no free ground) or "no-coins".
 * @returns {true | string}
 */
export function canBuyHive(/** @type {State} */ state) {
  return whyNoRoom(state) ?? (state.purse.coins < hiveCost(state) ? "no-coins" : true);
}

/**
 * Whether a hanging swarm could be caught now: true, or "no-swarm",
 * "no-spare", "plot-full" or "square-taken".
 * @returns {true | string}
 */
export function canCatchSwarm(/** @type {State} */ state, /** @type {number} */ swarmId) {
  if (!state.hives.swarms.some((w) => w.id === swarmId)) return "no-swarm";
  if (state.hives.spare < 1) return "no-spare";
  return whyNoRoom(state) ?? true;
}

/** upgradeHive { hive }: the next hive up. Colony and stores move in as they are. */
export function upgradeHive(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const why = whyUpgrade(s, h);
  if (why) return why;
  const up = /** @type {NonNullable<ReturnType<typeof upgradeOf>>} */ (upgradeOf(h));
  spend(s, up.cost);
  h.type = up.type;
  // Room at last: the queen cells come down.
  if (h.strength < limitOf(h)) h.swarmCells = false;
  events.push({
    type: "hiveUpgraded",
    hive: h.id,
    hiveType: up.type,
    cost: up.cost,
    rank: HIVE_IDS.indexOf(up.type),
  });
}

/** harvest { hive, jars }: jars identical jars, taken from every source in proportion. */
export function harvest(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const k = a.jars === undefined ? 1 : a.jars;
  const why = whyHarvest(h, k);
  if (why) return why;
  const v = verdictOf(h.stores);
  take(h.stores, k * NECTAR_PER_JAR);
  h.harvested = s.clock.day;
  bump(s.stock.honey, /** @type {string} */ (v.product).slice("honey:".length), k);
  s.stock.waxBits += k;
  const wax = Math.floor(s.stock.waxBits / JARS_PER_WAX);
  s.stock.waxBits -= wax * JARS_PER_WAX;
  s.stock.wax += wax;
  events.push({
    type: "harvested",
    hive: h.id,
    jars: k,
    product: v.product,
    flower: v.flower,
    stars: v.stars,
    purity: v.purity,
    wax,
  });
}

/** feed { hive, n }: n portions of syrup from stock into the hive. */
export function feed(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const n = a.n === undefined ? 1 : a.n;
  const why = whyFeed(s, h, n);
  if (why) return why;
  const units = n * SYRUP_UNITS;
  s.stock.syrup -= n;
  h.stores.syrup = r3((h.stores.syrup ?? 0) + units);
  events.push({ type: "fed", hive: h.id, n, units });
}

/** dust { hive }: sugar dusting, free, once a day for each hive. */
export function dust(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const why = whyDust(s, h);
  if (why) return why;
  h.dusted = s.clock.day;
  h.mites = r3(Math.max(0, h.mites - DUST_MITES));
  events.push({ type: "dusted", hive: h.id, mites: h.mites });
}

/** remedy { hive }: a thyme remedy from stock. */
export function remedy(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const why = whyRemedy(s, h);
  if (why) return why;
  s.stock.remedy -= 1;
  h.mites = r3(Math.max(0, h.mites - REMEDY_MITES));
  events.push({ type: "remedied", hive: h.id, mites: h.mites });
}

/** A spare hive becomes a skep at (x, y), holding as much of `strength` as a skep allows. */
function fillSpare(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {number} */ strength,
  /** @type {Partial<Hive>} */ fields,
) {
  s.hives.spare -= 1;
  return standHive(s, a.plot, a.x, a.y, {
    ...fields,
    type: NEW_HIVE_TYPE,
    strength: spareStrength(strength),
  });
}

/**
 * split { hive, plot, x, y }: mornings; half the colony and half the stores
 * go into a spare hive. Both halves are settled for the year: no queen cells.
 */
export function split(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "morning") return "not-morning";
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const why = whySplit(s, h);
  if (why) return why;
  const ok = canPlaceHive(s, a.plot, a.x, a.y);
  if (ok !== true) return ok;
  const half = splitOf(h);
  const year = calendarOf(s.clock.day).year;
  const young = fillSpare(s, a, half.strength, {
    stores: half.stores,
    mites: h.mites,
    swarmYear: year,
  });
  h.strength -= young.strength;
  h.stores = half.kept;
  h.swarmCells = false;
  h.swarmYear = year;
  events.push({
    type: "split",
    hive: h.id,
    strength: h.strength,
    made: young.id,
    madeStrength: young.strength,
    plot: a.plot,
    x: a.x,
    y: a.y,
    hives: s.hives.list.length,
  });
}

/** catchSwarm { swarm, plot, x, y }: a hanging swarm goes into a spare hive on a square you choose. */
export function catchSwarm(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const sw = s.hives.swarms.find((w) => w.id === a.swarm);
  if (!sw) return "no-swarm";
  if (s.hives.spare < 1) return "no-spare";
  const ok = canPlaceHive(s, a.plot, a.x, a.y);
  if (ok !== true) return ok;
  const hive = fillSpare(s, a, sw.strength, { swarmYear: calendarOf(s.clock.day).year });
  s.hives.swarms = s.hives.swarms.filter((w) => w !== sw);
  events.push({
    type: "swarmCaught",
    swarm: sw.id,
    hive: hive.id,
    strength: hive.strength,
    plot: a.plot,
    x: a.x,
    y: a.y,
    hives: s.hives.list.length,
  });
}

/** fendWasps { hive }: narrow the entrance while the wasps are at the door. */
export function fendWasps(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "day") return "not-day";
  const h = hiveById(s, a.hive);
  if (!h) return "no-hive";
  const why = whyFend(s, h);
  if (why) return why;
  h.raid = null;
  events.push({ type: "waspsFended", hive: h.id });
}
