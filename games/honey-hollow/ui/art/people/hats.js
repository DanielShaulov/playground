// Hats, in head space (see kit.js). A hat that covers the crown gives a
// `fit`: a squeeze applied to every point of the hair, so the hair is pressed
// down under the hat and still billows out below the brim, whatever the style.

import {
  wash,
  brush,
  pencil,
  ellipse,
  smooth,
  petal,
  leaf,
  ribbon,
  within,
  splatter,
} from "../../paint/wash.js";
import { rgba, mix } from "../../paint/palette.js";
import { dab, ink, line, fill, pool, lerp } from "./kit.js";

// Where each crown-covering hat sits: hair above this line is pressed flat.
const LINE = {
  straw: -14.5,
  rosette: -14.5,
  veil: -14.5,
  "golden-veil": -14.5,
  beret: -13.4,
  knit: -9.4,
  cap: -12,
  fishing: -13,
};

// The underside of each brim at the brow: a fringe shows below this.
const BRIM = {
  straw: -9.4,
  rosette: -9.4,
  veil: -9.4,
  "golden-veil": -9.4,
  knit: -7.6,
  cap: -8,
  fishing: -6.2,
};

/** Where a fringe comes out from under a hat, or undefined if it need not. */
export const hatBrim = (kind) => BRIM[kind];

/** The squeeze for a hat, or null if the hat leaves the hair alone. */
export function hatFit(kind) {
  const top = LINE[kind];
  if (top == null) return null;
  return ([x, y]) => {
    if (y >= top) return [x, y];
    const d = top - y;
    const t = Math.min(1, d / 9);
    return [x * (1 - 0.22 * t), top - d * 0.3];
  };
}

const STRAW = { base: "straw", dark: "honey", deep: "amber", light: "butter" };
const COTTON = { base: "linen", dark: "creamDeep", deep: "soil", light: "white" };
const GOLD = { base: "honey", dark: "amber", deep: "chestnut", light: "butter" };

/** The brimmed hat under the straw hat, both veils and the rosette. */
function brimmed(ctx, r, tone, band, o = {}) {
  const cy = -14.5;
  const brim = ellipse(0.4, cy, 27, 5.7, 22, -0.035);
  fill(ctx, r, brim, tone.base, { layers: 12, soft: 0.06 });
  pool(
    ctx,
    r,
    brim,
    tone.dark,
    [
      [2, cy + 3.8, 23, 2],
      [20, cy + 0.6, 6, 3],
    ],
    0.4,
  );
  pool(ctx, r, brim, tone.light, [[-13, cy - 1.6, 9, 1.6]], 0.5);
  line(ctx, r, brim, { closed: true, alpha: 0.5, gaps: 0.08 });
  if (o.weave !== false)
    pencil(ctx, ellipse(0.4, cy + 0.4, 21, 3.6, 14, -0.035).slice(0, 8), {
      r,
      alpha: 0.24,
      width: 0.5,
      passes: 1,
      gaps: 0.3,
    });
  const crown = smooth(
    [
      [-13.4, cy + 0.4],
      [-13.3, cy - 6],
      [-10.2, cy - 12.2],
      [0, cy - 14.2],
      [10.2, cy - 12.4],
      [13.3, cy - 6],
      [13.4, cy + 0.4],
      [6, cy + 2.6],
      [-6, cy + 2.6],
    ],
    3,
  );
  fill(ctx, r, crown, tone.base, { layers: 12, soft: 0.06 });
  pool(ctx, r, crown, tone.dark, [[9.4, cy - 6, 4, 7]], 0.42);
  pool(ctx, r, crown, tone.light, [[-5.6, cy - 9.6, 4.6, 2.6, -0.3]], 0.55);
  if (o.weave !== false)
    for (const dy of [-5.4, -9.6])
      pencil(
        ctx,
        [
          [-12.6 - dy * 0.2, cy + dy],
          [0, cy + dy + 1.8],
          [12.6 + dy * 0.2, cy + dy],
        ],
        { r, alpha: 0.24, width: 0.5, passes: 1, gaps: 0.3 },
      );
  line(ctx, r, crown.slice(0, 20), { alpha: 0.5 });
  const ring = ribbon(
    smooth(
      [
        [-13.4, cy - 1.8],
        [-6, cy + 0.5],
        [0, cy + 1],
        [6, cy + 0.5],
        [13.4, cy - 1.8],
      ],
      4,
      false,
    ),
    () => 3.7,
  );
  fill(ctx, r, ring, band.base, { layers: 8 });
  pool(ctx, r, ring, band.dark, [[8.6, cy - 0.4, 5, 1.6]], 0.45);
  line(ctx, r, ring, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
  return cy;
}

function net(ctx, x0, y0, x1, y1, color, alpha, step = 3.6) {
  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  const h = y1 - y0;
  for (let x = x0 - h; x < x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x + h, y1);
    ctx.moveTo(x + h, y0);
    ctx.lineTo(x, y1);
  }
  ctx.stroke();
  ctx.restore();
}

