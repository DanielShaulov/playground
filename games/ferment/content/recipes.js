// @ts-check
/**
 * Recipes the shop can brew. Data only: adding a recipe is adding a row.
 * `hours` is how long a jar takes to go from crisp (0) to over (1).
 * `brine` and `bits` are the jar art colours.
 */

/** @type {Record<string, import("../core/types.js").Recipe>} */
export const RECIPES = {
  dill: { name: "Dill pickles", hours: 48, price: 12, cost: 7, brine: "#cfe0a8", bits: "#6f9f48" },
  hotsauce: { name: "Hot sauce", hours: 36, price: 15, cost: 9, brine: "#e9846c", bits: "#c43b2b" },
  kimchi: { name: "Kimchi", hours: 72, price: 18, cost: 11, brine: "#f0a58a", bits: "#d9573b" },
  kraut: { name: "Sauerkraut", hours: 120, price: 22, cost: 12, brine: "#f1ead0", bits: "#d2bf63" },
};
export const RECIPE_IDS = Object.keys(RECIPES);
