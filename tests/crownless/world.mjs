/**
 * The map rules, checked in Node: the realm a seed makes, travel, the clock,
 * sight, brigands and wolves, meeting them, and the campaign save. No
 * browser, a few seconds.
 *
 *     npm run test:crownless:world
 *
 * As in rules.mjs, what a check expects is a number worked out by hand from
 * world.md — 2 hours for a plains hex at pace 12, 61 hexes in sight — or a
 * range world.md gives. Realms are too big to write out, so a check finds
 * the hex it needs in one (setup) and then expects a literal of it.
 */
import { generate } from "../../games/crownless/rules/worldgen.js";
import {
  makeGrid,
  index,
  neighbours,
  dist,
  within,
  findPath,
  centre,
  hexAt,
} from "../../games/crownless/rules/hex.js";
import {
  newCampaign,
  realmOf,
  pace,
  hexCost,
  hoursInto,
  pathFor,
  route,
  travelTo,
  stop,
  rest,
  busy,
  advance,
  sightRange,
  inSight,
  explored,
  encodeBits,
  decodeBits,
  dayOf,
  hourOf,
  clock,
  attack,
  yourWorth,
  closest,
  partiesInSight,
} from "../../games/crownless/rules/world.js";
import {
  partyPace,
  partyHours,
  partyWorth,
  partyMen,
  bandOf,
  spawn,
  think,
  HOURS_A_WEEK,
} from "../../games/crownless/rules/parties.js";
import {
  choices,
  leave,
  payOff,
  sacrifice,
  rearguardOf,
  autoResolve,
  dismiss,
  encounterBattle,
} from "../../games/crownless/rules/encounter.js";
import { autoFinish, aftermath } from "../../games/crownless/rules/battle.js";
import { purseOf, brigandWorth, VALUE } from "../../games/crownless/rules/data/parties.js";
import { worthOf } from "../../games/crownless/rules/data/troops.js";
import {
  CAMPAIGN_V,
  readCampaign,
  staleCampaign,
  makeCampaign,
} from "../../games/crownless/rules/campaign-save.js";
import {
  TERRAIN,
  T,
  ROAD,
  FORD,
  BRIDGE,
  CULTURE_IDS,
  REGIONS,
} from "../../games/crownless/rules/data/world.js";
import { startingHero } from "../../games/crownless/rules/data/hero.js";

