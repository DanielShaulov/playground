// Sky and weather: the icons for the forecast, the sun and moon that cross
// the day, the rain and snow the meadow scatters, the shadow of a cloud, and
// the strip of sky that sits behind a header.

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  lift,
  ellipse,
  blob,
  leaf,
  petal,
  rect,
  smooth,
  resample,
  within,
  deform,
  TAU,
} from "../paint/wash.js";
import { mix, rgba } from "../paint/palette.js";
import { dot, tick } from "./flowers.js";

// ----------------------------------------------------------------- pieces

// A painted sun: a warm disc in a soft glow, with loose brushed rays.
function paintSun(ctx, r, cx, cy, rad, rays) {
  wash(ctx, ellipse(cx, cy, rad * 1.75, rad * 1.75, 14), "butter", {
    r,
    layers: 8,
    strength: 0.4,
    soft: 0.4,
    edge: 0,
  });
  if (rays) {
    const n = 10;
    const turn = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * TAU + r.gauss() * 0.06;
      const inner = rad * 1.28;
      const outer = rad * (i % 2 ? 1.72 : 2.05) * r.range(0.94, 1.06);
      brush(
        ctx,
        [
          [cx + Math.cos(a) * inner, cy + Math.sin(a) * inner],
          [
            cx + Math.cos(a + 0.03) * (inner + outer) * 0.5,
            cy + Math.sin(a + 0.03) * (inner + outer) * 0.5,
          ],
          [cx + Math.cos(a) * outer, cy + Math.sin(a) * outer],
        ],
        r.pick(["sunflower", "dandelion", "honey"]),
        { r, width: rad * 0.3, strength: 0.85, edge: 0.4 },
      );
    }
  }
  wash(ctx, ellipse(cx, cy, rad, rad * 0.98, 14), "dandelion", {
    r,
    layers: 12,
    strength: 0.95,
    soft: 0.09,
    edge: 0.6,
    charge: { color: "sunflower", n: 2, strength: 0.4 },
  });
  // Paper left showing where the light is strongest.
  lift(
    ctx,
    ellipse(cx - rad * 0.3, cy - rad * 0.35, rad * 0.34, rad * 0.22, 8, -0.5),
    r,
    0.35,
    0.4,
  );
  pencil(ctx, ellipse(cx, cy, rad, rad * 0.98, 12), {
    r,
    closed: true,
    passes: 1,
    alpha: 0.3,
    width: 0.6,
    gaps: 0.35,
  });
}

// A cloud: a flat-bottomed heap of puffs, white above and shaded beneath.
function cloudShape(cx, cy, wide, high) {
  const w = wide / 2;
  return smooth(
    [
      [cx - w, cy + high * 0.42],
      [cx - w * 0.96, cy + high * 0.02],
      [cx - w * 0.6, cy - high * 0.12],
      [cx - w * 0.42, cy - high * 0.52],
      [cx - w * 0.02, cy - high * 0.58],
      [cx + w * 0.22, cy - high * 0.3],
      [cx + w * 0.62, cy - high * 0.3],
      [cx + w * 0.94, cy + high * 0.02],
      [cx + w, cy + high * 0.42],
      [cx + w * 0.4, cy + high * 0.5],
      [cx - w * 0.4, cy + high * 0.5],
    ],
    4,
  );
}

function paintCloud(ctx, r, cx, cy, wide, high, grey = 0) {
  const shape = cloudShape(cx, cy, wide, high);
  wash(ctx, shape, grey > 0.5 ? "cloud" : "white", {
    r,
    layers: 10,
    strength: 0.97,
    soft: 0.07,
    edge: 0.5,
    vary: 0.015,
  });
  within(ctx, shape, () => {
    wash(ctx, ellipse(cx + wide * 0.06, cy + high * 0.4, wide * 0.5, high * 0.3, 10), "dusk", {
      r,
      layers: 8,
      strength: 0.22 + grey * 0.3,
      soft: 0.5,
      edge: 0,
    });
    wash(ctx, ellipse(cx + wide * 0.26, cy + high * 0.1, wide * 0.2, high * 0.26, 8), "sky", {
      r,
      layers: 6,
      strength: 0.3 + grey * 0.2,
      soft: 0.5,
      edge: 0,
    });
  });
  pencil(ctx, shape, { r, closed: true, alpha: 0.42, width: 0.7, gaps: 0.2, wobble: 0.5 });
}

