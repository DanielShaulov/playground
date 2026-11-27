// @ts-check
/**
 * The meadow screen's own small painted pieces: the stores meter a hive
 * wears, its one badge, the twinkle over a jar that is ready, the specks a
 * spade throws up, and the "more" dots. Painted once with the same engine as
 * everything else (ui/paint), then only ever drawn.
 */

import { sprite } from "../paint/sprite.js";
import { wash, pencil, ellipse, roundRect, blob, rect } from "../paint/wash.js";
import { wasp } from "../art/creatures.js";

export const METER_W = 46;
export const METER_H = 13;
export const FILL_W = 40;
export const FILL_H = 7;

/** The empty meter: a little cream bar with a pencil edge. */
export function meterBack() {
  return sprite(
    "hm-meter-back",
    METER_W,
    METER_H,
    (ctx, w, h, r) => {
      const bar = roundRect(1.5, 1.5, w - 3, h - 3, 5);
      wash(ctx, bar, "white", { r, layers: 8, strength: 0.97, soft: 0.04, edge: 0.3 });
      wash(ctx, roundRect(3.4, 3.6, w - 6.8, h - 7.2, 3), "paperShade", {
        r,
        layers: 5,
        strength: 0.7,
        soft: 0.06,
        edge: 0,
      });
      pencil(ctx, bar, { r, closed: true, alpha: 0.62, width: 0.9, wobble: 0.25, gaps: 0.02 });
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.4 },
  );
}

/** The honey that fills it: drawn cropped from the left, by how full the hive is. */
export function meterFill() {
  return sprite(
    "hm-meter-fill",
    FILL_W,
    FILL_H,
    (ctx, w, h, r) => {
      wash(ctx, roundRect(0.4, 0.5, w - 0.8, h - 1, 3), "honey", {
        r,
        layers: 8,
        strength: 0.96,
        soft: 0.04,
        edge: 0.4,
        charge: { color: "amber", n: 3, strength: 0.3 },
      });
      wash(ctx, roundRect(2, 1.3, w - 4, 1.3, 0.6), "butter", {
        r,
        layers: 4,
        strength: 0.55,
        soft: 0.1,
        edge: 0,
      });
    },
    { ax: 0, ay: 0.5, scale: 2, grain: 0.3 },
  );
}

const PICTO = {
  wasps(ctx) {
    const s = wasp(0);
    ctx.drawImage(s.canvas, 12 - 7.6, 12 - 5.6, 15.2, 11);
  },
  queen(ctx, r) {
    const crown = [
      [6.2, 16],
      [5.6, 9.2],
      [8.8, 12],
      [12, 7],
      [15.2, 12],
      [18.4, 9.2],
      [17.8, 16],
    ];
    wash(ctx, crown, "sunflower", {
      r,
      layers: 8,
      strength: 0.96,
      soft: 0.03,
      edge: 0.5,
      charge: { color: "amber", n: 2, strength: 0.3 },
    });
    pencil(ctx, crown, {
      r,
      closed: true,
      alpha: 0.75,
      width: 0.9,
      wobble: 0.15,
      gaps: 0,
      passes: 1,
    });
    for (const [x, y] of [
      [5.6, 8.6],
      [12, 6.4],
      [18.4, 8.6],
    ])
      wash(ctx, ellipse(x, y, 1.3, 1.3, 8), "poppy", {
        r,
        layers: 5,
        strength: 0.95,
        soft: 0.05,
        edge: 0,
      });
  },
  mites(ctx, r) {
    for (const [x, y, rad] of [
      [10.2, 12.6, 3.6],
      [15.6, 9.4, 2.2],
      [15.4, 15.4, 1.7],
    ]) {
      for (let i = 0; i < 6; i++) {
        const a = (i < 3 ? Math.PI : 0) + (i % 3) * 0.6 - 0.6;
        pencil(
          ctx,
          [
            [x + Math.cos(a) * rad * 0.7, y + Math.sin(a) * rad * 0.7],
            [x + Math.cos(a) * rad * 1.55, y + Math.sin(a) * rad * 1.5],
          ],
          { r, alpha: 0.75, width: 0.6, wobble: 0.1, gaps: 0, passes: 1 },
        );
      }
      wash(ctx, ellipse(x, y, rad, rad * 0.82, 10), "chestnut", {
        r,
        layers: 6,
        strength: 0.95,
        soft: 0.05,
        edge: 0.4,
      });
    }
  },
  hungry(ctx, r) {
    // An empty jar, a last smear of honey in the bottom.
    const glass = roundRect(7.4, 8.4, 9.2, 9.6, 2.2);
    wash(ctx, glass, "white", { r, layers: 6, strength: 0.9, soft: 0.04, edge: 0 });
    wash(ctx, roundRect(8.4, 15.4, 7.2, 1.7, 0.8), "honey", {
      r,
      layers: 5,
      strength: 0.9,
      soft: 0.06,
      edge: 0,
    });
    wash(ctx, rect(8, 6.2, 8, 2.3), "wood", {
      r,
      layers: 6,
      strength: 0.92,
      soft: 0.05,
      edge: 0.4,
    });
    pencil(ctx, glass, {
      r,
      closed: true,
      alpha: 0.8,
      width: 0.9,
      wobble: 0.15,
      gaps: 0,
      passes: 1,
    });
  },
};
const TONE = { wasps: "butter", queen: "blush", mites: "cream", hungry: "sky" };

