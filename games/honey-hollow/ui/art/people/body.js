// Bodies and clothes, in figure space (origin on the ground between the feet,
// up is negative). One painter dresses everyone: the beekeeper's dungarees
// and the villagers' aprons, cardigans and smocks are the same few garments
// with different colours, so every combination holds together.

import {
  wash,
  brush,
  pencil,
  shadow,
  ellipse,
  roundRect,
  smooth,
  ribbon,
  within,
  splatter,
  blob,
} from "../../paint/wash.js";
import { lighten, mix } from "../../paint/palette.js";
import { HEAD_RY, dab, ink, prime, line, fill, pool, along, part, lerp } from "./kit.js";

const BASE = {
  woman: { leg: 33, torso: 27.5, neck: 3.4, head: 1, sh: 13.4, chest: 12, waist: 10.4 },
  // A man's head is a touch smaller on broader shoulders, and his longer jaw
  // (see head.js) takes up the extra neck: he stands as tall as he did.
  man: { leg: 35, torso: 29.5, neck: 5.05, head: 0.95, sh: 18.4, chest: 15.4, waist: 13.1 },
  child: { leg: 22, torso: 19.5, neck: 2.2, head: 0.9, sh: 10.4, chest: 9.8, waist: 9.6 },
};
const MORE = {
  woman: { hip: 13.2, arm: 7, neckW: 3.3 },
  man: { hip: 13.4, arm: 8.4, neckW: 5.3, jaw: 1.8 },
  child: { hip: 10.4, arm: 6, neckW: 2.9 },
};
const SHAPES = {
  round: { sh: 1.1, chest: 1.22, waist: 1.44, hip: 1.26, arm: 1.12 },
  thin: { sh: 0.93, chest: 0.9, waist: 0.9, hip: 0.9, arm: 0.9 },
  big: { sh: 1.15, chest: 1.22, waist: 1.36, hip: 1.2, arm: 1.2, leg: 1.04, torso: 1.06 },
};

/**
 * Where everything is for a body: `body` is "woman", "man" or "child",
 * `shape` optionally "round", "thin" or "big".
 */
export function geometry(body, shape) {
  const g = { ...(BASE[body] ?? BASE.woman), ...(MORE[body] ?? MORE.woman) };
  const m = SHAPES[shape];
  if (m) for (const k in m) g[k] *= m[k];
  g.body = BASE[body] ? body : "woman";
  g.hipY = -g.leg;
  g.shY = g.hipY - g.torso;
  g.waistY = g.shY + g.torso * 0.6;
  g.chinY = g.shY - g.neck;
  g.headY = g.chinY - HEAD_RY * g.head;
  g.top = g.headY - HEAD_RY * g.head;
  /** limb lengths follow the torso, so a child's arms are a child's */
  g.k = g.torso / 28;
  return g;
}

const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

function torso(g, hem = 0, flare = 0) {
  const { sh, chest, waist, hip, shY, hipY, waistY } = g;
  // A man's shoulders are squarer.
  const sq = g.body === "man" ? 1 : 0;
  const right = [
    [g.neckW + 1, shY - 2.4],
    [sh * (0.72 + sq * 0.07), shY - 1.2 - sq * 0.5],
    [sh, shY + 2.2 - sq * 0.7],
    [chest + 0.6, shY + 9],
    [waist + flare * 0.4, waistY],
    [hip - 0.6 + flare, hipY + 1 + hem],
    [hip * 0.5 + flare * 0.5, hipY + 2.6 + hem],
  ];
  return smooth([...mirror(right), ...right], 3);
}

// ------------------------------------------------------------------ legs

function boots(ctx, r, g, color) {
  const x0 = g.hip * 0.53;
  const w = g.hip * 0.42 + 1;
  for (const s of [-1, 1]) {
    const boot = smooth(
      [
        [s * (x0 - w), -12],
        [s * (x0 + w), -12],
        [s * (x0 + w + 0.6), -6],
        [s * (x0 + w + 3.4), -3.2],
        [s * (x0 + w + 3.6), -0.6],
        [s * (x0 + w), 0.2],
        [s * (x0 - w + 0.4), 0.2],
        [s * (x0 - w - 0.3), -5],
      ],
      3,
    );
    fill(ctx, r, boot, color.base, { strength: 0.94, layers: 8 });
    pool(ctx, r, boot, color.dark, [[s * (x0 + 1), -1.5, w + 3, 2.4]], 0.5);
    line(ctx, r, boot, { closed: true, alpha: 0.5 });
    // The turned-down top of the boot.
    ink(
      ctx,
      [
        [s * (x0 - w + 0.4), -9.3],
        [s * x0, -8.7],
        [s * (x0 + w - 0.2), -9.4],
      ],
      color.dark,
      0.7,
      0.55,
    );
  }
}

