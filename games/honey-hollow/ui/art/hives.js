// Hives. One sprite per type; the screen adds bees, the fill meter and any
// warning badge on top.

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  shadow,
  ellipse,
  rect,
  roundRect,
  smooth,
  hatch,
} from "../paint/wash.js";

export const HIVE_W = 76;
export const HIVE_H = 96;
const FEET = 0.9;

function stand(ctx, r, cx, cy, wide) {
  // A plank on two stubby legs.
  wash(ctx, rect(cx - wide * 0.36, cy - 5, 5, 7), "bark", { r, layers: 6, strength: 0.75 });
  wash(ctx, rect(cx + wide * 0.36 - 5, cy - 5, 5, 7), "bark", { r, layers: 6, strength: 0.75 });
  wash(ctx, roundRect(cx - wide / 2, cy - 10, wide, 6, 2), "wood", {
    r,
    layers: 8,
    strength: 0.85,
    soft: 0.1,
    charge: { color: "bark", n: 2, strength: 0.25 },
  });
  pencil(
    ctx,
    [
      [cx - wide / 2, cy - 10],
      [cx + wide / 2, cy - 10.5],
    ],
    { r, alpha: 0.5, width: 0.8 },
  );
  pencil(
    ctx,
    [
      [cx - wide / 2 + 1, cy - 4],
      [cx + wide / 2 - 1, cy - 4],
    ],
    { r, alpha: 0.5, width: 0.8, passes: 1 },
  );
}

function skep(ctx, w, h, r) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx + 2, cy + 1, w * 0.4, 5.5, r, 0.32);
  stand(ctx, r, cx, cy, 50);
  const base = cy - 10;
  const top = base - 46;
  const half = 21;
  // The dome: a beehive of coiled straw.
  const dome = smooth(
    [
      [cx - half, base],
      [cx - half - 1, base - 16],
      [cx - half * 0.72, base - 34],
      [cx, top],
      [cx + half * 0.72, base - 34],
      [cx + half + 1, base - 16],
      [cx + half, base],
    ],
    6,
    false,
  );
  wash(ctx, dome, "straw", {
    r,
    layers: 18,
    strength: 0.92,
    soft: 0.1,
    charge: { color: "honey", n: 3, strength: 0.35 },
  });
  // Shade on the right, light on the left.
  wash(
    ctx,
    smooth(
      [
        [cx + 6, base - 2],
        [cx + half - 1, base - 6],
        [cx + half - 2, base - 24],
        [cx + 8, base - 40],
        [cx + 12, base - 20],
      ],
      5,
    ),
    "amber",
    {
      r,
      layers: 8,
      strength: 0.22,
      soft: 0.4,
      edge: 0,
      glaze: true,
    },
  );
  // The coils.
  for (let i = 1; i <= 6; i++) {
    const y = base - i * 6.6 + 1;
    const t = (base - y) / 46;
    const hw = half * Math.sqrt(Math.max(0.05, 1 - t * t * 0.92)) + 0.5;
    pencil(
      ctx,
      [
        [cx - hw, y],
        [cx - hw * 0.5, y + 2.2],
        [cx, y + 3],
        [cx + hw * 0.5, y + 2.2],
        [cx + hw, y],
      ],
      { r, alpha: 0.5, width: 0.8, gaps: 0.1 },
    );
    hatch(ctx, cx - hw + 2, y + 1, hw * 2 - 4, 3, 1.2, { r, n: 5, len: 3.5, alpha: 0.28 });
  }
  pencil(ctx, dome, { r, alpha: 0.6, width: 0.9, gaps: 0.06 });
  // The little knot on top and the doorway.
  wash(ctx, ellipse(cx, top - 1, 3.4, 2.6, 7), "honey", { r, layers: 6, strength: 0.85 });
  pencil(ctx, ellipse(cx, top - 1, 3.4, 2.6, 7), {
    r,
    closed: true,
    passes: 1,
    alpha: 0.5,
    width: 0.7,
  });
  const door = smooth(
    [
      [cx - 5, base],
      [cx - 5, base - 6],
      [cx, base - 9.5],
      [cx + 5, base - 6],
      [cx + 5, base],
    ],
    4,
    false,
  );
  wash(ctx, door, "umber", { r, layers: 8, strength: 0.88, soft: 0.08 });
}

