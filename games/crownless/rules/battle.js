/**
 * The battle (battle.md). Pure, seeded, fixed-step; no DOM, no clock, no
 * Math.random. The successor of the theory model that designed it: with
 * single-type squads, no heroes and `opts.model`, a battle here replays the
 * model's battle step for step (tests/crownless/battle-sim.mjs checks it).
 *
 * State is plain JSON — it is the save. `playRound` runs all 30 steps of a
 * round at once and returns a timeline for the view to animate, so the
 * outcome is decided (and saved) before anyone sees it (tech.md §2).
 *
 * The model, in brief (battle.md has the reasoning):
 *   - A squad is N soldiers in a rectangle, `files` wide; casualties come off
 *     the back. It may hold several troop types of one role, each with its
 *     own stats and damage pool.
 *   - Melee is frontage-limited: the touching edge fights (two ranks for
 *     spears), plus a wider Line's overhang wrapping round the ends.
 *   - Damage pools, HoMM-style: every `hp` of damage drops one man.
 *   - Facing matters: flank +30%, rear +60%, and fighting back is harder.
 *   - Horse deliver a one-off charge after a run-up; braced spears blunt it.
 *   - Shields stop missiles from the front, and only while not in melee.
 *   - Morale decides battles; an army under 40% standing bleeds nerve.
 *   - Fortune is one ±15% roll per squad per round.
 *   - Everything in a step is computed from one snapshot and applied after.
 */
import { roll, derive } from "./rng.js";
import { troop, DEFAULT_RANKS } from "./data/troops.js";
import { plan, command, settle, aimOf } from "./battle-ai.js";

export const ROUND_S = 3; // seconds of simulation per planning round
export const DT = 0.1; // fixed step; 30 steps a round
export const STEPS = Math.round(ROUND_S / DT);
export const SPACING = 1.5; // metres between soldiers, both ways
export const FIELD_W = 100;
export const FIELD_H = 140;
export const MAX_ROUNDS = 40;

export const FLANK_DMG = [1, 1.3, 1.6];
export const CHARGE_RUNUP = 1.5; // seconds at speed before contact; ~13 m for a horse
const FIGHT_BACK = [1, 0.5, 0.25];
const FLANK_DRAIN = 6; // morale a round at full flank pressure
export const MELEE = 1.0; // global melee damage scale: the knob for battle length
export const LUCK = 0.15; // each squad's damage swings ±15% round to round
export const BREAK_AT = 0.4; // an army with less than this standing is losing...
export const BREAK_DRAIN = 12; // ...and every squad still in it loses this much a round
const AURA = 30; // the banner's reach
const HERO_DOWN = 15; // morale every squad loses, once, when the banner falls

/**
 * The attack/defence curve: 8% a point, either way, never zero. A table over
 * tenths of a point (pierce makes armour fractional) built by repeated
 * multiplication, because Math.pow may differ between engines in the last
 * bit and a battle must replay the same in Node and in the browser.
 */
const EDGE = (() => {
  const t = new Float64Array(601);
  const step = 1.0077257952426748; // 1.08 ** 0.1
  t[300] = 1;
  for (let i = 1; i <= 300; i++) {
    t[300 + i] = t[299 + i] * step;
    t[300 - i] = t[301 - i] / step;
  }
  return t;
})();
export const edge = (atk, def) =>
  EDGE[Math.max(0, Math.min(600, Math.round((atk - def) * 10) + 300))];

const dist = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Formations (battle.md §2). Only Line wraps a narrower enemy; Wide stretches
 * so a bigger line can't wrap you; Deep waits for sieges (M5).
 */
export const FORMATIONS = {
  line: { ranks: 1, pressure: 1, morale: 0, wraps: true },
  wide: { ranks: 0.5, pressure: 1.5, morale: -5, wraps: false },
  deep: { ranks: 2, pressure: 0.5, morale: 10, wraps: true },
};

/**
 * Abilities the hero spends Valor on (battle.md §6). `on` is the kind of squad
 * of yours a targeted ability needs: "any", or a role.
 */
export const ABILITIES = {
  rally: {
    name: "Rally",
    short: "Rally",
    cost: 3,
    text: "your squads within 35 m of the banner steady (+25 morale), and those running there turn back; then 2 rounds before it is ready again",
  },
  holdline: {
    name: "Hold the Line",
    short: "Hold!",
    cost: 2,
    on: "any",
    text: "pick a squad: it stands its ground this round, +3 defence, and being flanked doesn't shake it; it can't move",
  },
  loose: {
    name: "Loose!",
    short: "Loose!",
    cost: 2,
    text: "every archer squad looses one free extra volley as the round starts",
  },
  charge: {
    name: "Charge!",
    short: "Charge!",
    cost: 3,
    text: "every horse squad charges at full speed this round, and hits 50% harder",
  },
  inspire: {
    name: "Inspire",
    short: "Inspire",
    cost: 4,
    text: "every squad fights 15% harder for two rounds",
  },
  shieldwall: {
    name: "Shield Wall",
    short: "Shields",
    cost: 2,
    on: "inf",
    text: "pick a foot squad: its shields stop 80% of arrows from the front, even in a melee, and +3 defence; it can't move for two rounds",
  },
  stakes: {
    name: "Stakes",
    short: "Stakes",
    cost: 3,
    on: "ranged",
    text: "pick an archer squad: it plants stakes, and horse charging its front is met as if by spears, until it moves",
  },
  lance: {
    name: "Lance Charge",
    short: "Lance",
    cost: 2,
    on: "cav",
    text: "pick a horse squad: its next charge goes through braced spears",
  },
  feint: {
    name: "Feigned Flight",
    short: "Feint",
    cost: 3,
    on: "cav",
    text: "pick a horse squad: it breaks away 30 m at full pace, struck only from the front, and its next charge hits 50% harder",
  },
};

// ---------------------------------------------------------------------------
// Squads and their geometry. A squad is a rectangle; its extent along any
// direction is the rectangle's support function, which is all contact and
// frontage need.
// ---------------------------------------------------------------------------

export const files = (s) => Math.min(s.files0, s.n);
export const depthOf = (s) => Math.ceil(s.n / Math.max(1, files(s)));
export const halfW = (s) => (files(s) * s.spacing) / 2;
export const halfD = (s) => (depthOf(s) * s.spacing) / 2;

export function extent(s, ux, uy) {
  const along = Math.abs(ux * s.fx + uy * s.fy);
  const across = Math.abs(ux * -s.fy + uy * s.fx);
  return halfW(s) * across + halfD(s) * along;
}

/** Width of `s` seen from direction u — how much of it can be touched. */
export const breadth = (s, ux, uy) => 2 * extent(s, -uy, ux);

