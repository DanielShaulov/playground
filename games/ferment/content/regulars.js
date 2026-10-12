// @ts-check
/**
 * Regulars: named customers who keep coming back. Data only: adding one is
 * adding a row.
 *
 * A "standing" regular visits every `every` days at `hour` (hours since
 * opening), always for `recipe` at their own spot on the flavour strip; their
 * next visit sits on the order board, so it can be planned for. A "bulk"
 * regular is a business: every `every` days it offers an order for `qty` whole
 * jars, due `lead` days later. `spot` is the middle of the window they want
 * and stays inside the walk-in bell curve (within one spread of the recipe's
 * sweet spot middle). `joins` is when they start coming: from that day, and
 * once the shop has that reputation, and once it has reached that reputation
 * tier (content/goals.js); every condition given must hold. `hello` is what they say at the counter. `look` seeds the
 * portrait.
 */

/** @type {Record<string, import("../core/types.js").Regular>} */
export const REGULARS = {
  okafor: {
    name: "Mrs. Okafor",
    look: 212,
    kind: "standing",
    recipe: "dill",
    spot: 0.25,
    every: 2,
    hour: 1.5,
    joins: { day: 2 },
    hello: "Morning, love. The usual, crisp as you like.",
  },
  bram: {
    name: "Old Bram",
    look: 640,
    kind: "standing",
    recipe: "kraut",
    spot: 0.68,
    every: 4,
    hour: 9,
    joins: { day: 3, tier: 2 },
    hello: "Evening. Sour enough to wake the dead, if you have it.",
  },
  noodlebar: {
    name: "Mei from Lucky Noodle",
    look: 377,
    kind: "bulk",
    recipe: "dill",
    spot: 0.2,
    every: 5,
    hour: 3,
    qty: 4,
    lead: 3,
    joins: { day: 4 },
    hello: "Four jars for the bar, nice and snappy!",
  },
  kenji: {
    name: "Kenji",
    look: 905,
    kind: "standing",
    recipe: "kimchi",
    spot: 0.52,
    every: 3,
    hour: 5,
    joins: { day: 5, rep: 6 },
    hello: "Hey! Kimchi with a bit of a kick today?",
  },
  noor: {
    name: "Noor",
    look: 58,
    kind: "standing",
    recipe: "hotsauce",
    spot: 0.6,
    every: 3,
    hour: 7.5,
    joins: { day: 6, rep: 7, tier: 1 },
    hello: "Something hot for the weekend, please.",
  },
  tacotruck: {
    name: "Luis from the taco truck",
    look: 731,
    kind: "bulk",
    recipe: "hotsauce",
    spot: 0.52,
    every: 6,
    hour: 6,
    qty: 3,
    lead: 2,
    joins: { day: 7, rep: 7, tier: 1 },
    hello: "Three jars of the red stuff for the truck!",
  },
  ames: {
    name: "Dr. Ames",
    look: 463,
    kind: "standing",
    recipe: "beets",
    spot: 0.42,
    every: 3,
    hour: 4,
    joins: { tier: 3 },
    hello: "Beets, please. Doctor's orders, and I'm the doctor.",
  },
  lena: {
    name: "Lena",
    look: 818,
    kind: "standing",
    recipe: "lemons",
    spot: 0.62,
    every: 4,
    hour: 6.5,
    joins: { tier: 4 },
    hello: "One of your lemons? My tagine is waiting.",
  },
  marigold: {
    name: "Rosa from Hotel Marigold",
    look: 296,
    kind: "bulk",
    recipe: "kombucha",
    spot: 0.5,
    every: 5,
    hour: 2,
    qty: 3,
    lead: 2,
    joins: { tier: 5 },
    hello: "Three jars of kombucha for the breakfast bar!",
  },
};
export const REGULAR_IDS = Object.keys(REGULARS);