let failed = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  — ${detail}` : ""}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const SEEDS = Array.from({ length: 50 }, (_, k) => k + 1);

// --- The grid ----------------------------------------------------------------

console.log("\n# The hex grid (world.md §1)\n");
{
  const g = makeGrid(10, 10);
  const at = (c, r) => index(g, c, r);
  const set = (list) => list.sort((a, b) => a - b).join(",");
  check(
    "an even row's neighbours lean left",
    set(neighbours(g, at(4, 4))) ===
      set([at(3, 4), at(5, 4), at(3, 3), at(4, 3), at(3, 5), at(4, 5)]),
  );
  check(
    "an odd row's neighbours lean right",
    set(neighbours(g, at(4, 5))) ===
      set([at(3, 5), at(5, 5), at(4, 4), at(5, 4), at(4, 6), at(5, 6)]),
  );
  check("a corner hex has 2 neighbours", neighbours(g, at(0, 0)).length === 2);
  check(
    "distances: 3 along a row, 2 down a zigzag, 3 to (2,2)",
    dist(g, at(0, 0), at(3, 0)) === 3 &&
      dist(g, at(0, 0), at(0, 2)) === 2 &&
      dist(g, at(0, 0), at(1, 2)) === 2 &&
      dist(g, at(0, 0), at(2, 2)) === 3,
  );
  check(
    "within 1, 2, 4 of an inner hex: 7, 19, 61 (1 + 3r(r+1))",
    within(g, at(5, 5), 1).length === 7 &&
      within(g, at(5, 5), 2).length === 19 &&
      within(g, at(5, 5), 4).length === 61,
  );
  const back = [at(0, 0), at(4, 5), at(9, 9), at(7, 2)].every((i) => {
    const c = centre(g, i);
    return hexAt(g, c.x, c.y) === i && hexAt(g, c.x + 0.4, c.y - 0.4) === i;
  });
  check("a point at or near a hex's centre is in that hex", back);

  // A 5 × 3 strip, (2,1) costing 10: going round over the top is 5 steps.
  const s = makeGrid(5, 3);
  const wall = index(s, 2, 1);
  const p = findPath(s, index(s, 0, 1), index(s, 4, 1), (i) => (i === wall ? 10 : 1), 1);
  check(
    "A* goes round a costly hex: cost 5, not 13",
    p && p.cost === 5 && p.path.length === 6 && !p.path.includes(wall),
    p && p.cost,
  );
  const cut = findPath(s, index(s, 0, 1), index(s, 4, 1), (i) => (i % 5 === 2 ? Infinity : 1), 1);
  check("a wall of impassable hexes cuts the strip: no path", cut === null);
}

// --- The realm -----------------------------------------------------------------

console.log("\n# The realm from a seed (world.md §1)\n");
const realms = [];
let slowest = 0;
for (const seed of SEEDS) {
  const t0 = performance.now();
  const r = generate(seed);
  slowest = Math.max(slowest, performance.now() - t0);
  realms.push(r);
}
check("seeds 1–50 each make a realm in under 300 ms", slowest < 300, `${Math.round(slowest)} ms`);
check(
  "the same seed makes the same realm",
  SEEDS.every((s, k) => generate(s).hash === realms[k].hash),
);
// Change this only with a CAMPAIGN_V bump: every save of seed 1 is this map.
const r1 = realms[0];
check(
  "seed 1 is still the realm it was (hash 3356b7e8, built from seed 2)",
  r1.hash === "3356b7e8" && r1.used === 2 && r1.seed === 1,
  `${r1.hash} from ${r1.used}`,
);
// A seed that fails becomes seed + 1 (world.md §1, step 11), so 1 and 2 can share a map.
const used = new Map(realms.map((r) => [r.used, r.hash]));
check(
  "different seeds used make different realms",
  new Set(used.values()).size === used.size,
  `${used.size} realms from 50 seeds`,
);

/** Each realm's facts, gathered once; the checks below read them. */
const bad = {};
const flag = (key, seed, why = "") => {
  bad[key] ??= [];
  if (bad[key].length < 4) bad[key].push(why ? `${seed}: ${why}` : seed);
};
const holdArms = new Set();
for (const r of realms) {
  const { grid: g, terrain, flags, region, places, placeAt } = r;
  const seed = r.seed;
  const count = (kind) => places.filter((p) => p.kind === kind).length;
  if (g.cols !== 38 || g.rows !== 56) flag("size", seed);

  // Seats.
  const crown = places.find((p) => p.kind === "crownhold");
  const cc = crown.i % 38;
  const cr = Math.floor(crown.i / 38);
  if (Math.abs(cc - 19) > 2 || Math.abs(cr - 28) > 2) flag("crown", seed, `${cc},${cr}`);
  if (region[crown.i] !== 0) flag("crownRegion", seed);
  const caps = places.filter((p) => p.capital);
  if (caps.length !== 4 || new Set(caps.map((p) => p.culture)).size !== 4) flag("caps", seed);
  for (const p of caps) {
    const d = dist(g, p.i, crown.i);
    if (d < 8 || d > 14) flag("capDist", seed, `${p.culture} ${d}`);
    if (p.kind !== "town" || REGIONS[region[p.i]] !== p.culture) flag("capRegion", seed, p.culture);
  }
  const hold = caps.find((p) => p.culture === "hold");
  const dr = Math.floor(hold.i / 38) - cr;
  const dc = (hold.i % 38) - cc;
  holdArms.add(Math.abs(dr) >= 8 ? (dr < 0 ? "N" : "S") : dc > 0 ? "E" : "W");

  // Counts against world.md §1.
  const counts = {
    town: [8, 8],
    castle: [12, 12],
    village: [36, 48],
    gold: [2, 3],
    lair: [8, 12],
    great: [3, 3],
    pickup: [30, 50],
    shrine: [4, 6],
    tower: [4, 6],
    camp: [2, 3],
    stone: [3, 4],
  };
  for (const [kind, [lo, hi]] of Object.entries(counts)) {
    const n = count(kind);
    if (n < lo || n > hi) flag("counts", seed, `${kind} ${n}`);
  }
  if (r.rivers.length < 3 || r.rivers.length > 5) flag("counts", seed, `rivers ${r.rivers.length}`);
  for (const c of CULTURE_IDS) {
    const reg = REGIONS.indexOf(c);
    for (const kind of ["iron", "ranch"]) {
      const n = places.filter((p) => p.kind === kind && p.region === reg).length;
      if (n < 1 || n > 2) flag("sites", seed, `${c} ${kind} ${n}`);
    }
    for (const p of places.filter((q) => q.culture === c && q.kind === "town"))
      if (REGIONS[region[p.i]] !== c) flag("townRegion", seed, p.name);
  }
  const greats = places.filter((p) => p.kind === "great");
  if (new Set(greats.map((p) => p.region)).size !== 3 || greats.some((p) => !p.hidden))
    flag("greats", seed);

  // One place a hex, and the index agrees.
  places.forEach((p) => {
    if (placeAt[p.i] !== p.id) flag("placeAt", seed, p.id);
  });
  if ([...placeAt].filter((id) => id >= 0).length !== places.length) flag("placeAt", seed);

  // Settlements: on open ground, at least 3 apart but for a village and its
  // own seat, which are 2–4.
  const settlements = places.filter((p) =>
    ["crownhold", "town", "castle", "village"].includes(p.kind),
  );
  for (const p of settlements) {
    if (!Number.isFinite(TERRAIN[terrain[p.i]].cost)) flag("settleGround", seed, p.name);
    for (const q of settlements)
      if (p.id < q.id && q.parent !== p.id && dist(g, p.i, q.i) < 3)
        flag("spacing", seed, `${p.name}–${q.name}`);
    if (p.kind === "village") {
      const d = dist(g, p.i, places[p.parent].i);
      if (d < 2 || d > 4) flag("villageDist", seed, `${p.name} ${d}`);
    }
  }

  // Reach: by land from Crownhold (fords and bridges only across rivers).
  const passable = (j) =>
    terrain[j] === T.river
      ? (flags[j] & (FORD | BRIDGE)) !== 0
      : Number.isFinite(TERRAIN[terrain[j]].cost);
  const reach = new Uint8Array(g.n);
  const byRoad = new Uint8Array(g.n);
  for (const [seen, ok] of [
    [reach, passable],
    [byRoad, (j) => (flags[j] & ROAD) !== 0],
  ]) {
    const stack = [crown.i];
    seen[crown.i] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const j of neighbours(g, i))
        if (!seen[j] && ok(j)) {
          seen[j] = 1;
          stack.push(j);
        }
    }
  }
  for (const p of places) if (!reach[p.i]) flag("reach", seed, `${p.kind} ${p.id}`);
  for (const p of settlements) if (!byRoad[p.i]) flag("roads", seed, p.name);
  for (let i = 0; i < g.n; i++) {
    if (flags[i] & ROAD && !passable(i)) flag("roadGround", seed, i);
    if (flags[i] & BRIDGE && terrain[i] !== T.river) flag("bridge", seed, i);
  }

  // Rivers: long enough, crossable at least every 7 hexes, ending in water.
  for (const rv of r.rivers) {
    if (rv.length < 8) flag("rivers", seed, `length ${rv.length}`);
    let run = 0;
    let longest = 0;
    for (const j of rv) {
      if (terrain[j] !== T.river) flag("rivers", seed, `hex ${j} not river`);
      run = flags[j] & (FORD | BRIDGE) ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    if (longest > 6) flag("fords", seed, `${longest} hexes without a crossing`);
    const end = rv[rv.length - 1];
    const wet = neighbours(g, end).some(
      (j) =>
        terrain[j] === T.sea ||
        terrain[j] === T.lake ||
        (terrain[j] === T.river && !rv.includes(j)),
    );
    if (!wet) flag("rivers", seed, "ends dry");
  }

  // Starts: a village of the capital, near it; no lair within 5.
  for (const c of CULTURE_IDS) {
    const s = places[r.starts[c]];
    const cap = caps.find((p) => p.culture === c);
    if (s.kind !== "village" || s.culture !== c || s.parent !== cap.id) flag("start", seed, c);
    for (const p of places)
      if ((p.kind === "lair" || p.kind === "great") && dist(g, p.i, s.i) <= 5)
        flag("lairNear", seed, `${c} ${p.kind} ${dist(g, p.i, s.i)}`);
  }
}
const ok = (key) => !bad[key];
const why = (key) => (bad[key] ? bad[key].join("; ") : "");
check("the map is 38 × 56 (Medium)", ok("size"), why("size"));
check(
  "Crownhold within 2 of the centre, on its own plateau",
  ok("crown") && ok("crownRegion"),
  why("crown"),
);
check(
  "four capitals, one a culture, each a town in its own region",
  ok("caps") && ok("capRegion"),
  why("capRegion"),
);
check("each capital is 8–14 hexes from Crownhold", ok("capDist"), why("capDist"));
check(
  "Kharum's arm turns with the seed: north, east, south and west all happen",
  holdArms.size === 4,
  [...holdArms].join(""),
);
check(
  "counts in world.md's ranges: 8 towns, 12 castles, 36–48 villages, 3–5 rivers, 2–3 gold, 8–12 lairs, 3 great, 30–50 pickups, 4–6 shrines and towers, 2–3 camps, 3–4 stones",
  ok("counts"),
  why("counts"),
);
check("every culture has 1–2 iron mines and 1–2 ranches at home", ok("sites"), why("sites"));
check("a culture's towns stand in its region", ok("townRegion"), why("townRegion"));
check("three great lairs, in three regions, hidden", ok("greats"), why("greats"));
check("one place to a hex", ok("placeAt"), why("placeAt"));
check(
  "settlements on open ground, at least 3 hexes apart (a village from its own seat 2)",
  ok("settleGround") && ok("spacing"),
  why("spacing"),
);
check("villages are 2–4 hexes from their town or castle", ok("villageDist"), why("villageDist"));
check("every place can be reached by land from Crownhold", ok("reach"), why("reach"));
check("roads join every settlement to Crownhold", ok("roads"), why("roads"));
check(
  "roads run on passable ground; bridges only on rivers",
  ok("roadGround") && ok("bridge"),
  why("roadGround") || why("bridge"),
);
check("rivers are 8+ hexes and run into water", ok("rivers"), why("rivers"));
check("no more than 6 river hexes between crossings", ok("fords"), why("fords"));
check("each culture starts at a village of its capital", ok("start"), why("start"));
check("no lair within 5 hexes of any start", ok("lairNear"), why("lairNear"));

// --- Pace and hexes ---------------------------------------------------------

console.log("\n# Pace (world.md §2)\n");
const player = ({
  culture = "vale",
  background = "sellsword",
  troops = [["levy", 12]],
  prisoners = 0,
  hero = {},
}) => ({
  culture,
  background,
  hero: { ...startingHero(culture, background), ...hero },
  party: {
    troops: troops.map(([type, n, wounded = 0]) => ({
      type: `${culture}:${type}`,
      n,
      xp: 0,
      wounded,
    })),
    prisoners: prisoners ? [{ type: "vale:levy", n: prisoners }] : [],
  },
  renown: 0,
});
check("12 Valemark levies: 12 hexes a day", near(pace(player({})), 12), pace(player({})));
check(
  "60 levies, over the limit of 22: 12 × 0.94 × 0.9 = 10.152",
  near(pace(player({ troops: [["levy", 60]] })), 10.152),
);
check(
  "40 men and 20 prisoners under Leadership 3 (limit 46): 12 × 0.97 = 11.64",
  near(pace(player({ troops: [["levy", 40]], prisoners: 20, hero: { leadership: 3 } })), 11.64),
);
check(
  "half the 12 wounded: 12 × 0.9 = 10.8",
  near(pace(player({ troops: [["levy", 12, 6]] })), 10.8),
);
check("all mounted: 12 × 1.35 = 16.2", near(pace(player({ troops: [["horseman", 10]] })), 16.2));
check(
  "half mounted: 12 × 1.15 = 13.8; just under half: 12",
  near(
    pace(
      player({
        troops: [
          ["levy", 6],
          ["horseman", 6],
        ],
      }),
    ),
    13.8,
  ) &&
    near(
      pace(
        player({
          troops: [
            ["levy", 7],
            ["horseman", 5],
          ],
        }),
      ),
      12,
    ),
);
check("Logistics 2: 12 × 1.2 = 14.4", near(pace(player({ hero: { logistics: 2 } })), 14.4));
check(
  "Kharum marches ×0.9 (10.8); Ulus +15% (13.8)",
  near(pace(player({ culture: "hold" })), 10.8) && near(pace(player({ culture: "ulus" })), 13.8),
);
check(
  "Ulus horse archers: 12 × 1.35 × 1.15 = 18.63",
  near(pace(player({ culture: "ulus", troops: [["horsearcher", 10]] })), 18.63),
);

console.log("\n# Hours to cross a hex (world.md §2)\n");
/** The first hex of some realm that fits; setup, not expectation. */
function hexWhere(test) {
  for (const r of realms.slice(0, 10)) {
    const r2 = realmOf({ seed: r.seed, size: "medium" });
    for (let i = 0; i < r2.grid.n; i++) if (test(r2, i)) return { realm: r2, i };
  }
  return null;
}
const is =
  (t, road = false) =>
  (r, i) =>
    r.terrain[i] === T[t] && !!(r.flags[i] & ROAD) === road && !(r.flags[i] & (FORD | BRIDGE));
const hoursOn = (pred, who = {}) => {
  const f = hexWhere(pred);
  return f ? hoursInto(f.realm, player(who), f.i) : NaN;
};
const at12 = [
  ["plains", false, 2],
  ["plains", true, 1.2],
  ["farm", false, 2],
  ["steppe", false, 1.8],
  ["forest", false, 3.2],
  ["forest", true, 1.92],
  ["marsh", false, 4],
  ["hills", false, 2.8],
  ["pass", true, 2.4],
];
for (const [t, road, h] of at12)
  check(
    `${t}${road ? " on a road" : ""} at pace 12: ${h} h`,
    near(hoursOn(is(t, road)), h),
    hoursOn(is(t, road)),
  );
check(
  "a ford: 4 h; a bridge (always on a road): 2 × 0.6 = 1.2 h",
  near(
    hoursOn((r, i) => r.flags[i] & FORD && !(r.flags[i] & (BRIDGE | ROAD))),
    4,
  ) &&
    near(
      hoursOn((r, i) => r.flags[i] & BRIDGE),
      1.2,
    ),
);
const never = ["sea", "lake", "mountains"].map((t) => hexWhere(is(t)));
const river = hexWhere((r, i) => r.terrain[i] === T.river && !(r.flags[i] & (FORD | BRIDGE)));
check(
  "sea, lake, mountains and a river away from its crossings: never",
  [...never, river].every((f) => f && hexCost(f.realm, f.i, "vale") === Infinity),
);
check(
  "Fenreach's Greenwood: forest 1.0 → 2 h, marsh 1.4 → 2.8 h",
  near(hoursOn(is("forest"), { culture: "fen" }), 2) &&
    near(hoursOn(is("marsh"), { culture: "fen" }), 2.8),
);
check(
  "Kharum's Stone-born: hills and passes as plains, 24 / 10.8 = 2.222 h",
  near(hoursOn(is("hills"), { culture: "hold" }), 24 / 10.8) &&
    near(hoursOn(is("pass"), { culture: "hold" }), 24 / 10.8),
);
check(
  "Ulus on plains: 24 / 13.8 = 1.739 h",
  near(hoursOn(is("plains"), { culture: "ulus" }), 24 / 13.8),
);

// --- Travel ------------------------------------------------------------------

console.log("\n# Travel and the clock (world.md §2)\n");
check(
  "the clock: t 8 is day 1, 08:00; t 30 is day 2, 06:00; t 47 is 23:00",
  dayOf(8) === 1 &&
    clock(8) === "08:00" &&
    dayOf(30) === 2 &&
    clock(30) === "06:00" &&
    clock(47) === "23:00",
);
const fresh = () => newCampaign({ seed: 7, culture: "vale", background: "sellsword" });
{
  const s = fresh();
  const realm = realmOf(s);
  const start = realm.places[realm.starts.vale];
  check(
    "a new campaign: day 1, 08:00, at the start village, 500 gold, standing still",
    s.t === 8 &&
      s.player.at.i === start.i &&
      s.player.at.to === -1 &&
      s.player.gold === 500 &&
      !busy(s),
  );
  check("the same choices make the same campaign", JSON.stringify(fresh()) === JSON.stringify(s));
  check("going where you stand is no order", travelTo(s, start.i) === false && !busy(s));
  const sea = realm.terrain.indexOf(T.sea);
  check("there is no way onto the sea", travelTo(s, sea) === false && route(s, sea) === null);
}

/** Play hours until time stops; returns the events in order. */
function play(s, limit = 24 * 30) {
  const events = [];
  for (let k = 0; k < limit && busy(s); k++)
    events.push(...advance(s).map((e) => ({ ...e, t: s.t })));
  return events;
}

/** A destination from the start that a vale party reaches without stopping on the way. */
function farTarget(s, minHours) {
  const realm = realmOf(s);
  const caps = realm.places.filter((p) => p.capital || p.kind === "crownhold");
  for (const p of caps) {
    const r = route(s, p.i);
    if (!r || r.hours < minHours) continue;
    const copy = structuredClone(s);
    travelTo(copy, p.i);
    if (!play(copy).some((e) => e.k === "stop")) return { place: p, r };
  }
  return null;
}
{
  const s = fresh();
  const realm = realmOf(s);
  const { place, r } = farTarget(s, 30);
  const okPath =
    r.path.every((j, k) => k === 0 || dist(realm.grid, j, r.path[k - 1]) === 1) &&
    r.path.every((j, k) => k === 0 || Number.isFinite(hexCost(realm, j, "vale"))) &&
    r.path
      .filter((j) => realm.terrain[j] === T.river)
      .every((j) => realm.flags[j] & (FORD | BRIDGE));
  check("a path is a chain of neighbours, over rivers only at crossings", okPath);
  const stood = new Set();
  const etas = new Set();
  travelTo(s, place.i);
  const events = [];
  while (busy(s)) {
    etas.add(Math.ceil(route(s, place.i).arrive));
    events.push(...advance(s));
    stood.add(s.player.at.i);
  }
  const arrivals = events.filter((e) => e.k === "arrive");
  check(
    `you arrive in the hour the route promised (${Math.ceil(r.hours)} h for ${r.hours.toFixed(2)})`,
    s.t === 8 + Math.ceil(r.hours) && s.player.at.i === place.i && arrivals.length === 1,
    `t ${s.t}`,
  );
  check(
    "the arrival hour holds every hour of the way, between hexes too",
    etas.size === 1 && etas.has(s.t),
    [...etas].join(" "),
  );
  check(
    "you stand only on the path's hexes on the way",
    [...stood].every((i) => r.path.includes(i)),
  );
  check(
    "arriving at a settlement goes in the Journal",
    s.journal.some((e) => e.k === "arrive" && e.id === place.id),
  );
}
{
  // Save halfway, load, carry on: the same as never stopping.
  const a = fresh();
  const { place } = farTarget(a, 30);
  travelTo(a, place.i);
  for (let k = 0; k < 11; k++) advance(a);
  const midStep = a.player.at.to >= 0;
  const b = readCampaign(JSON.parse(JSON.stringify(makeCampaign(a))));
  play(a);
  if (b) {
    play(b);
    delete b.v;
  }
  check(
    "a save mid-journey, loaded and played on, ends where the unbroken journey ends",
    !!b && JSON.stringify(a) === JSON.stringify(b),
    midStep ? "saved between hexes" : "saved on a hex",
  );
}
{
  // Stop: the step you're on finishes, then you stand.
  const s = fresh();
  const realm = realmOf(s);
  const { place } = farTarget(s, 30);
  travelTo(s, place.i);
  while (!(s.player.at.to >= 0 && s.player.at.progress > 0)) advance(s);
  const next = s.player.at.to;
  stop(s);
  const t0 = s.t;
  play(s);
  const step = Math.ceil(hoursInto(realm, s.player, next));
  check(
    "Stop finishes the step into the next hex, then stands",
    s.player.at.i === next && s.player.at.to === -1 && !busy(s) && s.t - t0 <= step,
    `${s.t - t0} h`,
  );
}
{
  const s = fresh();
  check("Rest starts", rest(s) && busy(s));
  const events = play(s);
  const kinds = events.map((e) => `${e.k}@${clock(e.t)}`).join(" ");
  check(
    "resting from 08:00 runs 22 hours, to 06:00 on day 2",
    s.t === 30 && dayOf(s.t) === 2 && hourOf(s.t) === 6 && !busy(s),
    `t ${s.t}`,
  );
  check(
    "dusk at 20:00, dawn at 05:00, then morning",
    kinds === "dusk@20:00 dawn@05:00 rested@06:00",
    kinds,
  );
  const t = fresh();
  const { place } = farTarget(t, 30);
  travelTo(t, place.i);
  while (!(t.player.at.to >= 0)) advance(t);
  check("you can't make camp between two hexes", rest(t) === false);
}
{
  // A watchtower on the way stops you on it and shows 10 hexes round.
  let found = null;
  for (const seed of [7, 2, 4, 5, 6, 8, 9, 10]) {
    const s = newCampaign({ seed, culture: "vale", background: "sellsword" });
    const realm = realmOf(s);
    for (const tower of realm.places.filter((p) => p.kind === "tower")) {
      const nb = neighbours(realm.grid, tower.i);
      for (const a of nb)
        for (const b of nb) {
          if (found || a === b || dist(realm.grid, a, b) !== 2) continue;
          if (realm.placeAt[a] >= 0 || realm.placeAt[b] >= 0) continue;
          const path = pathFor(realm, "vale", a, b);
          if (path && path.length === 3 && path[1] === tower.i) found = { s, realm, tower, a, b };
        }
    }
    if (found) break;
  }
  const { s, realm, tower, a, b } = found;
  s.player.at.i = a;
  travelTo(s, b);
  const events = play(s);
  const seen = explored(s, realm);
  const round = within(realm.grid, tower.i, 10);
  check(
    "a watchtower on the way stops you on it",
    s.player.at.i === tower.i &&
      !busy(s) &&
      events.some((e) => e.k === "stop" && e.why === "tower"),
  );
  check(
    `from it, all ${round.length} hexes within 10 are explored`,
    round.every((i) => seen(i)),
  );
  check(
    "climbed once: the tower is visited and in the Journal",
    s.visited.includes(tower.id) && s.journal.some((e) => e.k === "tower" && e.id === tower.id),
  );
  travelTo(s, b);
  check(
    "going on from it, nothing stops you",
    play(s).every((e) => e.k !== "stop") && s.player.at.i === b,
  );
}

// --- Sight ---------------------------------------------------------------------

console.log("\n# Sight and fog (world.md §3)\n");
{
  const s = fresh();
  const realm = realmOf(s);
  const crown = realm.places.find((p) => p.kind === "crownhold").i;
  s.player.at.i = crown;
  check(
    "on Crownhold's plains by day: 4 hexes, 61 in sight",
    realm.terrain[crown] === T.plains && sightRange(s) === 4 && inSight(s).length === 61,
  );
  s.t = 21;
  check("at night (21:00): 3 hexes, 37 in sight", sightRange(s) === 3 && inSight(s).length === 37);
  s.t = 4;
  check("still night at 04:00: 3", sightRange(s) === 3);
  s.t = 5;
  check("day again at 05:00: 4", sightRange(s) === 4);
  s.player.hero.scouting = 1;
  check("Scouting (Basic): 5, 91 in sight", sightRange(s) === 5 && inSight(s).length === 91);
  s.player.hero.scouting = 0;
  const hill = hexWhere((r, i) => r.seed === 7 && r.terrain[i] === T.hills);
  s.player.at.i = hill.i;
  check("standing on hills: 4 + 2 = 6", sightRange(s) === 6);
  s.t = 22;
  check("on hills at night: 5", sightRange(s) === 5);
  const steppe = hexWhere((r, i) => r.seed === 7 && r.terrain[i] === T.steppe);
  s.t = 12;
  s.player.at.i = steppe.i;
  check("standing on steppe: 4 + 1 = 5", sightRange(s) === 5);
}
{
  const s = fresh();
  const realm = realmOf(s);
  const start = realm.places[realm.starts.vale];
  const seen = explored(s);
  const r = sightRange(s);
  const all = [...Array(realm.grid.n).keys()];
  const count = all.filter((i) => seen(i)).length;
  check(
    `a new campaign has seen exactly what's within ${r} of the start`,
    count === within(realm.grid, start.i, r).length &&
      all.every((i) => seen(i) === dist(realm.grid, i, start.i) <= r),
    `${count} hexes`,
  );
  const { place } = farTarget(s, 30);
  travelTo(s, place.i);
  const before = all.filter((i) => seen(i));
  play(s);
  const after = explored(s);
  check(
    "travel only ever adds to what you've seen",
    before.every((i) => after(i)) && all.filter((i) => after(i)).length > before.length,
  );
  const ids = s.journal.map((e) => e.k);
  check(
    "the Journal opens with the start, and finds towns on the way",
    ids[0] === "start" && ids.includes("discover"),
    ids.join(" "),
  );
}

