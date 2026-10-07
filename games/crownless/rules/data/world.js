/**
 * The map as data (world.md §1, §4): terrain, the regions and their names,
 * and the places worldgen scatters. Numbers here are world.md's; that file is
 * their home, this is the mirror the code reads.
 */

/** Map sizes (world.md §1). M2 builds Medium only; Small is on the cut list. */
export const SIZES = {
  medium: { cols: 38, rows: 56 },
};

/**
 * Terrain, by code. `cost` is world.md's crossing cost on a cost-1 day's
 * pace (Infinity: never entered); `sight` is what standing on it adds;
 * `field` is the battlefield it makes (battle.md §7).
 */
export const TERRAIN = [
  { id: "sea", name: "Sea", cost: Infinity, sight: 0, field: null },
  { id: "lake", name: "Lake", cost: Infinity, sight: 0, field: null },
  { id: "plains", name: "Plains", cost: 1, sight: 0, field: "open" },
  { id: "farm", name: "Farmland", cost: 1, sight: 0, field: "houses" },
  { id: "steppe", name: "Steppe", cost: 0.9, sight: 1, field: "open" },
  { id: "forest", name: "Forest", cost: 1.6, sight: 0, field: "woods" },
  { id: "marsh", name: "Marsh", cost: 2, sight: 0, field: "mud" },
  { id: "hills", name: "Hills", cost: 1.4, sight: 2, field: "slope" },
  { id: "mountains", name: "Mountains", cost: Infinity, sight: 0, field: null },
  { id: "pass", name: "Pass", cost: 2, sight: 0, field: "slope" },
  // A river hex is crossed only at a ford (2) or a bridge (1); flags say which.
  { id: "river", name: "River", cost: Infinity, sight: 0, field: "river" },
];
export const T = Object.fromEntries(TERRAIN.map((t, i) => [t.id, i]));

/** Per-hex flags. */
export const ROAD = 1;
export const FORD = 2;
export const BRIDGE = 4;

/** Road multiplies the terrain under it (world.md §1). */
export const ROAD_COST = 0.6;
export const FORD_COST = 2;
export const BRIDGE_COST = 1;

/** The four claimants' homelands, in their fixed order round the cross. */
export const CULTURE_IDS = ["hold", "ulus", "fen", "vale"];

/** Region 0 is Crownhold's plateau; 1–4 are the cultures above. */
export const REGIONS = ["crown", ...CULTURE_IDS];

/**
 * How each culture's party crosses the map (army.md §4's traits): Greenwood
 * takes 0.6 off forest and marsh, Stone-born crosses hills and passes as
 * plains but marches ×0.9, the Endless Steppe marches +15%.
 */
export const CULTURE_TRAVEL = {
  vale: { pace: 1, cost: {} },
  fen: { pace: 1, cost: { forest: -0.6, marsh: -0.6 } },
  hold: { pace: 0.9, cost: { hills: "plains", pass: "plains" } },
  ulus: { pace: 1.15, cost: {} },
  // Brigands and wolves: no culture's ways.
  wild: { pace: 1, cost: {} },
};

/** Settlement names by culture; the first is the capital. */
export const NAMES = {
  vale: [
    "Valecourt",
    "Ashford",
    "Greyford",
    "Edrin's Keep",
    "Marrowby",
    "Hollin",
    "Westmere",
    "Brackwater",
    "Oakhurst",
    "Lowden",
    "Saltash",
    "Fernley",
    "Corbridge",
    "Thornbury",
    "Ambleside",
    "Wexley",
    "Harrowgate",
    "Dunmere",
    "Kingsbridge",
    "Ellesford",
    "Redbourne",
    "Fallowfield",
  ],
  fen: [
    "Mirefall",
    "Reedholm",
    "Wychwood",
    "Fenwick",
    "Sallow",
    "Bramblecross",
    "Mossgate",
    "Alderney",
    "Willowby",
    "Sedgemoor",
    "Rushden",
    "Otterburn",
    "Elmstead",
    "Hazelmere",
    "Bogsend",
    "Thistlewade",
    "Rookhollow",
    "Marshby",
    "Blackwater",
    "Nettlebed",
    "Tanglewood",
    "Cressing",
  ],
  hold: [
    "Kharum",
    "Dun Varra",
    "Ironhold",
    "Grimscar",
    "Stonehearth",
    "Brannoc",
    "Highcairn",
    "Vorth",
    "Deepforge",
    "Skarn",
    "Haldrim",
    "Cragmoor",
    "Orlek",
    "Dun Taggart",
    "Gravenrock",
    "Hammerfell",
    "Koldrun",
    "Ashcairn",
    "Morrowdeep",
    "Ulvskar",
    "Brokkholm",
    "Tarnhelm",
  ],
  ulus: [
    "Ordu Khaan",
    "Saran",
    "Kherlen",
    "Altan",
    "Bayan",
    "Ulaan",
    "Tsagaan",
    "Khulan",
    "Boro",
    "Arslan",
    "Temur",
    "Nogai",
    "Kheshig",
    "Tolui",
    "Baatar",
    "Erdene",
    "Sukh",
    "Jargal",
    "Naran",
    "Dalai",
    "Khongor",
    "Monkh",
  ],
};

/** What each kind of place is called, and whether the map labels it by name. */
export const PLACES = {
  crownhold: { name: "Crownhold", label: true },
  town: { name: "Town", label: true },
  castle: { name: "Castle", label: true },
  village: { name: "Village", label: true },
  iron: { name: "Iron mine" },
  ranch: { name: "Horse ranch" },
  gold: { name: "Gold mine" },
  lair: { name: "Lair" },
  great: { name: "Great lair" },
  pickup: { name: "Pickup" },
  shrine: { name: "Shrine" },
  stone: { name: "Standing stone" },
  tower: { name: "Watchtower" },
  camp: { name: "Mercenary camp" },
};

/** Lairs (world.md §4), with the worth range of their guards. */
export const LAIRS = {
  hideout: { name: "Brigand hideout", guard: [30, 80] },
  den: { name: "Wolf den", guard: [30, 60] },
  troll: { name: "Troll bridge", guard: [80, 150] },
  barrow: { name: "Barrow", guard: [80, 160] },
  fort: { name: "Ruined fort", guard: [100, 180] },
};

/** The three great lairs (world.md §12), hidden until the Hollow rises. */
export const GREAT_LAIRS = [
  { id: "barrow", name: "Barrow of the First King", regalia: "sceptre" },
  { id: "hoard", name: "Wyrm's Hoard", regalia: "orb" },
  { id: "hall", name: "Hall of the Troll-King", regalia: "seal" },
];

/** Pickups (world.md §4). */
export const PICKUPS = {
  gold: { name: "Gold" },
  chest: { name: "A chest" },
  iron: { name: "Iron cache" },
  horses: { name: "Horse cache" },
  arms: { name: "Abandoned arms" },
};

export const SHRINE_ABILITIES = ["mending", "fog", "smite", "dread"];
export const STONE_ATTRIBUTES = ["might", "guard", "command", "cunning"];

/** Village specialties (world.md §4). */
export const SPECIALTIES = { grain: "grain", iron: "iron", horses: "horses" };
