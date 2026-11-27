// The head and the face on it, in head space (see kit.js). Faces are simple
// and kind: dot eyes with a glint, a small smile, a wet pink on each cheek.

import { wash, pencil, ellipse, smooth, within, splatter } from "../../paint/wash.js";
import { mix } from "../../paint/palette.js";
import { dab, ink, prime, line, fill, pool } from "./kit.js";

const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

// The right half of each head, crown to chin; the jaw is where they differ.
// A man's is squarer and runs MAN_JAW longer, down to a broad chin.
const HALF = {
  woman: [
    [8.6, -14.9],
    [14.1, -8.4],
    [15.5, 0],
    [14.3, 7.4],
    [9.9, 13.4],
    [4.4, 16.1],
  ],
  man: [
    [8.6, -14.9],
    [14.2, -8.4],
    [15.5, 0],
    [15.2, 8.2],
    [12.7, 14.6],
    [6.6, 18],
  ],
  child: [
    [8.6, -14.9],
    [14.2, -8.4],
    [15.7, 0.4],
    [14.9, 7.6],
    [10.4, 13.6],
    [4.6, 16.1],
  ],
};

const MAN_JAW = 1.9;

export function headShape(body) {
  const half = HALF[body] ?? HALF.woman;
  const chin = body === "man" ? 16.6 + MAN_JAW : 16.6;
  return smooth([[0, -16.5], ...half, [0, chin], ...mirror(half)], 3);
}

/** Ears and the head itself, shaded from the upper left. */
export function paintHead(ctx, r, f) {
  const { skin } = f;
  for (const s of [-1, 1]) {
    const ear = ellipse(s * 15.4, 3.4, 2.7, 3.8, 8, s * 0.15);
    prime(ctx, ear);
    fill(ctx, r, ear, skin.base, { layers: 6, strength: 0.96 });
    dab(ctx, s * 15.5, 3.6, 1.1, 1.9, skin.shade, 0.55);
    line(ctx, r, ear, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
  }
  const shape = headShape(f.body);
  const man = f.body === "man";
  prime(ctx, shape);
  fill(ctx, r, shape, skin.base, { layers: 12, strength: 0.96, soft: 0.05 });
  pool(
    ctx,
    r,
    shape,
    skin.shade,
    [
      [11.5, 8, 6, 10, -0.4],
      [1, -13.5, 15, 5.5],
      man ? [0, 17 + MAN_JAW, 10.5, 2.5] : [0, 17, 9, 2.4],
      ...(man ? [[-12.4, 13.8, 2.4, 4.2, 0.5]] : []),
    ],
    0.26,
  );
  const jaw = shape.slice(8, 35);
  line(ctx, r, jaw, { alpha: 0.48, width: 0.65, gaps: 0.06 });
}

function eyes(ctx, r, f, ex, ey, k) {
  const shut = f.mood === "happy" && !f.wideEyed;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (shut) {
      ink(
        ctx,
        [
          [x - 2.3 * k, ey + 0.9],
          [x - 0.2 * s, ey - 1.3 * k],
          [x + 2.3 * k, ey + 0.9],
        ],
        "eye",
        1.05 * k,
        0.95,
      );
    } else {
      dab(ctx, x, ey, 1.55 * k, 2.05 * k, "eye", 0.96);
      dab(ctx, x + 0.5 * k, ey - 0.85 * k, 0.55 * k, 0.55 * k, "white", 0.95);
    }
    if (f.body !== "man" && !f.plainEyes) {
      // Lashes: a lid line and a flick at the outer corner.
      if (!shut)
        ink(
          ctx,
          [
            [x - s * 1.5 * k, ey - 1.7 * k],
            [x + s * 0.4, ey - 2.3 * k],
            [x + s * 1.9 * k, ey - 1.5 * k],
          ],
          "eye",
          0.5,
          0.85,
        );
      ink(
        ctx,
        [
          [x + s * 1.7 * k, ey - (shut ? -0.4 : 1.5) * k],
          [x + s * 3 * k, ey - (shut ? -0.2 : 2.5) * k],
        ],
        "eye",
        0.5,
        0.85,
      );
    }
  }
}

