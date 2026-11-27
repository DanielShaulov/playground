// @ts-check
/**
 * What the beekeeper can look like. Ids are shared with the painters
 * (ui/art); names are what the wardrobe shows.
 *
 * Every row has `unlock`: { start: true } is owned from the first screen;
 * the rest are earned: { tier } with renown, { goal } as a goal's reward,
 * { gift: [regular, n] } as a regular's nth gift, { ribbon: true } with the
 * first ribbon at the Honey Show.
 *
 * Hair lists are what the creator shows first for each body; any hair id may
 * be worn on either body.
 */

/** @typedef {{ start?: boolean, tier?: number, goal?: string, gift?: [string, number], ribbon?: boolean }} Unlock */
/** @typedef {{ id: string, name: string, unlock: Unlock }} WardrobeItem */

const start = { start: true };

/** @param {[string, string][]} rows @returns {WardrobeItem[]} */
const owned = (rows) => rows.map(([id, name]) => ({ id, name, unlock: start }));

export const WARDROBE = {
  body: owned([
    ["woman", "Woman"],
    ["man", "Man"],
  ]),
  skin: owned([
    ["s1", "Porcelain"],
    ["s2", "Peach"],
    ["s3", "Sand"],
    ["s4", "Honey"],
    ["s5", "Chestnut"],
    ["s6", "Umber"],
  ]),
  hair: {
    woman: owned([
      ["long-waves", "Long waves"],
      ["braid", "Side braid"],
      ["bun", "Soft bun"],
      ["curls", "Full curls"],
      ["bob", "Wavy bob"],
    ]),
    man: owned([
      ["tousled", "Tousled"],
      ["curly", "Curly"],
      ["side-part", "Side part"],
      ["long-tied", "Long and tied back"],
      ["cropped", "Cropped"],
    ]),
  },
  hairColor: owned([
    ["h1", "Black"],
    ["h2", "Espresso"],
    ["h3", "Chestnut"],
    ["h4", "Auburn"],
    ["h5", "Copper"],
    ["h6", "Honey blonde"],
    ["h7", "Silver"],
    ["h8", "Lilac"],
  ]),
  overalls: owned([
    ["o1", "Denim"],
    ["o2", "Sage"],
    ["o3", "Mustard"],
    ["o4", "Dusty rose"],
    ["o5", "Lavender"],
    ["o6", "Cream"],
  ]),
  shirt: owned([
    ["t1", "White"],
    ["t2", "Butter"],
    ["t3", "Sky"],
    ["t4", "Blush"],
    ["t5", "Mint"],
    ["t6", "Striped"],
  ]),
  /** @type {WardrobeItem[]} */
  hat: [
    { id: "none", name: "No hat", unlock: start },
    { id: "straw", name: "Straw hat", unlock: start },
    { id: "veil", name: "Bee veil", unlock: start },
    { id: "flower-crown", name: "Flower crown", unlock: { gift: ["posy", 2] } },
    { id: "beret", name: "Painter’s beret", unlock: { gift: ["wren", 2] } },
    { id: "knit", name: "Knitted hat", unlock: { goal: "winter-ready" } },
    { id: "bow", name: "Ribbon bow", unlock: { gift: ["marguerite", 2] } },
    { id: "cap", name: "Flat cap", unlock: { gift: ["fenwick", 2] } },
    { id: "golden-veil", name: "Golden veil", unlock: { tier: 4 } },
    { id: "rosette", name: "Show rosette", unlock: { ribbon: true } },
  ],
  beard: owned([
    ["none", "No beard"],
    ["stubble", "Stubble"],
    ["full", "Full beard"],
  ]),
  glasses: owned([
    ["none", "No glasses"],
    ["round", "Round glasses"],
  ]),
};

/** The parts of a look, in the order the creator shows them. */
export const LOOK_PARTS = [
  "body",
  "skin",
  "hair",
  "hairColor",
  "overalls",
  "shirt",
  "hat",
  "beard",
  "glasses",
];

/** The same hair on the other body: a woman's style → the man's nearest to it (core hairFor reads it both ways). */
/** @type {Record<string, string>} */
export const HAIR_TWINS = {
  "long-waves": "long-tied",
  braid: "side-part",
  bun: "cropped",
  curls: "curly",
  bob: "tousled",
};

/** The look a new keeper starts from before anything is chosen. */
export const DEFAULT_LOOK = {
  body: "woman",
  skin: "s3",
  hair: "long-waves",
  hairColor: "h3",
  overalls: "o1",
  shirt: "t1",
  hat: "straw",
  beard: "none",
  glasses: "none",
};
