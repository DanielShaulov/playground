// Things that stand in the meadow and are not beds: the orchard's apple
// trees, the hill's boulders, and the soft painted marks the screen lays on
// a square to say "in reach", "plant here" or "this one".

import { sprite, put } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  shadow,
  lift,
  hatch,
  ellipse,
  blob,
  leaf,
  smooth,
  ribbon,
  roundRect,
  resample,
  TAU,
} from "../paint/wash.js";
import { mix } from "../paint/palette.js";
import { along, heading, dot, tick, dab, snowCap, snowFoot } from "./flowers.js";

// ------------------------------------------------------------------ trees

export const TREE_W = 108;
export const TREE_H = 150;
const TREE_FEET = 0.93; // the trunk's foot, as a share of the height
export const TREE_STAGES = ["leaf", "bud", "bloom", "fruit", "dormant"];

// The crown, as clumps of foliage: dx from the trunk, dy from the foot,
// radius. Back clumps first.
const CROWN = [
  [-25, -64, 16],
  [26, -67, 17],
  [-33, -83, 13],
  [33, -87, 13],
  [-14, -91, 19],
  [15, -95, 19],
  [1, -105, 16],
  [0, -78, 23],
];

// Where apples hang, in the same terms.
const APPLES = [
  [-28, -60],
  [-13, -73],
  [7, -64],
  [25, -73],
  [-22, -93],
  [14, -90],
  [35, -82],
  [-2, -101],
  [-37, -78],
];

function bones(r, cx, foot, flip) {
  const X = (dx) => cx + flip * dx;
  const fork = [X(1.5 + r.gauss() * 0.8), foot - 45];
  const trunk = smooth(
    [[X(-2), foot + 1], [X(-3.2 + r.gauss() * 0.5), foot - 15], [X(0.5), foot - 31], fork],
    5,
    false,
  );
  const boughs = [
    smooth([fork, [X(-10), foot - 57], [X(-21), foot - 67], [X(-29), foot - 81]], 5, false),
    smooth([fork, [X(0.5), foot - 61], [X(-4.5), foot - 80], [X(-2), foot - 99]], 5, false),
    smooth([fork, [X(9), foot - 56], [X(20), foot - 69], [X(27), foot - 87]], 5, false),
  ];
  const twigs = [];
  boughs.forEach((b, bi) => {
    [0.36, 0.58, 0.8, 1].forEach((t, k) => {
      const [x, y] = along(b, t);
      const side = (k + bi) % 2 ? 1 : -1;
      const a = heading(b, Math.min(t, 0.94)) + side * r.range(0.55, 1.05) * (t === 1 ? 0.4 : 1);
      const len = r.range(12, 19) * (1.15 - t * 0.25);
      twigs.push(
        smooth(
          [
            [x, y],
            [x + Math.cos(a) * len * 0.5 + r.gauss(), y + Math.sin(a) * len * 0.5 - 1.5],
            [x + Math.cos(a) * len, y + Math.sin(a) * len - 3.5],
          ],
          4,
          false,
        ),
      );
    });
  });
  return { X, fork, trunk, boughs, twigs };
}

