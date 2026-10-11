// @ts-check
/**
 * Named random streams. Each system draws from its own stream ("customers",
 * later "market", "jars"...), so a feature that adds draws to one stream never
 * reshuffles another. A stream's position lives in state.meta.rng[name] and is
 * created from the game seed the first time it is used. Never use Math.random.
 */

/** @typedef {import("./types.js").State} State */

/** FNV-1a of the name, mixed with the seed: a stable start for each stream. */
export function streamSeed(seed, name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return (h ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
}

/** Next number in [0, 1) from stream `name` (mulberry32). */
export function random(/** @type {State} */ s, /** @type {string} */ name) {
  const rng = s.meta.rng;
  if (!(name in rng)) rng[name] = streamSeed(s.meta.seed, name);
  rng[name] = (rng[name] + 0x6d2b79f5) | 0;
  let t = rng[name];
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const between = (s, name, a, b) => a + random(s, name) * (b - a);
export const pick = (s, name, list) => list[Math.floor(random(s, name) * list.length)];
