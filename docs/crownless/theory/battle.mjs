/**
 * Crownless battle model — the theorycraft prototype behind ../battle.md.
 *
 * This is not the game. It is the smallest model of the battle rules that can
 * answer the design's numeric questions honestly: what is a knight worth in
 * militia, does a spear really beat a horse at equal worth, how many rounds a
 * battle lasts, what doubling an army buys, what a hero's +10 morale is worth.
 * `report.mjs` asks those questions; the tables in ../battle.md are its output.
 *
 * It is written the way the game's `rules/battle.js` should be: pure, seeded,
 * fixed-step, no DOM. When that module exists, port report.mjs to import it
 * (tests/crownless/) and delete this file.
 *
 * The model, in brief (../battle.md has the reasoning):
 *   - A squad is N soldiers of one type in a rectangle: `files` wide, the rest
 *     deep. Casualties come off the back, so a squad keeps its frontage until
 *     it is one rank deep.
 *   - Melee is frontage-limited. Only soldiers along the touching edge fight
 *     (two ranks for spears), plus a wider line's overhang folding round the
 *     ends. That puts melee between Lanchester's linear and square laws, and
 *     the advantage saturates: past about twice the men, the extra stand idle.
 *   - Damage pools, HoMM-style: hits accumulate on the squad and every `hp`
 *     of it drops one soldier, so overkill carries to the next man.
 *   - Facing matters. Hits on the flank do +30%, on the rear +60%; a squad hit
 *     from behind fights back with a quarter of its contact.
 *   - Cavalry deal a one-off charge on first contact after a run-up. Braced
 *     spears facing it take 30% and answer with their own. The AI's horse
 *     rides round lines rather than into them, and pulls out to charge again.
 *   - Shields stop arrows from the front, and only while not in melee.
 *   - Morale decides battles, not body counts: losses, flanks and nearby
 *     routs drain it; below 20 a squad runs. An army with under 40% of its men
 *     still standing bleeds nerve every round, which is what ends a battle.
 *   - Fortune is one ±15% roll per squad per round, so a seed matters and the
 *     odds shown before a fight can be honest percentages.
 *   - Everything in a step is computed from one snapshot and applied after,
 *     so the order squads are stored in never decides who strikes first.
 */

export const ROUND_S = 3; // seconds of simulation per planning round
export const DT = 0.1; // fixed step; 30 steps a round
export const SPACING = 1.5; // metres between soldiers, both ways
export const FIELD_W = 100;
export const FIELD_H = 140;
export const MAX_ROUNDS = 40;

// ---------------------------------------------------------------------------
// Troops. One generic culture; cultures are skews on these (../army.md §4).
// dmg is melee damage per fighting soldier per round; mdmg per arrow that hits.
// ---------------------------------------------------------------------------