function woodwork(ctx, r, t, bare) {
  const trunkWidth = (u) => 12.5 - u * 5.5 + Math.max(0, 0.14 - u) * 34;
  for (const b of t.boughs)
    brush(ctx, b, "bark", { r, width: (u) => 6.2 - u * 4.4, strength: 0.88, layers: 8 });
  if (bare)
    for (const tw of t.twigs) {
      brush(ctx, tw, "bark", { r, width: (u) => 2.4 - u * 1.4, strength: 0.82 });
      // Each twig ends in a little fork of finer ones.
      const [x, y] = tw[tw.length - 1];
      const a = heading(tw, 1);
      for (const s of [-0.5, 0.45]) {
        const len = r.range(4, 7);
        tick(ctx, r, x, y, x + Math.cos(a + s) * len, y + Math.sin(a + s) * len, "bark", 0.75, 0.9);
      }
    }
  brush(ctx, t.trunk, "bark", {
    r,
    width: trunkWidth,
    strength: 0.92,
    layers: 12,
    soft: 0.07,
    rounds: 2,
    charge: { color: "umber", n: 3, strength: 0.35 },
  });
  // Light down the left of the trunk, and the pencil that finds its edges.
  const lit = t.trunk.map(([x, y], i) => [x - (4 - (i / t.trunk.length) * 2), y]);
  brush(ctx, lit.slice(1, -2), "wood", { r, width: 2.6, strength: 0.5, edge: 0 });
  const edge = ribbon(t.trunk, trunkWidth);
  const half = edge.length / 2;
  pencil(ctx, edge.slice(0, half), { r, alpha: 0.5, width: 0.85, gaps: 0.12 });
  pencil(ctx, edge.slice(half), { r, alpha: 0.5, width: 0.85, gaps: 0.12 });
  const [kx, ky] = along(t.trunk, 0.46);
  pencil(ctx, ellipse(kx + 0.5, ky, 1.8, 2.6, 7), {
    r,
    closed: true,
    passes: 1,
    alpha: 0.45,
    width: 0.6,
  });
  hatch(ctx, kx - 4, ky - 16, 8, 30, Math.PI / 2 + 0.08, { r, n: 5, len: 5, alpha: 0.28 });
}

// A loose pencil scallop round the top of a clump.
function scallop(ctx, r, x, y, rad, alpha = 0.3) {
  const a0 = -Math.PI * r.range(0.95, 1.1);
  const a1 = -Math.PI * r.range(-0.1, 0.12);
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const a = a0 + ((a1 - a0) * i) / 5;
    pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad]);
  }
  pencil(ctx, pts, { r, passes: 1, alpha, width: 0.7, gaps: 0.35, wobble: 0.8 });
}

function crown(ctx, r, t, foot, look) {
  const clumps = CROWN.map(([dx, dy, rad]) => [
    t.X(dx) + r.gauss() * 1.2,
    foot + dy + r.gauss(),
    rad,
  ]);
  clumps.forEach(([x, y, rad], i) => {
    wash(ctx, blob(r, x, y, rad, 0.12, 12), look.clump[i % look.clump.length], {
      r,
      layers: 12,
      strength: look.strength,
      soft: 0.22,
      edge: 0.55,
      charge: { color: look.charge, n: 2, strength: 0.3 },
    });
  });
  // Light from the upper left, shade under the right.
  for (const i of [4, 6, 2, 7]) {
    const [x, y, rad] = clumps[i];
    dab(ctx, r, x - rad * 0.3, y - rad * 0.35, rad * 0.6, rad * 0.44, look.light, {
      layers: 6,
      strength: 0.5,
      soft: 0.5,
      edge: 0,
    });
  }
  for (const i of [1, 7, 0]) {
    const [x, y, rad] = clumps[i];
    wash(ctx, ellipse(x + rad * 0.2, y + rad * 0.5, rad * 0.75, rad * 0.4, 9), look.shade, {
      r,
      layers: 6,
      strength: 0.26,
      soft: 0.5,
      edge: 0,
      glaze: true,
    });
  }
  return clumps;
}

// Scatter something over the crown: `put(x, y, i)` is called at points
// spread through the clumps, more of them toward each clump's rim.
function scatter(r, clumps, n, paint) {
  for (let i = 0; i < n; i++) {
    const [x, y, rad] = clumps[i % clumps.length];
    const a = r() * TAU;
    const d = rad * Math.sqrt(r()) * 1.02;
    paint(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.95, i);
  }
}

function apple(ctx, r, x, y, rad = 3.7) {
  tick(ctx, r, x, y - rad * 0.7, x + 0.8, y - rad * 1.5, "umber", 0.8, 0.8);
  wash(ctx, ellipse(x, y, rad, rad * 0.95, 9), "poppy", {
    r,
    layers: 7,
    strength: 0.95,
    soft: 0.08,
    edge: 0.7,
  });
  dab(ctx, r, x + rad * 0.3, y + rad * 0.3, rad * 0.55, rad * 0.45, "chestnut", {
    strength: 0.4,
    soft: 0.4,
    edge: 0,
  });
  dab(ctx, r, x - rad * 0.5, y - rad * 0.1, rad * 0.4, rad * 0.5, "sunflower", {
    strength: 0.35,
    soft: 0.4,
    edge: 0,
  });
  dot(ctx, r, x - rad * 0.35, y - rad * 0.4, rad * 0.2, "white", 0.85);
}

