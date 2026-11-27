// @ts-check
/**
 * The game state: one JSON-safe object made of slices, each with its own
 * defaults. A new system registers its slice with one line in SLICES.
 *
 * loadSave() fills any slice a save is missing, and any field inside a slice
 * (and inside each hive), from these defaults, so a later build can add a
 * field without breaking a save. tests/honey-hollow/core/fixtures/ holds
 * saves every build must load as they are.
 */

import { START_COINS, START_HIVE_STRENGTH, YEAR_DAYS } from "../content/tuning.js";
import { TIERS } from "../content/goals.js";
import { TALENTS } from "../content/talents.js";
import { PLOT_IDS, START } from "../content/plots.js";
import { HIVES } from "../content/hives.js";
import { DEFAULT_LOOK } from "../content/wardrobe.js";
import { freshLand, SQUARES, at } from "./land.js";
import {
  freshHive,
  freshPlan,
  firstHive,
  freshToday,
  limitOf,
  capacityOf,
  totalOf,
} from "./hives.js";
import { freshProgress } from "./progress.js";
import { reconcile } from "./book.js";
import { isObj, isInt } from "./util.js";

/** @typedef {import("./types.js").State} State */

/** Slice name → fresh defaults. Order is the order keys appear in a save. */
export const SLICES = {
  meta: () => ({ v: 1, seed: 0, nextId: 1, rng: {} }),
  clock: () => ({ day: 1, phase: "morning", tick: 0 }),
  weather: () => ({ today: "sunny", tomorrow: "sunny" }),
  keeper: () => ({ made: false, name: "", ...DEFAULT_LOOK, talent: "" }),
  wardrobe: () => ({ owned: [] }),
  purse: () => ({ coins: START_COINS, today: { earned: 0, spent: 0 } }),
  land: freshLand,
  hives: () => ({ list: [], spare: 0, swarms: [] }),
  plan: freshPlan,
  stock: () => ({
    honey: {},
    wax: 0,
    waxBits: 0,
    bunches: {},
    goods: {},
    seeds: {},
    remedy: 0,
    syrup: 0,
  }),
  market: () => ({
    day: 0,
    mood: {},
    glut: {},
    queue: [],
    at: 0,
    open: false,
    show: null,
    fair: false,
  }),
  regulars: () => ({ hearts: {}, gifts: {} }),
  workshop: () => ({ made: { day: 0, n: 0 } }),
  progress: freshProgress,
  book: () => ({ facts: [], unread: [], fired: [] }),
};

/** @returns {State} */
function defaults() {
  const s = /** @type {any} */ ({});
  for (const [name, make] of Object.entries(SLICES)) s[name] = make();
  return s;
}

/**
 * A fresh game on the morning of day 1: sunny today and tomorrow, 20 coins,
 * the Home Meadow with six wild dandelion beds and one free skep that reaches
 * them all. The keeper is not made yet; until createKeeper nothing else is
 * accepted.
 */
export function newGame(seed = 1) {
  const s = defaults();
  s.meta.seed = seed | 0;
  const hive = firstHive(s.meta.nextId++, START.hive, START_HIVE_STRENGTH);
  s.hives.list.push(hive);
  s.land.plots[hive.plot].squares[at(hive.x, hive.y)] = { t: "hive", id: hive.id };
  return s;
}

/**
 * Fill what `saved` is missing from `fresh`, one level at a time: a field the
 * defaults have as a plain object is filled the same way; anything else is
 * taken from the save as it is.
 */
function fill(/** @type {any} */ fresh, /** @type {any} */ saved) {
  if (!isObj(saved)) return fresh;
  const out = { ...fresh, ...saved };
  for (const k of Object.keys(fresh))
    if (isObj(fresh[k])) out[k] = fill(fresh[k], saved[k]);
    else if (Array.isArray(fresh[k]) && !Array.isArray(saved[k])) out[k] = fresh[k];
  return out;
}

/**
 * Turn whatever was saved into a playable state, or null to start fresh.
 * Missing slices and missing fields take their defaults. Only something that
 * was never a Honey Hollow save (or is broken beyond playing) returns null.
 * @returns {State | null}
 */
export function loadSave(/** @type {any} */ raw) {
  if (!isObj(raw) || !isObj(raw.meta) || !isObj(raw.clock) || !isObj(raw.land) || !isObj(raw.hives))
    return null;
  const s = /** @type {any} */ ({});
  for (const [name, make] of Object.entries(SLICES)) s[name] = fill(make(), raw[name]);

  if (!isInt(s.clock.day, 1) || !["morning", "day", "evening"].includes(s.clock.phase)) return null;
  if (!isInt(s.clock.tick, 0) || !isInt(s.meta.nextId, 1) || !isInt(s.purse.coins, 0)) return null;

  // Land: every plot present, 36 squares each.
  for (const id of PLOT_IDS) {
    const plot = s.land.plots[id];
    if (!isObj(plot) || !Array.isArray(plot.squares) || plot.squares.length !== SQUARES)
      return null;
    plot.owned = !!plot.owned;
  }
  s.land.plots.home.owned = true;

  // Hives: each filled from a fresh hive, and standing where the land says.
  if (!Array.isArray(s.hives.list) || !s.hives.list.length) return null;
  s.hives.list = s.hives.list.map((/** @type {any} */ h) => fill(freshHive(), h));
  for (const h of s.hives.list) {
    if (!Object.hasOwn(HIVES, h.type) || !Object.hasOwn(s.land.plots, h.plot)) return null;
    if (!isInt(h.x, 0, 5) || !isInt(h.y, 0, 5) || !isInt(h.id, 1)) return null;
    const sq = s.land.plots[h.plot].squares[at(h.x, h.y)];
    if (!sq || sq.t !== "hive" || sq.id !== h.id) return null;
    if (!isObj(h.today)) h.today = freshToday();
  }
  if (!Array.isArray(s.hives.swarms)) s.hives.swarms = [];
  // Ids never repeat: the counter stays ahead of every id the save holds.
  let top = 0;
  for (const h of s.hives.list) top = Math.max(top, h.id);
  for (const w of s.hives.swarms) if (isInt(w?.id, 1)) top = Math.max(top, w.id);
  if (Array.isArray(s.market.queue))
    for (const c of s.market.queue) if (isInt(c?.id, 1)) top = Math.max(top, c.id);
  if (s.meta.nextId <= top) s.meta.nextId = top + 1;
  // A save that lost a field may disagree with itself: bring it back inside
  // the rules. A whole save is left exactly as it was.
  if (!(s.progress.renown >= 0)) s.progress.renown = 0;
  s.progress.tier = TIERS.filter((t) => s.progress.renown >= t.renown).length - 1;
  if (s.keeper.made && !Object.hasOwn(TALENTS, s.keeper.talent)) s.keeper.made = false;
  const year = Math.floor((s.clock.day - 1) / YEAR_DAYS) + 1;
  for (const h of s.hives.list) {
    h.strength = Math.min(isInt(h.strength, 1) ? h.strength : 1, limitOf(h));
    const total = totalOf(h.stores);
    const cap = capacityOf(h);
    if (total > cap + 1e-6)
      for (const k of Object.keys(h.stores))
        h.stores[k] = Math.floor((h.stores[k] * cap * 1000) / total) / 1000;
    if (!isInt(h.harvested, 0, s.clock.day)) h.harvested = 0;
    if (!isInt(h.swarmYear, 0, year)) h.swarmYear = 0;
  }

  reconcile(s);
  return s;
}
