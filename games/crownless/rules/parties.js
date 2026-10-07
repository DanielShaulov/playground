/**
 * Brigands and wolves on the map (world.md §5): where they come from, how
 * fast they go, and what they decide each hour — hunt the weak, flee the
 * strong, otherwise roam near home.
 *
 * A party is plain JSON in `state.parties`. Like your own, its position is
 * `{ i, to, progress }`; unlike yours, it keeps the hexes still ahead of it
 * (`path`), because it re-plans only when it changes its mind, not every
 * hex (tech.md §5: re-paths are the budget). Everything here is pure and
 * draws on the world's stream, `state.rng`.
 */
import { within, dist } from "./hex.js";
import { roll, rollInt } from "./rng.js";
import { hexCost, pathFor } from "./ground.js";
import { troop, worthOf } from "./data/troops.js";
import { T, ROAD } from "./data/world.js";
import {
  MAX_BRIGANDS,
  MAX_WOLVES,
  brigandWorth,
  WOLF_WORTH,
  BRIGAND_MIX,
  CHIEF_AT,
  purseOf,
  PARTY_SIGHT,
  BOLD,
  WOLF_SMELL,
  WOLF_BOLD,
  WOLF_RANGE,
  BRIGAND_RANGE,
} from "./data/parties.js";

export const HOURS_A_WEEK = 168;
export const weekOf = (t) => Math.floor(t / HOURS_A_WEEK);

export const partyMen = (party) => party.troops.reduce((m, t) => m + t.n, 0);
export const partyWorth = (party) => party.troops.reduce((m, t) => m + t.n * worthOf(t.type), 0);

/** Hexes a day: 12 × class × size, as yours but with no hero or culture (world.md §2). */
export function partyPace(party) {
  const men = partyMen(party);
  const mounted = party.troops
    .filter((t) => ["cav", "ha"].includes(troop(t.type).role))
    .reduce((m, t) => m + t.n, 0);
  const cls = men && mounted === men ? 1.35 : men && mounted * 2 >= men ? 1.15 : 1;
  const size = Math.max(0.75, 1 - 0.003 * Math.max(0, men - 40));
  return 12 * cls * size;
}

/** Hours for a party to cross into hex i. */
export const partyHours = (realm, party, i) => (24 / partyPace(party)) * hexCost(realm, i, "wild");

/** The hex a party is nearer to: where it stands, or the one it's stepping into. */
export const hexOf = (at) => (at.to >= 0 && at.progress >= 0.5 ? at.to : at.i);

// ---------------------------------------------------------------------------
// Spawns (world.md §6, the week)
// ---------------------------------------------------------------------------

/** A band of brigands worth about `worth`, by BRIGAND_MIX. */
export function bandOf(worth) {
  const mix = BRIGAND_MIX.find(([at]) => worth >= at)[1];
  const troops = [];
  for (const [type, share] of Object.entries(mix)) {
    const n = Math.round((worth * share) / worthOf(type));
    if (n > 0) troops.push({ type, n });
  }
  return troops.length ? troops : [{ type: "levy", n: 1 }];
}

function nearestSettlement(realm, i) {
  let best = null;
  let bd = Infinity;
  for (const p of realm.places) {
    if (p.kind !== "town" && p.kind !== "castle" && p.kind !== "village") continue;
    const d = dist(realm.grid, p.i, i);
    if (d < bd) [bd, best] = [d, p];
  }
  return best;
}

function addParty(state, realm, lair, kind, troops, scale = 1) {
  const id = state.nextParty++;
  const party = {
    id,
    kind,
    name:
      kind === "brigands"
        ? `Brigands of ${nearestSettlement(realm, lair.i).name}`
        : `Wolves near ${nearestSettlement(realm, lair.i).name}`,
    home: lair.id,
    at: { i: lair.i, to: -1, progress: 0 },
    path: [],
    goal: "wait",
    until: state.t + rollInt(state, 1, 6),
    troops,
    gold: kind === "brigands" ? purseOf(troops.reduce((m, t) => m + t.n, 0)) : 0,
  };
  if (kind === "brigands") {
    party.scale = scale;
    if (partyWorth(party) >= CHIEF_AT) party.chief = true;
  }
  state.parties.push(party);
  return party;
}

/**
 * Each hideout sends out a band and each den a pack, while there are fewer
 * than 12 bands and 4 packs about; and the bands already out grow to what a
 * band is worth this week (8 + 2 a week), each by its own measure. Run at
 * the start and every week.
 */
export function spawn(state, realm) {
  const lairs = (lair) => realm.places.filter((p) => p.kind === "lair" && p.lair === lair);
  const count = (kind) => state.parties.filter((p) => p.kind === kind).length;
  const week = weekOf(state.t);
  for (const band of state.parties) if (band.kind === "brigands") grow(band, week);
  const out = [];
  for (const lair of lairs("hideout")) {
    if (count("brigands") >= MAX_BRIGANDS) break;
    const scale = 0.8 + 0.4 * roll(state);
    out.push(addParty(state, realm, lair, "brigands", bandOf(brigandWorth(week) * scale), scale));
  }
  for (const lair of lairs("den")) {
    if (count("wolves") >= MAX_WOLVES) break;
    const worth = WOLF_WORTH[0] + (WOLF_WORTH[1] - WOLF_WORTH[0]) * roll(state);
    out.push(
      addParty(state, realm, lair, "wolves", [
        { type: "wolf", n: Math.round(worth / worthOf("wolf")) },
      ]),
    );
  }
  return out;
}

/**
 * A band below this week's worth takes on men until it's a band of that
 * worth again, its losses made good; each new man brings 3 gold to the purse.
 */
