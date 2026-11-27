// @ts-check
/**
 * The eleven flowers. Each one is also a honey (content/honeys.js, same id).
 *
 * where:  "any" (grass or hill), "hill" (hill ground only), "water" (a square
 *         beside water), "tree" (the orchard's own trees; never planted).
 * from/to: first and last day of the year it blooms (0–27, both included).
 * nectar: units one blooming bed offers each day.
 * seed:   price of a bed, or null when it cannot be planted.
 * unlock: when the seed reaches the shop: { start } | { tier } | { plot }.
 * bunch:  true when a blooming bed can be picked for the workshop.
 */

/**
 * @typedef {{
 *   id: string, name: string, where: "any" | "hill" | "water" | "tree",
 *   from: number, to: number, nectar: number, seed: number | null,
 *   unlock: { start?: boolean, tier?: number, plot?: string }, bunch?: boolean, blurb: string
 * }} Flower
 */

/** @type {Record<string, Flower>} */
export const FLOWERS = {
  dandelion: {
    id: "dandelion",
    name: "Dandelion",
    where: "any",
    from: 0,
    to: 3,
    nectar: 4,
    seed: 2,
    unlock: { start: true },
    blurb: "First out in spring, and the bees are glad of it.",
  },
  apple: {
    id: "apple",
    name: "Apple blossom",
    where: "tree",
    from: 1,
    to: 4,
    nectar: 8,
    seed: null,
    unlock: { plot: "orchard" },
    blurb: "A few short days of pink and white on the old trees.",
  },
  clover: {
    id: "clover",
    name: "Clover",
    where: "any",
    from: 4,
    to: 10,
    nectar: 5,
    seed: 4,
    unlock: { start: true },
    blurb: "Low, steady and generous from late spring into summer.",
  },
  borage: {
    id: "borage",
    name: "Borage",
    where: "any",
    from: 5,
    to: 15,
    nectar: 6,
    seed: 8,
    unlock: { tier: 1 },
    blurb: "Blue stars that refill with nectar all summer long.",
  },
  lavender: {
    id: "lavender",
    name: "Lavender",
    where: "any",
    from: 7,
    to: 12,
    nectar: 5,
    seed: 6,
    unlock: { start: true },
    bunch: true,
    blurb: "High summer in a bed. Pick a bunch for the workshop.",
  },
  thyme: {
    id: "thyme",
    name: "Wild thyme",
    where: "hill",
    from: 8,
    to: 13,
    nectar: 4,
    seed: 9,
    unlock: { plot: "hill" },
    bunch: true,
    blurb: "Creeps over the hill ground. Strong honey, and a remedy too.",
  },
  mint: {
    id: "mint",
    name: "Water mint",
    where: "water",
    from: 9,
    to: 15,
    nectar: 5,
    seed: 7,
    unlock: { plot: "pond" },
    bunch: true,
    blurb: "Only happy with wet feet, right at the water’s edge.",
  },
  sunflower: {
    id: "sunflower",
    name: "Sunflower",
    where: "any",
    from: 10,
    to: 16,
    nectar: 6,
    seed: 6,
    unlock: { tier: 1 },
    blurb: "Tall and bright from late summer into autumn.",
  },
  buckwheat: {
    id: "buckwheat",
    name: "Buckwheat",
    where: "any",
    from: 12,
    to: 17,
    nectar: 6,
    seed: 6,
    unlock: { tier: 2 },
    blurb: "Small white flowers and the darkest honey in the Hollow.",
  },
  heather: {
    id: "heather",
    name: "Heather",
    where: "hill",
    from: 14,
    to: 19,
    nectar: 5,
    seed: 12,
    unlock: { plot: "hill" },
    blurb: "Turns the hill purple in autumn. The prize of the year.",
  },
  ivy: {
    id: "ivy",
    name: "Ivy",
    where: "any",
    from: 16,
    to: 20,
    nectar: 5,
    seed: 5,
    unlock: { tier: 2 },
    blurb: "The last flower of the year. Plant it to fill the hives for winter.",
  },
};

export const FLOWER_IDS = Object.keys(FLOWERS);
/** Flowers whose blooming beds can be picked once a year. */
export const BUNCHES = FLOWER_IDS.filter((id) => FLOWERS[id].bunch);
