/**
 * From armies to a battle: doctrines, troops into squads, the banner squad,
 * deployment presets, the field's woods, and the odds (battle.md §2, §5, §7,
 * §12; roadmap M1's Skirmish).
 */
import {
  CULTURES,
  cultureTroop,
  cultureRoster,
  troop,
  worthOf,
  DEFAULT_RANKS,
} from "./data/troops.js";
import {
  createBattle,
  deployLine,
  playRound,
  standing,
  FIELD_W,
  FIELD_H,
  SPACING,
} from "./battle.js";
import { roll, derive, pick } from "./rng.js";

/**
 * The six doctrines of battle.md §10.3: shares of an army's worth, by troop.
 * A culture that lacks a troop fields its nearest one of the same role.
 */
export const DOCTRINES = {
  balanced: {
    name: "Balanced",
    mix: { footman: 0.35, spearman: 0.15, archer: 0.3, horseman: 0.2 },
  },
  shieldwall: { name: "Shieldwall", mix: { manatarms: 0.45, footman: 0.2, crossbow: 0.35 } },
  knights: { name: "Knights", mix: { knight: 0.6, militia: 0.25, bowman: 0.15 } },
  horde: { name: "Horde", mix: { levy: 0.5, militia: 0.4, bowman: 0.1 } },
  steppe: { name: "Steppe", mix: { horsearcher: 0.65, horseman: 0.35 } },
  yeomen: { name: "Yeomen", mix: { longbow: 0.55, pikeman: 0.3, militia: 0.15 } },
};

/** Squads per role before a role splits; the most squads an army fields besides its banner. */
export const SQUAD_MEN = 40;
export const MAX_SQUADS = 8;

/**
 * An army of `worth` militia in a doctrine, as troop counts. `doctrine` may
 * be "random", which rolls two to four of the culture's troops and shares.
 */
export function buildArmy(culture, doctrine, worth, seed = 1) {
  let mix;
  if (doctrine === "random") {
    const o = { rng: derive(seed, 31) };
    const roster = cultureRoster(culture);
    const k = 2 + Math.floor(roll(o) * 3);
    const types = [];
    while (types.length < k) {
      const t = pick(o, roster);
      if (!types.includes(t)) types.push(t);
    }
    const w = types.map(() => 0.5 + roll(o));
    const sum = w.reduce((a, c) => a + c, 0);
    mix = Object.fromEntries(types.map((t, i) => [t, w[i] / sum]));
  } else {
    mix = {};
    for (const [type, share] of Object.entries(DOCTRINES[doctrine].mix)) {
      const id = culture ? cultureTroop(culture, type) : type;
      mix[id] = (mix[id] ?? 0) + share;
    }
  }
  return Object.entries(mix).map(([type, share]) => ({
    type,
    n: Math.max(1, Math.round((worth * share) / worthOf(type))),
  }));
}

/**
 * Troops into squads, by role (battle.md §2): a role past 40 men splits into
 * squads of about equal size, best troops first, and an army fields at most
 * eight. Squads of one role may hold several troop types.
 */
export function armySquads(troops) {
  const byRole = new Map();
  for (const t of troops) {
    if (!t.n) continue;
    const role = troop(t.type).role;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push({ ...t });
  }
  const roles = [...byRole.keys()];
  const men = (role) => byRole.get(role).reduce((m, t) => m + t.n, 0);
  const k = new Map(roles.map((r) => [r, Math.max(1, Math.ceil(men(r) / SQUAD_MEN))]));
  for (;;) {
    const total = [...k.values()].reduce((a, c) => a + c, 0);
    if (total <= MAX_SQUADS) break;
    // Merge where it costs least: the role with the most squads.
    const r = roles.reduce((a, c) => (k.get(c) > k.get(a) ? c : a));
    k.set(r, k.get(r) - 1);
  }
  const out = [];
  for (const role of roles) {
    const list = byRole.get(role).sort((a, c) => troop(c.type).tier - troop(a.type).tier);
    const total = men(role);
    const n = k.get(role);
    let i = 0;
    for (let s = 0; s < n; s++) {
      let want = Math.round(total / n);
      if (s === n - 1) want = Infinity;
      const units = [];
      while (want > 0 && i < list.length) {
        const take = Math.min(want, list[i].n);
        units.push({ type: list[i].type, n: take });
        list[i].n -= take;
        want -= take;
        if (list[i].n === 0) i++;
      }
      if (units.length) out.push({ units });
    }
  }
  return out;
}

/**
 * A hero for Skirmish at level N (army.md §6): every attribute 1 + ⌊N/4⌋;
 * Leadership, Tactics and Offense at min(3, ⌈N/8⌉); Rally, Hold the Line,
 * the culture's ability, and Inspire from Leadership Advanced.
 */
