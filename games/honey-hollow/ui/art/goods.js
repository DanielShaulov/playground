// Everything a keeper holds, buys and makes that is not a jar of honey: the
// workshop's goods, the shop's items, coins, stars, hearts, seed packets,
// bunches, ribbons. Small still lifes, painted the way the jar is: a shadow,
// two or three washes, a loose pencil line.
//
// Things that stand (goods, items, bunches, packets) share the jar's box and
// ground line, so they sit side by side on a shelf. Things that are signs
// (coin, star, heart, the stars badge) are small and anchored at their middle.

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  shadow,
  ellipse,
  blob,
  rect,
  roundRect,
  smooth,
  leaf,
  petal,
  within,
  TAU,
} from "../paint/wash.js";
import { mix } from "../paint/palette.js";
import { HONEY_COLOR } from "./jars.js";
import { heartShape } from "./icons.js";

export const GOOD_W = 48;
export const GOOD_H = 52;
const CX = GOOD_W / 2;
const BASE = GOOD_H - 5; // the ground line
const FEET = 0.92;

// ------------------------------------------------------------ the tools

function tools(ctx, r) {
  const t = {
    ctx,
    /** A made thing's wash: crisp, nearly solid. */
    fill: (pts, color, o) =>
      wash(ctx, pts, color, { r, layers: 9, strength: 0.93, soft: 0.06, rounds: 1, ...o }),
    /** The same with a second colour run in while wet. */
    two: (pts, color, charge, o) =>
      t.fill(pts, color, { charge: { color: charge, n: 2, strength: 0.3 }, ...o }),
    /** A petal, a leaf, a bud: small and soft. */
    dab: (pts, color, o) =>
      wash(ctx, pts, color, {
        r,
        layers: 5,
        strength: 0.82,
        soft: 0.16,
        rounds: 1,
        detail: 1,
        ...o,
      }),
    /** Shade laid over what is there: the side away from the light. */
    shade: (pts, o) =>
      wash(ctx, pts, "umber", {
        r,
        layers: 5,
        strength: 0.15,
        soft: 0.35,
        edge: 0,
        rounds: 1,
        glaze: true,
        ...o,
      }),
    /** A pale touch where the light lands. */
    light: (pts, o) =>
      wash(ctx, pts, "white", {
        r,
        layers: 4,
        strength: 0.5,
        soft: 0.3,
        edge: 0,
        rounds: 1,
        detail: 1,
        ...o,
      }),
    line: (pts, o) => pencil(ctx, pts, { r, alpha: 0.55, width: 0.85, ...o }),
    ring: (pts, o) => pencil(ctx, pts, { r, closed: true, alpha: 0.55, width: 0.85, ...o }),
    stroke: (path, color, width = 1.5, o) =>
      brush(ctx, path, color, { r, width, strength: 0.85, ...o }),
    ground: (cx, rx, ry = 3.5, strength = 0.3) => shadow(ctx, cx, BASE, rx, ry, r, strength),
  };
  return t;
}

const turn = (pts, cx, cy, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

const arc = (cx, cy, rx, ry, a0, a1, n = 8) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};

const starShape = (cx, cy, R, k = 0.5, rot = -Math.PI / 2) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU;
    const d = i % 2 ? R * k : R;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return pts;
};

const hex = (cx, cy, R, rot = Math.PI / 6) => ellipse(cx, cy, R, R, 6, rot);

// A straight-ish stem from a foot to a tip, as a path for a brush.
const stemTo = (x0, y0, x1, y1, bow = 0) => [
  [x0, y0],
  [(x0 + x1) / 2 + bow, (y0 + y1) / 2],
  [x1, y1],
];

// ------------------------------------------------------------ small parts

// A candle flame with the glow it throws.
function flame(t, x, y, s = 1) {
  t.dab(ellipse(x, y - 4 * s, 6.5 * s, 7 * s, 9), "butter", { strength: 0.4, soft: 0.5, edge: 0 });
  t.line(
    [
      [x, y + 1.5],
      [x + 0.3, y - 1.2],
    ],
    { alpha: 0.8, width: 0.9, passes: 1 },
  );
  const out = petal(x, y - 0.5, 8.4 * s, 5 * s, -Math.PI / 2 + 0.06, 0.38);
  t.fill(out, "sunflower", { layers: 6, strength: 0.9, soft: 0.1 });
  t.fill(petal(x, y - 0.3, 4.6 * s, 2.6 * s, -Math.PI / 2, 0.4), "butter", {
    layers: 4,
    strength: 0.9,
    edge: 0,
  });
  t.ring(out, { alpha: 0.35, width: 0.6, gaps: 0.2, passes: 1 });
}

// A pillar candle standing on the ground line.
function pillar(t, r, cx, w, h, color, charge, lit = true) {
  const top = BASE - h;
  const body = roundRect(cx - w / 2, top, w, h, 2.2);
  t.two(body, color, charge);
  t.shade(rect(cx + w / 2 - w * 0.34, top + 2, w * 0.3, h - 3));
  t.light(rect(cx - w / 2 + 1.6, top + 3, 2, h - 7), { strength: 0.35 });
  // The melted rim, and wax that has run down the side and set.
  t.fill(ellipse(cx, top + 0.4, w / 2 - 0.3, 1.9, 9), "cream", { layers: 6, strength: 0.9 });
  for (let i = 0; i < 2; i++) {
    const x = cx - w / 2 + 2.2 + r() * (w - 4.4);
    t.dab(petal(x, top + 0.6, r.range(4, 8), 2.6, Math.PI / 2, 0.72), "cream", {
      strength: 0.9,
      soft: 0.08,
    });
  }
  t.ring(body, { gaps: 0.08 });
  t.line(arc(cx, top + 0.6, w / 2 - 0.4, 1.9, 0.1, Math.PI - 0.1, 6), {
    alpha: 0.4,
    width: 0.7,
    passes: 1,
  });
  if (lit) flame(t, cx + 0.2, top - 2.2, Math.min(1, w / 12));
  else
    t.line(
      [
        [cx, top],
        [cx + 0.6, top - 3],
      ],
      { alpha: 0.8, width: 0.9, passes: 1 },
    );
}