export const alive = (s) => s.state === "ok" || s.state === "wavering" || s.state === "routing";
export const standing = (s) => s.state === "ok" || s.state === "wavering";

/** Which face of `def` an attack from `att` lands on: 0 front, 1 flank, 2 rear. */
export function faceHit(def, att) {
  if (def.buff.feint) return 0; // a feigned flight shows no back to strike
  const dx = att.x - def.x;
  const dy = att.y - def.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const cos = (dx * def.fx + dy * def.fy) / d;
  return cos > 0.5 ? 0 : cos > -0.5 ? 1 : 2;
}

/** The squad's lead troop: its first non-hero unit. */
export const leadOf = (s) => troop((s.units.find((u) => !troop(u.type).hero) ?? s.units[0]).type);

/** A squad moves at its slowest living member's pace; the hero keeps up with anyone. */
export function speedOf(b, s) {
  let v = Infinity;
  for (const u of s.units) {
    if (u.n <= 0) continue;
    const t = troop(u.type);
    if (!t.hero && t.speed < v) v = t.speed;
  }
  if (v === Infinity) v = 4.5; // a hero alone walks
  if ((s.role === "cav" || s.role === "ha") && b.sides[s.side].horse !== 1)
    v *= b.sides[s.side].horse;
  return v;
}

export function makeSquad(b, id, side, spec) {
  const units = (spec.units ?? [{ type: spec.type, n: spec.n }])
    .filter((u) => u.n > 0)
    .map((u) => ({ type: u.type, n: u.n, n0: u.n, pool: 0 }));
  const lead = troop((units.find((u) => !troop(u.type).hero) ?? units[0]).type);
  const role = spec.role ?? lead.role ?? "inf";
  const formation = spec.formation ?? "line";
  const form = FORMATIONS[formation];
  const n = units.reduce((m, u) => m + u.n, 0);
  const ranks = Math.max(1, Math.round((lead.ranks ?? DEFAULT_RANKS[role]) * form.ranks));
  const ts = units.map((u) => troop(u.type));
  const shooters = ts.filter((t) => t.range);
  const base =
    units.length === 1 ? lead.morale : units.reduce((m, u, i) => m + u.n * ts[i].morale, 0) / n;
  const mods = b.sides[side].mods;
  const s = {
    id,
    side,
    role,
    units,
    n,
    n0: n,
    files0: Math.max(1, Math.ceil(n / ranks)),
    spacing: Math.max(...ts.map((t) => t.spacing ?? SPACING)),
    // What the squad is, worked out once from its troops.
    reach: Math.max(...ts.map((t) => (t.hero ? 1 : (t.reach ?? 1)))),
    brace: ts.some((t) => t.brace),
    charges: ts.some((t) => t.charge),
    range: shooters.length ? Math.min(...shooters.map((t) => t.range)) : 0,
    reloadS: shooters.length ? Math.max(...shooters.map((t) => t.reload)) : 0,
    fear: Math.max(0, ...ts.map((t) => t.fear ?? 0)),
    banner: !!spec.banner,
    x: spec.x,
    y: spec.y,
    fx: spec.fx ?? 0,
    fy: spec.fy ?? (side === 0 ? -1 : 1),
    speedNow: 0,
    runUp: 0, // seconds spent moving at speed; a charge needs CHARGE_RUNUP of it
    engagedFor: 0, // seconds continuously in melee
    everEngaged: false,
    formation,
    cap: base + form.morale, // the most nerve it can recover to
    morale: base + form.morale,
    luck: 1,
    state: "ok", // ok | wavering | routing | fled | dead
    order: { kind: "advance", target: null }, // this round's order, from the AI or a command
    // The player's standing command (battle-ai.js), when a person commands this side.
    cmd: spec.cmd ? { ...spec.cmd } : null,
    reload: 0,
    ammo: shooters.length ? Math.min(...shooters.map((t) => t.ammo)) : 0,
    contacts: [], // ids in contact last step, for charge detection
    since: {}, // id -> time contact began, so the oldest is the "front"
    lostRound: 0,
    dealtRound: 0,
    flankedRound: 0,
    deaths: 0,
    routed: false,
    buff: {},
  };
  s.ammo0 = s.ammo;
  s.morale += mods.morale;
  s.cap += mods.morale;
  return s;
}

/** Line abreast: infantry centre, spears beside, ranged behind, horse on the wings. */
/** How wide a squad spec stands in its default ranks, in metres. */
export function frontage(s) {
  const t = troop((s.units ?? [s])[0].type);
  const n = s.units ? s.units.reduce((m, u) => m + u.n, 0) : s.n;
  const role = s.role ?? t.role;
  return Math.ceil(n / (t.ranks ?? DEFAULT_RANKS[role])) * (t.spacing ?? SPACING);
}

export function deployLine(list, side, { wrap = true } = {}) {
  const y0 = side === 0 ? FIELD_H - 30 : 30;
  const back = side === 0 ? 1 : -1;
  const order = { monster: 0, inf: 1, spear: 2, ranged: 3, ha: 4, cav: 5 };
  const roleOf = (s) => s.role ?? troop((s.units ?? [s])[0].type).role;
  const sorted = [...list]
    .filter((s) => !s.banner)
    .sort((a, b) => order[roleOf(a)] - order[roleOf(b)]);
  const front = sorted.filter((s) => ["inf", "spear", "monster"].includes(roleOf(s)));
  const rear = sorted.filter((s) => roleOf(s) === "ranged");
  const wings = sorted.filter((s) => ["cav", "ha"].includes(roleOf(s)));
  const width = frontage;
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
  // A row of squads wider than the field forms a second line 8 m behind the
  // first (a horde in squads of forty is). One squad wider than the field
  // just stands there, as in the model.
  const lines = (row) => {
    const out = [[]];
    let w = -4;
    for (const s of row) {
      if (wrap && out.at(-1).length && w + width(s) + 4 > FIELD_W - 8) {
        out.push([]);
        w = -4;
      }
      out.at(-1).push(s);
      w += width(s) + 4;
    }
    return out;
  };
  const fronts = lines(front);
  const laid = fronts.flatMap((row, i) => lay(row, y0 + back * 8 * i));
  // With no front line, the ranged troops stand at the front.
  const rearY = front.length ? y0 + back * (10 + 8 * (fronts.length - 1)) : y0;
  const out = [...laid, ...lines(rear).flatMap((row, i) => lay(row, rearY + back * 6 * i))];
  wings.forEach((s, i) => {
    const left = i % 2 === 0;
    const k = Math.floor(i / 2);
    out.push({ ...s, x: left ? 10 + k * 12 : FIELD_W - 10 - k * 12, y: y0 + back * 4 });
  });
  // The banner keeps behind the centre of the line.
  for (const s of list) if (s.banner) out.push({ ...s, x: FIELD_W / 2, y: rearY + back * 7 });
  return out;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   seed?: number,
 *   sides: {squads: object[], place?: boolean, hero?: object|null, ai?: boolean,
 *           mods?: object, culture?: string|null, name?: string}[],
 *   woods?: {x: number, y: number, rx: number, ry: number}[],
 *   opts?: {split?: boolean, model?: boolean, luck?: number},
 * }} setup
 *   A squad spec is `{type, n}` or `{units: [{type, n}]}`, with optional x, y,
 *   formation, banner. Without `place`, a side deploys in Line.
 */