function trousers(ctx, r, g, o) {
  const { hip, waist, hipY, waistY, shY } = g;
  const c = o.legs.color;
  const out = hip * 0.98;
  const cuff = -9.5;
  const bib = o.over?.kind === "bib";
  const bw = Math.min(waist - 1.6, g.chest * 0.62);
  const top = shY + 7.2 * g.k;
  const right = [
    [1.4, cuff],
    [out - 0.2, cuff],
    [out + 0.4, cuff - 9],
    [hip + 0.5, hipY + 3],
    [hip * 0.99, hipY - 4],
  ];
  const head = bib
    ? [
        [waist + 0.5, waistY + 1.2],
        [waist + 0.2, waistY - 1.2],
        [bw + 1.4, waistY - 2.6],
        [bw + 0.5, top + 1],
        [bw - 0.4, top],
      ]
    : [
        [waist + 0.5, waistY + 2.4],
        [waist * 0.5, waistY + 2],
      ];
  const half = [...right, ...head];
  const shape = smooth([[0, hipY + 9.5], ...half, ...mirror(half)], 3);
  fill(ctx, r, shape, c.base, { layers: 12 });
  pool(
    ctx,
    r,
    shape,
    c.dark,
    [
      [0, hipY + 12, 2.6, 13],
      [hip * 0.8, hipY + 12, 3.2, 16],
      [-hip * 0.95, cuff - 2, 4, 5],
      [0, waistY + 2, waist, 2.2],
    ],
    0.34,
  );
  pool(ctx, r, shape, lighten(c.base, 0.5), [[-hip * 0.5, hipY + 8, 3, 9]], 0.3);
  line(ctx, r, shape, { closed: true, alpha: 0.48, gaps: 0.12 });
  // Turn-ups.
  for (const s of [-1, 1])
    ink(
      ctx,
      [
        [s * 1.8, cuff - 3],
        [s * out * 0.55, cuff - 2.5],
        [s * (out + 0.1), cuff - 3.2],
      ],
      c.dark,
      0.7,
      0.6,
    );
  if (bib) bibTrim(ctx, r, g, c, bw, top);
}

// On a bib: a pocket, two buttons, and the straps going over the shoulders.
function bibTrim(ctx, r, g, c, bw, top) {
  const { waist, waistY, shY } = g;
  const pocket = roundRect(-bw * 0.52, top + 3.4, bw * 1.04, 5.6 * g.k, 1.4);
  line(ctx, r, pocket, { closed: true, alpha: 0.42, width: 0.6, passes: 1 });
  pencil(
    ctx,
    [
      [-waist, waistY + 0.6],
      [0, waistY + 1.3],
      [waist, waistY + 0.5],
    ],
    { r, alpha: 0.35, width: 0.6, passes: 1 },
  );
  for (const s of [-1, 1]) {
    const strap = [
      [s * (bw - 1.2), top + 1.2],
      [s * (bw + 0.6), top - 3.6],
      [s * (g.sh * 0.6), shY - 1.4],
    ];
    brush(ctx, smooth(strap, 4, false), c.base, {
      r,
      width: () => 3.3,
      strength: 0.95,
      layers: 7,
      edge: 0.7,
    });
    pencil(
      ctx,
      strap.map(([x, y]) => [x + s * 1.7, y + 0.3]),
      { r, alpha: 0.4, width: 0.55, passes: 1, wobble: 0.2 },
    );
    dab(ctx, s * (bw - 1.3), top + 1.9, 1.15, 1.15, "gold", 0.95);
    dab(ctx, s * (bw - 1.6), top + 1.6, 0.4, 0.4, "white", 0.8);
  }
}

// Legs (or stockings) show below a skirt's hem.
function stubs(ctx, r, g, o, skin) {
  const hem = o.legs.hem ?? -20;
  const x0 = g.hip * 0.53;
  for (const s of [-1, 1]) {
    const leg = roundRect(s * x0 - 3.3, hem - 3, 6.6, -hem - 6, 2.5);
    const sock = o.legs.tights;
    if (!sock) prime(ctx, leg);
    fill(ctx, r, leg, sock ?? skin.base, { layers: 6 });
    pool(ctx, r, leg, sock ? mix(sock, "coal", 0.3) : skin.shade, [[s * x0 + 1.4, hem + 4, 2, 9]]);
    line(ctx, r, leg, { closed: true, alpha: 0.35, passes: 1 });
  }
}

function skirt(ctx, r, g, o) {
  const { hip, waist, hipY, waistY } = g;
  const c = o.legs.color;
  const hem = o.legs.hem ?? -20;
  const wide = hip + (o.legs.flare ?? 5);
  // A pinafore is a skirt with a bib.
  const bib = o.over?.kind === "bib";
  const bw = Math.min(waist - 1.6, g.chest * 0.62);
  const top = g.shY + 7.2 * g.k;
  const right = [
    ...(bib
      ? [
          [bw - 0.4, top],
          [bw + 0.5, top + 1],
          [bw + 1.4, waistY - 2.6],
          [waist + 0.2, waistY - 1.2],
        ]
      : [[waist * 0.5, waistY + 1.4]]),
    [waist + 0.6, waistY + 1.8],
    [hip + 1.6, hipY + 1],
    [wide - 0.6, hem - 6],
    [wide, hem - 0.6],
    [wide * 0.62, hem + 0.9],
    [wide * 0.3, hem + 0.1],
  ];
  const shape = smooth([...right, [0, hem + 1], ...mirror(right)], 3);
  fill(ctx, r, shape, c.base, { layers: 12 });
  pool(
    ctx,
    r,
    shape,
    c.dark,
    [
      [wide * 0.7, hem - 9, 3.4, 13],
      [-wide * 0.25, hem - 6, 2, 10, 0.1],
      [wide * 0.2, hem - 7, 1.8, 9, -0.1],
      [0, hem - 0.5, wide, 2],
    ],
    0.32,
  );
  line(ctx, r, shape, { closed: true, alpha: 0.48, gaps: 0.12 });
  for (const t of [-0.45, 0.4])
    pencil(
      ctx,
      [
        [waist * t, waistY + 5],
        [wide * t * 1.02, hem - 2],
      ],
      { r, alpha: 0.26, width: 0.55, passes: 1 },
    );
  if (bib) bibTrim(ctx, r, g, c, bw, top);
}