function boxes(ctx, w, h, r, n) {
  const cx = w / 2;
  const cy = h * FEET;
  shadow(ctx, cx + 2, cy + 1, w * 0.42, 5.5, r, 0.32);
  stand(ctx, r, cx, cy, 54);
  const bw = 44;
  const bh = n === 3 ? 15 : 17;
  let y = cy - 10;
  const paints = ["cream", "blush", "sky", "butter"];
  for (let i = 0; i < n; i++) {
    y -= bh;
    const color = n === 1 ? "cream" : paints[(i + (n === 2 ? 1 : 0)) % paints.length];
    const body = roundRect(cx - bw / 2, y, bw, bh - 1, 1.5);
    wash(ctx, body, color, {
      r,
      layers: 12,
      strength: 0.94,
      soft: 0.07,
      charge: { color: "paperShade", n: 2, strength: 0.3 },
    });
    wash(ctx, rect(cx + bw / 2 - 11, y + 1, 10, bh - 3), "shadow", {
      r,
      layers: 6,
      strength: 0.14,
      soft: 0.3,
      edge: 0,
      glaze: true,
    });
    pencil(ctx, body, { r, closed: true, alpha: 0.55, width: 0.85 });
    // A hand-hold.
    pencil(
      ctx,
      [
        [cx - 6, y + bh * 0.45],
        [cx + 6, y + bh * 0.45],
      ],
      { r, alpha: 0.4, width: 1.1, passes: 1 },
    );
    if (i === 0)
      wash(ctx, roundRect(cx - 8, y + bh - 5, 16, 3.4, 1), "umber", {
        r,
        layers: 6,
        strength: 0.85,
        soft: 0.05,
      });
  }
  // A pitched roof.
  const roof = [
    [cx - bw / 2 - 4, y],
    [cx, y - 12],
    [cx + bw / 2 + 4, y],
  ];
  wash(ctx, smooth([...roof, [cx, y + 1.5]], 3), "terracotta", {
    r,
    layers: 12,
    strength: 0.9,
    soft: 0.08,
    charge: { color: "poppy", n: 2, strength: 0.3 },
  });
  pencil(ctx, roof, { r, alpha: 0.6, width: 0.9 });
  pencil(ctx, [roof[0], roof[2]], { r, alpha: 0.45, width: 0.8, passes: 1 });
}

const PAINTERS = {
  skep: (c, w, h, r) => skep(c, w, h, r),
  box: (c, w, h, r) => boxes(c, w, h, r, 1),
  double: (c, w, h, r) => boxes(c, w, h, r, 2),
  stack: (c, w, h, r) => boxes(c, w, h, r, 3),
};

/**
 * Snow lying on whatever has been painted so far: a white cap that follows
 * its upper outline, thick on top and thinning down the shoulders.
 */
function snowOn(ctx, w, h, r) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const per = W / w;
  const data = ctx.getImageData(0, 0, W, H).data;
  /** @type {number[]} */
  const top = [];
  let peak = h;
  for (let x = 4; x <= w - 4; x += 2) {
    const px = Math.min(W - 1, Math.round(x * per));
    let y = -1;
    for (let py = 0; py < H; py++)
      if (data[(py * W + px) * 4 + 3] > 110) {
        y = py / per;
        break;
      }
    top.push(y);
    if (y >= 0 && y < peak) peak = y;
  }
  const deep = 24; // only the roof and the shoulders hold snow
  /** @type {number[][]} */
  const up = [];
  /** @type {number[][]} */
  const down = [];
  /** @type {number[][]} */
  const under = [];
  for (let i = 0; i < top.length; i++) {
    const y = top[i];
    if (y < 0 || y > peak + deep) continue;
    const t = 1 - (y - peak) / deep;
    up.push([4 + i * 2, y - 1.4 - 1.8 * t]);
    down.unshift([4 + i * 2, y + 2 + 5 * t]);
    under.unshift([4 + i * 2, y + 3.6 + 6.4 * t]);
  }
  if (up.length < 3) return;
  // Its blue shadow first, so the cap still reads against a white meadow.
  wash(ctx, smooth([...up, ...under], 2), "dusk", {
    r,
    layers: 4,
    strength: 0.36,
    soft: 0.12,
    edge: 0,
  });
  wash(ctx, smooth([...up, ...down], 2), "white", {
    r,
    layers: 7,
    strength: 0.96,
    soft: 0.06,
    edge: 0.15,
    vary: 0.01,
  });
  pencil(ctx, up, { r, alpha: 0.42, width: 0.8, passes: 1 });
}

/**
 * @param {"skep"|"box"|"double"|"stack"} type
 * @param {boolean} [snowy] with a cap of snow, for winter
 */
export function hive(type, snowy = false) {
  if (!snowy) return sprite(`hive-${type}`, HIVE_W, HIVE_H, PAINTERS[type], { ay: FEET });
  return sprite(
    `hive-${type}-snow`,
    HIVE_W,
    HIVE_H,
    (c, w, h, r) => {
      PAINTERS[type](c, w, h, r);
      snowOn(c, w, h, r);
    },
    { ay: FEET },
  );
}

export const GALLERY = Object.keys(PAINTERS).map((type) => ({
  name: `hive · ${type}`,
  make: () => hive(type),
}));

export { brush };