export function createBattle(setup) {
  const seed = (setup.seed ?? 1) >>> 0;
  const b = {
    v: 1,
    seed,
    rng: seed,
    round: 0,
    t: 0,
    over: false,
    winner: null,
    stalemate: false,
    retreated: null,
    woods: setup.woods ?? [],
    opts: { split: true, model: false, ...(setup.opts ?? {}) },
    sides: setup.sides.map((sd, side) => makeSide(sd, side)),
    squads: [],
    log: [],
  };
  if (b.opts.model) b.opts.split = false;
  setup.sides.forEach((sd, side) => {
    const placed = sd.place ? sd.squads : deployLine(sd.squads, side, { wrap: !b.opts.model });
    for (const spec of placed) {
      const s = makeSquad(b, b.squads.length, side, spec);
      if (s.banner) b.sides[side].banner = s.id;
      b.squads.push(s);
    }
  });
  // A commanded side starts as its deployment says (battle-setup.js), or
  // holding, banner keeping behind the line.
  for (const s of b.squads) {
    if (b.sides[s.side].ai) s.cmd = null;
    else if (!s.cmd) {
      s.cmd = s.banner ? { kind: "escort" } : { kind: "hold" };
      if (s.role === "cav") s.cmd.cycle = true;
    }
  }
  return b;
}

/**
 * Army-wide modifiers come from the hero (army.md §6–7) and, for the
 * simulator, from `mods` directly: melee and ranged damage factors, atk, def
 * and morale in points, horse speed and charge factors.
 */
