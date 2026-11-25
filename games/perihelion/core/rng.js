/**
 * Deterministic PRNG (Mulberry32) and daily seed helpers.
 * Pure module: no DOM or global state.
 */

export function createRng(seed = 1) {
  let state = seed >>> 0 || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    getState() {
      return state >>> 0;
    },
  };
}

export function dailySeedInfo(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const label = `${y}-${m}-${d}`;
  // Mix date digits cleanly into a 32-bit seed
  const base = Number(`${y}${m}${d}`);
  const seed = (Math.imul(base, 2654435761) ^ 0x5bf03635) >>> 0;
  return { seed, label };
}

export function randomSeed() {
  return ((Math.random() * 0xffffffff) >>> 0) ^ (Date.now() >>> 0);
}