/**
 * The cast shadow, boots, and trousers or a skirt. A bust still needs the
 * garment, because a bib is part of it; `cropped` leaves out what is below.
 */
export function paintLegs(ctx, r, g, o, skin, cropped) {
  const skirted = o.legs.kind === "skirt";
  if (!cropped) {
    shadow(ctx, 1.5, 0.6, g.hip + 9, 3.8, r, 0.3);
    if (skirted) stubs(ctx, r, g, o, skin);
    boots(ctx, r, g, o.boots ?? { base: "boot", dark: "bootDeep" });
  }
  if (skirted) skirt(ctx, r, g, o);
  else trousers(ctx, r, g, o);
}

// ------------------------------------------------------------------- top

function pattern(ctx, r, shape, t, box) {
  const [x0, y0, x1, y1] = box;
  const mark = t.color.mark ?? t.color.dark;
  within(ctx, shape, () => {
    if (t.color.pattern === "stripes") {
      for (let y = y0 + 2.2; y < y1; y += 4.3)
        brush(
          ctx,
          [
            [x0, y - 0.6],
            [(x0 + x1) / 2, y + 0.7],
            [x1, y - 0.5],
          ],
          mark,
          { r, width: () => 1.5, strength: 0.72, layers: 4, edge: 0 },
        );
    } else if (t.color.pattern === "checks") {
      const band = (a, b) =>
        wash(
          ctx,
          ribbon([a, b], () => 2.6),
          mark,
          {
            r,
            layers: 4,
            strength: 0.42,
            soft: 0.08,
            edge: 0,
            glaze: true,
          },
        );
      for (let y = y0 + 3; y < y1; y += 7) band([x0, y], [x1, y + 0.6]);
      for (let x = x0 + 2.5; x < x1; x += 7) band([x, y0], [x + 0.6, y1]);
    } else if (t.color.pattern === "dots") {
      for (let y = y0 + 3, k = 0; y < y1; y += 5, k++)
        for (let x = x0 + (k % 2 ? 2 : 4.5); x < x1; x += 5)
          dab(ctx, x + r.gauss() * 0.3, y + r.gauss() * 0.3, 0.85, 0.85, mark, 0.75);
    }
  });
}

/** The shirt, jumper, cardigan, jacket or smock: whatever covers the chest. */
export function paintTop(ctx, r, g, o) {
  const t = o.top;
  const { sh, shY, hipY, waistY } = g;
  const hem = t.hem ?? 0;
  const shape = torso(g, hem, t.flare ?? 0);
  fill(ctx, r, shape, t.color.base, { layers: 12 });
  pool(
    ctx,
    r,
    shape,
    t.color.dark,
    [
      [g.chest * 0.9, shY + 16, 3.6, 13],
      [-g.chest, shY + 12, 2.6, 8],
      [0, hipY + hem, g.hip, 2.6],
    ],
    0.36,
  );
  if (t.color.pattern) pattern(ctx, r, shape, t, [-sh - 1, shY - 2, sh + 1, hipY + hem + 3]);
  line(ctx, r, shape, { closed: true, alpha: 0.48, gaps: 0.12 });
  if (t.insert) {
    // An open front: the shirt underneath shows in a V.
    const depth = (t.insert.depth ?? 15) * g.k;
    const v = smooth(
      [
        [-g.neckW - 1.8, shY - 2.2],
        [-g.neckW * 0.6, shY + depth * 0.5],
        [0, shY + depth],
        [g.neckW * 0.6, shY + depth * 0.5],
        [g.neckW + 1.8, shY - 2.2],
        [0, shY - 1.4],
      ],
      3,
    );
    fill(ctx, r, v, t.insert.color.base, { layers: 8 });
    pool(ctx, r, v, t.insert.color.dark, [[1.5, shY + 3, 3, 4]], 0.3);
    line(ctx, r, v, { closed: true, alpha: 0.45, passes: 1 });
    if (t.buttons !== false) {
      pencil(
        ctx,
        [
          [0, shY + depth],
          [0.5, hipY + hem + 2],
        ],
        { r, alpha: 0.4, width: 0.6, passes: 1 },
      );
      for (let y = shY + depth + 3.5; y < hipY + hem; y += 5.2)
        dab(ctx, 1.6, y, 0.95, 0.95, t.buttonColor ?? "bark", 0.85);
    }
  } else if (t.buttons) {
    for (let y = shY + 6; y < hipY + hem; y += 5.4)
      dab(ctx, 0.4, y, 0.9, 0.9, t.buttonColor ?? "bark", 0.8);
  }
  if (t.pockets) {
    for (const s of [-1, 1])
      line(ctx, r, roundRect(s * g.waist * 0.62 - 3, waistY + 3 + hem * 0.5, 6, 5.4, 1.2), {
        closed: true,
        alpha: 0.4,
        width: 0.6,
        passes: 1,
      });
  }
  if (t.ribbed) {
    // A knitted welt along the hem.
    const y = hipY + hem;
    pencil(
      ctx,
      [
        [-g.hip, y - 1.6],
        [0, y - 0.9],
        [g.hip, y - 1.7],
      ],
      { r, alpha: 0.35, width: 0.6, passes: 1 },
    );
    for (let x = -g.hip + 2; x < g.hip; x += 2.6)
      ink(
        ctx,
        [
          [x, y - 1.2],
          [x + 0.2, y + 1.6],
        ],
        t.color.dark,
        0.5,
        0.5,
      );
  }
  if (t.spots) {
    // A painter's smock.
    within(ctx, shape, () => {
      for (const c of ["poppy", "borage", "dandelion", "leaf", "heather", "poppy", "water"])
        wash(
          ctx,
          blob(r, r.range(-sh, sh) * 0.8, r.range(shY + 5, hipY + hem), r.range(1, 2.1), 0.3, 7),
          c,
          { r, layers: 4, strength: 0.7, soft: 0.25, edge: 0.5 },
        );
    });
  }
}

