// Flower beds. One sprite per (flower, stage, variant): a little clump that
// fills a meadow square and stands a bit taller than it, anchored at its
// feet. See docs/honey-hollow/art.md for how to add one that matches.
//
// Every flower has to be told from the others at 56 px, so each has its own
// silhouette first and its own colour second:
//
//   dandelion  flat yellow suns and a clock over a ground rosette
//   clover     round pink pompoms just above a mat of trefoils
//   borage     sky-blue stars nodding off hairy stems, broad rough leaves
//   lavender   a fan of thin stems with violet spikes
//   thyme      a low cushion hazed with pink-mauve
//   mint       upright stems, leaves in pairs, lilac balls in tiers
//   sunflower  as tall as the sprite, a few big golden heads
//   buckwheat  red stems, heart leaves, a froth of white
//   heather    a low wiry dome, pink-purple from foot to tip
//   ivy        dark lobed leaves up a wooden post, yellow-green balls

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  shadow,
  hatch,
  ellipse,
  blob,
  leaf,
  petal,
  smooth,
  roundRect,
  TAU,
} from "../paint/wash.js";
import { mix, rgba, vary } from "../paint/palette.js";

export const BED_W = 76;
export const BED_H = 92;
const FEET = 0.9; // where the clump meets the ground, as a share of the height

/** The bed flowers, in the order they bloom. (Apple blossom grows on trees: scenery.js.) */
export const FLOWERS = [
  "dandelion",
  "clover",
  "borage",
  "lavender",
  "thyme",
  "mint",
  "sunflower",
  "buckwheat",
  "heather",
  "ivy",
];
export const STAGES = ["seed", "leaf", "bud", "bloom", "faded", "dormant"];

// ------------------------------------------------------------ small tools
// Shared with scenery.js and creatures.js, which paint the same plants.

/** A stem: a gentle curve from the foot to a tip, leaning by `lean` radians. */
export function stem(r, x0, y0, len, lean, sway = 0.18) {
  const tipx = x0 + Math.sin(lean) * len;
  const tipy = y0 - Math.cos(lean) * len;
  const bend = r.gauss() * len * sway * 0.3 + Math.sin(lean) * len * sway;
  return smooth(
    [
      [x0, y0],
      [x0 + (tipx - x0) * 0.35 - bend * 0.3, y0 + (tipy - y0) * 0.35],
      [x0 + (tipx - x0) * 0.7 + bend * 0.1, y0 + (tipy - y0) * 0.7],
      [tipx, tipy],
    ],
    5,
    false,
  );
}

/** A stem that climbs and then nods over to one side, like a heavy flower. */
export function nod(r, x0, y0, len, lean, over = 7, dir = lean + r.gauss() * 0.05 >= 0 ? 1 : -1) {
  const tx = x0 + Math.sin(lean) * len;
  const ty = y0 - Math.cos(lean) * len;
  return smooth(
    [
      [x0, y0],
      [x0 + (tx - x0) * 0.4, y0 + (ty - y0) * 0.42],
      [x0 + (tx - x0) * 0.8, y0 + (ty - y0) * 0.84],
      [tx + dir * over * 0.35, ty - 1],
      [tx + dir * over, ty + over * 0.45],
    ],
    5,
    false,
  );
}

/** The point a share `t` of the way along a path. */
export function along(path, t) {
  const u = Math.max(0, Math.min(1, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(u));
  const f = u - i;
  return [
    path[i][0] + (path[i + 1][0] - path[i][0]) * f,
    path[i][1] + (path[i + 1][1] - path[i][1]) * f,
  ];
}

/** The direction a path is heading at `t`, in radians. */
export function heading(path, t) {
  const a = along(path, Math.max(0, t - 0.06));
  const b = along(path, Math.min(1, t + 0.06));
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/**
 * A tiny touch of colour straight off the brush tip. Cheaper than a wash,
 * for things under about 2 px: florets, berries, pollen, eyes.
 */
export function dot(ctx, r, x, y, rad, color, alpha = 0.85) {
  const c = vary(color, r, 0.05);
  const rot = r() * TAU;
  ctx.fillStyle = rgba(c, alpha * 0.4);
  ctx.beginPath();
  ctx.ellipse(x, y, rad * 1.35, rad * 1.2, rot, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(c, alpha * r.range(0.8, 1));
  ctx.beginPath();
  ctx.ellipse(x + r.gauss() * 0.15, y + r.gauss() * 0.15, rad, rad * r.range(0.8, 1), rot, 0, TAU);
  ctx.fill();
}

/** One short straight flick: a hair, a needle, a stamen. */
export function tick(ctx, r, x0, y0, x1, y1, color, alpha = 0.6, width = 0.6) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(vary(color, r, 0.05), alpha);
  ctx.lineWidth = width * r.range(0.8, 1.2);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 + r.gauss() * 0.2, y1 + r.gauss() * 0.2);
  ctx.stroke();
  ctx.restore();
}

/** A small soft dab: an ellipse laid as a quick wash. */
export function dab(ctx, r, x, y, rx, ry, color, o) {
  wash(ctx, ellipse(x, y, rx, ry, 7, o?.rot ?? r.gauss() * 0.4), color, {
    r,
    layers: 4,
    strength: 0.75,
    soft: 0.22,
    edge: 0.4,
    ...o,
  });
}

/** A heart-shaped leaf from its notch at (x, y), pointing along `angle`. */
export function heart(x, y, len, wid, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  return smooth(
    [
      at(0.02 * len, 0),
      at(-len * 0.13, -wid * 0.27),
      at(len * 0.05, -wid * 0.5),
      at(len * 0.36, -wid * 0.45),
      at(len * 0.74, -wid * 0.2),
      at(len, 0),
      at(len * 0.74, wid * 0.2),
      at(len * 0.36, wid * 0.45),
      at(len * 0.05, wid * 0.5),
      at(-len * 0.13, wid * 0.27),
    ],
    2,
  );
}

/** Snow lying on top of something: a blue-shadowed underside, white above. */
export function snowCap(ctx, r, x, y, wide, high = wide * 0.42) {
  wash(ctx, ellipse(x + 0.7, y + high * 0.25, wide * 0.52, high * 0.62, 8), "dusk", {
    r,
    layers: 4,
    strength: 0.32,
    soft: 0.25,
    edge: 0,
  });
  wash(
    ctx,
    smooth(
      [
        [x - wide * 0.5, y + high * 0.3],
        [x - wide * 0.32, y - high * 0.45],
        [x + wide * 0.08, y - high * 0.7],
        [x + wide * 0.42, y - high * 0.25],
        [x + wide * 0.5, y + high * 0.3],
        [x, y + high * 0.42],
      ],
      3,
    ),
    "white",
    { r, layers: 6, strength: 0.94, soft: 0.12, edge: 0.2, vary: 0.01 },
  );
}

/** Snow drifted round the foot of a plant, with its blue shadow. */
export function snowFoot(ctx, r, cx, cy, wide) {
  wash(ctx, ellipse(cx + 2, cy + 1.5, wide * 0.56, 4.6, 10), "dusk", {
    r,
    layers: 6,
    strength: 0.3,
    soft: 0.3,
    edge: 0,
  });
  wash(
    ctx,
    smooth(
      [
        [cx - wide * 0.5, cy + 1],
        [cx - wide * 0.3, cy - 3.6],
        [cx + wide * 0.02, cy - 4.8],
        [cx + wide * 0.34, cy - 3.2],
        [cx + wide * 0.5, cy + 1],
        [cx, cy + 2.6],
      ],
      4,
    ),
    "white",
    { r, layers: 8, strength: 0.93, soft: 0.14, edge: 0.2, vary: 0.01 },
  );
  wash(ctx, ellipse(cx + wide * 0.2, cy - 0.4, wide * 0.2, 1.8, 7), "sky", {
    r,
    layers: 4,
    strength: 0.4,
    soft: 0.4,
    edge: 0,
  });
}

/** A few specks of frost. */
function frost(ctx, r, cx, cy, radius, n = 10) {
  splatter(ctx, cx, cy, radius, "white", { r, n, size: 0.9, strength: 1.3 });
  splatter(ctx, cx, cy, radius, "sky", { r, n: Math.ceil(n / 2), size: 0.8, strength: 0.9 });
}

// The grassy foot every clump grows out of.
function tuft(ctx, r, cx, cy, wide, colors = ["sap", "leaf", "moss"], n = 9, tall = 16) {
  for (let i = 0; i < n; i++) {
    const a = r.range(-1.1, 1.1);
    const len = tall * r.range(0.6, 1.2);
    const x = cx + r.range(-wide, wide) * 0.5;
    brush(ctx, stem(r, x, cy + r.range(-1, 2), len, a, 0.4), r.pick(colors), {
      r,
      width: r.range(2.2, 3.6),
      strength: 0.7,
    });
  }
}

// Stems are painted from the outside in, so the middle ones overlap the rest.
const fan = (n) =>
  [...Array(n).keys()].sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));

