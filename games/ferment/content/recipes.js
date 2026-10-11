// @ts-check
/**
 * Recipes the shop can brew. Data only: adding a recipe is adding a row.
 * `hours` is how long a plain jar takes to go from crisp (0) to over (1).
 * `sweet` is the stretch of the flavour strip where the recipe is at its best,
 * which the bench time-lapse highlights. `brine` and `bits` are the jar art colours.
 *
 * Rows with a `base` are discovered recipes: a jar of the base brewed with
 * every ingredient in `needs` becomes one, and the first such jar (or bench
 * experiment) puts it on the menu. `hinted` ones start with a hint on the
 * base's recipe card; the rest are a surprise.
 */

/** @type {Record<string, import("../core/types.js").Recipe>} */
export const RECIPES = {
  dill: {
    name: "Dill pickles",
    hours: 48,
    price: 12,
    cost: 7,
    sweet: [0.2, 0.4],
    brine: "#cfe0a8",
    bits: "#6f9f48",
  },
  hotsauce: {
    name: "Hot sauce",
    hours: 36,
    price: 15,
    cost: 9,
    sweet: [0.45, 0.65],
    brine: "#e9846c",
    bits: "#c43b2b",
  },
  kimchi: {
    name: "Kimchi",
    hours: 72,
    price: 18,
    cost: 11,
    sweet: [0.35, 0.55],
    brine: "#f0a58a",
    bits: "#d9573b",
  },
  kraut: {
    name: "Sauerkraut",
    hours: 120,
    price: 22,
    cost: 12,
    sweet: [0.5, 0.7],
    brine: "#f1ead0",
    bits: "#d2bf63",
  },
  garlicdill: {
    name: "Garlic dills",
    hours: 48,
    price: 16,
    cost: 7,
    sweet: [0.4, 0.6],
    brine: "#d9e3b4",
    bits: "#8a8f4a",
    base: "dill",
    needs: ["garlic"],
    hinted: true,
  },
  honeyhot: {
    name: "Honey hot sauce",
    hours: 36,
    price: 20,
    cost: 9,
    sweet: [0.35, 0.55],
    brine: "#eea25e",
    bits: "#c45a2b",
    base: "hotsauce",
    needs: ["honey"],
    hinted: true,
  },
  pearkimchi: {
    name: "Pear kimchi",
    hours: 72,
    price: 24,
    cost: 11,
    sweet: [0.3, 0.5],
    brine: "#f3c09a",
    bits: "#c9a23b",
    base: "kimchi",
    needs: ["pear"],
    hinted: true,
  },
  firekraut: {
    name: "Fire kraut",
    hours: 120,
    price: 28,
    cost: 12,
    sweet: [0.55, 0.75],
    brine: "#f2c9a8",
    bits: "#d0532e",
    base: "kraut",
    needs: ["chili"],
    hinted: true,
  },
  funkykimchi: {
    name: "Black garlic kimchi",
    hours: 72,
    price: 30,
    cost: 11,
    sweet: [0.6, 0.8],
    brine: "#c98b78",
    bits: "#5b3a35",
    base: "kimchi",
    needs: ["garlic", "chili"],
  },
};
/** The starting menu: every recipe that isn't discovered. */
export const RECIPE_IDS = Object.keys(RECIPES).filter((id) => !RECIPES[id].base);
/** Recipes found at the bench, in the order a menu lists them. */
export const VARIANT_IDS = Object.keys(RECIPES).filter((id) => RECIPES[id].base);