// A string tied round something, with a little bow.
function twine(t, x0, x1, y, bow = true, color = "bark") {
  for (const dy of [-0.8, 0.9])
    t.line(
      [
        [x0, y + dy],
        [(x0 + x1) / 2, y + dy + 0.8],
        [x1, y + dy],
      ],
      { color, alpha: 0.75, width: 0.9, passes: 1 },
    );
  if (!bow) return;
  const mx = (x0 + x1) / 2;
  for (const side of [-1, 1]) {
    t.ring(ellipse(mx + side * 2.9, y - 1.6, 2.6, 1.7, 8, side * 0.5), {
      color,
      alpha: 0.8,
      width: 0.85,
      passes: 1,
    });
    t.line(
      [
        [mx, y + 0.4],
        [mx + side * 2.4, y + 4.4],
      ],
      { color, alpha: 0.8, width: 0.85, passes: 1 },
    );
  }
}

// A spike of lavender: a stem and dabs up its top third.
function lavenderSpike(t, r, x0, y0, x1, y1, size = 2.6) {
  t.stroke(stemTo(x0, y0, x1, y1, r.gauss() * 0.8), "sage", 1.3);
  const n = 5;
  for (let k = 0; k < n; k++) {
    const u = 0.52 + (k / n) * 0.52;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u;
    const s = size * (1 - (k / n) * 0.5);
    t.dab(
      ellipse(x + (k % 2 ? 1 : -1) * s * 0.42, y, s * 0.74, s, 6, r.gauss() * 0.4),
      r.pick(["violet", "lavender", "lavender", "lilac", "plum"]),
      { soft: 0.26, edge: 0.6 },
    );
  }
}

// A sprig of mint: paired leaves up a stem, a little lilac whorl on top.
function mintSprig(t, r, x0, y0, x1, y1, size = 6) {
  t.stroke(stemTo(x0, y0, x1, y1), "leaf", 1.3);
  const a = Math.atan2(y1 - y0, x1 - x0);
  for (let k = 0; k < 3; k++) {
    const u = 0.3 + k * 0.27;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u;
    const s = size * (1 - k * 0.16);
    for (const side of [-1, 1])
      t.dab(leaf(x, y, s, s * 0.62, a + side * 1.05, 0.46), r.pick(["leaf", "sap", "mint"]), {
        strength: 0.86,
      });
  }
  t.dab(ellipse(x1, y1 - 0.5, 1.9, 2.2, 7), "lilac", { strength: 0.85 });
}

// A sprig of thyme: a thin woody stem, tiny leaves, pink dots at the tip.
function thymeSprig(t, r, x0, y0, x1, y1, size = 2) {
  t.stroke(stemTo(x0, y0, x1, y1, r.gauss() * 0.6), "olive", 1);
  for (let k = 0; k < 6; k++) {
    const u = 0.2 + k * 0.11;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u;
    t.dab(
      ellipse(x + (k % 2 ? 1 : -1) * size * 0.9, y, size * 0.9, size * 0.62, 6, r() * TAU),
      r.pick(["moss", "sage", "leaf"]),
      { strength: 0.85 },
    );
  }
  for (let k = 0; k < 5; k++)
    t.dab(
      ellipse(x1 + r.gauss() * size * 0.8, y1 + r.gauss() * size * 0.8, size * 0.7, size * 0.7, 6),
      r.pick(["heather", "clover", "heather", "rose"]),
      { strength: 0.9, soft: 0.2 },
    );
}

const SPRIG = { lavender: lavenderSpike, mint: mintSprig, thyme: thymeSprig };

// A glass jug of pale syrup.
function jug(t, cx, s = 1) {
  const y = (v) => BASE - v * s;
  const x = (v) => cx + v * s;
  const body = smooth(
    [
      [x(-7), y(27)],
      [x(-11.5), y(13)],
      [x(-9.5), y(1)],
      [x(8.5), y(1)],
      [x(10.5), y(13)],
      [x(6.5), y(27)],
    ],
    5,
  );
  // The handle goes on first, behind.
  t.stroke(arc(x(8.5), y(15), 8 * s, 8.6 * s, -1.2, 1.2, 8), "sky", 5, {
    strength: 0.8,
    width: () => 4.4 * s,
  });
  t.line(arc(x(8.5), y(15), 10.2 * s, 10.8 * s, -1.15, 1.15, 8), { alpha: 0.6 });
  t.line(arc(x(8.5), y(15), 5.8 * s, 6.4 * s, -1.05, 1.05, 6), { alpha: 0.5, passes: 1 });
  t.fill(body, "white", { strength: 0.96 });
  t.fill(body, "sky", { strength: 0.5, edge: 0.6 });
  // The syrup: pale gold, most of the way up.
  within(t.ctx, body, () =>
    t.two(
      smooth(
        [
          [x(-13), y(20)],
          [x(0), y(19)],
          [x(13), y(20)],
          [x(13), y(0)],
          [x(-13), y(0)],
        ],
        3,
      ),
      "butter",
      "straw",
      { strength: 0.92, soft: 0.04 },
    ),
  );
  t.line(
    [
      [x(-10.4), y(19.8)],
      [x(0), y(19)],
      [x(9.6), y(19.8)],
    ],
    { alpha: 0.4, width: 0.7, passes: 1 },
  );
  const lip = smooth(
    [
      [x(-12.5), y(31.5)],
      [x(-6), y(29)],
      [x(7), y(29.4)],
      [x(6.8), y(26.4)],
      [x(-8), y(26)],
    ],
    4,
  );
  t.fill(lip, "white", { strength: 0.96 });
  t.fill(lip, "sky", { strength: 0.5 });
  t.light(roundRect(x(-8.4), y(18), 2.6 * s, 14 * s, 1.2), { strength: 0.55 });
  t.shade(
    smooth(
      [
        [x(3.5), y(26)],
        [x(9.6), y(14)],
        [x(8), y(2)],
        [x(2.5), y(2)],
      ],
      3,
    ),
  );
  t.ring(lip, { alpha: 0.62 });
  t.ring(body, { alpha: 0.62, gaps: 0.05 });
  return { x, y };
}