export const TROOPS = {
  // Infantry: the generalist. Shields grow with tier, which is what lets a
  // shield line walk through arrows that would shred spears.
  levy: {
    tier: 1,
    role: "inf",
    hp: 22,
    atk: 2,
    def: 2,
    dmg: 5,
    armor: 0,
    shield: 0,
    speed: 4.5,
    morale: 50,
  },
  militia: {
    tier: 2,
    role: "inf",
    hp: 26,
    atk: 3,
    def: 3,
    dmg: 6,
    armor: 1,
    shield: 0.3,
    speed: 4.5,
    morale: 60,
  },
  footman: {
    tier: 3,
    role: "inf",
    hp: 30,
    atk: 5,
    def: 4,
    dmg: 7.5,
    armor: 2,
    shield: 0.4,
    speed: 4.5,
    morale: 66,
  },
  manatarms: {
    tier: 4,
    role: "inf",
    hp: 35,
    atk: 6,
    def: 7,
    dmg: 9,
    armor: 4,
    shield: 0.45,
    speed: 4.2,
    morale: 72,
  },
  // Spears fight two ranks deep, so their per-man damage is lower; their
  // whole point is antiCav and the brace that blunts a charge.
  spearman: {
    tier: 3,
    role: "spear",
    hp: 30,
    atk: 3,
    def: 5,
    dmg: 4.5,
    armor: 2,
    shield: 0.3,
    speed: 4.3,
    morale: 66,
    reach: 2,
    antiCav: 2,
    brace: true,
  },
  pikeman: {
    tier: 4,
    role: "spear",
    hp: 34,
    atk: 4,
    def: 6,
    dmg: 5,
    armor: 3,
    shield: 0,
    speed: 4,
    morale: 72,
    reach: 2,
    antiCav: 2.4,
    brace: true,
  },
  // Ranged: weak in melee, and every volley depends on range, armour, shields.
  bowman: {
    tier: 2,
    role: "ranged",
    hp: 22,
    atk: 1,
    def: 1,
    dmg: 4,
    armor: 0,
    shield: 0,
    speed: 4.5,
    morale: 52,
    range: 60,
    mdmg: 7,
    acc: 0.5,
    reload: 3,
    ammo: 10,
  },
  archer: {
    tier: 3,
    role: "ranged",
    hp: 25,
    atk: 2,
    def: 2,
    dmg: 5,
    armor: 1,
    shield: 0,
    speed: 4.5,
    morale: 58,
    range: 70,
    mdmg: 8,
    acc: 0.55,
    reload: 3,
    ammo: 12,
  },
  longbow: {
    tier: 4,
    role: "ranged",
    hp: 28,
    atk: 3,
    def: 3,
    dmg: 6,
    armor: 1,
    shield: 0,
    speed: 4.5,
    morale: 64,
    range: 90,
    mdmg: 9.5,
    acc: 0.6,
    reload: 3,
    ammo: 14,
  },
  crossbow: {
    tier: 4,
    role: "ranged",
    hp: 30,
    atk: 2,
    def: 4,
    dmg: 5,
    armor: 3,
    shield: 0,
    speed: 4,
    morale: 64,
    range: 75,
    mdmg: 13,
    acc: 0.65,
    reload: 4.5,
    ammo: 12,
    pierce: 0.6,
  },
  // Cavalry: a horse is most of the hit points, the charge is most of the damage.
  horseman: {
    tier: 3,
    role: "cav",
    hp: 36,
    atk: 5,
    def: 3,
    dmg: 7,
    armor: 2,
    shield: 0.3,
    speed: 10,
    morale: 66,
    charge: 8,
  },
  knight: {
    tier: 4,
    role: "cav",
    hp: 44,
    atk: 6,
    def: 5,
    dmg: 8,
    armor: 5,
    shield: 0.5,
    speed: 9,
    morale: 76,
    charge: 12,
  },
  horsearcher: {
    tier: 4,
    role: "ha",
    hp: 34,
    atk: 3,
    def: 3,
    dmg: 5,
    armor: 2,
    shield: 0,
    speed: 11,
    morale: 64,
    range: 60,
    mdmg: 7.5,
    acc: 0.5,
    reload: 3,
    ammo: 14,
  },
  // The castle line starts mounted.
  squire: {
    tier: 2,
    role: "cav",
    hp: 30,
    atk: 4,
    def: 2,
    dmg: 6,
    armor: 1,
    shield: 0.2,
    speed: 10,
    morale: 58,
    charge: 6,
  },
  // Tier 5: one per culture, each the far end of that culture's best line.
  bannerknight: {
    tier: 5,
    role: "cav",
    hp: 50,
    atk: 7,
    def: 6,
    dmg: 9,
    armor: 6,
    shield: 0.5,
    speed: 9,
    morale: 84,
    charge: 16,
  },
  warden: {
    tier: 5,
    role: "ranged",
    hp: 30,
    atk: 4,
    def: 4,
    dmg: 6.5,
    armor: 2,
    shield: 0,
    speed: 4.5,
    morale: 70,
    range: 100,
    mdmg: 11,
    acc: 0.65,
    reload: 3,
    ammo: 16,
  },
  hearthguard: {
    tier: 5,
    role: "inf",
    hp: 40,
    atk: 7,
    def: 8,
    dmg: 10,
    armor: 5,
    shield: 0.5,
    speed: 4,
    morale: 80,
  },
  keshig: {
    tier: 5,
    role: "ha",
    hp: 40,
    atk: 5,
    def: 5,
    dmg: 7,
    armor: 4,
    shield: 0,
    speed: 11,
    morale: 74,
    range: 65,
    mdmg: 9,
    acc: 0.55,
    reload: 3,
    ammo: 16,
  },
  // Beasts. Wolves are fast and fragile and come in packs.
  wolf: {
    tier: 2,
    role: "cav",
    hp: 18,
    atk: 4,
    def: 2,
    dmg: 6,
    armor: 0,
    shield: 0,
    speed: 12,
    morale: 55,
    charge: 4,
  },
  // A monster: few, huge, frightening. Pooled damage makes its big hits cleave.
  troll: {
    tier: 5,
    role: "monster",
    hp: 400,
    atk: 8,
    def: 6,
    dmg: 70,
    armor: 4,
    shield: 0,
    speed: 4,
    morale: 90,
    fear: 4,
    ranks: 1,
    spacing: 4,
  },
};

const DEFAULT_RANKS = { inf: 4, spear: 4, ranged: 2, cav: 2, ha: 2, monster: 1 };

/** The attack/defence curve: 8% per point, either way, never zero. */
export const edge = (atk, def) => Math.pow(1.08, atk - def);

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32). Battles are deterministic for a seed, so auto-resolve
// and the odds shown before a fight are the same function.
// ---------------------------------------------------------------------------

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * @param {{type: string, n: number, x?: number, y?: number}[][]} sides
 *   Two arrays of squads. Positions default to a line-abreast deployment.
 */
