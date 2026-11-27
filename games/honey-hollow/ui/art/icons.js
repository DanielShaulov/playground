// Interface icons, painted like everything else: a dab or two of wash and a
// pencil line, small enough to sit on a button and plain enough to read at a
// glance. Every icon is drawn in a 28 px box; the pencil is a touch heavier
// than on the big pieces, because at this size a faint line is no line.

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  ellipse,
  rect,
  roundRect,
  smooth,
  leaf,
  petal,
  within,
  TAU,
} from "../paint/wash.js";

export const ICON = 28;

// ------------------------------------------------------------ the tools

function tools(ctx, r) {
  const t = {
    /** A crisp little wash. */
    fill: (pts, color, o) =>
      wash(ctx, pts, color, {
        r,
        layers: 7,
        strength: 0.93,
        soft: 0.045,
        rounds: 1,
        detail: 1,
        ...o,
      }),
    /** A wash with a second colour run in. */
    two: (pts, color, charge, o) =>
      t.fill(pts, color, { charge: { color: charge, n: 2, strength: 0.34 }, ...o }),
    /** A soft shade laid over what is there. */
    shade: (pts, o) =>
      wash(ctx, pts, "umber", {
        r,
        layers: 5,
        strength: 0.16,
        soft: 0.3,
        edge: 0,
        rounds: 1,
        detail: 1,
        ...o,
      }),
    /** A pale touch of light. */
    light: (pts, o) =>
      wash(ctx, pts, "white", {
        r,
        layers: 4,
        strength: 0.5,
        soft: 0.25,
        edge: 0,
        rounds: 1,
        detail: 1,
        ...o,
      }),
    line: (pts, o) =>
      pencil(ctx, pts, { r, alpha: 0.8, width: 1.1, wobble: 0.28, gaps: 0.02, ...o }),
    ring: (pts, o) => t.line(pts, { closed: true, ...o }),
    /** One brush stroke of even weight with soft ends: the plain signs. */
    mark: (path, color, width = 4, o) =>
      brush(ctx, smooth(path, 5, false), color, {
        r,
        width: (u) => width * (0.72 + 0.28 * Math.sin(Math.PI * u)),
        strength: 0.92,
        soft: 0.06,
        layers: 7,
        ...o,
      }),
    /** A tapering stroke: stems, handles. */
    stroke: (path, color, width = 2, o) =>
      brush(ctx, path, color, { r, width, strength: 0.9, ...o }),
    /**
     * A rim of bare paper round a shape, so a green sign still reads when
     * it sits on a green button.
     */
    rim: (pts, by = 1.5) => {
      let cx = 0;
      let cy = 0;
      for (const [x, y] of pts) {
        cx += x / pts.length;
        cy += y / pts.length;
      }
      const wider = pts.map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return [x + ((x - cx) / d) * by, y + ((y - cy) / d) * by];
      });
      t.fill(wider, "white", { strength: 0.97, soft: 0.03, edge: 0 });
    },
    /** Cut a hole right through the paint. */
    hole: (pts) => {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
  return t;
}

const turn = (pts, cx, cy, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

const arc = (cx, cy, rad, a0, a1, n = 7) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return out;
};

