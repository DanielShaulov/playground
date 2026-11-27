// @ts-check
/**
 * The land: four plots of 6 × 6 squares, what stands on them, what may be
 * planted where, and which squares a hive reaches.
 */

import { PLOTS, PLOT_IDS, TERRAIN, START } from "../content/plots.js";
import { FLOWERS } from "../content/flowers.js";
import {
  PLOT_W,
  PLOT_H,
  NEAR,
  FAR,
  WATER_RANGE,
  HIVES_PER_PLOT,
  WILD_BEDS,
  WILD_FLOWERS,
  YEAR_DAYS,
  SEASON_DAYS,
} from "../content/tuning.js";
import { stageOf, calendarOf } from "./calendar.js";
import { dropBed } from "./hives.js";
import { unlockBy } from "./progress.js";
import { isInt, spend, bump, drop } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("./types.js").Bed} Bed */

export const SQUARES = PLOT_W * PLOT_H;

/** Index of a square in a plot's `squares`. */
export const at = (/** @type {number} */ x, /** @type {number} */ y) => y * PLOT_W + x;
const inside = (/** @type {any} */ x, /** @type {any} */ y) =>
  isInt(x, 0, PLOT_W - 1) && isInt(y, 0, PLOT_H - 1);
const isPlot = (/** @type {any} */ plot) => typeof plot === "string" && Object.hasOwn(PLOTS, plot);

/** Terrain characters of each plot as one 36-character string. */
const GROUND = /** @type {Record<string, string>} */ (
  Object.fromEntries(PLOT_IDS.map((id) => [id, PLOTS[id].terrain.join("")]))
);
/** The terrain characters of a plot, indexed like its squares. For the planner. */
export const groundOf = (/** @type {string} */ plot) => GROUND[plot];

/** "grass" | "hill" | "water" | "rock" | "tree", or null off the map. */
export function terrainAt(
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
) {
  if (!isPlot(plot) || !inside(x, y)) return null;
  return /** @type {string} */ (TERRAIN[GROUND[plot][at(x, y)]]);
}

/** What stands on a square: null, a bed or a hive reference. Null off the map too. */
export function squareAt(
  /** @type {State} */ state,
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
) {
  if (!isPlot(plot) || !inside(x, y)) return null;
  return state.land.plots[plot].squares[at(x, y)] ?? null;
}

/** For every square, the squares a hive standing there reaches, with their weights. */
const REACH = (() => {
  /** @type {{ i: number, x: number, y: number, w: number }[][]} */
  const all = [];
  for (let y = 0; y < PLOT_H; y++)
    for (let x = 0; x < PLOT_W; x++) {
      const list = [];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= PLOT_W || yy >= PLOT_H) continue;
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          list.push({ i: at(xx, yy), x: xx, y: yy, w: ring === 1 ? NEAR : FAR });
        }
      all.push(list);
    }
  return all;
})();

/** The reach of the square at index `i`, shared: do not change it. */
export const reachAt = (/** @type {number} */ i) => REACH[i];

/**
 * The squares a hive at (x, y) reaches: the 8 next to it at weight NEAR and
 * the ring of 16 beyond at FAR, cut off at the plot's edge.
 * @returns {{ x: number, y: number, w: number }[]}
 */
export function reachOf(
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
) {
  if (!isPlot(plot) || !inside(x, y)) return [];
  return REACH[at(x, y)].map(({ x, y, w }) => ({ x, y, w }));
}

/** Per plot and square: is there water within `range` squares (diagonals count)? */
function waterWithin(/** @type {number} */ range) {
  /** @type {Record<string, boolean[]>} */
  const out = {};
  for (const id of PLOT_IDS) {
    const g = GROUND[id];
    out[id] = [];
    for (let y = 0; y < PLOT_H; y++)
      for (let x = 0; x < PLOT_W; x++) {
        let wet = false;
        for (let dy = -range; dy <= range && !wet; dy++)
          for (let dx = -range; dx <= range && !wet; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= PLOT_W || yy >= PLOT_H) continue;
            if (g[at(xx, yy)] === "~") wet = true;
          }
        out[id].push(wet);
      }
  }
  return out;
}
const BESIDE_WATER = waterWithin(1);
const NEAR_WATER = waterWithin(WATER_RANGE);

/** True when a hive at (x, y) is close enough to water for the summer bonus. */
export function nearWater(
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
) {
  return isPlot(plot) && inside(x, y) && NEAR_WATER[plot][at(x, y)];
}