function brows(ctx, f, ex, ey) {
  const color = f.browColor ?? mix(f.hair.dark, "umber", 0.45);
  const worried = f.mood === "oops";
  const happy = f.mood === "happy";
  if (f.body === "man") {
    // A man's brows: heavier, straighter, and sitting low over the eyes
    // (lifted clear of the rims when he wears glasses).
    const y = ey - (f.glasses === "round" ? 5.9 : 5.1);
    for (const s of [-1, 1]) {
      const inner = [s * (ex - 3.1), y + (worried ? -1.3 : happy ? -0.3 : 0.25)];
      const mid = [s * (ex + 0.3), y - (worried ? 0.5 : happy ? 0.9 : 0.35)];
      const outer = [s * (ex + 3.4), y + (worried ? 1.2 : 0.4)];
      ink(ctx, [inner, mid, outer], color, f.bushy ? 2.1 : 1.6, 0.9);
    }
    return;
  }
  const heavy = 0.75;
  const y = ey - (f.body === "child" ? 5.6 : 5.9);
  for (const s of [-1, 1]) {
    const inner = [s * (ex - 2.5), y + (worried ? -1.5 : happy ? -0.2 : 0.3)];
    const mid = [s * (ex + 0.2), y - (worried ? 0.6 : happy ? 1.3 : 0.7)];
    const outer = [s * (ex + 2.9), y + (worried ? 1.3 : 0.5)];
    ink(ctx, [inner, mid, outer], color, f.bushy ? 1.7 : heavy, f.bushy ? 0.95 : 0.8);
  }
}

function mouth(ctx, r, f, my) {
  const c = f.skin.line;
  if (f.mood === "happy" || f.grin) {
    // An open smile: a dark little bowl, a pale tongue, a rim of teeth.
    const w = f.grin ? 5 : 4.3;
    const bowl = smooth(
      [
        [-w, my - 1],
        [0, my - 0.2],
        [w, my - 1.2],
        [w * 0.62, my + 2.6],
        [0, my + 4],
        [-w * 0.62, my + 2.6],
      ],
      4,
    );
    fill(ctx, r, bowl, mix(c, "eye", 0.45), { layers: 5, strength: 0.95, soft: 0.04, edge: 0 });
    within(ctx, bowl, () => {
      dab(ctx, 0.3, my + 3.6, w * 0.55, 1.7, "poppy", 0.85);
      if (f.grin) {
        // Posy is missing a front tooth.
        dab(ctx, 0, my - 0.4, w * 0.9, 1.5, "white", 0.98);
        dab(ctx, 0.9, my - 0.2, 0.75, 1.5, mix(c, "eye", 0.45), 1);
      } else dab(ctx, 0, my - 0.7, w * 0.8, 1.05, "white", 0.95);
    });
    ink(
      ctx,
      [
        [-w - 0.7, my - 1.5],
        [-w, my - 0.9],
      ],
      c,
      0.7,
      0.8,
    );
    ink(
      ctx,
      [
        [w + 0.7, my - 1.7],
        [w, my - 1.1],
      ],
      c,
      0.7,
      0.8,
    );
    return;
  }
  const man = f.body === "man";
  if (man && f.beard !== "full")
    // The hint of a chin under a man's mouth.
    ink(
      ctx,
      [
        [-2.5, my + 4.2],
        [0, my + 4.8],
        [2.5, my + 4.2],
      ],
      f.skin.shade,
      0.8,
      0.62,
    );
  if (f.mood === "oops") {
    ink(
      ctx,
      [
        [-2.8, my + 1.2],
        [-1, my + 0.1],
        [0.8, my + 0.9],
        [2.7, my + 0.3],
      ],
      c,
      0.85,
      0.9,
    );
    return;
  }
  if (f.body === "woman") dab(ctx, 0.1, my + 0.75, 2.1, 1, "lip", 0.42);
  // A man's smile is a little wider and flatter.
  const w = man ? 1.16 : 1;
  ink(
    ctx,
    [
      [-3.3 * w, my - 0.5],
      [-0.1, my + (man ? 0.85 : 1.1)],
      [3.5 * w, my - 0.7],
    ],
    c,
    man ? 0.95 : 0.85,
    0.92,
  );
  // The little tucks at the corners that make it a smile.
  dab(ctx, -3.6 * w, my - 0.7, 0.5, 0.5, c, 0.6);
  dab(ctx, 3.8 * w, my - 0.9, 0.5, 0.5, c, 0.6);
}