/** A moon: the part of one circle that another does not cover. */
function crescent(cx, cy, R, dx, dy, R2, n = 28) {
  const phi = Math.atan2(dy, dx);
  const outer = [];
  const inner = [];
  for (let i = 0; i < n; i++) {
    const a = phi + (i / n) * TAU;
    const p = [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
    if (Math.hypot(p[0] - cx - dx, p[1] - cy - dy) > R2) outer.push(p);
    const b = phi - (i / n) * TAU;
    const q = [cx + dx + Math.cos(b) * R2, cy + dy + Math.sin(b) * R2];
    if (Math.hypot(q[0] - cx, q[1] - cy) < R) inner.push(q);
  }
  return outer.concat(inner);
}

const star = (cx, cy, R, k = 0.45, n = 5, rot = -Math.PI / 2) => {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const d = i % 2 ? R * k : R;
    out.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return out;
};

const hex = (cx, cy, R, rot = 0) => ellipse(cx, cy, R, R, 6, rot);

// A small skep, for the icons that are about hives.
function dome(t, cx, base, wide, tall) {
  const shape = smooth(
    [
      [cx - wide / 2, base],
      [cx - wide / 2, base - tall * 0.5],
      [cx - wide * 0.3, base - tall * 0.9],
      [cx, base - tall],
      [cx + wide * 0.3, base - tall * 0.9],
      [cx + wide / 2, base - tall * 0.5],
      [cx + wide / 2, base],
    ],
    4,
    false,
  );
  t.two(shape, "straw", "honey");
  for (let i = 1; i <= 2; i++) {
    const y = base - (tall * i) / 3;
    const hw = (wide / 2) * (i === 1 ? 0.98 : 0.74);
    t.line(
      [
        [cx - hw, y],
        [cx, y + 1.2],
        [cx + hw, y],
      ],
      { alpha: 0.5, width: 0.8, passes: 1 },
    );
  }
  t.fill(ellipse(cx, base - 1.6, 1.7, 1.9, 7), "umber");
  t.line(shape, { alpha: 0.75 });
  t.line(
    [
      [cx - wide / 2 - 1, base],
      [cx + wide / 2 + 1, base],
    ],
    { alpha: 0.7 },
  );
}

// A sprout: a stem and two leaves.
function sprout(t, x, y, tall, size = 6) {
  t.stroke(
    [
      [x, y],
      [x + 0.4, y - tall * 0.5],
      [x, y - tall],
    ],
    "leaf",
    1.6,
  );
  t.two(leaf(x, y - tall + 0.5, size, size * 0.62, -2.5), "leaf", "sap");
  t.two(leaf(x, y - tall + 0.5, size * 1.06, size * 0.62, -0.62), "sap", "leaf");
  t.line(leaf(x, y - tall + 0.5, size, size * 0.62, -2.5), {
    closed: true,
    alpha: 0.55,
    width: 0.8,
  });
  t.line(leaf(x, y - tall + 0.5, size * 1.06, size * 0.62, -0.62), {
    closed: true,
    alpha: 0.55,
    width: 0.8,
  });
}

// A little jug with a handle and a lip: feeding, and the grocer's syrup.
function jug(t, cx, base) {
  const body = smooth(
    [
      [cx - 5.5, base - 15],
      [cx - 7.5, base - 7],
      [cx - 6, base - 0.5],
      [cx + 5, base - 0.5],
      [cx + 6.5, base - 7],
      [cx + 4.5, base - 15],
    ],
    4,
  );
  // The handle behind the body.
  t.stroke(arc(cx + 5, base - 8.5, 5, -1.25, 1.25, 6), "cream", 3.2, { strength: 0.95 });
  t.line(arc(cx + 5, base - 8.5, 6.3, -1.2, 1.2, 6), { alpha: 0.7 });
  t.line(arc(cx + 5, base - 8.5, 3.4, -1.1, 1.1, 5), { alpha: 0.5, width: 0.8, passes: 1 });
  t.two(body, "white", "cream", { strength: 0.97 });
  t.fill(
    smooth(
      [
        [cx - 7.2, base - 9],
        [cx, base - 8],
        [cx + 6.3, base - 9],
        [cx + 6.4, base - 5.5],
        [cx, base - 4.5],
        [cx - 7.2, base - 5.5],
      ],
      3,
    ),
    "pond",
    { strength: 0.85 },
  );
  // The lip, pulled out to the left.
  const lip = smooth(
    [
      [cx - 8.6, base - 17.6],
      [cx - 4, base - 16.2],
      [cx + 4.8, base - 16.4],
      [cx + 4.6, base - 14.6],
      [cx - 5.4, base - 14.4],
    ],
    3,
  );
  t.fill(lip, "white", { strength: 0.97 });
  t.shade([
    [cx + 2, base - 14],
    [cx + 6, base - 9],
    [cx + 5, base - 1.5],
    [cx + 1.5, base - 1.5],
  ]);
  t.ring(lip, { alpha: 0.7, width: 0.95 });
  t.line(body, { closed: true, alpha: 0.75 });
}

// ------------------------------------------------------------ the icons

const ICONS = {
  // ---- places
  meadow(t, r) {
    const hill = smooth(
      [
        [1.5, 23.5],
        [6, 17],
        [14, 14.5],
        [22, 17],
        [26.5, 23.5],
        [14, 26],
      ],
      4,
    );
    t.two(hill, "meadow", "sap");
    t.line(
      [
        [2, 22.5],
        [6.5, 17],
        [14, 14.6],
        [21.5, 17],
        [26, 22.5],
      ],
      { alpha: 0.6 },
    );
    for (const [x, y, top, tone, mid] of [
      [8.5, 18, 8, "clover", "rose"],
      [19, 18.5, 6, "dandelion", "sunflower"],
      [14, 20, 12.5, "lavender", "violet"],
    ]) {
      t.stroke(
        [
          [x, y],
          [x + 0.5, (y + top) / 2],
          [x, top + 2],
        ],
        "leaf",
        1.5,
      );
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + r() * 0.5;
        t.fill(petal(x, top, 3.5, 2.6, a), i % 2 ? tone : mid, { layers: 4, strength: 0.85 });
      }
      t.fill(ellipse(x, top, 1.2, 1.2, 6), "butter", { layers: 4 });
      t.ring(ellipse(x, top, 3.4, 3.4, 8), { alpha: 0.4, width: 0.7, gaps: 0.2, passes: 1 });
    }
  },
  map(t) {
    const a = [
      [3, 7.5],
      [10, 5],
      [10, 22],
      [3, 24.5],
    ];
    const b = [
      [10, 5],
      [18, 8],
      [18, 25],
      [10, 22],
    ];
    const c = [
      [18, 8],
      [25, 5.5],
      [25, 22.5],
      [18, 25],
    ];
    t.fill(a, "white", { strength: 0.98 });
    t.fill(b, "cream", { strength: 0.98 });
    t.fill(c, "white", { strength: 0.98 });
    t.fill(ellipse(7, 12, 3, 3.6, 8), "meadow", { strength: 0.85, soft: 0.2 });
    t.fill(ellipse(21.5, 17, 2.6, 3.4, 8), "meadow", { strength: 0.85, soft: 0.2 });
    t.fill(ellipse(14, 12.5, 2.4, 1.8, 8), "pond", { strength: 0.85, soft: 0.2 });
    t.shade(b, { strength: 0.1 });
    // The way there, in dashes, and where it ends.
    const way = smooth(
      [
        [6, 20],
        [9.5, 17.5],
        [13.5, 19.5],
        [17.5, 17],
        [21, 12],
      ],
      3,
      false,
    );
    for (let i = 0; i + 1 < way.length; i += 2)
      t.line([way[i], way[i + 1]], { alpha: 0.75, width: 1, passes: 1, wobble: 0.1 });
    t.mark(
      [
        [19.6, 9.2],
        [22.6, 12.2],
      ],
      "poppy",
      1.8,
    );
    t.mark(
      [
        [22.6, 9.2],
        [19.6, 12.2],
      ],
      "poppy",
      1.8,
    );
    t.line([a[0], a[1], b[1], c[1]], { alpha: 0.75 });
    t.line([a[3], a[2], b[2], c[2]], { alpha: 0.75 });
    for (const [p, q] of [
      [a[0], a[3]],
      [a[1], a[2]],
      [b[1], b[2]],
      [c[1], c[2]],
    ])
      t.line([p, q], { alpha: 0.7, width: 0.95 });
  },
  calendar(t) {
    const page = roundRect(4, 6, 20, 19, 2.5);
    t.fill(page, "white", { strength: 0.98 });
    within(t.ctx, page, () => t.fill(rect(3, 5, 22, 7.2), "rose", { soft: 0.02 }));
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const on = row === 1 && col === 1;
        t.fill(roundRect(6.8 + col * 4.1, 15 + row * 4.4, 2.4, 2.4, 0.8), on ? "honey" : "straw", {
          layers: 4,
          strength: on ? 0.95 : 0.8,
        });
      }
    }
    t.ring(page, { alpha: 0.78 });
    t.line(
      [
        [4.5, 13],
        [23.5, 13],
      ],
      { alpha: 0.5, width: 0.8, passes: 1 },
    );
    for (const x of [9.5, 18.5])
      t.line(
        [
          [x, 3.6],
          [x, 8.4],
        ],
        { alpha: 0.85, width: 1.5, wobble: 0.1 },
      );
  },
  book(t) {
    const cover = turn(roundRect(6, 4, 17, 19.5, 2), 14, 14, -0.1);
    const pages = turn(
      [
        [8.6, 22.8],
        [23, 22.8],
        [22.4, 25.4],
        [9, 25.4],
      ],
      14,
      14,
      -0.1,
    );
    t.fill(pages, "white", { strength: 0.98 });
    t.ring(pages, { alpha: 0.65, width: 0.9 });
    t.two(cover, "poppy", "terracotta");
    t.fill(turn(rect(6, 4, 3.6, 19.5), 14, 14, -0.1), "chestnut", { strength: 0.55 });
    const badge = hex(15.6, 12.6, 4.6, 0.42);
    t.fill(badge, "butter", { strength: 0.96 });
    t.ring(badge, { alpha: 0.6, width: 0.9 });
    // The bee on the cover, two stripes and done.
    t.line(
      [
        [14.2, 11],
        [14.6, 14.2],
      ],
      { alpha: 0.8, width: 1.2, passes: 1, wobble: 0.1 },
    );
    t.line(
      [
        [16.5, 10.9],
        [16.9, 14.1],
      ],
      { alpha: 0.8, width: 1.2, passes: 1, wobble: 0.1 },
    );
    t.ring(cover, { alpha: 0.78 });
  },
  workshop(t) {
    // A candle...
    const wax = roundRect(4.5, 11.5, 7, 13, 1.5);
    t.two(wax, "butter", "honey");
    t.ring(wax, { alpha: 0.75 });
    t.line(
      [
        [8, 11.5],
        [8.1, 9.4],
      ],
      { alpha: 0.9, width: 1, passes: 1 },
    );
    t.fill(petal(8, 9.6, 6.4, 4.2, -Math.PI / 2, 0.4), "sunflower");
    t.fill(petal(8, 9, 3.4, 2, -Math.PI / 2, 0.4), "butter", { layers: 4 });
    // ...and the pot the wax is melted in.
    const pot = smooth(
      [
        [13.5, 15],
        [25, 15],
        [24.4, 22],
        [22.5, 24.8],
        [16, 24.8],
        [14.1, 22],
      ],
      3,
    );
    t.two(pot, "dusk", "stone");
    t.fill(ellipse(19.2, 15.2, 5.6, 1.7, 10), "honey");
    t.shade([
      [21, 16.5],
      [24.6, 16.5],
      [24, 22],
      [22, 24.4],
    ]);
    t.ring(pot, { alpha: 0.78 });
    t.ring(ellipse(19.2, 15.2, 5.7, 1.8, 10), { alpha: 0.6, width: 0.9 });
    t.line(
      [
        [13.6, 16.5],
        [11.6, 16.2],
        [11.8, 18.6],
      ],
      { alpha: 0.8, width: 1.3 },
    );
  },
  stall(t) {
    // Posts and a counter.
    for (const x of [5, 23])
      t.line(
        [
          [x, 12],
          [x, 25.5],
        ],
        { alpha: 0.8, width: 1.4 },
      );
    const counter = roundRect(3.2, 18.6, 21.6, 5, 1);
    t.two(counter, "wood", "bark");
    t.ring(counter, { alpha: 0.75 });
    t.fill(roundRect(11.6, 13.6, 4.8, 5.2, 1.4), "honey");
    t.ring(roundRect(11.6, 13.6, 4.8, 5.2, 1.4), { alpha: 0.6, width: 0.9 });
    // The awning: four stripes with scalloped hems.
    const x0 = 2.2;
    const wide = 23.6 / 4;
    for (let i = 0; i < 4; i++) {
      const xa = x0 + i * wide;
      const stripe = smooth(
        [
          [xa + 1.2, 4],
          [xa + wide - 1.2, 4],
          [xa + wide, 10.2],
          [xa + wide * 0.75, 12.6],
          [xa + wide * 0.25, 12.6],
          [xa, 10.2],
        ],
        3,
      );
      t.fill(stripe, i % 2 ? "white" : "rose", { strength: 0.97 });
      t.ring(stripe, { alpha: 0.6, width: 0.9 });
    }
    t.line(
      [
        [3, 4],
        [14, 3.6],
        [25, 4],
      ],
      { alpha: 0.8 },
    );
  },
  goals(t) {
    const page = roundRect(5.5, 4, 17, 21.5, 2);
    t.fill(page, "white", { strength: 0.98 });
    t.ring(page, { alpha: 0.78 });
    t.fill(roundRect(10.4, 2.2, 7.2, 3.8, 1.4), "stone");
    t.ring(roundRect(10.4, 2.2, 7.2, 3.8, 1.4), { alpha: 0.7, width: 0.9 });
    [10.5, 15.5, 20.5].forEach((y, i) => {
      if (i < 2)
        t.mark(
          [
            [7.8, y - 0.2],
            [9.6, y + 1.6],
            [12.6, y - 2.4],
          ],
          "moss",
          1.9,
        );
      else t.ring(roundRect(8, y - 1.6, 3.6, 3.4, 0.8), { alpha: 0.7, width: 0.9, passes: 1 });
      t.line(
        [
          [14.4, y],
          [19.8, y + 0.2],
        ],
        { alpha: 0.6, width: 1 },
      );
    });
  },
  wardrobe(t) {
    // A peg, and a straw hat hanging from it.
    t.fill(ellipse(14, 4.4, 2.3, 2.1, 8), "wood");
    t.ring(ellipse(14, 4.4, 2.3, 2.1, 8), { alpha: 0.75, width: 0.95 });
    const brim = ellipse(14, 20, 11.6, 4.6, 14);
    t.two(brim, "straw", "honey");
    t.ring(brim, { alpha: 0.75 });
    const crown = smooth(
      [
        [7.6, 19.6],
        [8.4, 12.6],
        [14, 9.4],
        [19.6, 12.6],
        [20.4, 19.6],
        [14, 21.6],
      ],
      4,
    );
    t.two(crown, "straw", "butter");
    t.fill(
      smooth(
        [
          [7.6, 17],
          [14, 18.8],
          [20.4, 17],
          [20.5, 19.8],
          [14, 21.8],
          [7.5, 19.8],
        ],
        3,
      ),
      "rose",
    );
    t.line(
      [
        [7.6, 19.6],
        [8.4, 12.6],
        [14, 9.4],
        [19.6, 12.6],
        [20.4, 19.6],
      ],
      { alpha: 0.78 },
    );
    t.line(
      [
        [14, 6.4],
        [14, 9.4],
      ],
      { alpha: 0.7, width: 0.9, passes: 1 },
    );
  },

  // ---- controls
  settings(t) {
    const teeth = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      for (const [da, rad] of [
        [-0.25, 8.1],
        [-0.15, 11.2],
        [0.15, 11.2],
        [0.25, 8.1],
      ])
        teeth.push([14 + Math.cos(a + da) * rad, 14 + Math.sin(a + da) * rad]);
    }
    t.two(teeth, "stone", "dusk");
    t.hole(ellipse(14, 14, 3.5, 3.5, 12));
    t.ring(teeth, { alpha: 0.78, wobble: 0.2 });
    t.ring(ellipse(14, 14, 3.6, 3.6, 10), { alpha: 0.78 });
  },
  "sound-on"(t) {
    speaker(t);
    t.line(arc(13.5, 14, 6, -0.8, 0.8, 5), { alpha: 0.85, width: 1.5 });
    t.line(arc(13.5, 14, 10.4, -0.78, 0.78, 6), { alpha: 0.85, width: 1.5 });
  },
  "sound-off"(t) {
    speaker(t);
    t.mark(
      [
        [18, 10.4],
        [25, 17.6],
      ],
      "poppy",
      2.6,
    );
    t.mark(
      [
        [25, 10.4],
        [18, 17.6],
      ],
      "poppy",
      2.6,
    );
  },
  play(t) {
    const tri = smooth(
      [
        [8, 5],
        [9.6, 4.4],
        [23.4, 13],
        [23.4, 15],
        [9.6, 23.6],
        [8, 23],
        [7.4, 14],
      ],
      3,
    );
    t.rim(tri);
    t.two(tri, "sap", "meadow");
    t.ring(tri, { alpha: 0.78 });
  },
  fast(t) {
    for (const x of [3, 13.4]) {
      const tri = smooth(
        [
          [x + 0.6, 6],
          [x + 2, 5.6],
          [x + 11.6, 13.2],
          [x + 11.6, 14.8],
          [x + 2, 22.4],
          [x + 0.6, 22],
          [x, 14],
        ],
        3,
      );
      t.rim(tri);
      t.two(tri, "sap", "meadow");
      t.ring(tri, { alpha: 0.78 });
    }
  },
  pause(t) {
    for (const x of [6.6, 16]) {
      const bar = roundRect(x, 5, 5.6, 18, 2);
      t.two(bar, "honey", "dandelion");
      t.ring(bar, { alpha: 0.78 });
    }
  },
  sleep(t) {
    const moon = crescent(12, 15.5, 9.4, 4.6, -3.6, 8.2);
    t.two(moon, "butter", "dandelion");
    t.ring(moon, { alpha: 0.78 });
    for (const [x, y, s] of [
      [18.4, 6.4, 4.4],
      [23.4, 2.8, 3],
    ])
      t.line(
        [
          [x - s / 2, y - s / 2],
          [x + s / 2, y - s / 2],
          [x - s / 2, y + s / 2],
          [x + s / 2, y + s / 2],
        ].flatMap((p, i, all) => (i ? [all[i - 1], p] : [])),
        { alpha: 0.85, width: 1.2, wobble: 0.12 },
      );
  },
  back(t) {
    t.mark(
      [
        [17.5, 5.5],
        [9, 13.6],
        [8.8, 14.4],
        [17.5, 22.5],
      ],
      "umber",
      4.2,
    );
  },
  close(t) {
    t.mark(
      [
        [7.4, 7.4],
        [14.2, 13.8],
        [20.6, 20.6],
      ],
      "umber",
      3.9,
    );
    t.mark(
      [
        [20.6, 7.4],
        [13.8, 14.2],
        [7.4, 20.6],
      ],
      "umber",
      3.9,
    );
  },
  check(t) {
    t.mark(
      [
        [5.4, 14.6],
        [11, 20.6],
        [11.8, 20.6],
        [22.8, 7],
      ],
      "pine",
      4.4,
    );
  },
  plus(t) {
    t.mark(
      [
        [14, 5.6],
        [14.2, 14],
        [14, 22.4],
      ],
      "umber",
      4,
    );
    t.mark(
      [
        [5.6, 14],
        [14, 14.2],
        [22.4, 14],
      ],
      "umber",
      4,
    );
  },
  minus(t) {
    t.mark(
      [
        [5.6, 14],
        [14, 14.2],
        [22.4, 14],
      ],
      "umber",
      4,
    );
  },
  info(t) {
    const disc = ellipse(14, 14, 10.6, 10.6, 16);
    t.two(disc, "sky", "pond");
    t.ring(disc, { alpha: 0.78 });
    t.fill(ellipse(14, 8.6, 1.8, 1.8, 8), "umber");
    t.mark(
      [
        [14, 12.4],
        [14.1, 16.5],
        [14, 20.4],
      ],
      "umber",
      3,
    );
  },
  lock(t) {
    t.line(arc(14, 11.6, 5.2, Math.PI, TAU, 7), { alpha: 0.85, width: 2.6, wobble: 0.15 });
    t.line(arc(14, 11.6, 5.2, Math.PI, TAU, 7), {
      color: "stone",
      alpha: 0.9,
      width: 1.2,
      wobble: 0.1,
      passes: 1,
    });
    const body = roundRect(5.6, 11.6, 16.8, 13.2, 3);
    t.two(body, "honey", "dandelion");
    t.shade(roundRect(15, 13, 6.4, 10.6, 2));
    t.ring(body, { alpha: 0.78 });
    t.fill(ellipse(14, 16.8, 1.9, 1.9, 8), "umber");
    t.mark(
      [
        [14, 17],
        [14, 21],
      ],
      "umber",
      1.8,
    );
  },

  // ---- things you do
  harvest(t) {
    // A honey dipper, loaded.
    t.stroke(
      [
        [24, 3.6],
        [19, 8.4],
        [14.6, 13],
      ],
      "wood",
      3,
      { width: () => 2.6 },
    );
    t.line(
      [
        [24.6, 4.6],
        [15.4, 13.8],
      ],
      { alpha: 0.7, width: 0.9, passes: 1 },
    );
    const head = ellipse(10.6, 17, 7, 5.2, 14, -Math.PI / 4);
    t.two(head, "honey", "amber");
    for (const d of [-3.4, 0, 3.4]) {
      const cx = 10.6 - d * 0.707;
      const cy = 17 + d * 0.707;
      t.line(
        [
          [cx - 3.4, cy - 3.4],
          [cx + 0.2, cy + 0.2],
          [cx + 3.4, cy + 3.4],
        ],
        { alpha: 0.6, width: 0.9, passes: 1 },
      );
    }
    t.ring(head, { alpha: 0.78 });
    t.light(ellipse(8.4, 14.4, 2.4, 1.2, 7, -Math.PI / 4));
    const drop = petal(7, 20.6, 5.6, 3.6, Math.PI / 2 + 0.25, 0.7);
    t.fill(drop, "honey");
    t.ring(drop, { alpha: 0.6, width: 0.9 });
  },
  plant(t) {
    t.fill(ellipse(14, 24.6, 11.4, 2.4, 10), "soil", { soft: 0.2 });
    // A trowel, blade in the earth.
    const blade = turn(leaf(8, 10.6, 13.4, 7.4, Math.PI / 2, 0.36), 8, 10.6, 0.34);
    t.two(blade, "stone", "dusk");
    t.ring(blade, { alpha: 0.78 });
    t.mark(
      [
        [9, 11.4],
        [12.6, 3.6],
      ],
      "wood",
      3.6,
    );
    t.line(
      [
        [10.6, 11.4],
        [14, 4],
      ],
      { alpha: 0.7, width: 0.9, passes: 1 },
    );
    sprout(t, 20, 24.4, 10.4, 6.2);
  },
  dig(t) {
    t.fill(ellipse(9, 24.4, 7.6, 2.4, 9), "soil", { soft: 0.2 });
    const shaft = [
      [22.6, 4.2],
      [13.4, 15.6],
    ];
    t.mark(shaft, "wood", 2.8);
    t.mark(
      [
        [19.8, 2.6],
        [25.4, 6.4],
      ],
      "wood",
      3,
    );
    t.line(
      [
        [19.6, 2.2],
        [25.6, 6.6],
      ],
      { alpha: 0.6, width: 0.9, passes: 1 },
    );
    const blade = turn(
      smooth(
        [
          [-5, 0],
          [5, 0],
          [5.2, 6.4],
          [0, 12.4],
          [-5.2, 6.4],
        ],
        3,
      ).map(([x, y]) => [x + 13, y + 14.4]),
      13,
      14.4,
      0.68,
    );
    t.two(blade, "stone", "dusk");
    t.ring(blade, { alpha: 0.78 });
    t.line(
      [
        [22, 5.4],
        [13.8, 15.6],
      ],
      { alpha: 0.7, width: 0.9, passes: 1 },
    );
  },
  move(t) {
    // Four ways to go.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const at = (d, s = 0) => [
        14 + Math.cos(a) * d - Math.sin(a) * s,
        14 + Math.sin(a) * d + Math.cos(a) * s,
      ];
      t.mark([at(2.4), at(9)], "umber", 2.6);
      t.fill([at(12.6), at(7.6, 4.4), at(7.6, -4.4)], "umber", { strength: 0.9 });
    }
  },
  feed(t) {
    jug(t, 13.4, 25);
    const drop = petal(3.4, 9.6, 5, 3.2, Math.PI / 2, 0.7);
    t.fill(drop, "honey");
    t.ring(drop, { alpha: 0.55, width: 0.8 });
  },
  dust(t, r) {
    // A sugar shaker, tipped.
    const tip = (pts) => turn(pts, 15, 14, -0.72);
    const glass = tip(
      smooth(
        [
          [10, 10.4],
          [20, 10.4],
          [21, 24.4],
          [9, 24.4],
        ],
        3,
      ),
    );
    t.fill(glass, "white", { strength: 0.97 });
    t.fill(tip(roundRect(10.4, 15, 9.4, 8.6, 1.5)), "sky", { strength: 0.6 });
    const cap = tip(
      smooth(
        [
          [9.4, 10.6],
          [10, 5.6],
          [15, 3.4],
          [20, 5.6],
          [20.6, 10.6],
        ],
        4,
        false,
      ),
    );
    t.two(cap, "stone", "dusk");
    t.line(cap, { alpha: 0.78 });
    t.ring(glass, { alpha: 0.78 });
    for (let i = 0; i < 9; i++) {
      const x = 1.6 + r() * 8;
      const y = 9 + (x - 1.6) * 0.5 + r() * 12;
      t.fill(ellipse(x, Math.min(26, y), 0.9, 0.9, 6), i % 3 ? "white" : "straw", {
        layers: 3,
        strength: 0.96,
      });
      t.ring(ellipse(x, Math.min(26, y), 1, 1, 6), {
        alpha: 0.45,
        width: 0.6,
        passes: 1,
        wobble: 0.1,
      });
    }
  },
  upgrade(t) {
    const tones = ["cream", "blush", "sky"];
    for (let i = 0; i < 3; i++) {
      const box = roundRect(3.4, 18.4 - i * 6.6, 13.4, 6, 1);
      t.fill(box, tones[i], { strength: 0.96 });
      t.ring(box, { alpha: 0.75, width: 1 });
      t.line(
        [
          [8, 21.4 - i * 6.6],
          [12.2, 21.4 - i * 6.6],
        ],
        { alpha: 0.5, width: 0.9, passes: 1 },
      );
    }
    t.mark(
      [
        [22.4, 24],
        [22.4, 8],
      ],
      "pine",
      2.8,
    );
    t.fill(
      [
        [22.4, 3.2],
        [27, 10.4],
        [17.8, 10.4],
      ],
      "pine",
    );
  },
  split(t) {
    dome(t, 7.6, 25, 10.4, 12.4);
    dome(t, 20.4, 25, 10.4, 12.4);
    t.line(arc(14, 11.4, 6.6, Math.PI + 0.5, TAU - 0.5, 6), { alpha: 0.85, width: 1.4 });
    t.line(
      [
        [17.4, 5.6],
        [20, 8.2],
        [20.4, 4.4],
      ],
      { alpha: 0.85, width: 1.3 },
    );
  },
  basket(t) {
    t.line(arc(14, 13.4, 8.6, Math.PI, TAU, 8), { color: "bark", alpha: 0.95, width: 2.6 });
    t.line(arc(14, 13.4, 9.8, Math.PI, TAU, 8), { alpha: 0.6, width: 0.8, passes: 1 });
    const body = smooth(
      [
        [3.6, 13],
        [24.4, 13],
        [22.4, 22],
        [19.6, 25.2],
        [8.4, 25.2],
        [5.6, 22],
      ],
      3,
    );
    t.two(body, "wood", "straw");
    within(t.ctx, body, () => {
      for (let y = 16.4; y < 25; y += 3)
        t.line(
          [
            [3, y],
            [14, y + 0.8],
            [25, y],
          ],
          { alpha: 0.5, width: 0.9, passes: 1 },
        );
      for (let x = 7.4; x < 23; x += 3.3)
        t.line(
          [
            [x, 13.4],
            [x + 0.6, 25],
          ],
          { alpha: 0.35, width: 0.8, passes: 1 },
        );
    });
    t.ring(body, { alpha: 0.78 });
    t.fill(roundRect(3, 11.6, 22, 3.2, 1.4), "straw");
    t.ring(roundRect(3, 11.6, 22, 3.2, 1.4), { alpha: 0.7, width: 0.95 });
  },
  grocer(t) {
    // What is in the crate shows over the top.
    for (const [x, tone] of [
      [8.4, "poppy"],
      [14.2, "dandelion"],
      [19.8, "sap"],
    ]) {
      t.fill(ellipse(x, 10.6, 3.5, 3.4, 9), tone);
      t.ring(ellipse(x, 10.6, 3.5, 3.4, 9), { alpha: 0.6, width: 0.9 });
    }
    const crate = roundRect(3.4, 12.2, 21.2, 12.8, 1.2);
    t.two(crate, "wood", "straw");
    for (const y of [16.4, 20.6])
      t.line(
        [
          [3.6, y],
          [24.4, y + 0.2],
        ],
        { alpha: 0.7, width: 1 },
      );
    for (const x of [7.2, 20.8])
      t.line(
        [
          [x, 12.6],
          [x, 24.8],
        ],
        { alpha: 0.5, width: 0.9, passes: 1 },
      );
    t.ring(crate, { alpha: 0.78 });
  },

  // ---- talents
  "green-thumb"(t) {
    const pot = smooth(
      [
        [8.6, 17.6],
        [19.4, 17.6],
        [18, 25.2],
        [10, 25.2],
      ],
      3,
    );
    t.two(pot, "terracotta", "poppy");
    t.ring(pot, { alpha: 0.78 });
    const rim = roundRect(7.4, 15.2, 13.2, 3.4, 1.4);
    t.fill(rim, "terracotta");
    t.ring(rim, { alpha: 0.75, width: 1 });
    sprout(t, 14, 15.6, 8, 8.4);
  },
  selling(t) {
    const tag = turn(
      smooth(
        [
          [2.6, 10],
          [6.6, 5.6],
          [18, 5.6],
          [18, 14.4],
          [6.6, 14.4],
        ],
        3,
      ),
      10,
      10,
      -0.3,
    );
    t.two(tag, "blush", "rose");
    t.ring(tag, { alpha: 0.78 });
    t.hole(ellipse(6.2, 11.4, 1.3, 1.3, 8));
    t.ring(ellipse(6.2, 11.4, 1.4, 1.4, 8), { alpha: 0.7, width: 0.8, passes: 1 });
    const coin = ellipse(18.4, 18.4, 7, 7, 14);
    t.two(coin, "dandelion", "sunflower");
    t.ring(coin, { alpha: 0.78 });
    t.ring(hex(18.4, 18.4, 3.4, 0.5), { alpha: 0.7, width: 1 });
  },
  whisperer(t) {
    for (const [dx, rot] of [
      [-1.4, -0.5],
      [2.6, 0.25],
    ]) {
      const wing = ellipse(11 + dx, 9.4, 3.2, 5.2, 9, rot);
      t.fill(wing, "sky", { strength: 0.8 });
      t.ring(wing, { alpha: 0.6, width: 0.85 });
    }
    const body = ellipse(11.6, 17.4, 8, 5.6, 14, -0.08);
    t.two(body, "honey", "dandelion");
    within(t.ctx, body, () => {
      for (const x of [7.4, 11.6, 15.6])
        t.fill(ellipse(x, 17.4, 1.3, 6, 8), "coal", { strength: 0.85 });
    });
    t.ring(body, { alpha: 0.78 });
    t.fill(ellipse(19.4, 17, 2.8, 3, 9), "coal", { strength: 0.9 });
    // What it is told.
    const heart = heartShape(22.6, 6.6, 3.8);
    t.fill(heart, "poppy");
    t.ring(heart, { alpha: 0.6, width: 0.85 });
  },
  "clever-hands"(t) {
    // A keeper's glove, and a sparkle for the knack.
    const glove = smooth(
      [
        [6.6, 25],
        [6.4, 15],
        [5.2, 9.4],
        [8.2, 5.2],
        [12.6, 3.8],
        [16.4, 6.4],
        [17, 12],
        [19.6, 9.6],
        [22.4, 10.6],
        [21.4, 14.6],
        [17.4, 19.6],
        [17, 25],
      ],
      3,
    );
    t.two(glove, "cream", "butter", { strength: 0.97 });
    t.shade([
      [12, 14],
      [17, 13],
      [17.2, 24],
      [12, 24],
    ]);
    t.ring(glove, { alpha: 0.78 });
    const cuff = roundRect(5.4, 21, 12.8, 4.6, 1.6);
    t.fill(cuff, "rose");
    t.ring(cuff, { alpha: 0.75, width: 1 });
    for (const [x, y0] of [
      [9.2, 6.4],
      [12.6, 5.6],
    ])
      t.line(
        [
          [x, y0],
          [x + 0.3, y0 + 5.4],
        ],
        { alpha: 0.5, width: 0.85, passes: 1 },
      );
    const spark = star(22.6, 5, 4.6, 0.3, 4);
    t.fill(spark, "dandelion");
    t.ring(spark, { alpha: 0.65, width: 0.85 });
  },

  // ---- seasons
  spring(t) {
    t.two(leaf(16, 18, 11, 6.4, 0.72), "leaf", "sap");
    t.ring(leaf(16, 18, 11, 6.4, 0.72), { alpha: 0.6, width: 0.9 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU;
      const p = ellipse(12.6 + Math.cos(a) * 5.4, 12.6 + Math.sin(a) * 5.4, 4.5, 4, 9, a);
      t.two(p, "blush", "rose", { strength: 0.95 });
      t.ring(p, { alpha: 0.55, width: 0.9, gaps: 0.1 });
    }
    t.fill(ellipse(12.6, 12.6, 2.6, 2.6, 9), "dandelion");
    t.ring(ellipse(12.6, 12.6, 2.6, 2.6, 9), { alpha: 0.5, width: 0.8, passes: 1 });
  },
  summer(t) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      t.mark(
        [
          [14 + Math.cos(a) * 8.8, 14 + Math.sin(a) * 8.8],
          [14 + Math.cos(a) * 12.4, 14 + Math.sin(a) * 12.4],
        ],
        "sunflower",
        2.6,
      );
    }
    const disc = ellipse(14, 14, 6.6, 6.6, 14);
    t.two(disc, "dandelion", "sunflower");
    t.ring(disc, { alpha: 0.75 });
  },
  autumn(t) {
    // An oak leaf, turned.
    const lobes = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const wide = Math.sin(Math.PI * Math.pow(u, 0.8)) * 6.6 * (i % 2 ? 1 : 0.62) + 0.6;
      lobes.push([u * 19, -wide]);
    }
    const half = lobes.concat(
      lobes
        .slice(1, -1)
        .reverse()
        .map(([x, y]) => [x, -y]),
    );
    const shape = turn(
      smooth(half, 3).map(([x, y]) => [x + 5.4, y + 21.4]),
      5.4,
      21.4,
      -0.82,
    );
    t.two(shape, "terracotta", "sunflower", { strength: 0.95 });
    t.fill(ellipse(15, 11, 3.4, 3, 8), "poppy", { strength: 0.4, soft: 0.3, edge: 0 });
    t.ring(shape, { alpha: 0.75 });
    t.line(
      [
        [3.6, 24],
        [10, 15.6],
        [17.6, 7.8],
      ],
      { alpha: 0.7, width: 0.95 },
    );
  },
  winter(t) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + Math.PI / 2;
      const at = (d, s = 0) => [
        14 + Math.cos(a) * d - Math.sin(a) * s,
        14 + Math.sin(a) * d + Math.cos(a) * s,
      ];
      t.mark([at(-11.4), at(0), at(11.4)], "water", 2.5);
      for (const d of [-7.4, 7.4]) {
        const out = Math.sign(d);
        t.mark([at(d + out * 3, 3.2), at(d), at(d + out * 3, -3.2)], "water", 1.9);
      }
    }
    t.fill(ellipse(14, 14, 2.2, 2.2, 8), "dusk");
  },
};