function paintTree(ctx, w, h, r, stage, variant) {
  const cx = w / 2;
  const foot = h * TREE_FEET;
  const flip = variant % 2 ? -1 : 1;
  const t = bones(r, cx, foot, flip);
  if (stage === "dormant") {
    wash(ctx, ellipse(cx + 4, foot + 2, 30, 6, 12), "dusk", {
      r,
      layers: 8,
      strength: 0.26,
      soft: 0.3,
      edge: 0,
    });
    woodwork(ctx, r, t, true);
    // Snow lies along the top of every branch.
    for (const b of [...t.boughs, ...t.twigs]) {
      const big = b.length > 14;
      const lie = b.slice(big ? 4 : 1).map(([x, y]) => [x - 0.4, y - (big ? 2.2 : 1.4)]);
      brush(ctx, lie, "white", {
        r,
        width: big ? 3 : 1.9,
        strength: 0.96,
        edge: 0.15,
        vary: 0.01,
      });
    }
    snowCap(ctx, r, t.fork[0], t.fork[1] - 3, 11, 5);
    snowFoot(ctx, r, cx, foot, 38);
    splatter(ctx, cx, foot - 78, 40, "white", { r, n: 14, size: 1, strength: 1.3 });
    return;
  }
  shadow(ctx, cx + 4, foot + 2, 34, 7, r, 0.24);
  // A little grass round the roots.
  for (let i = 0; i < 7; i++) {
    const x = cx + r.range(-13, 13);
    tick(
      ctx,
      r,
      x,
      foot + 1.5,
      x + r.gauss() * 2,
      foot - r.range(4, 8),
      r.pick(["sap", "leaf"]),
      0.75,
      1.5,
    );
  }
  woodwork(ctx, r, t, stage === "bud");

  if (stage === "bud") {
    // The first haze of green, and a pink bud at the end of every twig.
    const clumps = CROWN.map(([dx, dy, rad]) => [t.X(dx), foot + dy, rad]);
    for (const [x, y, rad] of clumps)
      wash(ctx, blob(r, x, y, rad * 0.9, 0.16, 11), r.pick(["meadow", "mint", "meadow"]), {
        r,
        layers: 8,
        strength: 0.34,
        soft: 0.45,
        edge: 0,
      });
    scatter(r, clumps, 60, (x, y) =>
      wash(ctx, leaf(x, y, r.range(3.5, 5), 2.4, r() * TAU), r.pick(["sap", "meadow", "leaf"]), {
        r,
        layers: 3,
        strength: 0.75,
        soft: 0.15,
      }),
    );
    for (const tw of t.twigs)
      for (const u of [0.5, 0.8, 1]) {
        const [x, y] = along(tw, u);
        dot(
          ctx,
          r,
          x + r.gauss() * 1.5,
          y + r.gauss() * 1.5,
          r.range(1.4, 1.9),
          r.pick(["rose", "clover", "blush"]),
          0.92,
        );
      }
    scatter(r, clumps, 30, (x, y) =>
      dot(ctx, r, x, y, r.range(1.1, 1.7), r.pick(["rose", "clover", "blush"]), 0.9),
    );
    return;
  }

  if (stage === "bloom") {
    // Young leaves under, then cloud on cloud of blossom.
    const under = CROWN.map(([dx, dy, rad]) => [t.X(dx), foot + dy, rad]);
    for (const [x, y, rad] of under)
      wash(ctx, blob(r, x, y, rad * 0.92, 0.14, 11), "meadow", {
        r,
        layers: 6,
        strength: 0.4,
        soft: 0.4,
        edge: 0,
      });
    const clumps = crown(ctx, r, t, foot, {
      clump: ["rose", "blush", "blush", "rose", "blush", "white", "blush", "blush"],
      charge: "rose",
      strength: 0.8,
      light: "white",
      shade: "heather",
    });
    scatter(r, clumps, 16, (x, y) =>
      wash(ctx, leaf(x, y, r.range(4, 5.5), 2.8, r() * TAU), r.pick(["sap", "leaf"]), {
        r,
        layers: 3,
        strength: 0.7,
        soft: 0.15,
      }),
    );
    // The blossoms themselves: five white petals round a pink eye.
    scatter(r, clumps, 46, (x, y, i) => {
      const turn = r() * TAU;
      const c = i % 4 === 0 ? "blush" : "white";
      for (let k = 0; k < 5; k++) {
        const a = turn + (k / 5) * TAU;
        dot(ctx, r, x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7, 1.25, c, 0.95);
      }
      dot(ctx, r, x, y, 0.8, r.pick(["clover", "rose", "sunflower"]), 0.9);
    });
    scatter(r, clumps, 30, (x, y) =>
      dot(ctx, r, x, y, r.range(0.9, 1.4), r.pick(["rose", "clover"]), 0.75),
    );
    for (const [x, y, rad] of clumps.slice(2)) scallop(ctx, r, x, y, rad, 0.26);
    // Petals coming down.
    splatter(ctx, cx, foot - 30, 36, "blush", { r, n: 10, size: 1.1, strength: 1.1 });
    splatter(ctx, cx, foot + 1, 30, "white", { r, n: 8, size: 1.1, strength: 1.3 });
    splatter(ctx, cx, foot + 1, 30, "rose", { r, n: 6, size: 1, strength: 0.9 });
    return;
  }

  const fruit = stage === "fruit";
  const deep = mix("moss", "pine", 0.45);
  const clumps = crown(ctx, r, t, foot, {
    clump: fruit
      ? ["moss", "olive", "moss", "leaf", "leaf", "olive", "sap", "leaf"]
      : [deep, "moss", "moss", "leaf", "leaf", "sap", "sap", "leaf"],
    charge: fruit ? "amber" : "moss",
    strength: 0.86,
    light: fruit ? "butter" : "meadow",
    shade: "pine",
  });
  scatter(r, clumps, 64, (x, y, i) =>
    wash(
      ctx,
      leaf(x, y, r.range(4.5, 6.5), 3.2, r() * TAU),
      fruit && i % 5 === 0
        ? r.pick(["amber", "apricot", "straw"])
        : r.pick(["leaf", "moss", "sap", "pine"]),
      { r, layers: 3, strength: 0.72, soft: 0.15, edge: 0.5 },
    ),
  );
  for (const [x, y, rad] of clumps.slice(2)) scallop(ctx, r, x, y, rad);
  if (fruit) {
    for (const [dx, dy] of APPLES)
      apple(ctx, r, t.X(dx) + r.gauss() * 1.5, foot + dy + r.gauss() * 1.5);
    // Windfalls.
    apple(ctx, r, t.X(-17), foot + 1.5, 3.2);
    apple(ctx, r, t.X(13), foot + 3.5, 3.4);
    splatter(ctx, cx, foot, 30, "amber", { r, n: 7, size: 1.3, strength: 0.9 });
  }
}

