// A small seeded generator for the paint engine, so a painted piece looks
// the same on every phone and in every screenshot. Not the game's rng: the
// rules draw from core/rng.js and never from here.

/** A stable 32-bit hash of a string (FNV-1a). */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * rng("lavender-bloom-2") → r, where r() is 0..1 and the helpers hang off it.
 * @param {string | number} seed
 */
export function rng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hash(seed);
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** a..b */
  r.range = (a, b) => a + (b - a) * r();
  /** whole number a..b inclusive */
  r.int = (a, b) => Math.floor(r.range(a, b + 1));
  /** roughly normal, mean 0, sd 1 */
  r.gauss = () => (r() + r() + r() + r() - 2) * 1.2247;
  /** one of the list */
  r.pick = (list) => list[Math.floor(r() * list.length)];
  /** true with probability p */
  r.chance = (p) => r() < p;
  /** a fresh generator that does not disturb this one's sequence much */
  r.fork = (tag) => rng(hash(String(tag)) ^ Math.floor(r() * 4294967296));
  return r;
}