// ------------------------------------------------------------------- seed

// What the little painted label on the stake shows, and the colour of the
// seedlings, per flower.
const SEED = {
  dandelion: { tag: ["dandelion", "sunflower"], sprout: "sap" },
  clover: { tag: ["clover", "rose"], sprout: "leaf" },
  borage: { tag: ["borage", "sky"], sprout: "sage" },
  lavender: { tag: ["lavender", "violet"], sprout: "sage" },
  thyme: { tag: ["mauve", "rose"], sprout: "moss" },
  mint: { tag: ["lilac", "lavender"], sprout: "leaf" },
  sunflower: { tag: ["sunflower", "chestnut"], sprout: "sap" },
  buckwheat: { tag: ["blush", "poppy"], sprout: "sap" },
  heather: { tag: ["heather", "plum"], sprout: "moss" },
  ivy: { tag: ["pine", "chartreuse"], sprout: "pine" },
};

// Freshly planted: turned soil, seedlings, and a stake with a painted label.
function seedBed(ctx, w, h, r, flower, variant) {
  const cx = w / 2;
  const cy = h * FEET;
  const look = SEED[flower];
  const side = variant ? -1 : 1;
  shadow(ctx, cx, cy + 2, w * 0.38, 4.6, r, 0.16);
  wash(
    ctx,
    smooth(
      [
        [cx - w * 0.37, cy],
        [cx - w * 0.3, cy - 6],
        [cx - w * 0.04, cy - 9.5],
        [cx + w * 0.27, cy - 7],
        [cx + w * 0.37, cy - 1],
        [cx + w * 0.12, cy + 3],
        [cx - w * 0.2, cy + 3],
      ],
      4,
    ),
    "soil",
    { r, layers: 10, strength: 0.86, soft: 0.2, charge: { color: "umber", n: 3, strength: 0.3 } },
  );
  // Furrows and crumbs.
  for (let i = 0; i < 3; i++) {
    const y = cy - 6 + i * 3.2;
    pencil(
      ctx,
      [
        [cx - w * 0.27 + i * 2, y + 1],
        [cx - 2, y - 1.2 + r.gauss() * 0.4],
        [cx + w * 0.25 - i, y + 0.6],
      ],
      { r, passes: 1, alpha: 0.4, width: 0.7, gaps: 0.3 },
    );
  }
  splatter(ctx, cx, cy - 3, w * 0.3, "umber", { r, n: 10, size: 0.9, strength: 0.8 });
  splatter(ctx, cx, cy - 4, w * 0.3, "straw", { r, n: 7, size: 0.8, strength: 0.8 });
  // The stake stands at the back, so the seedlings come up in front of it.
  const sx = cx + side * w * 0.2;
  const top = cy - 30;
  brush(
    ctx,
    [
      [sx, cy - 4],
      [sx + side * 0.6, cy - 16],
      [sx + side * 1.2, top + 6],
    ],
    "bark",
    { r, width: 2.4, strength: 0.85 },
  );
  const tag = roundRect(sx + side * 1.2 - 6.5, top - 6, 13, 14, 2);
  wash(ctx, tag, "white", { r, layers: 8, strength: 0.96, soft: 0.05, edge: 0.4 });
  pencil(ctx, tag, { r, closed: true, alpha: 0.55, width: 0.7 });
  // The label: a small picture of what will grow.
  const lx = sx + side * 1.2;
  tick(ctx, r, lx, top + 5.5, lx + 0.4, top + 1.5, "leaf", 0.8, 1);
  dab(ctx, r, lx - 0.4, top - 0.6, 3.1, 2.8, look.tag[0], { strength: 0.85 });
  dot(ctx, r, lx + 0.6, top - 0.2, 1.1, look.tag[1], 0.8);
  // Seedlings: a thread of stem and two seed leaves.
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = cx + ((i + 0.5) / n - 0.5) * w * 0.56 + r.gauss() * 1.5;
    const y = cy - 3.5 - r() * 3.5;
    const tall = r.range(4, 7);
    tick(ctx, r, x, y, x + r.gauss() * 0.6, y - tall, look.sprout, 0.9, 1);
    for (const s of [-1, 1]) {
      wash(
        ctx,
        leaf(x, y - tall, r.range(3.6, 4.8), 2.6, -Math.PI / 2 + s * r.range(0.75, 1.15)),
        r.pick([look.sprout, "sap", "meadow"]),
        { r, layers: 4, strength: 0.85, soft: 0.14, edge: 0.5 },
      );
    }
  }
}

// --------------------------------------------------------------- lavender

function lavender(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.36, 5, r);
  if (stage === "dormant") {
    // Lavender keeps its grey leaves through the winter: a frosted hummock.
    wash(ctx, blob(r, cx, cy - 8, w * 0.24, 0.16, 9, 0.6), "sage", {
      r,
      layers: 8,
      strength: 0.7,
      soft: 0.3,
      charge: { color: "dusk", n: 2, strength: 0.25 },
    });
    tuft(ctx, r, cx, cy, w * 0.5, ["sage", "stone", "olive", "sage"], 16, 20);
    for (let i = 0; i < 5; i++) {
      const p = stem(r, cx + r.range(-9, 9), cy - 2, h * r.range(0.3, 0.42), r.range(-0.6, 0.6));
      brush(ctx, p, "stone", { r, width: 1.1, strength: 0.7 });
    }
    snowCap(ctx, r, cx - 3, cy - 17, 24, 9);
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 14, w * 0.3);
    return;
  }
  tuft(ctx, r, cx, cy, w * 0.5, ["sage", "sage", "leaf"], 12, 20);
  if (stage === "leaf" || stage === "faded") {
    tuft(ctx, r, cx, cy, w * 0.5, stage === "leaf" ? ["sage", "mint"] : ["olive", "sage"], 10, 26);
    if (stage === "faded") {
      for (let i = 0; i < 7; i++) {
        const p = stem(r, cx + r.range(-10, 10), cy, h * r.range(0.4, 0.58), r.range(-0.55, 0.55));
        brush(ctx, p, "olive", { r, width: 1.3 });
        const tip = p[p.length - 1];
        wash(ctx, ellipse(tip[0], tip[1] + 3, 1.8, 5, 6), r.pick(["stone", "dusk"]), {
          r,
          layers: 5,
          strength: 0.6,
        });
      }
    }
    return;
  }
  const n = 11;
  for (const i of fan(n)) {
    const lean = ((i + 0.5) / n - 0.5) * 1.25 + r.gauss() * 0.05;
    const len = h * r.range(0.56, 0.76) * (1 - Math.abs(lean) * 0.18);
    const path = stem(r, cx + lean * 9 + r.gauss() * 1.5, cy - 1, len, lean);
    brush(ctx, path, r.pick(["sage", "leaf"]), { r, width: 1.5, strength: 0.75 });
    if (stage === "bud") {
      const tip = along(path, 0.96);
      wash(ctx, ellipse(tip[0], tip[1], 1.6, 3.4, 6), "sage", { r, layers: 5, strength: 0.7 });
      wash(ctx, ellipse(tip[0], tip[1] - 2, 1.2, 2, 6), "lilac", { r, layers: 4, strength: 0.6 });
      continue;
    }
    // The spike: pairs of little dabs up the top third, small at the tip.
    const dabs = r.int(6, 8);
    for (let k = 0; k < dabs; k++) {
      const t = 0.62 + (k / dabs) * 0.4;
      const [x, y] = along(path, Math.min(1, t));
      const size = 3.3 * (1 - (k / dabs) * 0.55);
      const side = (k % 2 ? 1 : -1) * size * 0.45;
      const color = r.pick(["violet", "lavender", "lavender", "lilac", "plum"]);
      wash(ctx, ellipse(x + side, y, size * 0.75, size, 6, r.gauss() * 0.4), color, {
        r,
        layers: 5,
        strength: 0.78,
        soft: 0.3,
        edge: 0.6,
      });
    }
    if (r.chance(0.45))
      pencil(ctx, [along(path, 0.25), along(path, 0.55), along(path, 0.8)], {
        r,
        passes: 1,
        alpha: 0.4,
        width: 0.7,
      });
  }
  splatter(ctx, cx, h * 0.3, w * 0.36, "lilac", { r, n: 9, size: 0.9, strength: 0.7 });
}

