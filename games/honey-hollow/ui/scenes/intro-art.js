// @ts-check
/**
 * The three pictures of the intro, each put together from the painted pieces
 * (sky, ground, tree, beds, hives, bees, the stall) the way a page of a
 * picture book is: far things small and high, near things large and low.
 * Every page is composed twice, once for a short picture and once for a tall
 * one, and a phone gets whichever is nearer its own height. `page(i, high)`
 * paints one, once, and returns its sprite; its canvas is the picture.
 */

import { sprite, put } from "../paint/sprite.js";
import { ground } from "../art/ground.js";
import { bed } from "../art/flowers.js";
import { hive } from "../art/hives.js";
import { tree } from "../art/scenery.js";
import { skyBand, sun, moon } from "../art/sky.js";
import { bee } from "../art/bee.js";
import { bird, butterfly } from "../art/creatures.js";
import { boothBack, counter } from "./stall-art.js";
import { INTRO } from "../words/keeper.js";

/** A picture, in its own units. */
export const PIC_W = 320;
export const PIC_H = 212;
/** The tallest a picture is painted, on a phone with the room for it. */
export const PIC_MAX = 440;
/** From this height up a page uses its tall composition. */
const SPLIT = 292;

/**
 * Something in a picture: what it is, which one, where its anchor goes (its
 * feet, for anything that stands; the stall's left foot), how big, and a
 * variant or a flip.
 * @typedef {[kind: string, name: string | number, x: number, y: number, scale: number, opt?: number | boolean]} Thing
 */

/**
 * One composition: the height it is drawn for, where the meadow meets the
 * sky, and what is in the sky, on the land and on the wing. `bleed` lets a
 * tree run off the edge (a close view from under it).
 * @typedef {{ high: number, top: number, bleed?: boolean, air: Thing[], land: Thing[], bees: Thing[] }} Comp
 */

