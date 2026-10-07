/**
 * Seed → realm (world.md §1). Pure and deterministic: the save keeps only the
 * seed and this rebuilds the terrain from it, so **any change to what this
 * returns breaks every save** (tech.md §3–4) — bump CAMPAIGN_V with it.
 *
 * A realm is static: terrain, rivers, roads, regions and every place's kind
 * and position. Whatever changes in play (who owns a mine, which pickups are
 * gone) lives in the campaign state, keyed by place id.
 */
import { makeGrid, neighbours, dist, findPath, spread, index, colOf, rowOf } from "./hex.js";
import { roll, rollInt } from "./rng.js";
import {
  SIZES,
  TERRAIN,
  T,
  ROAD,
  FORD,
  BRIDGE,
  CULTURE_IDS,
  REGIONS,
  NAMES,
  LAIRS,
  GREAT_LAIRS,
  SHRINE_ABILITIES,
  STONE_ATTRIBUTES,
} from "./data/world.js";

/** Seeds tried after the first before giving up (world.md §1, step 11). */
const TRIES = 20;

const SETTLEMENTS = new Set(["crownhold", "town", "castle", "village"]);
const isSettlement = (p) => SETTLEMENTS.has(p.kind);

/**
 * The realm for `seed`. If a seed makes an invalid map, the next one is
 * tried, and `used` records the one that worked.
 */
export function generate(seed, size = "medium") {
  for (let k = 0; k < TRIES; k++) {
    const realm = attempt((seed + k) >>> 0, size);
    if (realm) return { ...realm, seed, used: (seed + k) >>> 0 };
  }
  throw new Error(`crownless: no valid realm from seed ${seed}`);
}

/** Two octaves of value noise come from grids like this one (world.md §1, step 4). */
function makeNoise(o, cell, cols, rows) {
  const gw = Math.ceil(cols / cell) + 3;
  const gh = Math.ceil(rows / cell) + 3;
  const grid = Array.from({ length: gw * gh }, () => roll(o));
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (c, r) => {
    const x = c / cell;
    const y = r / cell;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const v = (i, j) => grid[(j + 1) * gw + i + 1];
    return lerp(lerp(v(x0, y0), v(x0 + 1, y0), fx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), fx), fy);
  };
}