// ----------------------------------------------------------------- clover

function trefoil(ctx, r, x, y, s, color) {
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 1.25 + r.gauss() * 0.15;
    wash(
      ctx,
      ellipse(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8, s * 0.72, s * 0.62, 7, a),
      color,
      { r, layers: 5, strength: 0.75, soft: 0.18 },
    );
  }
}

// A clover head: a round ball of tiny florets, pale underneath and deep pink
// at the crown, with a fuzzy rim.
function pompom(ctx, r, x, y, rad) {
  wash(ctx, ellipse(x, y, rad, rad * 0.96, 10), "blush", {
    r,
    layers: 7,
    strength: 0.92,
    soft: 0.14,
    edge: 0.5,
  });
  wash(ctx, ellipse(x + 0.3, y - rad * 0.22, rad * 0.8, rad * 0.7, 9), "clover", {
    r,
    layers: 6,
    strength: 0.62,
    soft: 0.35,
    edge: 0,
  });
  // Florets fan up and out from the foot of the ball.
  const n = 15;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + ((k + 0.5) / n - 0.5) * 4.6 + r.gauss() * 0.1;
    const d = rad * r.range(0.55, 1.02);
    const fx = x + Math.cos(a) * d;
    const fy = y + Math.sin(a) * d * 0.96;
    const high = Math.sin(a) < 0.2;
    dot(
      ctx,
      r,
      fx,
      fy,
      rad * r.range(0.2, 0.27),
      high ? r.pick(["clover", "clover", "heather", "rose"]) : r.pick(["rose", "blush"]),
      0.8,
    );
  }
  dot(ctx, r, x - rad * 0.3, y - rad * 0.38, rad * 0.24, "white", 0.55);
  pencil(ctx, ellipse(x, y, rad, rad * 0.95, 9), {
    r,
    closed: true,
    passes: 1,
    alpha: 0.28,
    width: 0.55,
    gaps: 0.35,
  });
}

function clover(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.4, 5, r);
  const dull = stage === "faded" || stage === "dormant";
  // A low mat of leaves.
  for (let i = 0; i < 3; i++) {
    wash(
      ctx,
      blob(r, cx + r.range(-10, 10), cy - 9 - r() * 4, w * r.range(0.22, 0.3), 0.2, 9, 0.5),
      stage === "dormant" ? r.pick(["olive", "sage"]) : r.pick(["sap", "meadow", "leaf"]),
      { r, strength: 0.6, soft: 0.3, charge: { color: "moss", n: 2, strength: 0.3 } },
    );
  }
  for (let i = 0; i < 13; i++) {
    trefoil(
      ctx,
      r,
      cx + r.range(-w * 0.36, w * 0.36),
      cy - r.range(3, 20),
      r.range(3.2, 4.6),
      dull ? r.pick(["olive", "sage", "moss"]) : r.pick(["leaf", "sap", "moss"]),
    );
  }
  if (stage === "dormant") {
    snowCap(ctx, r, cx - 8, cy - 17, 20, 7);
    snowCap(ctx, r, cx + 11, cy - 13, 16, 6);
    snowFoot(ctx, r, cx, cy, w * 0.66);
    frost(ctx, r, cx, cy - 10, w * 0.32);
    return;
  }
  if (stage === "leaf") return;
  const heads = stage === "bud" ? 5 : 8;
  // Back row first, so the nearer heads overlap the farther.
  const spots = [...Array(heads).keys()].map((i) => ({
    x: cx + ((i + 0.5) / heads - 0.5) * w * 0.72 + r.gauss() * 2,
    top: cy - r.range(17, 36),
  }));
  spots.sort((a, b) => a.top - b.top);
  for (const { x, top } of spots) {
    brush(ctx, stem(r, x + r.gauss() * 2, cy - 8, cy - 8 - top, r.gauss() * 0.12), "leaf", {
      r,
      width: 1.3,
    });
    if (stage === "bud") {
      wash(ctx, ellipse(x, top, 2.6, 3.1, 7), "mint", { r, layers: 5 });
      wash(ctx, ellipse(x, top - 1.5, 1.7, 1.9, 6), "rose", { r, layers: 4, strength: 0.6 });
      continue;
    }
    if (stage === "faded") {
      wash(ctx, ellipse(x, top, 4.4, 4.2, 9), "soil", { r, layers: 6, strength: 0.66, soft: 0.2 });
      for (let k = 0; k < 6; k++)
        dot(ctx, r, x + r.gauss() * 2.2, top + r.gauss() * 2, 0.9, r.pick(["bark", "wood"]), 0.6);
      continue;
    }
    pompom(ctx, r, x, top, r.range(5.6, 7));
  }
}

// -------------------------------------------------------------- dandelion

function dandelion(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.38, 5, r);
  // A rosette of long toothed leaves, flat to the ground.
  const dull = stage === "dormant";
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 11 - 0.5) * 2.9 + r.gauss() * 0.1;
    const len = w * r.range(0.3, 0.44) * (dull ? 0.85 : 1);
    const flat = [Math.cos(a) * len, Math.sin(a) * len * 0.45];
    wash(
      ctx,
      leaf(cx, cy - 4, Math.hypot(...flat), 7, Math.atan2(flat[1], flat[0]), 0.6),
      dull ? r.pick(["olive", "sage"]) : r.pick(["leaf", "sap", "moss"]),
      { r, layers: 7, strength: 0.72, soft: 0.3 },
    );
  }
  if (dull) {
    snowCap(ctx, r, cx + 2, cy - 9, 22, 6.5);
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 6, w * 0.34);
    return;
  }
  if (stage === "leaf") return;
  const heads = stage === "bud" ? 4 : 7;
  for (let i = 0; i < heads; i++) {
    const x = cx + ((i + 0.5) / heads - 0.5) * w * 0.66 + r.gauss() * 2;
    const tall = r.range(18, 40);
    const path = stem(r, cx + (x - cx) * 0.4, cy - 6, tall, (x - cx) / 60 + r.gauss() * 0.08);
    brush(ctx, path, "sap", { r, width: 1.6 });
    const [tx, ty] = path[path.length - 1];
    if (stage === "bud") {
      wash(ctx, ellipse(tx, ty, 2.6, 3.6, 7), "leaf", { r, layers: 5 });
      wash(ctx, ellipse(tx, ty - 2.4, 1.8, 1.6, 6), "dandelion", { r, layers: 4 });
      continue;
    }
    if (stage === "faded" || (stage === "bloom" && i === heads - 2)) {
      // A clock: a ball of fluff, mostly paper showing through.
      wash(ctx, ellipse(tx, ty, 6.4, 6.2, 12), "white", {
        r,
        layers: 10,
        strength: 0.8,
        soft: 0.16,
        edge: 0,
      });
      wash(ctx, ellipse(tx + 1, ty + 1.4, 4.2, 3.8, 10), "cloud", {
        r,
        layers: 6,
        strength: 0.35,
        soft: 0.4,
        edge: 0,
      });
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU + r.gauss() * 0.15;
        tick(
          ctx,
          r,
          tx + Math.cos(a) * 2.2,
          ty + Math.sin(a) * 2.2,
          tx + Math.cos(a) * 5.4,
          ty + Math.sin(a) * 5.4,
          "inkSoft",
          0.22,
          0.4,
        );
      }
      pencil(ctx, ellipse(tx, ty, 6.3, 6.1, 12), {
        r,
        color: "inkSoft",
        closed: true,
        passes: 1,
        alpha: 0.3,
        width: 0.5,
        gaps: 0.5,
      });
      continue;
    }
    const rad = r.range(5.2, 6.6);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + r.gauss() * 0.1;
      wash(
        ctx,
        petal(tx, ty, rad * r.range(0.85, 1.1), rad * 0.3, a, 0.7),
        r.pick(["dandelion", "dandelion", "sunflower", "butter"]),
        { r, layers: 4, strength: 0.75, soft: 0.15, edge: 0.5 },
      );
    }
    wash(ctx, blob(r, tx, ty, rad * 0.42, 0.15), "sunflower", { r, layers: 6, strength: 0.8 });
    wash(ctx, blob(r, tx + 0.6, ty + 0.6, rad * 0.2, 0.2), "amber", {
      r,
      layers: 4,
      strength: 0.5,
    });
  }
}

// ----------------------------------------------------------------- borage

