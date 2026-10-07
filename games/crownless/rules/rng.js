/**
 * Seeded randomness. Rules never call Math.random: every roll comes from a
 * mulberry32 stream whose whole state is one integer, so it can sit in a save
 * and a battle replays identically from its seed (tech.md §3).
 */

/**
 * Advance the stream held in `o.rng` and return a number in [0, 1).
 * Start a stream with `o.rng = seed >>> 0`.
 */
export function roll(o) {
  o.rng = (o.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(o.rng ^ (o.rng >>> 15), 1 | o.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A closure over a fresh stream, for code that has no state to keep it in. */
export function makeRng(seed) {
  const o = { rng: seed >>> 0 };
  return () => roll(o);
}

/** A child seed: the same parent and index always give the same child. */
export function derive(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** An integer in [lo, hi]. */
export const rollInt = (o, lo, hi) => lo + Math.floor(roll(o) * (hi - lo + 1));

/** One item of a list. */
export const pick = (o, list) => list[Math.floor(roll(o) * list.length)];
