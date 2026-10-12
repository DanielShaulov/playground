// @ts-check
/**
 * Reputation tiers and the goals ladder. Data only.
 *
 * TIERS: the shop climbs a tier the first time its reputation reaches the
 * tier's `rep`, and never drops back. A recipe with a `tier` (content/recipes.js)
 * joins the menu at that tier; a regular whose `joins` has a `tier`
 * (content/regulars.js) starts coming once it is reached, through the usual
 * joins rule, so a standing regular still drops in as a walk-in first.
 * Upgrades name the tier they need too (content/upgrades.js).
 *
 * GOALS: the ladder is endless. One goal is open at a time; once it is met
 * it can be claimed for its reward, and the next one opens. The rows below
 * come first, then MORE repeats its kinds forever, each round asking more.
 * `n` is what to reach; `reward` is coins and, optionally, pantry stock.
 * GOAL_TEXT is how each kind reads on screen, with {n} for the number.
 */

/** @type {import("../core/types.js").Tier[]} */
export const TIERS = [
  { name: "Corner nook", rep: 0 },
  { name: "Neighbourhood favourite", rep: 6 },
  { name: "Talk of the town", rep: 8 },
  { name: "Famous brine", rep: 10 },
];

/** @type {Record<import("../core/types.js").GoalKind, string>} */
export const GOAL_TEXT = {
  served: "Sell {n} portions",
  earned: "Take {n} coins in all",
  delight: "Delight {n} customers",
  bestDay: "Take {n} coins in one day",
  orders: "Hand over {n} orders",
  recipes: "Have {n} recipes on the menu",
  regulars: "Win {n} regulars",
  rep: "Reach reputation {n}",
  upgrades: "Buy {n} upgrades",
};

/** @type {import("../core/types.js").Goal[]} */
export const GOALS = [
  { kind: "served", n: 10, reward: { coins: 20 } },
  { kind: "orders", n: 2, reward: { coins: 25 } },
  { kind: "recipes", n: 5, reward: { coins: 20, stock: { garlic: 1, pear: 1 } } },
  { kind: "bestDay", n: 120, reward: { coins: 30 } },
  { kind: "regulars", n: 2, reward: { coins: 40 } },
  { kind: "upgrades", n: 1, reward: { coins: 30 } },
  { kind: "delight", n: 15, reward: { coins: 40, stock: { honey: 2 } } },
  { kind: "rep", n: 8, reward: { coins: 60 } },
  { kind: "served", n: 120, reward: { coins: 60 } },
  { kind: "recipes", n: 7, reward: { coins: 80 } },
];

/**
 * After GOALS: round k (1, 2, …) asks for `n + k × step` of each kind in turn,
 * for `coins + k × more` coins.
 * @type {{ kind: import("../core/types.js").GoalKind, n: number, step: number, coins: number, more: number }[]}
 */
export const MORE = [
  { kind: "served", n: 100, step: 100, coins: 50, more: 15 },
  { kind: "bestDay", n: 150, step: 40, coins: 50, more: 15 },
  { kind: "delight", n: 20, step: 25, coins: 50, more: 15 },
  { kind: "orders", n: 10, step: 12, coins: 50, more: 15 },
  { kind: "earned", n: 1000, step: 1500, coins: 50, more: 15 },
];