// A borage flower: five pointed sky-blue petals, a white eye, a dark beak.
function star(ctx, r, x, y, rad, young = false) {
  const turn = r() * TAU;
  for (let k = 0; k < 5; k++) {
    const a = turn + (k / 5) * TAU + Math.PI / 5;
    tick(ctx, r, x, y, x + Math.cos(a) * rad * 0.8, y + Math.sin(a) * rad * 0.8, "moss", 0.5, 0.7);
  }
  for (let k = 0; k < 5; k++) {
    const a = turn + (k / 5) * TAU + r.gauss() * 0.08;
    wash(
      ctx,
      leaf(x, y, rad * r.range(0.95, 1.1), rad * 0.62, a, 0.38),
      young ? r.pick(["lavender", "heather"]) : r.pick(["borage", "cornflower", "cornflower"]),
      { r, layers: 4, strength: 0.88, soft: 0.1, edge: 0.6, rounds: 1 },
    );
  }
  dot(ctx, r, x, y, rad * 0.3, "white", 0.95);
  dot(ctx, r, x + 0.15, y + 0.15, rad * 0.15, "plum", 0.95);
}

function borage(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.38, 5, r);
  if (stage === "dormant") {
    // An annual: a few withered stalks and limp grey leaves under the snow.
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / 5 - 0.5) * 2.6;
      wash(
        ctx,
        leaf(cx, cy - 3, r.range(13, 18), 6, Math.atan2(Math.sin(a) * 0.4, Math.cos(a)), 0.5),
        r.pick(["stone", "olive", "sage"]),
        { r, layers: 6, strength: 0.6, soft: 0.3 },
      );
    }
    for (let i = 0; i < 4; i++) {
      const p = nod(r, cx + r.range(-8, 8), cy - 2, r.range(16, 30), r.range(-0.5, 0.5), 6);
      brush(ctx, p, r.pick(["soil", "bark"]), { r, width: 1.4, strength: 0.75 });
      const tip = p[p.length - 1];
      dot(ctx, r, tip[0], tip[1] + 0.5, 1.4, "umber", 0.7);
    }
    snowCap(ctx, r, cx - 4, cy - 9, 20, 6.5);
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 12, w * 0.3);
    return;
  }
  const faded = stage === "faded";
  // Broad rough leaves splayed from the foot.
  const greens = faded ? ["olive", "sage", "straw"] : ["leaf", "sage", "moss"];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 7 - 0.5) * 2.8 + r.gauss() * 0.1;
    const len = r.range(16, 23);
    const fx = Math.cos(a) * len;
    const fy = Math.sin(a) * len * 0.62;
    const ang = Math.atan2(fy, fx);
    const lf = leaf(cx + Math.cos(a) * 2, cy - 3, Math.hypot(fx, fy), r.range(8, 10.5), ang, 0.5);
    wash(ctx, lf, r.pick(greens), {
      r,
      layers: 7,
      strength: 0.74,
      soft: 0.2,
      charge: { color: faded ? "soil" : "moss", n: 1, strength: 0.25 },
    });
    pencil(ctx, [lf[0], [(lf[0][0] + lf[4][0]) / 2, (lf[0][1] + lf[4][1]) / 2 - 0.6], lf[4]], {
      r,
      passes: 1,
      alpha: 0.22,
      width: 0.5,
      gaps: 0.2,
    });
  }
  if (stage === "leaf") {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + r.range(-0.6, 0.6);
      wash(ctx, leaf(cx + r.range(-5, 5), cy - 5, r.range(11, 16), 6.5, a, 0.5), r.pick(greens), {
        r,
        layers: 6,
        strength: 0.75,
        soft: 0.2,
      });
    }
    return;
  }
  const n = 6;
  const blooms = [];
  for (const i of fan(n)) {
    const lean = ((i + 0.5) / n - 0.5) * 1.2 + r.gauss() * 0.06;
    const len = h * r.range(0.4, 0.62) * (1 - Math.abs(lean) * 0.16);
    const path = nod(r, cx + lean * 8 + r.gauss(), cy - 3, len, lean, faded ? 9 : 7);
    brush(ctx, path, faded ? "olive" : r.pick(["sage", "leaf", "leaf"]), {
      r,
      width: 1.9,
      strength: 0.8,
    });
    // Hairs: borage is bristly all over.
    for (let k = 0; k < 9; k++) {
      const t = 0.15 + (k / 9) * 0.8;
      const [x, y] = along(path, t);
      const a = heading(path, t) + (k % 2 ? 1 : -1) * 1.4;
      tick(ctx, r, x, y, x + Math.cos(a) * 2.1, y + Math.sin(a) * 2.1, "inkSoft", 0.42, 0.4);
    }
    // A leaf or two clasping the stem.
    for (const t of [0.34, 0.56]) {
      const [x, y] = along(path, t);
      const s = (t > 0.4 ? 1 : -1) * (i % 2 ? 1 : -1);
      wash(
        ctx,
        leaf(x, y, r.range(8, 11), 5, -Math.PI / 2 + s * r.range(0.8, 1.2), 0.45),
        r.pick(greens),
        {
          r,
          layers: 5,
          strength: 0.75,
          soft: 0.18,
        },
      );
    }
    // The flowers hang off the arch at the top on little stalks.
    for (const t of [0.76, 0.9, 1]) {
      const [x, y] = along(path, t);
      const drop = r.range(2.5, 6);
      const fx = x + r.gauss() * 2;
      const fy = y + drop;
      tick(ctx, r, x, y, fx, fy - 1, faded ? "olive" : "sage", 0.8, 0.8);
      blooms.push([fx, fy, t]);
    }
  }
  for (const [x, y, t] of blooms) {
    if (stage === "bud" || (stage === "bloom" && t === 1 && r.chance(0.4))) {
      // A hairy calyx with a pink tip: borage opens pink and turns blue.
      dab(ctx, r, x, y, 1.9, 2.8, "sage", { rot: 0 });
      dot(ctx, r, x, y + 2.1, 1.2, r.pick(["rose", "heather"]), 0.85);
      for (const s of [-1, 1]) tick(ctx, r, x, y, x + s * 2.4, y + 2.6, "moss", 0.5, 0.5);
    } else if (faded) {
      // Seed cases: green stars with nothing left in them.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + r() * 0.5;
        tick(ctx, r, x, y, x + Math.cos(a) * 2.8, y + Math.sin(a) * 2.8, "olive", 0.8, 0.9);
      }
      dot(ctx, r, x, y, 1, "umber", 0.7);
      if (r.chance(0.25)) star(ctx, r, x + r.gauss(), y + 1, 3, false);
    } else {
      star(ctx, r, x, y, r.range(5, 6.3), r.chance(0.12));
    }
  }
  if (stage === "bloom")
    splatter(ctx, cx, h * 0.42, w * 0.36, "sky", { r, n: 7, size: 0.9, strength: 0.8 });
}

// ------------------------------------------------------------------ thyme