function beard(ctx, r, f, my) {
  const h = f.hair;
  // On a man's longer, squarer jaw everything below the cheeks sits lower
  // and the corners of the jaw sit wider.
  const d = f.body === "man" ? MAN_JAW : 0;
  const low = (y) => (y > 9 ? y + d * 0.78 : y > 5 ? y + d * 0.5 : y);
  if (f.beard === "stubble") {
    const jaw = smooth(
      [
        [-14.6, 3.5],
        [-9.5, 7.6],
        [-4.5, 6.6],
        [0, 7.4],
        [4.5, 6.6],
        [9.5, 7.6],
        [14.6, 3.5],
        [13.6 + d * 0.4, 10],
        [8.6 + d * 1.3, 14.8 - d * 0.3],
        [0, 17],
        [-8.6 - d * 1.3, 14.8 - d * 0.3],
        [-13.6 - d * 0.4, 10],
      ].map(([x, y]) => [x, low(y)]),
      3,
    );
    wash(ctx, jaw, mix(h.base, f.skin.shade, 0.35), {
      r,
      layers: 7,
      strength: 0.34,
      soft: 0.2,
      edge: 0,
    });
    within(ctx, jaw, () =>
      splatter(ctx, 0, 11 + d * 0.5, 14, h.dark, { r, n: 46, size: 0.4, strength: 0.8 }),
    );
    return;
  }
  if (f.beard === "full") {
    const shape = smooth(
      [
        [-15.6, 1],
        [-12.6, 5.4],
        [-8.4, 7.6],
        [-3.6, 6.6],
        [0, 7.4],
        [3.6, 6.6],
        [8.4, 7.6],
        [12.6, 5.4],
        [15.6, 1],
        [16.4, 9],
        [13, 16.6],
        [6.6, 21],
        [0.4, 22.4],
        [-6.2, 21],
        [-12.8, 16.6],
        [-16.4, 9],
      ].map(([x, y]) => [x, low(y)]),
      3,
    );
    fill(ctx, r, shape, h.base, { layers: 12, strength: 0.94, soft: 0.14, edge: 0.7 });
    pool(
      ctx,
      r,
      shape,
      h.dark,
      [
        [0, low(19), 9, 3.6],
        [12, low(11), 4, 7],
        [-13, low(12), 3, 6],
      ],
      0.42,
    );
    pool(ctx, r, shape, h.light, [[-5, low(13), 4.5, 3.6]], 0.4);
    for (const [x0, y0, x1, y1] of [
      [-10, 10, -8, 17],
      [-4, 14, -3, 20.6],
      [3, 14.6, 3.6, 20.4],
      [9, 10, 8.4, 17.4],
      [13.4, 6, 13, 13],
    ])
      ink(
        ctx,
        [
          [x0, low(y0)],
          [(x0 + x1) / 2 + 0.6, low((y0 + y1) / 2)],
          [x1, low(y1)],
        ],
        h.dark,
        0.6,
        0.5,
      );
    line(ctx, r, shape.slice(26), { alpha: 0.42, width: 0.6, gaps: 0.15 });
  }
  if (f.beard === "full" || f.beard === "moustache") {
    // A moustache: two soft sweeps out from under the nose.
    for (const s of [-1, 1]) {
      const sweep = smooth(
        [
          [s * 0.2, my - 3.6],
          [s * 3.6, my - 4],
          [s * 7.6, my - 1.4],
          [s * 8.2, my + 0.9],
          [s * 4.4, my - 0.4],
          [s * 0.6, my - 0.9],
        ],
        3,
      );
      fill(ctx, r, sweep, h.base, { layers: 8, strength: 0.96, soft: 0.1, edge: 0.7 });
      pool(ctx, r, sweep, h.dark, [[s * 5.4, my - 0.8, 2.6, 1.2]], 0.4);
      line(ctx, r, sweep, { closed: true, alpha: 0.4, width: 0.55, passes: 1, gaps: 0.2 });
    }
  }
}