/** Whatever is worn over the top and legs: apron, waistcoat, braces, shawl. */
export function paintOver(ctx, r, g, o) {
  const v = o.over;
  if (!v) return;
  const { sh, shY, hipY, waistY, waist, hip } = g;
  if (v.kind === "apron") {
    const bw = waist * 0.78;
    const top = shY + 6.5 * g.k;
    const hem = (o.legs.hem ?? -20) - 3;
    const wide = hip + 2.5;
    const right = [
      [bw * 0.92, top],
      [bw, waistY - 2],
      [waist + 1.4, waistY + 0.6],
      [wide, hipY + 6],
      [wide + 0.6, hem - 1],
      [wide * 0.5, hem + 0.8],
    ];
    const shape = smooth([...mirror(right), ...right], 3);
    fill(ctx, r, shape, v.color.base, { layers: 12, strength: 0.96 });
    pool(
      ctx,
      r,
      shape,
      v.color.dark,
      [
        [wide * 0.6, hipY + 14, 3.4, 12],
        [-wide * 0.3, hipY + 16, 1.8, 9],
        [0, waistY + 1.2, waist, 1.6],
      ],
      0.42,
    );
    line(ctx, r, shape, { closed: true, alpha: 0.5 });
    for (const s of [-1, 1])
      pencil(
        ctx,
        [
          [s * bw * 0.86, top + 0.4],
          [s * (g.neckW + 1.6), shY - 1.6],
        ],
        { r, alpha: 0.5, width: 1.1, passes: 1, color: v.color.dark },
      );
    line(ctx, r, roundRect(-4.2, waistY + 5, 8.4, 6.4, 1.4), {
      closed: true,
      alpha: 0.38,
      width: 0.6,
      passes: 1,
    });
    if (v.flour) {
      splatter(ctx, -2, waistY + 8, 9, "white", { r, n: 16, size: 1, strength: 1.3 });
      splatter(ctx, 3, shY + 12, 6, "white", { r, n: 8, size: 0.8, strength: 1.3 });
    }
  } else if (v.kind === "waistcoat") {
    const right = [
      [0, shY + 12.5 * g.k],
      [g.neckW + 2.2, shY - 1.6],
      [sh * 0.74, shY - 0.4],
      [g.chest * 0.86, shY + 9],
      [waist + 0.5, waistY],
      [hip * 0.92, hipY + 0.5],
      [hip * 0.36, hipY + 4.4],
    ];
    const shape = smooth([...right, [0, hipY + 1], ...mirror(right).slice(0, -1)], 3);
    fill(ctx, r, shape, v.color.base, { layers: 12 });
    pool(ctx, r, shape, v.color.dark, [
      [g.chest * 0.8, shY + 16, 3.4, 11],
      [-hip * 0.5, hipY, 5, 2.4],
    ]);
    line(ctx, r, shape, { closed: true, alpha: 0.5 });
    pencil(
      ctx,
      [
        [0, shY + 12.5 * g.k],
        [0.4, hipY + 1],
      ],
      { r, alpha: 0.4, width: 0.6, passes: 1 },
    );
    for (let y = shY + 15.5 * g.k; y < hipY - 1; y += 4.6)
      dab(ctx, 1.5, y, 0.9, 0.9, v.buttonColor ?? "gold", 0.9);
    if (v.chain)
      ink(
        ctx,
        [
          [1.6, waistY - 1],
          [5, waistY + 2.4],
          [waist * 0.8, waistY - 0.4],
        ],
        "gold",
        0.7,
        0.9,
      );
  } else if (v.kind === "braces") {
    for (const s of [-1, 1]) {
      const strap = smooth(
        [
          [s * waist * 0.58, waistY + 2.6],
          [s * (waist * 0.56 + 0.8), shY + 9],
          [s * sh * 0.5, shY - 1.6],
        ],
        4,
        false,
      );
      brush(ctx, strap, v.color.base, {
        r,
        width: () => 2.7,
        strength: 0.94,
        layers: 6,
        edge: 0.8,
      });
      dab(ctx, s * waist * 0.58, waistY + 1.6, 1, 1, "gold", 0.9);
    }
  }
}

/** A shawl goes on after the arms, since it wraps them. */
export function paintShawl(ctx, r, g, o) {
  const v = o.over;
  if (v?.kind !== "shawl") return;
  const { sh, shY } = g;
  const right = [
    [0.6, shY + 12],
    [g.neckW + 1.2, shY - 2.6],
    [sh * 0.8, shY - 1.8],
    [sh + 3.6, shY + 4],
    [sh + 4.6, shY + 13],
    [sh * 0.6, shY + 17.5],
  ];
  const shape = smooth(
    [...right, [2, shY + 23.5], [-2.5, shY + 22], ...mirror(right).slice(0, -1)],
    3,
  );
  fill(ctx, r, shape, v.color.base, { layers: 12 });
  pool(ctx, r, shape, v.color.dark, [
    [sh * 0.9, shY + 10, 4, 8],
    [-sh * 0.4, shY + 14, 5, 3],
    [0, shY + 16, 3, 6],
  ]);
  line(ctx, r, shape, { closed: true, alpha: 0.5 });
  pencil(
    ctx,
    [
      [-g.neckW - 1, shY - 2],
      [0.6, shY + 12],
      [g.neckW + 1, shY - 2],
    ],
    { r, alpha: 0.4, width: 0.6, passes: 1 },
  );
  // A fringe along the lower edge.
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const x = lerp(-sh - 3.6, sh + 3.6, t);
    const y = shY + 16.5 + Math.sin(t * Math.PI) * 5.5 - Math.abs(t - 0.5) * 5;
    ink(
      ctx,
      [
        [x, y],
        [x + r.gauss() * 0.4, y + 2.6],
      ],
      v.color.dark,
      0.55,
      0.6,
    );
  }
}