// --- Brigands and wolves -------------------------------------------------------

console.log("\n# Brigands and wolves (world.md §5)\n");
const band = (troops) => troops.map(([type, n]) => ({ type, n }));
{
  check(
    "a party's pace is 12 a day on foot, 16.2 all mounted, 13.8 half, 11.28 for 60 men",
    near(partyPace({ troops: band([["levy", 13]]) }), 12) &&
      near(partyPace({ troops: band([["wolf", 6]]) }), 16.2) &&
      near(
        partyPace({
          troops: band([
            ["levy", 2],
            ["squire", 2],
          ]),
        }),
        13.8,
      ) &&
      near(partyPace({ troops: band([["levy", 60]]) }), 11.28),
  );
  const realm = realmOf(fresh());
  const plain = realm.terrain.indexOf(T.plains);
  check(
    "a plains hex takes a band 2 hours, a wolf pack 24 / 16.2",
    near(partyHours(realm, { troops: band([["levy", 13]]) }, plain), 2) &&
      near(partyHours(realm, { troops: band([["wolf", 6]]) }, plain), 24 / 16.2),
  );
  check(
    "a band's worth is 8 + 2 a week, never past 60",
    brigandWorth(0) === 8 &&
      brigandWorth(5) === 18 &&
      brigandWorth(26) === 60 &&
      brigandWorth(99) === 60,
  );
  const small = bandOf(8);
  check(
    "a band worth 8: 9 looters, 2 brigands, 1 poacher (60/20/20 of 8 by worth, rounded)",
    JSON.stringify(small) ===
      JSON.stringify(
        band([
          ["levy", 9],
          ["militia", 2],
          ["bowman", 1],
        ]),
      ),
    JSON.stringify(small),
  );
  const big = bandOf(60);
  check(
    "a band worth 60 brings raiders and deserters: 21, 20, 11, 6, 7",
    JSON.stringify(big) ===
      JSON.stringify(
        band([
          ["levy", 21],
          ["militia", 20],
          ["bowman", 11],
          ["squire", 6],
          ["footman", 7],
        ]),
      ),
    JSON.stringify(big),
  );
  check("a purse is 20 gold and 3 a man: 65 men carry 215", purseOf(65) === 215);
}
{
  const s = fresh();
  const realm = realmOf(s);
  const lairs = (k) => realm.places.filter((p) => p.kind === "lair" && p.lair === k).length;
  const count = (k) => s.parties.filter((p) => p.kind === k).length;
  check(
    `a new campaign sends out a band per hideout (${lairs("hideout")}) and a pack per den (${lairs("den")})`,
    count("brigands") === Math.min(12, lairs("hideout")) &&
      count("wolves") === Math.min(4, lairs("den")),
    `${count("brigands")} bands, ${count("wolves")} packs`,
  );
  const fair = s.parties
    .filter((p) => p.kind === "brigands")
    .every((p) => partyWorth(p) >= 8 * 0.8 - 1 && partyWorth(p) <= 8 * 1.2 + 1);
  check("week 1's bands are worth 8 ± 20%, give or take a man", fair);
  check(
    "every band carries 20 gold and 3 a man; packs carry none",
    s.parties.every((p) => p.gold === (p.kind === "brigands" ? purseOf(partyMen(p)) : 0)),
  );
  // Week 6: bands worth 20 × 0.8–1.2; only those at 24 or more have a chief.
  const w6 = fresh();
  w6.parties = [];
  w6.t = 6 * HOURS_A_WEEK;
  spawn(w6, realm);
  const six = w6.parties.filter((p) => p.kind === "brigands");
  check(
    "week 6's bands (worth 16–24): a chief only for those worth 24 or more",
    six.some((p) => partyWorth(p) >= 20 && partyWorth(p) < 24) &&
      six.every((p) => !!p.chief === partyWorth(p) >= 24),
    six.map((p) => partyWorth(p).toFixed(1) + (p.chief ? "*" : "")).join(" "),
  );
  for (let w = 1; w <= 12; w++) {
    s.t = 8 + w * HOURS_A_WEEK;
    spawn(s, realm);
  }
  check(
    "weekly spawns stop at 12 bands and 4 packs",
    count("brigands") === 12 && count("wolves") === 4,
    `${count("brigands")} bands, ${count("wolves")} packs`,
  );
  check(
    "a band worth 24 or more has a chief, and only those",
    s.parties
      .filter((p) => p.kind === "brigands")
      .every((p) => !!p.chief === partyWorth(p) >= 24) && s.parties.some((p) => p.chief),
  );
}

