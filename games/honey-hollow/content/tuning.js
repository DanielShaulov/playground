// @ts-check
/**
 * Every number that is not in a table. Changing one changes how games play
 * out, so the replay goldens in tests/honey-hollow/core/ must be regenerated
 * in the same change (UPDATE_GOLDENS=1), and docs/honey-hollow/rules.md says
 * the same numbers in words.
 */

// ---- calendar ---------------------------------------------------------------
export const SEASON_DAYS = 7;
export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const YEAR_DAYS = SEASON_DAYS * SEASONS.length; // 28
export const TICKS_PER_DAY = 240;
/** Ticks a second the screen runs the day at: normal, fast. The core never reads these. */
export const TICK_RATES = [4, 12];

// ---- weather ----------------------------------------------------------------
/** How much of a full day's flying each weather allows. */
export const FLIGHT = { sunny: 1, cloudy: 0.8, windy: 0.6, rain: 0.15, snow: 0, frost: 0 };
/** Wind bites harder on the open hill. */
export const WINDY_HILL_FLIGHT = 0.4;
/** Odds of each weather by season (they need not sum to 1; they are weights). */
export const WEATHER_ODDS = {
  spring: { sunny: 45, cloudy: 25, windy: 10, rain: 20 },
  summer: { sunny: 60, cloudy: 20, windy: 10, rain: 10 },
  autumn: { sunny: 35, cloudy: 30, windy: 20, rain: 15 },
  winter: { snow: 50, frost: 50 },
};
/** The first days of a new game are always sunny. */
export const SUNNY_START_DAYS = 2;

// ---- land -------------------------------------------------------------------
export const PLOT_W = 6;
export const PLOT_H = 6;
/** A hive this close to water (in squares, diagonals count) flies better in summer. */
export const WATER_RANGE = 2;
export const WATER_BONUS = 0.1;
/** A bare Home Meadow grows wild dandelions back each spring, up to this many beds. */
export const WILD_BEDS = 6;
/** The wild flower that seeds itself on a bare Home Meadow on the first morning of each season (none in winter). */
export const WILD_FLOWERS = ["dandelion", "clover", "ivy", null];
/** The orchard's apple trees carry fruit between these days of the year (for drawing only). */
export const TREE_FRUIT_DOY = [10, 20];

// ---- foraging ---------------------------------------------------------------
/** Reach weights: the 8 squares next to a hive, and the ring of 16 beyond. */
export const NEAR = 1;
export const FAR = 0.5;
export const FORAGE_PER_STRENGTH = 6;
/** Asking rounds: the first, then two more for what a crowded bed could not give. */
export const SHARE_ROUNDS = 3;
/** A hive moved today flies at this share of its strength. */
export const MOVED_FLIGHT = 0.5;
/**
 * Hedgerow forage: a hive that finds less than this share of what it could
 * carry in the beds makes the load up to it beyond the hedge. Kept under
 * GROW_FACTOR × EAT / FORAGE so the hedgerow alone never grows a colony.
 */
export const WILD_SHARE = 0.3;

// ---- stores, eating, growing ------------------------------------------------
export const NECTAR_PER_JAR = 10;
export const EAT_PER_STRENGTH = 1;
export const WINTER_EAT = 0.6;
export const GROW_DAYS = 2;
/** A growth day is one where the colony gathered this many times what it eats. */
export const GROW_FACTOR = 2;

// ---- hives ------------------------------------------------------------------
export const START_COINS = 20;
export const START_HIVE_STRENGTH = 3;
export const NEW_HIVE_STRENGTH = 2;
/** A new skep costs HIVE_PRICE, plus HIVE_PRICE_STEP for each hive owned beyond the first. */
export const HIVE_PRICE = 40;
export const HIVE_PRICE_STEP = 20;
export const HIVES_PER_PLOT = 4;