/**
 * An apple tree. It belongs to one square but stands about two squares tall
 * and a square and a half wide; it is anchored at the foot of its trunk.
 * Draw it at the same scale as a bed (tile / 64).
 * @param {"leaf"|"bud"|"bloom"|"fruit"|"dormant"} stage
 * @param {number} [variant] 0 or 1
 */
export function tree(stage = "leaf", variant = 0) {
  if (!TREE_STAGES.includes(stage)) throw new Error(`no stage "${stage}" for trees`);
  const v = Math.abs(Math.round(variant)) % 2;
  return sprite(
    `tree-${stage}-${v}`,
    TREE_W,
    TREE_H,
    (ctx, w, h, r) => paintTree(ctx, w, h, r, stage, v),
    { ay: TREE_FEET },
  );
}

// ------------------------------------------------------------------ rocks

export const ROCK_W = 76;
export const ROCK_H = 62;
const ROCK_FEET = 0.84;
export const ROCKS = 3;

// Each rock is a few stones: outline points from the foot, where the moss
// sits, where the snow sits.
const STONES = [
  [
    {
      pts: [
        [-24, 1],
        [-27, -10],
        [-20, -24],
        [-6, -31],
        [10, -28],
        [20, -18],
        [24, -6],
        [21, 2],
        [0, 4],
      ],
      moss: [-12, -26, 11],
      cap: [-4, -30, 26],
    },
    {
      pts: [
        [13, 3],
        [12, -6],
        [19, -12],
        [28, -9],
        [31, 1],
        [23, 5],
      ],
      moss: [18, -10, 4],
      cap: [21, -11, 12],
    },
  ],
  [
    {
      pts: [
        [-29, 1],
        [-30, -11],
        [-22, -22],
        [-10, -20],
        [-4, -9],
        [-5, 2],
        [-16, 4],
      ],
      moss: [-22, -18, 6],
      cap: [-17, -21, 16],
    },
    {
      pts: [
        [-9, 2],
        [-10, -14],
        [-1, -28],
        [13, -30],
        [25, -19],
        [29, -5],
        [25, 3],
        [8, 5],
      ],
      moss: [5, -27, 10],
      cap: [8, -29, 22],
    },
  ],
  [
    {
      pts: [
        [-31, 1],
        [-32, -9],
        [-23, -19],
        [1, -22],
        [21, -18],
        [30, -8],
        [29, 2],
        [0, 5],
      ],
      moss: [-14, -18, 12],
      cap: [-2, -21, 34],
    },
    {
      pts: [
        [-34, 4],
        [-35, -2],
        [-29, -6],
        [-23, -2],
        [-24, 5],
      ],
      moss: null,
      cap: [-29, -6, 8],
    },
  ],
];

