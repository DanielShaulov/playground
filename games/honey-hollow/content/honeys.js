// @ts-check
/**
 * The honeys: one for each flower (same id), and the meadow blend that a
 * mixed hive gives. Product ids are `honey:<id>:<stars>`; the blend is
 * `honey:blend:0`.
 *
 * traits: what a customer can wish for. One colour (light, amber, dark) and
 *         one or two tastes (mild, floral, fruity, herbal, strong).
 * colour: the look of the jar, for the painters.
 * price:  base price of a one-star jar.
 */

/** @typedef {{ id: string, name: string, colour: string, traits: string[], price: number, blurb: string }} Honey */

export const TRAITS = ["light", "amber", "dark", "mild", "floral", "fruity", "herbal", "strong"];

/** How a wish for a trait is worded on its own ("something dark"). */
export const TRAIT_NAMES = {
  light: "light",
  amber: "amber",
  dark: "dark",
  mild: "mild",
  floral: "floral",
  fruity: "fruity",
  herbal: "herbal",
  strong: "strong",
};

/** @type {Record<string, Honey>} */
export const HONEYS = {
  dandelion: {
    id: "dandelion",
    name: "Dandelion honey",
    colour: "bright yellow",
    traits: ["amber", "strong"],
    price: 9,
    blurb: "Bright as the flower and bolder than you expect.",
  },
  apple: {
    id: "apple",
    name: "Apple blossom honey",
    colour: "pale straw",
    traits: ["light", "fruity"],
    price: 16,
    blurb: "Light and delicate, with a breath of fruit.",
  },
  clover: {
    id: "clover",
    name: "Clover honey",
    colour: "pale cream",
    traits: ["light", "mild"],
    price: 8,
    blurb: "Pale, mild and good on everything.",
  },
  borage: {
    id: "borage",
    name: "Borage honey",
    colour: "water white",
    traits: ["light", "mild"],
    price: 10,
    blurb: "Almost clear in the jar, and gentle on the tongue.",
  },
  lavender: {
    id: "lavender",
    name: "Lavender honey",
    colour: "pale gold",
    traits: ["light", "floral"],
    price: 14,
    blurb: "Pale gold, and it smells of the bed it came from.",
  },
  thyme: {
    id: "thyme",
    name: "Thyme honey",
    colour: "amber",
    traits: ["amber", "herbal", "strong"],
    price: 18,
    blurb: "Amber and savoury. A little goes a long way.",
  },
  mint: {
    id: "mint",
    name: "Water mint honey",
    colour: "warm amber",
    traits: ["amber", "herbal"],
    price: 15,
    blurb: "Amber, with a cool note that comes at the end.",
  },
  sunflower: {
    id: "sunflower",
    name: "Sunflower honey",
    colour: "golden yellow",
    traits: ["amber", "mild", "fruity"],
    price: 11,
    blurb: "Golden, mild and quick to set.",
  },
  buckwheat: {
    id: "buckwheat",
    name: "Buckwheat honey",
    colour: "very dark",
    traits: ["dark", "strong"],
    price: 13,
    blurb: "Nearly black, malty, and not for the shy.",
  },
  heather: {
    id: "heather",
    name: "Heather honey",
    colour: "red amber",
    traits: ["amber", "floral", "strong"],
    price: 22,
    blurb: "Red-amber and thick as jelly. The one they all ask for.",
  },
  ivy: {
    id: "ivy",
    name: "Ivy honey",
    colour: "pale and cloudy",
    traits: ["light", "strong"],
    price: 5,
    blurb: "Sets hard and tastes bitter. The bees like it more than people do.",
  },
  blend: {
    id: "blend",
    name: "Meadow blend",
    colour: "mixed gold",
    traits: [],
    price: 6,
    blurb: "A bit of everything the bees could find.",
  },
};

export const HONEY_IDS = Object.keys(HONEYS);
/** How much honey of any kind gains from the season it is sold in. */
export const HONEY_SEASON = { winter: 1.1 };
