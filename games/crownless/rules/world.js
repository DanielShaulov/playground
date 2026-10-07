/**
 * The campaign on the map (world.md §2–3, §5): the clock, your party's pace
 * and path, travel hour by hour, resting, sight and the fog, and the
 * brigands and wolves you meet on the way (parties.js decides for them).
 *
 * The state is plain JSON and is exactly what the save holds (tech.md §4).
 * The realm it plays on is rebuilt from `state.seed` by worldgen and never
 * saved. Like the battle, every function here takes the state, changes it,
 * and returns events for the view to show (tech.md §2): it never waits on
 * drawing, and the view never decides an outcome.
 */
import { within, dist, centre, SQ3 } from "./hex.js";
import { generate } from "./worldgen.js";
import { derive, roll } from "./rng.js";
import { hexCost, pathFor } from "./ground.js";
import { spawn, think, moveParty, walk, hexOf, partyWorth, HOURS_A_WEEK } from "./parties.js";
import { TERRAIN, T, CULTURE_TRAVEL } from "./data/world.js";
import { START, BACKGROUNDS, startingHero, partyLimit } from "./data/hero.js";
import { troop, cultureTroop, worthOf } from "./data/troops.js";
import { CONTACT, HEAL } from "./data/parties.js";

export { hexCost, pathFor };

/** The hour a campaign begins: day 1, 08:00. */
export const START_HOUR = 8;
/** A party sees this many hexes (world.md §3). */
export const SIGHT = 4;
/** A visited watchtower reveals this far. */
export const TOWER_SIGHT = 10;
/** Resting ends at this hour. */
export const MORNING = 6;
/** The Journal keeps this many entries (tech.md §4). */
export const JOURNAL = 60;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

export const dayOf = (t) => Math.floor(t / 24) + 1;
export const hourOf = (t) => ((t % 24) + 24) % 24;
/** Night is 20:00 to 05:00 (world.md §3). */
export const isNight = (t) => hourOf(t) >= 20 || hourOf(t) < 5;
export const clock = (t) => `${String(Math.floor(hourOf(t))).padStart(2, "0")}:00`;

// ---------------------------------------------------------------------------
// A new campaign
// ---------------------------------------------------------------------------

/** The realm a state plays on; worldgen is deterministic, so this is cached. */
const realms = new Map();
export function realmOf(state) {
  const key = `${state.seed}:${state.size}`;
  let r = realms.get(key);
  if (!r) {
    r = generate(state.seed, state.size);
    r.paths = new Map();
    realms.set(key, r);
    if (realms.size > 3) realms.delete(realms.keys().next().value);
  }
  return r;
}

/**
 * Day 1: a free company of levies at a village of your home culture
 * (world.md §1 step 12, army.md §6).
 */
export function newCampaign({ seed, culture, background }) {
  const bg = BACKGROUNDS[background];
  const troops = [{ type: cultureTroop(culture, "levy"), n: START.levies, xp: 0, wounded: 0 }];
  for (const [type, n] of Object.entries(bg.troops ?? {}))
    troops.push({ type: cultureTroop(culture, type), n, xp: 0, wounded: 0 });
  const state = {
    seed: seed >>> 0,
    size: "medium",
    difficulty: "normal",
    rng: derive(seed >>> 0, 1),
    t: START_HOUR,
    explored: "",
    visited: [],
    player: {
      culture,
      background,
      hero: startingHero(culture, background),
      party: { troops, prisoners: [] },
      gold: START.gold + (bg.gold ?? 0),
      iron: START.iron,
      horses: START.horses + (bg.horses ?? 0),
      renown: 0,
      role: "free",
      at: { i: -1, to: -1, progress: 0 },
      dest: -1,
      resting: false,
      chase: null,
      provoked: false,
    },
    parties: [],
    nextParty: 0,
    truce: {},
    paid: {},
    spotted: [],
    gone: [],
    encounter: null,
    result: null,
    journal: [],
  };
  const realm = realmOf(state);
  const start = realm.places[realm.starts[culture]];
  state.player.at.i = start.i;
  state.explored = encodeBits(new Uint8Array(Math.ceil(realm.grid.n / 8)));
  state.visited.push(start.id);
  log(state, "start", start.id);
  look(state, realm);
  spawn(state, realm);
  state.spotted = partiesInSight(state, realm).map((pt) => pt.id);
  return state;
}