// ------------------------------------------------------------------ neck

export function paintNeck(ctx, r, g, o, skin) {
  const { neckW, chinY, shY } = g;
  const open = o.top.insert ? 0 : (o.top.scoop ?? 3.4);
  const shape = smooth(
    [
      [-neckW, chinY - 5],
      [neckW, chinY - 5],
      [neckW + 0.2, shY - 2.6],
      [neckW + 2, shY - 1.2 + open * 0.2],
      [0, shY - 0.6 + open],
      [-neckW - 2, shY - 1.2 + open * 0.2],
      [-neckW - 0.2, shY - 2.6],
    ],
    3,
  );
  prime(ctx, shape);
  fill(ctx, r, shape, skin.base, { layers: 8, strength: 0.96 });
  pool(ctx, r, shape, skin.shade, [[0.8, chinY + 0.4 + (g.jaw ?? 0), neckW + 2, 2.6]], 0.6);
  for (const s of [-1, 1])
    pencil(
      ctx,
      [
        [s * neckW + 0.3, chinY - 1],
        [s * (neckW + 0.1) + 0.3, shY - 2.4],
      ],
      { r, alpha: 0.4, width: 0.6, passes: 1, wobble: 0.2 },
    );
}

/** Collars, scarves, pearls: whatever sits at the throat, under the chin. */
export function paintNeckwear(ctx, r, g, o) {
  const { neckW, shY } = g;
  const t = o.top;
  const collar = t.collar ?? (t.insert ? null : "round");
  if (collar === "round") {
    pencil(
      ctx,
      [
        [-neckW - 2.2, shY - 1.6],
        [0, shY + (t.scoop ?? 3.4) - 0.4],
        [neckW + 2.2, shY - 1.6],
      ],
      { r, alpha: 0.45, width: 0.65, passes: 1, wobble: 0.2 },
    );
  } else if (collar === "shirt" || collar === "peter") {
    const c = t.collarColor ?? (t.insert ? t.insert.color.base : lighten(t.color.base, 0.35));
    const round = collar === "peter";
    for (const s of [-1, 1]) {
      const flap = smooth(
        round
          ? [
              [s * 0.4, shY + 0.4],
              [s * (neckW + 0.4), shY - 2.8],
              [s * (neckW + 3.2), shY - 1],
              [s * (neckW + 2.8), shY + 1.8],
              [s * 1.8, shY + 2.6],
            ]
          : [
              [s * 0.3, shY + 0.8],
              [s * (neckW + 0.4), shY - 3.2],
              [s * (neckW + 3.4), shY - 1.4],
              [s * (neckW + 2.2), shY + 3.6],
              [s * (neckW + 1.4), shY + 4.2],
            ],
        3,
      );
      fill(ctx, r, flap, c, { layers: 7, strength: 0.96 });
      line(ctx, r, flap, { closed: true, alpha: 0.5, width: 0.6, passes: 1 });
    }
  }
  const n = o.neck;
  if (!n) return;
  if (n.kind === "scarf") {
    const wrap = smooth(
      [
        [-neckW - 3.2, shY - 4.6],
        [0, shY - 3],
        [neckW + 3.2, shY - 4.8],
        [neckW + 4.4, shY - 0.6],
        [0, shY + 2.6],
        [-neckW - 4.4, shY - 0.4],
      ],
      3,
    );
    const tail = ribbon(
      smooth(
        [
          [-2.6, shY - 0.5],
          [-4.2, shY + 6],
          [-3.4, shY + 13 * g.k],
        ],
        4,
        false,
      ),
      () => 5,
    );
    fill(ctx, r, tail, n.color.base, { layers: 8 });
    pool(ctx, r, tail, n.color.dark, [[-2, shY + 4, 2, 5]], 0.4);
    line(ctx, r, tail, { closed: true, alpha: 0.45, passes: 1 });
    for (const dx of [-1.8, 0, 1.8])
      ink(
        ctx,
        [
          [-3.4 + dx, shY + 13 * g.k],
          [-3.4 + dx * 1.2, shY + 13 * g.k + 2.2],
        ],
        n.color.dark,
        0.55,
        0.7,
      );
    fill(ctx, r, wrap, n.color.base, { layers: 9 });
    pool(ctx, r, wrap, n.color.dark, [[2, shY + 0.6, 6, 1.8]], 0.4);
    line(ctx, r, wrap, { closed: true, alpha: 0.5 });
    if (n.color.mark)
      within(ctx, wrap, () => {
        for (let x = -neckW - 3; x < neckW + 4; x += 3.2)
          ink(
            ctx,
            [
              [x, shY - 5.5],
              [x + 1.2, shY + 3],
            ],
            n.color.mark,
            0.9,
            0.6,
          );
      });
  } else if (n.kind === "pearls") {
    const path = smooth(
      [
        [-neckW - 1.6, shY - 2.8],
        [-neckW * 0.7, shY + 2.2],
        [0, shY + 3.8],
        [neckW * 0.7, shY + 2.2],
        [neckW + 1.6, shY - 2.8],
      ],
      5,
      false,
    );
    for (let i = 0; i <= 8; i++) {
      const [x, y] = along(path, i / 8);
      dab(ctx, x + 0.25, y + 0.3, 1.25, 1.25, "inkSoft", 0.5);
      dab(ctx, x, y, 1.15, 1.15, "white", 1);
      dab(ctx, x + 0.3, y + 0.35, 0.55, 0.55, "cloud", 0.9);
    }
  } else if (n.kind === "bowtie") {
    for (const s of [-1, 1]) {
      const wing = smooth(
        [
          [0, shY + 0.6],
          [s * 4.4, shY - 1.8],
          [s * 4.8, shY + 3.2],
        ],
        3,
      );
      fill(ctx, r, wing, n.color.base, { layers: 6 });
      line(ctx, r, wing, { closed: true, alpha: 0.5, width: 0.55, passes: 1 });
    }
    dab(ctx, 0, shY + 0.7, 1.2, 1.3, n.color.dark, 0.95);
  } else if (n.kind === "tie") {
    const tie = smooth(
      [
        [-1.3, shY - 0.4],
        [1.3, shY - 0.4],
        [1.8, shY + 9 * g.k],
        [0, shY + 11.5 * g.k],
        [-1.8, shY + 9 * g.k],
      ],
      3,
    );
    fill(ctx, r, tie, n.color.base, { layers: 6 });
    line(ctx, r, tie, { closed: true, alpha: 0.45, width: 0.55, passes: 1 });
  }
  if (n.brooch) {
    dab(ctx, -g.chest * 0.55 + 0.3, shY + 7.3, 1.9, 1.9, "inkSoft", 0.45);
    dab(ctx, -g.chest * 0.55, shY + 7, 1.8, 1.8, "gold", 1);
    dab(ctx, -g.chest * 0.55, shY + 7, 0.9, 0.9, n.brooch, 1);
  }
}

