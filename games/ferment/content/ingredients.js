// @ts-check
/**
 * Add-ins for a jar, bought in the evening pantry and mixed in at the bench.
 * Data only: adding an ingredient is adding a row.
 *
 * `speed` multiplies how fast a jar ripens (salt 0.75 → a 48 h jar takes 64 h).
 * `shift` would move the jar along the flavour strip for its whole life (+0.1
 * starts it a tenth of the way along); none uses it now. Pear and garlic are
 * flavour only: they change no timing, they only turn a jar into a discovered
 * recipe that needs them. Speeds multiply and shifts add when a jar has several
 * add-ins. `tag` is the word the screen shows; `cost` is the usual price per
 * unit at the market, which drifts around it day to day (content/market.js).
 * `stall` is how often the market has it: "staple" every day, "often" on most
 * days, "rare" now and then. A new timing ingredient is just a row with a
 * `speed`: the bench, the planner and the market pick it up.
 */

/** @type {Record<string, import("../core/types.js").Ingredient>} */
export const INGREDIENTS = {
  salt: {
    name: "Salt",
    icon: "🧂",
    tag: "slower",
    speed: 0.75,
    shift: 0,
    cost: 2,
    stall: "staple",
  },
  chili: {
    name: "Chili",
    icon: "🌶️",
    tag: "faster",
    speed: 4 / 3,
    shift: 0,
    cost: 3,
    stall: "staple",
  },
  honey: {
    name: "Honey",
    icon: "🍯",
    tag: "faster",
    speed: 1.2,
    shift: 0,
    cost: 4,
    stall: "often",
  },
  pear: { name: "Pear", icon: "🍐", tag: "sweet", speed: 1, shift: 0, cost: 3, stall: "often" },
  garlic: { name: "Garlic", icon: "🧄", tag: "funk", speed: 1, shift: 0, cost: 2, stall: "staple" },
  oak: {
    name: "Oak leaves",
    icon: "🍂",
    tag: "slower",
    speed: 0.9,
    shift: 0,
    cost: 2,
    stall: "often",
  },
  whey: { name: "Whey", icon: "🥛", tag: "faster", speed: 1.6, shift: 0, cost: 6, stall: "rare" },
};
export const INGREDIENT_IDS = Object.keys(INGREDIENTS);

/** Most add-ins one jar can take (the bench has three slots beside the base). */
export const MAX_ADDS = 3;
/** Most of one ingredient the pantry can hold. */
export const MAX_STOCK = 9;
/** A new game's pantry, so the bench can be tried on day 1. */
export const START_PANTRY = { salt: 2, chili: 2 };
