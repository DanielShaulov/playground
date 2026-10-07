/**
 * What roams the map, as data (world.md §5, army.md §5): brigands and wolf
 * packs, how they're made up, what they carry, and the rules of meeting
 * them. Numbers here are world.md's and army.md's; those files are their
 * home, this is the mirror the code reads.
 */

/** Brigands field the generic troops under their own names (army.md §5). */
export const BRIGAND_NAMES = {
  levy: "Looter",
  militia: "Brigand",
  bowman: "Poacher",
  squire: "Raider",
  footman: "Deserter",
};

/** At most this many of each roam at once (world.md §5). */
export const MAX_BRIGANDS = 12;
export const MAX_WOLVES = 4;

/** A band is worth 8 + 2 per week elapsed, at most 60; a wolf pack 10–30. */
export const brigandWorth = (week) => Math.min(60, 8 + 2 * week);
export const WOLF_WORTH = [10, 30];

/**
 * A band's worth, shared out by troop: looters early, raiders and deserters
 * once the bands have grown. The first row whose worth is reached applies.
 */
export const BRIGAND_MIX = [
  [40, { levy: 0.2, militia: 0.3, bowman: 0.2, squire: 0.15, footman: 0.15 }],
  [20, { levy: 0.35, militia: 0.3, bowman: 0.2, squire: 0.15 }],
  [0, { levy: 0.6, militia: 0.2, bowman: 0.2 }],
];

/**
 * A band worth this much has a chief: a level-3 hero guarded by up to six of
 * its brigands (army.md §6).
 */
export const CHIEF_AT = 24;
export const CHIEF_LEVEL = 3;
export const CHIEF_GUARDS = 6;

/** A band's purse: 20 gold plus 3 a man (army.md §5). */
export const purseOf = (men) => 20 + 3 * men;

/**
 * A troop's value, everything paid in gold from a recruit up: the Value
 * column of army.md §3, by generic type. Loot is a share of it.
 */
export const VALUE = {
  levy: 10,
  militia: 30,
  bowman: 30,
  footman: 70,
  spearman: 70,
  archer: 70,
  manatarms: 150,
  pikeman: 150,
  crossbow: 150,
  longbow: 240,
  hearthguard: 300,
  warden: 390,
  squire: 55,
  horseman: 125,
  knight: 270,
  horsearcher: 220,
  bannerknight: 540,
  keshig: 470,
  wolf: 0,
  troll: 0,
};

/** Loot: 15% of the value of enemies killed or taken, and a brigand's whole purse (world.md §6). */
export const LOOT_SHARE = 0.15;

/** Two parties meet within 0.6 of a hex of each other (world.md §2). */
export const CONTACT = 0.6;
/** After a Leave, a rearguard or a draw, no contact for 6 hours (battle.md §11). */
export const DISENGAGE = 6;
/** Pay brigands 20% of your gold and they leave you alone for 3 days (world.md §5). */
export const PAY_SHARE = 0.2;
export const PAID_HOURS = 72;
/** A rearguard is the slowest 15% of your worth (world.md §5). */
export const REARGUARD = 0.15;

/** A party sees 4 hexes, like yours; hunting needs this much more strength. */
export const PARTY_SIGHT = 4;
export const BOLD = 1.2;
/** Wolves hunt what comes within 3 hexes of them, unless it's half again as strong. */
export const WOLF_SMELL = 3;
export const WOLF_BOLD = 1.5;
/** Wolves keep within 6 hexes of their den; brigands roam 8 from their hideout. */
export const WOLF_RANGE = 6;
export const BRIGAND_RANGE = 8;

/** The wounded heal 10% of a stack a day (world.md §7). */
export const HEAL = 0.1;