function paintDrop(ctx, r, x, y, len, slant = 0.25) {
  const drop = petal(x, y, len, len * 0.46, Math.PI / 2 + slant, 0.68);
  wash(ctx, drop, "water", { r, layers: 5, strength: 0.9, soft: 0.06, edge: 0.6, rounds: 1 });
  dot(ctx, r, x - len * 0.1 - 0.2, y + len * 0.62, len * 0.09, "white", 0.8);
}

// A snow crystal: six arms, each with a pair of barbs.
function paintFlake(ctx, r, x, y, rad, color = "water", width = 0.7) {
  const turn = r() * TAU;
  for (let k = 0; k < 6; k++) {
    const a = turn + (k / 6) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    tick(ctx, r, x, y, x + c * rad, y + s * rad, color, 0.85, width);
    if (rad < 3) continue;
    for (const side of [-1, 1]) {
      const b = a + side * 0.9;
      tick(
        ctx,
        r,
        x + c * rad * 0.58,
        y + s * rad * 0.58,
        x + c * rad * 0.58 + Math.cos(b) * rad * 0.34,
        y + s * rad * 0.58 + Math.sin(b) * rad * 0.34,
        color,
        0.8,
        width * 0.85,
      );
    }
  }
  dot(ctx, r, x, y, rad * 0.16, "white", 0.95);
}

// A four-pointed glint.
function paintTwinkle(ctx, r, x, y, rad, color = "white", alpha = 0.95) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - Math.PI / 2;
    const d = k % 2 ? rad * 0.22 : rad;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- weather

export const WEATHER = ["sunny", "cloudy", "windy", "rain", "snow", "frost"];
export const WEATHER_SIZE = 40;

