/**
 * Keeping a warband (world.md §4, §6–7; army.md §1, §3): recruiting at
 * settlements, the market and the ransom broker, troop XP and upgrades,
 * wages and the week, party morale and desertion, prisoners, and healing.
 *
 * Pure rules on the campaign state, like world.js: each function changes the
 * state and says what it did; the view only shows it. Nothing here imports
 * world.js, which calls the week and the day from its hourly tick.
 */
import { troop, fields, cultureTroop, cultureRoster, CORE } from "./data/troops.js";
import { CULTURE_IDS } from "./data/world.js";
import { partyLimit } from "./data/hero.js";
import { HEAL } from "./data/parties.js";
import { derive, pick } from "./rng.js";
import {
  FROM,
  PRICE,
  XP_TO,
  XP_PER_FIGHT,
  XP_RANGE,
  XP_NOT_WON,
  RANSOM,
  MOUNTED_RANSOM,
  DIPLOMACY_RANSOM,
  RECRUITS,
  ULUS_TOWN,
  MERCENARY,
  MARKET,
  ULUS_HORSES,
  MORALE,
  MOOD,
  UNPAID_DESERT,
  PRISONER_DAYS,
  PRISONER_PRICE,
  CAPTIVE_RANSOM,
  ARMS,
  SETTLEMENT_HEAL,
  MEDICINE_HEAL,
} from "./data/warband.js";

const menOf = (party) => party.troops.reduce((m, t) => m + t.n, 0);
const mounted = (id) => ["cav", "ha"].includes(troop(id).role);

/** The bound that binds: the [name, count] with the smallest count. */
function least(bounds) {
  let best = ["", Infinity];
  for (const b of bounds) if (b[1] < best[1]) best = b;
  return best;
}
/** How many of something costing `each` you can afford with `have`. */
const per = (have, each) => (each > 0 ? Math.floor(have / each) : Infinity);
const affords = (p, cost) => [
  ["gold", per(p.gold, cost.gold)],
  ["iron", per(p.iron, cost.iron)],
  ["horses", per(p.horses, cost.horses)],
];
function spend(p, cost, n) {
  p.gold -= n * cost.gold;
  p.iron -= n * cost.iron;
  p.horses -= n * cost.horses;
}

// ---------------------------------------------------------------------------
// The tree (army.md §1, §3)
// ---------------------------------------------------------------------------

/** The troops a troop goes up to, in its own culture's tree. */
export function upgradesOf(id) {
  const { type, culture } = troop(id);
  return Object.keys(FROM)
    .filter((to) => FROM[to] === type && (culture ? fields(culture, to) : CORE.includes(to)))
    .map((to) => (culture ? `${culture}:${to}` : to));
}

/** XP a man needs to reach a troop's tier. */
export const xpTo = (id) => XP_TO[troop(id).tier] ?? 0;

/** XP a man of this troop needs for the next tier; 0 at the top of its tree. */
export function xpNext(id) {
  const up = upgradesOf(id);
  return up.length ? xpTo(up[0]) : 0;
}

/** What the step up to a troop costs, its value and its wage, by generic type. */
export const priceOf = (id) => PRICE[troop(id).type];
export const wageOf = (id) => PRICE[troop(id).type]?.wage ?? 0;

/** The iron and horses of a troop's whole line, recruit up (army.md §3). */
export function lineOf(id) {
  let iron = 0;
  let horses = 0;
  for (let t = troop(id).type; t; t = FROM[t]) {
    iron += PRICE[t]?.iron ?? 0;
    horses += PRICE[t]?.horses ?? 0;
  }
  return { iron, horses };
}

// ---------------------------------------------------------------------------
// The party: its limit, wages and morale (world.md §6–7)
// ---------------------------------------------------------------------------

export const limitOf = (p) => partyLimit(p.hero, p.renown);
export const overLimit = (p) => menOf(p.party) > limitOf(p);
/** Men you can still take on before the party limit. */
export const roomIn = (p) => Math.max(0, limitOf(p) - menOf(p.party));

/** A week's wages for your party; the wounded are paid too. */
export const wagesOf = (p) => p.party.troops.reduce((m, t) => m + t.n * wageOf(t.type), 0);