// ------------------------------------------------------------ goods

function soap(kind) {
  const TONES = {
    lavender: ["lilac", "lavender"],
    mint: ["mint", "sage"],
    thyme: [mix("straw", "cream", 0.35), "olive"],
  };
  return (t, r) => {
    const [tone, deep] = TONES[kind];
    t.ground(CX + 1, 18);
    const bar = (cx, cy, rot, banded) => {
      const shape = turn(roundRect(cx - 14, cy - 7.5, 28, 15, 3), cx, cy, rot);
      t.two(shape, tone, deep, { strength: 0.94 });
      t.shade(turn(roundRect(cx - 13, cy + 2.4, 26, 4.4, 2), cx, cy, rot), { strength: 0.13 });
      t.light(turn(roundRect(cx - 11.5, cy - 6, 14, 2.6, 1.3), cx, cy, rot), { strength: 0.4 });
      if (kind === "thyme") splatter(t.ctx, cx, cy, 11, "moss", { r, n: 9, size: 0.7 });
      t.ring(shape, { gaps: 0.08 });
      if (!banded) return;
      // The paper band, with a pressed sprig on it.
      const band = turn(rect(cx - 5.5, cy - 8.2, 11, 16.4), cx, cy, rot);
      t.fill(band, "white", { strength: 0.96, soft: 0.04 });
      t.fill(band, "cream", { strength: 0.45, soft: 0.04, edge: 0.4 });
      t.ring(band, { alpha: 0.45, width: 0.7 });
      SPRIG[kind](t, r, cx - 1.6, cy + 5.4, cx + 1.8, cy - 4.6, kind === "mint" ? 3.6 : 1.7);
    };
    bar(CX - 3, BASE - 21.5, 0.13, false);
    bar(CX + 2, BASE - 8.6, -0.05, true);
  };
}