// ---------------------------------------------------------------------------
// Pace and paths (world.md §2)
// ---------------------------------------------------------------------------

export const menOf = (party) => party.troops.reduce((m, t) => m + t.n, 0);

/**
 * Hexes a day on cost-1 ground: 12 × class × size × wounded × limit ×
 * (1 + Logistics + mount) × culture.
 */
export function pace(player) {
  const { troops, prisoners } = player.party;
  const men = menOf(player.party);
  const mounted = troops
    .filter((t) => ["cav", "ha"].includes(troop(t.type).role))
    .reduce((m, t) => m + t.n, 0);
  const cls = men && mounted === men ? 1.35 : mounted * 2 >= men && men ? 1.15 : 1;
  const held = prisoners.reduce((m, t) => m + t.n, 0);
  const size = Math.max(0.75, 1 - 0.003 * Math.max(0, men + held / 2 - 40));
  const hurt = men ? troops.reduce((m, t) => m + t.wounded, 0) / men : 0;
  const wounded = 1 - 0.2 * hurt;
  const limit = men > partyLimit(player.hero, player.renown) ? 0.9 : 1;
  const extra = 1 + 0.1 * player.hero.logistics;
  return 12 * cls * size * wounded * limit * extra * CULTURE_TRAVEL[player.culture].pace;
}

/**
 * What you'd bring to a fight, as a party sees it: your fit men's worth and
 * your banner's household of four footmen (army.md §6).
 */
export function yourWorth(state) {
  const p = state.player;
  const fit = p.party.troops.reduce((m, t) => m + (t.n - t.wounded) * worthOf(t.type), 0);
  return fit + 4 * worthOf(cultureTroop(p.culture, "footman"));
}

/** Hours to cross into hex i at the player's pace. */
export const hoursInto = (realm, player, i) =>
  (24 / pace(player)) * hexCost(realm, i, player.culture);

/**
 * Where you'd go and how long it would take: the hexes from where you are
 * (or the hex you're stepping into) to `dest`, and the hours. Null if there
 * is no way there.
 */