const WEATHER_PAINT = {
  sunny(ctx, w, h, r) {
    paintSun(ctx, r, w / 2, h / 2, 8.4, true);
  },
  cloudy(ctx, w, h, r) {
    paintCloud(ctx, r, w * 0.62, h * 0.36, 20, 12, 0.5);
    paintCloud(ctx, r, w * 0.46, h * 0.58, 30, 17, 0.15);
  },
  windy(ctx, w, h, r) {
    // Three gusts, each curling over at the end, and leaves gone with them.
    const gust = (y, len, curl, width) => {
      const x0 = w * 0.1;
      const x1 = x0 + len;
      const path = smooth(
        [
          [x0, y + 1],
          [x0 + len * 0.45, y - 0.6],
          [x1 - curl, y],
          [x1 + curl * 0.3, y - curl * 0.8],
          [x1 - curl * 0.55, y - curl * 1.5],
          [x1 - curl * 1.25, y - curl * 0.75],
          [x1 - curl * 0.7, y - curl * 0.3],
        ],
        5,
        false,
      );
      brush(ctx, path, r.pick(["dusk", "water"]), {
        r,
        width: (t) => width * (0.5 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.15))),
        strength: 0.8,
        soft: 0.12,
      });
    };
    gust(h * 0.36, w * 0.58, 4.6, 2);
    gust(h * 0.6, w * 0.74, 5.2, 2.2);
    gust(h * 0.82, w * 0.48, 3.8, 1.7);
    for (const [x, y, a, c] of [
      [w * 0.2, h * 0.2, -0.5, "sap"],
      [w * 0.86, h * 0.84, 0.5, "amber"],
      [w * 0.5, h * 0.12, 0.2, "leaf"],
    ])
      wash(ctx, leaf(x, y, 6, 3.2, a), c, { r, layers: 5, strength: 0.85, soft: 0.1 });
  },
  rain(ctx, w, h, r) {
    for (const [x, y, len] of [
      [w * 0.28, h * 0.62, 6.5],
      [w * 0.48, h * 0.7, 7.5],
      [w * 0.68, h * 0.6, 6.5],
      [w * 0.36, h * 0.82, 5],
      [w * 0.62, h * 0.82, 5.5],
    ])
      paintDrop(ctx, r, x, y, len);
    paintCloud(ctx, r, w * 0.5, h * 0.34, 31, 17, 1);
  },
  snow(ctx, w, h, r) {
    paintCloud(ctx, r, w * 0.5, h * 0.32, 30, 16, 0.4);
    for (const [x, y, rad] of [
      [w * 0.24, h * 0.68, 3.4],
      [w * 0.5, h * 0.78, 4.2],
      [w * 0.76, h * 0.68, 3.4],
    ])
      paintFlake(ctx, r, x, y, rad);
    for (const [x, y] of [
      [w * 0.37, h * 0.9],
      [w * 0.65, h * 0.92],
      [w * 0.12, h * 0.86],
      [w * 0.9, h * 0.88],
    ])
      dot(ctx, r, x, y, 1, "water", 0.7);
  },
  frost(ctx, w, h, r) {
    // One big crystal on a breath of cold blue, and a few glints.
    wash(ctx, blob(r, w / 2, h / 2, 14, 0.12, 10), "sky", {
      r,
      layers: 8,
      strength: 0.55,
      soft: 0.4,
      edge: 0.2,
    });
    paintFlake(ctx, r, w / 2, h / 2 + 0.5, 12.5, "water", 1.3);
    paintFlake(ctx, r, w / 2, h / 2 + 0.5, 6, "borage", 0.9);
    paintTwinkle(ctx, r, w * 0.82, h * 0.2, 3.4, "water", 0.9);
    paintTwinkle(ctx, r, w * 0.16, h * 0.78, 2.6, "water", 0.8);
    paintTwinkle(ctx, r, w * 0.8, h * 0.84, 1.8, "borage", 0.7);
  },
};

/**
 * A weather icon, about 40 px, anchored at its centre.
 * @param {"sunny"|"cloudy"|"windy"|"rain"|"snow"|"frost"} kind
 */
export function weather(kind) {
  const paint = WEATHER_PAINT[kind];
  if (!paint) throw new Error(`no weather "${kind}"`);
  return sprite(`weather-${kind}`, WEATHER_SIZE, WEATHER_SIZE, paint, {
    ax: 0.5,
    ay: 0.5,
    scale: 2,
    grain: 0.6,
  });
}

// ----------------------------------------------------------- sun and moon

export const SUN_SIZE = 34;
export const MOON_SIZE = 30;