const GOODS = {
  candle(t, r) {
    t.ground(CX + 1, 17);
    pillar(t, r, 15.5, 12, 27, "butter", "honey");
    pillar(t, r, 31, 13.5, 16.5, "butter", "dandelion");
  },
  "lavender-candle"(t, r) {
    t.ground(CX + 1, 14);
    pillar(t, r, CX, 18, 24.5, "lilac", "lavender");
    twine(t, CX - 9, CX + 9, BASE - 9.5, false);
    lavenderSpike(t, r, CX - 6, BASE - 3, CX + 2.5, BASE - 21, 2.5);
    lavenderSpike(t, r, CX - 1.5, BASE - 3.5, CX + 6.8, BASE - 18, 2.3);
    twine(t, CX - 9, CX + 9, BASE - 9.5, true);
  },
  "soap-lavender": soap("lavender"),
  "soap-mint": soap("mint"),
  "soap-thyme": soap("thyme"),
  balm(t) {
    t.ground(CX + 1.5, 17);
    // The lid, leaning against the tin.
    const lid = ellipse(35.4, BASE - 12.6, 6.6, 11.6, 14, 0.36);
    t.two(lid, "pond", "sky");
    t.ring(lid);
    t.ring(ellipse(34.6, BASE - 12.8, 4.6, 9.2, 12, 0.36), { alpha: 0.35, width: 0.7, passes: 1 });
    const heart = heartShape(34.4, BASE - 13.2, 2.9);
    t.fill(turn(heart, 34.4, BASE - 13.2, 0.3), "white", { layers: 5, strength: 0.9 });
    // The tin itself.
    // Straight sides and a shallow curve underneath: a tin, not a bowl.
    const side = smooth(
      [
        [8.4, BASE - 11.4],
        [8.4, BASE - 7.6],
        [8.6, BASE - 4],
        [10.8, BASE - 1.9],
        [15.4, BASE - 0.5],
        [21, BASE - 0.1],
        [26.6, BASE - 0.5],
        [31.2, BASE - 1.9],
        [33.4, BASE - 4],
        [33.6, BASE - 7.6],
        [33.6, BASE - 11.4],
      ],
      2,
    );
    t.two(side, "pond", "sky");
    t.shade(
      smooth(
        [
          [26, BASE - 8],
          [33.2, BASE - 10],
          [33, BASE - 4.6],
          [27, BASE - 1],
        ],
        3,
      ),
    );
    t.ring(side);
    // The rolled lip under the mouth.
    t.line(
      [
        [9.4, BASE - 8.6],
        [14.6, BASE - 5.9],
        [21, BASE - 5.1],
        [27.4, BASE - 5.9],
        [32.6, BASE - 8.6],
      ],
      { alpha: 0.4, width: 0.8, passes: 1 },
    );
    const mouth = ellipse(21, BASE - 11.4, 12.6, 4.6, 14);
    t.fill(mouth, "cloud", { strength: 0.96 });
    const balmTop = ellipse(21, BASE - 11, 10.8, 3.5, 12);
    t.two(balmTop, "honey", "butter", { strength: 0.95 });
    t.light(ellipse(17.4, BASE - 11.8, 4, 1.1, 8), { strength: 0.55 });
    t.ring(mouth);
    t.ring(balmTop, { alpha: 0.35, width: 0.7, passes: 1 });
  },
  wraps(t, r) {
    t.ground(CX + 1, 19);
    const cloth = (shape, tone, dot, n) => {
      t.two(shape, tone, "white", { strength: 0.94 });
      within(t.ctx, shape, () => {
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const [x, y] of shape) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        for (let i = 0; i < n; i++)
          t.dab(ellipse(r.range(x0, x1), r.range(y0, y1), 1.25, 1.25, 6), dot, {
            strength: 0.9,
            soft: 0.1,
            edge: 0,
          });
      });
      t.ring(shape, { gaps: 0.08 });
    };
    // Two folded squares...
    cloth(roundRect(7, BASE - 9.5, 34, 9.5, 2.4), "mint", "white", 16);
    t.line(
      [
        [9, BASE - 4.8],
        [39, BASE - 4.4],
      ],
      { alpha: 0.35, width: 0.7, passes: 1 },
    );
    cloth(roundRect(9.5, BASE - 18.5, 29, 9.5, 2.4), "butter", "clover", 14);
    t.line(
      [
        [11.5, BASE - 13.8],
        [36.5, BASE - 13.5],
      ],
      { alpha: 0.35, width: 0.7, passes: 1 },
    );
    // ...and one rolled up and tied.
    const roll = turn(roundRect(10.5, BASE - 30.5, 27, 12, 6), CX, BASE - 24.5, -0.06);
    cloth(roll, "blush", "poppy", 12);
    t.shade(turn(roundRect(12, BASE - 23.5, 24, 4, 2), CX, BASE - 24.5, -0.06), { strength: 0.12 });
    const end = ellipse(12.2, BASE - 23.8, 3.6, 5.6, 10, -0.06);
    t.fill(end, "white", { strength: 0.9 });
    t.ring(end);
    t.line(arc(12.2, BASE - 23.8, 1.7, 2.9, 0.4, 5.6, 7), { alpha: 0.5, width: 0.7, passes: 1 });
    twine(t, 21.6, 27.4, BASE - 24.4, true);
  },
  basket(t, r) {
    t.ground(CX + 1, 20, 3.8);
    // The handle, behind everything.
    const handle = arc(CX, BASE - 16, 15.4, 22.5, Math.PI, TAU, 10);
    t.stroke(handle, "bark", 3, { width: () => 2.8, strength: 0.9 });
    t.line(arc(CX, BASE - 16, 16.8, 24, Math.PI + 0.05, TAU - 0.05, 10), { alpha: 0.5 });
    // What is in it: a jar, a candle, a spike of lavender.
    lavenderSpike(t, r, 27, BASE - 14, 25, BASE - 36, 2.5);
    const glass = roundRect(10.5, BASE - 28, 12.5, 14, 3.4);
    t.two(glass, HONEY_COLOR.blend, "amber", { strength: 0.94 });
    t.ring(glass);
    const cap = smooth(
      [
        [9, BASE - 26.4],
        [11.5, BASE - 30.2],
        [16.7, BASE - 31.4],
        [22, BASE - 30.2],
        [24.5, BASE - 26.4],
        [16.7, BASE - 27.6],
      ],
      4,
    );
    t.two(cap, "sky", "white");
    t.ring(cap, { alpha: 0.5 });
    const wax = roundRect(28.5, BASE - 31, 8, 17, 1.8);
    t.two(wax, "butter", "honey");
    t.ring(wax);
    t.line(
      [
        [32.5, BASE - 31],
        [33, BASE - 34],
      ],
      { alpha: 0.8, width: 0.9, passes: 1 },
    );
    // The wicker.
    const body = smooth(
      [
        [6.6, BASE - 15.5],
        [41.4, BASE - 15.5],
        [38.6, BASE - 3.6],
        [34.4, BASE],
        [13.6, BASE],
        [9.4, BASE - 3.6],
      ],
      4,
    );
    t.two(body, "wood", "straw", { strength: 0.94 });
    within(t.ctx, body, () => {
      for (let y = BASE - 11.6; y < BASE; y += 3.7)
        t.line(
          [
            [5, y],
            [CX, y + 1.2],
            [43, y],
          ],
          { alpha: 0.4, width: 0.8, passes: 1 },
        );
      for (let x = 10.5; x < 40; x += 4.1)
        t.line(
          [
            [x, BASE - 15],
            [x + (x - CX) * -0.1, BASE],
          ],
          { alpha: 0.28, width: 0.7, passes: 1 },
        );
    });
    t.shade(
      smooth(
        [
          [29, BASE - 14],
          [41, BASE - 15],
          [38.4, BASE - 3.6],
          [33.6, BASE - 0.6],
        ],
        3,
      ),
    );
    t.ring(body, { gaps: 0.06 });
    const rim = roundRect(5.4, BASE - 18.2, 37.2, 4.6, 2.2);
    t.two(rim, "straw", "honey");
    t.ring(rim);
    // A ribbon tied on the front.
    for (const side of [-1, 1]) {
      const loop = ellipse(CX + side * 5.4, BASE - 9.6, 4.9, 3.2, 9, side * -0.4);
      t.two(loop, "rose", "blush");
      t.ring(loop, { alpha: 0.5 });
      const tailEnd = [
        [CX + side * 0.6, BASE - 8.2],
        [CX + side * 5.6, BASE - 2.6],
        [CX + side * 3, BASE - 1.8],
        [CX - side * 0.4, BASE - 6],
      ];
      t.fill(tailEnd, "clover", { layers: 6, strength: 0.9 });
    }
    t.fill(ellipse(CX, BASE - 9.2, 2.2, 2.1, 8), "clover", { layers: 6 });
    t.ring(ellipse(CX, BASE - 9.2, 2.2, 2.1, 8), { alpha: 0.5, passes: 1 });
  },
};

// ------------------------------------------------------------ items