// ------------------------------------------------------------------ arms

/** Where the elbow and wrist go, as [out from the body's side, down]. */
const ARMS = {
  down: [
    [2, 12.6],
    [1.6, 24.6],
  ],
  down2: [
    [2.3, 12.2],
    [2.2, 24.2],
  ],
  wave: [
    [8.6, 3.4],
    [11, -12],
  ],
  hold: [
    [2.8, 12.6],
    [-9.4, 19.2],
  ],
  smoke: [
    [3, 12.6],
    [7, 19],
  ],
  basket: [
    [3.2, 12],
    [4.2, 21],
  ],
};

function armPath(g, side, how) {
  const [e, w] = ARMS[how];
  const sx = g.sh - 1.9;
  const sy = g.shY + 3;
  return {
    path: smooth(
      [
        [side * (sx - 0.8), sy - 1],
        [side * (sx + e[0] * g.k * 0.55), sy + e[1] * g.k * 0.5],
        [side * (sx + e[0] * g.k), sy + e[1] * g.k],
        [side * (sx + w[0] * g.k), sy + w[1] * g.k],
      ],
      5,
      false,
    ),
    hand: [side * (sx + w[0] * g.k), sy + w[1] * g.k],
  };
}

function arm(ctx, r, g, o, skin, side, how) {
  const { path, hand } = armPath(g, side, how);
  const t = o.top;
  const c = t.sleeveColor ?? t.color;
  const len = t.sleeves ?? 0.42;
  const a = g.arm;
  if (len < 0.85) {
    const bare = ribbon(part(path, len - 0.08, 1, 6), (u) => a * lerp(0.8, 0.68, u));
    prime(ctx, bare);
    fill(ctx, r, bare, skin.base, { layers: 7, strength: 0.96 });
    pool(ctx, r, bare, skin.shade, [[hand[0] + side, hand[1] - 5, 2, 5]], 0.3);
    line(ctx, r, bare, { closed: true, alpha: 0.4, passes: 1, gaps: 0.2 });
  }
  const sleeve = ribbon(part(path, 0, len, 8), (u) => a * lerp(1.02, len < 0.85 ? 0.96 : 0.84, u));
  fill(ctx, r, sleeve, c.base, { layers: 9 });
  pool(ctx, r, sleeve, c.dark, [[...along(path, len * 0.6), a * 0.5, a * 0.9]], 0.34);
  if (c.pattern === "stripes" || c.pattern === "checks")
    within(ctx, sleeve, () => {
      const step = c.pattern === "checks" ? 0.22 : 0.15;
      for (let u = 0.12; u < len; u += step) {
        const [x, y] = along(path, u);
        const [x2, y2] = along(path, u + 0.02);
        const nx = -(y2 - y);
        const ny = x2 - x;
        const k = a / (Math.hypot(nx, ny) || 1);
        const cross = [
          [x - nx * k, y - ny * k],
          [x + nx * k, y + ny * k],
        ];
        if (c.pattern === "checks")
          wash(
            ctx,
            ribbon(cross, () => 2.6),
            c.mark ?? c.dark,
            {
              r,
              layers: 4,
              strength: 0.42,
              soft: 0.08,
              edge: 0,
              glaze: true,
            },
          );
        else
          brush(ctx, cross, c.mark ?? c.dark, {
            r,
            width: () => 1.5,
            strength: 0.72,
            layers: 4,
            edge: 0,
          });
      }
    });
  line(ctx, r, sleeve, { closed: true, alpha: 0.46, gaps: 0.14 });
  return hand;
}