/** @type {{ season: string, sky: string, short: Comp, tall: Comp }[]} */
const PAGES = [
  // 1. The meadow, a little wild: the old apple tree, dandelions everywhere.
  {
    season: "spring",
    sky: "morning",
    short: {
      high: 212,
      top: 68,
      air: [
        ["sun", 0, 254, 38, 1.15],
        ["bird", 0, 142, 34, 0.7],
      ],
      land: [
        ["tree", "bloom", 66, 150, 0.98, 0],
        ["hive", "skep", 226, 130, 0.42],
        ["bed", "dandelion", 152, 118, 0.5, 0],
        ["bed", "dandelion", 276, 126, 0.52, 1],
        ["bed", "dandelion", 120, 154, 0.66, 1],
        ["bed", "dandelion", 196, 160, 0.72, 0],
        ["bed", "dandelion", 280, 172, 0.8, 1],
        ["bed", "dandelion", 44, 192, 0.92, 0],
        ["bed", "dandelion", 150, 198, 0.98, 1],
        ["bed", "dandelion", 238, 202, 1.0, 0],
      ],
      bees: [["butterfly", "white", 196, 96, 1]],
    },
    tall: {
      high: 380,
      top: 146,
      air: [
        ["sun", 0, 248, 60, 1.6],
        ["bird", 0, 198, 104, 0.7],
        ["bird", 1, 150, 38, 0.5],
      ],
      land: [
        ["tree", "bloom", 92, 262, 1.5, 0],
        ["bed", "dandelion", 198, 188, 0.46, 0],
        ["bed", "dandelion", 292, 194, 0.5, 1],
        ["hive", "skep", 242, 206, 0.5],
        ["bed", "dandelion", 190, 244, 0.64, 1],
        ["bed", "dandelion", 274, 250, 0.7, 0],
        ["bed", "dandelion", 232, 280, 0.78, 1],
        ["bed", "dandelion", 38, 300, 0.8, 1],
        ["bed", "dandelion", 152, 304, 0.84, 0],
        ["bed", "dandelion", 286, 310, 0.86, 0],
        ["bed", "dandelion", 58, 358, 1.05, 0],
        ["bed", "dandelion", 138, 368, 1.1, 1],
        ["bed", "dandelion", 214, 360, 1.05, 0],
        ["bed", "dandelion", 276, 370, 1.1, 1],
      ],
      bees: [
        ["butterfly", "white", 214, 158, 1.2],
        ["bee", 0, 150, 226, 1.5],
        ["bee", 1, 262, 138, 1.2, true],
      ],
    },
  },
  // 2. The old skep under the tree, and the bees still at home.
  {
    season: "spring",
    sky: "day",
    short: {
      high: 212,
      top: 58,
      bleed: true,
      air: [],
      land: [
        ["tree", "bloom", 34, 178, 1.5, 1],
        ["bed", "dandelion", 236, 148, 0.7, 0],
        ["bed", "dandelion", 278, 170, 0.95, 0],
        ["hive", "skep", 176, 184, 1.7],
        ["bed", "dandelion", 100, 202, 1.05, 1],
        ["bed", "dandelion", 276, 202, 1.1, 1],
      ],
      bees: [
        ["bee", 0, 128, 100, 2.0],
        ["bee", 1, 228, 74, 1.7, true],
        ["bee", 0, 250, 120, 1.9],
        ["bee", 1, 112, 142, 1.6, true],
        ["bee", 0, 198, 46, 1.4],
        ["bee", 1, 150, 60, 1.3, true],
      ],
    },
    tall: {
      high: 380,
      top: 140,
      air: [
        ["bird", 0, 258, 60, 0.7],
        ["bird", 1, 226, 92, 0.5],
      ],
      land: [
        ["tree", "bloom", 100, 292, 1.7, 1],
        ["bed", "dandelion", 248, 186, 0.48, 0],
        ["bed", "dandelion", 296, 206, 0.56, 1],
        ["bed", "dandelion", 298, 262, 0.74, 0],
        ["hive", "skep", 216, 320, 1.7],
        ["bed", "dandelion", 40, 328, 0.86, 0],
        ["bed", "dandelion", 292, 326, 0.86, 1],
        ["bed", "dandelion", 60, 370, 1.05, 1],
        ["bed", "dandelion", 136, 372, 0.9, 0],
        ["bed", "dandelion", 272, 372, 1.05, 0],
      ],
      bees: [
        ["bee", 0, 150, 226, 2.0],
        ["bee", 1, 270, 196, 1.7, true],
        ["bee", 0, 296, 250, 1.9],
        ["bee", 1, 134, 270, 1.6, true],
        ["bee", 0, 236, 150, 1.4],
        ["bee", 1, 186, 168, 1.3, true],
        ["bee", 0, 262, 112, 1.1],
      ],
    },
  },
  // 3. Flowers planted in rows, and what the bees make set out at the stall.
  {
    season: "summer",
    sky: "evening",
    short: {
      high: 212,
      top: 62,
      air: [],
      land: [
        ["bed", "lavender", 34, 122, 0.62, 0],
        ["bed", "lavender", 78, 126, 0.64, 1],
        ["bed", "lavender", 122, 122, 0.62, 0],
        ["bed", "sunflower", 214, 124, 0.74, 0],
        ["bed", "sunflower", 264, 128, 0.76, 1],
        ["hive", "box", 130, 152, 0.74],
        ["bed", "clover", 32, 164, 0.8, 0],
        ["bed", "clover", 84, 174, 0.84, 1],
        ["stall", 0, 166, 208, 0.7],
        ["bed", "borage", 40, 204, 0.9, 0],
        ["bed", "clover", 108, 206, 0.9, 0],
      ],
      bees: [
        ["bee", 0, 150, 86, 1.5],
        ["bee", 1, 70, 60, 1.2, true],
      ],
    },
    tall: {
      high: 380,
      top: 150,
      air: [
        ["moon", 0, 60, 56, 1.2],
        ["bird", 0, 154, 86, 0.6],
      ],
      land: [
        ["bed", "lavender", 30, 200, 0.56, 0],
        ["bed", "lavender", 72, 204, 0.58, 1],
        ["bed", "lavender", 114, 200, 0.56, 0],
        ["bed", "sunflower", 178, 238, 0.74, 0],
        ["bed", "sunflower", 228, 242, 0.76, 1],
        ["bed", "sunflower", 278, 238, 0.74, 0],
        ["hive", "box", 92, 264, 0.94],
        ["bed", "clover", 36, 306, 0.84, 0],
        ["bed", "clover", 98, 310, 0.86, 1],
        ["stall", 0, 134, 370, 0.86],
        ["bed", "borage", 44, 370, 1.0, 0],
        ["bed", "borage", 110, 373, 0.96, 1],
      ],
      bees: [
        ["bee", 0, 150, 176, 1.5],
        ["bee", 1, 58, 236, 1.3, true],
        ["bee", 0, 232, 132, 1.2],
      ],
    },
  },
];

export const PAGE_COUNT = PAGES.length;

/** The sprite for one thing (the stall is two, and is drawn by `draw`). */
function pieceOf(/** @type {Thing} */ [kind, name, , , , opt]) {
  /** @type {any} */
  const n = Number(opt) || 0;
  switch (kind) {
    case "tree":
      return tree(/** @type {any} */ (name), n);
    case "bed":
      return bed(String(name), "bloom", n);
    case "hive":
      return hive(/** @type {any} */ (name));
    case "bee":
      return bee(/** @type {any} */ (Number(name) || 0));
    case "bird":
      return bird(/** @type {any} */ (Number(name) || 0));
    case "butterfly":
      return butterfly(/** @type {any} */ (name), 0);
    case "sun":
      return sun();
    case "moon":
      return moon();
    default:
      throw new Error(`intro: nothing called "${kind}"`);
  }
}