const ITEMS = {
  wax(t) {
    t.ground(CX + 1, 18);
    const cake = (x, y, w, h, tone, deep) => {
      const shape = roundRect(x, y, w, h, 3);
      t.two(shape, tone, deep, { strength: 0.95 });
      t.shade(roundRect(x + w * 0.68, y + 1.4, w * 0.3, h - 2.4, 2));
      t.light(roundRect(x + 2.4, y + 1.4, w * 0.55, 2.4, 1.2), { strength: 0.5 });
      t.ring(shape, { gaps: 0.07 });
      // The keeper's stamp: a comb cell.
      t.ring(hex(x + w * 0.4, y + h * 0.56, Math.min(3.6, h * 0.3)), {
        alpha: 0.4,
        width: 0.8,
        passes: 1,
      });
    };
    cake(8, BASE - 13, 32, 13, "honey", "sunflower");
    cake(12.5, BASE - 25, 24.5, 12.4, "dandelion", "honey");
  },
  remedy(t, r) {
    t.ground(CX + 1, 12);
    const glass = smooth(
      [
        [20, BASE - 31],
        [20, BASE - 26.4],
        [14.6, BASE - 21.5],
        [14.4, BASE - 3],
        [17, BASE],
        [31, BASE],
        [33.6, BASE - 3],
        [33.4, BASE - 21.5],
        [28, BASE - 26.4],
        [28, BASE - 31],
      ],
      4,
    );
    t.two(glass, "sage", "mint", { strength: 0.88 });
    within(t.ctx, glass, () =>
      t.fill(rect(13, BASE - 19, 22, 20), "moss", { strength: 0.42, soft: 0.04 }),
    );
    t.light(roundRect(16.4, BASE - 20, 2.4, 17, 1.2), { strength: 0.5 });
    t.shade(roundRect(29, BASE - 21, 3.6, 19, 1.6));
    t.ring(glass, { gaps: 0.06 });
    const cork = roundRect(19.4, BASE - 36.4, 9.2, 6.6, 1.8);
    t.two(cork, "wood", "bark");
    t.ring(cork);
    const label = roundRect(16.6, BASE - 17.4, 14.8, 12.4, 1.6);
    t.fill(label, "white", { strength: 0.96, soft: 0.04 });
    t.ring(label, { alpha: 0.42, width: 0.7 });
    thymeSprig(t, r, 21.6, BASE - 6.6, 26.2, BASE - 14.2, 1.5);
  },
  syrup(t) {
    t.ground(CX + 2, 16);
    const { x, y } = jug(t, CX - 2);
    // A slow drip from the lip.
    const drop = petal(x(-12.2), y(29.5), 7, 3.4, Math.PI / 2 + 0.1, 0.72);
    t.fill(drop, "butter", { layers: 6, strength: 0.92 });
    t.ring(drop, { alpha: 0.4, width: 0.7, passes: 1 });
  },
  spare(t) {
    t.ground(CX + 1, 19, 3.8);
    const box = roundRect(9.5, BASE - 21, 29, 21, 1.6);
    t.two(box, "cream", "paperShade", { strength: 0.95 });
    t.shade(rect(30, BASE - 20, 8, 19), { strength: 0.13 });
    t.ring(box);
    t.line(
      [
        [18.5, BASE - 12],
        [29.5, BASE - 12],
      ],
      { alpha: 0.42, width: 1.1, passes: 1 },
    );
    t.fill(roundRect(17, BASE - 5, 14, 2.8, 1), "umber", { layers: 6, strength: 0.82 });
    // The roof, set on a little crooked: nobody lives here yet.
    const roof = turn(
      [
        [5.6, BASE - 21],
        [CX, BASE - 33.4],
        [42.4, BASE - 21],
        [CX, BASE - 19.6],
      ],
      CX,
      BASE - 22,
      -0.09,
    );
    t.two(smooth(roof, 3), "terracotta", "poppy");
    t.line([roof[0], roof[1], roof[2]], { alpha: 0.6, width: 0.9 });
    t.line([roof[0], roof[3], roof[2]], { alpha: 0.45, passes: 1 });
  },
};

// ------------------------------------------------------------ signs