export function createBattle(sides, seed = 1, opts = {}) {
  const squads = [];
  sides.forEach((list, side) => {
    const placed = opts.place ? list : deploy(list, side);
    for (const spec of placed) squads.push(makeSquad(squads.length, side, spec));
  });
  // Army-wide modifiers: what a hero's skills, abilities and banner do.
  const mods = [0, 1].map((side) => ({
    melee: 1,
    ranged: 1,
    def: 0,
    morale: 0,
    ...(opts.mods?.[side] ?? {}),
  }));
  for (const s of squads) {
    s.morale += mods[s.side].morale;
    s.cap += mods[s.side].morale;
  }
  return {
    squads,
    mods,
    rng: makeRng(seed),
    round: 0,
    t: 0,
    over: false,
    winner: null,
    ai: opts.ai ?? [defaultAI, defaultAI],
    log: [],
  };
}

/**
 * Formations (../battle.md §2). Wide stretches a squad to match a bigger
 * enemy's frontage so it can't be wrapped, but never wraps anyone itself and a
 * thin line has thin nerve. Deep fights with fewer men but holds: for chokes,
 * walls and charges. Line is the default and the only one that envelops.
 * Every formation that could envelop always won when it did (report.mjs
 * formations), so only Line may.
 */
export const FORMATIONS = {
  line: { ranks: 1, pressure: 1, morale: 0, wraps: true },
  wide: { ranks: 0.5, pressure: 1.5, morale: -5, wraps: false },
  deep: { ranks: 2, pressure: 0.5, morale: 10, wraps: true },
};

function makeSquad(id, side, { type, n, x, y, formation = "line" }) {
  const t = TROOPS[type];
  if (!t) throw new Error(`unknown troop ${type}`);
  const form = FORMATIONS[formation];
  const ranks = Math.max(1, Math.round((t.ranks ?? DEFAULT_RANKS[t.role]) * form.ranks));
  return {
    id,
    side,
    type,
    t,
    n,
    n0: n,
    files0: Math.max(1, Math.ceil(n / ranks)),
    spacing: t.spacing ?? SPACING,
    x,
    y,
    fx: 0,
    fy: side === 0 ? -1 : 1,
    speedNow: 0,
    runUp: 0, // seconds spent moving at speed; a charge needs CHARGE_RUNUP of it
    engagedFor: 0, // seconds continuously in melee
    pool: 0,
    form,
    cap: t.morale + form.morale, // the most nerve it can recover to
    morale: t.morale + form.morale,
    luck: 1,
    state: "ok", // ok | wavering | routing | fled | dead
    order: { kind: "advance", target: null },
    reload: 0,
    ammo: t.ammo ?? 0,
    contacts: new Set(), // ids in contact last step, for charge detection
    since: new Map(), // id -> time contact began, so the oldest is the "front"
    lostRound: 0,
    dealtRound: 0,
    flankedRound: 0,
    deaths: 0,
    routed: false,
  };
}