/** True when a flower may be planted at all by this keeper: in the shop, or seed in hand. */
export function flowerOpen(/** @type {State} */ state, /** @type {string} */ flower) {
  return state.progress.unlocked.flowers.includes(flower) || (state.stock.seeds[flower] ?? 0) > 0;
}

/**
 * The plots with at least one square `flower` could ever stand on, by the
 * ground alone (owned or not, taken or not): hill ground for thyme and
 * heather, a square beside water for mint, the orchard's trees for apple
 * blossom, any grass or hill for the rest. Unknown flowers grow nowhere.
 * @returns {string[]}
 */
export function whereGrows(/** @type {State} */ state, /** @type {string} */ flower) {
  if (typeof flower !== "string" || !Object.hasOwn(FLOWERS, flower)) return [];
  const where = FLOWERS[flower].where;
  return PLOT_IDS.filter((id) => {
    const g = GROUND[id];
    for (let i = 0; i < SQUARES; i++) {
      const open = g[i] === "." || g[i] === "h";
      if (
        where === "tree"
          ? g[i] === "T"
          : where === "hill"
            ? g[i] === "h"
            : where === "water"
              ? open && BESIDE_WATER[id][i]
              : open
      )
        return true;
    }
    return false;
  });
}

/** Why a square cannot take a bed or a hive, or null when it can. */
function groundWhy(
  /** @type {State} */ state,
  /** @type {any} */ plot,
  /** @type {any} */ x,
  /** @type {any} */ y,
) {
  if (!isPlot(plot)) return "no-plot";
  if (!inside(x, y)) return "off-plot";
  if (!state.land.plots[plot].owned) return "not-owned";
  const g = GROUND[plot][at(x, y)];
  if (g !== "." && g !== "h") return "bad-ground";
  if (state.land.plots[plot].squares[at(x, y)]) return "square-taken";
  return null;
}

/**
 * Whether `flower` can be planted at (x, y): true, or the `why` code step()
 * would reject with. Coins are not looked at here.
 * @returns {true | string}
 */
export function canPlant(
  /** @type {State} */ state,
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {string} */ flower,
) {
  if (typeof flower !== "string" || !Object.hasOwn(FLOWERS, flower)) return "no-flower";
  const f = FLOWERS[flower];
  if (f.where === "tree") return "not-plantable";
  const why = groundWhy(state, plot, x, y);
  if (why) return why;
  if (f.where === "hill" && GROUND[plot][at(x, y)] !== "h") return "needs-hill";
  if (f.where === "water" && !BESIDE_WATER[plot][at(x, y)]) return "needs-water";
  if (!flowerOpen(state, flower)) return "flower-locked";
  return true;
}

/**
 * Whether a hive can stand at (x, y): true, or a `why` code. `moving` is the
 * id of a hive being moved, which does not count against its own plot.
 * @returns {true | string}
 */
export function canPlaceHive(
  /** @type {State} */ state,
  /** @type {string} */ plot,
  /** @type {number} */ x,
  /** @type {number} */ y,
  /** @type {number} */ moving = 0,
) {
  const why = groundWhy(state, plot, x, y);
  if (why) return why;
  let here = 0;
  for (const h of state.hives.list) if (h.plot === plot && h.id !== moving) here++;
  if (here >= HIVES_PER_PLOT) return "plot-full";
  return true;
}

/** plant { plot, x, y, flower }: a seed from stock if there is one, else bought at the seed price. */
export function plant(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const ok = canPlant(s, a.plot, a.x, a.y, a.flower);
  if (ok !== true) return ok;
  const price = FLOWERS[a.flower].seed ?? 0;
  const fromStock = (s.stock.seeds[a.flower] ?? 0) > 0;
  if (fromStock) drop(s.stock.seeds, a.flower);
  else {
    if (s.purse.coins < price) return "no-coins";
    spend(s, price);
  }
  s.land.plots[a.plot].squares[at(a.x, a.y)] = {
    t: "bed",
    flower: a.flower,
    planted: s.clock.day,
    picked: 0,
  };
  events.push({
    type: "planted",
    plot: a.plot,
    x: a.x,
    y: a.y,
    flower: a.flower,
    cost: fromStock ? 0 : price,
  });
}