/** A picture height the painter accepts: between the two, in steps of four. */
export const fit = (high) =>
  Math.max(PIC_H, Math.min(PIC_MAX, Math.round((Number(high) || PIC_H) / 4) * 4));

/**
 * The composition for a picture `H` high, and how it is fitted to that
 * height: whatever `H` has over (or under) the height the composition was
 * drawn for is shared between the sky and the meadow, and things keep close
 * to the size they were drawn at.
 * @param {{ short: Comp, tall: Comp }} p
 * @param {number} H
 */
function layout(p, H) {
  const c = H >= SPLIT ? p.tall : p.short;
  const top = c.top + (H - c.high) * 0.45;
  const stretch = (H - top) / (c.high - c.top);
  return {
    c,
    top,
    grow: Math.max(0.86, Math.min(1.18, 1 + (stretch - 1) * 0.6)),
    air: (/** @type {number} */ v) => (v * top) / c.top,
    y: (/** @type {number} */ v) => top + (v - c.top) * stretch,
  };
}

/**
 * Where a thing goes, kept whole inside the picture: nothing is cut by the
 * frame unless its composition says a tree may be.
 * @param {Thing} t
 * @param {ReturnType<typeof layout>} L
 * @param {number} H
 * @param {boolean} [sky] a thing of the air, placed in the sky's own measure
 */
function place(t, L, H, sky = false) {
  const s = pieceOf(t);
  const k = t[4] * (sky ? Math.sqrt(L.grow) : L.grow);
  let x = t[2];
  let y = sky ? L.air(t[3]) : L.y(t[3]);
  if (!(L.c.bleed && t[0] === "tree")) {
    x = Math.max(s.w * s.ax * k, Math.min(PIC_W - s.w * (1 - s.ax) * k, x));
    y = Math.max(s.h * s.ay * k, Math.min(H - s.h * (1 - s.ay) * k, y));
  }
  return { s, x, y, k };
}

/** Paint one thing of the land: a piece, or the stall (its back, then its counter). */
function draw(ctx, /** @type {Thing} */ t, L, H) {
  if (t[0] !== "stall") {
    const { s, x, y, k } = place(t, L, H);
    put(ctx, s, x, y, k);
    return;
  }
  const back = boothBack();
  const front = counter(INTRO.sign);
  const k = t[4] * L.grow;
  const x = Math.max(0, Math.min(PIC_W - back.w * k, t[2]));
  const y = Math.min(H, L.y(t[3]));
  put(ctx, back, x, y - back.h * k, k);
  put(ctx, front, x, y - front.h * k, k);
}

/**
 * The picture for page `i` (0, 1, 2), `high` units tall (PIC_H to PIC_MAX).
 * Whatever flies is left out: `fliers` gives those, to hover over the picture.
 * @param {number} i
 * @param {number} [high]
 */
export function page(i, high = PIC_H) {
  const p = PAGES[i];
  if (!p) throw new Error(`intro: no page ${i}`);
  const H = fit(high);
  const L = layout(p, H);
  return sprite(
    `intro-page-${i}-${H}`,
    PIC_W,
    H,
    (ctx, w, h) => {
      const sky = skyBand(/** @type {any} */ (p.season), /** @type {any} */ (p.sky), w, L.top + 64);
      ctx.drawImage(sky.canvas, 0, 0, sky.w, sky.h);
      for (const t of L.c.air) {
        const { s, x, y, k } = place(t, L, H, true);
        put(ctx, s, x, y, k);
      }
      // The meadow is painted wider and deeper than the picture, so that its
      // torn edge shows only where it meets the sky.
      const land = ground(`intro-${i}`, /** @type {any} */ (p.season), w + 40, h - L.top + 24);
      ctx.drawImage(land.canvas, -20, L.top, land.w, land.h);
      // Far things first: whatever stands lower on the page stands in front.
      for (const t of [...L.c.land].sort((a, b) => a[3] - b[3])) draw(ctx, t, L, H);
    },
    { ax: 0, ay: 0, grain: 0 },
  );
}

/**
 * The bees (and the butterfly) of page `i`, for the scene to hover over the
 * picture: each a sprite and where it goes, in percent of the picture.
 * @param {number} i
 * @param {number} [high]
 */
export function fliers(i, high = PIC_H) {
  const p = PAGES[i];
  if (!p) return [];
  const H = fit(high);
  const L = layout(p, H);
  return L.c.bees.map((t) => {
    const { s, x, y, k } = place(t, L, H);
    return {
      sprite: s,
      left: ((x - s.w * s.ax * k) / PIC_W) * 100,
      top: ((y - s.h * s.ay * k) / H) * 100,
      width: ((s.w * k) / PIC_W) * 100,
      flip: t[5] === true,
    };
  });
}