// ---- honey ------------------------------------------------------------------
/** Purity (biggest flower share) at which a jar earns one, two, three stars, and the price each brings. */
export const STARS = [
  { at: 0.8, mult: 1 },
  { at: 0.9, mult: 1.2 },
  { at: 0.97, mult: 1.45 },
];
export const JARS_PER_WAX = 2;
export const SYRUP_UNITS = 10;

// ---- shop items -------------------------------------------------------------
export const SHOP = {
  syrup: {
    id: "syrup",
    name: "Sugar syrup",
    price: 8,
    blurb: "A jar’s worth of stores for a hive that is short.",
  },
  spare: {
    id: "spare",
    name: "Spare hive",
    price: 25,
    blurb: "An empty hive, ready for a swarm or a split.",
  },
  remedy: { id: "remedy", name: "Thyme remedy", price: 15, blurb: "Knocks mites right back." },
};
/** Syrup, spare hives and remedies reach the shop on this day (the first summer). */
export const SHOP_ITEMS_FROM_DAY = 8;

// ---- living hives -----------------------------------------------------------
/**
 * Swarming: from SWARMS_FROM_DAY, between these days of the year, a colony at
 * its hive's strength limit raises queen cells (once a year at most).
 */
export const SWARMS_FROM_DAY = 8;
export const SWARM_DOY = [3, 12];
export const SPLIT_MIN_STRENGTH = 4;

export const MITES_FROM_DAY = 8;
export const MITE_RATE = 0.6;
export const MITES_SPOTTED = 40;
export const MITES_STALL = 60;
export const MITES_HARM = 80;
/** At MITES_HARM or more a colony loses a strength that same night, and then again every this many sleeps. */
export const MITES_HARM_SLEEPS = 2;
export const DUST_MITES = 20;
export const REMEDY_MITES = 70;

export const WASP_DOY = [11, 20];
export const WASP_MAX_STRENGTH = 3;
export const WASP_CHANCE = 0.35;
/** The raid starts between these ticks. */
export const WASP_WINDOW = [30, 180];
export const WASP_TICKS = 40;
export const WASP_LOSS = 5;

// ---- market -----------------------------------------------------------------
export const CUSTOMERS_BASE = 2;
export const CUSTOMERS_MAX = 6;
export const DELIGHTED_PAY = 1.25;
export const FINE_PAY = 0.85;
export const GROCER_PAY = 0.6;
/** Daily price wobble, either way. */
export const WOBBLE = 0.1;
/** Each unit sold knocks this much off its product; a third of the gap heals each night. */
export const GLUT_STEP = 0.03;
export const GLUT_HEAL = 1 / 3;
export const GLUT_FLOOR = 0.6;
/** Chance each place in the queue is taken by a regular who has a reason to come. */
export const REGULAR_CHANCE = 0.45;
export const HEART_GIFTS = [3, 7, 12];
/** How wishes are weighted when every kind is possible. */
export const WISH_WEIGHTS = { any: 2, kind: 3, trait: 3, finest: 1, gift: 1 };
/** How many of a thing a customer wants: weights for 1, 2 and 3. */
export const QTY_WEIGHTS = [50, 35, 15];
/** A kind that is on the shelf tonight is this much likelier to be wished for. */
export const IN_STOCK_WEIGHT = 2;

export const SHOW_DOY = 20; // autumn day 7
export const SHOW_ENTRIES = 3;
export const RIBBONS = [
  { medal: "bronze", coins: 20, renown: 2 },
  { medal: "silver", coins: 45, renown: 4 },
  { medal: "gold", coins: 90, renown: 8 },
];
export const FAIR_DOY = 24; // winter day 4
export const FAIR_CUSTOMERS = 6;
export const FAIR_PAY = 1.5;

// ---- workshop ---------------------------------------------------------------
export const CRAFTS_PER_DAY = 3;
export const WINTER_CRAFTS = 6;

// ---- keeper -----------------------------------------------------------------
export const NAME_MAX = 14;