function makeSide(sd, side) {
  const h = sd.hero ?? null;
  const m = { melee: 1, ranged: 1, atk: 0, def: 0, morale: 0, ...(sd.mods ?? {}) };
  let horse = 1;
  let impact = 1;
  if (h) {
    m.atk += Math.floor(h.might / 2);
    m.def += Math.floor(h.guard / 2);
    m.morale += h.command + 4 * (h.leadership ?? 0);
    m.melee *= 1 + 0.1 * (h.offense ?? 0);
    m.ranged *= 1 + 0.1 * (h.archery ?? 0);
    horse *= 1 + 0.05 * (h.horsemanship ?? 0);
    impact *= 1 + 0.15 * (h.horsemanship ?? 0);
  }
  return {
    name: sd.name ?? (side === 0 ? "You" : "Them"),
    culture: sd.culture ?? null,
    ai: sd.ai ?? true,
    mods: m,
    horse,
    impact,
    hero: h,
    banner: null,
    heroDown: false,
    valor: h ? 2 + (h.valorStart ?? 0) : 0,
    valorMax: h ? 6 + Math.floor(h.cunning / 3) : 0,
    valorGain: h ? 1 + ((h.tactics ?? 0) >= 3 ? 1 : 0) + (h.cunning >= 9 ? 1 : 0) : 0,
    cool: { rally: 0 },
    inspire: 0,
    pending: [],
    used: [],
  };
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

/**
 * Play one round: orders for every side, abilities, then 30 steps. Returns
 * the timeline the view animates: `frames[i]` is every squad after i steps
 * (frame 0 is the round's start), and `events` what happened, with the step.
 */
export function playRound(b, { record = true } = {}) {
  if (b.over) return { frames: [], events: [] };
  const tl = record ? { frames: [], events: [] } : null;
  beginRound(b, tl);
  if (tl) tl.frames.push(frame(b));
  for (let i = 0; i < STEPS; i++) {
    step(b, tl, i);
    if (tl) tl.frames.push(frame(b));
  }
  finishRound(b, tl);
  return tl ?? { frames: [], events: [] };
}

const STATE_CODE = { ok: 0, wavering: 1, routing: 2, fled: 3, dead: 4 };
export const STATE_NAMES = Object.keys(STATE_CODE);

/** Every squad as the view needs it: x, y, fx, fy, n, state, engaged. */
function frame(b) {
  return b.squads.map((s) => [s.x, s.y, s.fx, s.fy, s.n, STATE_CODE[s.state], s.contacts.length]);
}

export function beginRound(b, tl = null) {
  const before = b.squads.map((s) => s.order.target);
  // Both sides plan from the same picture: the orders as the last round left
  // them (the model let the second side read the first side's new ones).
  const seen = b.opts.model ? null : before;
  for (const side of [0, 1]) {
    if (b.sides[side].ai) plan(b, side, tl, seen);
    else command(b, side, tl);
  }
  for (const side of [0, 1]) applyAbilities(b, side, tl);
  // Enemy horse turning on your archers is worth a pause.
  if (tl)
    for (const s of b.squads) {
      const t = s.order.target;
      if (!standing(s) || t == null || t === before[s.id] || !(s.role === "cav")) continue;
      const o = b.squads[t];
      if (o && o.side !== s.side && o.role === "ranged" && !b.sides[o.side].ai)
        tl.events.push({ k: "horseOn", step: 0, id: s.id, target: t });
    }
  for (const s of b.squads) {
    s.lostRound = 0;
    s.dealtRound = 0;
    s.flankedRound = 0;
    // Fortune: one roll per squad per round. Per-step noise averages away over
    // thirty steps; a round-long swing is what makes a battle a gamble.
    const luck = b.opts.luck ?? LUCK;
    s.luck = 1 - luck + 2 * luck * roll(b);
  }
}

export function finishRound(b, tl = null) {
  endOfRound(b, tl);
  settle(b, tl);
  b.round++;
  for (const sd of b.sides) {
    if (sd.cool.rally > 0) sd.cool.rally--;
    if (sd.inspire > 0) sd.inspire--;
    sd.pending = [];
  }
  for (const s of b.squads) {
    if (s.buff.holdLine) delete s.buff.holdLine;
    if (s.buff.chargeBoost) delete s.buff.chargeBoost;
    if (s.buff.feint) delete s.buff.feint;
    if (s.buff.shieldWall && --s.buff.shieldWall <= 0) delete s.buff.shieldWall;
  }
  checkOver(b);
  if (!b.over) {
    for (const [side, sd] of b.sides.entries()) {
      if (!sd.hero || sd.heroDown) continue;
      const was = sd.valor;
      sd.valor = Math.min(sd.valorMax, sd.valor + sd.valorGain);
      if (tl && !sd.ai) {
        const newly = (sd.hero.abilities ?? []).filter(
          (a) => ABILITIES[a].cost > was && ABILITIES[a].cost <= sd.valor,
        );
        if (newly.length) tl.events.push({ k: "afford", step: STEPS, side, abilities: newly });
      }
    }
  }
  if (tl && b.over) tl.events.push({ k: "over", step: STEPS, winner: b.winner });
}

const inWoods = (b, x, y) => {
  for (const w of b.woods) {
    const dx = (x - w.x) / w.rx;
    const dy = (y - w.y) / w.ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
};
export { inWoods };

const NONE = Object.freeze([]);

export function step(b, tl = null, stepNo = 0) {
  const sq = b.squads;
  const m0 = b.sides[0].mods;
  const m1 = b.sides[1].mods;
  const melee0 = m0.melee * (b.sides[0].inspire > 0 ? 1.15 : 1);
  const melee1 = m1.melee * (b.sides[1].inspire > 0 ? 1.15 : 1);
  // 1. Contacts this step, by squad id; most squads have none.
  const contacts = new Array(sq.length).fill(NONE);
  const touch = (id, c) => (contacts[id] === NONE ? (contacts[id] = [c]) : contacts[id].push(c));
  for (const a of sq) {
    if (!alive(a) || a.side !== 0) continue;
    for (const c of sq) {
      if (!alive(c) || c.side !== 1) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
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
        let wrapA = FORMATIONS[a.formation].wraps
          ? Math.max(0, Math.min(ba - bc, 4 * extent(c, ux, uy)))
          : 0;
        let wrapC = FORMATIONS[c.formation].wraps
          ? Math.max(0, Math.min(bc - ba, 4 * extent(a, ux, uy)))
          : 0;
        // Two equal lines differ by rounding, not by a man: no wrap.
        if (!b.opts.model) {
          if (wrapA < 1e-6) wrapA = 0;
          if (wrapC < 1e-6) wrapC = 0;
        }
        touch(a.id, { o: c, width, wrap: wrapA, wrapped: wrapC });
        touch(c.id, { o: a, width, wrap: wrapC, wrapped: wrapA });
      }
    }
  }

  // 2. Charges: first contact after a run-up. Everything in a step is worked
  // out from the same snapshot and applied after, so squad order never decides
  // who strikes first.
  const blows = [];
  for (const a of sq) {
    if (!standing(a) || !a.charges) continue;
    for (const { o, width } of contacts[a.id]) {
      if (a.contacts.includes(o.id)) continue;
      if (a.runUp < CHARGE_RUNUP) continue;
      if (b.woods.length && (inWoods(b, a.x, a.y) || inWoods(b, o.x, o.y))) continue;
      const face = faceHit(o, a);
      const front = Math.min(a.n, Math.ceil(width / a.spacing));
      const braced =
        (o.brace || o.buff.stakes) && face === 0 && standing(o) && o.speedNow < 1 && !a.buff.lance;
      const ma = a.side === 0 ? m0 : m1;
      const mo = o.side === 0 ? m0 : m1;
      let boost = b.sides[a.side].impact;
      if (a.buff.chargeBoost) boost *= 1.5;
      if (a.buff.feintCharge) boost *= 1.5;
      if (braced) {
        // The spears' answer lands first; stakes wound a horse as a spear does.
        const spears = Math.min(o.n, Math.ceil(width / o.spacing) * o.reach);
        const hl = heroless(a);
        for (let ui = 0; ui < o.units.length; ui++) {
          const su = strikeShare(o, ui);
          if (!su) continue;
          const tu = troop(o.units[ui].type);
          const anti = tu.antiCav ?? (o.buff.stakes ? 2 : 1);
          for (let vi = 0; vi < a.units.length; vi++) {
            const sv = hitShare(a, vi, hl);
            if (!sv) continue;
            const tv = troop(a.units[vi].type);
            blows.push([
              a,
              vi,
              spears *
                su *
                sv *
                tu.dmg *
                anti *
                edge(tu.atk + mo.atk, tv.def + ma.def + defBuff(a)),
              o,
            ]);
          }
        }
      }
      const hl = heroless(o);
      for (let ui = 0; ui < a.units.length; ui++) {
        const su = strikeShare(a, ui);
        const tu = troop(a.units[ui].type);
        if (!su || !tu.charge) continue;
        for (let vi = 0; vi < o.units.length; vi++) {
          const sv = hitShare(o, vi, hl);
          if (!sv) continue;
          const tv = troop(o.units[vi].type);
          let impact =
            front *
            su *
            sv *
            tu.charge *
            edge(tu.atk + ma.atk, tv.def + mo.def + defBuff(o)) *
            FLANK_DMG[face] *
            a.luck;
          if (braced) impact *= 0.3;
          if (boost !== 1) impact *= boost;
          blows.push([o, vi, impact, a]);
        }
      }
      if (standing(o)) o.morale -= braced ? 4 : 10 + 6 * face;
      delete a.buff.lance;
      delete a.buff.feintCharge;
      if (tl) tl.events.push({ k: "charge", step: stepNo, id: a.id, target: o.id, braced });
    }
  }

  // 3. Melee.
  const dmgOut = [];
  for (const a of sq) {
    const list = contacts[a.id];
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
        men: Math.ceil(width / a.spacing) * a.reach * FIGHT_BACK[myFace],
        face: theirFace,
      });
      if (wrap > 0) fronts.push({ o, men: wrap / a.spacing, face: Math.max(1, theirFace) });
      if (wrapped > 0)
        fronts.push({ o, men: (wrapped / a.spacing) * FIGHT_BACK[1], face: theirFace });
    }
    const total = fronts.reduce((x, f) => x + f.men, 0);
    const scale = total > a.n ? a.n / total : 1;
    const ma = a.side === 0 ? m0 : m1;
    const meleeK = a.side === 0 ? melee0 : melee1;
    for (const { o, men, face } of fronts) {
      const mo = o.side === 0 ? m0 : m1;
      const horse = o.role === "cav" || o.role === "ha";
      const hl = heroless(o);
      for (let ui = 0; ui < a.units.length; ui++) {
        const su = strikeShare(a, ui);
        if (!su) continue;
        const tu = troop(a.units[ui].type);
        for (let vi = 0; vi < o.units.length; vi++) {
          const sv = hitShare(o, vi, hl);
          if (!sv) continue;
          const tv = troop(o.units[vi].type);
          let mult = edge(tu.atk + ma.atk, tv.def + mo.def + defBuff(o)) * FLANK_DMG[face];
          if (tu.antiCav && horse) mult *= tu.antiCav;
          if (a.state === "wavering") mult *= 0.8;
          if (o.state === "routing") mult *= 1.5; // cutting down men who have turned
          mult *= meleeK;
          dmgOut.push([
            o,
            vi,
            (men * scale * su * sv * tu.dmg * mult * a.luck * DT * MELEE) / ROUND_S,
            a,
          ]);
        }
      }
      // Flank pressure: how many are on your side or back, against how many you are.
      if (face > 0 && standing(o))
        o.flankedRound += (men * scale * (face === 2 ? 2 : 1) * DT) / ROUND_S / Math.max(1, o.n);
    }
  }

  // 4. Missiles.
  for (const a of sq) {
    if (!a.range || !standing(a) || a.ammo <= 0) continue;
    if (a.buff.loose) {
      // Loose!: one volley now, on top of the usual ones.
      delete a.buff.loose;
      volley(b, a, contacts, blows, tl, stepNo);
    }
    a.reload -= DT;
    if (a.reload > 0) continue;
    if (!volley(b, a, contacts, blows, tl, stepNo)) continue;
    a.reload = a.reloadS;
    a.ammo--;
    if (a.ammo === 0 && tl) tl.events.push({ k: "ammoOut", step: stepNo, id: a.id });
  }
  for (const [o, vi, d, a] of blows) hurt(b, o, vi, d, a);
  for (const [o, vi, d, a] of dmgOut) hurt(b, o, vi, d, a);

  // 5. Movement. Every squad steers by where everyone stood at the start of
  // the step; the model moved squads one by one, so the second side chased
  // where the first had already gone, and won about 6 in 7 mirror matches.
  const speeds = sq.map((a) => (alive(a) ? speedOf(b, a) : 0));
  const goals = b.opts.model ? null : sq.map((a) => (alive(a) ? goal(b, a) : null));
  for (const a of sq) {
    if (!alive(a)) continue;
    const engaged = contacts[a.id].length > 0;
    let gx = a.x;
    let gy = a.y;
    let speed = speeds[a.id];
    let turn = true;
    if (a.state === "routing") {
      gy = a.side === 0 ? FIELD_H + 20 : -20;
      speed *= 1.1;
    } else if (engaged && !a.order.withdraw) {
      speed = 0;
      // Turn to face the oldest contact — the one you were fighting first.
      const first = oldest(a, contacts[a.id]);
      turnToward(a, first.x - a.x, first.y - a.y, 0.8);
    } else {
      const g = goals ? goals[a.id] : goal(b, a);
      gx = g.x;
      gy = g.y;
      speed *= g.pace;
      if (a.state === "wavering") speed *= 0.8;
      // Pulling out of a melee is slow, and your back is to them while you do.
      if (engaged && !a.buff.feint) speed *= 0.6;
      turn = !a.order.keepFacing;
    }
    if (a.buff.holdLine || a.buff.shieldWall) speed = 0;
    if (b.woods.length && inWoods(b, a.x, a.y)) speed *= 0.6;
    const dx = gx - a.x;
    const dy = gy - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (speed > 0 && d > (b.opts.model ? 0.3 : 0.3 + 1e-6)) {
      const v = Math.min(speed, d / DT);
      a.x += (dx / d) * v * DT;
      a.y += (dy / d) * v * DT;
      a.speedNow = v;
      if (a.state !== "routing") {
        if (turn) turnToward(a, dx, dy, 1.5);
      } else {
        a.fx = 0;
        a.fy = a.side === 0 ? 1 : -1;
      }
    } else a.speedNow = 0;
    a.x = Math.max(2, Math.min(FIELD_W - 2, a.x));
  }
  separate(b);

  // 6. Bookkeeping.
  for (const a of sq) {
    const list = contacts[a.id];
    // Any contact, or slowing down, spends the run-up: one charge per approach.
    if (list.length || a.speedNow < 0.6 * (speeds[a.id] || speedOf(b, a))) a.runUp = 0;
    else a.runUp += DT;
    a.engagedFor = list.length ? a.engagedFor + DT : 0;
    if (list.length) a.everEngaged = true;
    if (a.buff.stakes && a.speedNow > 0.5) delete a.buff.stakes; // stakes stay where they were planted
    if (!list.length && !a.contacts.length) continue;
    const now = list.map(({ o }) => o.id);
    for (const id of now) if (!(id in a.since)) a.since[id] = b.t;
    for (const id of Object.keys(a.since)) if (!now.includes(Number(id))) delete a.since[id];
    a.contacts = now;
  }
  for (const a of sq)
    if (a.state === "routing" && (a.y < -5 || a.y > FIELD_H + 5)) a.state = "fled";
  b.t += DT;
}

