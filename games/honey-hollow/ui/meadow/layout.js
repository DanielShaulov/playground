// @ts-check
/**
 * Where the 6 × 6 grid sits inside the meadow's canvas. Nothing here is
 * stored in the game: it is worked out again from the canvas size whenever
 * that changes, so a resize or a rotation cannot break anything.
 */

export const N = 6;
/** The ground picture's ragged border, as a share of its width. */
export const PAD = 0.036;
/** How far down its square a thing's feet stand. */
export const FEET = 0.86;
/** How far a tall bed in the top row pokes above its square, in squares. */
const OVER = 0.45;

/**
 * @typedef {object} Geo
 * @property {number} W   canvas width, CSS px
 * @property {number} H   canvas height, CSS px
 * @property {number} G   the ground picture's side
 * @property {number} gx  its left
 * @property {number} gy  its top
 * @property {number} pad its border
 * @property {number} tile one square
 * @property {number} k   the scale sprites are drawn at (tile / 64)
 * @property {number} x0  left of square (0, 0)
 * @property {number} y0  top of square (0, 0)
 */

/** @returns {Geo} */
export const blank = () => ({
  W: 0,
  H: 0,
  G: 0,
  gx: 0,
  gy: 0,
  pad: 0,
  tile: 1,
  k: 1,
  x0: 0,
  y0: 0,
});

/**
 * Fit the ground into a stage of w × h CSS px. The canvas itself is taller:
 * it starts `top` px above the stage and ends `bottom` px below it, so tall
 * things and the weather have somewhere to run out softly.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} top
 * @param {number} bottom
 * @param {Geo} out
 */
export function layOut(w, h, top, bottom, out) {
  const per = (1 - 2 * PAD) / N;
  const head = Math.max(0, OVER * per - PAD);
  const G = Math.max(120, Math.floor(Math.min(w, 560, (h - 2) / (1 + head))));
  const spare = Math.max(0, h - 2 - G * (1 + head));
  out.W = w;
  out.H = h + top + bottom;
  out.G = G;
  out.pad = G * PAD;
  out.tile = G * per;
  out.k = out.tile / 64;
  out.gx = Math.round((w - G) / 2);
  out.gy = Math.round(top + G * head + spare * 0.4);
  out.x0 = out.gx + out.pad;
  out.y0 = out.gy + out.pad;
  return out;
}
