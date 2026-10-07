/**
 * Troops, cultures and the hero as data: army.md §1–2, §4, §6.
 *
 * A troop id is the generic type ("footman"), a culture's variant of it
 * ("vale:footman", stats tweaked by the culture and its trait), or a hero
 * ("hero:12", a hero of level 12). `troop(id)` turns any of them into stats.
 *
 * dmg is melee damage per fighting soldier per round; mdmg per missile that
 * hits; speed is metres per second. Worth (in militia) comes out of
 * tests/crownless/battle-sim.mjs — rerun it after changing a stat.
 */

// prettier-ignore
const GENERIC = {
  // Infantry: the generalist. Shields grow with tier.
  levy:      { name: "Levy",        tier: 1, role: "inf", hp: 22, atk: 2, def: 2, dmg: 5,   armor: 0, shield: 0,    speed: 4.5, morale: 50 },
  militia:   { name: "Militia",     tier: 2, role: "inf", hp: 26, atk: 3, def: 3, dmg: 6,   armor: 1, shield: 0.3,  speed: 4.5, morale: 60 },
  footman:   { name: "Footman",     tier: 3, role: "inf", hp: 30, atk: 5, def: 4, dmg: 7.5, armor: 2, shield: 0.4,  speed: 4.5, morale: 66 },
  manatarms: { name: "Man-at-arms", tier: 4, role: "inf", hp: 35, atk: 6, def: 7, dmg: 9,   armor: 4, shield: 0.45, speed: 4.2, morale: 72 },
  // Spears fight two ranks deep; their point is antiCav and the brace.
  spearman:  { name: "Spearman", tier: 3, role: "spear", hp: 30, atk: 3, def: 5, dmg: 4.5, armor: 2, shield: 0.3, speed: 4.3, morale: 66, reach: 2, antiCav: 2,   brace: true },
  pikeman:   { name: "Pikeman",  tier: 4, role: "spear", hp: 34, atk: 4, def: 6, dmg: 5,   armor: 3, shield: 0,   speed: 4,   morale: 72, reach: 2, antiCav: 2.4, brace: true },
  // Ranged: weak in melee; every volley depends on range, armour, shields.
  bowman:    { name: "Bowman",      tier: 2, role: "ranged", hp: 22, atk: 1, def: 1, dmg: 4,   armor: 0, shield: 0, speed: 4.5, morale: 52, range: 60, mdmg: 7,   acc: 0.5,  reload: 3,   ammo: 10 },
  archer:    { name: "Archer",      tier: 3, role: "ranged", hp: 25, atk: 2, def: 2, dmg: 5,   armor: 1, shield: 0, speed: 4.5, morale: 58, range: 70, mdmg: 8,   acc: 0.55, reload: 3,   ammo: 12 },
  longbow:   { name: "Longbowman",  tier: 4, role: "ranged", hp: 28, atk: 3, def: 3, dmg: 6,   armor: 1, shield: 0, speed: 4.5, morale: 64, range: 90, mdmg: 9.5, acc: 0.6,  reload: 3,   ammo: 14 },
  crossbow:  { name: "Crossbowman", tier: 4, role: "ranged", hp: 30, atk: 2, def: 4, dmg: 5,   armor: 3, shield: 0, speed: 4,   morale: 64, range: 75, mdmg: 13,  acc: 0.65, reload: 4.5, ammo: 12, pierce: 0.6 },
  // Horse: the horse is most of the hit points, the charge most of the damage.
  squire:    { name: "Squire",       tier: 2, role: "cav", hp: 30, atk: 4, def: 2, dmg: 6, armor: 1, shield: 0.2, speed: 10, morale: 58, charge: 6 },
  horseman:  { name: "Horseman",     tier: 3, role: "cav", hp: 36, atk: 5, def: 3, dmg: 7, armor: 2, shield: 0.3, speed: 10, morale: 66, charge: 8 },
  knight:    { name: "Knight",       tier: 4, role: "cav", hp: 44, atk: 6, def: 5, dmg: 8, armor: 5, shield: 0.5, speed: 9,  morale: 76, charge: 12 },
  horsearcher: { name: "Horse archer", tier: 4, role: "ha", hp: 34, atk: 3, def: 3, dmg: 5, armor: 2, shield: 0, speed: 11, morale: 64, range: 60, mdmg: 7.5, acc: 0.5, reload: 3, ammo: 14 },
  // Tier 5: one per culture, the far end of that culture's best line.
  bannerknight: { name: "Banner Knight", tier: 5, role: "cav",    hp: 50, atk: 7, def: 6, dmg: 9,   armor: 6, shield: 0.5, speed: 9,   morale: 84, charge: 16 },
  warden:       { name: "Warden",        tier: 5, role: "ranged", hp: 30, atk: 4, def: 4, dmg: 6.5, armor: 2, shield: 0,   speed: 4.5, morale: 70, range: 100, mdmg: 11, acc: 0.65, reload: 3, ammo: 16 },
  hearthguard:  { name: "Hearthguard",   tier: 5, role: "inf",    hp: 40, atk: 7, def: 8, dmg: 10,  armor: 5, shield: 0.5, speed: 4,   morale: 80 },
  keshig:       { name: "Keshig",        tier: 5, role: "ha",     hp: 40, atk: 5, def: 5, dmg: 7,   armor: 4, shield: 0,   speed: 11,  morale: 74, range: 65, mdmg: 9, acc: 0.55, reload: 3, ammo: 16 },
  // Beasts. Wolves are fast and fragile; a troll is few, huge and frightening.
  wolf:  { name: "Wolf",  tier: 2, role: "cav",     hp: 18,  atk: 4, def: 2, dmg: 6,  armor: 0, shield: 0, speed: 12, morale: 55, charge: 4 },
  troll: { name: "Troll", tier: 5, role: "monster", hp: 400, atk: 8, def: 6, dmg: 70, armor: 4, shield: 0, speed: 4,  morale: 90, fear: 4, ranks: 1, spacing: 4 },
};

