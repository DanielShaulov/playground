// @ts-check
/**
 * Named random streams. Each system draws from its own stream ("weather",
 * "customers", "wishes", "market", "wasps"), so a feature that adds draws to
 * one never reshuffles another. A stream's position lives in
 * state.meta.rng[name] and is created from the game seed the first time it is
 * used. Never use Math.random.
 */

/** @typedef {import("./types.js").State} State */

/** FNV-1a of the name, mixed with the seed: a stable start for each stream. */
export function streamSeed(/** @type {number} */ seed, /** @type {string} */ name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return (h ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
}

/** Next number in [0, 1) from stream `name` (mulberry32). */
export function random(/** @type {State} */ s, /** @type {string} */ name) {
  const rng = s.meta.rng;
  if (!Object.hasOwn(rng, name)) rng[name] = streamSeed(s.meta.seed, name);
  rng[name] = (rng[name] + 0x6d2b79f5) | 0;
  let t = rng[name];
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number in [0, n). */
export const below = (
  /** @type {State} */ s,
  /** @type {string} */ name,
  /** @type {number} */ n,
) => Math.floor(random(s, name) * n);

/** One item of a list. */
export const pick = (
  /** @type {State} */ s,
  /** @type {string} */ name,
  /** @type {any[]} */ list,
) => list[below(s, name, list.length)];

/**
 * One key of `weights` ({ key: weight }), each as likely as its weight.
 * Keys are taken in the order they were written, so the table's order matters.
 * @returns {string}
 */
export function weighted(
  /** @type {State} */ s,
  /** @type {string} */ name,
  /** @type {Record<string, number>} */ weights,
) {
  const keys = Object.keys(weights);
  let total = 0;
  for (const k of keys) total += weights[k];
  let x = random(s, name) * total;
  for (const k of keys) {
    x -= weights[k];
    if (x < 0) return k;
  }
  return keys[keys.length - 1];
}