/** The coin: honey gold, with a comb cell struck in it. */
function coin() {
  return sprite(
    "sign-coin",
    24,
    24,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      const disc = ellipse(12, 12, 10.4, 10.4, 18);
      t.two(disc, "dandelion", "sunflower", { strength: 0.96, soft: 0.04 });
      // The raised middle, a shade paler than the rim.
      t.fill(ellipse(12, 12, 7.6, 7.6, 14), "butter", {
        layers: 6,
        strength: 0.5,
        soft: 0.1,
        edge: 0.8,
      });
      t.shade(arc(12, 12, 10, 10, -0.5, 1.9, 8).concat(arc(11, 11, 8.6, 8.6, 1.9, -0.5, 8)), {
        strength: 0.2,
      });
      t.ring(hex(12, 12.1, 4.1), { color: "chestnut", alpha: 0.7, width: 1, wobble: 0.2 });
      t.light(ellipse(8.2, 7.4, 2.6, 1.4, 8, -0.7), { strength: 0.65 });
      t.ring(disc, { alpha: 0.72, width: 1, wobble: 0.3, gaps: 0.03 });
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

/** A renown star. */
function renownStar() {
  return sprite(
    "sign-star",
    24,
    24,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      const shape = smooth(starShape(12, 12.8, 11, 0.52), 2);
      t.two(shape, "dandelion", "sunflower", { strength: 0.96, soft: 0.04 });
      t.light(ellipse(9.4, 9.4, 2.4, 1.4, 8, -0.6), { strength: 0.6 });
      t.ring(shape, { alpha: 0.72, width: 1, wobble: 0.3, gaps: 0.03 });
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

/**
 * A regular's heart.
 * @param {boolean} [full] won, or still to win
 */
export function heart(full = true) {
  return sprite(
    `sign-heart-${full ? "full" : "empty"}`,
    22,
    22,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      const shape = heartShape(11, 10.8, 8.8);
      if (full) {
        t.two(shape, "poppy", "clover", { strength: 0.95, soft: 0.04 });
        t.light(ellipse(7.6, 7.4, 2.2, 1.4, 8, -0.6), { strength: 0.6 });
        t.ring(shape, { alpha: 0.65, width: 0.95, wobble: 0.3 });
      } else {
        t.fill(shape, "blush", { strength: 0.55, soft: 0.06, edge: 0.3 });
        t.ring(shape, { alpha: 0.6, width: 0.95, wobble: 0.3, gaps: 0.08 });
      }
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

/**
 * The purity stars shown beside a honey's name.
 * @param {1|2|3} n
 */
export function starsBadge(n) {
  if (![1, 2, 3].includes(n)) throw new Error(`no stars badge for "${n}" (1 to 3)`);
  return sprite(
    `sign-stars-${n}`,
    4 + n * 14,
    16,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      for (let i = 0; i < n; i++) {
        const shape = smooth(starShape(9 + i * 14, 8.6 + (i % 2 ? -0.5 : 0.3), 7, 0.5), 2);
        t.two(shape, "dandelion", "sunflower", { strength: 0.96, soft: 0.04, layers: 7 });
        t.ring(shape, { alpha: 0.7, width: 0.85, wobble: 0.22 });
      }
    },
    { ax: 0.5, ay: 0.5, scale: 2, grain: 0.6 },
  );
}

/** A piece of honeycomb, for decoration. */
export function honeycomb() {
  return sprite(
    "sign-honeycomb",
    56,
    50,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      const R = 7.2;
      const dx = R * Math.sqrt(3);
      const cells = [];
      for (let row = 0; row < 4; row++) {
        const n = row === 0 || row === 3 ? 2 : 3;
        const x0 = w / 2 - ((n - 1) * dx) / 2 + (row === 3 ? dx / 2 : 0) - (row === 0 ? dx / 2 : 0);
        for (let i = 0; i < n; i++) cells.push([x0 + i * dx, 9.5 + row * R * 1.5]);
      }
      const FILLS = ["honey", "amber", "sunflower", "butter", "honey", "dandelion"];
      cells.forEach(([x, y], i) => {
        const cell = hex(x, y, R - 0.5);
        if (i === 6) {
          // One cell still empty: paper.
          t.fill(cell, "cream", { strength: 0.8 });
        } else {
          t.two(cell, FILLS[i % FILLS.length], "amber", { strength: 0.94, soft: 0.05 });
          t.light(ellipse(x - 1.8, y - 2.2, 2, 1.1, 7, -0.6), { strength: 0.45 });
        }
        t.ring(hex(x + 0.3, y - 0.2, R - 0.2), { alpha: 0.5, width: 0.9, wobble: 0.3 });
      });
      // Honey running out of the bottom cell.
      const [bx, by] = cells[cells.length - 1];
      const drop = petal(bx - 1, by + R - 1.5, 9, 4.4, Math.PI / 2, 0.74);
      t.fill(drop, "honey", { strength: 0.94 });
      t.ring(drop, { alpha: 0.45, width: 0.8, passes: 1 });
      t.light(ellipse(bx - 2, by + R + 3.6, 0.9, 1.6, 6), { strength: 0.6 });
    },
    { ax: 0.5, ay: 0.5, grain: 0.8 },
  );
}

// ------------------------------------------------------------ bunches

const BUNCHES = {
  lavender: {
    stems: ["sage", "leaf"],
    head: (t, r, x0, y0, x1, y1) => lavenderSpike(t, r, x0, y0, x1, y1, 3),
  },
  mint: {
    stems: ["leaf", "sap"],
    head: (t, r, x0, y0, x1, y1) => mintSprig(t, r, x0, y0, x1, y1, 7.4),
  },
  thyme: {
    stems: ["olive", "moss"],
    head: (t, r, x0, y0, x1, y1) => thymeSprig(t, r, x0, y0, x1, y1, 2.3),
  },
};

/**
 * A tied bunch picked from a bed, for the workshop.
 * @param {"lavender"|"mint"|"thyme"} flower
 */
export function bunch(flower) {
  const kind = BUNCHES[flower];
  if (!kind) throw new Error(`no bunch of "${flower}" (lavender, mint or thyme)`);
  return sprite(
    `bunch-${flower}`,
    GOOD_W,
    GOOD_H,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      t.ground(CX + 1, 13, 3.2, 0.26);
      const tie = [CX, BASE - 13];
      const n = flower === "mint" ? 5 : 7;
      // The cut ends, splayed below the string.
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        t.stroke(
          stemTo(tie[0] + u * 3, tie[1], tie[0] + u * 17 + r.gauss(), BASE - 1 - Math.abs(u) * 4),
          r.pick(kind.stems),
          1.5,
        );
      }
      // The stems above it, outermost first so the middle ones sit on top.
      const order = [...Array(n).keys()].sort((a, b) => Math.abs(b - n / 2) - Math.abs(a - n / 2));
      for (const i of order) {
        const u = (i + 0.5) / n - 0.5;
        const tall = (flower === "mint" ? 27 : 30) * (1 - Math.abs(u) * 0.34) + r.gauss();
        kind.head(t, r, tie[0] + u * 3, tie[1], tie[0] + u * 34 + r.gauss(), tie[1] - tall);
      }
      twine(t, tie[0] - 4.6, tie[0] + 4.6, tie[1] + 0.4, true);
    },
    { ay: FEET },
  );
}

// ------------------------------------------------------------ seed packets

// One small flower for the front of each packet: its colour and its shape
// and nothing else. Drawn around (x, y), about 16 px across.
const MINI = {
  dandelion(t, r, x, y) {
    for (let k = 0; k < 14; k++)
      t.dab(
        petal(x, y, r.range(6.4, 7.6), 2.4, (k / 14) * TAU, 0.7),
        r.pick(["dandelion", "dandelion", "sunflower"]),
        { soft: 0.12 },
      );
    t.dab(ellipse(x, y, 2.4, 2.4, 8), "sunflower", { strength: 0.9 });
  },
  apple(t, r, x, y) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * TAU;
      const p = ellipse(x + Math.cos(a) * 4.4, y + Math.sin(a) * 4.4, 3.9, 3.3, 9, a);
      t.dab(p, k % 2 ? "blush" : "rose", { strength: 0.9, soft: 0.1 });
      t.ring(p, { alpha: 0.3, width: 0.6, passes: 1, gaps: 0.2 });
    }
    t.dab(ellipse(x, y, 1.8, 1.8, 7), "dandelion", { strength: 0.95 });
  },
  clover(t, r, x, y) {
    t.stroke(stemTo(x, y + 9, x + 0.5, y), "leaf", 1.3);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k - 1) * 1.2;
      t.dab(ellipse(x - 4.6 + Math.cos(a) * 1.9, y + 7 + Math.sin(a) * 1.9, 2, 1.7, 7), "leaf", {
        strength: 0.88,
      });
    }
    t.dab(blob(r, x, y - 1, 5.4, 0.1), "blush", { strength: 0.9, soft: 0.2 });
    for (let k = 0; k < 12; k++) {
      const a = -Math.PI / 2 + r.gauss() * 1.2;
      t.dab(
        petal(x + Math.cos(a) * 1.4, y - 0.4 + Math.sin(a) * 1.4, 3.8, 2, a),
        r.pick(["clover", "rose", "clover", "heather"]),
        { strength: 0.7 },
      );
    }
  },
  borage(t, r, x, y) {
    for (let k = 0; k < 5; k++) {
      const p = petal(x, y, 7.6, 4.6, -Math.PI / 2 + (k / 5) * TAU, 0.5);
      t.dab(p, k % 2 ? "borage" : "dusk", { strength: 0.92, soft: 0.1 });
    }
    t.dab(ellipse(x, y, 2.2, 2.2, 8), "white", { strength: 0.95, soft: 0.08 });
    t.dab(ellipse(x, y, 1, 1, 6), "coal", { strength: 0.9, soft: 0.05 });
  },
  lavender(t, r, x, y) {
    lavenderSpike(t, r, x - 2.5, y + 9, x - 4, y - 8, 2.5);
    lavenderSpike(t, r, x + 1, y + 9, x + 3.6, y - 7, 2.5);
  },
  thyme(t, r, x, y) {
    thymeSprig(t, r, x - 3, y + 9, x - 4.4, y - 5, 2);
    thymeSprig(t, r, x + 0.5, y + 9, x + 4, y - 6, 2);
  },
  mint(t, r, x, y) {
    mintSprig(t, r, x, y + 9.5, x + 0.6, y - 7, 6.2);
  },
  sunflower(t, r, x, y) {
    for (let k = 0; k < 15; k++)
      t.dab(
        petal(x, y, r.range(7.2, 8.4), 3.2, (k / 15) * TAU, 0.6),
        r.pick(["sunflower", "dandelion", "sunflower"]),
        { soft: 0.1, strength: 0.88 },
      );
    t.dab(ellipse(x, y, 3.7, 3.7, 10), "bark", { strength: 0.92, soft: 0.08 });
    t.dab(ellipse(x + 0.6, y + 0.6, 1.8, 1.8, 7), "chestnut", { strength: 0.7 });
  },
  buckwheat(t, r, x, y) {
    t.stroke(stemTo(x - 1, y + 9.5, x + 0.5, y - 3, 1), "terracotta", 1.3);
    const heartLeaf = turn(heartShape(x - 5, y + 3.4, 3.4), x - 5, y + 3.4, 2.5);
    t.dab(heartLeaf, "leaf", { strength: 0.88 });
    for (let k = 0; k < 7; k++) {
      const p = ellipse(x + r.gauss() * 3.4, y - 4 + r.gauss() * 2.6, 2, 2, 7);
      t.dab(p, k % 3 ? "white" : "blush", { strength: 0.95, soft: 0.08 });
      t.ring(p, { alpha: 0.32, width: 0.55, passes: 1, wobble: 0.2 });
    }
  },
  heather(t, r, x, y) {
    for (const [dx, lean] of [
      [-3, -3],
      [2.4, 3.4],
    ]) {
      t.stroke(stemTo(x + dx * 0.4, y + 9.5, x + dx + lean * 0.5, y - 8), "pine", 1.1);
      for (let k = 0; k < 8; k++) {
        const u = 0.3 + k * 0.09;
        const px = x + dx * 0.4 + (dx * 0.6 + lean * 0.5) * u;
        const py = y + 9.5 - 17.5 * u;
        t.dab(
          ellipse(px + (k % 2 ? 1.5 : -1.5), py, 1.6, 2, 6),
          r.pick(["heather", "clover", "heather", "plum"]),
          { strength: 0.88 },
        );
      }
    }
  },
  ivy(t, r, x, y) {
    const lobes = [
      [0, -8],
      [2.4, -3.4],
      [8, -3.6],
      [4.6, 0.8],
      [6.4, 6.4],
      [0, 3.8],
      [-6.4, 6.4],
      [-4.6, 0.8],
      [-8, -3.6],
      [-2.4, -3.4],
    ].map(([px, py]) => [x + px, y + py + 0.6]);
    const shape = smooth(lobes, 3);
    t.two(shape, "pine", "moss", { strength: 0.92 });
    for (const [px, py] of [
      [0, -6.4],
      [6, -2.8],
      [-6, -2.8],
      [4.6, 5],
      [-4.6, 5],
    ])
      t.line(
        [
          [x, y + 2.6],
          [x + px, y + py + 0.6],
        ],
        { color: "mint", alpha: 0.85, width: 0.75, passes: 1, wobble: 0.2 },
      );
    t.stroke(stemTo(x, y + 4, x + 1, y + 10), "moss", 1.2);
  },
};