/** The part of a hat that hangs behind everything: a veil's net. */
export function paintHatBack(ctx, r, hat) {
  if (hat.kind !== "veil" && hat.kind !== "golden-veil") return;
  const gold = hat.kind === "golden-veil";
  const drape = smooth(
    [
      [-25, -14],
      [-28, 0],
      [-26.8, 13],
      [-29.4, 25],
      [-22, 31.6],
      [-11, 28.6],
      [0, 31],
      [11, 28.6],
      [22, 31.6],
      [29.4, 25],
      [26.8, 13],
      [28, 0],
      [25, -14],
    ],
    3,
  );
  wash(ctx, drape, gold ? "butter" : "white", {
    r,
    layers: 9,
    strength: gold ? 0.6 : 0.66,
    soft: 0.12,
    edge: 0.5,
  });
  within(ctx, drape, () => {
    net(ctx, -30, -15, 30, 33, gold ? "amber" : "inkSoft", gold ? 0.3 : 0.24);
    wash(ctx, ellipse(0, 24, 26, 7, 10), gold ? "honey" : "shadow", {
      r,
      layers: 5,
      strength: gold ? 0.26 : 0.14,
      soft: 0.5,
      edge: 0,
    });
  });
  line(ctx, r, drape.slice(3, 37), { alpha: 0.34, gaps: 0.2, color: gold ? "amber" : "inkSoft" });
  if (gold) splatter(ctx, 0, 10, 27, "gold", { r, n: 16, size: 0.8, strength: 1.2 });
}

function blossom(ctx, r, x, y, s, color, heart = "dandelion") {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r.gauss() * 0.15 - 1.2;
    wash(
      ctx,
      ellipse(x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, s * 0.56, s * 0.48, 7, a),
      color,
      {
        r,
        layers: 4,
        strength: 0.9,
        soft: 0.14,
        edge: 0.7,
      },
    );
  }
  dab(ctx, x, y, s * 0.3, s * 0.3, heart, 0.95);
}

