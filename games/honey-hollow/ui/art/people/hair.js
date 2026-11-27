// Hair, in head space (see kit.js): the head is an egg 31 wide and 33 tall
// about the origin, and the shoulders sit near y = 20.
//
// Sari's first note on the game was that the hair looked thin, so the rule
// here is volume. Every style is a big soft mass that stands well clear of
// the skull, built the same way: a full wash, a darker charge pooled
// underneath and at the parting, a lifted band of light across the crown, a
// few brush strands that follow the flow, then a loose pencil line and one
// strand that has escaped.
//
// Each style paints in two goes: `back` before the body (so long hair falls
// behind the shoulders) and `front` after the face.

import { wash, brush, pencil, ellipse, smooth, petal, ribbon } from "../../paint/wash.js";
import { mix } from "../../paint/palette.js";
import { ink, line, pool } from "./kit.js";

const TAU = Math.PI * 2;
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

// ----------------------------------------------------------------- tools

const fitted = (h, pts) => (h.fit ? pts.map(h.fit) : pts);

/** A mass of hair: the base wash. Returns the outline it painted. */
function mass(h, pts, o = {}) {
  const shape = o.raw ? pts : smooth(fitted(h, pts), 3);
  wash(h.ctx, shape, h.c.base, {
    r: h.r,
    layers: 11,
    strength: 0.95,
    soft: 0.1,
    edge: 0.7,
    ...o,
  });
  return shape;
}

const spots = (h, list) =>
  list.map(([x, y, ...rest]) => {
    const [fx, fy] = h.fit ? h.fit([x, y]) : [x, y];
    return [fx, fy, ...rest];
  });

/** The darker charge: under the mass, at the roots, where locks overlap. */
const deep = (h, shape, list, s = 0.5) => pool(h.ctx, h.r, shape, h.c.dark, spots(h, list), s);
/** The lifted highlight. */
const shine = (h, shape, list, s = 0.55) => pool(h.ctx, h.r, shape, h.c.light, spots(h, list), s);

/** One brush strand along a few points. */
function strand(h, pts, tone = "dark", width = 1, strength = 0.55) {
  brush(h.ctx, smooth(fitted(h, pts), 4, false), h.c[tone], {
    r: h.r,
    width,
    strength,
    layers: 3,
    edge: 0,
  });
}

/** A lock: a ribbon of hair along a path, `width` at its fattest. */
function lock(h, pts, width, o = {}) {
  const path = smooth(fitted(h, pts), 5, false);
  const shape = ribbon(
    path,
    o.taper ?? ((t) => width * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.25)))),
  );
  wash(h.ctx, shape, h.c.base, {
    r: h.r,
    layers: 8,
    strength: 0.95,
    soft: 0.1,
    edge: 0.7,
    rounds: 1,
    ...o,
  });
  return shape;
}

/** A flyaway: one hair that got away. */
function wisp(h, pts, alpha = 0.7) {
  ink(h.ctx, fitted(h, pts), h.c.dark, 0.5, alpha);
}

const edge = (h, pts, o = {}) =>
  line(h.ctx, h.r, pts, { alpha: 0.4, width: 0.65, gaps: 0.2, color: h.pencil, ...o });