export function skirmishHero(culture, level) {
  if (!level) return null;
  const a = 1 + Math.floor(level / 4);
  const r = Math.min(3, Math.ceil(level / 8));
  const abilities = ["rally", "holdline"];
  if (culture) abilities.push(CULTURES[culture].ability);
  if (r >= 2) abilities.push("inspire");
  return {
    level,
    culture,
    might: a,
    guard: a,
    command: a,
    cunning: a,
    leadership: r,
    tactics: r,
    offense: r,
    abilities,
  };
}

/**
 * The banner squad (battle.md §6): the hero, any guards, and — with fewer
 * than 4 men besides the hero — a household of 4 of the home culture's
 * footmen, who are the hero's own and not part of the army.
 */
export function bannerSquad(hero, guards = []) {
  const units = guards.filter((g) => g.n > 0).map((g) => ({ ...g }));
  const men = units.reduce((m, u) => m + u.n, 0);
  if (men < 4) units.push({ type: cultureTroop(hero.culture, "footman"), n: 4 });
  units.push({ type: `hero:${hero.level}`, n: 1 });
  const role = units.length && guards.length ? troop(guards[0].type).role : "inf";
  return { units, role, banner: true };
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export const PRESETS = {
  line: { name: "Line", text: "foot in the middle, ranged behind, horse on both wings" },
  refused: { name: "Refused", text: "left wing held back, horse massed on the right" },
  hammer: { name: "Hammer", text: "the line, with every horse on the right wing" },
  defensive: { name: "Defensive", text: "ranged in front of a held line, horse in reserve" },
};

/** Where a side may deploy: 45 m deep from its own end, 10 m more per Tactics rank. */
export function band(side, tactics = 0) {
  const depth = 45 + 10 * tactics;
  return side === 0
    ? { x0: 4, x1: FIELD_W - 4, y0: FIELD_H - depth, y1: FIELD_H - 4 }
    : { x0: 4, x1: FIELD_W - 4, y0: 4, y1: depth };
}

const roleOf = (s) => s.role ?? troop((s.units ?? [s])[0].type).role;

/** Lay out a side's squad specs by a preset. */
export function deploy(list, side, preset = "line") {
  const out = deployLine(list, side);
  const back = side === 0 ? 1 : -1;
  const y0 = side === 0 ? FIELD_H - 30 : 30;
  const horse = out.filter((s) => !s.banner && (roleOf(s) === "cav" || roleOf(s) === "ha"));
  const rightWing = (s, k) => ({ ...s, x: FIELD_W - 10 - k * 12, y: y0 + back * 4 });
  if (preset === "refused" || preset === "hammer") {
    let k = 0;
    for (let i = 0; i < out.length; i++) {
      if (horse.includes(out[i])) out[i] = rightWing(out[i], k++);
    }
  }
  if (preset === "refused") {
    // Pull the left of the line back, more the further left it stands.
    for (const s of out) {
      const r = roleOf(s);
      if (s.banner || r === "cav" || r === "ha") continue;
      if (s.x < FIELD_W / 2) s.y += back * ((FIELD_W / 2 - s.x) / (FIELD_W / 2)) * 16;
    }
  }
  if (preset === "defensive") {
    for (const s of out) {
      const r = roleOf(s);
      if (s.banner) continue;
      if (r === "ranged") s.y = y0 - back * 4;
      else if (r === "cav" || r === "ha") s.y = y0 + back * 14;
      else s.y = y0 + back * 6;
    }
  }
  for (const s of out) clampTo(s, band(side, 3));
  return out;
}

function clampTo(s, bd) {
  s.x = Math.max(bd.x0, Math.min(bd.x1, s.x));
  s.y = Math.max(bd.y0, Math.min(bd.y1, s.y));
}

/** Re-lay one side of a battle that hasn't started yet. */
export function applyPreset(b, side, preset) {
  if (b.round > 0) return;
  const mine = b.squads.filter((s) => s.side === side);
  const specs = mine.map((s) => ({ units: s.units, role: s.role, banner: s.banner, id: s.id }));
  const placed = deploy(specs, side, preset);
  for (const p of placed) {
    const s = b.squads[p.id];
    s.x = p.x;
    s.y = p.y;
  }
  b.sides[side].preset = preset;
}

/** Move one of your squads within your band before the battle starts. */
export function placeSquad(b, id, x, y) {
  const s = b.squads[id];
  if (!s || b.round > 0) return false;
  const bd = band(s.side, b.sides[s.side].hero?.tactics ?? 0);
  s.x = x;
  s.y = y;
  clampTo(s, bd);
  return true;
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/** Two or three copses between the lines, mostly on the flanks (battle.md §7). */
export function makeWoods(seed) {
  const o = { rng: derive(seed, 53) };
  const r = (lo, hi) => lo + roll(o) * (hi - lo);
  const woods = [
    { x: r(4, 18), y: r(50, 90), rx: r(6, 10), ry: r(9, 15) },
    { x: r(82, 96), y: r(45, 95), rx: r(6, 10), ry: r(9, 15) },
  ];
  if (roll(o) < 0.5) woods.push({ x: r(35, 65), y: r(62, 78), rx: r(5, 8), ry: r(4, 7) });
  return woods;
}

// ---------------------------------------------------------------------------
// Skirmish
// ---------------------------------------------------------------------------

/**
 * A Skirmish: each side a culture, a doctrine, a worth and a hero level.
 * Side 0 is the player's unless `ai` says otherwise.
 *
 * @param {{seed: number, terrain?: "open"|"woods",
 *          sides: {culture: string, doctrine: string, worth: number, hero: number,
 *                  preset?: string, ai?: boolean}[]}} s
 */
export function skirmish(s) {
  const sides = s.sides.map((sd, side) => {
    const troops = buildArmy(sd.culture, sd.doctrine, sd.worth, derive(s.seed, side));
    const hero = skirmishHero(sd.culture, sd.hero);
    const specs = armySquads(troops);
    if (hero) specs.push(bannerSquad(hero));
    return {
      name: CULTURES[sd.culture]?.name ?? (side === 0 ? "You" : "Them"),
      culture: sd.culture,
      hero,
      ai: sd.ai ?? side === 1,
      place: true,
      squads: deploy(specs, side, sd.preset ?? "line"),
    };
  });
  const b = createBattle({
    seed: s.seed,
    sides,
    woods: s.terrain === "woods" ? makeWoods(s.seed) : [],
  });
  b.sides.forEach((sd, i) => (sd.preset = s.sides[i].preset ?? "line"));
  return b;
}

// ---------------------------------------------------------------------------
// Odds (battle.md §12)
// ---------------------------------------------------------------------------

export const ODDS_WORDS = [
  [8, "Overwhelming"],
  [6, "Favourable"],
  [3, "Even"],
  [1, "Risky"],
  [0, "Hopeless"],
];
export const oddsWord = (wins) => ODDS_WORDS.find(([w]) => wins >= w)[1];

/**
 * One of the eight auto-resolves behind the odds: the battle as it stands,
 * its own seed, the plain AI commanding both sides. Returns whether side 0
 * won and what it lost, by troop. The view runs these one a frame.
 */
export function oddsRun(b, i, base = JSON.stringify(b)) {
  const c = JSON.parse(base);
  c.seed = derive(b.seed, 1000 + i);
  c.rng = c.seed;
  for (const sd of c.sides) sd.ai = true;
  for (const s of c.squads) s.cmd = null;
  while (!c.over) playRound(c, { record: false });
  const dead = {};
  for (const s of c.squads) {
    if (s.side !== 0) continue;
    for (const u of s.units) {
      if (troop(u.type).hero) continue;
      dead[u.type] = (dead[u.type] ?? 0) + u.n0 - u.n;
    }
  }
  return { won: c.winner === 0, dead };
}

/** The odds from a set of runs: wins, the word for them, the median losses. */
export function summarizeOdds(runs) {
  const wins = runs.filter((r) => r.won).length;
  const types = new Set(runs.flatMap((r) => Object.keys(r.dead)));
  const losses = {};
  for (const t of types) {
    const list = runs.map((r) => r.dead[t] ?? 0).sort((x, y) => x - y);
    const m = list[Math.floor((list.length - 1) / 2)];
    if (m > 0) losses[t] = m;
  }
  return { wins, runs: runs.length, word: oddsWord(Math.round((wins * 8) / runs.length)), losses };
}

/** Battle.md §12: eight auto-resolves, summarized. */
export function odds(b, runs = 8) {
  const base = JSON.stringify(b);
  return summarizeOdds(Array.from({ length: runs }, (_, i) => oddsRun(b, i, base)));
}

/** Men and worth a side has standing, for the HUD and the setup sheet. */
export function strength(b, side) {
  let men = 0;
  let worth = 0;
  for (const s of b.squads) {
    if (s.side !== side || !standing(s)) continue;
    for (const u of s.units) {
      if (troop(u.type).hero) continue;
      men += u.n;
      worth += u.n * worthOf(u.type);
    }
  }
  return { men, worth };
}

export { SPACING, DEFAULT_RANKS };