/** Cheeks, eyes, brows, nose, mouth; then any beard, glasses and small marks. */
export function paintFace(ctx, r, f) {
  const { skin } = f;
  const child = f.body === "child";
  // A man's face is longer: smaller eyes set higher, the mouth lower, and
  // the room between them given to the nose. His cheeks are barely pink.
  const man = f.body === "man";
  const ex = child ? 6.5 : 6.2;
  const ey = child ? 3.4 : man ? 1.7 : 2.6;
  const my = child ? 10.4 : man ? 11.6 : 10.6;
  const k = child ? 1.12 : man ? 0.92 : 1;
  for (const s of [-1, 1])
    wash(
      ctx,
      man
        ? ellipse(s * 10 + 0.3, ey + 6.3, 3.6, 2.6, 8)
        : ellipse(s * 9.6 + 0.3, ey + 5.3, 4, 3, 8),
      skin.cheek,
      {
        r,
        layers: 7,
        strength: f.ruddy ? (man ? 0.58 : 0.66) : man ? 0.26 : 0.44,
        soft: 0.5,
        edge: 0,
      },
    );
  if (f.ruddy)
    wash(ctx, ellipse(0.6, ey + 3.9, 2.2, 1.7, 7), skin.cheek, {
      r,
      layers: 5,
      strength: 0.26,
      soft: 0.5,
      edge: 0,
    });
  if (f.freckles)
    for (let i = 0; i < 11; i++)
      dab(
        ctx,
        (i / 10 - 0.5) * 17 + r.gauss() * 0.5,
        ey + 4.2 + Math.cos((i / 10 - 0.5) * 3) * -1.2 + r.gauss() * 0.9,
        0.42,
        0.42,
        "terracotta",
        0.6,
      );
  eyes(ctx, r, f, ex, ey, k);
  brows(ctx, f, ex, ey);
  if (man) {
    // More than a hint of a nose: longer, with its shaded side washed in.
    wash(ctx, ellipse(1.5, ey + 4.5, 1.5, 2.5, 7), skin.shade, {
      r,
      layers: 4,
      strength: 0.34,
      soft: 0.5,
      edge: 0,
    });
    ink(
      ctx,
      [
        [0.2, ey + 2.4],
        [2, ey + 5.7],
        [-0.4, ey + 6.3],
      ],
      skin.line,
      0.75,
      0.72,
    );
  } else
    // The hint of a nose.
    ink(
      ctx,
      [
        [0.3, ey + 2.6],
        [1.3, ey + 4.5],
        [0, ey + 4.9],
      ],
      skin.line,
      0.6,
      0.48,
    );
  if (f.old) {
    // Laughter lines.
    for (const s of [-1, 1]) {
      pencil(
        ctx,
        [
          [s * (ex + 3.2), ey - 0.4],
          [s * (ex + 4.8), ey - 1.1],
        ],
        { r, alpha: 0.4, width: 0.5, passes: 1, wobble: 0.1 },
      );
      pencil(
        ctx,
        [
          [s * (ex + 3.3), ey + 0.9],
          [s * (ex + 4.9), ey + 1.4],
        ],
        { r, alpha: 0.4, width: 0.5, passes: 1, wobble: 0.1 },
      );
      pencil(
        ctx,
        [
          [s * 5.2, my - 3.6],
          [s * 6.2, my - 0.6],
        ],
        { r, alpha: 0.3, width: 0.5, passes: 1, wobble: 0.1 },
      );
    }
  }
  if (f.beard && f.beard !== "none") beard(ctx, r, f, my);
  if (f.beard === "full") {
    // A gap in the beard, so the smile is not lost in it.
    const lips = ellipse(0.1, my + 2.2, 3.7, 1.9, 9);
    prime(ctx, lips);
    fill(ctx, r, lips, skin.base, { layers: 5, strength: 0.9, soft: 0.14, edge: 0 });
  }
  mouth(ctx, r, f, f.beard === "moustache" ? my + 1.4 : f.beard === "full" ? my + 1.7 : my);
  if (f.flour) {
    // A dusting of flour on one cheek.
    wash(ctx, ellipse(-10.4, ey + 2.2, 2.6, 1.3, 7, -0.5), "white", {
      r,
      layers: 5,
      strength: 0.55,
      soft: 0.4,
      edge: 0,
    });
    splatter(ctx, -9.6, ey + 1.6, 4.4, "white", { r, n: 9, size: 0.5, strength: 1.4 });
  }
  if (f.glasses === "round") {
    const rim = mix("umber", "eye", 0.4);
    for (const s of [-1, 1]) {
      const lens = ellipse(s * (ex + 0.3), ey + 0.2, 4.7, 4.7, 14);
      wash(ctx, lens, "white", { r, layers: 4, strength: 0.2, soft: 0.05, edge: 0 });
      pencil(ctx, lens, { r, color: rim, closed: true, alpha: 0.9, width: 0.85, wobble: 0.15 });
      ink(
        ctx,
        [
          [s * (ex + 5), ey - 0.6],
          [s * 15, ey - 0.2],
        ],
        rim,
        0.7,
        0.75,
      );
    }
    ink(
      ctx,
      [
        [-ex + 4.4, ey - 0.4],
        [0, ey - 1.5],
        [ex - 4.4, ey - 0.4],
      ],
      rim,
      0.8,
      0.9,
    );
  }
}

