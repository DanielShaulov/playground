/**
 * Keeping a warband, as data (army.md §1, §3; world.md §4, §6–7): the troop
 * tree, what a troop costs to raise and to keep, the XP to reach a tier,
 * ransoms, and what settlements and markets offer. Those files are home to
 * these numbers; this is the mirror the code reads.
 */

/** What each troop is upgraded from (army.md §1). Levies and squires are recruited. */
export const FROM = {
  militia: "levy",
  bowman: "levy",
  footman: "militia",
  spearman: "militia",
  manatarms: "footman",
  hearthguard: "manatarms",
  pikeman: "spearman",
  archer: "bowman",
  longbow: "archer",
  crossbow: "archer",
  warden: "longbow",
  horseman: "squire",
  knight: "horseman",
  horsearcher: "horseman",
  bannerknight: "knight",
  keshig: "horsearcher",
};

/**
 * army.md §3 by generic type: what the step up to it costs (gold, iron,
 * horses), its value (all the gold paid from a recruit up) and its weekly wage.
 */
// prettier-ignore
export const PRICE = {
  levy:         { gold: 10,  iron: 0, horses: 0, value: 10,  wage: 1 },
  militia:      { gold: 20,  iron: 0, horses: 0, value: 30,  wage: 2 },
  bowman:       { gold: 20,  iron: 0, horses: 0, value: 30,  wage: 2 },
  footman:      { gold: 40,  iron: 1, horses: 0, value: 70,  wage: 4 },
  spearman:     { gold: 40,  iron: 1, horses: 0, value: 70,  wage: 4 },
  archer:       { gold: 40,  iron: 0, horses: 0, value: 70,  wage: 4 },
  manatarms:    { gold: 80,  iron: 1, horses: 0, value: 150, wage: 7 },
  pikeman:      { gold: 80,  iron: 1, horses: 0, value: 150, wage: 7 },
  crossbow:     { gold: 80,  iron: 1, horses: 0, value: 150, wage: 7 },
  longbow:      { gold: 170, iron: 0, horses: 0, value: 240, wage: 7 },
  hearthguard:  { gold: 150, iron: 2, horses: 0, value: 300, wage: 12 },
  warden:       { gold: 150, iron: 0, horses: 0, value: 390, wage: 12 },
  squire:       { gold: 55,  iron: 0, horses: 1, value: 55,  wage: 4 },
  horseman:     { gold: 70,  iron: 1, horses: 0, value: 125, wage: 8 },
  knight:       { gold: 145, iron: 2, horses: 1, value: 270, wage: 14 },
  horsearcher:  { gold: 95,  iron: 0, horses: 0, value: 220, wage: 14 },
  bannerknight: { gold: 270, iron: 2, horses: 1, value: 540, wage: 24 },
  keshig:       { gold: 250, iron: 2, horses: 1, value: 470, wage: 24 },
};

/** A troop's value by generic type; beasts are worth nothing to sell. Loot is a share of it. */
export const VALUE = {
  ...Object.fromEntries(Object.entries(PRICE).map(([t, p]) => [t, p.value])),
  wolf: 0,
  troll: 0,
};

/** XP a man needs to reach each tier (army.md §3). */
export const XP_TO = { 2: 20, 3: 60, 4: 150, 5: 300 };

/**
 * After a fight every surviving man gets 12 × the enemy worth beaten / your
 * worth fielded, held to 2–40; a fight not won gives 30% of it (army.md §3).
 */
export const XP_PER_FIGHT = 12;
export const XP_RANGE = [2, 40];
export const XP_NOT_WON = 0.3;

/** Ransom by tier; mounted troops fetch half again (army.md §3). */
export const RANSOM = { 1: 4, 2: 10, 3: 22, 4: 45, 5: 90 };
export const MOUNTED_RANSOM = 1.5;
/** Diplomacy: ransoms +20% a rank (army.md §7). */
export const DIPLOMACY_RANSOM = 0.2;

/**
 * What a settlement raises, as [type, pool, weekly refill] (world.md §4):
 * levies at villages, militia and bowmen at towns, squires at castles and
 * Ulus towns. A recruit costs its line's value, iron and horses (army.md §3).
 */
export const RECRUITS = {
  village: [["levy", 12, 3]],
  town: [
    ["militia", 8, 4],
    ["bowman", 8, 4],
  ],
  castle: [["squire", 4, 1]],
};
export const ULUS_TOWN = [["squire", 4, 1]];

/** A mercenary camp sells one troop of tier 3–4, any culture, at 2.5× value; pool 6, +1 a week. */
export const MERCENARY = { mark: 2.5, pool: 6, refill: 1, tiers: [3, 4] };

/** A town's market: iron at 30, 5 a week; horses at 40, 3 a week (Ulus towns: 6 at 30). */
export const MARKET = {
  iron: { price: 30, stock: 5 },
  horses: { price: 40, stock: 3 },
};
export const ULUS_HORSES = { price: 30, stock: 6 };

/**
 * Party morale (world.md §7): 60, +5 a Leadership rank, −10 over the party
 * limit; a victory +10, a defeat −15 and an unpaid week −20, all fading 2 a
 * day. Under 20 at the week's turn, 5% of the tier 1–2 men desert.
 */
export const MORALE = { base: 60, leadership: 5, over: 10, decay: 2, low: 20, lowDesert: 0.05 };
export const MOOD = { won: 10, lost: -15, unpaid: -20 };

/** Unpaid at the week's turn: 10% of the unpaid men desert, lowest tiers first (world.md §6). */
export const UNPAID_DESERT = 0.1;

/** Prisoners can be recruited after 4 days held, 1 fewer a Diplomacy rank, at half value (world.md §7). */
export const PRISONER_DAYS = 4;
export const PRISONER_PRICE = 0.5;

/** Taken in battle: held 3–10 days, then ransomed for 20% of your gold, or you escape (world.md §7). */
export const CAPTIVE_DAYS = [3, 10];
export const CAPTIVE_RANSOM = 0.2;
export const ESCAPE = 0.5;

/** Abandoned arms: five men go up a tier for nothing (world.md §4). */
export const ARMS = 5;

/** Healing: ×1.5 resting in a settlement; Medicine ×1.5 / 2 / 2.5 (world.md §7, army.md §7). */
export const SETTLEMENT_HEAL = 1.5;
export const MEDICINE_HEAL = [1, 1.5, 2, 2.5];