function attempt(used, size) {
  const o = { rng: used };
  const { cols, rows } = SIZES[size];
  const g = makeGrid(cols, rows);
  const n = g.n;
  const pick = (list) => list[Math.floor(roll(o) * list.length)];
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(roll(o) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const hA = makeNoise(o, 9, cols, rows);
  const hB = makeNoise(o, 3.2, cols, rows);
  const mA = makeNoise(o, 8, cols, rows);
  const mB = makeNoise(o, 3, cols, rows);
  const warp = makeNoise(o, 4, cols, rows);
  const weigh = makeNoise(o, 2.5, cols, rows);
  const height = new Float64Array(n);
  const wet = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = colOf(g, i);
    const r = rowOf(g, i);
    height[i] = 0.62 * hA(c, r) + 0.38 * hB(c, r);
    wet[i] = 0.6 * mA(c, r) + 0.4 * mB(c, r);
  }

  // 1–2. Crownhold at the centre; the four capitals on a cross round it, the
  // cultures in a random rotation. The map is taller than wide, so the
  // north and south arms reach further.
  const cx = Math.floor(cols / 2) + rollInt(o, -2, 2);
  const cy = Math.floor(rows / 2) + rollInt(o, -2, 2);
  const crown = index(g, cx, cy);
  const rot = rollInt(o, 0, 3);
  const arms = [
    [rollInt(o, -2, 2), -rollInt(o, 11, 14)],
    [rollInt(o, 8, 10), rollInt(o, -2, 2)],
    [rollInt(o, -2, 2), rollInt(o, 11, 14)],
    [-rollInt(o, 8, 10), rollInt(o, -2, 2)],
  ];
  const seats = { crown };
  arms.forEach(([dc, dr], k) => {
    seats[CULTURE_IDS[(k + rot) % 4]] = index(g, cx + dc, cy + dr);
  });

  // 3. Regions: Crownhold's plateau, then a weighted flood from the four seats.
  const region = new Uint8Array(n);
  const plateau = (i) => dist(g, i, crown) <= 4 + (warp(colOf(g, i), rowOf(g, i)) > 0.62 ? 1 : 0);
  const fill = spread(
    g,
    CULTURE_IDS.map((c) => seats[c]),
    (j) => (plateau(j) ? Infinity : 1 + 1.6 * weigh(colOf(g, j), rowOf(g, j))),
  );
  for (let i = 0; i < n; i++)
    region[i] = plateau(i) ? 0 : REGIONS.indexOf(CULTURE_IDS[fill.owner[i]]);

  // 4. Terrain from height and wetness, biased per region; sea round the edge.
  const terrain = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = colOf(g, i);
    const r = rowOf(g, i);
    const h = height[i];
    const m = wet[i];
    const edge = Math.min(c, cols - 1 - c, r, rows - 1 - r) + (hB(c, r) - 0.5) * 5;
    const reg = REGIONS[region[i]];
    let t;
    if (edge < 1.4) t = T.sea;
    else if (reg === "vale") t = h > 0.7 ? T.hills : m > 0.64 ? T.forest : T.plains;
    else if (reg === "fen")
      t = m > 0.6 && h < 0.46 ? T.marsh : m > 0.42 ? T.forest : h > 0.74 ? T.hills : T.plains;
    else if (reg === "hold")
      t = h > 0.66 ? T.mountains : h > 0.44 ? T.hills : m > 0.6 ? T.forest : T.plains;
    else if (reg === "ulus") t = h > 0.76 ? T.hills : m > 0.74 ? T.plains : T.steppe;
    else t = h > 0.72 ? T.hills : T.plains;
    if (t !== T.sea && reg !== "crown" && m > (reg === "fen" ? 0.76 : 0.82) && h < 0.34) t = T.lake;
    terrain[i] = t;
  }
  // Seats stand on open ground, with room round them.
  for (const s of Object.values(seats)) {
    terrain[s] = T.plains;
    for (const j of neighbours(g, s))
      if (terrain[j] === T.mountains || terrain[j] === T.lake) terrain[j] = T.hills;
  }

  // Ridges along Kharum's borders and some others; passes are cut below.
  const ridges = new Map(); // "a-b" → ridge hexes
  const pairOn = new Map();
  for (let a = 1; a < REGIONS.length; a++)
    for (let b = a + 1; b < REGIONS.length; b++) {
      const hold = REGIONS[a] === "hold" || REGIONS[b] === "hold";
      pairOn.set(`${a}-${b}`, hold || roll(o) < 0.3);
    }
  const nearSeat = (i) => Object.values(seats).some((s) => dist(g, i, s) <= 2);
  for (let i = 0; i < n; i++) {
    if (terrain[i] === T.sea || terrain[i] === T.lake || region[i] === 0 || nearSeat(i)) continue;
    for (const j of neighbours(g, i)) {
      const b = region[j];
      if (b === 0 || b === region[i]) continue;
      const lo = Math.min(region[i], b);
      const hi = Math.max(region[i], b);
      if (!pairOn.get(`${lo}-${hi}`)) continue;
      // One side carries the ridge: Kharum's, else the lower region's.
      const side = REGIONS[lo] === "hold" || REGIONS[hi] === "hold" ? REGIONS.indexOf("hold") : lo;
      if (region[i] !== side) continue;
      terrain[i] = T.mountains;
      const key = `${lo}-${hi}`;
      if (!ridges.has(key)) ridges.set(key, []);
      ridges.get(key).push(i);
      break;
    }
  }

  // 5. Rivers run downhill from high ground to the sea, a ford every ~6 hexes.
  const flags = new Uint8Array(n);
  const rivers = [];
  const wantRivers = rollInt(o, 3, 5);
  const edgeOf = (i) =>
    Math.min(colOf(g, i), cols - 1 - colOf(g, i), rowOf(g, i), rows - 1 - rowOf(g, i));
  const water = (i) => terrain[i] === T.sea || terrain[i] === T.lake;
  const sources = [];
  for (let i = 0; i < n; i++)
    if (region[i] !== 0 && height[i] > 0.6 && !water(i) && !nearSeat(i)) sources.push(i);
  sources.sort((a, b) => height[b] - height[a] || a - b);
  for (const s of sources) {
    if (rivers.length >= wantRivers) break;
    if (rivers.some((rv) => rv.some((j) => dist(g, j, s) < 9))) continue;
    const path = [s];
    const seen = new Set(path);
    let cur = s;
    let end = false;
    for (let step = 0; step < 70; step++) {
      let next = -1;
      let best = Infinity;
      for (const j of neighbours(g, cur)) {
        if (seen.has(j) || nearSeat(j)) continue;
        const v = height[j] + 0.03 * edgeOf(j);
        if (v < best) {
          best = v;
          next = j;
        }
      }
      if (next < 0) break;
      if (water(next) || terrain[next] === T.river) {
        end = true;
        break;
      }
      path.push(next);
      seen.add(next);
      cur = next;
    }
    if (!end || path.length < 8) continue;
    rivers.push(path);
    for (const j of path) terrain[j] = T.river;
    for (let k = rollInt(o, 2, 4); k < path.length; k += rollInt(o, 5, 7)) flags[path[k]] |= FORD;
  }
  if (rivers.length < 3) return null;

  // 6. Settlements.
  const places = [];
  const placeAt = new Int16Array(n).fill(-1);
  const settleable = (i) =>
    placeAt[i] < 0 &&
    terrain[i] !== T.sea &&
    terrain[i] !== T.lake &&
    terrain[i] !== T.mountains &&
    terrain[i] !== T.pass &&
    terrain[i] !== T.river;
  // How far each hex is from the nearest place, of any kind and of each
  // kind, up to 10: the spacing rules read these instead of every place.
  const near = {};
  const nearOf = (key, i) => (near[key] ? near[key][i] : 255);
  const stamp = (key, at) => {
    const arr = (near[key] ??= new Uint8Array(n).fill(255));
    let ring = [at];
    arr[at] = 0;
    for (let d = 1; d <= 10 && ring.length; d++) {
      const next = [];
      for (const i of ring)
        for (let k = 0; k < 6; k++) {
          const j = g.nb[i * 6 + k];
          if (j >= 0 && arr[j] > d) {
            arr[j] = d;
            next.push(j);
          }
        }
      ring = next;
    }
  };
  const put = (kind, i, extra = {}) => {
    if (placeAt[i] >= 0) throw new Error(`crownless: two places on hex ${i}`);
    const p = { id: places.length, kind, i, ...extra };
    places.push(p);
    placeAt[i] = p.id;
    stamp("any", i);
    stamp(kind, i);
    if (bigPlace(p)) stamp("big", i);
    if (isSettlement(p) && terrain[i] !== T.hills && terrain[i] !== T.forest) terrain[i] = T.plains;
    return p;
  };
  const bigPlace = (p) => p.kind === "town" || p.kind === "castle" || p.kind === "crownhold";
  const names = {};
  for (const c of CULTURE_IDS) names[c] = [NAMES[c][0], ...shuffle(NAMES[c].slice(1))];

  put("crownhold", crown, { name: "Crownhold", culture: null, region: 0 });
  for (const c of CULTURE_IDS) {
    const reg = REGIONS.indexOf(c);
    const seat = seats[c];
    put("town", seat, { name: names[c].shift(), culture: c, region: reg, capital: true });
  }
  for (const c of CULTURE_IDS) {
    const reg = REGIONS.indexOf(c);
    const seat = seats[c];
    const choose = (filters) => {
      for (const f of filters) {
        const list = [];
        for (let i = 0; i < n; i++) if (settleable(i) && f(i)) list.push(i);
        if (list.length) return pick(list);
      }
      return -1;
    };
    const t2 = choose([
      (i) =>
        region[i] === reg &&
        dist(g, i, seat) >= 7 &&
        dist(g, i, seat) <= 11 &&
        nearOf("big", i) >= 5 &&
        nearOf("any", i) >= 3,
      (i) => region[i] === reg && dist(g, i, seat) >= 5 && nearOf("big", i) >= 4,
    ]);
    if (t2 < 0) return null;
    put("town", t2, { name: names[c].shift(), culture: c, region: reg });
    const frontier = (i) =>
      neighbours(g, i).some((j) => region[j] !== reg && !water(j)) ||
      neighbours(g, i).some((j) => neighbours(g, j).some((k) => region[k] !== reg && !water(k)));
    for (let k = 0; k < 3; k++) {
      const at = choose([
        (i) =>
          region[i] === reg &&
          dist(g, i, seat) >= 5 &&
          dist(g, i, seat) <= 13 &&
          frontier(i) &&
          nearOf("big", i) >= 5 &&
          nearOf("any", i) >= 3,
        (i) => region[i] === reg && dist(g, i, seat) >= 4 && nearOf("big", i) >= 4,
      ]);
      if (at < 0) return null;
      put("castle", at, { name: names[c].shift(), culture: c, region: reg });
    }
  }
  for (const p of [...places]) {
    if (p.kind !== "town" && p.kind !== "castle") continue;
    const want = p.kind === "town" ? 3 : rollInt(o, 1, 2);
    for (let k = 0; k < want; k++) {
      const list = [];
      for (let i = 0; i < n; i++) {
        if (!settleable(i)) continue;
        const d = dist(g, i, p.i);
        if (d < 2 || d > 4) continue;
        if (!places.every((q) => q === p || dist(g, q.i, i) >= 3)) continue;
        list.push(i);
      }
      if (!list.length) continue;
      const at = pick(list);
      const t = terrain[at];
      const spec =
        t === T.hills ||
        neighbours(g, at).some((j) => terrain[j] === T.hills || terrain[j] === T.mountains)
          ? roll(o) < 0.7
            ? "iron"
            : "grain"
          : t === T.steppe
            ? roll(o) < 0.6
              ? "horses"
              : "grain"
            : roll(o) < 0.15
              ? "horses"
              : "grain";
      put("village", at, {
        name: names[p.culture].shift(),
        culture: p.culture,
        region: region[at],
        parent: p.id,
        specialty: spec,
      });
      if (terrain[at] === T.plains || terrain[at] === T.steppe) terrain[at] = T.farm;
      for (const j of neighbours(g, at))
        if ((terrain[j] === T.plains || terrain[j] === T.steppe) && placeAt[j] < 0 && roll(o) < 0.5)
          terrain[j] = T.farm;
    }
  }

  // 7. Roads, by A* over terrain, preferring road; they cut passes through
  // ridges and bridge rivers where they must.
  const roads = [];
  const roadCost = (j) => {
    const t = terrain[j];
    let c;
    if (t === T.sea || t === T.lake) return Infinity;
    if (t === T.mountains) c = 12;
    else if (t === T.river) c = flags[j] & BRIDGE ? 1 : 4;
    else c = TERRAIN[t].cost;
    return flags[j] & ROAD ? c * 0.5 : c;
  };
  const link = (a, b) => {
    const found = findPath(g, a.i, b.i, roadCost, 0.4);
    if (!found) return false;
    for (const j of found.path) {
      flags[j] |= ROAD;
      if (terrain[j] === T.mountains) terrain[j] = T.pass;
      if (terrain[j] === T.river) flags[j] |= BRIDGE;
    }
    roads.push(found.path);
    return true;
  };
  const seatsList = places.filter((p) => p.kind === "town" || p.kind === "castle");
  const inTree = [seatsList[0]];
  const left = seatsList.slice(1);
  const treeEdges = new Set();
  while (left.length) {
    let bi = 0;
    let bj = 0;
    let bd = Infinity;
    left.forEach((p, i) =>
      inTree.forEach((q, j) => {
        const d = dist(g, p.i, q.i);
        if (d < bd) [bd, bi, bj] = [d, i, j];
      }),
    );
    if (!link(inTree[bj], left[bi])) return null;
    treeEdges.add(`${inTree[bj].id}-${left[bi].id}`).add(`${left[bi].id}-${inTree[bj].id}`);
    inTree.push(left.splice(bi, 1)[0]);
  }
  const extras = [];
  for (const p of seatsList)
    for (const q of seatsList)
      if (p.id < q.id && p.culture !== q.culture && !treeEdges.has(`${p.id}-${q.id}`)) {
        const d = dist(g, p.i, q.i);
        if (d <= 14) extras.push([d, p, q]);
      }
  extras.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id || a[2].id - b[2].id);
  for (const [, p, q] of extras.slice(0, rollInt(o, 2, 3))) link(p, q);
  for (const c of CULTURE_IDS)
    if (!link(places[CULTURE_IDS.indexOf(c) + 1], places[0])) return null;
  for (const p of places) if (p.kind === "village" && !link(places[p.parent], p)) return null;

  // Every ridge gets two or three passes, roads' included.
  for (const [key, hexes] of ridges) {
    const [a, b] = key.split("-").map(Number);
    const passes = hexes.filter((i) => terrain[i] === T.pass);
    const want = rollInt(o, 2, 3);
    for (const i of shuffle(hexes)) {
      if (passes.length >= want) break;
      if (terrain[i] !== T.mountains || passes.some((p) => dist(g, p, i) < 6)) continue;
      const open = (reg) =>
        neighbours(g, i).some(
          (j) =>
            region[j] === reg && terrain[j] !== T.mountains && terrain[j] !== T.river && !water(j),
        );
      if (!open(a) || !open(b)) continue;
      terrain[i] = T.pass;
      passes.push(i);
    }
  }

  // Which hexes a party can reach from Crownhold.
  const passable = (j) =>
    terrain[j] === T.river
      ? (flags[j] & (FORD | BRIDGE)) !== 0
      : Number.isFinite(TERRAIN[terrain[j]].cost);
  const comp = new Uint8Array(n);
  {
    const stack = [crown];
    comp[crown] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const j of neighbours(g, i))
        if (!comp[j] && passable(j)) {
          comp[j] = 1;
          stack.push(j);
        }
    }
  }
  // 11 (first half). Every settlement reaches every other by land.
  if (!places.every((p) => comp[p.i])) return null;

  // 12. Each culture starts at a village of its capital, the nearest.
  const starts = {};
  for (const c of CULTURE_IDS) {
    const cap = places.find((p) => p.capital && p.culture === c);
    const vs = places
      .filter((p) => p.kind === "village" && p.parent === cap.id)
      .sort((a, b) => dist(g, a.i, cap.i) - dist(g, b.i, cap.i) || a.id - b.id);
    if (!vs.length) return null;
    starts[c] = vs[0].id;
  }

  // 8–10. Sites, lairs and scatter, all in the wilds a party can reach.
  const settleDist = spread(
    g,
    places.filter(isSettlement).map((p) => p.i),
    () => 1,
  ).best;
  const capDist = spread(
    g,
    places.filter((p) => p.capital).map((p) => p.i),
    () => 1,
  ).best;
  const wild = (i, fromSettlements = 3) =>
    comp[i] &&
    settleable(i) &&
    region[i] !== 0 &&
    settleDist[i] >= fromSettlements &&
    nearOf("any", i) >= 2;
  const guardOf = (i) => {
    const t = Math.min(1, Math.max(0, (capDist[i] - 4) / 16));
    return 5 * Math.round((20 + 100 * t) / 5);
  };
  const scatter = (count, filter, make, spacing = 0, sameKind = null) => {
    for (let k = 0; k < count; k++) {
      const list = [];
      for (let i = 0; i < n; i++)
        if (filter(i) && (!spacing || nearOf(sameKind, i) >= spacing)) list.push(i);
      if (!list.length) return;
      make(pick(list));
    }
  };

  for (const c of CULTURE_IDS) {
    const reg = REGIONS.indexOf(c);
    const iron = (i) =>
      wild(i) &&
      region[i] === reg &&
      (terrain[i] === T.hills ||
        neighbours(g, i).some((j) => terrain[j] === T.mountains || terrain[j] === T.pass));
    const anyIn = (i) => wild(i) && region[i] === reg;
    const ironCount = rollInt(o, 1, 2);
    const before = places.length;
    scatter(ironCount, iron, (i) => put("iron", i, { region: reg, guard: guardOf(i) }), 3, "iron");
    if (places.length === before)
      scatter(1, anyIn, (i) => put("iron", i, { region: reg, guard: guardOf(i) }));
    const ranch = (i) =>
      wild(i) && region[i] === reg && (terrain[i] === T.plains || terrain[i] === T.steppe);
    const mid = places.length;
    scatter(
      rollInt(o, 1, 2),
      ranch,
      (i) => put("ranch", i, { region: reg, guard: guardOf(i) }),
      3,
      "ranch",
    );
    if (places.length === mid)
      scatter(1, anyIn, (i) => put("ranch", i, { region: reg, guard: guardOf(i) }));
  }
  const between = (i) =>
    neighbours(g, i).some((j) => region[j] !== region[i] && region[j] !== 0 && !water(j)) ||
    neighbours(g, i).some((j) =>
      neighbours(g, j).some((k) => region[k] !== region[i] && region[k] !== 0 && !water(k)),
    );
  scatter(
    rollInt(o, 2, 3),
    (i) => wild(i, 4) && between(i),
    (i) => put("gold", i, { region: region[i], guard: guardOf(i) }),
    6,
    "gold",
  );

  // 9. Lairs, harder the further from any capital; none near a start.
  const startHexes = Object.values(starts).map((id) => places[id].i);
  const lairHexes = [];
  scatter(
    rollInt(o, 8, 12),
    (i) =>
      wild(i, 4) &&
      startHexes.every((s) => dist(g, s, i) > 5) &&
      lairHexes.every((l) => dist(g, l, i) >= 4),
    (i) => lairHexes.push(i),
  );
  const lairT = (i) => Math.min(1, Math.max(0, (capDist[i] - 5) / 15));
  lairHexes.sort((a, b) => lairT(a) - lairT(b) || a - b);
  lairHexes.forEach((i, k) => {
    const t = lairT(i);
    let lair;
    if (k < 4) lair = k % 2 ? "den" : "hideout";
    else if (t < 0.4) lair = pick(["hideout", "den"]);
    else if (t < 0.7) lair = pick(["hideout", "den", "barrow", "troll"]);
    else lair = pick(["troll", "barrow", "fort"]);
    if (lair === "troll" && !neighbours(g, i).some((j) => terrain[j] === T.river)) lair = "barrow";
    const [lo, hi] = LAIRS[lair].guard;
    put("lair", i, { region: region[i], lair, guard: 5 * Math.round((lo + (hi - lo) * t) / 5) });
  });

  // The three great lairs, about as far from Crownhold as each other, hidden.
  const ring = rollInt(o, 13, 15);
  shuffle(CULTURE_IDS)
    .slice(0, 3)
    .forEach((c, k) => {
      const reg = REGIONS.indexOf(c);
      let best = Infinity;
      let list = [];
      for (const [away, fromStart] of [
        [5, 8],
        [3, 6],
      ]) {
        for (let i = 0; i < n; i++) {
          if (!wild(i, away) || region[i] !== reg) continue;
          if (startHexes.some((s) => dist(g, s, i) < fromStart)) continue;
          const off = Math.abs(dist(g, i, crown) - ring);
          if (off < best) {
            best = off;
            list = [];
          }
          if (off === best) list.push(i);
        }
        if (list.length) break;
      }
      if (list.length)
        put("great", pick(list), { region: reg, great: GREAT_LAIRS[k].id, hidden: true });
    });
  if (places.filter((p) => p.kind === "great").length < 3) return null;

  // 10. Scatter: pickups, shrines, watchtowers, mercenary camps, standing stones.
  scatter(
    rollInt(o, 30, 50),
    (i) => comp[i] && settleable(i) && settleDist[i] >= 2 && nearOf("any", i) >= 2,
    (i) => {
      const r = roll(o);
      if (r < 0.45) put("pickup", i, { pickup: "gold", amount: 10 * rollInt(o, 5, 15) });
      else if (r < 0.6) put("pickup", i, { pickup: "chest" });
      else if (r < 0.725) put("pickup", i, { pickup: "iron", amount: 3 });
      else if (r < 0.85) put("pickup", i, { pickup: "horses", amount: 2 });
      else put("pickup", i, { pickup: "arms" });
    },
  );
  const abilities = shuffle(SHRINE_ABILITIES);
  let shrines = 0;
  scatter(
    rollInt(o, 4, 6),
    (i) => wild(i),
    (i) => put("shrine", i, { ability: abilities[shrines++ % 4] }),
    8,
    "shrine",
  );
  scatter(
    rollInt(o, 4, 6),
    (i) => wild(i, 2) && (terrain[i] === T.hills || height[i] > 0.58),
    (i) => put("tower", i, {}),
    9,
    "tower",
  );
  scatter(
    rollInt(o, 2, 3),
    (i) => wild(i) && neighbours(g, i).some((j) => flags[j] & ROAD),
    (i) => put("camp", i, {}),
    8,
    "camp",
  );
  const attrs = shuffle(STONE_ATTRIBUTES);
  let stones = 0;
  scatter(
    rollInt(o, 3, 4),
    (i) => wild(i),
    (i) => put("stone", i, { attribute: attrs[stones++ % 4] }),
    8,
    "stone",
  );

  // 11 (second half). Each faction has iron and horses at home.
  for (const c of CULTURE_IDS) {
    const reg = REGIONS.indexOf(c);
    if (!places.some((p) => p.kind === "iron" && p.region === reg)) return null;
    if (!places.some((p) => p.kind === "ranch" && p.region === reg)) return null;
  }

  return {
    size,
    grid: g,
    cols,
    rows,
    terrain,
    flags,
    region,
    placeAt,
    places,
    rivers,
    roads,
    seats,
    starts,
    hash: hashOf(terrain, flags, region, places),
  };
}

/** A fingerprint of everything static about a realm (FNV-1a). */
function hashOf(terrain, flags, region, places) {
  let h = 0x811c9dc5;
  const mixIn = (v) => {
    h ^= v & 255;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < terrain.length; i++) {
    mixIn(terrain[i]);
    mixIn(flags[i]);
    mixIn(region[i]);
  }
  for (const p of places) {
    for (const ch of p.kind) mixIn(ch.charCodeAt(0));
    mixIn(p.i);
    mixIn(p.i >> 8);
  }
  return h.toString(16).padStart(8, "0");
}