/** Ranks a squad of each role stands in (battle.md §2). */
export const DEFAULT_RANKS = { inf: 4, spear: 4, ranged: 2, cav: 2, ha: 2, monster: 1 };

/** What the four claimants field (army.md §4). */
export const CULTURES = {
  vale: {
    id: "vale",
    name: "Valemark",
    word: "Vale",
    color: "#5b8def",
    dark: "#1f3a66",
    light: "#9dbcf6",
    charge: "chevron",
    doctrine: "heavy horse, crossbows, a steady foot line",
    lacks: ["longbow", "horsearcher"],
    elite: "bannerknight",
    tweak: {},
    trait: { name: "Lance", text: "horse charge +25%; infantry −4 morale" },
    ability: "lance",
  },
  fen: {
    id: "fen",
    name: "Fenreach",
    word: "Fen",
    color: "#4caf6a",
    dark: "#1d4a2b",
    light: "#8fd6a2",
    charge: "tree",
    doctrine: "longbows behind pikes, light horse",
    lacks: ["crossbow", "knight", "horsearcher"],
    elite: "warden",
    tweak: { manatarms: { def: -1, speed: 4.5 } },
    trait: { name: "Greenwood", text: "ranged +10 m range" },
    ability: "stakes",
  },
  hold: {
    id: "hold",
    name: "Kharum",
    word: "Kharum",
    color: "#d08a3c",
    dark: "#5e3a12",
    light: "#f0bf86",
    charge: "anvil",
    doctrine: "shield infantry and crossbows",
    lacks: ["longbow", "horsearcher"],
    elite: "hearthguard",
    tweak: { manatarms: { def: +1 }, crossbow: { armor: +1 } },
    trait: { name: "Stone-born", text: "infantry +1 def" },
    ability: "shieldwall",
  },
  ulus: {
    id: "ulus",
    name: "Ulus",
    word: "Steppe",
    color: "#b46bd6",
    dark: "#4a2260",
    light: "#d9a9ee",
    charge: "crescent",
    doctrine: "horse archers and lancers",
    lacks: ["manatarms", "pikeman", "longbow", "crossbow"],
    elite: "keshig",
    tweak: { knight: { armor: -1, speed: 10, name: "Lancer" } },
    trait: { name: "Endless Steppe", text: "horse archers +2 volleys; infantry −6 morale" },
    ability: "feint",
  },
};

/** The troops every culture's tree is built from; elites are added per culture. */
export const CORE = [
  "levy",
  "militia",
  "footman",
  "manatarms",
  "spearman",
  "pikeman",
  "bowman",
  "archer",
  "longbow",
  "crossbow",
  "squire",
  "horseman",
  "knight",
  "horsearcher",
];

const ELITES = ["bannerknight", "warden", "hearthguard", "keshig"];

/**
 * Where a culture lacks a troop, it fields the nearest one of the same role
 * (roadmap M1: an Ulus "shieldwall" is footmen and archers). Horse archers
 * fall back to light horse, the nearest thing a culture without them has.
 */
const FALLBACK = {
  manatarms: "footman",
  pikeman: "spearman",
  longbow: "crossbow",
  crossbow: "longbow",
  knight: "horseman",
  horsearcher: "horseman",
  bannerknight: "knight",
  warden: "longbow",
  hearthguard: "manatarms",
  keshig: "horsearcher",
};

/** Does `culture` field `type` itself? */
export function fields(culture, type) {
  const c = CULTURES[culture];
  if (ELITES.includes(type)) return c.elite === type;
  return CORE.includes(type) && !c.lacks.includes(type);
}

/** The troop id a culture fields for `type`: its own variant, or the nearest it has. */
export function cultureTroop(culture, type) {
  if (!culture) return type;
  const seen = new Set();
  let t = type;
  while (!fields(culture, t)) {
    seen.add(t);
    const next = FALLBACK[t];
    // Crossbow and longbow fall back to each other; past both, archers.
    t = next && !seen.has(next) ? next : GENERIC[t].role === "ranged" ? "archer" : "footman";
  }
  return `${culture}:${t}`;
}