function speaker(t) {
  const cone = smooth(
    [
      [3.6, 10.8],
      [8, 10.6],
      [13.4, 5.6],
      [14.4, 6],
      [14.4, 22],
      [13.4, 22.4],
      [8, 17.4],
      [3.6, 17.2],
    ],
    3,
  );
  t.two(cone, "lavender", "lilac");
  t.ring(cone, { alpha: 0.78 });
  t.line(
    [
      [8, 10.8],
      [8, 17.2],
    ],
    { alpha: 0.6, width: 0.9, passes: 1 },
  );
}

/** A heart, its point at the bottom, `s` from its middle to its lobes' edge. */
export function heartShape(cx, cy, s) {
  return smooth(
    [
      [cx, cy + s * 1.02],
      [cx - s * 0.82, cy + s * 0.2],
      [cx - s * 1.02, cy - s * 0.5],
      [cx - s * 0.56, cy - s * 0.94],
      [cx, cy - s * 0.52],
      [cx + s * 0.56, cy - s * 0.94],
      [cx + s * 1.02, cy - s * 0.5],
      [cx + s * 0.82, cy + s * 0.2],
    ],
    4,
  );
}

/** Every icon's name. */
export const ICON_NAMES = Object.keys(ICONS);

/**
 * A painted icon, 28 px square.
 * @param {string} name one of ICON_NAMES
 */