function thyme(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  const dormant = stage === "dormant";
  shadow(ctx, cx, cy + 2, w * 0.42, 5, r);
  // A cushion: three low domes that have grown into one.
  const domes = [
    [-15, 13, 14],
    [14, 14, 15],
    [-1, 20, 20],
  ];
  const green = dormant
    ? [mix("moss", "stone", 0.45), mix("pine", "stone", 0.4)]
    : stage === "faded"
      ? ["moss", "olive"]
      : ["moss", "leaf"];
  for (const [dx, high, half] of domes) {
    const x = cx + dx + r.gauss();
    wash(
      ctx,
      smooth(
        [
          [x - half, cy + 1],
          [x - half * 0.82, cy - high * 0.68],
          [x + r.gauss(), cy - high],
          [x + half * 0.82, cy - high * 0.68],
          [x + half, cy + 1],
          [x, cy + 3],
        ],
        4,
      ),
      r.pick(green),
      { r, layers: 9, strength: 0.82, soft: 0.2, charge: { color: "pine", n: 2, strength: 0.32 } },
    );
  }
  const top = (x) => {
    const u = (x - cx) / (w * 0.4);
    return cy - 19 * Math.sqrt(Math.max(0, 1 - u * u));
  };
  // Tiny leaves, and a few woody runners creeping out at the sides.
  for (let i = 0; i < 46; i++) {
    const x = cx + r.range(-w * 0.36, w * 0.36);
    const y = top(x) + r.range(1, 0.9 * (cy - top(x)) + 1);
    dot(ctx, r, x, y, r.range(0.8, 1.3), r.pick(["pine", "sap", "moss"]), 0.5);
  }
  for (const s of [-1, 1]) {
    const p = smooth(
      [
        [cx + s * w * 0.3, cy - 2],
        [cx + s * w * 0.38, cy - 3 + r.gauss()],
        [cx + s * w * 0.45, cy - 1 + r.gauss()],
      ],
      3,
      false,
    );
    brush(ctx, p, "bark", { r, width: 1.1, strength: 0.7 });
    for (let k = 1; k < 5; k++) {
      const [x, y] = along(p, k / 5 + 0.1);
      dot(ctx, r, x, y - 1.2, 1.2, r.pick(["moss", "leaf"]), 0.8);
      dot(ctx, r, x + 0.5, y + 1, 1.1, "moss", 0.7);
    }
  }
  if (dormant) {
    snowCap(ctx, r, cx - 2, cy - 14, 30, 8);
    snowCap(ctx, r, cx + 17, cy - 9, 13, 5);
    snowFoot(ctx, r, cx, cy, w * 0.72);
    frost(ctx, r, cx, cy - 8, w * 0.34);
    return;
  }
  if (stage === "leaf") return;
  if (stage === "bloom") {
    // A haze of colour first, then the flower heads on top of it.
    for (let i = 0; i < 9; i++) {
      const x = cx + ((i + 0.5) / 9 - 0.5) * w * 0.66 + r.gauss() * 2;
      dab(ctx, r, x, top(x) + r.range(2, 9), r.range(4, 6), r.range(2.6, 3.6), "mauve", {
        strength: 0.45,
        soft: 0.45,
        edge: 0,
      });
    }
  }
  const heads = stage === "bloom" ? 46 : stage === "bud" ? 18 : 20;
  for (let i = 0; i < heads; i++) {
    // Spread evenly across, thickest over the crown.
    const x = cx + ((((i * 7) % heads) + 0.5) / heads - 0.5) * w * 0.74 + r.gauss() * 1.5;
    const y = top(x) + r.range(-1.5, 0.7 * (cy - top(x))) * r.range(0.5, 1);
    if (stage === "bud") {
      dot(ctx, r, x, y, 1.1, r.pick(["rose", "blush", "mauve"]), 0.8);
    } else if (stage === "faded") {
      dot(ctx, r, x, y, 1.2, r.pick(["soil", "terracotta", "wood"]), 0.7);
    } else {
      const c = r.pick(["mauve", "mauve", "rose", "heather", "lilac"]);
      for (let k = 0; k < 4; k++)
        dot(ctx, r, x + r.gauss() * 1.3, y + r.gauss() * 1.1, r.range(1, 1.5), c, 0.85);
      if (r.chance(0.4)) dot(ctx, r, x, y - 0.5, 0.8, "blush", 0.9);
    }
  }
}

// ------------------------------------------------------------------- mint

// A mint leaf: an oval with a saw-toothed edge.
function toothed(x, y, len, wid, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const out = [at(0, 0)];
  const n = 5;
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 1; i <= n * 2; i++) {
      const t = i / (n * 2 + 1);
      const half = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid * 0.5 * (i % 2 ? 1.08 : 0.82);
      pts.push(at(len * t, side * half));
    }
    if (side === -1) out.push(...pts, at(len, 0));
    else out.push(...pts.reverse());
  }
  return out;
}

// One of water mint's flower balls.
function whorl(ctx, r, x, y, rad, stage) {
  if (stage === "bud") {
    dab(ctx, r, x, y, rad * 0.62, rad * 0.56, "sage", { strength: 0.85 });
    dot(ctx, r, x, y - rad * 0.2, rad * 0.26, "lilac", 0.8);
    return;
  }
  if (stage === "faded") {
    dab(ctx, r, x, y, rad * 0.74, rad * 0.66, "soil", { strength: 0.8 });
    for (let k = 0; k < 4; k++)
      dot(ctx, r, x + r.gauss() * rad * 0.4, y + r.gauss() * rad * 0.3, 0.8, "bark", 0.7);
    return;
  }
  wash(ctx, ellipse(x, y, rad, rad * 0.9, 9), "lilac", {
    r,
    layers: 6,
    strength: 0.88,
    soft: 0.2,
    edge: 0.5,
  });
  dab(ctx, r, x + rad * 0.2, y + rad * 0.25, rad * 0.6, rad * 0.45, "lavender", {
    strength: 0.5,
    soft: 0.4,
    edge: 0,
  });
  // Stamens stick out all round, which is what makes it a pompom.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + r.gauss() * 0.2;
    dot(
      ctx,
      r,
      x + Math.cos(a) * rad * 1.02,
      y + Math.sin(a) * rad * 0.92,
      rad * 0.2,
      r.pick(["lilac", "lavender", "mauve"]),
      0.8,
    );
  }
  dot(ctx, r, x - rad * 0.3, y - rad * 0.3, rad * 0.25, "white", 0.5);
}

function mint(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.36, 5, r);
  const stalk = mix("plum", "chestnut", 0.4); // water mint's stems are purple
  if (stage === "dormant") {
    // Dead stalks with their seed whorls still on, and next year's shoots.
    for (let i = 0; i < 5; i++) {
      const lean = ((i + 0.5) / 5 - 0.5) * 0.9 + r.gauss() * 0.1;
      const p = stem(r, cx + lean * 12, cy - 1, r.range(22, 40), lean, 0.1);
      brush(ctx, p, r.pick(["bark", "soil"]), { r, width: 1.3, strength: 0.75 });
      for (const t of [0.72, 0.9, 1]) {
        const [x, y] = along(p, t);
        dot(ctx, r, x, y, 1.7, "umber", 0.7);
      }
    }
    for (let i = 0; i < 5; i++)
      dab(ctx, r, cx + r.range(-14, 14), cy - r.range(3, 6), 3.2, 2, "sage", { strength: 0.7 });
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 16, w * 0.28);
    return;
  }
  const faded = stage === "faded";
  const greens = faded ? ["olive", "sage", "moss"] : ["leaf", "moss", "sap"];
  const n = 5;
  for (const i of fan(n)) {
    const u = (i + 0.5) / n - 0.5;
    const lean = u * 0.6 + r.gauss() * 0.04;
    const full = h * r.range(0.5, 0.68) * (1 - Math.abs(u) * 0.3);
    const len = stage === "leaf" ? full * 0.62 : full;
    const path = stem(r, cx + u * w * 0.44 + r.gauss(), cy - 1, len, lean, 0.08);
    brush(ctx, path, stalk, { r, width: 1.7, strength: 0.7 });
    // Leaves in opposite pairs, smaller as they climb.
    const flowers = stage !== "leaf";
    const nodes = flowers ? [0.15, 0.35, 0.55] : [0.2, 0.46, 0.72, 0.96];
    for (const t0 of nodes) {
      const t = Math.min(1, t0 + r.range(-0.05, 0.05));
      const [x, y] = along(path, t);
      const size = (flowers ? 13 : 12) * (1 - t * 0.45) * r.range(0.85, 1.12);
      for (const s of [-1, 1]) {
        // The lower leaves hang, the upper ones reach.
        const a = -Math.PI / 2 + lean + s * (r.range(1.0, 1.5) + (0.5 - t) * 0.5);
        wash(ctx, toothed(x, y, size, size * 0.56, a), r.pick(greens), {
          r,
          layers: 5,
          strength: 0.82,
          soft: 0.07,
          edge: 0.6,
          rounds: 1,
          detail: 1,
        });
        tick(
          ctx,
          r,
          x,
          y,
          x + Math.cos(a) * size * 0.8,
          y + Math.sin(a) * size * 0.8,
          "pine",
          0.3,
          0.5,
        );
      }
    }
    if (!flowers) continue;
    // Whorls stacked up the top of the stem, the biggest at the tip.
    const balls = [
      [0.7, 3.4],
      [0.85, 4.2],
      [1, 5.1],
    ];
    for (const [t, rad] of balls) {
      const [x, y] = along(path, t);
      if (t < 1)
        for (const s of [-1, 1])
          dab(ctx, r, x + s * 3.4, y + 1.4, 2.6, 1.3, r.pick(greens), { rot: s * 0.5, layers: 3 });
      whorl(ctx, r, x, y, rad * r.range(0.9, 1.08), stage);
    }
  }
}

// -------------------------------------------------------------- sunflower