/** Every troop a culture can field, lowest tier first. */
export const cultureRoster = (culture) =>
  [...CORE, CULTURES[culture].elite]
    .filter((t) => fields(culture, t))
    .map((t) => `${culture}:${t}`);

const cache = new Map();

/** Stats for any troop id. The same id always returns the same frozen object. */
export function troop(id) {
  let t = cache.get(id);
  if (!t) {
    t = Object.freeze(build(id));
    cache.set(id, t);
  }
  return t;
}

function build(id) {
  const [a, b] = id.includes(":") ? id.split(":") : [null, id];
  if (a === "hero") return heroStats(Number(b));
  const base = GENERIC[b];
  if (!base) throw new Error(`unknown troop ${id}`);
  const t = { id, type: b, culture: a, ...base };
  if (!a) return t;
  const c = CULTURES[a];
  if (!c) throw new Error(`unknown culture ${a}`);
  for (const [k, v] of Object.entries(c.tweak[b] ?? {})) {
    if (k === "name") t.name = v;
    else if (k === "speed") t.speed = v;
    else t[k] += v;
  }
  // Traits (army.md §4). "Infantry" is the inf role: footmen, not spears.
  if (a === "vale") {
    if (t.role === "cav") t.charge *= 1.25;
    if (t.role === "inf") t.morale -= 4;
  } else if (a === "fen") {
    if (t.range) t.range += 10;
  } else if (a === "hold") {
    if (t.role === "inf") t.def += 1;
  } else if (a === "ulus") {
    if (t.role === "ha") t.ammo += 2;
    if (t.role === "inf") t.morale -= 6;
  }
  if (!ELITES.includes(b)) t.name = `${c.word} ${t.name}`;
  return t;
}

/**
 * The hero as one soldier of the banner squad (army.md §6). Role and pace come
 * from the squad, so the hero has neither; they are always the last to fall.
 */
function heroStats(level) {
  const lv = Math.max(1, Math.floor(level));
  return {
    id: `hero:${lv}`,
    type: "hero",
    name: "Hero",
    hero: true,
    tier: 5,
    role: null,
    hp: 60 + 4 * lv,
    atk: 6 + Math.floor(lv / 5),
    def: 6 + Math.floor(lv / 5),
    dmg: 10,
    armor: 5,
    shield: 0.5,
    speed: 0,
    morale: 90,
  };
}

/**
 * What a soldier is worth in militia, against an army you haven't seen
 * (battle.md §10.1): the "strength" the UI shows and doctrines are sized by.
 * Generated by `npm run test:crownless:sim -- worth`; culture variants by
 * `-- cultures`. Do not edit by hand.
 */
// prettier-ignore
export const WORTH = {
  levy: 0.56, militia: 0.89, footman: 1.29, manatarms: 1.82, spearman: 1.39, pikeman: 1.65,
  bowman: 1.07, archer: 1.55, longbow: 2.35, crossbow: 2.05, squire: 1.57, horseman: 2.39,
  knight: 3.86, horsearcher: 2.06, bannerknight: 5.59, warden: 3.09, hearthguard: 2.42,
  keshig: 2.9, wolf: 0.87, troll: 35.98,
  // Culture variants: their tweaks and traits, measured.
  "vale:levy": 0.47, "vale:militia": 0.84, "vale:footman": 1.23, "vale:manatarms": 1.7,
  "vale:spearman": 1.39, "vale:pikeman": 1.65, "vale:bowman": 1.07, "vale:archer": 1.55,
  "vale:crossbow": 2.05, "vale:squire": 1.6, "vale:horseman": 2.48, "vale:knight": 4.16,
  "vale:bannerknight": 5.97, "fen:levy": 0.56, "fen:militia": 0.89, "fen:footman": 1.29,
  "fen:manatarms": 1.83, "fen:spearman": 1.39, "fen:pikeman": 1.65, "fen:bowman": 1.14,
  "fen:archer": 1.68, "fen:longbow": 2.45, "fen:squire": 1.57, "fen:horseman": 2.39,
  "fen:warden": 3.12, "hold:levy": 0.6, "hold:militia": 0.92, "hold:footman": 1.32,
  "hold:manatarms": 1.91, "hold:spearman": 1.39, "hold:pikeman": 1.65, "hold:bowman": 1.07,
  "hold:archer": 1.55, "hold:crossbow": 2.05, "hold:squire": 1.57, "hold:horseman": 2.39,
  "hold:knight": 3.86, "hold:hearthguard": 2.45, "ulus:levy": 0.42, "ulus:militia": 0.84,
  "ulus:footman": 1.2, "ulus:spearman": 1.39, "ulus:bowman": 1.07, "ulus:archer": 1.55,
  "ulus:squire": 1.57, "ulus:horseman": 2.39, "ulus:knight": 3.86, "ulus:horsearcher": 2.11,
  "ulus:keshig": 2.99,
};

/** Worth of any troop id; anything unmeasured counts as its generic type. */
export const worthOf = (id) => {
  if (id.startsWith("hero:")) return 0;
  return WORTH[id] ?? WORTH[troop(id).type];
};

/** Every generic troop type, in table order. */
export const GENERIC_TYPES = Object.keys(GENERIC);