/**
 * The one badge a hive wears when it needs something.
 * @param {"wasps" | "queen" | "mites" | "hungry"} kind
 */
export function badge(kind) {
  return sprite(
    `hm-badge-${kind}`,
    24,
    24,
    (ctx, w, h, r) => {
      const disc = ellipse(12, 12, 10, 10, 16);
      wash(ctx, ellipse(12.7, 13.4, 10, 10, 14), "shadow", {
        r,
        layers: 6,
        strength: 0.32,
        soft: 0.2,
        edge: 0,
      });
      wash(ctx, disc, "white", { r, layers: 8, strength: 0.98, soft: 0.03, edge: 0 });
      wash(ctx, disc, TONE[kind] ?? "cream", {
        r,
        layers: 8,
        strength: 0.75,
        soft: 0.04,
        edge: 0.5,
      });
      PICTO[kind]?.(ctx, r);
      pencil(ctx, disc, { r, closed: true, alpha: 0.68, width: 1, wobble: 0.3, gaps: 0.02 });
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0.4 },
  );
}

/** A four-pointed twinkle: over a hive with a jar to take, and for small celebrations. */
export function twinkle() {
  return sprite(
    "hm-twinkle",
    14,
    14,
    (ctx, w, h, r) => {
      const star = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rad = i % 2 ? 1.5 : 6.2;
        star.push([7 + Math.cos(a) * rad, 7 + Math.sin(a) * rad]);
      }
      wash(ctx, ellipse(7, 7, 4.6, 4.6, 10), "butter", {
        r,
        layers: 6,
        strength: 0.5,
        soft: 0.5,
        edge: 0,
      });
      wash(ctx, star, "white", { r, layers: 6, strength: 0.98, soft: 0.03, edge: 0 });
      wash(ctx, star, "dandelion", { r, layers: 5, strength: 0.5, soft: 0.04, edge: 0.6 });
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0 },
  );
}

/** A soft dab of one colour: soil off a spade, a petal, a drop of honey. */
export function speck(color) {
  return sprite(
    `hm-speck-${color}`,
    6,
    6,
    (ctx, w, h, r) => {
      wash(ctx, blob(r, 3, 3, 2, 0.2, 7), color, {
        r,
        layers: 5,
        strength: 0.92,
        soft: 0.1,
        edge: 0.4,
      });
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0 },
  );
}

/** Three dots, for the "More" button, in the manner of the kit's icons. */
export function moreIcon() {
  return sprite(
    "hm-more",
    28,
    28,
    (ctx, w, h, r) => {
      for (const [x, tone] of [
        [6.4, "honey"],
        [14, "clover"],
        [21.6, "sap"],
      ]) {
        const dot = ellipse(Number(x), 14.2, 3.1, 3.1, 10);
        wash(ctx, dot, String(tone), { r, layers: 7, strength: 0.95, soft: 0.05, edge: 0.4 });
        pencil(ctx, dot, { r, closed: true, alpha: 0.8, width: 1, wobble: 0.2, gaps: 0.02 });
      }
    },
    { ax: 0.5, ay: 0.5, scale: 1.5, grain: 0.6 },
  );
}

