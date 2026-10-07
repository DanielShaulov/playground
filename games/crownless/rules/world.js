/**
 * The campaign on the map (world.md §2–3): the clock, your party's pace and
 * path, travel hour by hour, resting, sight and the fog.
 *
 * The state is plain JSON and is exactly what the save holds (tech.md §4).
 * The realm it plays on is rebuilt from `state.seed` by worldgen and never
 * saved. Like the battle, every function here takes the state, changes it,
 * and returns events for the view to show (tech.md §2): it never waits on
 * drawing, and the view never decides an outcome.
 */
import { findPath, within } from "./hex.js";
import { generate } from "./worldgen.js";
import { derive } from "./rng.js";
import {
  TERRAIN,
  T,
  ROAD,
  FORD,
  BRIDGE,
  ROAD_COST,
  FORD_COST,
  BRIDGE_COST,
  CULTURE_TRAVEL,
} from "./data/world.js";
import { START, BACKGROUNDS, startingHero, partyLimit } from "./data/hero.js";
import { troop, cultureTroop } from "./data/troops.js";

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
    },
    journal: [],
  };
  const realm = realmOf(state);
  const start = realm.places[realm.starts[culture]];
  state.player.at.i = start.i;
  state.explored = encodeBits(new Uint8Array(Math.ceil(realm.grid.n / 8)));
  state.visited.push(start.id);
  log(state, "start", start.id);
  look(state, realm);
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

/** What crossing into hex i costs a party of `culture`, in cost-1 hexes. */
export function hexCost(realm, i, culture) {
  const t = realm.terrain[i];
  const f = realm.flags[i];
  let c;
  if (t === T.river) c = f & BRIDGE ? BRIDGE_COST : f & FORD ? FORD_COST : Infinity;
  else {
    c = TERRAIN[t].cost;
    const adj = CULTURE_TRAVEL[culture].cost[TERRAIN[t].id];
    if (adj === "plains") c = TERRAIN[T.plains].cost;
    else if (adj) c += adj;
  }
  return f & ROAD ? c * ROAD_COST : c;
}

/** Hours to cross into hex i at the player's pace. */
export const hoursInto = (realm, player, i) =>
  (24 / pace(player)) * hexCost(realm, i, player.culture);

/** The cheapest hexes from `from` to `to` for a culture, cached per realm. */
export function pathFor(realm, culture, from, to) {
  const key = `${culture}:${from}>${to}`;
  if (realm.paths.has(key)) return realm.paths.get(key);
  const found = findPath(realm.grid, from, to, (i) => hexCost(realm, i, culture), 0.5 * ROAD_COST);
  const path = found ? found.path : null;
  if (realm.paths.size > 400) realm.paths.clear();
  realm.paths.set(key, path);
  return path;
}

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

/** Set off for `dest`. Returns false if there is no way there. */
export function travelTo(state, dest) {
  const p = state.player;
  if (dest === p.at.i && p.at.to < 0) return false;
  if (!route(state, dest)) return false;
  p.dest = dest;
  p.resting = false;
  return true;
}

/** Stop: finish the step into the next hex, then stand. */
export function stop(state) {
  const p = state.player;
  p.resting = false;
  p.dest = p.at.to >= 0 ? p.at.to : -1;
}

/** Rest in place until morning, or until stopped (world.md §2). */
export function rest(state) {
  const p = state.player;
  if (p.at.to >= 0) return false;
  p.dest = -1;
  p.resting = true;
  return true;
}

/** Is time passing? Only while you travel or rest. */
export const busy = (state) => state.player.dest >= 0 || state.player.resting;

// ---------------------------------------------------------------------------
// The hour
// ---------------------------------------------------------------------------

/**
 * One hour passes: your party moves along its path or rests, the clock
 * turns, and you see what's around you. Returns what happened.
 */
export function advance(state, realm = realmOf(state)) {
  const p = state.player;
  const events = [];
  const wasNight = isNight(state.t);
  let left = 1;
  while (left > 0 && p.dest >= 0) {
    if (p.at.to < 0) {
      if (p.at.i === p.dest) {
        arrive(state, realm, events);
        break;
      }
      const path = pathFor(realm, p.culture, p.at.i, p.dest);
      if (!path) {
        p.dest = -1;
        events.push({ k: "lost" });
        break;
      }
      p.at.to = path[1];
      p.at.progress = 0;
    }
    const step = hoursInto(realm, p, p.at.to);
    const need = (1 - p.at.progress) * step;
    if (need <= left) {
      left -= need;
      p.at.i = p.at.to;
      p.at.to = -1;
      p.at.progress = 0;
      enter(state, realm, events);
      if (p.at.i === p.dest) arrive(state, realm, events);
    } else {
      p.at.progress += left / step;
      left = 0;
    }
  }
  state.t += 1;
  if (p.resting && hourOf(state.t) === MORNING) {
    p.resting = false;
    events.push({ k: "rested" });
  }
  if (isNight(state.t) !== wasNight) events.push({ k: wasNight ? "dawn" : "dusk" });
  look(state, realm, events);
  return events;
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

function log(state, k, id) {
  state.journal.push({ t: state.t, k, id });
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