/** Party morale, 0–100: 60, +5 a Leadership rank, what's happened lately, −10 over the limit. */
export function moraleOf(p) {
  const m =
    MORALE.base +
    MORALE.leadership * (p.hero.leadership ?? 0) +
    p.mood -
    (overLimit(p) ? MORALE.over : 0);
  return Math.max(0, Math.min(100, Math.round(m)));
}

/** A victory, a defeat or an unpaid week: it lifts or sinks morale, then fades. */
export function cheer(p, what) {
  p.mood += MOOD[what];
}

function stackOf(p, type) {
  return p.party.troops.find((t) => t.type === type);
}

function addMen(p, type, n) {
  let s = stackOf(p, type);
  if (!s) {
    s = { type, n: 0, xp: 0, wounded: 0 };
    p.party.troops.push(s);
  }
  s.n += n;
  return s;
}

/** Empty stacks go; a stack's XP is never more than its men can use, nor its wounded more than its men. */
function tidy(p) {
  p.party.troops = p.party.troops.filter((t) => t.n > 0);
  for (const t of p.party.troops) {
    t.wounded = Math.min(t.wounded, t.n);
    t.xp = Math.max(0, Math.min(t.xp, t.n * xpNext(t.type)));
  }
}

/**
 * `n` men leave, the lowest tiers first, fit men before wounded ones; only
 * stacks `ok` lets go. Returns how many left.
 */
function desert(p, n, ok) {
  let left = n;
  const order = p.party.troops.filter(ok).sort((a, b) => troop(a.type).tier - troop(b.type).tier);
  for (const s of order) {
    if (left <= 0) break;
    const k = Math.min(left, s.n);
    s.n -= k;
    left -= k;
  }
  tidy(p);
  return n - left;
}

// ---------------------------------------------------------------------------
// XP and upgrades (army.md §3)
// ---------------------------------------------------------------------------

/**
 * After a fight, each man who fought and lived gets 12 × the enemy worth
 * beaten / your worth fielded, held to 2–40, or 30% of that if you didn't
 * win. `fought` and `killed` are counts by troop type. Returns a man's XP.
 */
export function fightXp(p, { fought, killed, beaten, fielded, won }) {
  if (!(fielded > 0)) return 0;
  let each = Math.min(XP_RANGE[1], Math.max(XP_RANGE[0], (XP_PER_FIGHT * beaten) / fielded));
  if (!won) each *= XP_NOT_WON;
  each = Math.round(each * 10) / 10;
  for (const t of p.party.troops)
    t.xp += each * Math.max(0, (fought[t.type] ?? 0) - (killed[t.type] ?? 0));
  tidy(p);
  return each;
}

/**
 * How many fit men of `type` could go up to `to` now, what that costs each,
 * and what holds the rest back: "xp", "gold", "iron", "horses", "wounded"
 * (no more fit men), or "limit" (over the party limit, nobody can).
 */
export function upgradeRoom(state, type, to) {
  const p = state.player;
  const s = stackOf(p, type);
  const cost = priceOf(to);
  if (!s || !upgradesOf(type).includes(to)) return { n: 0, why: "none", cost };
  if (overLimit(p)) return { n: 0, why: "limit", cost };
  const [why, n] = least([
    ["wounded", s.n - s.wounded],
    ["xp", Math.floor(s.xp / xpTo(to))],
    ...affords(p, cost),
  ]);
  return { n, why, cost };
}

/** Upgrade up to `want` men of `type` to `to`, paying for them in one go. Returns how many. */
export function upgrade(state, type, to, want = Infinity) {
  const p = state.player;
  const room = upgradeRoom(state, type, to);
  const n = Math.min(want, room.n);
  if (!(n > 0)) return 0;
  const s = stackOf(p, type);
  s.n -= n;
  s.xp -= n * xpTo(to);
  spend(p, room.cost, n);
  addMen(p, to, n);
  tidy(p);
  return n;
}

/**
 * Abandoned arms: up to five of the lowest-tier fit men that can go up a
 * tier do, on the first branch of their tree, for nothing (world.md §4).
 * Returns what changed, as [from, to, n].
 */