function hand(ctx, r, g, skin, [x, y], side, lift = 0) {
  const a = g.arm;
  const shape = ellipse(x, y + a * 0.22 - lift, a * 0.44, a * 0.5, 9, side * 0.15);
  prime(ctx, shape);
  fill(ctx, r, shape, skin.base, { layers: 7, strength: 0.97 });
  pool(ctx, r, shape, skin.shade, [[x + 0.8, y + a * 0.5 - lift, a * 0.4, a * 0.25]], 0.3);
  line(ctx, r, shape, { closed: true, alpha: 0.45, width: 0.6, passes: 1 });
}

function jar(ctx, r, x, y, k = 1) {
  const w = 11.5 * k;
  const h = 11.5 * k;
  const glass = roundRect(x - w / 2, y - h / 2, w, h, 2.6 * k);
  prime(ctx, glass);
  fill(ctx, r, glass, "honey", { layers: 9, strength: 0.94, soft: 0.05 });
  pool(ctx, r, glass, "amber", [[x + w * 0.3, y + 1, w * 0.22, h * 0.5]], 0.4);
  pool(ctx, r, glass, "butter", [[x - w * 0.3, y, w * 0.12, h * 0.36]], 0.6);
  line(ctx, r, glass, { closed: true, alpha: 0.5, width: 0.6 });
  const cap = smooth(
    [
      [x - w / 2 - 1.2, y - h / 2 + 1.6],
      [x - w * 0.4, y - h / 2 - 2],
      [x, y - h / 2 - 2.8],
      [x + w * 0.4, y - h / 2 - 2],
      [x + w / 2 + 1.2, y - h / 2 + 1.6],
      [x, y - h / 2 + 2],
    ],
    3,
  );
  fill(ctx, r, cap, "sky", { layers: 7, soft: 0.1 });
  line(ctx, r, cap, { closed: true, alpha: 0.45, width: 0.55, passes: 1 });
  const label = roundRect(x - w * 0.27, y - h * 0.16, w * 0.54, h * 0.44, 1);
  fill(ctx, r, label, "white", { layers: 5, strength: 0.95, soft: 0.04, edge: 0.3 });
}

function smoker(ctx, r, x, y) {
  // The bellows, on the keeper's side of the can: a leather wedge between
  // two boards, which the hand squeezes.
  const bellows = smooth(
    [
      [x - 2.8, y - 12],
      [x - 10.4, y - 11],
      [x - 8, y - 0.4],
      [x - 2.8, y - 1.2],
    ],
    3,
  );
  fill(ctx, r, bellows, "terracotta", { layers: 7 });
  pool(ctx, r, bellows, "chestnut", [[x - 7.6, y - 4, 2, 5]], 0.5);
  for (const t of [0.3, 0.55, 0.8])
    ink(
      ctx,
      [
        [x - 3, y - 12 + 10.6 * t],
        [x - 10.2 + 2.2 * t, y - 11 + 10.4 * t],
      ],
      "chestnut",
      0.5,
      0.6,
    );
  ink(
    ctx,
    [
      [x - 10.6, y - 11.4],
      [x - 8.2, y - 0.2],
    ],
    "bark",
    1.5,
    0.95,
  );
  line(ctx, r, bellows, { closed: true, alpha: 0.5, width: 0.6, passes: 1 });
  const can = roundRect(x - 3.4, y - 12.6, 8.4, 12.6, 1.6);
  fill(ctx, r, can, "stone", { layers: 8, soft: 0.05 });
  pool(ctx, r, can, "dusk", [[x + 3.4, y - 6, 1.7, 6]], 0.5);
  pool(ctx, r, can, "white", [[x - 1.5, y - 7, 1, 4.6]], 0.6);
  line(ctx, r, can, { closed: true, alpha: 0.55, width: 0.6 });
  // The lid: a cone that leans away, with the nozzle at its tip.
  const spout = smooth(
    [
      [x - 3.8, y - 12],
      [x - 2.6, y - 16.4],
      [x + 3.4, y - 21],
      [x + 8, y - 22.4],
      [x + 7.8, y - 19.6],
      [x + 5.4, y - 12],
    ],
    3,
  );
  fill(ctx, r, spout, "stone", { layers: 7, soft: 0.05 });
  pool(ctx, r, spout, "dusk", [[x + 4.6, y - 15.6, 2.6, 3.4]], 0.5);
  pool(ctx, r, spout, "white", [[x - 0.4, y - 16, 1.4, 2.4, 0.6]], 0.5);
  line(ctx, r, spout, { closed: true, alpha: 0.55, width: 0.6 });
  ink(
    ctx,
    [
      [x - 3.6, y - 12.2],
      [x + 5.2, y - 12.2],
    ],
    "tweedDeep",
    0.7,
    0.7,
  );
  // A wisp of cool smoke, thinning as it climbs.
  const smoke = mix("cloud", "shadow", 0.22);
  const puffs = [
    [x + 10, y - 25, 2.6, 0.7],
    [x + 12.2, y - 30, 3.6, 0.6],
    [x + 10.4, y - 36, 4.4, 0.46],
    [x + 13.2, y - 42, 4.2, 0.34],
    [x + 11, y - 47.4, 3.2, 0.22],
  ];
  for (const [px, py, pr, strength] of puffs)
    wash(ctx, blob(r, px, py, pr, 0.16, 9), smoke, {
      r,
      layers: 8,
      strength,
      soft: 0.4,
      edge: 0.25,
    });
  pencil(
    ctx,
    [
      [x + 8.6, y - 23],
      [x + 11.8, y - 27],
      [x + 9.6, y - 32.4],
      [x + 13.4, y - 37.4],
      [x + 10.4, y - 43.8],
    ],
    { r, color: "inkSoft", alpha: 0.3, width: 0.55, passes: 1, wobble: 0.4 },
  );
}