/** The bed at (x, y), or a `why` code. */
function bedAt(/** @type {State} */ s, /** @type {Action} */ a) {
  if (!isPlot(a.plot)) return "no-plot";
  if (!inside(a.x, a.y)) return "off-plot";
  const sq = s.land.plots[a.plot].squares[at(a.x, a.y)];
  if (!sq || sq.t !== "bed") return "no-bed";
  return sq;
}

/** dig { plot, x, y }: free, and nothing comes back. */
export function dig(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const bed = bedAt(s, a);
  if (typeof bed === "string") return bed;
  s.land.plots[a.plot].squares[at(a.x, a.y)] = null;
  if (s.clock.phase === "day") dropBed(s, a.plot, a.x, a.y);
  events.push({ type: "dug", plot: a.plot, x: a.x, y: a.y, flower: bed.flower });
}

/** pickBunch { plot, x, y }: in the morning, once a year per bed; the bed gives no nectar today. */
export function pickBunch(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.clock.phase !== "morning") return "not-morning";
  const bed = bedAt(s, a);
  if (typeof bed === "string") return bed;
  if (!FLOWERS[bed.flower]?.bunch) return "no-bunch";
  if (stageOf(s, bed) !== "bloom") return "not-blooming";
  if (bed.picked && calendarOf(bed.picked).year === calendarOf(s.clock.day).year)
    return "already-picked";
  bed.picked = s.clock.day;
  bump(s.stock.bunches, bed.flower);
  events.push({ type: "picked", plot: a.plot, x: a.x, y: a.y, flower: bed.flower });
}

/**
 * Whether a plot can be bought now: true, or the `why` code step() would
 * refuse with ("no-plot", "owned", "no-coins").
 * @returns {true | string}
 */
export function canBuyPlot(/** @type {State} */ state, /** @type {any} */ plot) {
  if (!isPlot(plot)) return "no-plot";
  if (state.land.plots[plot].owned) return "owned";
  if (state.purse.coins < PLOTS[plot].price) return "no-coins";
  return true;
}

/** buyPlot { plot } */
export function buyPlot(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const ok = canBuyPlot(s, a.plot);
  if (ok !== true) return ok;
  const plot = s.land.plots[a.plot];
  const price = PLOTS[a.plot].price;
  spend(s, price);
  plot.owned = true;
  events.push({ type: "plotBought", plot: a.plot, price });
  unlockBy(s, "plot", a.plot, events);
}

/** A new game's land: every plot empty, the Home Meadow owned with its wild beds. */
export function freshLand() {
  /** @type {import("./types.js").LandSlice} */
  const land = { plots: {} };
  for (const id of PLOT_IDS)
    land.plots[id] = { owned: PLOTS[id].price === 0, squares: Array(SQUARES).fill(null) };
  for (const [x, y] of START.wild) land.plots.home.squares[at(x, y)] = wildBed(0);
  return land;
}

/** @returns {Bed} */
function wildBed(/** @type {number} */ planted, flower = WILD_FLOWERS[0]) {
  return { t: "bed", flower: /** @type {string} */ (flower), planted, picked: 0, wild: true };
}

/**
 * The first morning of spring, summer and autumn: a Home Meadow with fewer
 * than WILD_BEDS beds of any kind grows that season's wild flower (dandelion,
 * clover, ivy), on the squares the first dandelions grew on and then wherever
 * there is grass. `day` is the new day; the beds are full grown at once.
 */
export function rewild(
  /** @type {State} */ s,
  /** @type {number} */ day,
  /** @type {GameEvent[]} */ events,
) {
  const flower = WILD_FLOWERS[Math.floor(((day - 1) % YEAR_DAYS) / SEASON_DAYS)];
  if (!flower) return;
  const squares = s.land.plots.home.squares;
  let beds = 0;
  for (const sq of squares) if (sq && sq.t === "bed") beds++;
  if (beds >= WILD_BEDS) return;
  const order = START.wild.map(([x, y]) => at(x, y));
  for (let i = 0; i < SQUARES; i++) if (!order.includes(i)) order.push(i);
  const grown = [];
  for (const i of order) {
    if (beds >= WILD_BEDS) break;
    if (squares[i] || GROUND.home[i] !== ".") continue;
    squares[i] = wildBed(day - 1, flower);
    grown.push({ x: i % PLOT_W, y: Math.floor(i / PLOT_W) });
    beds++;
  }
  if (grown.length) events.push({ type: "wildflowers", plot: "home", flower, squares: grown });
}
