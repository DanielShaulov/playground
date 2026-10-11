// @ts-check
/**
 * Add-ins for a jar, bought in the evening pantry and mixed in at the bench.
 * Data only: adding an ingredient is adding a row.
 *
 * `speed` multiplies how fast a jar ripens (salt 0.75 → a 48 h jar takes 64 h).
 * `shift` moves the jar along the flavour strip for its whole life: +0.1 starts
 * it a tenth of the way along (it reaches every band, and pops, sooner), -0.1
 * keeps it crisp for the first tenth of its life (later everywhere). Speeds
 * multiply and shifts add when a jar has several add-ins. `tag` is the word the
 * screen shows; `cost` is per unit in the pantry.
 */

/** @type {Record<string, import("../core/types.js").Ingredient>} */
export const INGREDIENTS = {
  salt: { name: "Salt", icon: "🧂", tag: "slower", speed: 0.75, shift: 0, cost: 2 },
  chili: { name: "Chili", icon: "🌶️", tag: "faster", speed: 4 / 3, shift: 0, cost: 3 },
  honey: { name: "Honey", icon: "🍯", tag: "faster", speed: 1.2, shift: 0, cost: 4 },
  pear: { name: "Pear", icon: "🍐", tag: "sweet", speed: 1, shift: -0.1, cost: 3 },
  garlic: { name: "Garlic", icon: "🧄", tag: "funk", speed: 1, shift: 0.1, cost: 2 },
};
export const INGREDIENT_IDS = Object.keys(INGREDIENTS);

/** Most add-ins one jar can take (the bench has three slots beside the base). */
export const MAX_ADDS = 3;
/** Most of one ingredient the pantry can hold. */
export const MAX_STOCK = 9;
/** A new game's pantry, so the bench can be tried on day 1. */
export const START_PANTRY = { salt: 2, chili: 2 };