/** The sun as a disc for the day's arc, anchored at its centre. */
export function sun() {
  return sprite(
    "sky-sun",
    SUN_SIZE,
    SUN_SIZE,
    (ctx, w, h, r) => paintSun(ctx, r, w / 2, h / 2, 8.6, true),
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

/** A crescent moon in a faint halo, anchored at its centre. */
export function moon() {
  return sprite(
    "sky-moon",
    MOON_SIZE,
    MOON_SIZE,
    (ctx, w, h, r) => {
      const cx = w / 2;
      const cy = h / 2;
      const rad = 9;
      wash(ctx, ellipse(cx, cy, rad * 1.5, rad * 1.5, 14), "lilac", {
        r,
        layers: 8,
        strength: 0.3,
        soft: 0.4,
        edge: 0,
      });
      // The crescent is one shape: the lit limb outside, the terminator within.
      const horn = [];
      const reach = Math.PI / 2 + 0.3; // how far round the horns come
      const thin = 0.45;
      const shift = Math.cos(reach) * rad * (1 - thin);
      for (let i = 0; i <= 14; i++) {
        const a = -reach + (i / 14) * reach * 2;
        horn.push([cx - 1.5 + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
      for (let i = 13; i >= 1; i--) {
        const a = -reach + (i / 14) * reach * 2;
        horn.push([cx - 1.5 + Math.cos(a) * rad * thin + shift, cy + Math.sin(a) * rad]);
      }
      wash(ctx, horn, "cream", {
        r,
        layers: 10,
        strength: 0.97,
        soft: 0.05,
        edge: 0.5,
        rounds: 1,
        charge: { color: "butter", n: 2, strength: 0.45 },
      });
      dot(ctx, r, cx + rad * 0.62, cy - rad * 0.3, 1.2, "straw", 0.45);
      dot(ctx, r, cx + rad * 0.7, cy + rad * 0.3, 0.9, "straw", 0.4);
      pencil(ctx, horn, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.35,
        width: 0.6,
        gaps: 0.2,
        wobble: 0.3,
      });
      paintTwinkle(ctx, r, cx - rad * 0.95, cy - rad * 0.75, 2.2, "butter", 0.9);
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

// -------------------------------------------------------------- particles

export const RAINDROP_W = 6;
export const RAINDROP_H = 12;
export const SNOWFLAKE_SIZE = 9;

/** One falling raindrop, slanting a little, anchored at its centre. */
export function raindrop() {
  return sprite(
    "sky-raindrop",
    RAINDROP_W,
    RAINDROP_H,
    (ctx, w, h, r) => {
      const drop = petal(w * 0.64, 0.6, h - 1.6, 3.6, Math.PI / 2 + 0.2, 0.7);
      wash(ctx, drop, "water", { r, layers: 5, strength: 0.8, soft: 0.06, edge: 0.5, rounds: 1 });
      dot(ctx, r, w * 0.4, h * 0.68, 0.6, "white", 0.85);
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0.3 },
  );
}

/** One falling snowflake: a soft white tuft with a blue edge, so it shows on snow. */
export function snowflake() {
  return sprite(
    "sky-snowflake",
    SNOWFLAKE_SIZE,
    SNOWFLAKE_SIZE,
    (ctx, w, h, r) => {
      const c = w / 2;
      wash(ctx, blob(r, c, c + 0.3, 3.3, 0.14, 9), "pond", {
        r,
        layers: 5,
        strength: 0.5,
        soft: 0.3,
        edge: 0,
      });
      wash(ctx, blob(r, c - 0.2, c - 0.2, 2.6, 0.16, 9), "white", {
        r,
        layers: 6,
        strength: 0.97,
        soft: 0.18,
        edge: 0,
        vary: 0.01,
      });
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0 },
  );
}

export const CLOUD_SHADOW_W = 260;
export const CLOUD_SHADOW_H = 150;

/** The shadow of a passing cloud: a big soft wash to drift over the meadow. */
export function cloudShadow() {
  return sprite(
    "sky-cloud-shadow",
    CLOUD_SHADOW_W,
    CLOUD_SHADOW_H,
    (ctx, w, h, r) => {
      // Several puffs laid as one shape, so where they overlap is no darker.
      const puffs = [
        [w * 0.3, h * 0.56, h * 0.27],
        [w * 0.47, h * 0.42, h * 0.31],
        [w * 0.68, h * 0.5, h * 0.3],
        [w * 0.52, h * 0.64, h * 0.26],
        [w * 0.82, h * 0.6, h * 0.17],
      ].map(([x, y, rad]) =>
        resample(blob(r, x, y, rad, 0.1, 12, 0.82), 9).map(([px, py]) => [px, py, 0.5]),
      );
      const layers = 16;
      ctx.fillStyle = rgba("shadow", 1 - Math.pow(1 - 0.22, 1 / layers));
      for (let i = 0; i < layers; i++) {
        ctx.beginPath();
        for (const puff of puffs) {
          const pts = deform(puff, 3, r);
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.closePath();
        }
        ctx.fill();
      }
    },
    { ax: 0.5, ay: 0.5, grain: 0 },
  );
}

// --------------------------------------------------------------- sky band

export const PHASES = ["morning", "day", "evening", "night"];

// top, middle, horizon; then what is dropped in while wet.
const SKY = {
  morning: { bands: ["sky", "blush", "apricot"], charge: ["butter", "white"], glow: "butter" },
  day: { bands: ["pond", "sky", "sky"], charge: ["white", "sky"], glow: null },
  evening: { bands: ["lilac", "rose", "apricot"], charge: ["peach", "lavender"], glow: "butter" },
  night: {
    bands: [mix("dusk", "plum", 0.55), mix("dusk", "plum", 0.3), "dusk"],
    charge: ["violet", "dusk"],
    glow: null,
  },
};

// Each season leans the sky a little: fresh, deep, golden, pale.
const SEASON_TINT = {
  spring: ["mint", 0.12],
  summer: ["sky", 0],
  autumn: ["apricot", 0.14],
  winter: ["cloud", 0.4],
};

/**
 * A wide strip of sky for behind a header: flush at the top and sides, its
 * lower edge left soft and ragged so it fades into the paper.
 * @param {"spring"|"summer"|"autumn"|"winter"} season
 * @param {"morning"|"day"|"evening"|"night"} phase
 * @param {number} w CSS px
 * @param {number} h
 */
export function skyBand(season, phase, w, h) {
  const look = SKY[phase];
  if (!look) throw new Error(`no sky phase "${phase}"`);
  const tint = SEASON_TINT[season];
  if (!tint) throw new Error(`no season "${season}"`);
  return sprite(
    `sky-${season}-${phase}-${Math.round(w)}x${Math.round(h)}`,
    w,
    h,
    (ctx, W, H, r) => {
      const night = phase === "night";
      const tone = (c) => (tint[1] ? mix(c, tint[0], night ? tint[1] * 0.4 : tint[1]) : c);
      const step = Math.max(8, W / 26);
      const body = resample(rect(-12, -12, W + 24, H * 0.84 + 12), step);
      wash(ctx, body, tone(look.bands[1]), {
        r,
        layers: 22,
        strength: night ? 0.9 : 0.8,
        soft: 0.16,
        edge: 0.4,
        edgeWidth: 1.4,
      });
      within(ctx, body, () => {
        // The top of the sky and the light along the horizon, run together.
        wash(ctx, resample(rect(-12, -12, W + 24, H * 0.38 + 12), step), tone(look.bands[0]), {
          r,
          layers: 12,
          strength: 0.7,
          soft: 0.5,
          edge: 0,
        });
        wash(ctx, resample(rect(-12, H * 0.5, W + 24, H * 0.5), step), tone(look.bands[2]), {
          r,
          layers: 12,
          strength: 0.62,
          soft: 0.5,
          edge: 0,
        });
        for (const c of look.charge)
          for (let i = 0; i < 4; i++) {
            const rad = H * r.range(0.22, 0.42);
            wash(
              ctx,
              resample(
                blob(r, r.range(0, W), r.range(H * 0.1, H * 0.7), rad, 0.2, 10, 0.6),
                rad / 3,
              ),
              c,
              {
                r,
                layers: 8,
                strength: night ? 0.2 : 0.3,
                soft: 0.5,
                edge: 0,
              },
            );
          }
        if (look.glow) {
          // Where the sun is coming up, or going.
          const gx = phase === "morning" ? W * 0.2 : W * 0.8;
          wash(ctx, resample(ellipse(gx, H * 0.72, H * 0.9, H * 0.42, 14), H / 6), look.glow, {
            r,
            layers: 10,
            strength: 0.55,
            soft: 0.5,
            edge: 0,
          });
        }
        if (night) {
          for (let i = 0; i < Math.round(W / 9); i++) {
            const x = r.range(4, W - 4);
            const y = r.range(3, H * 0.72);
            if (i % 6 === 0) paintTwinkle(ctx, r, x, y, r.range(2, 3.2), "white", 0.9);
            else
              dot(
                ctx,
                r,
                x,
                y,
                r.range(0.5, 1),
                r.pick(["white", "butter", "white"]),
                r.range(0.5, 0.95),
              );
          }
        } else {
          // Clouds: the paper lifted back out, with a shadow under each.
          const n = Math.max(2, Math.round(W / 150)) + (season === "winter" ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const x = ((i + 0.5) / n) * W + r.gauss() * W * 0.05;
            const y = H * r.range(0.22, 0.5);
            const wide = H * r.range(0.5, 0.85);
            const high = wide * 0.36;
            wash(
              ctx,
              cloudShape(x + 2, y + high * 0.3, wide, high),
              phase === "day" ? "dusk" : "lilac",
              {
                r,
                layers: 6,
                strength: 0.16,
                soft: 0.4,
                edge: 0,
              },
            );
            lift(ctx, cloudShape(x, y, wide, high), r, phase === "day" ? 0.8 : 0.5, 0.2);
          }
        }
      });
      if (!night) {
        // A few birds, far off: two little strokes each.
        const flock = phase === "evening" ? 2 : 4;
        const fx = W * r.range(0.3, 0.6);
        const fy = H * r.range(0.2, 0.4);
        for (let i = 0; i < flock; i++) {
          const x = fx + i * H * 0.16 + r.gauss() * 3;
          const y = fy + (i % 2 ? 1 : -1) * H * 0.05 * i + r.gauss() * 2;
          const s = r.range(2.6, 3.8);
          pencil(
            ctx,
            [
              [x - s, y - s * 0.3],
              [x - s * 0.4, y - s * 0.62],
              [x, y],
              [x + s * 0.45, y - s * 0.7],
              [x + s, y - s * 0.45],
            ],
            { r, passes: 1, alpha: 0.6, width: 0.8, wobble: 0.2, gaps: 0 },
          );
        }
      }
      splatter(ctx, W / 2, H * 0.4, Math.max(W, H) * 0.5, night ? "white" : look.charge[0], {
        r,
        n: 14,
        size: 0.9,
        strength: 0.7,
      });
    },
    { ax: 0, ay: 0, grain: 0.8 },
  );
}

// ---------------------------------------------------------------- gallery

// White things need something behind them to be seen in the gallery.
function onTone(key, s, tone, pad = 6) {
  return sprite(
    `gallery-${key}`,
    s.w + pad * 2,
    s.h + pad * 2,
    (ctx, w, h, r) => {
      wash(ctx, resample(rect(1.5, 1.5, w - 3, h - 3), 6), tone, {
        r,
        layers: 10,
        strength: 0.85,
        soft: 0.12,
      });
      ctx.drawImage(s.canvas, pad, pad, s.w, s.h);
    },
    { ax: 0.5, ay: 0.5, scale: 3 },
  );
}

export const GALLERY = [
  ...WEATHER.map((kind) => ({ name: `weather · ${kind}`, make: () => weather(kind), zoom: 1.6 })),
  { name: "sun", make: () => sun(), zoom: 1.6 },
  { name: "moon", make: () => moon(), zoom: 1.6 },
  {
    name: "moon on night",
    make: () => onTone("moon", moon(), mix("dusk", "plum", 0.45)),
    zoom: 1.6,
  },
  { name: "raindrop", make: () => raindrop(), zoom: 4 },
  { name: "raindrop on grass", make: () => onTone("raindrop", raindrop(), "sap"), zoom: 4 },
  { name: "snowflake on grass", make: () => onTone("flake-grass", snowflake(), "sap"), zoom: 4 },
  { name: "snowflake on snow", make: () => onTone("flake-snow", snowflake(), "snow"), zoom: 4 },
  {
    name: "cloud shadow (on grass)",
    make: () => onTone("cloud-shadow", cloudShadow(), "sap", 0),
    zoom: 0.6,
  },
  ...["summer", "winter"].flatMap((season) =>
    PHASES.map((phase) => ({
      name: `sky · ${season} · ${phase}`,
      make: () => skyBand(season, phase, 390, 110),
      zoom: 0.667,
    })),
  ),
  ...["spring", "autumn"].map((season) => ({
    name: `sky · ${season} · day`,
    make: () => skyBand(season, "day", 390, 110),
    zoom: 0.667,
  })),
];