export function freeArms(p, n = ARMS) {
  // Who goes up is settled first, so that no man goes up twice.
  const done = [];
  let left = n;
  const order = p.party.troops
    .filter((t) => upgradesOf(t.type).length && t.n > t.wounded)
    .sort((a, b) => troop(a.type).tier - troop(b.type).tier);
  for (const s of order) {
    if (left <= 0) break;
    const k = Math.min(left, s.n - s.wounded);
    done.push([s.type, upgradesOf(s.type)[0], k]);
    left -= k;
  }
  for (const [from, to, k] of done) {
    stackOf(p, from).n -= k;
    addMen(p, to, k);
  }
  tidy(p);
  return done;
}

// ---------------------------------------------------------------------------
// Settlements: recruits, the market, the broker (world.md §4, §6)
// ---------------------------------------------------------------------------

const TRADES = new Set(["town", "castle", "village", "camp"]);

/** The settlement or camp you stand in, if any, and aren't held in. */
export function placeHere(state, realm) {
  const p = state.player;
  if (p.at.to >= 0 || p.captive) return null;
  const id = realm.placeAt[p.at.i];
  const place = id >= 0 ? realm.places[id] : null;
  return place && TRADES.has(place.kind) ? place : null;
}

/** The one troop a mercenary camp sells: tier 3–4, any culture, the same for the realm's life. */
export function mercenaryOf(realm, place) {
  const o = { rng: derive(realm.seed, 7000 + place.id) };
  const all = CULTURE_IDS.flatMap(cultureRoster).filter((t) =>
    MERCENARY.tiers.includes(troop(t).tier),
  );
  return pick(o, all);
}

/** What a place raises: [troop id, pool, weekly refill]. */
export function poolsOf(realm, place) {
  if (place.kind === "camp") return [[mercenaryOf(realm, place), MERCENARY.pool, MERCENARY.refill]];
  const rows = [
    ...(RECRUITS[place.kind] ?? []),
    ...(place.kind === "town" && place.culture === "ulus" ? ULUS_TOWN : []),
  ];
  return rows.map(([type, pool, refill]) => [cultureTroop(place.culture, type), pool, refill]);
}

/** A town's market: iron and horses, each with a price and a weekly stock. */
export const marketOf = (place) =>
  place.kind === "town"
    ? { iron: MARKET.iron, horses: place.culture === "ulus" ? ULUS_HORSES : MARKET.horses }
    : {};

/** What's left at a place, by troop id and "iron" / "horses". Untouched places are full. */
export function stockAt(state, realm, place) {
  const st = state.stock[place.id];
  const out = {};
  for (const [t, pool] of poolsOf(realm, place)) out[t] = st?.[t] ?? pool;
  for (const [k, m] of Object.entries(marketOf(place))) out[k] = st?.[k] ?? m.stock;
  return out;
}

function takeStock(state, realm, place, key, n) {
  const now = stockAt(state, realm, place)[key];
  (state.stock[place.id] ??= {})[key] = now - n;
}

/** A recruit costs its line's value, iron and horses; a mercenary 2.5× its value and nothing else. */
export function recruitCost(place, id) {
  if (place.kind === "camp")
    return { gold: Math.ceil(MERCENARY.mark * priceOf(id).value), iron: 0, horses: 0 };
  return { gold: priceOf(id).value, ...lineOf(id) };
}

/**
 * What you could recruit here: each troop with how many are left, its cost,
 * how many you could hire now, and what stops more ("left", "room", "gold",
 * "iron", "horses").
 */
export function offersAt(state, realm, place) {
  const p = state.player;
  const left = stockAt(state, realm, place);
  return poolsOf(realm, place).map(([type]) => {
    const cost = recruitCost(place, type);
    const [why, n] = least([["left", left[type]], ["room", roomIn(p)], ...affords(p, cost)]);
    return { type, left: left[type], cost, n, why };
  });
}