function sunHead(ctx, r, x, y, rad, tilt) {
  const sq = 0.9;
  // Green bracts peeping out behind.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + r() * 0.4;
    dab(ctx, r, x + Math.cos(a) * rad * 0.72, y + Math.sin(a) * rad * 0.72 * sq, 2.4, 1.6, "moss", {
      rot: a,
      layers: 3,
    });
  }
  const disc = rad * 0.4;
  for (const [n, reach, colors, off] of [
    [13, 1, ["sunflower", "honey", "sunflower"], 0],
    [13, 0.9, ["dandelion", "dandelion", "sunflower", "butter"], 0.5],
  ]) {
    for (let k = 0; k < n; k++) {
      const a = ((k + off) / n) * TAU + tilt + r.gauss() * 0.07;
      const len = (rad - disc * 0.7) * reach * r.range(0.88, 1.08);
      wash(
        ctx,
        petal(
          x + Math.cos(a) * disc * 0.7,
          y + Math.sin(a) * disc * 0.7 * sq,
          len,
          rad * 0.34,
          Math.atan2(Math.sin(a) * sq, Math.cos(a)),
          0.55,
        ),
        r.pick(colors),
        { r, layers: 4, strength: 0.84, soft: 0.12, edge: 0.6 },
      );
    }
  }
  // The seed disc: dark, with a paler heart and a ring of pollen.
  wash(ctx, ellipse(x, y, disc * 1.06, disc * sq, 10), "chestnut", {
    r,
    layers: 8,
    strength: 0.9,
    soft: 0.12,
    charge: { color: "umber", n: 2, strength: 0.4 },
  });
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU + r() * 0.3;
    dot(
      ctx,
      r,
      x + Math.cos(a) * disc * 0.86,
      y + Math.sin(a) * disc * 0.8 * sq,
      0.9,
      "amber",
      0.9,
    );
  }
  dab(ctx, r, x - disc * 0.15, y - disc * 0.15, disc * 0.42, disc * 0.36, "bark", {
    strength: 0.6,
    soft: 0.4,
    edge: 0,
  });
  pencil(ctx, ellipse(x, y, disc * 1.05, disc * sq, 9), {
    r,
    closed: true,
    passes: 1,
    alpha: 0.35,
    width: 0.6,
    gaps: 0.3,
  });
}

const SUN_PLAN = [
  // foot dx, height as a share of the room, lean, head size
  [
    [-11, 0.72, -0.17, 0.95],
    [3, 0.98, 0.04, 1.08],
    [13, 0.5, 0.32, 0.85],
  ],
  [
    [12, 0.74, 0.16, 0.98],
    [-4, 0.96, -0.07, 1.05],
    [-13, 0.48, -0.3, 0.82],
  ],
];

function sunflower(ctx, w, h, r, stage, variant) {
  const cx = w / 2;
  const cy = h * FEET;
  const room = cy - 17; // how far a head's middle can sit above the ground
  shadow(ctx, cx, cy + 2, w * 0.4, 5.5, r, 0.24);
  if (stage === "dormant") {
    // Last year's stalks, one still holding a seed head for the birds.
    const plan = SUN_PLAN[variant % 2];
    for (let i = 0; i < 3; i++) {
      const [dx, tall, lean] = plan[i];
      const len = room * tall * (i === 1 ? 0.72 : 0.5);
      const p =
        i === 1 ? nod(r, cx + dx, cy - 1, len, lean, 9) : stem(r, cx + dx, cy - 1, len, lean * 1.6);
      brush(ctx, p, r.pick(["bark", "soil"]), { r, width: 2.2, strength: 0.8 });
      const tip = p[p.length - 1];
      if (i === 1) {
        wash(ctx, ellipse(tip[0], tip[1] + 3, 6.5, 5, 9), "umber", {
          r,
          layers: 7,
          strength: 0.85,
          soft: 0.15,
          charge: { color: "coal", n: 1, strength: 0.3 },
        });
        for (let k = 0; k < 5; k++)
          tick(
            ctx,
            r,
            tip[0] + (k - 2) * 2.4,
            tip[1] + 6,
            tip[0] + (k - 2) * 3,
            tip[1] + 9.5,
            "soil",
            0.7,
            1,
          );
        snowCap(ctx, r, tip[0] - 0.5, tip[1] - 1.5, 13, 5);
      } else {
        // A limp dead leaf.
        wash(ctx, leaf(tip[0], tip[1], 9, 5, Math.PI / 2 + lean * 2, 0.4), "soil", {
          r,
          layers: 5,
          strength: 0.6,
        });
      }
    }
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 24, w * 0.3, 8);
    return;
  }
  const faded = stage === "faded";
  const greens = faded ? ["olive", "moss", "straw"] : ["leaf", "moss", "leaf"];
  tuft(ctx, r, cx, cy, w * 0.4, faded ? ["olive", "sap"] : ["sap", "leaf"], 5, 10);
  const plan = SUN_PLAN[variant % 2].map(([dx, tall, lean, size]) => ({ dx, tall, lean, size }));
  const heads = [];
  // Tallest at the back.
  for (const s of [...plan].sort((a, b) => b.tall - a.tall)) {
    const len = room * s.tall * (stage === "leaf" ? 0.56 : stage === "bud" ? 0.86 : 1);
    const path = faded
      ? nod(r, cx + s.dx, cy - 1, len * 0.94, s.lean, 9, s.dx > 4 ? -1 : s.dx < -4 ? 1 : undefined)
      : stem(r, cx + s.dx, cy - 1, len, s.lean, 0.12);
    brush(ctx, path, faded ? "olive" : "leaf", {
      r,
      width: (t) => 3.6 - t * 1.2,
      strength: 0.88,
      edge: 0.5,
    });
    // Big heart-shaped leaves, alternating, their tips hanging.
    const nodes = stage === "leaf" ? [0.3, 0.55, 0.8, 1] : [0.22, 0.42, 0.6, 0.76];
    nodes.forEach((t, k) => {
      const [x, y] = along(path, t);
      const side = (k % 2 ? 1 : -1) * (s.lean >= 0 ? 1 : -1);
      const size = (stage === "leaf" ? 15 : 16.5) * (1 - t * 0.38) * s.size;
      const a = (side > 0 ? 0 : Math.PI) + side * (faded ? 0.75 : r.range(0.05, 0.4));
      const lf = heart(x + side * 1.5, y, size, size * 0.8, a);
      wash(ctx, lf, r.pick(greens), {
        r,
        layers: 6,
        strength: 0.8,
        soft: 0.12,
        edge: 0.6,
        charge: { color: faded ? "soil" : "sap", n: 1, strength: 0.3 },
      });
      pencil(ctx, [lf[0], lf[10]], { r, passes: 1, alpha: 0.28, width: 0.5 });
    });
    heads.push({ at: path[path.length - 1], s, dir: heading(path, 1) });
  }
  if (stage === "leaf") return;
  for (const { at, s, dir } of heads) {
    const [x, y] = at;
    const rad = 13 * s.size;
    if (stage === "bud") {
      // A fat green bud, its bracts just parting on yellow.
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + ((k + 0.5) / 9 - 0.5) * 4.4;
        wash(ctx, leaf(x, y + 1, rad * 0.62, rad * 0.3, a, 0.4), r.pick(["leaf", "moss"]), {
          r,
          layers: 4,
          strength: 0.82,
          soft: 0.12,
        });
      }
      dab(ctx, r, x, y, rad * 0.4, rad * 0.36, "leaf", { strength: 0.88 });
      dab(ctx, r, x, y - rad * 0.14, rad * 0.24, rad * 0.18, "dandelion", { strength: 0.85 });
      continue;
    }
    if (faded) {
      // Hanging its head: seeds ripe, the last petals shrivelled.
      const hx = x + Math.cos(dir) * 2;
      const hy = y + 3;
      for (let k = 0; k < 9; k++) {
        const a = Math.PI / 2 + ((k + 0.5) / 9 - 0.5) * 2.6;
        wash(
          ctx,
          petal(
            hx + Math.cos(a) * rad * 0.3,
            hy + Math.sin(a) * rad * 0.26,
            rad * r.range(0.3, 0.46),
            rad * 0.2,
            a,
            0.5,
          ),
          r.pick(["amber", "straw", "honey", "soil"]),
          { r, layers: 4, strength: 0.75, soft: 0.15 },
        );
      }
      wash(ctx, ellipse(hx, hy, rad * 0.52, rad * 0.4, 10), "umber", {
        r,
        layers: 8,
        strength: 0.88,
        soft: 0.12,
        charge: { color: "chestnut", n: 2, strength: 0.4 },
      });
      for (let k = 0; k < 7; k++)
        dot(ctx, r, hx + r.gauss() * rad * 0.2, hy + r.gauss() * rad * 0.14, 0.8, "coal", 0.6);
      dab(ctx, r, hx - Math.cos(dir) * 3, hy - rad * 0.36, rad * 0.42, rad * 0.2, "olive", {
        strength: 0.8,
      });
      continue;
    }
    sunHead(ctx, r, x, y, rad, s.lean);
  }
}