/** A party put down by hand on hex i, standing and waiting. */
function putParty(s, i, kind, troops, extra = {}) {
  const realm = realmOf(s);
  const lair = realm.places.find(
    (p) => p.kind === "lair" && p.lair === (kind === "wolves" ? "den" : "hideout"),
  );
  const party = {
    id: s.nextParty++,
    kind,
    name: kind === "wolves" ? "Test wolves" : "Test band",
    home: lair.id,
    at: { i, to: -1, progress: 0 },
    path: [],
    goal: "wait",
    until: s.t + 100,
    troops: band(troops),
    gold: kind === "brigands" ? purseOf(troops.reduce((m, [, n]) => m + n, 0)) : 0,
    ...extra,
  };
  s.parties.push(party);
  return party;
}
/** An open plains hex `d` from the start, with open plains between. */
function plainsAway(s, d) {
  const realm = realmOf(s);
  const from = s.player.at.i;
  return within(realm.grid, from, d).find((j) => {
    if (dist(realm.grid, from, j) !== d || realm.placeAt[j] >= 0) return false;
    const path = pathFor(realm, "wild", from, j);
    return (
      path &&
      path.length === d + 1 &&
      path.every((k) => k === from || [T.plains, T.farm].includes(realm.terrain[k]))
    );
  });
}
const hexPos = (realm, at) => {
  const a = centre(realm.grid, at.i);
  if (at.to < 0) return a;
  const b = centre(realm.grid, at.to);
  return { x: a.x + (b.x - a.x) * at.progress, y: a.y + (b.y - a.y) * at.progress };
};
const lone = () => {
  const s = fresh();
  s.parties = [];
  return s;
};
{
  check(
    "closest approach: head-on moves meet (0); passing a hex apart, 1; side by side, 0.5",
    near(closest({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }), 0) &&
      near(closest({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }), 1) &&
      near(closest({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }), 0.5),
  );
  const s = lone();
  const realm = realmOf(s);
  const j = plainsAway(s, 3);
  const pt = putParty(s, j, "brigands", [["militia", 20]]);
  const you = { hex: s.player.at.i, worth: yourWorth(s), shy: false, forest: false, truce: false };
  think(s, realm, pt, you, false);
  check(
    `a band worth ${partyWorth(pt).toFixed(1)} sees you (${you.worth.toFixed(2)}) 3 hexes off and hunts`,
    pt.goal === "hunt" && pt.path.at(-1) === s.player.at.i,
  );
  const weak = putParty(s, j, "brigands", [["levy", 4]]);
  think(s, realm, weak, you, false);
  check(
    "a band worth 2.24 flees you instead, to a hex farther off",
    weak.goal === "flee" &&
      dist(realm.grid, weak.path.at(-1), s.player.at.i) > dist(realm.grid, j, s.player.at.i),
  );
  const shy = putParty(s, j, "brigands", [["militia", 20]]);
  think(s, realm, shy, { ...you, shy: true }, false);
  check("an outlaw no band has fought is left alone", shy.goal !== "hunt");
  const hid = putParty(s, j, "brigands", [["militia", 20]]);
  think(s, realm, hid, { ...you, forest: true }, false);
  check(
    "in a forest you're seen only within 2 hexes: the band 3 off doesn't come",
    hid.goal !== "hunt",
  );
  const dark = putParty(s, plainsAway(s, 4), "brigands", [["militia", 20]]);
  think(s, realm, dark, you, true);
  check("at night a band sees 3 hexes: one 4 off doesn't come", dark.goal !== "hunt");
  // A den for them where you stand: wolves stray no more than 8 from it.
  const den = { home: realm.starts.vale };
  const pack = putParty(s, j, "wolves", [["wolf", 9]], den);
  think(s, realm, pack, you, false);
  check(
    "a pack of 9 (7.83) smells you 3 hexes off and comes: you're not half again as strong",
    pack.goal === "hunt",
  );
  const cubs = putParty(s, j, "wolves", [["wolf", 6]], den);
  think(s, realm, cubs, you, false);
  check("a pack of 6 (5.22) runs from you (10.56)", cubs.goal === "flee");
  const off = putParty(s, plainsAway(s, 4), "wolves", [["wolf", 20]], den);
  think(s, realm, off, you, false);
  check("wolves 4 hexes off don't smell you", off.goal !== "hunt");

  // Rest beside it and let it come: contact within 0.6 of a hex.
  s.parties = [pt];
  rest(s);
  let met = null;
  for (let h = 0; h < 12 && !s.encounter; h++) {
    const events = advance(s);
    met = events.find((e) => e.k === "encounter") ?? met;
  }
  const gap = Math.hypot(
    hexPos(realm, s.player.at).x - hexPos(realm, pt.at).x,
    hexPos(realm, s.player.at).y - hexPos(realm, pt.at).y,
  );
  check(
    "it catches you: they came for you, as they came within 0.6 of a hex, and time stops",
    s.encounter?.party === pt.id &&
      s.encounter.by === "them" &&
      met?.id === pt.id &&
      gap / Math.sqrt(3) > 0.45 &&
      gap <= 0.6 * Math.sqrt(3) + 1e-9 &&
      !busy(s) &&
      !rest(s) &&
      !travelTo(s, j),
    `${(gap / Math.sqrt(3)).toFixed(2)} hex apart`,
  );
  const t0 = s.t;
  check("while you're met, an hour won't pass", advance(s).length === 0 && s.t === t0);
}
{
  // Pass by: a party that doesn't want you lets you walk right through.
  const s = lone();
  const realm = realmOf(s);
  const j = plainsAway(s, 3);
  putParty(s, plainsAway(s, 1), "brigands", [["levy", 3]], { until: s.t + 1000 });
  s.parties[0].goal = "wait";
  travelTo(s, j);
  const events = play(s);
  check(
    "walking past a band that doesn't want you: no meeting",
    !events.some((e) => e.k === "encounter") && s.player.at.i === j,
  );
}