function paintRock(ctx, w, h, r, variant, snowy) {
  const cx = w / 2;
  const foot = h * ROCK_FEET;
  if (!snowy) shadow(ctx, cx + 2, foot + 2, 32, 5.5, r, 0.26);
  for (const st of STONES[variant]) {
    const pts = smooth(
      st.pts.map(([x, y]) => [cx + x + r.gauss() * 0.8, foot + y + r.gauss() * 0.8]),
      4,
    );
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
    }
    const wide = x1 - x0;
    const high = foot - y0;
    wash(ctx, pts, "stone", {
      r,
      layers: 12,
      strength: 0.93,
      soft: 0.07,
      edge: 0.7,
      charge: { color: "dusk", n: 3, strength: 0.28 },
    });
    // Shade down the right and underneath; light lifted off the top left.
    wash(
      ctx,
      smooth(
        [
          [x0 + wide * 0.62, y0 + high * 0.2],
          [x1 - 1, y0 + high * 0.5],
          [x1 - 1, foot + 1],
          [x0 + wide * 0.3, foot + 2],
          [x0 + wide * 0.55, y0 + high * 0.6],
        ],
        4,
      ),
      "shadow",
      { r, layers: 7, strength: 0.36, soft: 0.25, edge: 0, glaze: true },
    );
    lift(
      ctx,
      ellipse(x0 + wide * 0.36, y0 + high * 0.3, wide * 0.2, high * 0.14, 8, -0.3),
      r,
      0.3,
      0.4,
    );
    pencil(ctx, pts, { r, closed: true, alpha: 0.55, width: 0.9, gaps: 0.1 });
    if (wide > 20) {
      // A crack or two.
      pencil(
        ctx,
        [
          [x0 + wide * 0.56, y0 + high * 0.12],
          [x0 + wide * 0.5, y0 + high * 0.42],
          [x0 + wide * 0.6, y0 + high * 0.7],
        ],
        { r, passes: 1, alpha: 0.4, width: 0.6, gaps: 0.2 },
      );
      hatch(ctx, x0 + wide * 0.62, y0 + high * 0.45, wide * 0.25, high * 0.4, 1.1, {
        r,
        n: 4,
        len: 4,
        alpha: 0.25,
      });
      splatter(ctx, x0 + wide * 0.45, y0 + high * 0.55, wide * 0.3, "coal", {
        r,
        n: 6,
        size: 0.6,
        strength: 0.5,
      });
    }
    if (st.moss) {
      const [mx, my, mr] = st.moss;
      const green = snowy ? "sage" : "moss";
      wash(ctx, blob(r, cx + mx, foot + my + mr * 0.2, mr, 0.2, 9, 0.6), green, {
        r,
        layers: 8,
        strength: 0.8,
        soft: 0.3,
        edge: 0.4,
        charge: { color: snowy ? "moss" : "sap", n: 2, strength: 0.35 },
      });
      // Moss creeps down the cracks.
      for (let k = 0; k < 3; k++)
        dab(
          ctx,
          r,
          cx + mx + (k - 1) * mr * 0.7,
          foot + my + mr * r.range(0.6, 1),
          mr * 0.3,
          mr * 0.4,
          green,
          {
            strength: 0.6,
            soft: 0.35,
          },
        );
      for (let k = 0; k < 8; k++)
        dot(
          ctx,
          r,
          cx + mx + r.gauss() * mr * 0.5,
          foot + my + mr * 0.2 + r.gauss() * mr * 0.3,
          0.8,
          "pine",
          0.45,
        );
    }
    if (snowy)
      snowCap(
        ctx,
        r,
        cx + st.cap[0],
        foot + st.cap[1] + 1,
        st.cap[2],
        Math.max(4.5, st.cap[2] * 0.3),
      );
  }
  if (snowy) {
    snowFoot(ctx, r, cx, foot + 1, 56);
    return;
  }
  // Grass grown up round the foot, and a daisy.
  for (let i = 0; i < 12; i++) {
    const x = cx + r.range(-31, 31);
    const len = r.range(4, 8.5);
    tick(
      ctx,
      r,
      x,
      foot + r.range(2, 4),
      x + r.gauss() * 2.5,
      foot + 2 - len,
      r.pick(["sap", "leaf", "moss"]),
      0.8,
      1.6,
    );
  }
  const dx = cx + (variant === 1 ? -33 : 30);
  tick(ctx, r, dx, foot + 3, dx + 0.6, foot - 3.5, "leaf", 0.8, 0.9);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    dot(ctx, r, dx + 0.6 + Math.cos(a) * 1.8, foot - 4 + Math.sin(a) * 1.7, 1, "white", 0.95);
  }
  dot(ctx, r, dx + 0.6, foot - 4, 0.9, "sunflower", 0.95);
}

