/**
 * The map rules, checked in Node: the realm a seed makes, travel, the clock,
 * sight and the campaign save. No browser, a few seconds.
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
} from "../../games/crownless/rules/world.js";
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