// --- Meetings ------------------------------------------------------------------

console.log("\n# Meetings: Pay, Leave, a rearguard, a fight (world.md §5)\n");
/** You met `troops` on the next hex, them coming for you, and the meeting's seed. */
function meeting(troops, kind = "brigands", by = "them", seed = 99) {
  const s = lone();
  const pt = putParty(s, plainsAway(s, 1), kind, troops);
  s.encounter = { party: pt.id, by, seed };
  return { s, pt };
}
{
  const { s, pt } = meeting([["militia", 20]]);
  check(
    "a band that came for you, on foot as you are: Pay a fifth of 500, or a rearguard",
    JSON.stringify(choices(s)) ===
      JSON.stringify({ leave: false, rearguard: true, pay: 100, faster: false }),
    JSON.stringify(choices(s)),
  );
  const gold = pt.gold;
  check(
    "Pay: 100 gold goes from you to them",
    payOff(s) && s.player.gold === 400 && pt.gold === gold + 100,
  );
  check(
    "…and they leave you be for 3 days: no meeting, no hunt",
    !s.encounter && s.paid[pt.id] === s.t + 72,
  );
  const deal = structuredClone(s);
  pt.goal = "hunt";
  rest(s);
  let met = false;
  for (let h = 0; h < 70; h++) {
    if (!busy(s)) rest(s);
    advance(s);
    met ||= !!s.encounter;
  }
  check("70 hours on, side by side, they still haven't come", !met);
  const t1 = deal.t;
  const ok = attack(deal, pt.id);
  for (let h = 0; h < 6 && !deal.encounter; h++) advance(deal);
  check(
    "but you may break the deal: Attack, and you meet at once",
    ok &&
      deal.encounter?.party === pt.id &&
      deal.encounter.by === "you" &&
      !(pt.id in deal.paid) &&
      deal.t - t1 <= 2,
    `${deal.t - t1} h`,
  );

  check(
    "the payment is in the Journal",
    s.journal.some((e) => e.k === "paid" && e.gold === 100),
  );
}
{
  const { s } = meeting([["militia", 20]], "brigands", "you");
  const c = choices(s);
  check("a band you came for: Leave, and no Pay", c.leave && !c.rearguard && c.pay === 0);
  check("Leave: 6 hours' truce", leave(s) && !s.encounter && Object.values(s.truce)[0] === s.t + 6);
}
{
  const { s } = meeting([["wolf", 10]], "wolves");
  const c = choices(s);
  check(
    "wolves are faster and can't be paid: a rearguard only",
    c.rearguard && !c.leave && c.pay === 0,
  );
  check("…and Leave is refused", leave(s) === false && !!s.encounter);
}
{
  const { s } = meeting([["militia", 20]]);
  s.player.party.troops = [{ type: "ulus:horseman", n: 12, xp: 0, wounded: 0 }];
  check(
    "an all-horse warband (16.2 a day) is faster than a band: Leave",
    choices(s).leave && choices(s).faster,
  );
}
{
  const troops = [
    { type: "vale:levy", n: 12, xp: 0, wounded: 0 },
    { type: "vale:squire", n: 4, xp: 0, wounded: 0 },
  ];
  check(
    "a rearguard from 12 levies and 4 squires (worth 12.04) is the slow levies: 4 of them",
    JSON.stringify(rearguardOf(troops)) === JSON.stringify({ "vale:levy": 4 }),
    JSON.stringify(rearguardOf(troops)),
  );
  troops[0].wounded = 6;
  check(
    "the wounded don't stand in it: 6 fit levies and 4 squires (9.22) leave 3",
    JSON.stringify(rearguardOf(troops)) === JSON.stringify({ "vale:levy": 3 }),
    JSON.stringify(rearguardOf(troops)),
  );
  const { s } = meeting([["militia", 20]]);
  check(
    "Sacrifice with 12 levies alone (5.64): 2 stay behind; 6 hours' truce",
    sacrifice(s) &&
      s.player.party.troops[0].n === 10 &&
      !s.encounter &&
      Object.values(s.truce)[0] === s.t + 6 &&
      s.journal.at(-1).k === "rearguard" &&
      s.journal.at(-1).men === 2,
  );
}
{
  // A fight you win: 14 footmen against a small band.
  const { s, pt } = meeting(
    [
      ["levy", 9],
      ["militia", 2],
      ["bowman", 1],
    ],
    "brigands",
    "you",
    1,
  );
  s.player.party.troops = [{ type: "vale:footman", n: 14, xp: 0, wounded: 0 }];
  const before = structuredClone(s);
  const twin = structuredClone(s);
  const gold = s.player.gold;
  // The same battle, fought and counted with battle.js alone: what they lost.
  const theirs = aftermath(autoFinish(encounterBattle(structuredClone(s))), {
    worthOf,
    medicine: [0, 0],
  })[1];
  let value = 0;
  for (const m of [theirs.killed, theirs.captured])
    for (const [t, n] of Object.entries(m)) value += n * VALUE[t];
  const r = autoResolve(s);
  const again = autoResolve(before);
  check("the same meeting is the same fight", JSON.stringify(r) === JSON.stringify(again));
  check(
    "a win: the band is gone from the map, and you hear of it",
    r.kind === "won" && !s.parties.includes(pt) && !s.encounter && s.result === r,
  );
  check(
    `loot: the band's purse (${pt.gold}) and 15% of the ${value} gold its dead and taken were worth`,
    r.loot === pt.gold + Math.round(0.15 * value) && s.player.gold === gold + r.loot,
    `${r.loot} gold`,
  );
  const men = s.player.party.troops.reduce((m, t) => m + t.n, 0);
  check(
    "your dead leave the warband, your wounded stay in it",
    r.killed > 0 &&
      men === 14 - r.killed &&
      s.player.party.troops.reduce((m, t) => m + t.wounded, 0) === r.wounded,
    `${r.killed} killed, ${r.wounded} wounded`,
  );
  const held = s.player.party.prisoners.reduce((m, t) => m + t.n, 0);
  check("their taken ride with you as prisoners", held === r.taken && held >= 2, `${held}`);
  check("…and it's in the Journal", s.journal.at(-1).k === "won");
  check("the result waits to be read; Continue clears it", !busy(s) && (dismiss(s), !s.result));

  // With 10 prisoners already, the limit of 22 holds only 11.
  twin.player.party.prisoners = [{ type: "levy", n: 10 }];
  const full = autoResolve(twin);
  check(
    `prisoners ride along up to half your limit: 10 held, 1 more of ${r.taken} taken`,
    full.taken === 1 && twin.player.party.prisoners.reduce((m, t) => m + t.n, 0) === 11,
    `${full.taken} taken`,
  );
}
{
  // The banner's household are the hero's own (army.md §6): what it loses
  // isn't the warband's. 12 levies lose to 40 brigands, the household's four
  // footmen with them; only the levies count.
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const { s } = meeting([["militia", 40]], "brigands", "them", seed);
    const after = aftermath(autoFinish(encounterBattle(s)), { worthOf, medicine: [0, 0] })[0];
    if (after.killed["vale:footman"] > 0) found = { s, levies: after.killed["vale:levy"] ?? 0 };
  }
  const r = autoResolve(found.s);
  check(
    `the household's dead aren't yours: you lost ${found.levies} levies, and that's all you're told`,
    r.kind === "lost" && r.killed === found.levies,
    `${r.killed} killed`,
  );
}
{
  // Wolves: no purse, no prisoners.
  const { s } = meeting([["wolf", 8]], "wolves", "you");
  s.player.party.troops = [{ type: "manatarms", n: 20, xp: 0, wounded: 0 }];
  const gold = s.player.gold;
  const r = autoResolve(s);
  check(
    "beating wolves brings no loot and no prisoners",
    r.kind === "won" && r.loot === 0 && r.taken === 0 && s.player.gold === gold,
    `${r.kind}`,
  );
}
{
  // A fight you lose: 12 levies against 40 brigands, two hexes out.
  const { s, pt } = meeting([["militia", 40]]);
  s.player.at.i = plainsAway(s, 2);
  const gold = s.player.gold;
  const r = autoResolve(s);
  const realm = realmOf(s);
  const village = realm.places.find((p) => p.name === r.at);
  const nearest = Math.min(
    ...realm.places.filter((p) => p.kind === "village").map((p) => dist(realm.grid, p.i, pt.at.i)),
  );
  check(
    "a defeat: 12 fresh levies at the nearest village, your gold kept",
    r.kind === "lost" &&
      village?.kind === "village" &&
      s.player.at.i === village.i &&
      dist(realm.grid, village.i, pt.at.i) === nearest &&
      JSON.stringify(s.player.party.troops) ===
        JSON.stringify([{ type: "vale:levy", n: 12, xp: 0, wounded: 0 }]) &&
      s.player.gold === gold,
    r.at,
  );
  check(
    "…and the band lets you be for a day",
    s.truce[pt.id] === s.t + 24 && s.parties.includes(pt),
  );
  check("a band that's fought you no longer spares an outlaw", s.player.provoked === true);
}
{
  // Chasing: Attack a band in sight and you catch it, unless it runs.
  const s = lone();
  const realm = realmOf(s);
  const pt = putParty(s, plainsAway(s, 3), "brigands", [["levy", 17]], { until: s.t + 1000 });
  check("Attack needs the party in sight", attack(s, 999) === false);
  check("Attack: you set off after it", attack(s, pt.id) && busy(s) && s.player.chase === pt.id);
  play(s, 48);
  check(
    "a band worth 9.52 to your 10.56 neither hunts nor runs: you catch it, and you came for them",
    s.encounter?.party === pt.id && s.encounter.by === "you",
    s.encounter ? "" : `t ${s.t}, at ${s.player.at.i}, them at ${pt.at.i} (${pt.goal})`,
  );
  const t = lone();
  const runner = putParty(t, plainsAway(t, 3), "brigands", [["levy", 9]]);
  attack(t, runner.id);
  play(t, 24);
  check(
    "a band worth 5.04 runs, and on foot as you are, it keeps ahead for a day",
    !t.encounter && runner.goal === "flee",
    `${dist(realm.grid, t.player.at.i, runner.at.i)} hexes apart`,
  );
}
{
  // After a Leave, neither side can make contact for 6 hours, even chasing.
  const u = lone();
  const band2 = putParty(u, plainsAway(u, 2), "brigands", [["levy", 17]], { until: u.t + 1000 });
  u.encounter = { party: band2.id, by: "you", seed: 5 };
  leave(u);
  const t0 = u.t;
  attack(u, band2.id);
  for (let h = 0; h < 12 && !u.encounter; h++) advance(u);
  check(
    "after a Leave you can go after them, but you meet only once the 6 hours are out",
    u.encounter?.party === band2.id && u.t - t0 >= 6,
    `met after ${u.t - t0} h`,
  );
}
{
  // Travel stops when something hostile comes into sight (world.md §2).
  const s = lone();
  const realm = realmOf(s);
  const far = farTarget(s, 30);
  travelTo(s, far.place.i);
  // A strong band waiting 6 hexes along the way: out of sight at the start.
  const ahead = far.r.path[6];
  const pt = putParty(s, ahead, "brigands", [["militia", 30]], { until: s.t + 1000 });
  const events = play(s);
  const stop = events.find((e) => e.k === "stop");
  check(
    "travel stops itself when a stronger band comes into sight",
    stop?.why === "spotted" &&
      stop.id === pt.id &&
      events.some((e) => e.k === "spotted" && e.id === pt.id) &&
      !busy(s) &&
      dist(realm.grid, s.player.at.i, ahead) <= 4 &&
      dist(realm.grid, s.player.at.i, ahead) >= 3,
    `${dist(realm.grid, s.player.at.i, ahead)} hexes off`,
  );
  travelTo(s, far.place.i);
  const on = play(s, 2);
  check("going on, the same band doesn't stop you twice", !on.some((e) => e.k === "stop"));
}
{
  // The week turns: a hideout sends out a new band.
  const s = fresh();
  const realm = realmOf(s);
  const bands = s.parties.filter((p) => p.kind === "brigands").length;
  s.parties = s.parties.filter((p) => p.kind !== "brigands");
  s.t = HOURS_A_WEEK - 1;
  rest(s);
  advance(s, realm);
  check(
    "at the turn of the week, the hideouts send their bands out again",
    s.parties.filter((p) => p.kind === "brigands").length === bands,
    `${bands}`,
  );
}
{
  // Pickups lie in the open and are taken in passing.
  const s = lone();
  const realm = realmOf(s);
  const gold = realm.places.find((p) => p.kind === "pickup" && p.pickup === "gold");
  const chest = realm.places.find((p) => p.kind === "pickup" && p.pickup === "chest");
  const by = neighbours(realm.grid, gold.i).find((j) => realm.placeAt[j] < 0 && route(s, j));
  s.player.at.i = by;
  const g0 = s.player.gold;
  travelTo(s, gold.i);
  const events = play(s);
  check(
    `a pile of gold on the way: ${gold.amount} more gold, gone from the map, in the Journal`,
    s.player.gold === g0 + gold.amount &&
      s.gone.includes(gold.id) &&
      events.some((e) => e.k === "pickup" && e.id === gold.id && !e.none) &&
      s.journal.some((e) => e.k === "pickup" && e.id === gold.id),
  );
  travelTo(s, by);
  play(s);
  travelTo(s, gold.i);
  play(s);
  check("it's taken once", s.player.gold === g0 + gold.amount);
  if (chest) {
    const nb = neighbours(realm.grid, chest.i).find((j) => realm.placeAt[j] < 0 && route(s, j));
    s.player.at = { i: nb, to: -1, progress: 0 };
    travelTo(s, chest.i);
    const ev = play(s);
    check(
      "a chest stays where it is (it waits for M3)",
      !s.gone.includes(chest.id) && ev.some((e) => e.k === "pickup" && e.none),
    );
  }
}
{
  // The wounded heal a tenth of each stack every midnight.
  const s = lone();
  s.player.party.troops[0].wounded = 5;
  rest(s);
  play(s);
  check(
    "5 wounded of 12 levies, one midnight later: 3 (ceil of 1.2 healed)",
    s.player.party.troops[0].wounded === 3,
  );
}
{
  // The same orders on the same seed, a month on: the same world.
  const run = () => {
    const s = fresh();
    const stops = realmOf(s).places.filter((p) => p.kind === "town");
    let k = 0;
    while (s.t < 8 + 24 * 30) {
      if (s.encounter) autoResolve(s);
      if (s.result) dismiss(s);
      if (!busy(s)) travelTo(s, stops[k++ % stops.length].i) || rest(s);
      advance(s);
    }
    return s;
  };
  const a = run();
  check(
    "a month of the same orders on seed 7 ends in the same world, parties and all",
    JSON.stringify(a) === JSON.stringify(run()),
    `${a.parties.length} parties, ${a.journal.filter((e) => ["won", "lost", "draw"].includes(e.k)).length} fights`,
  );
  const back = readCampaign(JSON.parse(JSON.stringify(makeCampaign(a))));
  delete back.v;
  check(
    "its save loads back exactly, parties and truces included",
    JSON.stringify(back) === JSON.stringify(a),
  );
}