/**
 * A mossy boulder for a rock square, anchored at its foot.
 * @param {number} [variant] 0..2
 * @param {boolean} [snowy] winter: snow on top, no grass
 */
export function rock(variant = 0, snowy = false) {
  const v = Math.abs(Math.round(variant)) % ROCKS;
  return sprite(
    `rock-${v}${snowy ? "-snow" : ""}`,
    ROCK_W,
    ROCK_H,
    (ctx, w, h, r) => paintRock(ctx, w, h, r, v, snowy),
    { ay: ROCK_FEET },
  );
}

// ---------------------------------------------------------------- markers

export const MARKER = 64; // one square, at the same scale as a bed (tile / 64)
export const MARKERS = ["near", "far", "ok", "no", "pick"];

// A loose pencil corner, like a mark made to show where a square is.
function corner(ctx, r, x, y, sx, sy, len, alpha) {
  pencil(
    ctx,
    [
      [x + sx * len, y + sy * 0.6],
      [x + sx * len * 0.3, y + sy * 0.2],
      [x + sx * 1, y + sy * 1],
      [x + sx * 0.3, y + sy * len * 0.35],
      [x + sx * 0.8, y + sy * len],
    ],
    { r, alpha, width: 1, gaps: 0.12, wobble: 0.7 },
  );
}