/** Line abreast: infantry centre, spears beside, ranged behind, horse on the wings. */
function deploy(list, side) {
  const y0 = side === 0 ? FIELD_H - 30 : 30;
  const back = side === 0 ? 1 : -1;
  const order = { monster: 0, inf: 1, spear: 2, ranged: 3, ha: 4, cav: 5 };
  const sorted = [...list].sort((a, b) => order[TROOPS[a.type].role] - order[TROOPS[b.type].role]);
  const front = sorted.filter((s) => ["inf", "spear", "monster"].includes(TROOPS[s.type].role));
  const rear = sorted.filter((s) => TROOPS[s.type].role === "ranged");
  const wings = sorted.filter((s) => ["cav", "ha"].includes(TROOPS[s.type].role));
  const width = (s) =>
    Math.ceil(s.n / (TROOPS[s.type].ranks ?? DEFAULT_RANKS[TROOPS[s.type].role])) *
    (TROOPS[s.type].spacing ?? SPACING);
  const lay = (row, y) => {
    const total = row.reduce((w, s) => w + width(s) + 4, -4);
    let x = FIELD_W / 2 - total / 2;
    return row.map((s) => {
      const w = width(s);
      const out = { ...s, x: x + w / 2, y };
      x += w + 4;
      return out;
    });
  };
  // With no front line, the ranged troops stand at the front.
  const out = [...lay(front, y0), ...lay(rear, front.length ? y0 + back * 10 : y0)];
  wings.forEach((s, i) => {
    const left = i % 2 === 0;
    const k = Math.floor(i / 2);
    out.push({ ...s, x: left ? 10 + k * 12 : FIELD_W - 10 - k * 12, y: y0 + back * 4 });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Geometry. A squad is a rectangle; its extent along any direction is the
// rectangle's support function, which is all contact and frontage need.
// ---------------------------------------------------------------------------

const files = (s) => Math.min(s.files0, s.n);
const depthOf = (s) => Math.ceil(s.n / Math.max(1, files(s)));
const halfW = (s) => (files(s) * s.spacing) / 2;
const halfD = (s) => (depthOf(s) * s.spacing) / 2;

function extent(s, ux, uy) {
  const along = Math.abs(ux * s.fx + uy * s.fy);
  const across = Math.abs(ux * -s.fy + uy * s.fx);
  return halfW(s) * across + halfD(s) * along;
}

/** Width of `s` seen from direction u — how much of it can be touched. */
const breadth = (s, ux, uy) => 2 * extent(s, -uy, ux);

const alive = (s) => s.state === "ok" || s.state === "wavering" || s.state === "routing";
const standing = (s) => s.state === "ok" || s.state === "wavering";

/** Which face of `def` an attack from `att` lands on: 0 front, 1 flank, 2 rear. */
function faceHit(def, att) {
  const dx = att.x - def.x;
  const dy = att.y - def.y;
  const d = Math.hypot(dx, dy) || 1;
  const cos = (dx * def.fx + dy * def.fy) / d;
  return cos > 0.5 ? 0 : cos > -0.5 ? 1 : 2;
}

const FLANK_DMG = [1, 1.3, 1.6];
const CHARGE_RUNUP = 1.5; // seconds at speed before contact; ~13 m for a horse
const FIGHT_BACK = [1, 0.5, 0.25];
// Morale lost a round at full flank pressure. Pressure counts men on your flank
// once and men at your back twice, against your own numbers.
const FLANK_DRAIN = 6;
export const MELEE = 1.0; // global melee damage scale: the knob for battle length
export const CYCLE = true; // whether the AI's cavalry cycle-charges
export const LUCK = 0.15; // each squad's damage swings ±15% round to round
export const BREAK_AT = 0.4; // an army with less than this standing is losing...
export const BREAK_DRAIN = 12; // ...and every squad still in it loses this much nerve a round

// ---------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------

/** Play one planning round: AI picks orders, then ROUND_S seconds of sim. */
export function playRound(b) {
  if (b.over) return;
  beginRound(b);
  const steps = Math.round(ROUND_S / DT);
  for (let i = 0; i < steps; i++) step(b);
  finishRound(b);
}

/**
 * The two halves of a round, for anyone who needs to watch the steps in
 * between (the mockups do; so will the game's view, which animates them).
 */
export function beginRound(b) {
  for (const side of [0, 1]) b.ai[side](b, side);
  for (const s of b.squads) {
    s.lostRound = 0;
    s.dealtRound = 0;
    s.flankedRound = 0;
    // Fortune: one roll per squad per round. Per-step noise averages away over
    // thirty steps; a round-long swing is what makes a battle a gamble.
    s.luck = 1 - LUCK + 2 * LUCK * b.rng();
  }
}

export function finishRound(b) {
  endOfRound(b);
  b.round++;
  checkOver(b);
}

export function step(b) {
  const sq = b.squads;
  // 1. Contacts this step.
  const contacts = new Map(sq.map((s) => [s.id, []]));
  for (const a of sq) {
    if (!alive(a) || a.side !== 0) continue;
    for (const c of sq) {
      if (!alive(c) || c.side !== 1) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d;
      const uy = dy / d;
      const gap = d - extent(a, ux, uy) - extent(c, ux, uy);
      if (gap <= 0.8) {
        // The overlap fights face to face. A wider line's excess folds round
        // the other's ends, up to the length of its sides: that is how a
        // bigger army brings its numbers to bear without a square law.
        const ba = breadth(a, ux, uy);
        const bc = breadth(c, ux, uy);
        const width = Math.min(ba, bc);
        const wrapA = a.form.wraps ? Math.max(0, Math.min(ba - bc, 4 * extent(c, ux, uy))) : 0;
        const wrapC = c.form.wraps ? Math.max(0, Math.min(bc - ba, 4 * extent(a, ux, uy))) : 0;
        contacts.get(a.id).push({ o: c, width, wrap: wrapA, wrapped: wrapC });
        contacts.get(c.id).push({ o: a, width, wrap: wrapC, wrapped: wrapA });
      }
    }
  }

  // 2. Charges: first contact after a run-up. Everything in a step is worked
  // out from the same snapshot and applied after, so squad order never decides
  // who strikes first.
  const blows = [];
  for (const a of sq) {
    if (!standing(a) || !a.t.charge) continue;
    for (const { o, width } of contacts.get(a.id)) {
      if (a.contacts.has(o.id)) continue;
      if (a.runUp < CHARGE_RUNUP) continue;
      const face = faceHit(o, a);
      const front = Math.min(a.n, Math.ceil(width / a.spacing));
      const braced = o.t.brace && face === 0 && standing(o) && o.speedNow < 1;
      let impact = front * a.t.charge * edge(a.t.atk, o.t.def) * FLANK_DMG[face] * a.luck;
      if (braced) {
        impact *= 0.3;
        const spears = Math.min(o.n, Math.ceil(width / o.spacing) * (o.t.reach ?? 1));
        blows.push([a, spears * o.t.dmg * (o.t.antiCav ?? 1) * edge(o.t.atk, a.t.def), o]);
      }
      blows.push([o, impact, a]);
      if (standing(o)) o.morale -= braced ? 4 : 10 + 6 * face;
    }
  }

  // 3. Melee.
  const dmgOut = [];
  for (const a of sq) {
    const list = contacts.get(a.id);
    if (!list.length || a.state === "routing" || !alive(a)) continue;
    // Raw fighters per front: the overlap, the wrap round their ends, and the
    // men turning to face a wrap round ours. Then cap the total at the men
    // there are.
    const fronts = [];
    for (const { o, width, wrap, wrapped } of list) {
      const myFace = faceHit(a, o);
      const theirFace = faceHit(o, a);
      fronts.push({
        o,
        men: Math.ceil(width / a.spacing) * (a.t.reach ?? 1) * FIGHT_BACK[myFace],
        face: theirFace,
      });
      if (wrap > 0) fronts.push({ o, men: wrap / a.spacing, face: Math.max(1, theirFace) });
      if (wrapped > 0)
        fronts.push({ o, men: (wrapped / a.spacing) * FIGHT_BACK[1], face: theirFace });
    }
    const total = fronts.reduce((x, f) => x + f.men, 0);
    const scale = total > a.n ? a.n / total : 1;
    for (const { o, men, face } of fronts) {
      let mult = edge(a.t.atk, o.t.def) * FLANK_DMG[face];
      if (a.t.antiCav && (o.t.role === "cav" || o.t.role === "ha")) mult *= a.t.antiCav;
      if (a.state === "wavering") mult *= 0.8;
      if (o.state === "routing") mult *= 1.5; // cutting down men who have turned
      mult *= b.mods[a.side].melee * edge(0, b.mods[o.side].def);
      dmgOut.push([o, (men * scale * a.t.dmg * mult * a.luck * DT * MELEE) / ROUND_S, a]);
      // Flank pressure: how many are on your side or back, against how many you are.
      if (face > 0 && standing(o))
        o.flankedRound += (men * scale * (face === 2 ? 2 : 1) * DT) / ROUND_S / Math.max(1, o.n);
    }
  }

  // 4. Missiles.
  for (const a of sq) {
    if (!a.t.range || !standing(a) || a.ammo <= 0) continue;
    a.reload -= DT;
    if (a.reload > 0) continue;
    if (contacts.get(a.id).length) continue; // in melee: no shooting
    const moving = a.speedNow > 0.5;
    if (moving && a.t.role !== "ha") continue;
    const tgt = rangedTarget(b, a);
    if (!tgt) continue;
    const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
    const acc = a.t.acc * (1 - 0.5 * (d / a.t.range)) * (moving ? 0.7 : 1);
    const armor = tgt.t.armor * (1 - (a.t.pierce ?? 0));
    // Shields stop arrows from the front, and only while they are not busy
    // with the man in front of them.
    const facing = faceHit(tgt, a) === 0 && !contacts.get(tgt.id).length;
    const shield = facing ? 1 - tgt.t.shield : 1;
    const hits = a.n * acc * a.luck;
    const per = a.t.mdmg * edge(0, armor) * shield * b.mods[a.side].ranged;
    // A volley into a melee lands on whoever is in it, friends included.
    const melee = contacts.get(tgt.id).filter(({ o }) => o.side === a.side);
    const friendMen = melee.reduce((m, { o }) => m + Math.min(o.n, 20), 0);
    const share = friendMen ? tgt.n / (tgt.n + friendMen) : 1;
    blows.push([tgt, hits * per * share, a]);
    if (friendMen) {
      for (const { o } of melee) {
        blows.push([o, (hits * per * (1 - share) * Math.min(o.n, 20)) / friendMen, a]);
      }
    }
    a.reload = a.t.reload;
    a.ammo--;
  }
  for (const [o, d, a] of blows) hurt(b, o, d, a);
  for (const [o, d, a] of dmgOut) hurt(b, o, d, a);

  // 5. Movement.
  for (const a of sq) {
    if (!alive(a)) continue;
    const engaged = contacts.get(a.id).length > 0;
    let gx = a.x;
    let gy = a.y;
    let speed = a.t.speed;
    if (a.state === "routing") {
      gy = a.side === 0 ? FIELD_H + 20 : -20;
      speed *= 1.1;
    } else if (engaged && !a.order.withdraw) {
      speed = 0;
      // Turn to face the oldest contact — the one you were fighting first.
      const first = oldest(a, contacts.get(a.id));
      turnToward(a, first.x - a.x, first.y - a.y, 0.8);
    } else {
      const g = goal(b, a);
      gx = g.x;
      gy = g.y;
      speed *= g.pace;
      if (a.state === "wavering") speed *= 0.8;
      // Pulling out of a melee is slow, and your back is to them while you do.
      if (engaged) speed *= 0.6;
    }
    const dx = gx - a.x;
    const dy = gy - a.y;
    const d = Math.hypot(dx, dy);
    if (speed > 0 && d > 0.3) {
      const v = Math.min(speed, d / DT);
      a.x += (dx / d) * v * DT;
      a.y += (dy / d) * v * DT;
      a.speedNow = v;
      if (a.state !== "routing") turnToward(a, dx, dy, 1.5);
      else {
        a.fx = 0;
        a.fy = a.side === 0 ? 1 : -1;
      }
    } else a.speedNow = 0;
    a.x = Math.max(2, Math.min(FIELD_W - 2, a.x));
  }
  separate(b, contacts);

  // 6. Bookkeeping.
  for (const a of sq) {
    // Any contact, or slowing down, spends the run-up: one charge per approach.
    if (contacts.get(a.id).length || a.speedNow < 0.6 * a.t.speed) a.runUp = 0;
    else a.runUp += DT;
    a.engagedFor = contacts.get(a.id).length ? a.engagedFor + DT : 0;
    const now = new Set(contacts.get(a.id).map(({ o }) => o.id));
    for (const id of now) if (!a.since.has(id)) a.since.set(id, b.t);
    for (const id of [...a.since.keys()]) if (!now.has(id)) a.since.delete(id);
    a.contacts = now;
    if (a.state === "routing" && (a.y < -5 || a.y > FIELD_H + 5)) a.state = "fled";
  }
  b.t += DT;
}

function oldest(a, list) {
  let best = list[0].o;
  let t = Infinity;
  for (const { o } of list) {
    const s = a.since.get(o.id) ?? Infinity;
    if (s < t) {
      t = s;
      best = o;
    }
  }
  return best;
}

function turnToward(a, dx, dy, rate) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const tx = dx / d;
  const ty = dy / d;
  const k = Math.min(1, rate * DT);
  let fx = a.fx + (tx - a.fx) * k;
  let fy = a.fy + (ty - a.fy) * k;
  const n = Math.hypot(fx, fy) || 1;
  a.fx = fx / n;
  a.fy = fy / n;
}

/** Keep squads from walking through each other. Friends shove; foes stop. */
function separate(b, contacts) {
  const sq = b.squads.filter(alive);
  for (let i = 0; i < sq.length; i++) {
    for (let j = i + 1; j < sq.length; j++) {
      const a = sq[i];
      const c = sq[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d;
      const uy = dy / d;
      const overlap = extent(a, ux, uy) + extent(c, ux, uy) - d;
      if (overlap <= 0) continue;
      // Routers slip through; everyone else is pushed apart.
      if (a.state === "routing" || c.state === "routing") continue;
      const push = overlap / 2;
      a.x -= ux * push;
      a.y -= uy * push;
      c.x += ux * push;
      c.y += uy * push;
    }
  }
}

function hurt(b, s, amount, by) {
  if (!alive(s) || amount <= 0) return;
  s.pool += amount;
  by.dealtRound += amount;
  while (s.pool >= s.t.hp && s.n > 0) {
    s.pool -= s.t.hp;
    s.n--;
    s.deaths++;
    s.lostRound++;
    // Each man lost costs his share of the squad's nerve.
    s.morale -= 100 / s.n0;
  }
  if (s.n <= 0) {
    s.state = "dead";
    s.n = 0;
  }
}

function endOfRound(b) {
  for (const s of b.squads) {
    if (!alive(s)) continue;
    const engaged = s.contacts.size > 0;
    if (standing(s)) {
      // A whole squad on your flank (pressure ~1/3) is the full drain; a few
      // men wrapping round the end of your line is a fraction of it.
      s.morale -= FLANK_DRAIN * s.form.pressure * Math.min(2, 3 * s.flankedRound);
      // Fear: monsters drain the nerve of everyone touching them.
      for (const id of s.contacts) {
        const o = b.squads[id];
        if (o.t.fear) s.morale -= o.t.fear;
      }
      const cap = s.cap;
      if (!engaged && s.lostRound === 0) s.morale = Math.min(cap, s.morale + 3);
      if (engaged && s.dealtRound > 0 && s.lostRound === 0) s.morale = Math.min(cap, s.morale + 2);
    } else if (s.state === "routing") {
      if (!engaged) s.morale += 4;
      const shattered = s.n < s.n0 * 0.25;
      const enemyNear = b.squads.some(
        (o) => o.side !== s.side && standing(o) && Math.hypot(o.x - s.x, o.y - s.y) < 20,
      );
      if (!shattered && !enemyNear && s.morale >= 35) {
        s.state = "ok";
        s.fy = s.side === 0 ? -1 : 1;
        s.fx = 0;
      }
    }
  }
  // The day is lost: once most of an army has gone, the rest know it. This is
  // what ends a battle instead of a lone squad of archers holding out forever.
  for (const side of [0, 1]) {
    const list = b.squads.filter((s) => s.side === side);
    const n0 = list.reduce((m, s) => m + s.n0, 0);
    const up = list.filter(standing).reduce((m, s) => m + s.n, 0);
    if (up < n0 * BREAK_AT) for (const s of list) if (standing(s)) s.morale -= BREAK_DRAIN;
  }
  // Routs, and the nerve-shock of watching a neighbour run. Worked out in
  // waves until nothing more breaks, so the order squads are stored in never
  // decides who runs: every squad that breaks shakes each neighbour once.
  for (;;) {
    const breaking = b.squads.filter((s) => standing(s) && s.morale < 20);
    if (!breaking.length) break;
    for (const s of breaking) {
      s.state = "routing";
      s.routed = true;
      b.log.push(`r${b.round} ${s.side}:${s.type} routs (${s.n}/${s.n0})`);
    }
    for (const s of breaking) {
      for (const o of b.squads) {
        if (o.side === s.side && standing(o) && Math.hypot(o.x - s.x, o.y - s.y) < 30)
          o.morale -= 8;
      }
    }
  }
  for (const s of b.squads) if (standing(s)) s.state = s.morale < 40 ? "wavering" : "ok";
}

function checkOver(b) {
  const up = [0, 1].map((side) => b.squads.some((s) => s.side === side && standing(s)));
  if (!up[0] || !up[1]) {
    b.over = true;
    b.winner = up[0] ? 0 : up[1] ? 1 : null;
  } else if (b.round >= MAX_ROUNDS) {
    b.over = true;
    // Nobody broke: whoever has the larger share of their men still standing
    // holds the field.
    const left = [0, 1].map((side) => {
      const list = b.squads.filter((s) => s.side === side);
      const up = list.filter(standing).reduce((m, s) => m + s.n, 0);
      return up / list.reduce((m, s) => m + s.n0, 0);
    });
    b.winner = left[0] === left[1] ? null : left[0] > left[1] ? 0 : 1;
    b.stalemate = true;
  }
}

// ---------------------------------------------------------------------------
// AI: picks an order per squad at the start of each round. Deliberately plain;
// it is the same AI that auto-resolves, so it is a floor on what a player gets.
// ---------------------------------------------------------------------------

function goal(b, a) {
  const o = a.order;
  if (o.kind === "hold") return { x: a.x, y: a.y, pace: 0 };
  if (o.kind === "move") return { x: o.x, y: o.y, pace: 1 };
  const tgt = o.target != null ? b.squads[o.target] : null;
  if (o.kind === "kite" && tgt) {
    // Horse archers: stay at 80% of range, sliding sideways round the target.
    const dx = a.x - tgt.x;
    const dy = a.y - tgt.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = a.t.range * 0.8;
    return {
      x: tgt.x + (dx / d) * want - (dy / d) * 8,
      y: tgt.y + (dy / d) * want + (dx / d) * 8,
      pace: 1,
    };
  }
  if (tgt && alive(tgt)) {
    const pace = o.kind === "charge" ? 1.15 : 1;
    // Horse ride round a line, not into it: if anyone else stands across the
    // way to the target, swing out to the near wing until level with it.
    if ((a.t.role === "cav" || a.t.role === "ha") && blocked(b, a, tgt)) {
      const wing = a.x < FIELD_W / 2 ? 5 : FIELD_W - 5;
      return { x: wing, y: tgt.y, pace };
    }
    return { x: tgt.x, y: tgt.y, pace };
  }
  return { x: a.x, y: a.y, pace: 0 };
}

/** Is there an enemy squad, other than `tgt`, across the straight way to it? */
function blocked(b, a, tgt) {
  const dx = tgt.x - a.x;
  const dy = tgt.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  for (const c of b.squads) {
    if (c === tgt || c.side === a.side || !standing(c)) continue;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
    if (t <= 0 || t >= 1) continue;
    const px = a.x + dx * t - c.x;
    const py = a.y + dy * t - c.y;
    if (Math.hypot(px, py) < halfW(c) + 4) return true;
  }
  return false;
}

function rangedTarget(b, a) {
  const o = a.order.target != null ? b.squads[a.order.target] : null;
  if (o && standing(o) && Math.hypot(o.x - a.x, o.y - a.y) <= a.t.range) return o;
  let best = null;
  let bd = Infinity;
  for (const c of b.squads) {
    if (c.side === a.side || !standing(c)) continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d <= a.t.range && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function nearest(b, a, filter = () => true) {
  let best = null;
  let bd = Infinity;
  for (const c of b.squads) {
    if (c.side === a.side || !standing(c) || !filter(c)) continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best ? { s: best, d: bd } : null;
}

const rangedPower = (b, side) =>
  b.squads
    .filter((s) => s.side === side && standing(s) && s.t.range && s.ammo > 0)
    .reduce((p, s) => p + s.n * s.t.mdmg * s.t.acc * (s.t.range / 70), 0);

export function defaultAI(b, side) {
  const mine = rangedPower(b, side);
  const theirs = rangedPower(b, 1 - side);
  // The side that out-shoots the other waits for it to come; the other must go.
  // Waiting has a limit, or two cautious armies stare at each other all day.
  const wait = mine > theirs * 1.2 && b.round < 8;
  for (const a of b.squads) {
    if (a.side !== side || !standing(a)) continue;
    const role = a.t.role;
    const near = nearest(b, a);
    if (!near) continue;
    if (role === "ranged") {
      a.order =
        near.d <= a.t.range * 0.95 && a.ammo > 0
          ? { kind: "hold", target: null }
          : a.ammo > 0
            ? { kind: "advance", target: near.s.id }
            : { kind: "advance", target: near.s.id };
      continue;
    }
    if (role === "ha") {
      const melee = nearest(b, a, (c) => !c.t.range || c.t.role === "cav");
      a.order =
        a.ammo > 0
          ? { kind: "kite", target: (melee ?? near).s.id }
          : { kind: "charge", target: near.s.id };
      continue;
    }
    if (role === "cav" && CYCLE) {
      // Cycle charge: a horseman stuck in a scrum is a slow footman. After a
      // round in contact with anything but archers or men already running,
      // pull out, ride clear, and come again with a fresh run-up.
      const cur = a.order.target != null ? b.squads[a.order.target] : null;
      if (a.order.withdraw) {
        if (near.d < 22) continue; // keep riding clear
      } else if (
        a.engagedFor >= ROUND_S - DT / 2 &&
        cur &&
        cur.state === "ok" &&
        cur.t.role !== "ranged"
      ) {
        const dx = a.x - cur.x;
        const dy = a.y - cur.y;
        const d = Math.hypot(dx, dy) || 1;
        a.order = { kind: "move", x: a.x + (dx / d) * 30, y: a.y + (dy / d) * 30, withdraw: true };
        continue;
      }
    }
    if (role === "cav") {
      // Ride for their archers, then their horse, then whatever is closest.
      const t =
        nearest(b, a, (c) => c.t.role === "ranged") ??
        nearest(b, a, (c) => c.t.role === "cav" || c.t.role === "ha") ??
        near;
      a.order = { kind: "charge", target: t.s.id };
      continue;
    }
    if (role === "spear") {
      const cav = nearest(b, a, (c) => c.t.role === "cav");
      if (
        cav &&
        cav.d < 45 &&
        cav.s.order.target != null &&
        b.squads[cav.s.order.target].side === side
      ) {
        a.order = { kind: "hold", target: null };
        continue;
      }
    }
    if (wait && near.d > 25) {
      a.order = { kind: "hold", target: null };
      continue;
    }
    const t =
      role === "spear"
        ? (nearest(b, a, (c) => c.t.role === "cav") ?? near)
        : (nearest(b, a, (c) => c.t.role !== "cav" && c.t.role !== "ha") ?? near);
    a.order = { kind: "advance", target: t.s.id };
  }
}

// ---------------------------------------------------------------------------
// Running a whole battle
// ---------------------------------------------------------------------------

export function fight(sides, seed = 1, opts = {}) {
  const b = createBattle(sides, seed, opts);
  while (!b.over) playRound(b);
  return summarize(b);
}

export function summarize(b) {
  const sides = [0, 1].map((side) => {
    const list = b.squads.filter((s) => s.side === side);
    const n0 = list.reduce((m, s) => m + s.n0, 0);
    const dead = list.reduce((m, s) => m + s.deaths, 0);
    const standingMen = list.filter(standing).reduce((m, s) => m + s.n, 0);
    return { n0, dead, alive: n0 - dead, standing: standingMen, lossFrac: dead / n0 };
  });
  return { winner: b.winner, rounds: b.round, stalemate: !!b.stalemate, sides, log: b.log };
}