function bow(ctx, r, x, y, k, c) {
  for (const s of [-1, 1]) {
    const tail = ribbon(
      [
        [x, y],
        [x + s * 3.4 * k, y + 5 * k],
        [x + s * 4.6 * k, y + 8.6 * k],
      ],
      () => 2.6 * k,
    );
    fill(ctx, r, tail, c.base, { layers: 6 });
    line(ctx, r, tail, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
  }
  for (const s of [-1, 1]) {
    const loop = petal(x, y, 9.6 * k, 8 * k, s > 0 ? -0.3 : Math.PI + 0.3, 0.66);
    fill(ctx, r, loop, c.base, { layers: 8, soft: 0.1 });
    pool(ctx, r, loop, c.dark, [[x + s * 3 * k, y - 0.4 * k, 2.4 * k, 2 * k]], 0.5);
    pool(ctx, r, loop, "white", [[x + s * 6 * k, y - 3 * k, 2.2 * k, 1.2 * k]], 0.4);
    line(ctx, r, loop, { closed: true, alpha: 0.46, width: 0.6, passes: 1 });
  }
  const knot = ellipse(x, y - 0.4 * k, 2.3 * k, 2.6 * k, 8);
  fill(ctx, r, knot, c.dark, { layers: 6 });
  line(ctx, r, knot, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
}

const PAINT = {
  straw(ctx, r, hat) {
    brimmed(ctx, r, STRAW, hat.band ?? { base: "rose", dark: "berry" });
  },

  rosette(ctx, r, hat) {
    const cy = brimmed(ctx, r, STRAW, hat.band ?? { base: "borage", dark: "cornflower" });
    // A first-prize rosette pinned to the band, its tails over the brim.
    const x = 9.4;
    const y = cy - 3;
    for (const s of [-1, 1]) {
      const tail = ribbon(
        [
          [x + s * 0.8, y + 2],
          [x + s * 2.2, y + 9.6],
        ],
        () => 2.9,
      );
      fill(ctx, r, tail, "poppy", { layers: 6 });
      line(ctx, r, tail, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      wash(ctx, ellipse(x + Math.cos(a) * 3.8, y + Math.sin(a) * 3.8, 2.3, 1.9, 7, a), "poppy", {
        r,
        layers: 4,
        strength: 0.92,
        soft: 0.12,
        edge: 0.9,
      });
    }
    fill(ctx, r, ellipse(x, y, 3.3, 3.3, 10), "butter", { layers: 6, strength: 0.97 });
    dab(ctx, x, y, 1.5, 1.5, "gold", 0.95);
    line(ctx, r, ellipse(x, y, 3.3, 3.3, 10), { closed: true, alpha: 0.4, width: 0.5, passes: 1 });
  },

  veil(ctx, r, hat) {
    const cy = brimmed(ctx, r, COTTON, hat.band ?? { base: "sage", dark: "sageDeep" }, {
      weave: false,
    });
    // The net, rolled back onto the brim.
    const roll = smooth(
      [
        [-24, cy - 1.6],
        [-19, cy - 5.6],
        [-14.6, cy - 3.6],
        [-14.6, cy + 0.6],
        [-20, cy + 1.6],
      ],
      3,
    );
    const roll2 = roll.map(([x, y]) => [-x + 0.8, y - 0.3]);
    for (const shape of [roll, roll2]) {
      wash(ctx, shape, "white", { r, layers: 6, strength: 0.72, soft: 0.14, edge: 0.6 });
      within(ctx, shape, () => net(ctx, -26, cy - 7, 26, cy + 3, "inkSoft", 0.3, 2.6));
      line(ctx, r, shape, { closed: true, alpha: 0.3, width: 0.5, passes: 1, gaps: 0.3 });
    }
  },

  "golden-veil"(ctx, r, hat) {
    const cy = brimmed(ctx, r, GOLD, hat.band ?? { base: "white", dark: "butter" }, {
      weave: false,
    });
    const roll = smooth(
      [
        [-24, cy - 1.6],
        [-19, cy - 5.6],
        [-14.6, cy - 3.6],
        [-14.6, cy + 0.6],
        [-20, cy + 1.6],
      ],
      3,
    );
    const roll2 = roll.map(([x, y]) => [-x + 0.8, y - 0.3]);
    for (const shape of [roll, roll2]) {
      wash(ctx, shape, "butter", { r, layers: 6, strength: 0.7, soft: 0.14, edge: 0.6 });
      within(ctx, shape, () => net(ctx, -26, cy - 7, 26, cy + 3, "amber", 0.4, 2.6));
    }
    // A glint or two: it is the best hat in the village.
    for (const [x, y, s] of [
      [-7.6, cy - 10.6, 2.2],
      [17.6, cy - 2.4, 1.6],
      [5.6, cy - 6, 1.2],
    ]) {
      ink(
        ctx,
        [
          [x - s, y],
          [x + s, y],
        ],
        "white",
        0.7,
        0.95,
      );
      ink(
        ctx,
        [
          [x, y - s],
          [x, y + s],
        ],
        "white",
        0.7,
        0.95,
      );
    }
  },

  "flower-crown"(ctx, r) {
    const at = (t) => [lerp(-16.8, 16.8, t), -7.6 - Math.sin(Math.PI * t) * 9.4];
    // Leaves first, tucked under the flowers.
    for (let i = 0; i < 9; i++) {
      const t = 0.03 + (i / 8) * 0.94;
      const [x, y] = at(t);
      const a = lerp(-2.3, -0.84, t) + (i % 2 ? 1.1 : -0.9);
      wash(ctx, leaf(x, y, 6.2, 3.4, a), i % 3 ? "leaf" : "sage", {
        r,
        layers: 4,
        strength: 0.88,
        soft: 0.14,
        edge: 0.7,
      });
    }
    const blooms = [
      [0.04, 2.2, "butter", "sunflower"],
      [0.17, 3.2, "rose", "dandelion"],
      [0.3, 2.3, "white", "dandelion"],
      [0.43, 3.6, "clover", "butter"],
      [0.57, 2.4, "lavender", "butter"],
      [0.69, 3.3, "white", "dandelion"],
      [0.82, 2.5, "poppy", "butter"],
      [0.95, 2.2, "lilac", "dandelion"],
    ];
    for (const [t, s, c, heart] of blooms) {
      const [x, y] = at(t);
      blossom(ctx, r, x + r.gauss() * 0.3, y + r.gauss() * 0.4, s, c, heart);
    }
  },

  beret(ctx, r, hat) {
    const c = hat.color ?? { base: "poppy", dark: "berryDeep" };
    const shape = smooth(
      [
        [-15.8, -12.4],
        [-17.4, -17.6],
        [-11.6, -24],
        [-1, -27],
        [10.4, -26],
        [19.4, -21],
        [22, -14.6],
        [17.4, -11.2],
        [8, -12.4],
        [0, -13.4],
        [-8, -13.2],
      ],
      3,
    );
    fill(ctx, r, shape, c.base, { layers: 12, soft: 0.1 });
    pool(
      ctx,
      r,
      shape,
      c.dark,
      [
        [14, -13.6, 9, 2.4],
        [0, -13.4, 14, 1.4],
      ],
      0.24,
    );
    pool(ctx, r, shape, "white", [[-6, -22, 6, 2.4, -0.25]], 0.3);
    line(ctx, r, shape, { closed: true, alpha: 0.5 });
    brush(
      ctx,
      [
        [0.6, -26.4],
        [1.6, -29.6],
      ],
      c.dark,
      { r, width: () => 1.5, strength: 0.9, layers: 4 },
    );
    pencil(
      ctx,
      [
        [-5, -23],
        [4, -20.6],
        [14, -21.6],
      ],
      { r, alpha: 0.24, width: 0.5, passes: 1 },
    );
  },

  knit(ctx, r, hat) {
    const c = hat.color ?? { base: "poppy", dark: "berry" };
    const trim = hat.trim ?? "cream";
    const pom = smooth(
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const k = 5.6 * (i % 2 ? 0.86 : 1.06);
        return [1 + Math.cos(a) * k, -29.6 + Math.sin(a) * k];
      }),
      3,
    );
    fill(ctx, r, pom, trim, { layers: 8, soft: 0.14 });
    pool(ctx, r, pom, "creamDeep", [[2.6, -27.4, 4, 2.4]], 0.5);
    line(ctx, r, pom, { closed: true, alpha: 0.42, gaps: 0.25 });
    const dome = smooth(
      [
        [-17, -8.6],
        [-17.2, -14.6],
        [-13.2, -22],
        [-5, -26.2],
        [5, -26.4],
        [13.2, -22],
        [17.2, -14.6],
        [17, -8.6],
        [0, -7],
      ],
      3,
    );
    fill(ctx, r, dome, c.base, { layers: 12, soft: 0.08 });
    pool(ctx, r, dome, c.dark, [[11.6, -15, 5, 8]], 0.4);
    pool(ctx, r, dome, "white", [[-6.6, -20.6, 5, 2.4, -0.4]], 0.26);
    // A zigzag knitted in.
    const zig = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      zig.push([lerp(-15.4, 15.4, t), -16.4 - Math.sin(Math.PI * t) * 2.4 + (i % 2 ? 1.5 : -1.5)]);
    }
    within(ctx, dome, () => {
      ctx.save();
      ctx.strokeStyle = rgba(trim, 0.9);
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "round";
      ctx.beginPath();
      zig.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
    });
    line(ctx, r, dome.slice(0, 22), { alpha: 0.5 });
    const path = smooth(
      [
        [-17.6, -11.2],
        [-8, -9.2],
        [0, -8.7],
        [8, -9.2],
        [17.6, -11.2],
      ],
      4,
      false,
    );
    const band = ribbon(path, () => 5.6);
    fill(ctx, r, band, trim, { layers: 9, soft: 0.07 });
    pool(ctx, r, band, "creamDeep", [[9, -8.6, 8, 2]], 0.45);
    line(ctx, r, band, { closed: true, alpha: 0.5 });
    for (let x = -15; x <= 15.4; x += 2.7)
      ink(
        ctx,
        [
          [x, -11.6 + Math.abs(x) * 0.02],
          [x + 0.2, -7 - Math.abs(x) * 0.1],
        ],
        "creamDeep",
        0.6,
        0.85,
      );
  },

  bow(ctx, r, hat) {
    bow(ctx, r, 8.6, -19, 1, hat.color ?? { base: "clover", dark: "berry" });
  },

  cap(ctx, r, hat) {
    const c = hat.color ?? { base: "tweed", dark: "tweedDeep" };
    const peak = smooth(
      [
        [-13.6, -12.6],
        [0, -13.6],
        [14.6, -12.2],
        [12, -8.6],
        [1, -7.4],
        [-10.6, -8.8],
      ],
      3,
    );
    fill(ctx, r, peak, c.dark, { layers: 8 });
    line(ctx, r, peak, { closed: true, alpha: 0.5 });
    const body = smooth(
      [
        [-16.6, -11.4],
        [-17.6, -16.4],
        [-12.6, -21.6],
        [-2, -24],
        [9, -23.2],
        [16.4, -18.6],
        [18.2, -12.6],
        [9, -10.6],
        [0, -10.2],
        [-9, -10.6],
      ],
      3,
    );
    fill(ctx, r, body, c.base, { layers: 12, soft: 0.08 });
    pool(
      ctx,
      r,
      body,
      c.dark,
      [
        [13, -14.6, 5.6, 4],
        [0, -11.4, 15, 1.6],
      ],
      0.42,
    );
    pool(ctx, r, body, "white", [[-6, -20, 6, 2, -0.2]], 0.26);
    // Tweed: a loose check.
    within(ctx, body, () => {
      for (let x = -15; x < 18; x += 5.2)
        ink(
          ctx,
          [
            [x, -25],
            [x + 2.6, -10],
          ],
          c.dark,
          0.6,
          0.34,
        );
      for (let y = -21; y < -10; y += 4.4)
        ink(
          ctx,
          [
            [-18, y + 1],
            [0, y - 0.6],
            [19, y + 1.4],
          ],
          c.dark,
          0.6,
          0.34,
        );
    });
    line(ctx, r, body, { closed: true, alpha: 0.5 });
    dab(ctx, -1, -23.6, 1.2, 0.9, c.dark, 0.9);
  },

  // Tobias's: a bucket hat with flies hooked in the band.
  fishing(ctx, r, hat) {
    const c = hat.color ?? { base: "olive", dark: "waxedDeep" };
    const brim = smooth(
      [
        [-12.6, -16.6],
        [12.8, -16.6],
        [20.6, -11],
        [22.4, -7.6],
        [11, -6.2],
        [0, -5.6],
        [-11, -6.2],
        [-22.4, -7.8],
        [-20.6, -11],
      ],
      3,
    );
    fill(ctx, r, brim, c.base, { layers: 12, soft: 0.08 });
    pool(ctx, r, brim, c.dark, [[3, -7.4, 20, 2.2]], 0.42);
    line(ctx, r, brim, { closed: true, alpha: 0.5 });
    const crown = smooth(
      [
        [-12.2, -14.6],
        [-11.2, -23],
        [-4, -26.2],
        [5, -26.2],
        [11.4, -23],
        [12.4, -14.6],
        [0, -13],
      ],
      3,
    );
    fill(ctx, r, crown, c.base, { layers: 12, soft: 0.08 });
    pool(ctx, r, crown, c.dark, [[8.6, -19, 4, 6]], 0.42);
    line(ctx, r, crown.slice(0, 17), { alpha: 0.5 });
    const band = ribbon(
      smooth(
        [
          [-12.2, -16.4],
          [0, -14.4],
          [12.4, -16.4],
        ],
        4,
        false,
      ),
      () => 3,
    );
    fill(ctx, r, band, c.dark, { layers: 7 });
    for (const [x, y, col, a] of [
      [-7.6, -16.6, "poppy", -2],
      [-1.6, -15.6, "dandelion", -1.5],
      [5.6, -16, "borage", -1.1],
    ]) {
      wash(ctx, petal(x, y, 4.4, 3, a, 0.6), col, {
        r,
        layers: 4,
        strength: 0.95,
        soft: 0.16,
        edge: 0.8,
      });
      ink(
        ctx,
        [
          [x, y],
          [x + 0.9, y + 1.9],
          [x - 0.3, y + 2.6],
        ],
        "eye",
        0.5,
        0.8,
      );
    }
  },
};

/** Does this hat cover the crown (so a top bun must ride low)? */
export const covers = (kind) => LINE[kind] != null;

export function paintHat(ctx, r, hat) {
  PAINT[hat.kind]?.(ctx, r, hat);
}

/** The shade a brim throws on the brow. */
export function brimShade(ctx, r, kind) {
  const top = LINE[kind];
  if (top == null) return;
  const y = kind === "knit" ? -5.4 : kind === "beret" ? -11.4 : -8.6;
  wash(ctx, ellipse(0.6, y, 13.4, 3.4, 10), "shadow", {
    r,
    layers: 5,
    strength: 0.2,
    soft: 0.4,
    edge: 0,
    glaze: true,
  });
}

export { mix };