/** A unit's share of its squad's blows. */
const strikeShare = (s, i) =>
  s.units.length === 1 ? 1 : s.units[i].n > 0 ? s.units[i].n / s.n : 0;

/** Men in a squad besides the hero; -1 for a squad of one troop type. */
function heroless(s) {
  if (s.units.length === 1) return -1;
  let n = 0;
  for (const u of s.units) if (u.n > 0 && !troop(u.type).hero) n += u.n;
  return n;
}

/** A unit's share of the blows a squad takes: the hero only once everyone else is down. */
function hitShare(s, i, hl) {
  if (hl === -1) return 1;
  const u = s.units[i];
  if (u.n <= 0) return 0;
  if (hl > 0) return troop(u.type).hero ? 0 : u.n / hl;
  return 1;
}

/** Extra defence from Hold the Line and Shield Wall. */
const defBuff = (s) => (s.buff.holdLine || s.buff.shieldWall ? 3 : 0);

/** Fire one volley if there is anything to fire at; returns whether it did. */
function volley(b, a, contacts, blows, tl, stepNo) {
  if (contacts[a.id].length) return false; // in melee: no shooting
  if (a.order.holdFire) return false;
  const moving = a.speedNow > 0.5;
  if (moving && a.role !== "ha") return false;
  const tgt = rangedTarget(b, a);
  if (!tgt) return false;
  const dx = tgt.x - a.x;
  const dy = tgt.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  // Shields stop arrows from the front, and only while they are not busy with
  // the man in front of them — unless they are locked in a shield wall.
  const facing = faceHit(tgt, a) === 0 && (!contacts[tgt.id].length || tgt.buff.shieldWall);
  const woods = b.woods.length && inWoods(b, tgt.x, tgt.y) ? 0.5 : 1;
  // A volley into a melee lands on whoever is in it, friends included.
  const melee = contacts[tgt.id].filter(({ o }) => o.side === a.side);
  const friendMen = melee.reduce((m, { o }) => m + Math.min(o.n, 20), 0);
  const share = friendMen ? tgt.n / (tgt.n + friendMen) : 1;
  const ranged = b.sides[a.side].mods.ranged;
  const hl = heroless(tgt);
  for (let ui = 0; ui < a.units.length; ui++) {
    const u = a.units[ui];
    const tu = troop(u.type);
    if (!tu.range || u.n <= 0) continue;
    const acc = tu.acc * (1 - 0.5 * (d / a.range)) * (moving ? 0.7 : 1);
    let hits = u.n * acc * a.luck;
    if (woods !== 1) hits *= woods;
    let perAll = 0;
    for (let vi = 0; vi < tgt.units.length; vi++) {
      const sv = hitShare(tgt, vi, hl);
      if (!sv) continue;
      const tv = troop(tgt.units[vi].type);
      const armor = tv.armor * (1 - (tu.pierce ?? 0));
      const sh = tgt.buff.shieldWall ? 0.8 : tv.shield;
      const shield = facing ? 1 - sh : 1;
      const per = tu.mdmg * edge(0, armor) * shield * ranged;
      perAll += per * sv;
      let dmg = hits * per * share;
      if (sv !== 1) dmg *= sv;
      blows.push([tgt, vi, dmg, a]);
    }
    if (friendMen) {
      for (const { o } of melee) {
        const ho = heroless(o);
        for (let wi = 0; wi < o.units.length; wi++) {
          const sw = hitShare(o, wi, ho);
          if (!sw) continue;
          let dmg = (hits * perAll * (1 - share) * Math.min(o.n, 20)) / friendMen;
          if (sw !== 1) dmg *= sw;
          blows.push([o, wi, dmg, a]);
        }
      }
    }
  }
  if (tl) tl.events.push({ k: "volley", step: stepNo, id: a.id, target: tgt.id, n: a.n });
  return true;
}

