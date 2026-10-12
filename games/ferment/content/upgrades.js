// @ts-check
/**
 * Shop upgrades, bought in the evening. Data only: adding one is adding a row.
 *
 * - shelf: each level adds `slots` spots to the shelf.
 * - jars: each level adds one portion to every jar started from then on.
 * - crock: fitted to one shelf spot; a jar started in that spot ripens at
 *   `pace` times the usual speed for its whole life (the pace is stored on
 *   the jar when it is started, so swapping crocks never changes a jar).
 *   A crock can be fitted to any number of spots, each bought on its own.
 *
 * `levels` are bought in order; each needs the shop to have reached `tier`
 * (content/goals.js TIERS). A crock has one level, bought once per spot.
 */

/** @type {Record<string, import("../core/types.js").Upgrade>} */
export const UPGRADES = {
  shelf: {
    name: "More shelf space",
    kind: "shelf",
    text: "Three more spots for jars.",
    slots: 3,
    levels: [
      { cost: 200, tier: 1 },
      { cost: 500, tier: 2 },
      { cost: 1000, tier: 3 },
    ],
  },
  bigjars: {
    name: "Bigger jars",
    kind: "jars",
    text: "Every new jar holds one more portion.",
    levels: [
      { cost: 700, tier: 2 },
      { cost: 1800, tier: 3 },
    ],
  },
  cool: {
    name: "Cellar crock",
    kind: "crock",
    text: "Stone-cool. Jars in it take their time.",
    pace: 0.75,
    levels: [{ cost: 60, tier: 0 }],
  },
  warm: {
    name: "Warm crock",
    kind: "crock",
    text: "Sits by the stove. Jars in it hurry along.",
    pace: 1.3,
    levels: [{ cost: 80, tier: 1 }],
  },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);
