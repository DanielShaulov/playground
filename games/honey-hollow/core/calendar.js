// @ts-check
/**
 * The calendar: seasons, weather, bloom windows and stages, and the three
 * actions that move time: startDay, tick and sleep. Time only moves when one
 * of those is dispatched; nothing here knows what the real time is.
 */

import {
  SEASON_DAYS,
  SEASONS,
  YEAR_DAYS,
  TICKS_PER_DAY,
  FLIGHT,
  WINDY_HILL_FLIGHT,
  WEATHER_ODDS,
  SUNNY_START_DAYS,
  SHOW_DOY,
  FAIR_DOY,
  TREE_FRUIT_DOY,
} from "../content/tuning.js";
import { FLOWERS, FLOWER_IDS } from "../content/flowers.js";
import { PLOT_IDS } from "../content/plots.js";
import { talentOf } from "./keeper.js";
import { weighted } from "./rng.js";
import { planFlight, fly, nightHives, attentionOf, freshPlan, spoils } from "./hives.js";
import { setStall, closeStall, nightMarket } from "./market.js";
import { rewild, groundOf } from "./land.js";
import { endYear, freshDay } from "./progress.js";
import { isInt } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("./types.js").Stage} Stage */

const WINTER = 3;
/** The last day of the year the bees fly, and so the last a flower can bloom. */
export const LAST_FLYING_DOY = WINTER * SEASON_DAYS - 1;

/**
 * Where a day falls in the year. Day 1 is spring day 1 of year 1.
 * `season` is 0–3, `doy` (day of year) 0–27, `dayOfSeason` 1–7.
 */
export function calendarOf(/** @type {number} */ day) {
  const d = Math.max(1, Math.floor(day) || 1) - 1;
  const doy = d % YEAR_DAYS;
  const season = Math.floor(doy / SEASON_DAYS);
  return {
    day: d + 1,
    year: Math.floor(d / YEAR_DAYS) + 1,
    doy,
    season,
    seasonName: SEASONS[season],
    dayOfSeason: (doy % SEASON_DAYS) + 1,
  };
}

/** The first and last day of the year a flower blooms for this keeper, or null. */
export function bloomWindow(/** @type {State} */ state, /** @type {string} */ flower) {
  if (typeof flower !== "string" || !Object.hasOwn(FLOWERS, flower)) return null;
  const f = FLOWERS[flower];
  return { from: f.from, to: Math.min(LAST_FLYING_DOY, f.to + (talentOf(state).bloomDays ?? 0)) };
}

/** True when `flower` is in its window on `day`. Winter never blooms. */
export function inBloom(
  /** @type {State} */ state,
  /** @type {string} */ flower,
  /** @type {number} */ day,
) {
  const w = bloomWindow(state, flower);
  if (!w) return false;
  const { doy } = calendarOf(day);
  return doy >= w.from && doy <= w.to;
}

/**
 * How a bed (or an orchard tree: pass { flower: "apple" }) looks and behaves
 * on `day`: seed (planted today), leaf (before its window), bud (it opens
 * tomorrow), bloom, faded (after its window) or dormant (winter).
 * @returns {Stage}
 */
export function stageOf(
  /** @type {State} */ state,
  /** @type {{ flower: string, planted?: number }} */ bed,
  day = state.clock.day,
) {
  const w = bloomWindow(state, bed.flower);
  if (!w) return "leaf";
  if (bed.planted !== undefined && bed.planted >= day) return "seed";
  const { doy, season } = calendarOf(day);
  if (season === WINTER) return "dormant";
  if (doy < w.from - 1) return "leaf";
  if (doy === w.from - 1) return "bud";
  if (doy <= w.to) return "bloom";
  return "faded";
}

/** How much of a full day's flying `weather` allows on `plot`. */
export function flightFor(/** @type {string} */ weather, /** @type {string} */ plot) {
  if (weather === "windy" && plot === "hill") return WINDY_HILL_FLIGHT;
  return FLIGHT[weather] ?? 0;
}