export function route(state, dest, realm = realmOf(state)) {
  const p = state.player;
  const { i, to, progress } = p.at;
  const from = to >= 0 ? to : i;
  const path = pathFor(realm, p.culture, from, dest);
  if (!path) return null;
  let hours = to >= 0 ? (1 - progress) * hoursInto(realm, p, to) : 0;
  for (let k = 1; k < path.length; k++) hours += hoursInto(realm, p, path[k]);
  return { path: to >= 0 ? [i, ...path] : path, hours, arrive: state.t + hours };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** Nothing can be ordered while a meeting or its outcome is on screen. */
const held = (state) => !!(state.encounter || state.result);

/** Set off for `dest`. Returns false if there is no way there. */
export function travelTo(state, dest) {
  const p = state.player;
  if (held(state) || (dest === p.at.i && p.at.to < 0)) return false;
  if (!route(state, dest)) return false;
  p.dest = dest;
  p.resting = false;
  p.chase = null;
  return true;
}

/** Go after a party you can see, wherever it goes (ui.md §3: Attack). */
export function attack(state, id, realm = realmOf(state)) {
  const p = state.player;
  const party = state.parties.find((pt) => pt.id === id);
  if (held(state) || !party || !partiesInSight(state, realm).includes(party)) return false;
  const at = hexOf(party.at);
  if (at !== p.at.i && !route(state, at, realm)) return false;
  // Going after a band you paid off ends the deal; a truce still keeps you
  // apart until it runs out (world.md §5: the one that withdrew moves first).
  delete state.paid[id];
  p.chase = id;
  p.dest = at;
  p.resting = false;
  return true;
}

/** Stop: finish the step into the next hex, then stand. */
export function stop(state) {
  const p = state.player;
  p.resting = false;
  p.chase = null;
  p.dest = p.at.to >= 0 ? p.at.to : -1;
}

/** Rest in place until morning, or until stopped (world.md §2). */
export function rest(state) {
  const p = state.player;
  if (held(state) || p.at.to >= 0) return false;
  p.dest = -1;
  p.chase = null;
  p.resting = true;
  return true;
}

/** Is time passing? Only while you travel or rest, and nothing waits on you. */
export const busy = (state) =>
  !held(state) && (state.player.dest >= 0 || state.player.resting || state.player.chase != null);

// ---------------------------------------------------------------------------
// The hour
// ---------------------------------------------------------------------------

/**
 * One hour passes. The parties decide what to do; then you and they move a
 * quarter of an hour at a time, and wherever you pass within 0.6 of a hex
 * of a party that means to fight, you meet (world.md §2). The clock turns,
 * the wounded heal at midnight, the week brings new bands, and you see
 * what's around you. Returns what happened.
 */
export function advance(state, realm = realmOf(state)) {
  const p = state.player;
  const events = [];
  if (held(state)) return events;
  const wasNight = isNight(state.t);
  const you = {
    hex: hexOf(p.at),
    worth: yourWorth(state),
    shy: p.background === "outlaw" && !p.provoked,
  };
  you.forest = realm.terrain[you.hex] === T.forest;
  for (const party of state.parties)
    think(state, realm, party, { ...you, truce: spares(state, party) }, wasNight);
  if (p.chase != null) follow(state, realm, events);

  for (let q = 0; q < 4 && !state.encounter; q++) {
    const me0 = spot(realm, p.at);
    const them0 = state.parties.map((pt) => spot(realm, pt.at));
    if (p.dest >= 0) walkYou(state, realm, 0.25, events);
    for (const party of state.parties) moveParty(realm, party, 0.25);
    const me1 = spot(realm, p.at);
    state.parties.forEach((party, k) => {
      if (state.encounter || !wantsFight(state, party)) return;
      if (closest(me0, me1, them0[k], spot(realm, party.at)) <= CONTACT * SQ3)
        meet(state, party, p.chase === party.id ? "you" : "them", events);
    });
  }

  state.t += 1;
  if (p.resting && hourOf(state.t) === MORNING) {
    p.resting = false;
    events.push({ k: "rested" });
  }
  if (isNight(state.t) !== wasNight) events.push({ k: wasNight ? "dawn" : "dusk" });
  if (hourOf(state.t) === 0) heal(state);
  if (state.t % HOURS_A_WEEK === 0) spawn(state, realm);
  look(state, realm, events);
  watch(state, realm, events);
  return events;
}

/** You on your way: one stretch of `hours` along the path to `dest`. */
function walkYou(state, realm, hours, events) {
  const p = state.player;
  if (p.at.to < 0 && p.at.i === p.dest) {
    if (p.chase == null) arrive(state, realm, events);
    return;
  }
  walk(
    p.at,
    hours,
    () => {
      const path = pathFor(realm, p.culture, p.at.i, p.dest);
      if (path) return path[1];
      p.dest = -1;
      p.chase = null;
      events.push({ k: "lost" });
      return -1;
    },
    (i) => hoursInto(realm, p, i),
    () => {
      enter(state, realm, events);
      if (p.at.i === p.dest) {
        if (p.chase == null) arrive(state, realm, events);
        return false;
      }
      return p.dest >= 0;
    },
  );
}

/** Chasing: head for where the party is now, while you can still see it. */
function follow(state, realm, events) {
  const p = state.player;
  const party = state.parties.find((pt) => pt.id === p.chase);
  if (!party || !partiesInSight(state, realm).includes(party)) {
    p.chase = null;
    events.push({ k: "lost-track", id: party?.id ?? null });
    if (p.dest >= 0 && p.at.to < 0 && p.at.i === p.dest) p.dest = -1;
    return;
  }
  const at = hexOf(party.at);
  if (at === p.dest) return;
  if (at === p.at.i || route(state, at, realm)) p.dest = at;
  else {
    p.chase = null;
    events.push({ k: "lost-track", id: party.id });
  }
}

/** No contact with this party yet: after a Leave, a rearguard, a fight (battle.md §11). */
export const truced = (state, party) => (state.truce[party.id] ?? -1) > state.t;

/** This party lets you be: under a truce, or paid off for three days. */
export const spares = (state, party) =>
  truced(state, party) || (state.paid[party.id] ?? -1) > state.t;

/** Contact needs one side to mean it, a party hunting you or you after it, and no truce. */
const wantsFight = (state, party) =>
  !truced(state, party) && (party.goal === "hunt" || state.player.chase === party.id);

/** Where a party is, in hex units. */
function spot(realm, at) {
  const a = centre(realm.grid, at.i);
  if (at.to < 0) return a;
  const b = centre(realm.grid, at.to);
  return { x: a.x + (b.x - a.x) * at.progress, y: a.y + (b.y - a.y) * at.progress };
}

/** How close two straight moves over the same time come (world.md §2). */
export function closest(a0, a1, b0, b1) {
  const dx = b0.x - a0.x;
  const dy = b0.y - a0.y;
  const vx = b1.x - a1.x - dx;
  const vy = b1.y - a1.y - dy;
  const vv = vx * vx + vy * vy;
  const s = vv > 0 ? Math.max(0, Math.min(1, -(dx * vx + dy * vy) / vv)) : 0;
  return Math.hypot(dx + vx * s, dy + vy * s);
}

/** You meet a party: travel stops, and the meeting waits for your answer. */
function meet(state, party, by, events) {
  const p = state.player;
  state.encounter = { party: party.id, by, seed: Math.floor(roll(state) * 2 ** 32) >>> 0 };
  p.chase = null;
  p.resting = false;
  p.dest = p.at.to >= 0 ? p.at.to : -1;
  party.path = [];
  party.goal = "wait";
  party.until = state.t + 1;
  events.push({ k: "encounter", id: party.id });
}

/** The wounded heal a tenth of each stack a day (world.md §7). */
function heal(state) {
  for (const t of state.player.party.troops)
    t.wounded = Math.max(0, t.wounded - Math.ceil(HEAL * t.n));
}

/**
 * A party newly in sight that is coming for you, or stronger than you,
 * stops your travel or your rest (world.md §2).
 */
function watch(state, realm, events) {
  const p = state.player;
  const now = partiesInSight(state, realm);
  const mine = yourWorth(state);
  for (const party of now) {
    if (state.spotted.includes(party.id) || p.chase === party.id) continue;
    const danger = (party.goal === "hunt" && !spares(state, party)) || partyWorth(party) > mine;
    if (!danger || state.encounter) continue;
    events.push({ k: "spotted", id: party.id });
    if (p.dest >= 0 || p.resting) {
      p.resting = false;
      p.chase = null;
      p.dest = p.at.to >= 0 ? p.at.to : -1;
      events.push({ k: "stop", why: "spotted", id: party.id });
    }
  }
  state.spotted = now.map((pt) => pt.id);
}

function arrive(state, realm, events) {
  const p = state.player;
  p.dest = -1;
  const id = realm.placeAt[p.at.i];
  events.push({ k: "arrive", i: p.at.i, id: id >= 0 ? id : null });
  if (id >= 0) log(state, "arrive", id);
}

/** A hex entered: a first visit to a place may stop you for a look (world.md §2). */
function enter(state, realm, events) {
  const p = state.player;
  const id = realm.placeAt[p.at.i];
  if (id < 0 || state.visited.includes(id)) return;
  state.visited.push(id);
  const place = realm.places[id];
  if (place.kind === "pickup") pickUp(state, place, events);
  if (place.kind === "tower") {
    reveal(state, realm, within(realm.grid, place.i, TOWER_SIGHT));
    log(state, "tower", id);
    events.push({ k: "tower", id });
    if (p.dest !== p.at.i) {
      p.dest = -1;
      events.push({ k: "stop", why: "tower", id });
    }
  }
}

/** What lies in the open is yours as you pass (world.md §4); chests and arms wait for M3. */
function pickUp(state, place, events) {
  const p = state.player;
  if (place.pickup === "gold") p.gold += place.amount;
  else if (place.pickup === "iron") p.iron += place.amount;
  else if (place.pickup === "horses") p.horses += place.amount;
  else {
    events.push({ k: "pickup", id: place.id, none: true });
    return;
  }
  state.gone.push(place.id);
  log(state, "pickup", place.id);
  events.push({ k: "pickup", id: place.id });
}

// ---------------------------------------------------------------------------
// Sight and fog (world.md §3)
// ---------------------------------------------------------------------------

/** How far you see: 4, +Scouting, +2 on hills, −1 at night. */
export function sightRange(state, realm = realmOf(state)) {
  const p = state.player;
  return Math.max(
    1,
    SIGHT + p.hero.scouting + TERRAIN[realm.terrain[p.at.i]].sight - (isNight(state.t) ? 1 : 0),
  );
}

/** The hexes in sight right now. */
export const inSight = (state, realm = realmOf(state)) =>
  within(realm.grid, state.player.at.i, sightRange(state, realm));

/** The parties you can see: in sight, and within 2 hexes if they're in forest. */
export function partiesInSight(state, realm = realmOf(state)) {
  const sight = new Set(inSight(state, realm));
  const me = state.player.at.i;
  return state.parties.filter((pt) => {
    const h = hexOf(pt.at);
    return sight.has(h) && (realm.terrain[h] !== T.forest || dist(realm.grid, h, me) <= 2);
  });
}

/** Mark what you can see as explored, and say which places you just found. */
function look(state, realm, events = []) {
  reveal(state, realm, inSight(state, realm), events);
  return events;
}

function reveal(state, realm, hexes, events = null) {
  const bits = decodeBits(state.explored, realm.grid.n);
  let changed = false;
  for (const i of hexes) {
    if (bits[i >> 3] & (1 << (i & 7))) continue;
    bits[i >> 3] |= 1 << (i & 7);
    changed = true;
    const id = realm.placeAt[i];
    if (id < 0) continue;
    const place = realm.places[id];
    if (place.hidden) continue;
    if (events) events.push({ k: "discover", id });
    if (["town", "castle", "crownhold", "lair", "iron", "ranch", "gold"].includes(place.kind))
      log(state, "discover", id);
  }
  if (changed) state.explored = encodeBits(bits);
}

/** Has hex i been seen? */
export function explored(state, realm = realmOf(state)) {
  const bits = decodeBits(state.explored, realm.grid.n);
  return (i) => (bits[i >> 3] & (1 << (i & 7))) !== 0;
}

// ---------------------------------------------------------------------------
// The Journal and the bitset
// ---------------------------------------------------------------------------

export function log(state, k, id, extra = null) {
  state.journal.push({ t: state.t, k, id, ...extra });
  if (state.journal.length > JOURNAL) state.journal.splice(0, state.journal.length - JOURNAL);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bytes → base64, by hand: the rules don't lean on btoa (tech.md §2). */
export function encodeBits(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const v = (a << 16) | (b << 8) | c;
    out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(v >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[v & 63] : "=";
  }
  return out;
}

export function decodeBits(text, n) {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  let k = 0;
  for (let i = 0; i < text.length; i += 4) {
    const v =
      (B64.indexOf(text[i]) << 18) |
      (B64.indexOf(text[i + 1]) << 12) |
      ((text[i + 2] === "=" ? 0 : B64.indexOf(text[i + 2])) << 6) |
      (text[i + 3] === "=" ? 0 : B64.indexOf(text[i + 3]));
    for (const s of [16, 8, 0]) if (k < bytes.length) bytes[k++] = (v >> s) & 255;
  }
  return bytes;
}