function oldest(a, list) {
  let best = list[0].o;
  let t = Infinity;
  for (const { o } of list) {
    const s = a.since[o.id] ?? Infinity;
    if (s < t) {
      t = s;
      best = o;
    }
  }
  return best;
}

function turnToward(a, dx, dy, rate) {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  const tx = dx / d;
  const ty = dy / d;
  const k = Math.min(1, rate * DT);
  const fx = a.fx + (tx - a.fx) * k;
  const fy = a.fy + (ty - a.fy) * k;
  const n = Math.sqrt(fx * fx + fy * fy) || 1;
  a.fx = fx / n;
  a.fy = fy / n;
}

/** Keep squads from walking through each other. Friends shove; foes stop. */
function separate(b) {
  const sq = b.squads.filter(alive);
  const moves = b.opts.model ? null : [];
  for (let i = 0; i < sq.length; i++) {
    for (let j = i + 1; j < sq.length; j++) {
      const a = sq[i];
      const c = sq[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const ux = dx / d;
      const uy = dy / d;
      const overlap = extent(a, ux, uy) + extent(c, ux, uy) - d;
      if (overlap <= 0) continue;
      // Routers slip through; everyone else is pushed apart.
      if (a.state === "routing" || c.state === "routing") continue;
      const push = overlap / 2;
      if (moves) {
        // Worked out from where everyone stood, then applied, like the rest.
        moves.push([a, -ux * push, -uy * push], [c, ux * push, uy * push]);
        continue;
      }
      a.x -= ux * push;
      a.y -= uy * push;
      c.x += ux * push;
      c.y += uy * push;
    }
  }
  if (moves)
    for (const [s, dx, dy] of moves) {
      s.x += dx;
      s.y += dy;
    }
}

/**
 * Damage into one unit's pool; every `hp` of it drops a man. Overkill carries
 * to the squad's next unit, the hero last of all.
 */
function hurt(b, s, ui, amount, by) {
  if (!alive(s) || amount <= 0) return;
  by.dealtRound += amount;
  let u = s.units[ui];
  if (u.n <= 0) u = nextUnit(s);
  if (!u) return;
  u.pool += amount;
  for (;;) {
    const hp = troop(u.type).hp;
    while (u.pool >= hp && u.n > 0) {
      u.pool -= hp;
      u.n--;
      s.n--;
      s.deaths++;
      s.lostRound++;
      // Each man lost costs his share of the squad's nerve.
      s.morale -= 100 / s.n0;
    }
    if (u.n > 0 || s.n <= 0) break;
    const next = nextUnit(s);
    if (!next) break;
    next.pool += u.pool;
    u.pool = 0;
    u = next;
  }
  if (s.n <= 0) {
    s.state = "dead";
    s.n = 0;
  }
}

/** The unit that takes the next blow: the biggest still standing, the hero last. */
function nextUnit(s) {
  let best = null;
  for (const u of s.units) {
    if (u.n <= 0) continue;
    if (!best || (troop(best.type).hero && !troop(u.type).hero) || u.n > best.n) {
      if (best && !troop(best.type).hero && troop(u.type).hero) continue;
      best = u;
    }
  }
  return best;
}

function endOfRound(b, tl) {
  const was = b.squads.map((s) => s.state);
  // A banner cut down in the round: the hero is down.
  for (const [side, sd] of b.sides.entries()) {
    if (sd.banner == null || sd.heroDown) continue;
    if (!alive(b.squads[sd.banner])) heroDown(b, side, tl);
  }
  for (const s of b.squads) {
    if (!alive(s)) continue;
    const engaged = s.contacts.length > 0;
    if (standing(s)) {
      // A whole squad on your flank (pressure ~1/3) is the full drain; a few
      // men wrapping round the end of your line are a fraction of it.
      if (!s.buff.holdLine)
        s.morale -=
          FLANK_DRAIN * FORMATIONS[s.formation].pressure * Math.min(2, 3 * s.flankedRound);
      // Fear: monsters drain the nerve of everyone touching them.
      for (const id of s.contacts) {
        const o = b.squads[id];
        if (o.fear) s.morale -= o.fear;
      }
      const cap = s.cap;
      if (!engaged && s.lostRound === 0) s.morale = Math.min(cap, s.morale + 3);
      if (engaged && s.dealtRound > 0 && s.lostRound === 0) s.morale = Math.min(cap, s.morale + 2);
    } else if (s.state === "routing") {
      if (!engaged) s.morale += 4;
      const shattered = s.n < s.n0 * 0.25;
      const enemyNear = b.squads.some(
        (o) => o.side !== s.side && standing(o) && dist(s.x, s.y, o.x, o.y) < 20,
      );
      if (!shattered && !enemyNear && s.morale >= 35) {
        s.state = "ok";
        s.fy = s.side === 0 ? -1 : 1;
        s.fx = 0;
        if (tl) tl.events.push({ k: "rally", step: STEPS, id: s.id });
      }
    }
  }
  // The banner's aura: nerve for every squad within reach of the hero.
  for (const sd of b.sides) {
    if (sd.banner == null || sd.heroDown || !sd.hero) continue;
    const ban = b.squads[sd.banner];
    const lift = 2 + (sd.hero.leadership ?? 0);
    for (const s of b.squads) {
      if (s.side !== ban.side || !standing(s)) continue;
      if (dist(s.x, s.y, ban.x, ban.y) <= AURA) s.morale = Math.min(s.cap, s.morale + lift);
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
      b.log.push(`r${b.round} ${s.side}:${s.units[0].type} routs (${s.n}/${s.n0})`);
      const foe = b.sides[1 - s.side];
      if (foe.hero && !foe.heroDown) foe.valor = Math.min(foe.valorMax, foe.valor + 1);
    }
    for (const s of breaking) {
      for (const o of b.squads) {
        if (o.side === s.side && standing(o) && dist(o.x, o.y, s.x, s.y) < 30) o.morale -= 8;
      }
    }
    for (const s of breaking) {
      const sd = b.sides[s.side];
      if (s.id === sd.banner && !sd.heroDown) heroDown(b, s.side, tl);
    }
  }
  for (const s of b.squads) if (standing(s)) s.state = s.morale < 40 ? "wavering" : "ok";
  if (tl)
    b.squads.forEach((s, i) => {
      if (s.state === was[i]) return;
      if (s.state === "routing" || s.state === "wavering")
        tl.events.push({ k: s.state === "routing" ? "rout" : "waver", step: STEPS, id: s.id });
    });
}

/** The banner has fallen: every squad on that side takes the shock, once. */
function heroDown(b, side, tl) {
  const sd = b.sides[side];
  if (!sd.hero) return;
  sd.heroDown = true;
  sd.pending = [];
  for (const s of b.squads) if (s.side === side && standing(s)) s.morale -= HERO_DOWN;
  if (tl) tl.events.push({ k: "heroDown", step: STEPS, side });
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
// Orders, as the step reads them. The AI and the player's commands both come
// down to these (battle-ai.js).
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
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const want = a.range * 0.8;
    // Slide the same way on both sides of the field (the model slid one way
    // round, which a mirror turns into the other).
    const k = b.opts.model || a.side === 0 ? 8 : -8;
    return {
      x: tgt.x + (dx / d) * want - (dy / d) * k,
      y: tgt.y + (dy / d) * want + (dx / d) * k,
      pace: 1,
    };
  }
  if (tgt && alive(tgt)) {
    const pace = o.kind === "charge" ? 1.15 : 1;
    // Horse ride round a line, not into it: if anyone else stands across the
    // way to the target, swing out to the near wing until level with it.
    if ((a.role === "cav" || a.role === "ha") && blocked(b, a, tgt)) {
      const wing = a.x < FIELD_W / 2 ? 5 : FIELD_W - 5;
      return { x: wing, y: tgt.y, pace };
    }
    return { x: tgt.x, y: tgt.y, pace };
  }
  return { x: a.x, y: a.y, pace: 0 };
}