/** Today's flight on a plot (0–1), before any hive's own bonuses. */
export function flightOf(/** @type {State} */ state, /** @type {string} */ plot) {
  return flightFor(state.weather.today, plot);
}

/** Whether the bees fly today on `plot`: never in winter, nor in weather that keeps them in. */
export function fliesToday(/** @type {State} */ state, /** @type {string} */ plot) {
  return calendarOf(state.clock.day).season !== WINTER && flightOf(state, plot) > 0;
}

/**
 * How the orchard's apple trees look on `day`: "bud" the day before the
 * blossom, "bloom" while it lasts, "fruit" from late summer to the end of
 * autumn (TREE_FRUIT_DOY), "dormant" in winter and "leaf" the rest of the year.
 * @returns {"leaf" | "bud" | "bloom" | "fruit" | "dormant"}
 */
export function treeStageOf(/** @type {State} */ state, day = state.clock.day) {
  const stage = stageOf(state, { flower: "apple" }, day);
  if (stage === "bud" || stage === "bloom" || stage === "dormant") return stage;
  const { doy } = calendarOf(day);
  return stage === "faded" && doy >= TREE_FRUIT_DOY[0] && doy <= TREE_FRUIT_DOY[1]
    ? "fruit"
    : "leaf";
}

/** Draw the weather for `day` from the weather stream. */
export function drawWeather(/** @type {State} */ s, /** @type {number} */ day) {
  if (day <= SUNNY_START_DAYS) return "sunny";
  return /** @type {import("./types.js").Weather} */ (
    weighted(s, "weather", WEATHER_ODDS[calendarOf(day).seasonName])
  );
}

/** Enter the evening: the day's takings are in, the stall is set up. */
function endDay(/** @type {State} */ s, /** @type {GameEvent[]} */ events) {
  s.clock.phase = "evening";
  s.clock.tick = TICKS_PER_DAY;
  events.push({
    type: "dayEnded",
    day: s.clock.day,
    hives: s.hives.list.map((h) => ({
      id: h.id,
      got: h.today.got,
      lost: h.today.lost,
      by: { ...h.today.by },
    })),
  });
  setStall(s);
}

/** startDay: fix the forage plan and send the bees out. In winter, straight to the evening. */
export function startDay(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "morning") return "not-morning";
  const cal = calendarOf(s.clock.day);
  const flying = cal.season !== WINTER;
  if (flying) planFlight(s);
  else s.plan = { ...freshPlan(), day: s.clock.day };
  s.clock.phase = "day";
  s.clock.tick = 0;
  events.push({
    type: "dayStarted",
    day: s.clock.day,
    weather: s.weather.today,
    flying,
    plan: s.plan.hives,
  });
  if (!flying) endDay(s, events);
}

/** tick { n }: fly for up to n ticks. Stops early when wasps arrive, so they can be seen off. */
export function tick(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "day") return "not-day";
  const n = a.n === undefined ? 1 : a.n;
  if (!isInt(n, 1)) return "bad-args";
  fly(s, n, events);
  if (s.clock.tick >= TICKS_PER_DAY) endDay(s, events);
}

/** sleep: the colonies eat, grow and may swarm; the weather and the market move on a day. */
export function sleep(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "evening") return "not-evening";
  const day = s.clock.day;
  const cal = calendarOf(day);
  const next = calendarOf(day + 1);
  closeStall(s);
  const eaten = nightHives(s, events);
  s.weather.today = s.weather.tomorrow;
  s.weather.tomorrow = drawWeather(s, day + 2);
  nightMarket(s);
  s.clock.day = day + 1;
  s.clock.phase = "morning";
  s.clock.tick = 0;
  s.plan = freshPlan();
  s.purse.today = { earned: 0, spent: 0 };
  s.progress.today = freshDay();
  events.push({
    type: "slept",
    day,
    eaten,
    weather: s.weather.today,
    tomorrow: s.weather.tomorrow,
  });
  if (next.season !== cal.season) {
    if (next.doy === 0) endYear(s, cal.year, events);
    rewild(s, day + 1, events);
    events.push({ type: "seasonChanged", season: next.seasonName, year: next.year });
  }
}