// -------------------------------------------------------------- buckwheat

// A little domed cluster of buckwheat flowers, buds or seeds.
function cluster(ctx, r, x, y, rad, stage) {
  if (stage === "bud") {
    for (let k = 0; k < 5; k++)
      dot(
        ctx,
        r,
        x + r.gauss() * rad * 0.4,
        y + r.gauss() * rad * 0.3,
        1.1,
        r.pick(["sage", "rose", "blush"]),
        0.85,
      );
    return;
  }
  if (stage === "faded") {
    for (let k = 0; k < 7; k++)
      dot(
        ctx,
        r,
        x + r.gauss() * rad * 0.45,
        y + r.gauss() * rad * 0.35,
        r.range(1, 1.5),
        r.pick(["chestnut", "umber", "bark"]),
        0.9,
      );
    return;
  }
  dab(ctx, r, x, y, rad, rad * 0.72, "blush", { strength: 0.7, soft: 0.3, edge: 0.5 });
  for (let k = 0; k < 9; k++) {
    const a = r() * TAU;
    const d = rad * Math.sqrt(r()) * 0.95;
    dot(ctx, r, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r.range(1.1, 1.6), "white", 0.95);
  }
  for (let k = 0; k < 3; k++)
    dot(
      ctx,
      r,
      x + r.gauss() * rad * 0.4,
      y + r.gauss() * rad * 0.3,
      0.7,
      r.pick(["rose", "clover"]),
      0.85,
    );
}

function buckwheat(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx, cy + 2, w * 0.38, 5, r);
  const reds = ["poppy", "terracotta", "chestnut"];
  if (stage === "dormant") {
    // Stubble: the crop was cut, the red stalks stand in the snow.
    for (let i = 0; i < 9; i++) {
      const x = cx + ((i + 0.5) / 9 - 0.5) * w * 0.6 + r.gauss();
      const p = stem(r, x, cy - 1, r.range(7, 17), r.gauss() * 0.35, 0.1);
      brush(ctx, p, r.pick(["chestnut", "terracotta", "bark"]), { r, width: 1.6, strength: 0.8 });
    }
    snowFoot(ctx, r, cx, cy, w * 0.64);
    frost(ctx, r, cx, cy - 9, w * 0.3);
    return;
  }
  const faded = stage === "faded";
  const greens = faded ? ["straw", "olive", "apricot"] : ["leaf", "sap", "leaf"];
  const n = 6;
  const tops = [];
  for (const i of fan(n)) {
    const u = (i + 0.5) / n - 0.5;
    const lean = u * 1.0 + r.gauss() * 0.06;
    const full = h * r.range(0.42, 0.62) * (1 - Math.abs(u) * 0.3);
    const len = stage === "leaf" ? full * 0.6 : full;
    const path = stem(r, cx + u * w * 0.3 + r.gauss(), cy - 1, len, lean, 0.3);
    brush(ctx, path, r.pick(reds), { r, width: 1.7, strength: 0.85 });
    // Heart leaves on little red stalks, alternating.
    const nodes = stage === "leaf" ? [0.3, 0.55, 0.8, 1] : [0.24, 0.44, 0.62];
    nodes.forEach((t, k) => {
      const [x, y] = along(path, t);
      const side = (k + i) % 2 ? 1 : -1;
      const size = 10.5 * (1 - t * 0.35);
      const a = (side > 0 ? 0 : Math.PI) + side * r.range(-0.5, 0.1);
      const bx = x + Math.cos(a) * 2.5;
      const by = y + Math.sin(a) * 2.5;
      tick(ctx, r, x, y, bx, by, "terracotta", 0.8, 0.8);
      wash(ctx, heart(bx, by, size, size * 0.92, a), r.pick(greens), {
        r,
        layers: 5,
        strength: 0.8,
        soft: 0.1,
        edge: 0.6,
      });
    });
    if (stage === "leaf") continue;
    tops.push([...along(path, 1), 5]);
    // Side sprays out of the upper leaf joints.
    for (const t of [0.72, 0.86]) {
      const [x, y] = along(path, t);
      const side = r.chance(0.5) ? 1 : -1;
      const ex = x + side * r.range(5, 8);
      const ey = y - r.range(3, 6);
      tick(ctx, r, x, y, ex, ey, r.pick(reds), 0.85, 0.9);
      tops.push([ex, ey, 4]);
    }
  }
  for (const [x, y, rad] of tops) cluster(ctx, r, x, y - 1, rad * r.range(0.9, 1.15), stage);
  if (stage === "bloom")
    splatter(ctx, cx, h * 0.4, w * 0.36, "white", { r, n: 8, size: 0.9, strength: 1.2 });
}

// ---------------------------------------------------------------- heather

function heather(ctx, w, h, r, stage) {
  const cx = w / 2;
  const cy = h * FEET;
  const dormant = stage === "dormant";
  shadow(ctx, cx, cy + 2, w * 0.42, 5, r);
  const dark = dormant ? mix("pine", "umber", 0.35) : "pine";
  // The body of the bush, then the sprigs standing out of it.
  wash(ctx, blob(r, cx, cy - 11, w * 0.33, 0.14, 10, 0.5), dark, {
    r,
    layers: 9,
    strength: 0.62,
    soft: 0.3,
    charge: { color: "moss", n: 2, strength: 0.3 },
  });
  const bells =
    stage === "bloom"
      ? ["heather", "heather", "clover", "plum", "rose", "mauve"]
      : stage === "bud"
        ? ["blush", "rose", "sage"]
        : ["terracotta", "soil", "chestnut", "wood"];
  const n = 13;
  for (const i of fan(n)) {
    const u = (i + 0.5) / n - 0.5;
    const lean = u * 2.0 + r.gauss() * 0.08;
    const len = h * r.range(0.27, 0.41) * (1 - Math.abs(u) * 0.5);
    const path = stem(r, cx + u * w * 0.36 + r.gauss(), cy - 2, len, lean, 0.25);
    brush(ctx, path, r.pick([dark, "moss"]), { r, width: 1.5, strength: 0.8 });
    // Needles all the way up.
    for (let k = 0; k < 9; k++) {
      const t = 0.12 + (k / 9) * 0.86;
      const [x, y] = along(path, t);
      const a = heading(path, t) + (k % 2 ? 1 : -1) * 0.9;
      tick(
        ctx,
        r,
        x,
        y,
        x + Math.cos(a) * 2.4,
        y + Math.sin(a) * 2.4,
        r.pick([dark, "moss"]),
        0.75,
        0.8,
      );
    }
    if (stage === "leaf" || dormant) continue;
    // Bells crowd the upper part of every sprig.
    const count = stage === "bud" ? 5 : 9;
    for (let k = 0; k < count; k++) {
      const t = (stage === "bud" ? 0.6 : 0.34) + (k / count) * (stage === "bud" ? 0.4 : 0.68);
      const [x, y] = along(path, Math.min(1, t));
      const side = (k % 2 ? 1 : -1) * r.range(0.8, 1.9);
      const size = (stage === "bud" ? 1.2 : 1.9) * (1 - (k / count) * 0.35);
      if (stage === "bloom" && k % 3 === 0)
        dab(ctx, r, x + side, y + 0.4, size * 1.15, size * 1.3, r.pick(bells), {
          layers: 3,
          strength: 0.8,
        });
      else dot(ctx, r, x + side, y + 0.4, size * 0.85, r.pick(bells), 0.88);
    }
  }
  if (dormant) {
    snowCap(ctx, r, cx - 6, cy - 25, 22, 8);
    snowCap(ctx, r, cx + 13, cy - 18, 15, 6);
    snowCap(ctx, r, cx - 21, cy - 13, 11, 5);
    snowFoot(ctx, r, cx, cy, w * 0.7);
    frost(ctx, r, cx, cy - 16, w * 0.34);
    return;
  }
  if (stage === "bloom")
    splatter(ctx, cx, cy - 22, w * 0.36, "mauve", { r, n: 8, size: 0.9, strength: 0.8 });
}

// -------------------------------------------------------------------- ivy

// An ivy leaf: five lobes, the middle one longest. (x, y) is where the
// stalk joins; the tip points along `angle`.
function ivyLeaf(x, y, size, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u, v) => [x + u * size * c - v * size * s, y + u * size * s + v * size * c];
  return [
    at(0, 0),
    at(-0.2, -0.3),
    at(-0.08, -0.62),
    at(0.2, -0.4),
    at(0.42, -0.66),
    at(0.56, -0.3),
    at(1, 0),
    at(0.56, 0.3),
    at(0.42, 0.66),
    at(0.2, 0.4),
    at(-0.08, 0.62),
    at(-0.2, 0.3),
  ];
}