/** Is there an enemy squad, other than `tgt`, across the straight way to it? */
export function blocked(b, a, tgt) {
  const dx = tgt.x - a.x;
  const dy = tgt.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  for (const c of b.squads) {
    if (c === tgt || c.side === a.side || !standing(c)) continue;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
    if (t <= 0 || t >= 1) continue;
    const px = a.x + dx * t - c.x;
    const py = a.y + dy * t - c.y;
    if (Math.sqrt(px * px + py * py) < halfW(c) + 4) return true;
  }
  return false;
}

/** A ranged squad shoots its ordered target if in range, else the nearest it can reach. */
export function rangedTarget(b, a) {
  const o = a.order.target != null ? b.squads[a.order.target] : null;
  if (o && o.side !== a.side && standing(o) && dist(a.x, a.y, o.x, o.y) <= a.range) return o;
  let best = null;
  let bd = Infinity;
  for (const c of b.squads) {
    if (c.side === a.side || !standing(c)) continue;
    const d = dist(a.x, a.y, c.x, c.y);
    if (d <= a.range && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export { dist };

/**
 * Change a squad's formation (battle.md §2): Line or Wide in the open field.
 * Its frontage is re-worked from the men it has; its nerve moves by the
 * difference in the formations' morale.
 */
export function setFormation(b, id, formation) {
  const s = b.squads[id];
  if (!s || !standing(s) || !FORMATIONS[formation] || s.formation === formation) return false;
  const lead = leadOf(s);
  const ranks = Math.max(
    1,
    Math.round((lead.ranks ?? DEFAULT_RANKS[s.role]) * FORMATIONS[formation].ranks),
  );
  const delta = FORMATIONS[formation].morale - FORMATIONS[s.formation].morale;
  s.files0 = Math.max(1, Math.ceil(s.n / ranks));
  s.cap += delta;
  s.morale += delta;
  s.formation = formation;
  return true;
}

// ---------------------------------------------------------------------------
// Abilities (battle.md §6): spent in the planning pause, felt as the round
// starts.
// ---------------------------------------------------------------------------

/** Why `side` can't use `id` (on squad `squad`) now, or null if it can. */
export function cannotUse(b, side, id, squad = null) {
  const sd = b.sides[side];
  const ab = ABILITIES[id];
  if (b.over) return "the battle is over";
  if (!sd.hero || !(sd.hero.abilities ?? []).includes(id)) return "not known";
  if (sd.heroDown) return "the hero is down";
  if (sd.pending.some((p) => p.id === id)) return "already used this round";
  if (id === "rally" && sd.cool.rally > 0) return `ready in ${sd.cool.rally} rounds`;
  if (sd.valor < ab.cost) return `needs ${ab.cost} Valor`;
  if (ab.on) {
    const s = squad == null ? null : b.squads[squad];
    if (!s || s.side !== side || !standing(s)) return "pick one of your squads";
    if (ab.on !== "any" && s.role !== ab.on) return `pick a ${ROLE_WORD[ab.on]} squad`;
  }
  return null;
}
const ROLE_WORD = { inf: "foot", ranged: "ranged", cav: "horse" };

/** Spend Valor on an ability; it takes effect as the next round starts. */
export function useAbility(b, side, id, squad = null) {
  const why = cannotUse(b, side, id, squad);
  if (why) return why;
  const sd = b.sides[side];
  sd.valor -= ABILITIES[id].cost;
  sd.pending.push({ id, squad: ABILITIES[id].on ? squad : null });
  return null;
}

function applyAbilities(b, side, tl) {
  const sd = b.sides[side];
  if (!sd.pending.length) return;
  const mine = b.squads.filter((s) => s.side === side);
  for (const { id, squad } of sd.pending) {
    const s = squad == null ? null : b.squads[squad];
    if (ABILITIES[id].on && (!s || !standing(s))) continue;
    sd.used.push({ id, round: b.round, squad });
    if (tl) tl.events.push({ k: "ability", step: 0, side, ability: id, id: squad });
    if (id === "rally") {
      const ban = b.squads[sd.banner];
      for (const o of mine) {
        if (!alive(o) || dist(o.x, o.y, ban.x, ban.y) > 35) continue;
        if (o.state === "routing") {
          if (o.n < o.n0 * 0.25) continue; // shattered
          o.state = "ok";
          o.fx = 0;
          o.fy = side === 0 ? -1 : 1;
        }
        o.morale = Math.min(o.cap, o.morale + 25);
        o.state = o.morale < 40 ? "wavering" : "ok";
      }
      sd.cool.rally = 3;
    } else if (id === "holdline") s.buff.holdLine = 1;
    else if (id === "loose") {
      for (const o of mine) if (standing(o) && o.range && o.ammo > 0) o.buff.loose = true;
    } else if (id === "charge") {
      for (const o of mine)
        if (standing(o) && o.charges) {
          o.runUp = Math.max(o.runUp, CHARGE_RUNUP);
          o.buff.chargeBoost = 1;
        }
    } else if (id === "inspire") sd.inspire = 2;
    else if (id === "shieldwall") s.buff.shieldWall = 2;
    else if (id === "stakes") s.buff.stakes = true;
    else if (id === "lance") s.buff.lance = true;
    else if (id === "feint") {
      // Ride clean away from whatever it is fighting, then come again.
      const foe = s.contacts.length ? b.squads[s.contacts[0]] : aimOf(b, s);
      const dx = foe ? s.x - foe.x : 0;
      const dy = foe ? s.y - foe.y : side === 0 ? 1 : -1;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      s.order = { kind: "move", x: s.x + (dx / d) * 30, y: s.y + (dy / d) * 30, withdraw: true };
      s.buff.feint = 1;
      s.buff.feintCharge = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Ending a battle early, and what it costs (battle.md §11)
// ---------------------------------------------------------------------------

/**
 * Retreat: every squad not in melee escapes; squads in melee each lose a
 * quarter of their men breaking off. If none of yours has been in melee yet,
 * the slowest 15% of your worth stays behind as a rearguard.
 */
export function retreat(b, side, worthOf) {
  if (b.over) return;
  const mine = b.squads.filter((s) => s.side === side && alive(s));
  const anyEngaged = b.squads.some((s) => s.side === side && s.everEngaged);
  if (!anyEngaged) {
    const total = mine.reduce((m, s) => m + squadWorth(s, worthOf), 0);
    let left = total * 0.15;
    const slow = [...mine].sort((a, c) => speedOf(b, a) - speedOf(b, c) || a.id - c.id);
    for (const s of slow) {
      if (left <= 0) break;
      // Men stay behind until the rearguard is worth enough; they are lost.
      for (const u of s.units) {
        const w = worthOf(u.type) || 0.5;
        const k = Math.min(u.n, Math.ceil(left / w));
        if (k <= 0 || troop(u.type).hero) continue;
        u.n -= k;
        s.n -= k;
        s.deaths += k;
        left -= k * w;
        if (left <= 0) break;
      }
    }
  }
  for (const s of mine) {
    if (s.contacts.length) {
      const k = Math.floor(s.n / 4);
      for (let i = 0; i < k; i++) {
        const u = nextUnit(s);
        if (!u) break;
        u.n--;
        s.n--;
        s.deaths++;
      }
    }
    s.state = s.n > 0 ? "fled" : "dead";
  }
  b.over = true;
  b.winner = 1 - side;
  b.retreated = side;
}

const squadWorth = (s, worthOf) => s.units.reduce((m, u) => m + u.n * (worthOf(u.type) || 0), 0);

/**
 * Who died, who was wounded, who fled, who was taken (battle.md §11). The
 * rolls come from a stream derived from the battle's seed, so the same battle
 * always has the same aftermath.
 */
export function aftermath(b, { worthOf, medicine = [0, 0] }) {
  const o = { rng: derive(b.seed, 7919) };
  const out = [0, 1].map(() => ({ killed: {}, wounded: {}, fled: {}, captured: {}, taken: {} }));
  const add = (m, k, v) => v && (m[k] = (m[k] ?? 0) + v);
  const draw = b.winner == null;
  for (const s of b.squads) {
    const r = out[s.side];
    const won = s.side === b.winner;
    for (const u of s.units) {
      if (troop(u.type).hero) continue;
      const dead = u.n0 - u.n;
      let wounded = 0;
      const chance = 0.35 + 0.15 * (medicine[s.side] ?? 0);
      for (let i = 0; i < dead; i++) if (roll(o) < chance) wounded++;
      if (won || draw) {
        add(r.wounded, u.type, wounded);
        add(r.killed, u.type, dead - wounded);
      } else {
        // The loser's wounded are taken by the winner.
        add(r.captured, u.type, wounded);
        add(out[1 - s.side].taken, u.type, wounded);
        add(r.killed, u.type, dead - wounded);
      }
      if (s.state === "fled" || s.state === "routing") add(r.fled, u.type, u.n);
    }
  }
  // Pursuit: the winner's horse rides down some of the loser's fled.
  if (!draw) {
    const w = b.winner;
    const horse = b.squads
      .filter((s) => s.side === w && standing(s) && (s.role === "cav" || s.role === "ha"))
      .reduce((m, s) => m + squadWorth(s, worthOf), 0);
    const r = out[1 - w];
    const fledWorth = Object.entries(r.fled).reduce((m, [t, n]) => m + n * (worthOf(t) || 0), 0);
    if (horse > 0 && fledWorth > 0) {
      const share = Math.min(0.5, (0.3 * horse) / fledWorth);
      for (const [t, n] of Object.entries(r.fled)) {
        const k = Math.floor(n * share);
        if (!k) continue;
        r.fled[t] -= k;
        add(r.captured, t, k);
        add(out[w].taken, t, k);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Running a whole battle
// ---------------------------------------------------------------------------

/** Play to the end with the plain AI on every side that has none of its own. */
export function autoFinish(b) {
  for (const sd of b.sides) sd.ai = true;
  for (const s of b.squads) s.cmd = null;
  while (!b.over) playRound(b, { record: false });
  return b;
}

/** Fight a whole battle from a setup, plain AI on both sides. */
export function fight(setup) {
  const b = createBattle({ ...setup, sides: setup.sides.map((s) => ({ ...s, ai: true })) });
  while (!b.over) playRound(b, { record: false });
  return b;
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