/** A scalloped ring of points: the edge of a cloud of curls. */
function cloud(r, cx, cy, rx, ry, bumps, depth = 0.1, a0 = 0, a1 = TAU) {
  const pts = [];
  const n = bumps * 2;
  const closed = a1 - a0 >= TAU - 0.01;
  for (let i = 0; i < (closed ? n : n + 1); i++) {
    const a = a0 + (i / n) * (a1 - a0);
    const k = 1 + (i % 2 ? -depth : depth * 0.5) + r.gauss() * 0.012;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** Little coils scattered over curls: a dark C and a light one beside it. */
function coils(h, list) {
  for (const [x, y, s = 1, a = 0] of list) {
    const c = Math.cos(a);
    const n = Math.sin(a);
    const at = (u, v) => [x + (u * c - v * n) * s, y + (u * n + v * c) * s];
    strand(
      h,
      [at(-2.4, 0.6), at(-0.6, -2.2), at(2.2, -0.8), at(1.4, 1.8), at(-0.4, 1)],
      "dark",
      0.9,
      0.5,
    );
    strand(h, [at(-3.4, -1.4), at(-1.2, -3.6), at(1.6, -3.2)], "light", 1.1, 0.5);
  }
}

// Under a hat, the fringe that still shows below the brim: [x, angle, length].
const PEEKS = {
  full: [
    [-11.6, 1.95, 5.4],
    [-6, 1.75, 4.4],
    [-0.6, 1.5, 4],
    [5, 1.3, 4.4],
    [10.6, 1.1, 5.6],
  ],
  swept: [
    [-11, 2.15, 5.2],
    [-4, 1.05, 4.6],
    [2.6, 0.9, 5.4],
    [8.6, 0.85, 6.4],
  ],
  sides: [
    [-10.6, 2.1, 5.6],
    [10.6, 1.05, 5.6],
  ],
};

function peek(h, kind) {
  const y = h.brim;
  if (y == null || !kind) return;
  if (kind === "curly") {
    for (const [x, rad] of [
      [-11.6, 3],
      [-6.4, 2.6],
      [-1, 2.4],
      [4.6, 2.6],
      [10.6, 3.1],
    ]) {
      const curl = cloud(h.r, x, y + rad * 0.3 - Math.abs(x) * 0.06, rad, rad * 0.9, 4, 0.1);
      wash(h.ctx, smooth(curl, 3), h.c.base, {
        r: h.r,
        layers: 6,
        strength: 0.94,
        soft: 0.12,
        edge: 0.8,
      });
    }
    return;
  }
  for (const [x, a, len] of PEEKS[kind]) {
    const tuft = petal(x, y - 2.4 - Math.abs(x) * 0.06, len + 2.6, 5, a, 0.6);
    wash(h.ctx, tuft, h.c.base, { r: h.r, layers: 6, strength: 0.94, soft: 0.12, edge: 0.9 });
    ink(
      h.ctx,
      [
        [x + Math.cos(a) * 1.5, y - 1.6],
        [x + Math.cos(a) * (len + 1.4), y - 2.4 + Math.sin(a) * (len + 1.4)],
      ],
      h.c.dark,
      0.55,
      0.5,
    );
  }
}

// The hair that rings the head on every style that is gathered up or back.
const RING = [
  [0, -22.4],
  [9, -21],
  [16.6, -15],
  [19.6, -5],
  [19, 5],
  [16, 12.5],
  [9, 16.5],
  [0, 17],
  [-9, 16.5],
  [-16, 12.5],
  [-19, 5],
  [-19.6, -5],
  [-16.6, -15],
  [-9, -21],
];

// --------------------------------------------------------------- styles

const STYLES = {
  "long-waves": {
    peek: "swept",
    back(h) {
      const shape = mass(h, [
        [0, -23.6],
        [9.4, -22.2],
        [17.6, -15.6],
        [21.6, -5.4],
        [22.6, 4],
        [25.8, 11],
        [24, 19],
        [27.2, 27],
        [25, 35],
        [26.6, 40.4],
        [21, 43.6],
        [16, 40.6],
        [10, 42.8],
        [0, 39.6],
        [-9, 43],
        [-15, 41],
        [-20.6, 44.4],
        [-26.4, 41],
        [-24.6, 35],
        [-27, 27.6],
        [-23.8, 20],
        [-25.8, 11.6],
        [-22.6, 4],
        [-21.6, -5.4],
        [-17.6, -15.6],
        [-9.4, -22.2],
      ]);
      deep(h, shape, [
        [0, 25, 15, 15],
        [22, 33, 4, 8],
        [-22, 34, 4, 8],
      ]);
      strand(h, [
        [-22, 2],
        [-24.4, 10],
        [-22.6, 19],
        [-25.4, 27],
        [-23.4, 35],
        [-24.6, 41],
      ]);
      strand(h, [
        [22, 2],
        [24.6, 10],
        [22.8, 18.6],
        [25.8, 27],
        [23.6, 35],
        [24.8, 40],
      ]);
      edge(h, shape.slice(8, 36));
      edge(h, shape.slice(44, 72));
    },
    front(h) {
      // Parted on the left of the picture and swept across the brow.
      const top = mass(h, [
        [-16.6, -1.5],
        [-18.6, -9],
        [-13.8, -19],
        [-4, -23.6],
        [6, -23.2],
        [14.8, -18],
        [18.8, -8.5],
        [17, 0.5],
        [14.6, -3.2],
        [11.6, -7.4],
        [6, -10.2],
        [0, -12.2],
        [-4.6, -14.8],
        [-6.8, -12.8],
        [-10.8, -9.4],
        [-13.8, -5],
        [-15.2, -1],
      ]);
      // Two long locks that come forward over the shoulders, waving as they go.
      const right = mass(h, [
        [13.8, -4.6],
        [17.8, -2.8],
        [19.8, 5],
        [22.8, 12],
        [20.6, 20],
        [23.6, 28],
        [21.6, 35],
        [24, 39.4],
        [19, 41.8],
        [15.4, 38],
        [16.6, 31],
        [14, 24],
        [15.8, 16],
        [13.6, 8],
      ]);
      const left = mass(h, [
        [-13.6, -3.6],
        [-17.6, -2.6],
        [-20, 5.6],
        [-22.8, 13],
        [-20.4, 21],
        [-23.2, 29],
        [-21, 36],
        [-23, 40.8],
        [-17.6, 43.2],
        [-14.4, 39],
        [-15.6, 32],
        [-13.4, 25],
        [-15.2, 17],
        [-13.4, 8],
      ]);
      deep(h, top, [
        [-5.2, -16, 3, 5.4, 0.3],
        [16.2, -5, 3, 5],
        [-15.8, -5.4, 2.6, 4.6],
      ]);
      deep(
        h,
        right,
        [
          [14.6, 12, 2.2, 8],
          [15.4, 28, 2.2, 6],
        ],
        0.42,
      );
      deep(
        h,
        left,
        [
          [-14.4, 13, 2.2, 8],
          [-14.6, 29, 2.2, 6],
        ],
        0.42,
      );
      shine(h, top, [[4.6, -18.4, 9.4, 2.7, -0.12]]);
      shine(h, right, [
        [20.6, 12, 2, 5],
        [21.6, 29, 2, 5],
        [20, 39.6, 3, 2],
      ]);
      shine(h, left, [
        [-20.6, 13, 2, 5],
        [-21.2, 30, 2, 5],
        [-19, 41, 3, 2],
      ]);
      strand(h, [
        [-4, -18.8],
        [4, -16.8],
        [11, -11.8],
        [15.4, -5],
      ]);
      strand(h, [
        [-3, -21.4],
        [6, -20.4],
        [13.8, -14.6],
        [17.6, -6],
      ]);
      strand(h, [
        [-6.4, -18.4],
        [-12.2, -13.6],
        [-16, -6],
      ]);
      strand(h, [
        [16.6, 1],
        [19.4, 9],
        [17.4, 18],
        [20.2, 27],
        [18.4, 34],
        [20, 39.6],
      ]);
      strand(h, [
        [-16.4, 1],
        [-19.4, 10],
        [-17.2, 19],
        [-19.8, 28],
        [-17.8, 35.6],
        [-18.8, 41],
      ]);
      edge(h, top.slice(0, 24));
      edge(h, top.slice(24), { alpha: 0.3 });
      edge(h, right.slice(2, 26));
      edge(h, left.slice(2, 26));
      wisp(h, [
        [-10, -22],
        [-14.6, -25.2],
        [-17.4, -23.8],
      ]);
    },
  },

  braid: {
    peek: "swept",
    back(h) {
      const shape = mass(h, RING);
      deep(h, shape, [[0, 10, 18, 8]]);
      edge(h, shape.slice(36).concat(shape.slice(0, 8)));
    },
    front(h) {
      // Everything is gathered to the right of the picture and plaited.
      const top = mass(h, [
        [-16.4, 2.6],
        [-18.8, -7],
        [-14, -18.6],
        [-4, -23.2],
        [6, -22.8],
        [14.8, -17.6],
        [19, -8],
        [18.6, 3],
        [16.4, 10.6],
        [13.6, 8.4],
        [14.4, 1],
        [13.6, -4.6],
        [10.4, -8.4],
        [5, -10.8],
        [0, -12.4],
        [-4.6, -14.8],
        [-7, -12.6],
        [-11, -9],
        [-14, -4.4],
        [-15, 1.6],
      ]);
      deep(h, top, [
        [-5.2, -16, 3, 5.4, 0.3],
        [16.4, 4, 3, 7],
        [-15.8, -3, 2.4, 5],
      ]);
      shine(h, top, [[4.6, -18, 9.4, 2.7, -0.12]]);
      strand(h, [
        [-4, -18.6],
        [5, -16.4],
        [12, -11],
        [16, -3],
        [16.2, 6],
      ]);
      strand(h, [
        [-3, -21.2],
        [7, -20],
        [14.6, -14],
        [17.6, -4],
      ]);
      strand(h, [
        [-6.4, -18],
        [-12.4, -13],
        [-16, -5],
      ]);
      edge(h, top.slice(0, 27));
      edge(h, top.slice(30), { alpha: 0.3 });
      // The plait: plump knots, each tucked under the one above.
      const path = smooth(
        [
          [15.4, 9],
          [17.8, 17],
          [17, 27],
          [15, 36],
          [13.8, 43],
        ],
        6,
        false,
      );
      const n = 6;
      for (let i = n - 1; i >= 0; i--) {
        const t = i / (n - 0.4);
        const k = Math.floor(t * (path.length - 1));
        const [x, y] = path[k];
        const s = i % 2 ? 1 : -1;
        const w = 5.2 - i * 0.34;
        const knot = ellipse(x + s * 1.1, y + 2.4, w, 3.9, 9, s * 0.62);
        wash(h.ctx, knot, h.c.base, {
          r: h.r,
          layers: 7,
          strength: 0.95,
          soft: 0.1,
          edge: 0.9,
        });
        pool(h.ctx, h.r, knot, h.c.dark, [[x + s * 2.6, y + 4.4, 2.6, 1.8]], 0.5);
        pool(h.ctx, h.r, knot, h.c.light, [[x - s * 0.4, y + 0.8, 2, 1.3, s * 0.6]], 0.55);
        edge(h, knot, { closed: true, passes: 1, gaps: 0.3, alpha: 0.36 });
      }
      // Tied with a ribbon, and a little brush of loose ends below.
      const [ex, ey] = path[path.length - 1];
      const tuft = petal(ex + 0.4, ey + 4.6, 8.6, 6.4, Math.PI / 2 + 0.12, 0.5);
      wash(h.ctx, tuft, h.c.base, { r: h.r, layers: 7, strength: 0.94, soft: 0.14, edge: 0.7 });
      strand(
        h,
        [
          [ex, ey + 5],
          [ex - 0.6, ey + 11.4],
        ],
        "dark",
        0.8,
      );
      const bow = h.ribbon ?? "rose";
      for (const s of [-1, 1])
        wash(h.ctx, petal(ex + 0.2, ey + 4.6, 5.2, 4, s > 0 ? -0.5 : Math.PI + 0.4), bow, {
          r: h.r,
          layers: 6,
          strength: 0.94,
          soft: 0.1,
          edge: 0.9,
        });
      wash(h.ctx, ellipse(ex + 0.2, ey + 4.6, 1.5, 1.6, 7), mix(bow, "berry", 0.4), {
        r: h.r,
        layers: 5,
        strength: 0.95,
        soft: 0.08,
      });
      // A loose lock by the other cheek.
      const loose = lock(
        h,
        [
          [-14.4, -3.6],
          [-16.6, 3],
          [-15.2, 9],
          [-16.6, 13.6],
        ],
        3.2,
      );
      edge(h, loose.slice(0, loose.length / 2), { passes: 1, alpha: 0.3 });
    },
  },

  bun: {
    peek: "sides",
    back(h) {
      const shape = mass(h, RING);
      deep(h, shape, [[0, 10, 18, 8]]);
      edge(h, shape.slice(36).concat(shape.slice(0, 8)));
      if (h.hatted) {
        // Under a hat the bun rides low, at the nape.
        const low = mass(h, ellipse(12.6, 15, 6.4, 5.6, 9, 0.3), { raw: true, layers: 8 });
        pool(h.ctx, h.r, low, h.c.dark, [[11, 17.6, 5, 2.4]], 0.5);
        pool(h.ctx, h.r, low, h.c.light, [[14.6, 12.6, 2.6, 1.5]], 0.5);
        edge(h, low, { closed: true, passes: 1 });
        return;
      }
      const bun = mass(
        h,
        smooth(
          [
            [1.6, -35],
            [8.4, -32.6],
            [11.6, -26],
            [9.4, -19.6],
            [1.6, -17.4],
            [-6.4, -19.6],
            [-8.8, -26],
            [-5.6, -32.8],
          ],
          4,
        ),
        { raw: true, soft: 0.12 },
      );
      pool(h.ctx, h.r, bun, h.c.dark, [
        [1.6, -19.4, 8.6, 3],
        [8.6, -24, 3, 5],
      ]);
      pool(h.ctx, h.r, bun, h.c.light, [[-2.6, -30.4, 4.6, 2.4, -0.3]], 0.6);
      strand(h, [
        [-5.6, -23.6],
        [-2, -31],
        [6.4, -30.4],
        [8.8, -24],
      ]);
      strand(h, [
        [-2.6, -22.4],
        [1.6, -27.4],
        [6, -24.6],
      ]);
      edge(h, bun, { closed: true, gaps: 0.25 });
      wisp(h, [
        [7.6, -33],
        [11.6, -36.6],
        [14.2, -35.4],
      ]);
      wisp(h, [
        [-6, -31.6],
        [-9.6, -34.4],
      ]);
    },
    front(h) {
      // Swept up softly from the brow.
      const top = mass(h, [
        [-16.2, 1],
        [-18.2, -8],
        [-13.6, -18.2],
        [-5, -22.6],
        [5, -22.8],
        [13.6, -18.2],
        [18.2, -8],
        [16.2, 1],
        [14.6, -3],
        [12.6, -8.6],
        [7.6, -12],
        [2, -13.4],
        [-3.4, -12.8],
        [-8.6, -11.2],
        [-12.8, -7.8],
        [-14.8, -3],
      ]);
      deep(h, top, [
        [0.6, -20.4, 9, 2.6],
        [16, -5, 2.6, 5],
        [-16, -5, 2.6, 5],
      ]);
      shine(h, top, [[-3.4, -16.4, 8, 2.4, 0.1]]);
      for (const [x0, x1] of [
        [-11, -5],
        [-4.6, -1.6],
        [2.6, 1.4],
        [9.4, 4.6],
        [14, 8],
      ])
        strand(h, [
          [x0, -9.6 - (1 - Math.abs(x0) / 14) * 3],
          [(x0 + x1) / 2, -16],
          [x1, -21.4],
        ]);
      edge(h, top.slice(0, 22));
      edge(h, top.slice(22), { alpha: 0.3 });
      // Strands that have slipped out at the temples.
      const a = lock(
        h,
        [
          [-14.4, -4.6],
          [-16.8, 2.6],
          [-15.4, 9],
          [-17, 14.4],
        ],
        3.4,
      );
      const b = lock(
        h,
        [
          [14.2, -4.6],
          [16.6, 1.6],
          [15.6, 7.6],
          [17.4, 11.6],
        ],
        3,
      );
      edge(h, a.slice(0, a.length / 2), { passes: 1, alpha: 0.3 });
      edge(h, b.slice(0, b.length / 2), { passes: 1, alpha: 0.3 });
      wisp(h, [
        [6, -12.6],
        [10.4, -9.6],
        [11.6, -6],
      ]);
    },
  },

  curls: {
    peek: "curly",
    back(h) {
      const shape = mass(h, cloud(h.r, 0, -1.6, 25, 23.6, 12, 0.1), { soft: 0.14, layers: 12 });
      deep(h, shape, [
        [0, 12, 22, 9],
        [-20, 6, 4.6, 8],
        [20.6, 5, 4.6, 8],
      ]);
      coils(h, [
        [-20.6, -6, 1.1, 0.4],
        [20.4, -7.6, 1.1, 2],
        [-20, 9.6, 1, 1.2],
        [20.6, 9, 1, 3],
        [-13.6, -19.6, 1, 0.2],
        [14, -19.6, 1, 1.4],
      ]);
      edge(h, shape, { closed: true, gaps: 0.3 });
    },
    front(h) {
      const top = mass(
        h,
        [
          [-17.4, 2],
          [-20.6, -7],
          [-16, -18.4],
          [-6, -24.8],
          [6, -25],
          [16, -18.4],
          [20.6, -7],
          [17.4, 2.6],
          [14.2, 1.6],
          [15.2, -3.6],
          [11.6, -5.4],
          [10.6, -9.2],
          [6.4, -8.4],
          [4, -11.6],
          [0, -9.6],
          [-3.6, -12.2],
          [-6.6, -9],
          [-10.4, -9.8],
          [-11.6, -5.6],
          [-15, -4],
          [-14.2, 1.6],
        ],
        { edge: 0.3 },
      );
      deep(h, top, [
        [0, -13.6, 12, 3],
        [-16.6, -3, 3, 5],
        [16.6, -3, 3, 5],
      ]);
      shine(h, top, [
        [-5, -19.6, 6.4, 2.6, -0.2],
        [9.6, -17, 3.6, 2],
      ]);
      // Curls that tumble in front of the ears and onto the shoulders.
      for (const [x, y, rad] of [
        [-17.6, 8.6, 5.6],
        [18, 8, 5.4],
        [-19.6, 16, 5],
        [20, 15, 4.8],
      ]) {
        const curl = mass(h, cloud(h.r, x, y, rad, rad * 0.94, 5, 0.1), { layers: 7, edge: 0.6 });
        pool(h.ctx, h.r, curl, h.c.dark, [[x * 0.92, y + rad * 0.5, rad * 0.8, rad * 0.4]], 0.4);
      }
      coils(h, [
        [-9.6, -17, 1.1, 0.3],
        [1.6, -19.6, 1.1, 1],
        [11, -15.6, 1, 2.2],
        [-16, -9, 1, 4],
        [16.6, -8, 1, 5],
        [-17.6, 9.6, 0.9, 1],
        [18, 9, 0.9, 2.6],
        [-19.6, 16.6, 0.8, 0],
        [20, 15.6, 0.8, 4],
        [-3, -13.6, 0.8, 2],
        [7.6, -11.6, 0.8, 0.6],
      ]);
      edge(h, top.slice(24), { alpha: 0.34, gaps: 0.3 });
    },
  },

  bob: {
    peek: "full",
    back(h) {
      const shape = mass(h, [
        [0, -22.8],
        [9.6, -21.2],
        [17.2, -14.6],
        [20.8, -4],
        [21.6, 6],
        [20.6, 13.6],
        [16.6, 17.6],
        [9, 16.4],
        [0, 15.6],
        [-9, 16.4],
        [-16.6, 17.8],
        [-20.8, 13.6],
        [-21.8, 6],
        [-20.8, -4],
        [-17.2, -14.6],
        [-9.6, -21.2],
      ]);
      deep(h, shape, [[0, 12, 20, 7]]);
      edge(h, shape.slice(42).concat(shape.slice(0, 7)));
    },
    front(h) {
      // A full fringe, and sides that wave down to turn in at the chin.
      const top = mass(h, [
        [-17, -2.6],
        [-18.8, -10],
        [-13.8, -18.8],
        [-5, -23],
        [5, -23],
        [13.8, -18.8],
        [18.8, -10],
        [17, -2.6],
        [14.4, -3.2],
        [10.6, -4.8],
        [7.4, -6.2],
        [5.6, -4.8],
        [1.6, -6.2],
        [-2.6, -5.2],
        [-4.6, -6.8],
        [-9, -5.4],
        [-12, -4.2],
        [-14.4, -2.8],
      ]);
      const right = mass(h, [
        [13.4, -5.4],
        [17.8, -4.6],
        [21, 2],
        [19.8, 8],
        [21.8, 13],
        [17.6, 18.6],
        [12.6, 16.8],
        [14.6, 11.6],
        [13.6, 6],
        [14.8, 1],
      ]);
      const left = mass(h, [
        [-13.4, -5.4],
        [-17.8, -4.6],
        [-21.2, 2.4],
        [-20, 8.4],
        [-22, 13.6],
        [-17.6, 19.4],
        [-12.6, 17.4],
        [-14.6, 12],
        [-13.6, 6.4],
        [-14.8, 1],
      ]);
      deep(h, top, [
        [0, -7.4, 13, 2],
        [1, -21.6, 8, 2],
      ]);
      deep(h, right, [
        [14.6, 8, 2, 7],
        [16.4, 16.6, 4, 2.4],
      ]);
      deep(h, left, [
        [-14.6, 8, 2, 7],
        [-16.4, 17.2, 4, 2.4],
      ]);
      shine(h, top, [[-1.6, -15.4, 11.6, 2.7, 0.04]]);
      shine(h, right, [[19.4, 5, 1.6, 5]]);
      shine(h, left, [[-19.6, 5.6, 1.6, 5]]);
      for (const [x, lean] of [
        [-11, -0.5],
        [-6.4, -0.3],
        [-1.4, 0],
        [3.6, 0.2],
        [8.4, 0.4],
        [12.4, 0.6],
      ])
        strand(h, [
          [x * 0.5, -20.6],
          [x * 0.86 + lean, -12.6],
          [x + lean * 2, -6],
        ]);
      strand(h, [
        [17, -2],
        [19.4, 4],
        [18.4, 10],
        [18.6, 15.6],
      ]);
      strand(h, [
        [-17, -2],
        [-19.6, 4.4],
        [-18.6, 10.4],
        [-18.6, 16.4],
      ]);
      edge(h, top.slice(0, 22));
      edge(h, top.slice(22), { alpha: 0.32 });
      edge(h, right.slice(2, 18));
      edge(h, left.slice(2, 18));
      wisp(h, [
        [8.6, -21.6],
        [13.6, -24.4],
        [16.4, -22.6],
      ]);
    },
  },

  tousled: {
    peek: "full",
    back(h) {
      const shape = mass(h, [
        [0, -23],
        [8, -22.2],
        [16.2, -16.8],
        [19.4, -7],
        [18.6, 1.6],
        [15.8, 6.4],
        [0, 8],
        [-15.8, 6.4],
        [-18.6, 1.6],
        [-19.4, -7],
        [-16.2, -16.8],
        [-8, -22.2],
      ]);
      deep(h, shape, [
        [17.6, -2, 3, 6],
        [-17.6, -2, 3, 6],
      ]);
      edge(h, shape.slice(9, 18));
      edge(h, shape.slice(21, 30));
    },
    front(h) {
      // A thick, rumpled pile: the top is lumpy, never a smooth dome.
      const top = mass(h, [
        [-16.8, -1.4],
        [-19.2, -8],
        [-17.4, -15.6],
        [-13.2, -21.4],
        [-8.4, -22.8],
        [-5, -25.8],
        [0, -24],
        [4.6, -26.6],
        [9.6, -23.6],
        [14.2, -21.8],
        [17.8, -15.6],
        [19.6, -8.6],
        [17, -1.4],
        [14.6, -6.2],
        [10, -10.4],
        [3, -11.4],
        [-3, -12.6],
        [-9, -10.6],
        [-14, -6.6],
      ]);
      deep(h, top, [
        [-4.6, -20, 5, 2.6],
        [16.6, -6, 2.6, 4.6],
        [-16.6, -6, 2.6, 4.6],
      ]);
      // Chunky locks tumbling forward over the brow.
      const tufts = [
        [14.8, -11.6, 11.6, 6.6, 1.42],
        [-14.8, -11.8, 11, 6.4, 1.72],
        [-9, -17.6, 11.6, 7, 2.2],
        [10.4, -19.6, 12.4, 7, 0.86],
        [-6, -20, 12.6, 7.4, 1.28],
        [5.4, -21.2, 13.4, 7.8, 0.74],
        [-1, -21.2, 14.4, 8, 0.98],
      ];
      for (const [x, y, len, wid, a] of tufts)
        wash(h.ctx, fitted(h, petal(x, y, len, wid, a, 0.55)), h.c.base, {
          r: h.r,
          layers: 7,
          strength: 0.9,
          soft: 0.12,
          edge: 1,
        });
      shine(h, top, [
        [3, -20.6, 9.4, 2.4, -0.1],
        [-10, -18.6, 4, 2, -0.6],
      ]);
      for (const [x, y, len, , a] of tufts.slice(2)) {
        const c = Math.cos(a);
        const n = Math.sin(a);
        strand(h, [
          [x + c * 1.6, y + n * 1.6],
          [x + c * len * 0.5 - n * 0.9, y + n * len * 0.5 + c * 0.9],
          [x + c * len * 0.92, y + n * len * 0.92],
        ]);
      }
      strand(h, [
        [-9.6, -21.6],
        [-5.4, -24.4],
        [-0.6, -22.6],
      ]);
      strand(h, [
        [1, -23.4],
        [5, -25.2],
        [10, -22.4],
      ]);
      edge(h, top.slice(0, 37), { alpha: 0.36 });
      wisp(h, [
        [2.6, -26],
        [6.6, -29.6],
        [9, -28.6],
      ]);
    },
  },

  curly: {
    peek: "curly",
    back(h) {
      const shape = mass(h, cloud(h.r, 0, -6.6, 21, 19.4, 11, 0.1), { soft: 0.14 });
      deep(h, shape, [
        [18, -2, 4, 7],
        [-18, -2, 4, 7],
      ]);
      coils(h, [
        [-17.6, -8.6, 1, 0.4],
        [17.6, -9.6, 1, 2],
        [-12, -20.4, 1, 0.2],
        [12.6, -20.4, 1, 1.4],
      ]);
      edge(h, shape, { closed: true, gaps: 0.3 });
    },
    front(h) {
      const top = mass(
        h,
        [
          [-16.4, 0],
          [-19.8, -8],
          [-15.6, -19.2],
          [-6, -25],
          [6, -25.2],
          [15.6, -19.2],
          [19.8, -8],
          [16.4, 0.6],
          [14.4, -1.6],
          [15.2, -5.6],
          [12, -7],
          [11, -10.6],
          [7, -9.4],
          [4.6, -12.6],
          [0.6, -10.4],
          [-3, -13],
          [-6, -10],
          [-10, -11.2],
          [-11.6, -7],
          [-15, -5.6],
          [-14.4, -1.6],
        ],
        { edge: 0.3 },
      );
      deep(h, top, [
        [0, -14.4, 12, 2.6],
        [-16.6, -4, 2.6, 4.6],
        [16.6, -4, 2.6, 4.6],
      ]);
      shine(h, top, [
        [-5, -20, 6.4, 2.6, -0.2],
        [9.6, -17.6, 3.6, 2],
      ]);
      coils(h, [
        [-9.6, -17.6, 1.1, 0.3],
        [1.6, -20, 1.1, 1],
        [10.6, -16.4, 1, 2.2],
        [-15.6, -9.6, 0.9, 4],
        [16, -9, 0.9, 5],
        [-3, -14.4, 0.8, 2],
        [7.6, -12.6, 0.8, 0.6],
      ]);
      edge(h, top.slice(24), { alpha: 0.34, gaps: 0.3 });
    },
  },

  "side-part": {
    peek: "swept",
    back(h) {
      const shape = mass(h, [
        [0, -22.2],
        [8.6, -21],
        [15.8, -15.6],
        [18.4, -7],
        [17.8, 1],
        [15.6, 5.4],
        [0, 7],
        [-15.6, 5.4],
        [-17.8, 1],
        [-18.4, -7],
        [-15.8, -15.6],
        [-8.6, -21],
      ]);
      edge(h, shape.slice(30).concat(shape.slice(0, 7)));
    },
    front(h) {
      // Parted low on the left of the picture; the rest rises into a wave.
      const side = mass(h, [
        [-7.4, -16.6],
        [-10.4, -13],
        [-13.6, -8.4],
        [-14.8, -3],
        [-15.2, 2.8],
        [-17.4, -1.6],
        [-18.8, -9.6],
        [-15.8, -17.6],
        [-10, -21],
      ]);
      const sweep = mass(h, [
        [-7.8, -16.2],
        [-6.4, -21.8],
        [1, -25.6],
        [10, -24.6],
        [16.8, -19],
        [19.4, -10.6],
        [17.6, -1.6],
        [15.4, 3],
        [14.4, -1],
        [14.8, -5.6],
        [12.6, -9.8],
        [7.4, -12],
        [1.4, -12.4],
        [-3.6, -13.6],
      ]);
      deep(h, sweep, [
        [-5.6, -17, 2.4, 4.6, 0.3],
        [16.6, -5, 2.6, 5.6],
        [4, -13.4, 9, 1.8],
      ]);
      deep(h, side, [[-9.4, -16.4, 2, 4, -0.6]]);
      shine(h, sweep, [[5.6, -20.4, 8.6, 2.6, -0.06]], 0.6);
      strand(h, [
        [-6, -19],
        [2, -22],
        [10.6, -20],
        [16.4, -13],
      ]);
      strand(h, [
        [-5.4, -16],
        [3, -17.4],
        [10.6, -15],
        [15.4, -8.6],
      ]);
      strand(h, [
        [-4, -14.2],
        [3.6, -14.4],
        [10, -12],
      ]);
      strand(h, [
        [-8.8, -17],
        [-13.4, -13],
        [-16.4, -6.6],
      ]);
      strand(h, [
        [-9.6, -14.6],
        [-13.4, -9.4],
        [-15.6, -3],
      ]);
      edge(h, sweep.slice(0, 24));
      edge(h, sweep.slice(24), { alpha: 0.32 });
      edge(h, side.slice(12));
      wisp(h, [
        [9, -25],
        [13.6, -27.6],
        [16.4, -25.6],
      ]);
    },
  },

  "long-tied": {
    peek: "sides",
    back(h) {
      const shape = mass(h, RING);
      deep(h, shape, [[0, 10, 18, 8]]);
      edge(h, shape.slice(36).concat(shape.slice(0, 8)));
    },
    front(h) {
      // Parted in the middle, drawn back behind the ears, and the tail
      // brought forward over one shoulder.
      const top = mass(h, [
        [-15.8, 0.6],
        [-18.6, -7],
        [-14.6, -18.2],
        [-5, -22.8],
        [5, -22.8],
        [14.6, -18.2],
        [18.6, -7],
        [15.8, 0.6],
        [14.4, -3.6],
        [13.2, -8],
        [9, -11.6],
        [3.6, -13.4],
        [1, -16],
        [-1.6, -13.6],
        [-7.6, -11.8],
        [-12.6, -8],
        [-14.4, -3.6],
      ]);
      deep(h, top, [
        [0.8, -18.6, 2.2, 5],
        [16.4, -5, 2.6, 5],
        [-16.4, -5, 2.6, 5],
      ]);
      shine(h, top, [
        [8.6, -17, 5.6, 2.4, 0.5],
        [-7.6, -17.4, 5.6, 2.4, -0.5],
      ]);
      for (const s of [-1, 1]) {
        strand(h, [
          [s * 1.6 + 0.8, -20],
          [s * 8, -17],
          [s * 14, -11],
          [s * 16.6, -3],
        ]);
        strand(h, [
          [s * 2.4 + 0.8, -15.6],
          [s * 8, -13.6],
          [s * 13.4, -8.6],
        ]);
      }
      edge(h, top.slice(0, 22));
      edge(h, top.slice(22), { alpha: 0.32 });
      const tail = mass(h, [
        [11.4, 10],
        [15.8, 9],
        [19.8, 15],
        [21, 24],
        [19.4, 32],
        [21, 40],
        [16.6, 43.6],
        [13.6, 37.6],
        [14.8, 29],
        [13, 21],
        [12, 15],
      ]);
      deep(h, tail, [
        [13.6, 22, 2.2, 10],
        [16.6, 40, 3.6, 3],
      ]);
      shine(h, tail, [[18.6, 24, 1.8, 8]]);
      strand(h, [
        [15, 14],
        [17, 22],
        [16.4, 31],
        [17.6, 40],
      ]);
      edge(h, tail.slice(3, 21));
      // The tie.
      const band = ellipse(15, 13, 3.6, 1.7, 8, 0.5);
      wash(h.ctx, band, h.ribbon ?? "bark", {
        r: h.r,
        layers: 6,
        strength: 0.95,
        soft: 0.08,
      });
      wisp(h, [
        [-13.6, -6],
        [-16.6, 1],
        [-15.6, 6.6],
      ]);
    },
  },

  cropped: {
    peek: "full",
    back(h) {
      const shape = mass(h, [
        [0, -22],
        [8.4, -20.8],
        [15.8, -15.4],
        [18.4, -7],
        [17.6, 0.6],
        [15.4, 4.4],
        [0, 6],
        [-15.4, 4.4],
        [-17.6, 0.6],
        [-18.4, -7],
        [-15.8, -15.4],
        [-8.4, -20.8],
      ]);
      edge(h, shape.slice(9, 16));
      edge(h, shape.slice(23, 30));
    },
    front(h) {
      // Short, but thick: a soft pile brushed forward into little points.
      const top = mass(h, [
        [-16, 1.8],
        [-18.4, -8],
        [-15.4, -17.2],
        [-9.6, -21.8],
        [-4, -22.6],
        [0.6, -24],
        [5, -22.6],
        [10, -21.8],
        [15.4, -17.2],
        [18.4, -8],
        [16, 1.8],
        [14.4, -2.6],
        [13.8, -7.4],
        [11, -9.4],
        [9.6, -11.6],
        [6.4, -10.8],
        [4.4, -13],
        [1, -11.6],
        [-1.6, -13.4],
        [-4.6, -11.4],
        [-7.4, -12.6],
        [-10, -10],
        [-12.6, -9.6],
        [-13.8, -6.4],
        [-14.4, -2.4],
      ]);
      deep(h, top, [
        [0, -13.6, 11, 2],
        [16.2, -4, 2.6, 5],
        [-16.2, -4, 2.6, 5],
      ]);
      shine(h, top, [[-2, -18.6, 9.6, 2.5, 0.05]], 0.6);
      // Texture: short strokes fanning out from the crown.
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.1 + (0.8 * i) / 10) + h.r.gauss() * 0.06;
        const c = Math.cos(a);
        const n = Math.sin(a);
        const r0 = 3 + (i % 3) * 2.4;
        strand(
          h,
          [
            [1 - c * r0 * 1.5, -21.6 + n * r0],
            [1 - c * (r0 + 3) * 1.5, -21.6 + n * (r0 + 2.6)],
            [1 - c * (r0 + 5.6) * 1.5, -21.6 + n * (r0 + 5.6)],
          ],
          i % 4 === 1 ? "light" : "dark",
          0.9,
          0.5,
        );
      }
      edge(h, top.slice(0, 31));
      edge(h, top.slice(31), { alpha: 0.32 });
      wisp(h, [
        [-1, -23.6],
        [1.6, -26.4],
      ]);
    },
  },

  // Posy's: two round puffs tied up high.
  bunches: {
    peek: "sides",
    back(h) {
      const shape = mass(h, RING);
      edge(h, shape.slice(36).concat(shape.slice(0, 8)));
      if (h.hatted) return;
      for (const s of [-1, 1]) {
        const puff = mass(h, cloud(h.r, s * 18.6, -15.6, 10.4, 10, 7, 0.1), { soft: 0.14 });
        pool(h.ctx, h.r, puff, h.c.dark, [[s * 15, -10.6, 6, 4]], 0.5);
        pool(h.ctx, h.r, puff, h.c.light, [[s * 20, -20.4, 4, 2.4, s * 0.4]], 0.5);
        coils(h, [
          [s * 20.6, -14, 1, s],
          [s * 16.4, -20, 0.9, 2 + s],
        ]);
        edge(h, puff, { closed: true, gaps: 0.3 });
      }
    },
    front(h) {
      const top = mass(h, [
        [-16, 0.6],
        [-18.4, -8],
        [-13.8, -18.2],
        [-5, -22.6],
        [5, -22.6],
        [13.8, -18.2],
        [18.4, -8],
        [16, 0.6],
        [14.6, -3.6],
        [12.6, -8.4],
        [8, -11.6],
        [2.6, -12.6],
        [0.4, -14.8],
        [-2, -12.6],
        [-8, -11.6],
        [-12.6, -8.4],
        [-14.6, -3.6],
      ]);
      deep(h, top, [
        [0.4, -18.6, 2, 5],
        [16, -5, 2.6, 5],
        [-16, -5, 2.6, 5],
      ]);
      shine(h, top, [
        [8, -16.6, 5, 2.2, 0.5],
        [-7.6, -17, 5, 2.2, -0.5],
      ]);
      for (const s of [-1, 1])
        strand(h, [
          [s * 1.6, -19],
          [s * 8, -16.6],
          [s * 14.6, -12.6],
        ]);
      edge(h, top.slice(0, 22));
      edge(h, top.slice(22), { alpha: 0.32 });
      if (h.hatted) return;
      // A bobble on each bunch.
      for (const s of [-1, 1])
        wash(h.ctx, ellipse(s * 13.8, -12.6, 2.2, 2.6, 8, s * 0.6), h.ribbon ?? "poppy", {
          r: h.r,
          layers: 6,
          strength: 0.95,
          soft: 0.1,
          edge: 0.9,
        });
    },
  },
};

export const STYLE_IDS = Object.keys(STYLES);

/**
 * @param {"back"|"front"} layer
 * @param {object} h  { ctx, r, c: {base, dark, light}, fit?, hatted?, ribbon? }
 */
export function paintHair(layer, style, h) {
  const s = STYLES[style] ?? STYLES["long-waves"];
  h.pencil = mix(h.c.dark, "ink", 0.6);
  s[layer](h);
  if (layer === "front" && h.hatted) peek(h, s.peek);
}

export { mirror, pencil };
