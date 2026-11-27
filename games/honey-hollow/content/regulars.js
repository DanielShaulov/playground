// @ts-check
/**
 * The eight regulars. Each comes to the stall once you have made something
 * they love, and wishes for one of those loves when they do.
 *
 * loves: wishes in the stall's own shape (core/market.js satisfies()):
 *        { type: "trait", value }, { type: "kind", value: "honey:<flower>" |
 *        "good:<id>" | "family:<family>" }, { type: "finest" }.
 * qty:   how many they always buy; left out, they want one or two.
 * gifts: what they bring at 3, 7 and 12 hearts, as rewards (see goals.js).
 *        Every gift also raises the bee-book key `gift-<id>-<n>`.
 */

/** @typedef {import("./goals.js").Reward} Reward */
/** @typedef {{ type: string, value?: string }} Love */
/** @typedef {{ id: string, name: string, role: string, loves: Love[], qty?: number, gifts: Reward[], blurb: string }} Regular */

/** @type {Record<string, Regular>} */
export const REGULARS = {
  hattie: {
    id: "hattie",
    name: "Hattie Crumb",
    role: "the baker",
    loves: [
      { type: "trait", value: "dark" },
      { type: "trait", value: "strong" },
    ],
    gifts: [{ seeds: { buckwheat: 4 } }, { coins: 40 }, { coins: 90 }],
    blurb: "Bakes before dawn and wants a honey that stands up to rye.",
  },
  fenwick: {
    id: "fenwick",
    name: "Old Mr Fenwick",
    role: "a retired beekeeper",
    loves: [{ type: "finest" }],
    gifts: [{ items: { spare: 1 } }, { wardrobe: "cap" }, { items: { remedy: 3 } }],
    blurb: "Kept bees here for 50 years and can tell a good jar by the light through it.",
  },
  posy: {
    id: "posy",
    name: "Posy",
    role: "8 years old",
    loves: [
      { type: "trait", value: "mild" },
      { type: "kind", value: "family:candle" },
    ],
    gifts: [{ seeds: { sunflower: 4 } }, { wardrobe: "flower-crown" }, { coins: 60 }],
    blurb: "Saves her pocket money for honey and for candles to read by.",
  },
  linden: {
    id: "linden",
    name: "Dr Linden",
    role: "the village doctor",
    loves: [
      { type: "trait", value: "herbal" },
      { type: "kind", value: "good:balm" },
    ],
    gifts: [{ items: { remedy: 2 } }, { seeds: { borage: 4 } }, { coins: 90 }],
    blurb: "Prescribes a spoonful of herbal honey more often than she admits.",
  },
  marguerite: {
    id: "marguerite",
    name: "Marguerite",
    role: "who runs the tea room",
    loves: [
      { type: "trait", value: "floral" },
      { type: "trait", value: "fruity" },
    ],
    gifts: [{ seeds: { lavender: 4 } }, { wardrobe: "bow" }, { coins: 90 }],
    blurb: "Wants something pretty for the scones and will say so at length.",
  },
  tobias: {
    id: "tobias",
    name: "Tobias Reed",
    role: "an angler",
    loves: [
      { type: "kind", value: "honey:mint" },
      { type: "trait", value: "amber" },
    ],
    gifts: [{ seeds: { mint: 3 } }, { coins: 40 }, { items: { syrup: 6 } }],
    blurb: "Spends his days by the pond and likes his honey the colour of the evening water.",
  },
  wren: {
    id: "wren",
    name: "Wren",
    role: "a painter",
    loves: [
      { type: "kind", value: "family:soap" },
      { type: "trait", value: "light" },
    ],
    gifts: [{ coins: 25 }, { wardrobe: "beret" }, { coins: 90 }],
    blurb: "Always has paint on her hands, and holds each jar up to see its colour.",
  },
  barley: {
    id: "barley",
    name: "Farmer Barley",
    role: "from the next farm over",
    loves: [{ type: "trait", value: "mild" }],
    qty: 3,
    gifts: [{ seeds: { clover: 6 } }, { items: { syrup: 4 } }, { seeds: { ivy: 6 } }],
    blurb: "Buys for a big family, 3 jars at a time, and nothing fancy.",
  },
};

export const REGULAR_IDS = Object.keys(REGULARS);