/** Recruit up to `want` of `type` where you stand. Returns how many joined. */
export function recruit(state, realm, type, want = Infinity) {
  const p = state.player;
  const place = placeHere(state, realm);
  const o = place && offersAt(state, realm, place).find((x) => x.type === type);
  const n = o ? Math.min(want, o.n) : 0;
  if (!(n > 0)) return 0;
  spend(p, o.cost, n);
  takeStock(state, realm, place, type, n);
  addMen(p, type, n);
  return n;
}

/** The market where you stand: iron and horses, with what's left and how many you can buy. */
export function marketAt(state, realm, place) {
  const p = state.player;
  const left = stockAt(state, realm, place);
  return Object.entries(marketOf(place)).map(([what, m]) => {
    const [why, n] = least([
      ["left", left[what]],
      ["gold", per(p.gold, m.price)],
    ]);
    return { what, price: m.price, left: left[what], n, why };
  });
}

/** Buy up to `want` iron or horses where you stand. Returns how many. */
export function buy(state, realm, what, want = Infinity) {
  const p = state.player;
  const place = placeHere(state, realm);
  const o = place && marketAt(state, realm, place).find((x) => x.what === what);
  const n = o ? Math.min(want, o.n) : 0;
  if (!(n > 0)) return 0;
  p.gold -= n * o.price;
  p[what] += n;
  takeStock(state, realm, place, what, n);
  return n;
}

// ---------------------------------------------------------------------------
// Prisoners (world.md §7)
// ---------------------------------------------------------------------------

/** What a prisoner fetches at a town's broker: by tier, mounted ×1.5, Diplomacy +20% a rank. */
export function ransomOf(p, type) {
  const t = troop(type);
  const base = RANSOM[t.tier] * (mounted(type) ? MOUNTED_RANSOM : 1);
  return Math.round(base * (1 + DIPLOMACY_RANSOM * (p.hero.diplomacy ?? 0)));
}

/** Sell up to `want` of prisoner stack `k` at the town you stand in. Returns the gold. */
export function sellPrisoners(state, realm, k, want = Infinity) {
  const p = state.player;
  const s = p.party.prisoners[k];
  if (!s || placeHere(state, realm)?.kind !== "town") return 0;
  const n = Math.min(want, s.n);
  const gold = n * ransomOf(p, s.type);
  p.gold += gold;
  s.n -= n;
  p.party.prisoners = p.party.prisoners.filter((x) => x.n > 0);
  return gold;
}

/** Let up to `want` of prisoner stack `k` go. Returns how many. */
export function releasePrisoners(state, k, want = Infinity) {
  const p = state.player;
  const s = p.party.prisoners[k];
  if (!s) return 0;
  const n = Math.min(want, s.n);
  s.n -= n;
  p.party.prisoners = p.party.prisoners.filter((x) => x.n > 0);
  return n;
}

/** The troop a prisoner joins as: a band's men take your culture's colours, keeping their tier. */
export const joinsAs = (p, type) => (troop(type).culture ? type : cultureTroop(p.culture, type));

/**
 * Could you recruit prisoner stack `k`? After 4 days held (1 fewer a
 * Diplomacy rank), at half the value of what they join as plus their line's
 * iron and horses. Says when they're ready, what they join as, the cost,
 * how many now, and what stops more ("days", "left", "room", "gold", ...).
 */
export function prisonerRoom(state, k) {
  const p = state.player;
  const s = p.party.prisoners[k];
  const ready = s.since + 24 * Math.max(0, PRISONER_DAYS - (p.hero.diplomacy ?? 0));
  const as = joinsAs(p, s.type);
  const cost = { gold: Math.ceil(PRISONER_PRICE * priceOf(as).value), ...lineOf(as) };
  if (state.t < ready) return { n: 0, why: "days", ready, as, cost };
  const [why, n] = least([["left", s.n], ["room", roomIn(p)], ...affords(p, cost)]);
  return { n, why, ready, as, cost };
}

/** Recruit up to `want` of prisoner stack `k`. They keep their tier and start with no XP. */
export function recruitPrisoners(state, k, want = Infinity) {
  const p = state.player;
  if (!p.party.prisoners[k]) return 0;
  const room = prisonerRoom(state, k);
  const n = Math.min(want, room.n);
  if (!(n > 0)) return 0;
  spend(p, room.cost, n);
  p.party.prisoners[k].n -= n;
  p.party.prisoners = p.party.prisoners.filter((x) => x.n > 0);
  addMen(p, room.as, n);
  tidy(p);
  return n;
}