function basket(ctx, r, x, y, k) {
  const w = 9.5 * k;
  const h = 8 * k;
  // The handle first, so the hand sits on it.
  pencil(
    ctx,
    [
      [x - w * 0.8, y + 1.5],
      [x - w * 0.5, y - h * 0.9],
      [x + w * 0.4, y - h * 0.95],
      [x + w * 0.8, y + 1.5],
    ],
    { r, color: "bark", alpha: 0.8, width: 1.3, wobble: 0.2 },
  );
  // Something in it: a cloth and a loaf.
  fill(ctx, r, ellipse(x - 1.5, y + 0.8, w * 0.55, 3, 8), "white", { layers: 6, soft: 0.12 });
  fill(ctx, r, ellipse(x + 3, y + 0.4, 3.2, 2.4, 8, -0.3), "wood", { layers: 6, soft: 0.12 });
  const body = smooth(
    [
      [x - w, y + 1],
      [x, y + 2.4],
      [x + w, y + 1],
      [x + w * 0.78, y + h],
      [x, y + h + 1.2],
      [x - w * 0.78, y + h],
    ],
    3,
  );
  fill(ctx, r, body, "straw", { layers: 9 });
  pool(ctx, r, body, "wood", [[x + w * 0.5, y + h * 0.6, w * 0.4, h * 0.5]], 0.5);
  line(ctx, r, body, { closed: true, alpha: 0.55, width: 0.65 });
  for (let i = 1; i < 3; i++)
    pencil(
      ctx,
      [
        [x - w * (1 - i * 0.07), y + 1 + i * 2.6 * k],
        [x, y + 2.6 + i * 2.6 * k],
        [x + w * (1 - i * 0.07), y + 1 + i * 2.6 * k],
      ],
      { r, alpha: 0.4, width: 0.55, passes: 1, gaps: 0.2 },
    );
}

/** Which arm pose each side takes: [left of the picture, right of the picture]. */
const POSE_ARMS = {
  stand: ["down", "down2"],
  bust: ["down", "down2"],
  wave: ["down", "wave"],
  carry: ["hold", "hold"],
  smoker: ["down", "smoke"],
};

/**
 * Arms and whatever they hold. `layer` is "back" for arms that hang beside
 * the body (painted before the head, so long hair falls over them) and
 * "front" for arms that reach forward or up.
 */
export function paintArms(ctx, r, g, o, skin, pose, layer) {
  const hows = [...(POSE_ARMS[pose] ?? POSE_ARMS.stand)];
  if (o.basket && pose === "stand") hows[0] = "basket";
  [-1, 1].forEach((side, i) => {
    const how = hows[i];
    const front = how !== "down" && how !== "down2";
    if (front !== (layer === "front")) return;
    if (how === "hold" && side === 1) return; // both painted on the first pass
    if (how === "hold") {
      const hl = arm(ctx, r, g, o, skin, -1, how);
      const hr = arm(ctx, r, g, o, skin, 1, how);
      jar(ctx, r, 0, hl[1] - 6.6 * g.k, g.k * 1.3);
      hand(ctx, r, g, skin, [hl[0] + 0.6, hl[1]], -1, 1.5);
      hand(ctx, r, g, skin, [hr[0] - 0.6, hr[1]], 1, 1.5);
      return;
    }
    if (how === "basket") {
      const { hand: at } = armPath(g, side, how);
      basket(ctx, r, at[0] + side * 1.5, at[1] + 3 * g.k, g.k);
    }
    const at = arm(ctx, r, g, o, skin, side, how);
    if (how === "smoke") smoker(ctx, r, at[0] + side * 8, at[1] + 6.4);
    if (how === "wave") {
      const a = g.arm;
      const px = at[0] + 0.6;
      const py = at[1] - a * 0.36;
      // An open hand: a thumb towards the head, then the palm.
      const thumb = ellipse(px - a * 0.5, py + a * 0.16, a * 0.17, a * 0.32, 7, -0.7);
      prime(ctx, thumb);
      fill(ctx, r, thumb, skin.base, { layers: 5, strength: 0.97 });
      line(ctx, r, thumb, { closed: true, alpha: 0.4, width: 0.55, passes: 1 });
      const palm = ellipse(px, py, a * 0.5, a * 0.62, 10, 0.2);
      prime(ctx, palm);
      fill(ctx, r, palm, skin.base, { layers: 7, strength: 0.97 });
      pool(ctx, r, palm, skin.shade, [[px + 0.6, py + a * 0.4, a * 0.4, a * 0.2]], 0.3);
      line(ctx, r, palm, { closed: true, alpha: 0.45, width: 0.6, passes: 1 });
      for (const dx of [-0.16, 0.08, 0.3])
        ink(
          ctx,
          [
            [px + a * dx + 0.5, py - a * 0.56],
            [px + a * dx + 0.2, py - a * 0.2],
          ],
          skin.line,
          0.5,
          0.45,
        );
      for (const [dx, dy] of [
        [5.8, -5],
        [7, -0.8],
      ])
        pencil(
          ctx,
          [
            [at[0] + dx, at[1] + dy],
            [at[0] + dx + 2.2, at[1] + dy - 1.4],
          ],
          { r, color: "inkSoft", alpha: 0.45, width: 0.6, passes: 1 },
        );
    } else hand(ctx, r, g, skin, at, side);
  });
}
