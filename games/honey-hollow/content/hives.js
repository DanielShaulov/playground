// @ts-check
/**
 * The four hives, smallest first. A hive holds `jars` × 10 units of stores
 * and its colony grows to `limit` strength. `cost` is the price of upgrading
 * to it from the one before (a skep is bought with its colony; see tuning).
 */

/** @typedef {{ id: string, name: string, jars: number, limit: number, cost: number, next: string | null, blurb: string }} HiveType */

/** @type {Record<string, HiveType>} */
export const HIVES = {
  skep: {
    id: "skep",
    name: "Straw skep",
    jars: 6,
    limit: 4,
    cost: 0,
    next: "box",
    blurb: "A straw basket. Small, snug and soon full.",
  },
  box: {
    id: "box",
    name: "Box hive",
    jars: 10,
    limit: 6,
    cost: 60,
    next: "double",
    blurb: "A proper wooden hive with frames that lift out.",
  },
  double: {
    id: "double",
    name: "Double box",
    jars: 16,
    limit: 8,
    cost: 120,
    next: "stack",
    blurb: "2 boxes high, with room for a big family.",
  },
  stack: {
    id: "stack",
    name: "Tall stack",
    jars: 24,
    limit: 10,
    cost: 240,
    next: null,
    blurb: "As tall as you are. The strongest colonies live here.",
  },
};

export const HIVE_IDS = Object.keys(HIVES);
