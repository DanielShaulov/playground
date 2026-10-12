// @ts-check
/**
 * Market tuning. Each morning every ingredient's stall is rolled from the
 * "market" random stream: whether it is out today (by its `stall` in
 * content/ingredients.js), how many it has, and its price. Changing a number
 * here changes how games play out, so regenerate the replay goldens with it.
 */

/**
 * Per stall kind: the chance it is out on a given day, and how many it has
 * then (whole numbers, both ends included).
 * @type {Record<import("../core/types.js").StallKind, { chance: number, stock: [number, number] }>}
 */
export const STALLS = {
  staple: { chance: 1, stock: [5, 9] },
  often: { chance: 0.65, stock: [2, 6] },
  rare: { chance: 0.2, stock: [1, 3] },
};

/** Prices drift each morning by up to this fraction of an ingredient's cost, either way… */
export const PRICE_STEP = 0.12;
/** …but never more than this far from it. */
export const PRICE_BAND = 0.3;