const BAND = {
  dandelion: "dandelion",
  apple: "blush",
  clover: "clover",
  borage: "borage",
  lavender: "lavender",
  thyme: "heather",
  mint: "mint",
  sunflower: "sunflower",
  buckwheat: "terracotta",
  heather: "plum",
  ivy: "pine",
};

/** The flowers that have a seed packet. */
export const SEED_FLOWERS = Object.keys(MINI);

/**
 * A packet of seeds: cream paper, a band in the flower's colour, the flower.
 * @param {string} flower one of SEED_FLOWERS
 */
export function seeds(flower) {
  const mini = MINI[flower];
  if (!mini) throw new Error(`no seed packet for "${flower}"`);
  return sprite(
    `seeds-${flower}`,
    GOOD_W,
    GOOD_H,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      t.ground(CX + 1.5, 15, 3.2, 0.28);
      const lean = -0.05;
      const mid = [CX, BASE - 20.5];
      const packet = turn(roundRect(9, BASE - 41, 30, 40.5, 1.8), mid[0], mid[1], lean);
      t.fill(packet, "white", { strength: 0.97, soft: 0.04 });
      t.fill(packet, "cream", {
        strength: 0.6,
        soft: 0.04,
        charge: { color: "white", n: 2, strength: 0.4 },
      });
      t.shade(turn(rect(31, BASE - 40, 7, 38.5), mid[0], mid[1], lean), { strength: 0.08 });
      // The folded top, in the flower's colour.
      const flap = turn(roundRect(9, BASE - 41, 30, 8.4, 1.8), mid[0], mid[1], lean);
      within(ctx, packet, () => t.fill(flap, BAND[flower], { strength: 0.86, soft: 0.04 }));
      t.line(
        turn(
          [
            [9.5, BASE - 32.6],
            [38.5, BASE - 32.6],
          ],
          mid[0],
          mid[1],
          lean,
        ),
        {
          alpha: 0.4,
          width: 0.7,
          passes: 1,
        },
      );
      mini(t, r, CX - 0.4, BASE - 16.5);
      const corner = turn(
        [
          [9, BASE - 41],
          [39, BASE - 41],
          [39, BASE - 0.5],
          [9, BASE - 0.5],
        ],
        mid[0],
        mid[1],
        lean,
      );
      for (let i = 0; i < 4; i++) t.line([corner[i], corner[(i + 1) % 4]], { alpha: 0.5 });
      // A few seeds got out.
      for (const [sx, sy] of [
        [40.5, BASE - 1],
        [43.2, BASE - 2.8],
        [5.4, BASE - 0.6],
      ])
        t.dab(ellipse(sx, sy, 1.2, 0.8, 6, r() * TAU), "umber", { strength: 0.75, soft: 0.1 });
    },
    { ay: FEET },
  );
}

