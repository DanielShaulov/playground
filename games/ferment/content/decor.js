// @ts-check
/**
 * Shop decor: how the shop looks, bought in the evening. Data only; the art
 * for each piece lives in ui/art/decor.js (and the window, jar and bag art).
 * Decor is looks only: it never changes prices, customers or jars.
 *
 * SPOTS are the corners of the shop that can be dressed. Each holds one piece
 * at a time; the first piece of each spot (cost 0) is what the shop starts
 * with. A piece is bought once and can then be put up and taken down freely.
 * `tier`: the shop tier it needs (content/goals.js TIERS). A piece with
 * `pride` is never sold: it is the reward for that Shop pride goal
 * (PRIDE in content/goals.js).
 */

/** @type {{ id: import("../core/types.js").DecorSpot, name: string }[]} */
export const SPOTS = [
  { id: "wall", name: "Back wall" },
  { id: "wood", name: "Shelf wood" },
  { id: "curtains", name: "Curtains" },
  { id: "sill", name: "Window sill" },
  { id: "garland", name: "Over the shelf" },
  { id: "jars", name: "Jar dressing" },
  { id: "bag", name: "Bags" },
];

/** @type {Record<string, import("../core/types.js").Decor>} */
export const DECOR = {
  // back wall, behind the jars
  boards: { spot: "wall", name: "Pale boards", cost: 0, tier: 0 },
  stripes: { spot: "wall", name: "Sage stripes", cost: 150, tier: 0 },
  sprig: { spot: "wall", name: "Rose sprig paper", cost: 300, tier: 2 },
  tiles: { spot: "wall", name: "Blue tiles", cost: 600, tier: 3 },
  damask: { spot: "wall", name: "Gold damask", cost: 1200, tier: 5 },
  postcards: { spot: "wall", name: "Postcard wall", cost: 0, tier: 0, pride: "everyone" },
  // the shelf's planks and uprights
  oak: { spot: "wood", name: "Honey oak", cost: 0, tier: 0 },
  walnut: { spot: "wood", name: "Dark walnut", cost: 250, tier: 1 },
  sage: { spot: "wood", name: "Painted sage", cost: 400, tier: 3 },
  cream: { spot: "wood", name: "Painted cream", cost: 400, tier: 3 },
  cherry: { spot: "wood", name: "Cherry and brass", cost: 0, tier: 0, pride: "busy" },
  // the window's curtains
  linen: { spot: "curtains", name: "Linen", cost: 0, tier: 0 },
  gingham: { spot: "curtains", name: "Red gingham", cost: 120, tier: 0 },
  lace: { spot: "curtains", name: "Lace", cost: 300, tier: 2 },
  velvet: { spot: "curtains", name: "Plum velvet", cost: 700, tier: 4 },
  roses: { spot: "curtains", name: "Embroidered roses", cost: 0, tier: 0, pride: "secrets" },
  // on the window sill
  dill: { spot: "sill", name: "Pot of dill", cost: 0, tier: 0 },
  geranium: { spot: "sill", name: "Red geranium", cost: 150, tier: 0 },
  herbs: { spot: "sill", name: "Herb trio", cost: 350, tier: 2 },
  lemon: { spot: "sill", name: "Little lemon tree", cost: 700, tier: 4 },
  cat: { spot: "sill", name: "Sleeping cat", cost: 0, tier: 0, pride: "loved" },
  // hung along the top of the shelf
  bare: { spot: "garland", name: "Nothing", cost: 0, tier: 0 },
  bunting: { spot: "garland", name: "Bunting", cost: 250, tier: 1 },
  chillies: { spot: "garland", name: "Dried chillies", cost: 400, tier: 2 },
  fairy: { spot: "garland", name: "Fairy lights", cost: 600, tier: 3 },
  lanterns: { spot: "garland", name: "Brass lanterns", cost: 0, tier: 0, pride: "famous" },
  // on every jar's lid and neck
  plain: { spot: "jars", name: "Plain lids", cost: 0, tier: 0 },
  twine: { spot: "jars", name: "Twine and tag", cost: 150, tier: 0 },
  cloth: { spot: "jars", name: "Gingham caps", cost: 300, tier: 1 },
  bow: { spot: "jars", name: "Ribbon bows", cost: 500, tier: 2 },
  wax: { spot: "jars", name: "Wax seals", cost: 900, tier: 4 },
  gold: { spot: "jars", name: "Gold ribbon", cost: 0, tier: 0, pride: "pride" },
  // what a customer carries their portion home in
  none: { spot: "bag", name: "In hand", cost: 0, tier: 0 },
  paper: { spot: "bag", name: "Brown paper bag", cost: 100, tier: 0 },
  striped: { spot: "bag", name: "Striped bag", cost: 300, tier: 1 },
  basket: { spot: "bag", name: "Little basket", cost: 700, tier: 3 },
  giftbox: { spot: "bag", name: "Gift box", cost: 0, tier: 0, pride: "bigday" },
};
export const DECOR_IDS = Object.keys(DECOR);
