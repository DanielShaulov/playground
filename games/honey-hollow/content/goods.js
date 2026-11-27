// @ts-check
/**
 * What the workshop makes. GOODS are what sit on the shelf (product ids are
 * `good:<id>`); RECIPES are how they are made.
 *
 * A good's `family` is what a customer can wish for ("a candle", "some
 * soap"); `season` is how its price moves with the time of year.
 *
 * A recipe needs `wax`, and may need: `bunch` (one bunch of any flower
 * listed), `honey` ("any" jar, or a "pure" one), `candle` (any candle) and
 * `soap` (any soap). `makes` is the good; the soap recipe makes
 * `soap-<bunch>`, and the remedy recipe makes the item `remedy`, which is
 * used on a hive and never sold. `unlock` says when the recipe is learned.
 */

/** @typedef {{ id: string, name: string, family: string, price: number, season?: Record<string, number>, blurb: string }} Good */
/**
 * @typedef {{
 *   id: string, name: string, makes: string, wax: number, bunch?: string[], honey?: "any" | "pure",
 *   candle?: boolean, soap?: boolean, unlock: { start?: boolean, tier?: number, goal?: string, plot?: string },
 *   blurb: string
 * }} Recipe
 */

/** @type {Record<string, Good>} */
export const GOODS = {
  candle: {
    id: "candle",
    name: "Beeswax candle",
    family: "candle",
    price: 14,
    season: { autumn: 1.15, winter: 1.4 },
    blurb: "Burns slow and smells faintly of honey.",
  },
  "lavender-candle": {
    id: "lavender-candle",
    name: "Lavender candle",
    family: "candle",
    price: 24,
    season: { autumn: 1.15, winter: 1.4 },
    blurb: "Beeswax with a sprig of lavender pressed in.",
  },
  "soap-lavender": {
    id: "soap-lavender",
    name: "Lavender soap",
    family: "soap",
    price: 18,
    blurb: "A soft bar that smells of summer.",
  },
  "soap-mint": {
    id: "soap-mint",
    name: "Mint soap",
    family: "soap",
    price: 18,
    blurb: "Cool and fresh, for muddy hands.",
  },
  "soap-thyme": {
    id: "soap-thyme",
    name: "Thyme soap",
    family: "soap",
    price: 18,
    blurb: "A kitchen soap with a clean herb scent.",
  },
  balm: {
    id: "balm",
    name: "Honey lip balm",
    family: "balm",
    price: 20,
    season: { winter: 1.3 },
    blurb: "Beeswax and honey in a little tin, for cold days.",
  },
  wraps: {
    id: "wraps",
    name: "Wax wraps",
    family: "wraps",
    price: 22,
    blurb: "Waxed cloth to wrap the bread and cheese.",
  },
  basket: {
    id: "basket",
    name: "Gift basket",
    family: "basket",
    price: 75,
    blurb: "Honey, a candle and a bar of soap, tied with a bow.",
  },
};

/** @type {Record<string, Recipe>} */
export const RECIPES = {
  candle: {
    id: "candle",
    name: "Beeswax candle",
    makes: "candle",
    wax: 2,
    unlock: { start: true },
    blurb: "Melt, pour, wait.",
  },
  "lavender-candle": {
    id: "lavender-candle",
    name: "Lavender candle",
    makes: "lavender-candle",
    wax: 2,
    bunch: ["lavender"],
    unlock: { goal: "first-candle" },
    blurb: "A candle with a bunch of lavender in it.",
  },
  soap: {
    id: "soap",
    name: "Flower soap",
    makes: "soap-*",
    wax: 1,
    bunch: ["lavender", "mint", "thyme"],
    unlock: { goal: "first-bunch" },
    blurb: "1 bunch makes 1 bar. The bunch decides the soap.",
  },
  balm: {
    id: "balm",
    name: "Honey lip balm",
    makes: "balm",
    wax: 1,
    honey: "any",
    unlock: { tier: 2 },
    blurb: "Any honey will do, even a bitter one.",
  },
  wraps: {
    id: "wraps",
    name: "Wax wraps",
    makes: "wraps",
    wax: 3,
    unlock: { tier: 2 },
    blurb: "Plenty of beeswax, brushed into cloth.",
  },
  remedy: {
    id: "remedy",
    name: "Thyme remedy",
    makes: "remedy",
    wax: 0,
    bunch: ["thyme"],
    unlock: { plot: "hill" },
    blurb: "The scented oil of thyme. Mites cannot stand it.",
  },
  basket: {
    id: "basket",
    name: "Gift basket",
    makes: "basket",
    wax: 0,
    honey: "pure",
    candle: true,
    soap: true,
    unlock: { tier: 3 },
    blurb: "A pure honey, a candle and a soap, made into a present.",
  },
};

export const GOOD_IDS = Object.keys(GOODS);
export const RECIPE_IDS = Object.keys(RECIPES);
export const FAMILIES = [...new Set(GOOD_IDS.map((id) => GOODS[id].family))];