// --- The save ------------------------------------------------------------------

console.log("\n# The campaign save (tech.md §4)\n");
{
  const bytes = (list) => Uint8Array.from(list);
  check(
    'base64 by hand: "Man" → TWFu, "Ma" → TWE=, "M" → TQ==',
    encodeBits(bytes([77, 97, 110])) === "TWFu" &&
      encodeBits(bytes([77, 97])) === "TWE=" &&
      encodeBits(bytes([77])) === "TQ==",
  );
  let same = true;
  let o = 12345;
  for (let n = 1; n <= 40; n++) {
    const list = Array.from({ length: n }, () => (o = (o * 1103515245 + 12345) >>> 0) >>> 24);
    const enc = encodeBits(bytes(list));
    const dec = decodeBits(enc, n * 8);
    if (enc !== Buffer.from(list).toString("base64") || dec.join() !== list.join()) same = false;
  }
  check("matches Node's base64 and decodes back, 1 to 40 bytes", same);

  const s = fresh();
  const save = makeCampaign(s);
  const back = readCampaign(JSON.parse(JSON.stringify(save)));
  check(
    `a save carries CAMPAIGN_V (${CAMPAIGN_V}) and loads back`,
    save.v === CAMPAIGN_V && !!back,
  );
  check(
    "another version's save isn't loaded, and is noticed",
    readCampaign({ ...save, v: CAMPAIGN_V + 1 }) === null &&
      staleCampaign({ ...save, v: CAMPAIGN_V + 1 }) &&
      !staleCampaign(save) &&
      !staleCampaign(null),
  );
  check(
    "nothing, or junk, loads as no campaign",
    readCampaign(null) === null && readCampaign({ v: CAMPAIGN_V }) === null,
  );
  const size = JSON.stringify(save).length;
  check("a new campaign's save is under 4 KB (no terrain in it)", size < 4000, `${size} chars`);

  // Two weeks of wandering from settlement to settlement.
  const realm = realmOf(s);
  const stops = realm.places.filter((p) => p.kind === "town" || p.kind === "castle");
  let k = 0;
  while (s.t < 8 + 24 * 14) {
    // Whatever you meet on the way, fight it out.
    if (s.encounter) autoResolve(s);
    if (s.result) dismiss(s);
    travelTo(s, stops[k++ % stops.length].i);
    if (!busy(s)) rest(s);
    play(s, 24 * 14);
  }
  const later = JSON.stringify(makeCampaign(s)).length;
  // Seat and back, 35 times: an arrival logged each way, the 70th at home.
  const j = fresh();
  const jr = realmOf(j);
  const home = jr.places[jr.starts.vale];
  const seat = jr.places[home.parent];
  for (let trip = 0; trip < 70; trip++) {
    j.parties = []; // nothing on the road: this is about the Journal
    travelTo(j, trip % 2 ? home.i : seat.i);
    play(j);
  }
  const last = j.journal[j.journal.length - 1];
  check(
    "the Journal keeps the last 60 entries: after 70 arrivals, 60, the latest last",
    j.journal.length === 60 && j.journal.every((e) => e.k === "arrive") && last.id === home.id,
    `${j.journal.length}`,
  );
  check(
    `after two weeks the save is ${Math.round(later / 100) / 10} KB, under 200`,
    later < 200_000,
  );
}

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