/** Every flower growing on the keeper's land: beds, and the orchard's trees once owned. */
function flowersGrowing(/** @type {State} */ state) {
  const seen = new Set();
  for (const id of PLOT_IDS) {
    const plot = state.land.plots[id];
    if (!plot.owned) continue;
    for (const sq of plot.squares) if (sq && sq.t === "bed") seen.add(sq.flower);
    if (groundOf(id).includes("T")) seen.add("apple");
  }
  return FLOWER_IDS.filter((f) => seen.has(f));
}

/**
 * The flowers this keeper knows, in the table's order: those whose seed is in
 * the shop or in hand, those growing in a bed on owned land, and apple
 * blossom once the orchard is theirs.
 */
export function flowersKnown(/** @type {State} */ state) {
  const seen = new Set([...state.progress.unlocked.flowers, ...flowersGrowing(state)]);
  for (const f of FLOWER_IDS) if ((state.stock.seeds[f] ?? 0) > 0) seen.add(f);
  return FLOWER_IDS.filter((f) => seen.has(f));
}

/** Days from today to the next day that falls on day-of-year `doy` (0–27): 0 when that is today. */
export function daysUntil(/** @type {State} */ state, /** @type {number} */ doy) {
  return (((doy - calendarOf(state.clock.day).doy) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
}

/**
 * The flowers that bloom alongside `flower` for this keeper, in the table's
 * order, each with the days of the year they share: { flower, from, to, days }.
 * Two of these in one hive's reach make a blend on those days.
 * @returns {{ flower: string, from: number, to: number, days: number }[]}
 */
export function bloomsWith(/** @type {State} */ state, /** @type {string} */ flower) {
  const w = bloomWindow(state, flower);
  const out = [];
  if (!w) return out;
  for (const other of FLOWER_IDS) {
    const o = other === flower ? null : bloomWindow(state, other);
    if (!o) continue;
    const from = Math.max(w.from, o.from);
    const to = Math.min(w.to, o.to);
    if (to >= from) out.push({ flower: other, from, to, days: to - from + 1 });
  }
  return out;
}

/**
 * The night card: what tomorrow brings. Weather; which of the keeper's
 * flowers open tomorrow (`starts`), bloom for the last time tomorrow
 * (`lastDay`) or bloomed for the last time today (`ended`); the hives that
 * want looking at; the hives whose pure honey the next flight would spoil if
 * its jars are not taken first (`spoils`, hive ids; see spoils()); and
 * whether tomorrow evening is the Honey Show or the Fair.
 */
export function tomorrow(/** @type {State} */ state) {
  const day = state.clock.day + 1;
  const { doy, season, seasonName } = calendarOf(day);
  const starts = [];
  const lastDay = [];
  const ended = [];
  if (season !== WINTER || calendarOf(state.clock.day).season !== WINTER)
    for (const f of flowersGrowing(state)) {
      const w = bloomWindow(state, f);
      if (!w) continue;
      if (doy === w.from) starts.push(f);
      if (doy === w.to) lastDay.push(f);
      if (doy === w.to + 1) ended.push(f);
    }
  const hives = [];
  for (const h of state.hives.list) {
    const flags = attentionOf(state, h);
    if (flags.length) hives.push({ id: h.id, flags });
  }
  return {
    day,
    season: seasonName,
    weather: state.weather.tomorrow,
    starts,
    lastDay,
    ended,
    hives,
    spoils: state.hives.list.filter((h) => spoils(state, h.id)).map((h) => h.id),
    show: doy === SHOW_DOY,
    fair: doy === FAIR_DOY,
  };
}