/**
 * Prisoners taken in a fight ride along up to half your party limit
 * (world.md §7). Each fight's are a stack of their own, held from now.
 * Returns how many were kept.
 */
export function takePrisoners(state, taken) {
  const p = state.player;
  const cap = Math.floor(limitOf(p) / 2);
  let held = p.party.prisoners.reduce((m, t) => m + t.n, 0);
  let added = 0;
  for (const [type, n] of Object.entries(taken)) {
    const k = Math.min(n, cap - held);
    if (k <= 0) break;
    const stack = p.party.prisoners.find((t) => t.type === type && t.since === state.t);
    if (stack) stack.n += k;
    else p.party.prisoners.push({ type, n: k, since: state.t });
    held += k;
    added += k;
  }
  return added;
}

// ---------------------------------------------------------------------------
// The day and the week (world.md §6)
// ---------------------------------------------------------------------------

/**
 * Midnight: the wounded heal a tenth of each stack (×1.5 in a settlement,
 * × Medicine), and what lifted or sank morale fades 2.
 */
export function dayTurn(state, realm) {
  const p = state.player;
  const rate =
    HEAL * MEDICINE_HEAL[p.hero.medicine ?? 0] * (placeHere(state, realm) ? SETTLEMENT_HEAL : 1);
  // Less a hair, so that 0.15 × 20 heals 3, not the 4 its float rounds up to.
  for (const t of p.party.troops) t.wounded = Math.max(0, t.wounded - Math.ceil(rate * t.n - 1e-9));
  p.mood = Math.sign(p.mood) * Math.max(0, Math.abs(p.mood) - MORALE.decay);
}

/**
 * The week's turn, for you (world.md §6 steps 1 and 3): wages, paid as far
 * as the gold goes (short, morale −20 and a tenth of the unpaid men desert,
 * lowest tiers first); 5% of the tier 1–2 men desert if morale is under 20;
 * then the pools and markets refill. Returns {due, paid, deserted}.
 */
export function weekTurn(state, realm) {
  const p = state.player;
  const due = wagesOf(p);
  const paid = Math.min(due, p.gold);
  p.gold -= paid;
  let deserted = 0;
  if (paid < due) {
    cheer(p, "unpaid");
    const unpaid = Math.ceil((menOf(p.party) * (due - paid)) / due);
    deserted += desert(p, Math.ceil(UNPAID_DESERT * unpaid), () => true);
  }
  if (moraleOf(p) < MORALE.low) {
    const low = (t) => troop(t.type).tier <= 2;
    const n = p.party.troops.filter(low).reduce((m, t) => m + t.n, 0);
    deserted += desert(p, Math.ceil(MORALE.lowDesert * n), low);
  }
  refill(state, realm);
  return { due, paid, deserted };
}

/** Every pool and market back up by its weekly amount; full ones drop out of the save. */
function refill(state, realm) {
  for (const id of Object.keys(state.stock)) {
    const place = realm.places[id];
    const st = state.stock[id];
    const caps = {};
    for (const [t, pool, add] of poolsOf(realm, place)) caps[t] = [pool, add];
    for (const [k, m] of Object.entries(marketOf(place))) caps[k] = [m.stock, m.stock];
    for (const k of Object.keys(st)) {
      const [cap, add] = caps[k] ?? [0, 0];
      st[k] += add;
      if (st[k] >= cap) delete st[k];
    }
    if (!Object.keys(st).length) delete state.stock[id];
  }
}

// ---------------------------------------------------------------------------
// Taken and freed (world.md §7)
// ---------------------------------------------------------------------------

/** Held long enough: ransomed for a fifth of your gold, or you got away. Returns the gold paid. */
export function release(state) {
  const p = state.player;
  const gold = p.captive.ransom ? Math.floor(CAPTIVE_RANSOM * p.gold) : 0;
  p.gold -= gold;
  p.captive = null;
  return gold;
}