/** A soft wash over a square you may use (the brush, a hive in hand): calm, no ring. */
export function lawn() {
  return sprite(
    "hm-lawn",
    64,
    64,
    (ctx, w, h, r) => {
      wash(ctx, roundRect(5, 5, w - 10, h - 10, 12), "butter", {
        r,
        layers: 6,
        strength: 0.4,
        soft: 0.22,
        edge: 0,
      });
      wash(ctx, roundRect(10, 10, w - 20, h - 20, 9), "white", {
        r,
        layers: 4,
        strength: 0.2,
        soft: 0.3,
        edge: 0,
      });
    },
    { ax: 0.5, ay: 0.5, scale: 1, grain: 0.3 },
  );
}

/** Tended earth under a young bed, so its leaves stand off the grass. */
export function soil() {
  return sprite(
    "hm-soil",
    64,
    26,
    (ctx, w, h, r) => {
      wash(ctx, ellipse(32, 13, 26, 8.5, 18), "soil", {
        r,
        layers: 7,
        strength: 0.5,
        soft: 0.25,
        edge: 0.2,
      });
      wash(ctx, ellipse(30, 12, 17, 4.5, 14), "umber", {
        r,
        layers: 4,
        strength: 0.2,
        soft: 0.4,
        edge: 0,
      });
    },
    { ax: 0.5, ay: 0.5, scale: 1.5, grain: 0.6 },
  );
}

/** The ring a raindrop leaves on wet ground. */
export function ripple() {
  return sprite(
    "hm-ripple",
    22,
    10,
    (ctx, w, h, r) => {
      pencil(ctx, ellipse(11, 5, 9, 3.2, 16), {
        r,
        closed: true,
        color: "white",
        alpha: 0.9,
        width: 1.1,
        wobble: 0.1,
        gaps: 0,
        passes: 1,
      });
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0 },
  );
}

export const VEIL_W = 390;
export const VEIL_H = 110;

/**
 * What the weather lays over the sky band (drawn onto it, so it keeps the
 * band's ragged lower edge): an even grey and a bank of cloud for rain, puffs
 * for a cloudy day, streaks for wind, a pale sheet for snow and frost.
 * @param {"cloudy" | "windy" | "rain" | "snow" | "frost"} kind
 */
export function skyVeil(kind) {
  return sprite(
    `hm-veil-${kind}`,
    VEIL_W,
    VEIL_H,
    (ctx, w, h, r) => {
      const all = rect(-6, -6, w + 12, h + 12);
      const flat = { r, layers: 6, soft: 0.02, edge: 0 };
      if (kind === "rain") wash(ctx, all, "stone", { ...flat, strength: 0.55 });
      else if (kind === "snow") wash(ctx, all, "cloud", { ...flat, strength: 0.62 });
      else if (kind === "frost") wash(ctx, all, "snow", { ...flat, strength: 0.34 });
      else if (kind === "cloudy") wash(ctx, all, "cloud", { ...flat, strength: 0.34 });
      if (kind === "frost") return;
      const n = kind === "windy" ? 6 : kind === "cloudy" ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) / n) * w + r.gauss() * 12;
        const cy = (kind === "windy" ? 20 : 24) + (i % 3) * 16 + r.gauss() * 4;
        const rx = kind === "windy" ? 62 : 46 + (i % 3) * 12;
        const ry = kind === "windy" ? 4.5 : 15 + (i % 2) * 5;
        const puff = ellipse(cx, cy, rx, ry, 22);
        if (kind === "rain") {
          wash(ctx, puff, "stone", { r, layers: 7, strength: 0.5, soft: 0.3, edge: 0 });
          wash(ctx, ellipse(cx - 6, cy - 5, rx * 0.7, ry * 0.55, 18), "cloud", {
            r,
            layers: 5,
            strength: 0.5,
            soft: 0.35,
            edge: 0,
          });
        } else {
          wash(ctx, puff, "white", {
            r,
            layers: 7,
            strength: kind === "windy" ? 0.6 : 0.78,
            soft: 0.3,
            edge: 0,
          });
          if (kind !== "windy")
            wash(ctx, ellipse(cx + 4, cy + ry * 0.45, rx * 0.8, ry * 0.4, 18), "cloud", {
              r,
              layers: 4,
              strength: 0.4,
              soft: 0.4,
              edge: 0,
            });
        }
      }
    },
    { ax: 0, ay: 0, scale: 1, grain: 0.5 },
  );
}
