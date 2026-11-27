// @ts-check
/**
 * Small shared pieces: rounding, cloning, the purse. No rules live here.
 */

/** @typedef {import("./types.js").State} State */

/**
 * Round to a thousandth. Every amount of nectar is written through this, so
 * stores are always clean multiples of 0.001 and sums never drift.
 */
export const r3 = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;

/** A deep copy of plain JSON data. Faster than structuredClone for a state this size. */
export function clone(/** @type {any} */ v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = clone(v[i]);
    return a;
  }
  /** @type {Record<string, any>} */
  const o = {};
  for (const k in v) o[k] = clone(v[k]);
  return o;
}

export const isObj = (/** @type {any} */ x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);

/** True for a whole number in [lo, hi]. */
export const isInt = (/** @type {any} */ x, lo = -Infinity, hi = Infinity) =>
  Number.isInteger(x) && x >= lo && x <= hi;

/** Take coins out of the purse. The caller has checked there are enough. */
export function spend(/** @type {State} */ s, /** @type {number} */ coins) {
  s.purse.coins -= coins;
  s.purse.today.spent += coins;
}

/** Put coins in the purse. */
export function earn(/** @type {State} */ s, /** @type {number} */ coins) {
  s.purse.coins += coins;
  s.purse.today.earned += coins;
}

/** Add `n` to a counter in a plain object, creating it at 0. */
export function bump(/** @type {Record<string, number>} */ o, /** @type {string} */ key, n = 1) {
  o[key] = (o[key] ?? 0) + n;
}

/** Take `n` from a counter, deleting it when it reaches 0. */
export function drop(/** @type {Record<string, number>} */ o, /** @type {string} */ key, n = 1) {
  const left = (o[key] ?? 0) - n;
  if (left > 0) o[key] = left;
  else delete o[key];
}