// ------------------------------------------------------------ ribbons

const MEDAL = {
  bronze: {
    frill: "apricot",
    deep: "terracotta",
    tails: "terracotta",
    disc: "cream",
    mark: "chestnut",
  },
  silver: {
    frill: "cloud",
    deep: mix("cloud", "dusk", 0.45),
    tails: "dusk",
    disc: "white",
    mark: "dusk",
  },
  gold: { frill: "dandelion", deep: "sunflower", tails: "honey", disc: "butter", mark: "amber" },
};

/**
 * A rosette from the Honey Show.
 * @param {"bronze"|"silver"|"gold"} medal
 */
export function ribbon(medal) {
  const m = MEDAL[medal];
  if (!m) throw new Error(`no ribbon for "${medal}" (bronze, silver or gold)`);
  return sprite(
    `ribbon-${medal}`,
    GOOD_W,
    GOOD_H,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      const cx = CX;
      const cy = 19;
      // Two tails with swallow-tail ends.
      for (const side of [-1, 1]) {
        const tailShape = turn(
          [
            [cx - 5.4, cy + 4],
            [cx + 5.4, cy + 4],
            [cx + 5.6, cy + 31],
            [cx, cy + 26.6],
            [cx - 5.6, cy + 31],
          ],
          cx,
          cy + 4,
          side * -0.27,
        ).map(([x, y]) => [x + side * 5, y]);
        t.two(tailShape, m.tails, m.deep, { strength: 0.93 });
        t.ring(tailShape, { alpha: 0.5, gaps: 0.08 });
      }
      // The frill: a ring of pleats.
      const pleats = 13;
      for (let i = 0; i < pleats; i++) {
        const a = (i / pleats) * TAU + 0.1;
        const p = ellipse(cx + Math.cos(a) * 10.6, cy + Math.sin(a) * 10.6, 5.6, 4.3, 9, a);
        t.fill(p, i % 2 ? m.frill : m.deep, { layers: 6, strength: 0.92, soft: 0.07 });
        t.ring(p, { alpha: 0.34, width: 0.65, passes: 1, gaps: 0.15 });
      }
      const disc = ellipse(cx, cy, 9, 9, 14);
      t.two(disc, m.disc, "white", { strength: 0.96 });
      t.ring(disc, { alpha: 0.55 });
      const mark = smooth(starShape(cx, cy + 0.5, 5.6, 0.5), 2);
      t.fill(mark, m.mark, { layers: 6, strength: 0.85, soft: 0.06 });
    },
    { ax: 0.5, ay: 0.5 },
  );
}

// ------------------------------------------------------------ lookups

/**
 * Something made in the workshop.
 * @param {string} id one of GOOD_IDS
 */
export function good(id) {
  const paint = GOODS[id];
  if (!paint) throw new Error(`no painter for good "${id}"`);
  return sprite(`good-${id}`, GOOD_W, GOOD_H, (ctx, w, h, r) => paint(tools(ctx, r), r), {
    ay: FEET,
  });
}

/**
 * Something the keeper holds or the game counts: wax, remedy, syrup, spare
 * (stand on the ground), coin, star (signs, anchored at their middle).
 * @param {string} id one of ITEM_IDS
 */
export function item(id) {
  if (id === "coin") return coin();
  if (id === "star") return renownStar();
  const paint = ITEMS[id];
  if (!paint) throw new Error(`no painter for item "${id}"`);
  return sprite(`item-${id}`, GOOD_W, GOOD_H, (ctx, w, h, r) => paint(tools(ctx, r), r), {
    ay: FEET,
  });
}

export const GOOD_IDS = Object.keys(GOODS);
export const ITEM_IDS = [...Object.keys(ITEMS), "coin", "star"];

export const GALLERY = GOOD_IDS.map((id) => ({ name: id, make: () => good(id), zoom: 2 }));

export const GALLERY_ITEMS = [
  ...Object.keys(ITEMS).map((id) => ({ name: id, make: () => item(id), zoom: 2 })),
  { name: "coin", make: () => item("coin"), zoom: 2 },
  { name: "star", make: () => item("star"), zoom: 2 },
  { name: "heart", make: () => heart(true), zoom: 2 },
  { name: "heart · empty", make: () => heart(false), zoom: 2 },
  ...[1, 2, 3].map((n) => ({ name: `stars · ${n}`, make: () => starsBadge(n), zoom: 2 })),
  ...Object.keys(BUNCHES).map((f) => ({ name: `bunch · ${f}`, make: () => bunch(f), zoom: 2 })),
  ...Object.keys(MEDAL).map((m) => ({ name: `ribbon · ${m}`, make: () => ribbon(m), zoom: 2 })),
  { name: "honeycomb", make: honeycomb, zoom: 2 },
  ...SEED_FLOWERS.map((f) => ({ name: `seeds · ${f}`, make: () => seeds(f), zoom: 2 })),
];
