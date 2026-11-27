// @ts-check
/**
 * The four plots of the Hollow. `terrain` is six rows of six characters, top
 * row first, so terrain[y][x] is the square at (x, y):
 *
 *   "." grass   "h" hill   "~" water   "r" rock   "T" apple tree
 *
 * Beds and hives stand on grass or hill only.
 */

/** @typedef {{ id: string, name: string, price: number, terrain: string[], blurb: string }} Plot */

/** Terrain character → the name the core hands out. */
export const TERRAIN = { ".": "grass", h: "hill", "~": "water", r: "rock", T: "tree" };

/** @type {Record<string, Plot>} */
export const PLOTS = {
  home: {
    id: "home",
    name: "Home Meadow",
    price: 0,
    terrain: ["......", "......", "......", "......", "......", "......"],
    blurb: "Yours from the start. Open grass, and dandelions that plant themselves.",
  },
  pond: {
    id: "pond",
    name: "Pond Bank",
    price: 150,
    terrain: ["......", "......", "......", "....~~", "...~~~", "...~~~"],
    blurb: "A quiet pond in one corner. Water mint grows along its edge.",
  },
  orchard: {
    id: "orchard",
    name: "Old Orchard",
    price: 320,
    terrain: ["......", ".T.T.T", "......", "......", "T.T.T.", "......"],
    blurb: "6 old apple trees that still blossom every spring.",
  },
  hill: {
    id: "hill",
    name: "Heather Hill",
    price: 600,
    terrain: ["hhhhhh", "hhrhhh", "hhhhhh", "hhhhrh", "rhhhhh", "hhhrhh"],
    blurb: "High, windy ground where heather and wild thyme belong.",
  },
};

export const PLOT_IDS = Object.keys(PLOTS);

/** What a new game puts on the Home Meadow: the first skep and six wild dandelion beds, all in its reach. */
export const START = {
  hive: { plot: "home", x: 2, y: 3 },
  /** [x, y] of each wild bed. A bare meadow grows them back here first each spring. */
  wild: [
    [1, 2],
    [3, 2],
    [3, 4],
    [0, 1],
    [4, 3],
    [1, 5],
  ],
};
