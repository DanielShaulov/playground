// What every part of a person shares: the colour tables behind the look ids,
// and a few small tools for marks too fine for a wash (an eye, a smile).
//
// A person is drawn in two spaces. Figure space has its origin on the ground
// between the feet, y going up as negative numbers. Head space has its origin
// in the middle of the head, which is always an egg HEAD_RX by HEAD_RY, so
// hair and hats never need to know whose head they are on.

import { wash, pencil, smooth, ellipse, within } from "../../paint/wash.js";
import { rgba, mix } from "../../paint/palette.js";

export const HEAD_RX = 15.5;
export const HEAD_RY = 16.5;
const TAU = Math.PI * 2;

const skin = (n, cheek, line) => ({
  base: `skin${n}`,
  shade: `skin${n}Shade`,
  cheek,
  /** the warm dark for a smile and the hint of a nose */
  line,
});

export const SKINS = {
  s1: skin(1, "cheekRose", mix("poppy", "umber", 0.5)),
  s2: skin(2, "cheekRose", mix("poppy", "umber", 0.52)),
  s3: skin(3, "cheekCoral", mix("poppy", "umber", 0.6)),
  s4: skin(4, "cheekCoral", mix("chestnut", "umber", 0.55)),
  s5: skin(5, "cheekBerry", mix("chestnut", "coal", 0.6)),
  s6: skin(6, "cheekBerry", mix("skin6Shade", "eye", 0.7)),
};

const hair = (name) => ({
  base: `hair${name}`,
  dark: `hair${name}Deep`,
  light: `hair${name}Light`,
});

export const HAIRS = {
  h1: hair("Black"),
  h2: hair("Espresso"),
  h3: hair("Chestnut"),
  h4: hair("Auburn"),
  h5: hair("Copper"),
  h6: hair("Honey"),
  h7: hair("Silver"),
  h8: hair("Lilac"),
};

/** A cloth: the wash and the colour that gathers in its folds. */
export const cloth = (base, dark) => ({ base, dark });

export const OVERALLS = {
  o1: cloth("denim", "denimDeep"),
  o2: cloth("sage", "sageDeep"),
  o3: cloth("mustard", "mustardDeep"),
  o4: cloth("dustyRose", "dustyRoseDeep"),
  o5: cloth("lavender", "lavenderDeep"),
  o6: cloth("cream", "creamDeep"),
};

export const SHIRTS = {
  t1: cloth("white", "cloud"),
  t2: cloth("butter", "butterDeep"),
  t3: cloth("sky", "skyDeep"),
  t4: cloth("blush", "blushDeep"),
  t5: cloth("mintPale", "mintDeep"),
  t6: { ...cloth("white", "cloud"), pattern: "stripes", mark: "denimDeep" },
};

export const HATS = [
  "none",
  "straw",
  "veil",
  "flower-crown",
  "beret",
  "knit",
  "bow",
  "cap",
  "golden-veil",
  "rosette",
];

export const HAIR_STYLES = {
  woman: ["long-waves", "braid", "bun", "curls", "bob"],
  man: ["tousled", "curly", "side-part", "long-tied", "cropped"],
};

// ----------------------------------------------------------------- marks

/** A crisp little spot: an eye, a button, a pearl. */
export function dab(ctx, x, y, rx, ry = rx, color = "eye", alpha = 1, rot = 0) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

/** One clean stroke through a few points: a lash, a smile, a brow. */
export function ink(ctx, pts, color, width = 0.8, alpha = 1) {
  const line = pts.length > 2 ? smooth(pts, 5, false) : pts;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(line[0][0], line[0][1]);
  for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Paper under a shape. Washes are never quite solid, and a face painted
 * straight onto the meadow would let the green through.
 */
export function prime(ctx, pts, alpha = 0.97) {
  ctx.fillStyle = rgba("paper", alpha);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** The loose sepia outline, a little out of register with its wash. */
export function line(ctx, r, pts, o = {}) {
  const dx = o.dx ?? 0.35;
  const dy = o.dy ?? 0.25;
  pencil(
    ctx,
    pts.map(([x, y]) => [x + dx, y + dy]),
    { r, alpha: 0.5, width: 0.7, wobble: 0.3, gaps: 0.1, ...o },
  );
}

/** A flat-ish wash of cloth or skin: crisp edge, even pigment. */
export function fill(ctx, r, pts, color, o = {}) {
  wash(ctx, pts, color, { r, layers: 10, strength: 0.95, soft: 0.07, edge: 0.6, ...o });
}

/** Soft pools of a second colour inside a shape: `spots` are [x, y, rx, ry]. */
export function pool(ctx, r, shape, color, spots, strength = 0.4) {
  within(ctx, shape, () => {
    for (const [x, y, rx, ry = rx, rot = 0] of spots)
      wash(ctx, ellipse(x, y, rx, ry, 8, rot), color, {
        r,
        layers: 5,
        strength,
        soft: 0.5,
        edge: 0,
      });
  });
}

export const lerp = (a, b, t) => a + (b - a) * t;

/** A point `t` of the way along a polyline. */
export function along(path, t) {
  const f = Math.max(0, Math.min(1, t)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const k = f - i;
  return [lerp(path[i][0], path[i + 1][0], k), lerp(path[i][1], path[i + 1][1], k)];
}

/** The first `t` of a polyline. */
export function part(path, t0, t1, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(along(path, lerp(t0, t1, i / n)));
  return out;
}