function grow(band, week) {
  const want = brigandWorth(week) * (band.scale ?? 1);
  if (partyWorth(band) >= want) return;
  const troops = bandOf(want);
  const added = troops.reduce((m, t) => m + t.n, 0) - partyMen(band);
  if (added <= 0) return;
  band.troops = troops;
  band.gold += 3 * added;
  if (partyWorth(band) >= CHIEF_AT) band.chief = true;
}

// ---------------------------------------------------------------------------
// Minds (world.md §5: hunt the weak, flee the strong, roam)
// ---------------------------------------------------------------------------

const passable = (realm, i) => Number.isFinite(hexCost(realm, i, "wild"));

/** Head for `dest`; false if there is no way there. */
function goTo(realm, party, dest) {
  const from = party.at.i;
  if (dest === from) {
    party.path = [];
    return true;
  }
  const path = pathFor(realm, "wild", from, dest);
  if (!path) return false;
  party.path = path.slice(1);
  return true;
}

/**
 * Who the party can see of you, and what it makes of you.
 * @param {object} you  { hex, worth, forest, truce, shy } for this party
 */
function sees(realm, party, you, night) {
  const d = dist(realm.grid, hexOf(party.at), you.hex);
  return d <= (you.forest ? 2 : PARTY_SIGHT - (night ? 1 : 0)) ? d : Infinity;
}

/**
 * The party decides, standing on a hex: hunt you, run from you, or go on
 * roaming. `you` is how the party sees the player this hour.
 */
export function think(state, realm, party, you, night) {
  if (party.at.to >= 0) return;
  const home = realm.places[party.home];
  const d = sees(realm, party, you, night);
  const mine = partyWorth(party);
  let want = "roam";
  if (party.kind === "brigands") {
    if (d < Infinity && !you.truce && !you.shy && mine >= BOLD * you.worth) want = "hunt";
    else if (d < Infinity && you.worth >= BOLD * mine) want = "flee";
  } else {
    const far = dist(realm.grid, party.at.i, home.i) > WOLF_RANGE + 2;
    if (d <= WOLF_SMELL && !you.truce && !far && you.worth < WOLF_BOLD * mine) want = "hunt";
    else if (d < Infinity && you.worth >= WOLF_BOLD * mine) want = "flee";
  }

  if (want === "hunt" && goTo(realm, party, you.hex)) {
    party.goal = "hunt";
    return;
  }
  if (want === "flee") {
    // The hex within 3 that's farthest from you, then nearest to here.
    let best = -1;
    let score = -Infinity;
    for (const j of within(realm.grid, party.at.i, 3)) {
      if (!passable(realm, j)) continue;
      const s = dist(realm.grid, j, you.hex) * 10 - dist(realm.grid, j, party.at.i);
      if (s > score) [score, best] = [s, j];
    }
    if (best >= 0 && best !== party.at.i && goTo(realm, party, best)) {
      party.goal = "flee";
      return;
    }
  }
  // Roam: walk somewhere near home, wait there a while, walk on.
  if (party.goal === "hunt" || party.goal === "flee") {
    party.goal = "wait";
    party.path = [];
    party.until = state.t;
  }
  if (party.goal === "roam" && party.path.length) return;
  if (party.goal === "wait" && state.t < party.until) return;
  if (party.goal === "roam") {
    party.goal = "wait";
    party.until = state.t + rollInt(state, 3, 10);
    return;
  }
  const range = party.kind === "wolves" ? WOLF_RANGE : BRIGAND_RANGE;
  const near = within(realm.grid, home.i, range).filter(
    (j) =>
      passable(realm, j) &&
      realm.terrain[j] !== T.river &&
      (party.kind === "wolves" ? !(realm.flags[j] & ROAD) : true),
  );
  // Brigands like a road; wolves keep off them.
  const roads = party.kind === "brigands" ? near.filter((j) => realm.flags[j] & ROAD) : [];
  const list = roads.length && roll(state) < 0.6 ? roads : near;
  for (let k = 0; k < 4 && list.length; k++) {
    const dest = list[Math.floor(roll(state) * list.length)];
    if (dest !== party.at.i && goTo(realm, party, dest)) {
      party.goal = "roam";
      return;
    }
  }
  party.goal = "wait";
  party.until = state.t + 6;
}

/**
 * Move a party along its path for `hours`. A waiting party still finishes the
 * step it was on (a meeting can stop it between hexes), so it always ends up
 * standing on one, where it thinks again.
 */
export function moveParty(realm, party, hours) {
  if (party.goal === "wait" && party.at.to < 0) return;
  walk(
    party.at,
    hours,
    () => (party.path.length ? party.path.shift() : -1),
    (i) => partyHours(realm, party, i),
  );
}

/**
 * Walk along: `next()` gives the hex to step into (−1: stop), `hoursOf(i)`
 * what stepping into it takes, `onEnter(i)` is told of each hex reached and
 * can return false to stop there. Shared by every party on the map.
 */
export function walk(at, hours, next, hoursOf, onEnter = () => true) {
  let left = hours;
  while (left > 1e-9) {
    if (at.to < 0) {
      const j = next();
      if (j < 0) return;
      at.to = j;
      at.progress = 0;
    }
    const step = hoursOf(at.to);
    const need = (1 - at.progress) * step;
    if (need <= left + 1e-9) {
      left -= need;
      at.i = at.to;
      at.to = -1;
      at.progress = 0;
      if (onEnter(at.i) === false) return;
    } else {
      at.progress += left / step;
      left = 0;
    }
  }
}