/** Small things worn on the head, painted over the hair. */
export function paintExtras(ctx, r, f) {
  if (f.earrings)
    for (const s of [-1, 1]) {
      dab(ctx, s * 15.9 + 0.2, 7.9, 1.25, 1.25, "inkSoft", 0.5);
      dab(ctx, s * 15.9, 7.6, 1.15, 1.15, f.earrings, 1);
      dab(ctx, s * 15.9 - 0.3, 7.3, 0.4, 0.4, "white", 0.9);
    }
  if (f.chew) {
    // A stalk of wheat in the corner of the mouth (a man's mouth sits lower).
    const stalk = [
      [3.4, f.body === "man" ? 11.5 : 10.6],
      [10, 13.6],
      [16.6, 14.6],
    ];
    ink(ctx, stalk, "straw", 1, 1);
    pencil(ctx, stalk, { r, alpha: 0.5, width: 0.5, passes: 1, wobble: 0.15 });
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1])
        wash(
          ctx,
          ellipse(17.6 + i * 1.9, 14.8 + i * 0.2 + s * 1.1, 1.5, 0.9, 6, s * 0.5),
          "sunflower",
          {
            r,
            layers: 3,
            strength: 0.95,
            soft: 0.1,
            edge: 0.9,
          },
        );
  }
  if (f.brush) {
    // A paintbrush tucked behind one ear.
    ink(
      ctx,
      [
        [14.6, 1.6],
        [21.6, -12.6],
      ],
      "wood",
      1.5,
      0.95,
    );
    ink(
      ctx,
      [
        [20.6, -10.6],
        [21.6, -12.6],
      ],
      "stone",
      1.7,
      0.95,
    );
    wash(ctx, ellipse(22.6, -14.8, 1.3, 2.6, 7, 0.46), f.brush, {
      r,
      layers: 4,
      strength: 0.95,
      soft: 0.14,
      edge: 0.8,
    });
    pencil(
      ctx,
      [
        [14.9, 1.9],
        [21.9, -12.3],
      ],
      { r, alpha: 0.4, width: 0.5, passes: 1, wobble: 0.15 },
    );
  }
}