function ivyBall(ctx, r, x, y, rad, stage) {
  const colors =
    stage === "bud"
      ? ["sage", "leaf", "sage"]
      : stage === "bloom"
        ? ["chartreuse", "chartreuse", "butter", "olive"]
        : ["coal", "coal", mix("plum", "coal", 0.5)];
  if (stage === "bloom")
    dab(ctx, r, x, y, rad, rad * 0.95, "chartreuse", { strength: 0.6, soft: 0.3, edge: 0.5 });
  const n = stage === "bud" ? 6 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + r() * 0.3;
    const d = rad * (k % 3 === 0 ? 0.3 : 0.82);
    dot(
      ctx,
      r,
      x + Math.cos(a) * d,
      y + Math.sin(a) * d,
      rad * (stage === "bud" ? 0.26 : 0.32),
      r.pick(colors),
      0.92,
    );
  }
  if (stage === "bloom")
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + r();
      dot(ctx, r, x + Math.cos(a) * rad * 1.1, y + Math.sin(a) * rad * 1.1, 0.5, "butter", 0.9);
    }
  else if (stage !== "bud") dot(ctx, r, x - rad * 0.3, y - rad * 0.35, 0.5, "dusk", 0.7);
}

function ivy(ctx, w, h, r, stage, variant) {
  const cx = w / 2;
  const cy = h * FEET;
  const dormant = stage === "dormant";
  shadow(ctx, cx + 1, cy + 2, w * 0.36, 5, r, 0.24);
  // The post: a rough stake, a little crooked, cut on the slant.
  const flip = variant % 2 ? -1 : 1;
  const px = cx + flip * 2;
  const tall = variant % 2 ? 56 : 63;
  const top = cy - tall;
  const tilt = flip * 2.2;
  const post = [
    [px - 4.6, cy],
    [px - 4.4 + tilt * 0.5, cy - tall * 0.5],
    [px - 4 + tilt, top + 2.5],
    [px + tilt + flip, top - 1.5],
    [px + 4.4 + tilt, top + 1.5],
    [px + 4.8 + tilt * 0.5, cy - tall * 0.5],
    [px + 5, cy],
  ];
  wash(ctx, post, "wood", {
    r,
    layers: 10,
    strength: 0.92,
    soft: 0.05,
    charge: { color: "bark", n: 3, strength: 0.3 },
  });
  wash(
    ctx,
    [
      [px + 1.5, cy],
      [px + 1.5 + tilt * 0.5, cy - tall * 0.5],
      [px + 1.5 + tilt, top + 2],
      [px + 4.4 + tilt, top + 2],
      [px + 4.8 + tilt * 0.5, cy - tall * 0.5],
      [px + 5, cy],
    ],
    "umber",
    { r, layers: 5, strength: 0.22, soft: 0.06, edge: 0, glaze: true },
  );
  pencil(ctx, post, { r, alpha: 0.55, width: 0.85, gaps: 0.08 });
  hatch(ctx, px - 3, top + 6, 6, tall - 14, Math.PI / 2 + 0.05, { r, n: 6, len: 6, alpha: 0.3 });
  // Where the leaves sit: heaped at the foot, winding up, spilling off the top.
  const spots = [];
  for (let i = 0; i < 7; i++)
    spots.push([px + ((i + 0.5) / 7 - 0.5) * 40 + r.gauss() * 2, cy - r.range(3, 10), 1]);
  const turns = 8;
  for (let k = 0; k < turns; k++) {
    const t = (k + 0.5) / turns;
    const side = Math.sin(k * 2.1 + variant);
    spots.push([px + tilt * t + side * 7 + r.gauss(), cy - 9 - t * (tall - 20), 0.94]);
  }
  // The post's cut top is left showing above the last of them.
  for (let i = 0; i < 3; i++)
    spots.push([px + tilt + (i - 1) * 6 + r.gauss(), top + r.range(7, 12), 0.88]);
  // A strand that has let go and hangs.
  const hang = [];
  for (let i = 1; i <= 3; i++)
    hang.push([px + tilt - flip * (6 + i * 1.5), top + 3 + i * 6.5, 0.78]);
  // The vine itself.
  const vine = smooth(
    spots.slice(7, 7 + turns).map(([x, y]) => [x, y]),
    3,
    false,
  );
  brush(ctx, vine, "umber", { r, width: 1.3, strength: 0.7 });
  pencil(ctx, [[px + tilt - flip * 4, top + 2], ...hang.map(([x, y]) => [x, y])], {
    r,
    color: "umber",
    passes: 1,
    alpha: 0.7,
    width: 0.8,
  });
  const leafDark = dormant ? mix("pine", "dusk", 0.25) : "pine";
  const paintLeaf = ([x, y, k]) => {
    const size = r.range(8, 10.5) * k;
    const a = Math.PI / 2 + r.gauss() * 0.9 + (x - px) * 0.04;
    const lf = ivyLeaf(x - Math.cos(a) * size * 0.4, y - Math.sin(a) * size * 0.4, size, a);
    wash(ctx, lf, r.pick([leafDark, leafDark, "moss"]), {
      r,
      layers: 5,
      strength: 0.88,
      soft: 0.07,
      edge: 0.7,
      rounds: 1,
      detail: 1,
    });
    // Pale veins.
    tick(ctx, r, lf[0][0], lf[0][1], lf[6][0], lf[6][1], "sage", 0.55, 0.5);
    tick(ctx, r, lf[0][0], lf[0][1], lf[4][0], lf[4][1], "sage", 0.4, 0.4);
    tick(ctx, r, lf[0][0], lf[0][1], lf[8][0], lf[8][1], "sage", 0.4, 0.4);
  };
  [...spots, ...hang].forEach(paintLeaf);
  // Flower balls on short stalks, standing clear of the leaves.
  if (stage !== "leaf") {
    const balls = stage === "bud" ? 5 : 7;
    for (let i = 0; i < balls; i++) {
      const t = 0.18 + (i / balls) * 0.86;
      const side = (i % 2 ? 1 : -1) * flip;
      const bx = px + tilt * t + side * r.range(9, 14);
      const by = cy - 10 - t * (tall - 8) + r.gauss() * 2;
      tick(ctx, r, px + tilt * t + side * 4, by + 4, bx, by, "olive", 0.85, 0.9);
      ivyBall(ctx, r, bx, by, r.range(3.6, 4.5) * (stage === "bud" ? 0.8 : 1), stage);
    }
  }
  if (dormant) {
    snowCap(ctx, r, px + tilt + flip * 0.5, top - 1.5, 12, 5.5);
    snowCap(ctx, r, px - flip * 9, cy - 13, 13, 5);
    snowFoot(ctx, r, cx, cy, w * 0.6);
    frost(ctx, r, cx, cy - 30, w * 0.26, 8);
  }
}

// ------------------------------------------------------------------ beds

const PAINTERS = {
  dandelion,
  clover,
  borage,
  lavender,
  thyme,
  mint,
  sunflower,
  buckwheat,
  heather,
  ivy,
};

/** Which flowers this module can paint. */
export const PAINTED = Object.keys(PAINTERS);

/**
 * The sprite for a bed. Throws on a flower or stage it does not know.
 * @param {string} flower one of FLOWERS
 * @param {"seed"|"leaf"|"bud"|"bloom"|"faded"|"dormant"} stage
 * @param {number} [variant] 0 or 1, so a field is not one clump stamped out
 */
export function bed(flower, stage = "bloom", variant = 0) {
  const paint = PAINTERS[flower];
  if (!paint) throw new Error(`no painter for flower "${flower}"`);
  if (!STAGES.includes(stage)) throw new Error(`no stage "${stage}" for flower "${flower}"`);
  const v = Math.abs(Math.round(variant)) % 2;
  return sprite(
    `bed-${flower}-${stage}-${v}`,
    BED_W,
    BED_H,
    (ctx, w, h, r) =>
      stage === "seed" ? seedBed(ctx, w, h, r, flower, v) : paint(ctx, w, h, r, stage, v),
    { ay: FEET },
  );
}

export const GALLERY = PAINTED.flatMap((flower) =>
  STAGES.map((stage) => ({
    name: `${flower} · ${stage}`,
    make: () => bed(flower, stage, 0),
  })),
).concat(
  PAINTED.map((flower) => ({
    name: `${flower} · bloom (variant 1)`,
    make: () => bed(flower, "bloom", 1),
  })),
);

export { mix };