function paintMarker(ctx, w, h, r, kind) {
  const m = 4.5;
  const box = resample(roundRect(m, m, w - m * 2, h - m * 2, 11), 7);
  const tint = (color, strength, charge) =>
    wash(ctx, box, color, {
      r,
      layers: 12,
      strength,
      soft: 0.16,
      edge: 0.9,
      edgeWidth: 1.3,
      charge: charge ? { color: charge, n: 2, strength: strength * 0.4 } : undefined,
    });
  if (kind === "near") {
    tint("white", 0.3);
    tint("butter", 0.62, "dandelion");
    corner(ctx, r, m + 2, m + 2, 1, 1, 13, 0.45);
    corner(ctx, r, w - m - 2, h - m - 2, -1, -1, 13, 0.45);
  } else if (kind === "far") {
    tint("white", 0.18);
    tint("butter", 0.32);
    corner(ctx, r, m + 2, m + 2, 1, 1, 9, 0.26);
  } else if (kind === "ok") {
    tint("white", 0.3);
    tint("mint", 0.5, "meadow");
    corner(ctx, r, m + 2, m + 2, 1, 1, 12, 0.4);
    corner(ctx, r, w - m - 2, h - m - 2, -1, -1, 12, 0.4);
  } else if (kind === "no") {
    tint("white", 0.2);
    tint("rose", 0.5, "clover");
    corner(ctx, r, w - m - 2, m + 2, -1, 1, 11, 0.36);
    corner(ctx, r, m + 2, h - m - 2, 1, -1, 11, 0.36);
  } else {
    // "pick": a ring drawn round the square by hand, twice over, in white
    // chalk and then pencil so it shows on grass and on snow.
    const ring = ellipse(w / 2, h / 2 + 1, w / 2 - 5.5, h / 2 - 7.5, 14, r.range(-0.1, 0.1));
    const open = [...ring, ring[0], ring[1]];
    wash(
      ctx,
      ribbon(smooth(open, 3, false), () => 4.4),
      "white",
      {
        r,
        layers: 6,
        strength: 0.7,
        soft: 0.1,
        edge: 0,
        rounds: 1,
        detail: 1,
        vary: 0.01,
      },
    );
    pencil(ctx, open, { r, alpha: 0.85, width: 1.5, wobble: 1, gaps: 0.02 });
    pencil(
      ctx,
      ring.map(([x, y]) => [x + 0.8, y - 0.8]),
      {
        r,
        closed: true,
        passes: 1,
        alpha: 0.45,
        width: 1,
        wobble: 1.1,
        gaps: 0.1,
      },
    );
  }
}

/**
 * A soft painted mark the size of one square, anchored at its centre.
 * "near" and "far" are a hive's two rings, "ok" and "no" say where a thing
 * may be put, "pick" rings the selected square.
 * @param {"near"|"far"|"ok"|"no"|"pick"} kind
 */
export function marker(kind) {
  if (!MARKERS.includes(kind)) throw new Error(`no marker "${kind}"`);
  return sprite(
    `marker-${kind}`,
    MARKER,
    MARKER,
    (ctx, w, h, r) => paintMarker(ctx, w, h, r, kind),
    {
      ax: 0.5,
      ay: 0.5,
      grain: 0.6,
    },
  );
}

// ---------------------------------------------------------------- gallery

// A marker shown the way it will be seen: on a patch of meadow.
function onGrass(kind, tone) {
  const s = marker(kind);
  return sprite(
    `gallery-marker-${kind}-${tone}`,
    MARKER + 16,
    MARKER + 16,
    (ctx, w, h, r) => {
      wash(ctx, resample(roundRect(3, 3, w - 6, h - 6, 12), 8), tone, {
        r,
        layers: 14,
        strength: 0.84,
        soft: 0.14,
      });
      put(ctx, s, w / 2, h / 2);
    },
    { ax: 0.5, ay: 0.5 },
  );
}

export const GALLERY = [
  ...TREE_STAGES.map((stage) => ({ name: `tree · ${stage}`, make: () => tree(stage, 0) })),
  ...TREE_STAGES.map((stage) => ({
    name: `tree · ${stage} (variant 1)`,
    make: () => tree(stage, 1),
  })),
  ...[0, 1, 2].map((v) => ({ name: `rock · ${v}`, make: () => rock(v) })),
  ...[0, 1, 2].map((v) => ({ name: `rock · ${v} in snow`, make: () => rock(v, true) })),
  ...MARKERS.map((kind) => ({ name: `marker · ${kind}`, make: () => onGrass(kind, "sap") })),
  ...MARKERS.map((kind) => ({
    name: `marker · ${kind} on snow`,
    make: () => onGrass(kind, "snow"),
  })),
  ...MARKERS.map((kind) => ({
    name: `marker · ${kind} on heath`,
    make: () => onGrass(kind, "heath"),
  })),
];