export function icon(name) {
  const paint = ICONS[name];
  if (!paint) throw new Error(`no icon called "${name}"`);
  return sprite(
    `icon-${name}`,
    ICON,
    ICON,
    (ctx, w, h, r) => {
      const t = tools(ctx, r);
      t.ctx = ctx;
      paint(t, r);
    },
    { ax: 0.5, ay: 0.5, scale: 1.5, grain: 0.6 },
  );
}

// The same icon on a patch of meadow green, to check it reads off the paper.
function onGreen(name) {
  return sprite(
    `icon-on-green-${name}`,
    36,
    36,
    (ctx, w, h, r) => {
      wash(ctx, roundRect(1, 1, w - 2, h - 2, 8), "sap", {
        r,
        layers: 8,
        strength: 0.96,
        soft: 0.03,
      });
      const s = icon(name);
      ctx.drawImage(s.canvas, 4, 4, ICON, ICON);
    },
    { ax: 0.5, ay: 0.5, grain: 0.6 },
  );
}

export const GALLERY = ICON_NAMES.map((name) => ({ name, make: () => icon(name), zoom: 1.6 }));

export const GALLERY_ON_GREEN = ICON_NAMES.map((name) => ({
  name,
  make: () => onGreen(name),
  zoom: 1.25,
}));
