/**
 * Crownless mockups — what the world map and a battle are meant to look like
 * on a 390 × 844 phone, drawn the way ui.md §6 says the game will draw them:
 * canvas, code, no image files.
 *
 *   index.html?view=map        the world map, day 14, travelling to a town
 *   index.html?view=overview   the whole realm, day 52, the Hollow risen
 *   index.html?view=battle     a frame of a real battle, from the game's rules
 *
 * This is a picture, not the game: the world generator here is a sketch of
 * world.md §1 good enough to look right, and the chrome is painted rather
 * than built from DOM sheets. render.mjs turns each view into a PNG.
 */
import {
  createBattle,
  beginRound,
  finishRound,
  step,
  ROUND_S,
  DT,
} from "../../../games/crownless/rules/battle.js";
import { troop } from "../../../games/crownless/rules/data/troops.js";

const params = new URLSearchParams(location.search);
const VIEW = params.get("view") ?? "map";
const SEED = Number(params.get("seed") ?? 7);
const DPR = Number(params.get("dpr") ?? 2);

const W = 390;
const H = 844;
const canvas = document.querySelector("canvas");
canvas.width = W * DPR;
canvas.height = H * DPR;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const ctx = canvas.getContext("2d");
ctx.scale(DPR, DPR);

// --- Palette (shared/style.css, ui.md §6) ---------------------------------------

const BG = "#10131a";
const RAISED = "#191e29";
const CARD = "#232a38";
const LINE = "#2a3242";
const FG = "#e8ecf4";
const DIM = "#8d98ad";
const ACCENT = "#4ade80";
const GOLD = "#fbbf24";
const DANGER = "#f87171";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "DejaVu Sans", sans-serif';

const FACTIONS = {
  vale: { name: "Valemark", color: "#5b8def", dark: "#1f3a66", charge: "chevron" },
  fen: { name: "Fenreach", color: "#4caf6a", dark: "#1d4a2b", charge: "tree" },
  hold: { name: "Kharum", color: "#d08a3c", dark: "#5e3a12", charge: "anvil" },
  ulus: { name: "Ulus", color: "#b46bd6", dark: "#4a2260", charge: "crescent" },
  crown: { name: "Crownhold", color: "#8fd3c8", dark: "#2b524c", charge: "crown" },
  brig: { name: "Brigands", color: "#8a8f98", dark: "#363a42", charge: "knives" },
  you: { name: "You", color: "#e05561", dark: "#6b1f29", charge: "star" },
};

const TERRAIN = {
  plains: { fill: "#6f8f4e", cost: 1 },
  farm: { fill: "#8a9a52", cost: 1 },
  steppe: { fill: "#a39a5c", cost: 0.9 },
  forest: { fill: "#2f5d3a", cost: 1.6 },
  marsh: { fill: "#4d6b5a", cost: 2 },
  hills: { fill: "#7d7350", cost: 1.4 },
  mountains: { fill: "#6b6b72", cost: Infinity },
  water: { fill: "#2b4c6f", cost: Infinity },
};

// --- Small helpers ----------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A stable pseudo-random number in [0, 1) for any pair of integers. */
const hash = (a, b = 0) => rng(((a * 73856093) ^ (b * 19349663) ^ SEED) >>> 0)();
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mix(hexA, hexB, t) {
  const pa = parseInt(hexA.slice(1), 16);
  const pb = parseInt(hexB.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const c = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), t));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function text(
  str,
  x,
  y,
  { size = 13, weight = 400, color = FG, align = "left", halo = null } = {},
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if (halo) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.lineJoin = "round";
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  return ctx.measureText(str).width;
}

function rrect(x, y, w, h, r, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// --- Hexes (pointy-top, odd rows shifted right) ------------------------------------

const COLS = 38;
const ROWS = 56;
const SQ3 = Math.sqrt(3);
const inside = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const key = (c, r) => r * COLS + c;
const NB = [
  [
    [1, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [0, 1],
    [-1, 1],
  ],
  [
    [1, 0],
    [-1, 0],
    [1, -1],
    [0, -1],
    [1, 1],
    [0, 1],
  ],
];
const neighbours = (c, r) =>
  NB[r & 1].map(([dc, dr]) => [c + dc, r + dr]).filter(([a, b]) => inside(a, b));
function cube(c, r) {
  const x = c - (r - (r & 1)) / 2;
  return [x, -x - r, r];
}
function hexDist(a, b) {
  const A = cube(a[0], a[1]);
  const B = cube(b[0], b[1]);
  return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
}
const centre = (c, r, R) => ({
  x: R * SQ3 * (c + 0.5 * (r & 1)) + (R * SQ3) / 2,
  y: R * 1.5 * r + R,
});

function hexPath(x, y, R) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const px = x + R * Math.cos(a);
    const py = y + R * Math.sin(a);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function makeNoise(rnd, cell) {
  const gw = Math.ceil(COLS / cell) + 3;
  const gh = Math.ceil(ROWS / cell) + 3;
  const g = Array.from({ length: gw * gh }, rnd);
  return (c, r) => {
    const x = c / cell;
    const y = r / cell;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const v = (i, j) => g[(j + 1) * gw + i + 1];
    return lerp(lerp(v(x0, y0), v(x0 + 1, y0), fx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), fx), fy);
  };
}

// --- A sketch of world.md §1 -----------------------------------------------------

const NAMES = {
  vale: [
    "Valecourt",
    "Ashford",
    "Greyford",
    "Edrin's Keep",
    "Marrowby",
    "Hollin",
    "Westmere",
    "Brackwater",
    "Oakhurst",
    "Lowden",
    "Saltash",
    "Fernley",
    "Corbridge",
    "Thornbury",
  ],
  fen: [
    "Mirefall",
    "Reedholm",
    "Wychwood",
    "Fenwick",
    "Sallow",
    "Bramblecross",
    "Mossgate",
    "Alderney",
    "Willowby",
    "Sedgemoor",
    "Rushden",
    "Otterburn",
    "Elmstead",
  ],
  hold: [
    "Kharum",
    "Dun Varra",
    "Ironhold",
    "Grimscar",
    "Stonehearth",
    "Brannoc",
    "Highcairn",
    "Vorth",
    "Deepforge",
    "Skarn",
    "Haldrim",
    "Cragmoor",
    "Orlek",
  ],
  ulus: [
    "Ordu Khaan",
    "Saran",
    "Kherlen",
    "Altan",
    "Bayan",
    "Ulaan",
    "Tsagaan",
    "Khulan",
    "Boro",
    "Arslan",
    "Temur",
    "Nogai",
    "Kheshig",
  ],
};

function generate(seed) {
  const rnd = rng(seed);
  const hA = makeNoise(rnd, 9);
  const hB = makeNoise(rnd, 3.2);
  const mA = makeNoise(rnd, 8);
  const mB = makeNoise(rnd, 3);
  const wX = makeNoise(rnd, 6);
  const wY = makeNoise(rnd, 6);
  const seats = { hold: [19, 9], ulus: [31, 29], fen: [15, 47], vale: [6, 26], crown: [19, 28] };
  const seatPx = Object.fromEntries(
    Object.entries(seats).map(([k, [c, r]]) => [k, centre(c, r, 1)]),
  );

  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const h = 0.62 * hA(c, r) + 0.38 * hB(c, r);
      const m = 0.6 * mA(c, r) + 0.4 * mB(c, r);
      const p = centre(c + (wX(c, r) - 0.5) * 7, r + (wY(c, r) - 0.5) * 7, 1);
      let region = "crown";
      let best = Math.hypot(p.x - seatPx.crown.x, p.y - seatPx.crown.y) < 8.5 ? -1 : Infinity;
      if (best !== -1) {
        for (const k of ["hold", "ulus", "fen", "vale"]) {
          const d = Math.hypot(p.x - seatPx[k].x, p.y - seatPx[k].y);
          if (d < best) {
            best = d;
            region = k;
          }
        }
      }
      const edge = Math.min(c, COLS - 1 - c, r, ROWS - 1 - r) + (hB(c, r) - 0.5) * 5;
      let t;
      if (edge < 1.4) t = "water";
      else if (region === "vale") t = h > 0.7 ? "hills" : m > 0.64 ? "forest" : "plains";
      else if (region === "fen")
        t = m > 0.6 && h < 0.46 ? "marsh" : m > 0.42 ? "forest" : h > 0.74 ? "hills" : "plains";
      else if (region === "hold")
        t = h > 0.64 ? "mountains" : h > 0.44 ? "hills" : m > 0.6 ? "forest" : "plains";
      else if (region === "ulus") t = h > 0.76 ? "hills" : m > 0.74 ? "plains" : "steppe";
      else t = h > 0.72 ? "hills" : "plains";
      if (region === "fen" && m > 0.78 && h < 0.35) t = "water";
      tiles.push({ c, r, h, m, region, t, river: false, road: false, place: null });
    }
  }
  const tile = (c, r) => tiles[key(c, r)];

  // Ridges along Kharum's borders, with passes.
  for (const T of tiles) {
    if (T.t === "water") continue;
    const border = neighbours(T.c, T.r).some(([a, b]) => {
      const o = tile(a, b);
      return o.region !== T.region && o.region !== "crown" && T.region !== "crown";
    });
    if (!border) continue;
    const kharum =
      T.region === "hold" || neighbours(T.c, T.r).some(([a, b]) => tile(a, b).region === "hold");
    const pass = hash(T.c >> 2, T.r >> 2) < 0.3;
    if (kharum && T.h > 0.3 && !pass) T.t = "mountains";
    else if (!kharum && T.h > 0.55) T.t = "hills";
  }

  // Rivers: downhill from high ground to the sea.
  const sources = tiles
    .filter((T) => ["hold", "vale", "fen"].includes(T.region) && T.h > 0.6 && T.t !== "water")
    .sort((a, b) => b.h - a.h);
  const rivers = [];
  for (const s of sources) {
    if (rivers.length >= 4) break;
    if (rivers.some((rv) => rv.some(([c, r]) => hexDist([c, r], [s.c, s.r]) < 9))) continue;
    const path = [[s.c, s.r]];
    const seen = new Set([key(s.c, s.r)]);
    let cur = s;
    for (let i = 0; i < 60; i++) {
      const edgeOf = ([c, r]) => Math.min(c, COLS - 1 - c, r, ROWS - 1 - r);
      const next = neighbours(cur.c, cur.r)
        .filter(([c, r]) => !seen.has(key(c, r)))
        .sort((a, b) => tile(...a).h + 0.03 * edgeOf(a) - (tile(...b).h + 0.03 * edgeOf(b)))[0];
      if (!next) break;
      path.push(next);
      seen.add(key(...next));
      cur = tile(...next);
      if (cur.t === "water") break;
    }
    if (cur.t === "water" && path.length > 8) {
      rivers.push(path);
      for (const [c, r] of path) {
        const T = tile(c, r);
        if (T.t !== "water") {
          T.river = true;
          if (T.t === "mountains") T.t = "hills";
        }
      }
    }
  }

  // Settlements.
  const places = [];
  const passable = (T) => T.t !== "water" && T.t !== "mountains";
  const free = (c, r, sep) => places.every((p) => hexDist([p.c, p.r], [c, r]) >= sep);
  const names = Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, [...v]]));
  const put = (kind, c, r, owner, extra = {}) => {
    const T = tile(c, r);
    if (!passable(T)) T.t = "plains";
    if (kind !== "town" && kind !== "castle" && kind !== "crownhold")
      T.river = T.river && kind === "village";
    const p = {
      kind,
      c,
      r,
      owner,
      culture: owner,
      name: owner in names ? names[owner].shift() : "",
      ...extra,
    };
    places.push(p);
    T.place = p;
    return p;
  };
  const pick = (filter, sep) => {
    const cands = tiles.filter((T) => passable(T) && !T.place && filter(T) && free(T.c, T.r, sep));
    return cands.length ? cands[Math.floor(rnd() * cands.length)] : null;
  };
  put("crownhold", ...seats.crown, "crown", { name: "Crownhold" });
  for (const f of ["vale", "fen", "hold", "ulus"]) {
    const cap = put("town", ...seats[f], f);
    const seat = seats[f];
    const t2 = pick(
      (T) =>
        T.region === f &&
        hexDist([T.c, T.r], seat) >= 7 &&
        hexDist([T.c, T.r], seat) <= 11 &&
        !T.river,
      5,
    );
    if (t2) put("town", t2.c, t2.r, f);
    for (let i = 0; i < 3; i++) {
      const k = pick(
        (T) =>
          T.region === f &&
          hexDist([T.c, T.r], seat) >= 5 &&
          hexDist([T.c, T.r], seat) <= 13 &&
          neighbours(T.c, T.r).some(
            ([a, b]) => hexDist([a, b], [T.c, T.r]) && tile(a, b).region !== f,
          ),
        5,
      );
      if (k) put("castle", k.c, k.r, f);
    }
  }
  for (const p of [...places]) {
    if (p.kind === "crownhold") continue;
    const n = p.kind === "town" ? 3 : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const v = pick(
        (T) => hexDist([T.c, T.r], [p.c, p.r]) >= 2 && hexDist([T.c, T.r], [p.c, p.r]) <= 3,
        2,
      );
      if (!v) continue;
      put("village", v.c, v.r, p.owner, { parent: p });
      if (v.t === "plains" || v.t === "steppe") v.t = "farm";
      for (const [a, b] of neighbours(v.c, v.r)) {
        const T = tile(a, b);
        if (T.t === "plains" && !T.place && hash(a, b) < 0.5) T.t = "farm";
      }
    }
  }
  // Sites, lairs, shrines.
  for (const f of ["vale", "fen", "hold", "ulus"]) {
    const mine = pick((T) => T.region === f && T.t === "hills", 3);
    if (mine) put("mine", mine.c, mine.r, null, { name: "" });
    const ranch = pick((T) => T.region === f && (T.t === "plains" || T.t === "steppe"), 3);
    if (ranch) put("ranch", ranch.c, ranch.r, null, { name: "" });
  }
  for (let i = 0; i < 9; i++) {
    const l = pick((T) => ["forest", "hills", "marsh"].includes(T.t) && T.region !== "crown", 4);
    if (l) put("lair", l.c, l.r, null, { name: "" });
  }
  for (let i = 0; i < 4; i++) {
    const s = pick((T) => T.region !== "crown", 4);
    if (s) put("shrine", s.c, s.r, null, { name: "" });
  }
  const greatLairs = [];
  for (const f of ["vale", "fen", "ulus"]) {
    const g = pick(
      (T) =>
        T.region === f &&
        hexDist([T.c, T.r], seats.crown) >= 10 &&
        hexDist([T.c, T.r], seats[f]) >= 6,
      5,
    );
    if (g) greatLairs.push(put("great", g.c, g.r, null, { name: "" }));
  }

  // Roads, by A* over terrain cost.
  const roads = [];
  const link = (a, b) => {
    const path = astar(
      tiles,
      [a.c, a.r],
      [b.c, b.r],
      (T) => (T.road ? 0.5 : 1) * TERRAIN[T.t].cost + (T.river ? 1.5 : 0),
    );
    if (!path) return;
    roads.push(path);
    for (const [c, r] of path) tile(c, r).road = true;
  };
  const crownhold = places[0];
  for (const f of ["vale", "fen", "hold", "ulus"]) {
    const mine = places.filter((p) => p.owner === f && (p.kind === "town" || p.kind === "castle"));
    // Nearest-neighbour chain from the capital: a cheap minimum spanning tree.
    const done = [mine[0]];
    const left = mine.slice(1);
    while (left.length) {
      let bi = 0;
      let bj = 0;
      let bd = Infinity;
      left.forEach((p, i) =>
        done.forEach((q, j) => {
          const d = hexDist([p.c, p.r], [q.c, q.r]);
          if (d < bd) [bd, bi, bj] = [d, i, j];
        }),
      );
      link(done[bj], left[bi]);
      done.push(left.splice(bi, 1)[0]);
    }
    link(mine[0], crownhold);
  }
  for (const p of places.filter((q) => q.kind === "village")) link(p.parent, p);
  return { tiles, tile, places, rivers, roads, seats, greatLairs };
}

function astar(tiles, from, to, costOf) {
  const g = new Map([[key(...from), 0]]);
  const prev = new Map();
  const open = [[hexDist(from, to), from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, cur] = open.shift();
    const ck = key(...cur);
    if (cur[0] === to[0] && cur[1] === to[1]) {
      const path = [cur];
      let k = ck;
      while (prev.has(k)) {
        const p = prev.get(k);
        path.unshift(p);
        k = key(...p);
      }
      return path;
    }
    for (const nb of neighbours(...cur)) {
      const T = tiles[key(...nb)];
      const isEnd = nb[0] === to[0] && nb[1] === to[1];
      const step = isEnd ? 1 : costOf(T);
      if (!Number.isFinite(step)) continue;
      const ng = g.get(ck) + step;
      const nk = key(...nb);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        prev.set(nk, cur);
        open.push([ng + hexDist(nb, to) * 0.5, nb]);
      }
    }
  }
  return null;
}

// --- Map drawing -------------------------------------------------------------------

function drawTerrainHex(T, x, y, R, detail) {
  const base = TERRAIN[T.t].fill;
  const tint = (hash(T.c, T.r) - 0.5) * 0.12;
  hexPath(x, y, R + 0.4);
  ctx.fillStyle = tint > 0 ? mix(base, "#ffffff", tint) : mix(base, "#000000", -tint);
  ctx.fill();
  if (!detail) return;
  ctx.save();
  hexPath(x, y, R);
  ctx.clip();
  const h = (i) => hash(T.c * 31 + i, T.r * 17 + i);
  if (T.t === "forest") {
    for (let i = 0; i < 5; i++) {
      const tx = x + (h(i) - 0.5) * R * 1.3;
      const ty = y + (h(i + 9) - 0.5) * R * 1.1;
      const s = R * (0.28 + h(i + 3) * 0.12);
      ctx.beginPath();
      ctx.moveTo(tx, ty - s);
      ctx.lineTo(tx + s * 0.7, ty + s * 0.6);
      ctx.lineTo(tx - s * 0.7, ty + s * 0.6);
      ctx.closePath();
      ctx.fillStyle = "#1d3f27";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, ty - s);
      ctx.lineTo(tx + s * 0.7, ty + s * 0.6);
      ctx.lineTo(tx, ty + s * 0.6);
      ctx.closePath();
      ctx.fillStyle = "#3a6e45";
      ctx.fill();
    }
  } else if (T.t === "hills") {
    for (let i = 0; i < 2; i++) {
      const hx = x + (i ? 0.32 : -0.22) * R;
      const hy = y + (i ? 0.25 : -0.1) * R;
      const s = R * (0.42 - i * 0.08);
      ctx.beginPath();
      ctx.moveTo(hx - s, hy + s * 0.35);
      ctx.quadraticCurveTo(hx, hy - s * 0.9, hx + s, hy + s * 0.35);
      ctx.fillStyle = "#968a5f";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#5f573a";
      ctx.stroke();
    }
  } else if (T.t === "mountains") {
    for (let i = 0; i < 2; i++) {
      const mx = x + (i ? 0.3 : -0.18) * R;
      const my = y + (i ? 0.3 : 0.05) * R;
      const s = R * (i ? 0.48 : 0.62);
      ctx.beginPath();
      ctx.moveTo(mx - s, my + s * 0.5);
      ctx.lineTo(mx, my - s * 0.8);
      ctx.lineTo(mx + s, my + s * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#8b8b93";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx, my - s * 0.8);
      ctx.lineTo(mx + s, my + s * 0.5);
      ctx.lineTo(mx + s * 0.1, my + s * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#5c5c64";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx - s * 0.3, my - s * 0.32);
      ctx.lineTo(mx, my - s * 0.8);
      ctx.lineTo(mx + s * 0.3, my - s * 0.32);
      ctx.lineTo(mx + s * 0.1, my - s * 0.4);
      ctx.lineTo(mx - s * 0.08, my - s * 0.28);
      ctx.closePath();
      ctx.fillStyle = "#eef1f5";
      ctx.fill();
    }
  } else if (T.t === "marsh") {
    ctx.strokeStyle = "#7fa08c";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const rx = x + (h(i) - 0.5) * R * 1.3;
      const ry = y + (h(i + 5) - 0.5) * R;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 1.5, ry - 5);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 1.5, ry - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(43,76,111,.7)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const wy = y + (i ? 0.35 : -0.25) * R;
      ctx.beginPath();
      ctx.moveTo(x - R * 0.5, wy);
      ctx.lineTo(x + R * 0.3, wy);
      ctx.stroke();
    }
  } else if (T.t === "steppe") {
    ctx.strokeStyle = "#857c46";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const sx = x + (h(i) - 0.5) * R * 1.3;
      const sy = y + (h(i + 7) - 0.5) * R;
      ctx.beginPath();
      ctx.moveTo(sx - 2.5, sy - 3);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + 2.5, sy - 3);
      ctx.stroke();
    }
  } else if (T.t === "farm") {
    ctx.strokeStyle = "rgba(120,110,60,.55)";
    ctx.lineWidth = 1.2;
    const a = h(1) * Math.PI;
    for (let i = -4; i <= 4; i++) {
      const ox = Math.cos(a + Math.PI / 2) * i * 5;
      const oy = Math.sin(a + Math.PI / 2) * i * 5;
      ctx.beginPath();
      ctx.moveTo(x + ox - Math.cos(a) * R, y + oy - Math.sin(a) * R);
      ctx.lineTo(x + ox + Math.cos(a) * R, y + oy + Math.sin(a) * R);
      ctx.stroke();
    }
  } else if (T.t === "plains") {
    ctx.strokeStyle = "rgba(60,90,40,.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const gx = x + (h(i) - 0.5) * R * 1.2;
      const gy = y + (h(i + 4) - 0.5) * R;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 1, gy - 3);
      ctx.moveTo(gx + 2, gy);
      ctx.lineTo(gx + 2.5, gy - 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function polyline(pts, smoothIt = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (!smoothIt || pts.length < 3) {
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts.at(-1).x, pts.at(-1).y);
}

// Heraldry: a shield with a charge, never colour alone (ui.md §6).
function charge(kind, x, y, s, color = "#f4f1e8") {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "chevron") {
    ctx.lineWidth = s * 0.28;
    ctx.moveTo(x - s * 0.5, y + s * 0.25);
    ctx.lineTo(x, y - s * 0.25);
    ctx.lineTo(x + s * 0.5, y + s * 0.25);
    ctx.stroke();
  } else if (kind === "tree") {
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x + s * 0.45, y + s * 0.25);
    ctx.lineTo(x - s * 0.45, y + s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - s * 0.08, y + s * 0.2, s * 0.16, s * 0.3);
  } else if (kind === "anvil") {
    ctx.moveTo(x - s * 0.55, y - s * 0.2);
    ctx.lineTo(x + s * 0.5, y - s * 0.2);
    ctx.lineTo(x + s * 0.3, y);
    ctx.lineTo(x + s * 0.12, y + s * 0.05);
    ctx.lineTo(x + s * 0.22, y + s * 0.35);
    ctx.lineTo(x - s * 0.28, y + s * 0.35);
    ctx.lineTo(x - s * 0.15, y + s * 0.05);
    ctx.lineTo(x - s * 0.4, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "crescent") {
    ctx.arc(x, y, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x + s * 0.18, y - s * 0.1, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  } else if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.22 : s * 0.5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === "knives") {
    ctx.lineWidth = s * 0.16;
    ctx.moveTo(x - s * 0.4, y - s * 0.4);
    ctx.lineTo(x + s * 0.4, y + s * 0.4);
    ctx.moveTo(x + s * 0.4, y - s * 0.4);
    ctx.lineTo(x - s * 0.4, y + s * 0.4);
    ctx.stroke();
  } else if (kind === "crown") {
    ctx.moveTo(x - s * 0.5, y + s * 0.3);
    ctx.lineTo(x - s * 0.5, y - s * 0.3);
    ctx.lineTo(x - s * 0.22, y);
    ctx.lineTo(x - s * 0.05, y - s * 0.4);
    ctx.lineTo(x + s * 0.05, y - s * 0.05);
    ctx.lineTo(x + s * 0.2, y - s * 0.05);
    ctx.lineTo(x + s * 0.5, y - s * 0.3);
    ctx.lineTo(x + s * 0.5, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineCap = "butt";
}

function shield(x, y, s, f, { rim = null, label = null } = {}) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y + s * 0.05);
  ctx.quadraticCurveTo(x + s / 2, y + s * 0.45, x, y + s * 0.62);
  ctx.quadraticCurveTo(x - s / 2, y + s * 0.45, x - s / 2, y + s * 0.05);
  ctx.closePath();
  ctx.fillStyle = f.color;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = rim ? 2.2 : 1.2;
  ctx.strokeStyle = rim ?? f.dark;
  ctx.stroke();
  charge(f.charge, x, y + s * 0.02, s * 0.62);
  if (label) {
    const w = text(label, 0, -100, { size: 11, weight: 700 }) + 8;
    rrect(x - w / 2, y + s * 0.62 + 1, w, 14, 7, "rgba(16,19,26,.85)");
    text(label, x, y + s * 0.62 + 8.5, { size: 11, weight: 700, align: "center" });
  }
}

function flag(x, y, color, h = 9) {
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h - 6);
  ctx.lineTo(x + h, y - h - 3);
  ctx.lineTo(x, y - h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function placeIcon(p, x, y, s) {
  const f = p.owner && FACTIONS[p.owner];
  const stone = "#d8cfb8";
  const shade = "#8c8270";
  ctx.lineWidth = 1.2;
  if (p.kind === "town") {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = stone;
    ctx.fill();
    ctx.strokeStyle = "#3a352c";
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const tx = x + Math.cos(a) * s * 0.5;
      const ty = y + Math.sin(a) * s * 0.5;
      ctx.fillStyle = shade;
      ctx.fillRect(tx - s * 0.11, ty - s * 0.11, s * 0.22, s * 0.22);
    }
    ctx.fillStyle = "#a8432f";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.22, y);
    ctx.lineTo(x, y - s * 0.24);
    ctx.lineTo(x + s * 0.22, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stone;
    ctx.fillRect(x - s * 0.17, y, s * 0.34, s * 0.2);
    flag(x + s * 0.05, y - s * 0.2, f.color, s * 0.32);
  } else if (p.kind === "castle") {
    ctx.fillStyle = stone;
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.rect(x - s * 0.3, y - s * 0.25, s * 0.6, s * 0.55);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++)
      ctx.fillRect(x - s * 0.3 + i * s * 0.24, y - s * 0.36, s * 0.12, s * 0.12);
    ctx.fillStyle = "#3a352c";
    ctx.fillRect(x - s * 0.07, y + s * 0.08, s * 0.14, s * 0.22);
    flag(x, y - s * 0.36, f.color, s * 0.3);
  } else if (p.kind === "village") {
    for (const [dx, dy] of [
      [-0.25, 0.08],
      [0.22, 0.12],
      [0, -0.16],
    ]) {
      const hx = x + dx * s;
      const hy = y + dy * s;
      const w = s * 0.24;
      ctx.fillStyle = "#e3d6b6";
      ctx.fillRect(hx - w / 2, hy - w * 0.1, w, w * 0.7);
      ctx.beginPath();
      ctx.moveTo(hx - w * 0.65, hy);
      ctx.lineTo(hx, hy - w * 0.6);
      ctx.lineTo(hx + w * 0.65, hy);
      ctx.closePath();
      ctx.fillStyle = "#8d4a2f";
      ctx.fill();
    }
    ctx.fillStyle = f.color;
    ctx.fillRect(x + s * 0.32, y - s * 0.32, s * 0.12, s * 0.09);
  } else if (p.kind === "crownhold") {
    ctx.fillStyle = "#b9b3a3";
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.arc(x, y + s * 0.05, s * 0.55, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(x + s * 0.55, y + s * 0.3);
    ctx.lineTo(x - s * 0.55, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    charge("crown", x, y - s * 0.02, s * 0.6, "#5a5446");
    ctx.strokeStyle = "#3a352c";
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, y - s * 0.3);
    ctx.lineTo(x - s * 0.05, y + s * 0.1);
    ctx.stroke();
  } else if (p.kind === "mine" || p.kind === "ranch" || p.kind === "shrine") {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(16,19,26,.8)";
    ctx.fill();
    ctx.strokeStyle = p.kind === "shrine" ? GOLD : "#cfc6b0";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (p.kind === "mine") iconIngot(x, y, s * 0.3);
    else if (p.kind === "ranch") iconHorseshoe(x, y, s * 0.3, "#cfc6b0");
    else charge("star", x, y, s * 0.42, GOLD);
  } else if (p.kind === "lair" || p.kind === "great") {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.36, y + s * 0.22);
    ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.35, x, y - s * 0.36);
    ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.35, x + s * 0.36, y + s * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#4a4136";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y + s * 0.22);
    ctx.quadraticCurveTo(x, y - s * 0.22, x + s * 0.18, y + s * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#0b0b0b";
    ctx.fill();
    ctx.fillStyle = "#e05a3a";
    ctx.fillRect(x - s * 0.07, y + s * 0.02, s * 0.04, s * 0.04);
    ctx.fillRect(x + s * 0.03, y + s * 0.02, s * 0.04, s * 0.04);
    if (p.kind === "great") {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function iconCoin(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#a36d05";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
}
function iconIngot(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.55);
  ctx.lineTo(x - r * 0.6, y - r * 0.45);
  ctx.lineTo(x + r * 0.6, y - r * 0.45);
  ctx.lineTo(x + r, y + r * 0.55);
  ctx.closePath();
  ctx.fillStyle = "#9fb0c4";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#4b5868";
  ctx.stroke();
}
function iconHorseshoe(x, y, r, color = "#d9b38c") {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.75, Math.PI * 0.85, Math.PI * 2.15, false);
  ctx.lineWidth = r * 0.45;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
}

// --- Phone chrome ------------------------------------------------------------------

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;
const HUD_H = 44;

function statusBar() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, SAFE_TOP);
  text("9:41", 40, 25, { size: 15, weight: 600, align: "center" });
  for (let i = 0; i < 4; i++) rrect(W - 92 + i * 5, 29 - i * 2.5, 3, 4 + i * 2.5, 1, FG);
  rrect(W - 62, 19, 24, 12, 3.5, null, "rgba(232,236,244,.5)", 1);
  rrect(W - 60, 21, 17, 8, 2, FG);
  rrect(W - 37, 23, 2, 4, 1, "rgba(232,236,244,.5)");
}

function homeBar() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, H - SAFE_BOTTOM, W, SAFE_BOTTOM);
  rrect(W / 2 - 67, H - 13, 134, 5, 2.5, "rgba(232,236,244,.55)");
}

function hud(draw) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, SAFE_TOP, W, HUD_H);
  text("‹", 18, SAFE_TOP + HUD_H / 2, { size: 22, color: DIM });
  draw(SAFE_TOP + HUD_H / 2);
}

function tabBar(y) {
  ctx.fillStyle = "#0d1016";
  ctx.fillRect(0, y, W, 56);
  ctx.fillStyle = LINE;
  ctx.fillRect(0, y, W, 1);
  const tabs = ["Map", "Army", "Hero", "Realm", "Log"];
  tabs.forEach((name, i) => {
    const cx = (W / 5) * (i + 0.5);
    const col = i === 0 ? ACCENT : DIM;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.6;
    const iy = y + 20;
    ctx.beginPath();
    if (name === "Map") {
      ctx.moveTo(cx - 10, iy - 6);
      ctx.lineTo(cx - 3, iy - 8);
      ctx.lineTo(cx + 3, iy - 6);
      ctx.lineTo(cx + 10, iy - 8);
      ctx.lineTo(cx + 10, iy + 6);
      ctx.lineTo(cx + 3, iy + 8);
      ctx.lineTo(cx - 3, iy + 6);
      ctx.lineTo(cx - 10, iy + 8);
      ctx.closePath();
      ctx.moveTo(cx - 3, iy - 8);
      ctx.lineTo(cx - 3, iy + 6);
      ctx.moveTo(cx + 3, iy - 6);
      ctx.lineTo(cx + 3, iy + 8);
      ctx.stroke();
    } else if (name === "Army") {
      ctx.moveTo(cx - 8, iy - 8);
      ctx.lineTo(cx + 8, iy - 8);
      ctx.lineTo(cx + 8, iy);
      ctx.quadraticCurveTo(cx + 8, iy + 6, cx, iy + 10);
      ctx.quadraticCurveTo(cx - 8, iy + 6, cx - 8, iy);
      ctx.closePath();
      ctx.stroke();
    } else if (name === "Hero") {
      ctx.arc(cx, iy - 3, 5, 0, Math.PI * 2);
      ctx.moveTo(cx - 9, iy + 9);
      ctx.quadraticCurveTo(cx, iy - 1, cx + 9, iy + 9);
      ctx.stroke();
    } else if (name === "Realm") {
      ctx.moveTo(cx - 7, iy + 10);
      ctx.lineTo(cx - 7, iy - 9);
      ctx.lineTo(cx + 8, iy - 5);
      ctx.lineTo(cx - 7, iy - 1);
      ctx.stroke();
    } else {
      ctx.rect(cx - 7, iy - 9, 14, 18);
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(cx - 4, iy - 4 + k * 4.5);
        ctx.lineTo(cx + 4, iy - 4 + k * 4.5);
      }
      ctx.stroke();
    }
    text(name, cx, y + 42, { size: 11, weight: i === 0 ? 700 : 500, color: col, align: "center" });
  });
}

// --- The world map -------------------------------------------------------------------

function drawMap() {
  const world = generate(SEED);
  const { tile, places } = world;
  const R = 26;
  const viewTop = SAFE_TOP + HUD_H;
  const viewBottom = H - SAFE_BOTTOM - 56 - 64;

  // Day 14: a free company on the road east of its home town.
  const ashford = places.find(
    (p) => p.owner === "vale" && p.kind === "town" && p !== places.find((q) => q.owner === "vale"),
  );
  const home = places.find((p) => p.owner === "vale" && p.kind === "town");
  const near = world.tiles
    .filter((T) => {
      const d = hexDist([T.c, T.r], [ashford.c, ashford.r]);
      return (
        d >= 6 &&
        d <= 7 &&
        T.road &&
        !T.place &&
        T.t !== "water" &&
        T.t !== "mountains" &&
        T.c > ashford.c
      );
    })
    .sort((a, b) => hash(a.c, a.r) - hash(b.c, b.r));
  const me = near[0];
  const path = astar(
    world.tiles,
    [me.c, me.r],
    [ashford.c, ashford.r],
    (T) => TERRAIN[T.t].cost * (T.road ? 0.6 : 1),
  );
  const hours = path
    .slice(1)
    .reduce((h, [c, r]) => h + 2 * TERRAIN[tile(c, r).t].cost * (tile(c, r).road ? 0.6 : 1), 0);

  // Fog: explored along the way here, in sight around you.
  const trail = astar(world.tiles, [home.c, home.r], [me.c, me.r], (T) => TERRAIN[T.t].cost) ?? [];
  const sight = (T) => hexDist([T.c, T.r], [me.c, me.r]) <= 4;
  const explored = (T) =>
    sight(T) ||
    hexDist([T.c, T.r], [home.c, home.r]) <= 7 ||
    hexDist([T.c, T.r], [ashford.c, ashford.r]) <= 3 ||
    trail.some(([c, r]) => hexDist([T.c, T.r], [c, r]) <= 5);

  // Frame the whole trip: the party and where it's going.
  const mePx = centre(me.c, me.r, R);
  const toPx = centre(ashford.c, ashford.r, R);
  const midX = (mePx.x + toPx.x) / 2;
  const midY = (mePx.y + toPx.y) / 2;
  const camX = clamp(midX - W / 2, 0, centre(COLS - 1, 1, R).x + R - W);
  const camY = midY - (viewTop + (viewBottom - viewTop) * 0.5);
  const px = (c, r) => {
    const p = centre(c, r, R);
    return { x: p.x - camX, y: p.y - camY };
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, viewTop, W, viewBottom - viewTop);
  ctx.clip();
  ctx.fillStyle = "#1a1f2a";
  ctx.fillRect(0, viewTop, W, viewBottom - viewTop);

  const visible = world.tiles.filter((T) => {
    const p = px(T.c, T.r);
    return p.x > -R * 2 && p.x < W + R * 2 && p.y > viewTop - R * 2 && p.y < viewBottom + R * 2;
  });
  for (const T of visible) {
    const p = px(T.c, T.r);
    drawTerrainHex(T, p.x, p.y, R, true);
  }
  for (const T of visible) {
    const p = px(T.c, T.r);
    hexPath(p.x, p.y, R);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    ctx.stroke();
  }
  // Rivers, then roads.
  for (const rv of world.rivers) {
    const pts = rv.map(([c, r]) => px(c, r));
    polyline(pts);
    ctx.strokeStyle = "#24435f";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.strokeStyle = "#3f6f9a";
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
  for (const rd of world.roads) {
    polyline(rd.map(([c, r]) => px(c, r)));
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(60,48,30,.5)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#c2a878";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = "butt";
  for (const p of places) {
    const T = tile(p.c, p.r);
    if (!explored(T)) continue;
    const q = px(p.c, p.r);
    placeIcon(p, q.x, q.y, p.kind === "town" ? 30 : p.kind === "castle" ? 28 : 30);
  }
  const labels = () => {
    for (const p of places) {
      if (!explored(tile(p.c, p.r)) || !p.name) continue;
      if (p.kind !== "town" && p.kind !== "castle" && p.kind !== "village") continue;
      const q = px(p.c, p.r);
      text(p.name, q.x, q.y + 20, {
        size: p.kind === "village" ? 10 : 11,
        weight: 700,
        align: "center",
        halo: "rgba(10,12,16,.9)",
        color: p.kind === "village" ? "#d6dae3" : FG,
      });
    }
  };
  // Fog.
  for (const T of visible) {
    const p = px(T.c, T.r);
    if (!explored(T)) {
      hexPath(p.x, p.y, R + 0.6);
      ctx.fillStyle = "#1a1f2a";
      ctx.fill();
      ctx.save();
      hexPath(p.x, p.y, R + 0.6);
      ctx.clip();
      ctx.strokeStyle = "#222938";
      ctx.lineWidth = 1;
      for (let k = -R * 2; k < R * 2; k += 6) {
        ctx.beginPath();
        ctx.moveTo(p.x + k - R, p.y - R);
        ctx.lineTo(p.x + k + R, p.y + R);
        ctx.stroke();
      }
      ctx.restore();
    } else if (!sight(T)) {
      hexPath(p.x, p.y, R + 0.6);
      ctx.fillStyle = "rgba(16,19,26,.45)";
      ctx.fill();
    }
  }

  // The path preview: a dot every few pixels, a tick every 6 hours, arrival time.
  const pts = path.map(([c, r]) => px(c, r));
  ctx.fillStyle = "rgba(255,255,255,.9)";
  let acc = 0;
  let nextTick = 6;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const T = tile(...path[i]);
    const hrs = 2 * TERRAIN[T.t].cost * (T.road ? 0.6 : 1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d < len; d += 7) {
      const t = d / len;
      ctx.beginPath();
      ctx.arc(lerp(a.x, b.x, t), lerp(a.y, b.y, t), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    while (acc + hrs >= nextTick && i < pts.length - 1) {
      const t = (nextTick - acc) / hrs;
      const tx = lerp(a.x, b.x, t);
      const ty = lerp(a.y, b.y, t);
      rrect(tx - 9, ty - 7, 18, 14, 7, "rgba(16,19,26,.85)", "rgba(255,255,255,.6)", 1);
      text(`${nextTick}`, tx, ty + 0.5, { size: 9, weight: 700, align: "center" });
      nextTick += 6;
    }
    acc += hrs;
  }
  // Destination ring and arrival bubble.
  const dest = pts.at(-1);
  hexPath(dest.x, dest.y, R - 1.5);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
  const eta = `arrive ${String(9 + Math.round(hours)).padStart(2, "0")}:00`;
  const ew = text(eta, 0, -100, { size: 11, weight: 700 }) + 14;
  rrect(dest.x - ew / 2, dest.y - R - 26, ew, 20, 10, ACCENT);
  text(eta, dest.x, dest.y - R - 16, { size: 11, weight: 700, align: "center", color: "#06210f" });

  labels();

  // Parties in sight.
  const spot = (filter) =>
    world.tiles
      .filter((T) => {
        const q = px(T.c, T.r);
        const onScreen = q.x > 40 && q.x < W - 60 && q.y > viewTop + 40 && q.y < viewBottom - 80;
        return (
          onScreen && sight(T) && !T.place && T.t !== "water" && T.t !== "mountains" && filter(T)
        );
      })
      .sort((a, b) => hash(a.c + 3, a.r) - hash(b.c + 3, b.r))[0];
  const brig = spot(
    (T) =>
      (T.t === "forest" || T.t === "hills") &&
      hexDist([T.c, T.r], [me.c, me.r]) >= 2 &&
      !path.some(([c, r]) => c === T.c && r === T.r),
  );
  const lord = spot((T) => T.road && hexDist([T.c, T.r], [me.c, me.r]) >= 2 && T !== brig);
  if (brig) {
    const q = px(brig.c, brig.r);
    shield(q.x, q.y - 3, 20, FACTIONS.brig, { label: "23" });
    ctx.strokeStyle = "rgba(248,113,113,.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(q.x - 6, q.y + 10);
    ctx.lineTo(lerp(q.x, mePx.x - camX, 0.45), lerp(q.y, mePx.y - camY, 0.45));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (lord) {
    const q = px(lord.c, lord.r);
    shield(q.x, q.y - 3, 22, FACTIONS.vale, { label: "Lord Edric · 64" });
  }
  shield(mePx.x - camX, mePx.y - camY - 3, 26, FACTIONS.you, { rim: GOLD, label: "41" });

  // A toast: read, not tapped.
  const toast = "Valemark lords march on Greyford";
  const tw = text(toast, 0, -100, { size: 12, weight: 600 }) + 28;
  rrect(W / 2 - tw / 2, viewBottom - 46, tw, 30, 15, "rgba(25,30,41,.94)", LINE);
  ctx.beginPath();
  ctx.arc(W / 2 - tw / 2 + 14, viewBottom - 31, 4, 0, Math.PI * 2);
  ctx.fillStyle = FACTIONS.vale.color;
  ctx.fill();
  text(toast, W / 2 + 6, viewBottom - 31, { size: 12, weight: 600, align: "center" });
  ctx.restore();

  // Chrome.
  statusBar();
  hud((y) => {
    text("Day 14 · 09:00", 44, y, { size: 15, weight: 600 });
    let x = W - 16;
    for (const [v, icon] of [
      ["3", "horse"],
      ["6", "iron"],
      ["412", "gold"],
    ]) {
      const w = text(v, x, y, { size: 15, weight: 600, align: "right" });
      x -= w + 13;
      if (icon === "gold") iconCoin(x + 4, y, 6.5);
      else if (icon === "iron") iconIngot(x + 4, y, 7);
      else iconHorseshoe(x + 4, y + 1, 7);
      x -= 18;
    }
  });
  const by = viewBottom;
  ctx.fillStyle = RAISED;
  ctx.fillRect(0, by, W, 64);
  ctx.fillStyle = LINE;
  ctx.fillRect(0, by, W, 1);
  placeIcon(ashford, 30, by + 32, 26);
  text(ashford.name, 54, by + 23, { size: 16, weight: 700 });
  text(`Valemark town · ${Math.round(hours)} h away`, 54, by + 43, { size: 12, color: DIM });
  rrect(W - 168, by + 10, 44, 44, 12, CARD);
  ctx.strokeStyle = FG;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(W - 146, by + 32, 7, 0, Math.PI * 2);
  ctx.moveTo(W - 146, by + 20);
  ctx.lineTo(W - 146, by + 27);
  ctx.moveTo(W - 146, by + 37);
  ctx.lineTo(W - 146, by + 44);
  ctx.moveTo(W - 158, by + 32);
  ctx.lineTo(W - 151, by + 32);
  ctx.moveTo(W - 141, by + 32);
  ctx.lineTo(W - 134, by + 32);
  ctx.stroke();
  rrect(W - 114, by + 8, 102, 48, 14, ACCENT);
  text("Go ▶", W - 63, by + 32, { size: 17, weight: 700, color: "#06210f", align: "center" });
  tabBar(by + 64);
  homeBar();
}

// --- The realm overview -----------------------------------------------------------

function drawOverview() {
  const world = generate(SEED);
  const { tiles, tile, places } = world;
  const viewTop = SAFE_TOP + HUD_H;
  const viewBottom = H - SAFE_BOTTOM - 56 - 64;
  const R = (W - 12) / (SQ3 * (COLS + 0.5));
  const mapH = R * 1.5 * (ROWS - 1) + 2 * R;
  const ox = 6;
  const oy = viewTop + 8;
  const px = (c, r) => {
    const p = centre(c, r, R);
    return { x: p.x + ox, y: p.y + oy };
  };

  // Day 52: the Hollow has risen and taken the two castles nearest Crownhold.
  const crown = world.seats.crown;
  const fallen = places
    .filter((p) => p.kind === "castle")
    .sort((a, b) => hexDist([a.c, a.r], crown) - hexDist([b.c, b.r], crown))
    .slice(0, 2);
  for (const p of fallen) p.owner = "crown";
  for (const p of places) if (p.kind === "village" && fallen.includes(p.parent)) p.owner = "crown";
  const blighted = (T) =>
    hexDist([T.c, T.r], crown) <= 4 + hash(T.c, T.r) * 1.5 ||
    fallen.some((p) => hexDist([T.c, T.r], [p.c, p.r]) <= 2);
  // Some of the realm is still unexplored at the far edges.
  const me = places.find((p) => p.owner === "vale" && p.kind === "castle");
  const explored = (T) =>
    hexDist([T.c, T.r], [me.c, me.r]) <= 30 - (T.region === "ulus" ? 9 : 0) + hash(T.c, T.r) * 3;

  ctx.fillStyle = BG;
  ctx.fillRect(0, viewTop, W, viewBottom - viewTop);
  for (const T of tiles) {
    const p = px(T.c, T.r);
    drawTerrainHex(T, p.x, p.y, R, false);
  }
  // Territory: who owns the land around each stronghold.
  const strongholds = places.filter((p) => ["town", "castle", "crownhold"].includes(p.kind));
  const ownerOf = new Map();
  for (const T of tiles) {
    if (T.t === "water") continue;
    let best = null;
    let bd = 6;
    for (const p of strongholds) {
      const d = hexDist([T.c, T.r], [p.c, p.r]) + (p.owner === T.region ? 0 : 1.5);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) ownerOf.set(key(T.c, T.r), best.owner);
  }
  for (const T of tiles) {
    const o = ownerOf.get(key(T.c, T.r));
    if (!o) continue;
    const p = px(T.c, T.r);
    hexPath(p.x, p.y, R + 0.3);
    ctx.fillStyle = FACTIONS[o].color + "40";
    ctx.fill();
    // Borders between owners.
    NB[T.r & 1].forEach(([dc, dr], i) => {
      const [c2, r2] = [T.c + dc, T.r + dr];
      if (!inside(c2, r2)) return;
      const o2 = ownerOf.get(key(c2, r2));
      if (o2 === o) return;
      const q = px(c2, r2);
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const ax = -(q.y - p.y);
      const ay = q.x - p.x;
      const n = Math.hypot(ax, ay);
      ctx.beginPath();
      ctx.moveTo(mx + (ax / n) * R * 0.58, my + (ay / n) * R * 0.58);
      ctx.lineTo(mx - (ax / n) * R * 0.58, my - (ay / n) * R * 0.58);
      ctx.strokeStyle = FACTIONS[o].color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
  }
  // Blight.
  for (const T of tiles) {
    if (!blighted(T) || T.t === "water") continue;
    const p = px(T.c, T.r);
    hexPath(p.x, p.y, R + 0.3);
    ctx.fillStyle = "rgba(42,58,56,.72)";
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "rgba(143,211,200,.55)";
      ctx.fillRect(
        p.x + (hash(T.c * 5 + i, T.r) - 0.5) * R * 1.4,
        p.y + (hash(T.c, T.r * 5 + i) - 0.5) * R * 1.4,
        1.2,
        1.2,
      );
    }
  }
  for (const rv of world.rivers) {
    polyline(rv.map(([c, r]) => px(c, r)));
    ctx.strokeStyle = "#3f6f9a";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  for (const rd of world.roads) {
    polyline(rd.map(([c, r]) => px(c, r)));
    ctx.strokeStyle = "rgba(194,168,120,.75)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  for (const T of tiles) {
    if (explored(T)) continue;
    const p = px(T.c, T.r);
    hexPath(p.x, p.y, R + 0.5);
    ctx.fillStyle = "#1a1f2a";
    ctx.fill();
  }
  // Places.
  for (const p of places) {
    if (!explored(tile(p.c, p.r))) continue;
    const q = px(p.c, p.r);
    const f = p.owner && FACTIONS[p.owner];
    if (p.kind === "town" || p.kind === "crownhold") {
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#f4f1e8";
      ctx.stroke();
    } else if (p.kind === "castle") {
      ctx.fillStyle = f.color;
      ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#f4f1e8";
      ctx.strokeRect(q.x - 3, q.y - 3, 6, 6);
    } else if (p.kind === "village") {
      ctx.fillStyle = "#e3d6b6";
      ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
    } else if (p.kind === "great") {
      ctx.save();
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - 6);
      ctx.lineTo(q.x + 5, q.y);
      ctx.lineTo(q.x, q.y + 6);
      ctx.lineTo(q.x - 5, q.y);
      ctx.closePath();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }
  // Labels.
  const label = (str, c, r, color) => {
    const q = px(c, r);
    ctx.save();
    ctx.font = `800 11px ${FONT}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,12,16,.85)";
    ctx.strokeText(str, q.x, q.y);
    ctx.fillStyle = color;
    ctx.fillText(str, q.x, q.y);
    ctx.restore();
  };
  label("KHARUM", world.seats.hold[0], world.seats.hold[1] - 3, "#f0c08a");
  label("ULUS", world.seats.ulus[0], world.seats.ulus[1] - 3, "#dcb2ee");
  label("FENREACH", world.seats.fen[0], world.seats.fen[1] + 3, "#9ad9ab");
  label("VALEMARK", world.seats.vale[0] + 2, world.seats.vale[1] - 3, "#a9c5f7");
  label("CROWNHOLD", crown[0], crown[1] + 2.4, "#b8efe6");
  // Hollow warbands on the march, a marshal's army, you.
  const near = (p, d) =>
    tiles.find(
      (T) =>
        hexDist([T.c, T.r], p) === d &&
        T.t !== "water" &&
        T.t !== "mountains" &&
        hash(T.c, T.r) < 0.25,
    ) ?? tiles.find((T) => hexDist([T.c, T.r], p) === d);
  for (const [d, k] of [
    [6, 0],
    [7, 1],
  ]) {
    const T = tiles
      .filter((t) => hexDist([t.c, t.r], crown) === d && t.t !== "water")
      .sort((a, b) => hash(a.c + k, a.r) - hash(b.c + k, b.r))[0];
    const q = px(T.c, T.r);
    shield(q.x, q.y, 11, FACTIONS.crown);
  }
  const ulusCastle = places.find((p) => p.owner === "ulus" && p.kind === "castle");
  if (ulusCastle) {
    const T = near([ulusCastle.c, ulusCastle.r], 2);
    const q = px(T.c, T.r);
    shield(q.x, q.y, 12, FACTIONS.hold);
  }
  const mq = px(me.c + 1, me.r);
  shield(mq.x, mq.y - 2, 14, FACTIONS.you, { rim: GOLD });

  // Legend chip for the Regalia.
  const ly = Math.min(viewBottom - 36, oy + mapH + 14);
  rrect(10, ly, 150, 26, 13, "rgba(25,30,41,.92)", LINE);
  ctx.save();
  ctx.translate(26, ly + 13);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(4, 0);
  ctx.lineTo(0, 5);
  ctx.lineTo(-4, 0);
  ctx.closePath();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
  text("Regalia lairs · 0 of 3", 38, ly + 13, { size: 11, weight: 600 });
  rrect(168, ly, 128, 26, 13, "rgba(25,30,41,.92)", LINE);
  shield(184, ly + 12, 11, FACTIONS.crown);
  text("Hollow warband", 196, ly + 13, { size: 11, weight: 600 });

  statusBar();
  hud((y) => {
    text("Day 52 · 14:00", 44, y, { size: 15, weight: 600 });
    let x = W - 16;
    for (const [v, icon] of [
      ["11", "horse"],
      ["23", "iron"],
      ["2,140", "gold"],
    ]) {
      const w = text(v, x, y, { size: 15, weight: 600, align: "right" });
      x -= w + 13;
      if (icon === "gold") iconCoin(x + 4, y, 6.5);
      else if (icon === "iron") iconIngot(x + 4, y, 7);
      else iconHorseshoe(x + 4, y + 1, 7);
      x -= 18;
    }
  });
  const by = viewBottom;
  ctx.fillStyle = RAISED;
  ctx.fillRect(0, by, W, 64);
  ctx.fillStyle = LINE;
  ctx.fillRect(0, by, W, 1);
  text("The realm", 16, by + 22, { size: 16, weight: 700 });
  text("The Hollow holds 2 of 20 strongholds", 16, by + 43, { size: 12, color: "#b8efe6" });
  rrect(W - 106, by + 8, 94, 48, 14, CARD);
  text("Back", W - 59, by + 32, { size: 16, weight: 700, align: "center" });
  tabBar(by + 64);
  homeBar();
}

// --- A battle ------------------------------------------------------------------------

const YOU = 0;
const SIDE = [
  { color: "#e05561", dark: "#5e1820", light: "#f08a93" },
  { color: "#5b8def", dark: "#183262", light: "#9dbcf6" },
];

/** The drawing reads a squad's troop as `s.t` and its type as `s.type`. */
function dress(b) {
  for (const s of b.squads) {
    if (s.t) continue;
    Object.defineProperty(s, "t", { value: troop(s.units[0].type), enumerable: false });
    s.type = s.units[0].type;
  }
}

/** Play the battle up to `round` + `steps`, keeping what the picture needs. */
function simulate(armies, seed, round, steps) {
  // Both sides are the plain AI; your banner squad keeps behind your line.
  const b = createBattle({ seed, sides: armies.map((squads) => ({ squads, place: true })) });
  dress(b);
  const fallen = [];
  const volleys = [];
  const lostThisRound = new Map();
  const per = Math.round(ROUND_S / DT);
  for (let r = 0; r < round && !b.over; r++) {
    beginRound(b);
    dress(b); // a squad the AI split off is new
    for (const s of b.squads) lostThisRound.set(s.id, 0);
    const last = r === round - 1 ? steps : per;
    for (let i = 0; i < last; i++) {
      const before = b.squads.map((s) => ({ n: s.n, ammo: s.ammo }));
      step(b);
      b.squads.forEach((s, k) => {
        const lost = before[k].n - s.n;
        if (lost > 0) {
          lostThisRound.set(s.id, lostThisRound.get(s.id) + lost);
          const slots = soldierSlots(s, s.n + lost);
          for (let j = 0; j < lost; j++) {
            const at = s.contacts.length
              ? slots[j % Math.max(1, Math.min(slots.length, s.files0))]
              : slots[Math.floor(hash(s.id * 97 + j, b.t * 10) * slots.length)];
            if (at)
              fallen.push({
                x: at.x + (hash(j, s.id) - 0.5) * 1.5,
                y: at.y + (hash(s.id, j) - 0.5) * 1.5,
                side: s.side,
                t: b.t,
              });
          }
        }
        if (s.ammo < before[k].ammo) {
          let tgt = null;
          let bd = Infinity;
          for (const o of b.squads) {
            if (o.side === s.side || (o.state !== "ok" && o.state !== "wavering")) continue;
            const d = Math.hypot(o.x - s.x, o.y - s.y);
            if (d <= s.t.range && d < bd) [bd, tgt] = [d, o];
          }
          if (tgt)
            volleys.push({
              from: { x: s.x, y: s.y },
              to: tgt,
              tx: tgt.x,
              ty: tgt.y,
              n: s.n,
              side: s.side,
              t: b.t,
              w: tgt.files0 * tgt.spacing,
            });
        }
      });
    }
    if (r < round - 1) finishRound(b);
  }
  return { b, fallen, volleys, lostThisRound };
}

/** Where each man of a squad stands: ranks behind the front, facing f. */
function soldierSlots(s, n = s.n) {
  const files = Math.max(1, Math.min(s.files0, n));
  const ranks = Math.ceil(n / files);
  const sp = s.spacing;
  const { fx, fy } = s;
  const pxx = -fy;
  const pyy = fx;
  const halfD = (ranks * sp) / 2;
  const routing = s.state === "routing";
  const melee = s.contacts.length > 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i % files;
    const k = Math.floor(i / files);
    const inRank = k === ranks - 1 ? n - k * files : files;
    const across = (f - (inRank - 1) / 2) * sp;
    const along = halfD - sp / 2 - k * sp;
    const j = routing ? 1.6 : melee ? 0.45 : 0.18;
    const jx = (hash(s.id * 1000 + i, 1) - 0.5) * 2 * j;
    const jy = (hash(s.id * 1000 + i, 2) - 0.5) * 2 * j;
    out.push({ x: s.x + pxx * across + fx * along + jx, y: s.y + pyy * across + fy * along + jy });
  }
  return out;
}

function drawBattle() {
  // Your free company, bottom, against a Valemark lord's host, top.
  const you = [
    { type: "spearman", n: 30, x: 25, y: 108 },
    { type: "footman", n: 44, x: 47, y: 108 },
    { type: "militia", n: 36, x: 70, y: 108 },
    { type: "archer", n: 36, x: 46, y: 120 },
    { type: "horseman", n: 20, x: 90, y: 112 },
    { type: "knight", n: 6, x: 54, y: 127, banner: true }, // the hero's banner squad
  ];
  const them = [
    { type: "militia", n: 36, x: 27, y: 31 },
    { type: "manatarms", n: 34, x: 48, y: 31 },
    { type: "footman", n: 36, x: 69, y: 31 },
    { type: "crossbow", n: 18, x: 48, y: 19 },
    { type: "knight", n: 18, x: 10, y: 25 },
  ];
  // Round 6, half a second after a volley: their crossbows and knights are
  // running, your horse is in their rear, and the lines are locked.
  const ROUND = Number(params.get("round") ?? 6);
  const STEP = Number(params.get("step") ?? 5);
  const { b, fallen, volleys, lostThisRound } = simulate([you, them], SEED, ROUND, STEP);
  const banner = b.squads.find((s) => s.banner);

  const fieldTop = SAFE_TOP + HUD_H;
  const barH = 176;
  const fieldBottom = H - SAFE_BOTTOM - barH;
  // Two cameras, to compare (ui.md §6): "fit" shows the whole field and every
  // man is a mark; "follow" sits about 2x on the fighting and every man is a
  // little figure. ?camera=follow&zoom=2.5
  const follow = params.get("camera") === "follow";
  const viewH = fieldBottom - fieldTop;
  const fit = Math.min(W / 100, viewH / 140);
  const scale = follow ? fit * Number(params.get("zoom") ?? 2.5) : fit;
  const zoom = scale / fit;
  let fx0 = (W - 100 * scale) / 2;
  let fy0 = fieldTop + (viewH - 140 * scale) / 2;
  let view = null;
  if (follow) {
    const focus = fightCentre(b);
    const hw = W / 2 / scale;
    const hh = viewH / 2 / scale;
    const cx = clamp(focus.x, hw, 100 - hw);
    const cy = clamp(focus.y, hh, 140 - hh);
    fx0 = W / 2 - cx * scale;
    fy0 = fieldTop + viewH / 2 - cy * scale;
    view = { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
  }
  const P = (x, y) => ({ x: fx0 + x * scale, y: fy0 + y * scale });

  // Ground.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, fieldTop, W, viewH);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(fx0, fy0, 100 * scale, 140 * scale);
  ctx.clip();
  ctx.fillStyle = "#3f5d37";
  ctx.fillRect(fx0, fy0, 100 * scale, 140 * scale);
  for (let i = 0; i < 46; i++) {
    const p = P(hash(i, 11) * 100, hash(i, 12) * 140);
    const r = 18 + hash(i, 13) * 46;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const c = i % 2 ? "rgba(84,116,70,.38)" : "rgba(46,70,40,.38)";
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  // A cart track.
  ctx.beginPath();
  const t0 = P(-5, 92);
  const t1 = P(40, 72);
  const t2 = P(105, 60);
  ctx.moveTo(t0.x, t0.y);
  ctx.quadraticCurveTo(t1.x, t1.y, t2.x, t2.y);
  ctx.strokeStyle = "rgba(122,108,72,.35)";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "rgba(122,108,72,.25)";
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Grass flecks.
  ctx.strokeStyle = "rgba(110,150,90,.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < Math.round(260 * zoom * zoom); i++) {
    const p = P(hash(i, 21) * 100, hash(i, 22) * 140);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 1, p.y - 3);
    ctx.stroke();
  }
  // Woods: a copse on each flank.
  const copse = (cx, cy, rx, ry, n, seed) => {
    const trees = [];
    for (let i = 0; i < n; i++) {
      const a = hash(i, seed) * Math.PI * 2;
      const d = Math.sqrt(hash(seed, i));
      trees.push({
        ...P(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d),
        r: (2.2 + hash(i + seed, 5) * 2) * scale,
      });
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) {
      ctx.beginPath();
      ctx.arc(t.x + 2, t.y + 3, t.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,25,12,.45)";
      ctx.fill();
    }
    for (const t of trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = "#284726";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "#37603a";
      ctx.fill();
    }
  };
  copse(7, 66, 9, 14, 34, 3);
  copse(95, 34, 8, 10, 20, 8);

  // The fallen, oldest faintest.
  for (const f of fallen) {
    const p = P(f.x, f.y);
    const age = b.t - f.t;
    ctx.globalAlpha = clamp(0.9 - age / 30, 0.35, 0.9);
    if (follow) {
      fallenFigure(p, f, scale);
      continue;
    }
    ctx.fillStyle = SIDE[f.side].dark;
    ctx.fillRect(p.x - 1.6, p.y - 0.8, 3.2, 1.6);
    ctx.fillStyle = "rgba(90,20,20,.6)";
    ctx.fillRect(p.x - 0.6, p.y + 0.6, 1.4, 1);
  }
  ctx.globalAlpha = 1;

  // Dust behind horse moving at speed.
  for (const s of b.squads) {
    if (!s.t.charge || s.speedNow < 4 || s.n === 0) continue;
    for (let i = 0; i < 9; i++) {
      const back = 3 + hash(s.id, i) * 9;
      const side = (hash(i, s.id) - 0.5) * s.files0 * s.spacing;
      const p = P(s.x - s.fx * back - s.fy * side, s.y - s.fy * back + s.fx * side);
      const r = (2 + hash(i, s.id + 9) * 3) * scale;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(196,176,132,.45)");
      g.addColorStop(1, "rgba(196,176,132,0)");
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  // Orders: your squads' arrows, and (Tactics) their horse's intent.
  const arrow = (from, to, color, dash) => {
    const a = P(from.x, from.y);
    const z = P(to.x, to.y);
    const d = Math.hypot(z.x - a.x, z.y - a.y);
    if (d < 24) return;
    const ux = (z.x - a.x) / d;
    const uy = (z.y - a.y) / d;
    const end = { x: z.x - ux * 12, y: z.y - uy * 12 };
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * 10, a.y + uy * 10);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x + ux * 7, end.y + uy * 7);
    ctx.lineTo(end.x - uy * 5, end.y + ux * 5);
    ctx.lineTo(end.x + uy * 5, end.y - ux * 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (const s of b.squads) {
    if (s.state !== "ok" && s.state !== "wavering") continue;
    const o = s.order;
    const tgt = o.target != null ? b.squads[o.target] : null;
    if (s.contacts.length) continue;
    if (s.side === YOU && tgt) arrow(s, tgt, "rgba(255,255,255,.75)", [6, 5]);
    else if (s.side === YOU && o.kind === "move") arrow(s, o, "rgba(255,255,255,.75)", [6, 5]);
    else if (s.side !== YOU && tgt && s.t.charge) arrow(s, tgt, "rgba(248,113,113,.8)", [3, 4]);
  }

  // Selection: your horse.
  const sel = b.squads.find((s) => s.side === YOU && s.type === "horseman");
  const outline = (s, pad, color, lw) => {
    const files = Math.min(s.files0, s.n);
    const hw = (files * s.spacing) / 2 + pad;
    const hd = (Math.ceil(s.n / files) * s.spacing) / 2 + pad;
    const c = P(s.x, s.y);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.atan2(s.fy, s.fx) - Math.PI / 2);
    ctx.beginPath();
    ctx.roundRect(-hw * scale, -hd * scale, hw * 2 * scale, hd * 2 * scale, 5);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  };
  if (sel && sel.n) outline(sel, 1.8, ACCENT, 2);

  // Soldiers.
  for (const s of b.squads) {
    if (s.n === 0 || s.state === "fled" || s.state === "dead") continue;
    const side = SIDE[s.side];
    const routing = s.state === "routing";
    const body = routing ? mix(side.color, "#9aa0a8", 0.6) : side.color;
    const slots = soldierSlots(s);
    const ang = Math.atan2(s.fy, s.fx);
    for (const [i, m] of slots.entries()) {
      const p = P(m.x, m.y);
      if (follow) {
        figure(s, p, ang, scale, body, side, routing, i);
        continue;
      }
      if (s.t.role === "cav") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.1, 1.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = s.type === "knight" ? "#e9e4d8" : "#6b4a33";
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "#1c140e";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-0.4, 0, 1.45, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = side.dark;
        ctx.stroke();
        if (s.speedNow > 4) {
          ctx.beginPath();
          ctx.moveTo(1, -1.2);
          ctx.lineTo(6.5, -1.6);
          ctx.strokeStyle = "#d8d2c0";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      const r = s.t.role === "ranged" ? 1.45 : 1.75;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 0.75, 0, Math.PI * 2);
      ctx.fillStyle = side.dark;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle =
        s.t.role === "ranged"
          ? mix(body.startsWith("#") ? body : side.color, "#ffffff", 0.22)
          : body;
      ctx.fill();
      if (s.t.role === "spear" && !routing) {
        ctx.beginPath();
        ctx.moveTo(p.x + s.fx * 1.5, p.y + s.fy * 1.5);
        ctx.lineTo(p.x + s.fx * 6.5, p.y + s.fy * 6.5);
        ctx.strokeStyle = "#d8d2c0";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      if (s.t.shield > 0.35 && !routing) {
        ctx.beginPath();
        ctx.arc(p.x + s.fx * 1.4, p.y + s.fy * 1.4, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = "#cfc8b4";
        ctx.fill();
      }
    }
  }

  // Clash marks along fronts in melee.
  for (const s of b.squads) {
    if (!s.contacts.length || s.side !== YOU) continue;
    for (const id of s.contacts) {
      const o = b.squads[id];
      const mx = (s.x + o.x) / 2;
      const my = (s.y + o.y) / 2;
      const w = Math.min(s.files0 * s.spacing, o.files0 * o.spacing) * 0.45;
      for (let i = 0; i < 7; i++) {
        const off = (hash(i, id + s.id * 7) - 0.5) * 2 * w;
        const p = P(mx - s.fy * off, my + s.fx * off);
        const c = 2 * Math.sqrt(zoom);
        ctx.strokeStyle = "rgba(255,248,220,.85)";
        ctx.lineWidth = 0.9 * Math.sqrt(zoom);
        ctx.beginPath();
        ctx.moveTo(p.x - c, p.y - c);
        ctx.lineTo(p.x + c, p.y + c);
        ctx.moveTo(p.x + c, p.y - c);
        ctx.lineTo(p.x - c, p.y + c);
        ctx.stroke();
      }
    }
  }

  // Volleys in the air.
  for (const v of volleys) {
    const flight = Math.hypot(v.tx - v.from.x, v.ty - v.from.y) / 38;
    const prog = (b.t - v.t) / flight;
    if (prog <= 0 || prog >= 1) continue;
    const count = Math.ceil(v.n / 3);
    for (let i = 0; i < count; i++) {
      const sx = v.from.x + (hash(i, v.t * 10) - 0.5) * 8;
      const sy = v.from.y + (hash(v.t * 10, i) - 0.5) * 3;
      const ex = v.tx + (hash(i + 3, v.t * 10) - 0.5) * v.w;
      const ey = v.ty + (hash(v.t * 10, i + 3) - 0.5) * 6;
      const p = prog + (hash(i, 77) - 0.5) * 0.12;
      const x = lerp(sx, ex, p);
      const y = lerp(sy, ey, p);
      const d = Math.hypot(ex - sx, ey - sy);
      const ux = (ex - sx) / d;
      const uy = (ey - sy) / d;
      const a = P(x, y);
      // Seen from above, the arc is only in the shadow's distance from the shaft.
      const lift = Math.sin(Math.PI * p) * 9 * zoom;
      const len = 7 * Math.sqrt(zoom);
      ctx.strokeStyle = "rgba(0,0,0,.3)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + ux * len, a.y + uy * len);
      ctx.stroke();
      ctx.strokeStyle = "#fff4d8";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - lift);
      ctx.lineTo(a.x + ux * len, a.y + uy * len - lift);
      ctx.stroke();
    }
  }

  // Pennants, counts, and this round's losses.
  for (const s of b.squads) {
    if (s.n === 0 || s.state === "fled" || s.state === "dead") continue;
    const side = SIDE[s.side];
    const c = P(s.x, s.y);
    const files = Math.min(s.files0, s.n);
    const hd = (Math.ceil(s.n / files) * s.spacing) / 2;
    const top = c.y - Math.abs(s.fy) * hd * scale - 6;
    const isBanner = s === banner;
    const routing = s.state === "routing";
    const pole = isBanner ? 24 : 16;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(c.x, top);
    ctx.lineTo(c.x, top - pole);
    ctx.stroke();
    const fw = isBanner ? 22 : 16;
    const fh = isBanner ? 15 : 11;
    ctx.beginPath();
    ctx.moveTo(c.x, top - pole);
    ctx.lineTo(c.x + fw, top - pole);
    ctx.lineTo(c.x + fw - 4, top - pole + fh / 2);
    ctx.lineTo(c.x + fw, top - pole + fh);
    ctx.lineTo(c.x, top - pole + fh);
    ctx.closePath();
    ctx.fillStyle = routing ? "#f4f4f4" : side.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = routing ? "#9aa0a8" : side.dark;
    ctx.stroke();
    const gx = c.x + fw / 2 - 1.5;
    const gy = top - pole + fh / 2;
    if (isBanner) charge("star", gx, gy, 12, GOLD);
    else roleGlyph(s.t.role, gx, gy, routing ? "#555" : "#f4f1e8");
    const lbl = `${s.n}`;
    const w = text(lbl, 0, -100, { size: 10, weight: 700 }) + 7;
    rrect(c.x + fw + 3, top - pole + 1, w, 12, 6, "rgba(16,19,26,.8)");
    text(lbl, c.x + fw + 3 + w / 2, top - pole + 7.5, {
      size: 10,
      weight: 700,
      align: "center",
      color: s.state === "wavering" ? GOLD : FG,
    });
    const lost = lostThisRound.get(s.id) ?? 0;
    if (lost > 0 && !routing) {
      text(`−${lost}`, c.x - 4, top - pole - 9, {
        size: 12,
        weight: 800,
        align: "right",
        color: s.side === YOU ? "#ffb3b3" : "#ffe08a",
        halo: "rgba(10,12,16,.9)",
      });
    }
  }
  ctx.restore();

  // Following: a glance map of the whole field, read-only, with the camera's
  // rectangle on it, so the zoom never hides where everyone is.
  if (follow) minimap(b, view, fieldTop);

  // Chrome: HUD.
  statusBar();
  const men = (side) =>
    b.squads
      .filter((s) => s.side === side && (s.state === "ok" || s.state === "wavering"))
      .reduce((m, s) => m + s.n, 0);
  hud((y) => {
    text(`Round ${ROUND}`, 42, y, { size: 15, weight: 700 });
    text("Valor", 124, y, { size: 13, color: DIM });
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(166 + i * 12, y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = i < 4 ? GOLD : "transparent";
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = i < 4 ? GOLD : "#4a5366";
      ctx.stroke();
    }
    let x = W - 16;
    const them = men(1);
    const mine = men(0);
    let w = text(`${them}`, x, y, { size: 14, weight: 700, align: "right" });
    x -= w + 10;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = SIDE[1].color;
    ctx.fill();
    x -= 12;
    w = text("v", x, y, { size: 12, color: DIM, align: "right" });
    x -= w + 6;
    w = text(`${mine}`, x, y, { size: 14, weight: 700, align: "right" });
    x -= w + 10;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = SIDE[0].color;
    ctx.fill();
  });

  // Chrome: the command bar.
  const y0 = fieldBottom;
  ctx.fillStyle = RAISED;
  ctx.fillRect(0, y0, W, barH);
  ctx.fillStyle = LINE;
  ctx.fillRect(0, y0, W, 1);
  // Chips.
  const mineSquads = b.squads.filter((s) => s.side === YOU && s !== banner);
  const names = {
    spearman: "Spear",
    footman: "Foot",
    militia: "Militia",
    archer: "Bows",
    horseman: "Horse",
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y0, W - 22, barH);
  ctx.clip();
  let cx = 10;
  rrect(cx, y0 + 8, 44, 46, 12, CARD);
  text("All", cx + 22, y0 + 31, { size: 13, weight: 700, align: "center" });
  cx += 52;
  for (const s of [...mineSquads].sort(
    (a, b) =>
      ["horseman", "footman", "spearman", "archer", "militia"].indexOf(a.type) -
      ["horseman", "footman", "spearman", "archer", "militia"].indexOf(b.type),
  )) {
    const wch = 82;
    const selected = s === sel;
    rrect(cx, y0 + 8, wch, 46, 12, CARD, selected ? ACCENT : null, 2);
    roleGlyph(s.t.role, cx + 14, y0 + 23, DIM);
    text(names[s.type], cx + 25, y0 + 23, { size: 12, weight: 600, color: DIM });
    const routing = s.state === "routing";
    text(routing ? "runs" : `${s.n}`, cx + 14, y0 + 40, {
      size: 15,
      weight: 800,
      color: routing ? DANGER : FG,
      align: "left",
    });
    if (s.t.range) {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + 48 + i * 7, y0 + 40, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = i < Math.ceil((s.ammo / s.t.ammo) * 4) ? FG : "#3a4254";
        ctx.fill();
      }
    }
    const m = clamp(s.morale / s.t.morale, 0, 1);
    rrect(cx + 8, y0 + 49, wch - 16, 3, 1.5, "#2e3647");
    rrect(cx + 8, y0 + 49, (wch - 16) * m, 3, 1.5, m > 0.55 ? ACCENT : m > 0.3 ? GOLD : DANGER);
    if (s.state === "wavering")
      text("!", cx + wch - 12, y0 + 22, { size: 14, weight: 900, color: GOLD });
    cx += wch + 8;
  }
  ctx.restore();
  const fade = ctx.createLinearGradient(W - 50, 0, W - 22, 0);
  fade.addColorStop(0, "rgba(25,30,41,0)");
  fade.addColorStop(1, RAISED);
  ctx.fillStyle = fade;
  ctx.fillRect(W - 50, y0 + 6, 28, 50);
  text("›", W - 12, y0 + 31, { size: 20, color: DIM, align: "center" });
  // Orders.
  const orders = ["Advance", "Hold", "Charge", "Fall back", "···"];
  const ow = (W - 20 - 4 * 6) / 5;
  orders.forEach((o, i) => {
    const x = 10 + i * (ow + 6);
    const active = o === "Charge";
    rrect(x, y0 + 62, ow, 44, 12, active ? "#1f3b2b" : CARD, active ? ACCENT : null, 1.5);
    text(o, x + ow / 2, y0 + 84, {
      size: 13,
      weight: 700,
      align: "center",
      color: active ? ACCENT : FG,
    });
  });
  // Abilities, continuous, Go.
  const ability = (x, w, name, cost) => {
    rrect(x, y0 + 114, w, 54, 12, CARD);
    text(name, x + w / 2, y0 + 133, { size: 13, weight: 700, align: "center" });
    for (let i = 0; i < cost; i++) {
      ctx.beginPath();
      ctx.arc(x + w / 2 - ((cost - 1) * 9) / 2 + i * 9, y0 + 152, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.fill();
    }
  };
  ability(10, 74, "Rally", 3);
  ability(90, 74, "Hold!", 2);
  rrect(170, y0 + 114, 40, 54, 12, CARD);
  if (follow) {
    // The camera toggle: fit the whole field.
    ctx.strokeStyle = FG;
    ctx.lineWidth = 1.8;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const cx = 190 + sx * 8;
      const cy = y0 + 141 + sy * 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sy * 5);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - sx * 5, cy);
      ctx.stroke();
    }
  } else text("···", 190, y0 + 141, { size: 15, weight: 700, align: "center", color: DIM });
  rrect(218, y0 + 114, 54, 54, 12, CARD);
  ctx.fillStyle = FG;
  ctx.beginPath();
  ctx.moveTo(234, y0 + 131);
  ctx.lineTo(244, y0 + 141);
  ctx.lineTo(234, y0 + 151);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(248, y0 + 131, 3, 20);
  ctx.fillRect(254, y0 + 131, 3, 20);
  rrect(280, y0 + 114, W - 290, 54, 14, ACCENT);
  text("GO ▶", 280 + (W - 290) / 2, y0 + 141, {
    size: 19,
    weight: 800,
    align: "center",
    color: "#06210f",
  });
  homeBar();
}

/**
 * What the follow camera frames: across, the middle of the fighting; up and
 * down, the fighting plus your own squads near it, which puts the clash in
 * the upper half and your reserves below it, under your thumb.
 */
function fightCentre(b) {
  const up = (s) => s.state === "ok" || s.state === "wavering";
  const melee = b.squads.filter((s) => up(s) && s.contacts.length);
  const core = melee.length ? melee : b.squads.filter(up);
  const n = core.reduce((m, s) => m + s.n, 0) || 1;
  const cx = core.reduce((m, s) => m + s.x * s.n, 0) / n;
  const cy = core.reduce((m, s) => m + s.y * s.n, 0) / n;
  const near = b.squads.filter(
    (s) => up(s) && (core.includes(s) || (s.side === YOU && Math.hypot(s.x - cx, s.y - cy) < 50)),
  );
  // Across, the fight itself; up and down, the fight and your reserves.
  const ys = near.map((s) => s.y);
  return { x: cx, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

const COATS = ["#6b4a33", "#8a5a35", "#3a2c24", "#a19a8e", "#5e3d29"];

/**
 * One soldier seen from above, about 12 px across at 2x: shoulders and a
 * helmet, and what he carries — a shield on the left arm, a sword or a spear
 * on the right, a bow held out in front, or a horse under him. Drawn in a frame
 * where +x is the way he faces and one unit is a metre.
 */
// Figures are drawn 1.4x life size: at true size a man is a 6 px pill on a
// phone, and games have always drawn their soldiers big for this reason.
const FIGURE = 1.4;

function figure(s, p, ang, scale, body, side, routing, i) {
  scale *= FIGURE;
  const role = s.t.role;
  const tint = (hash(s.id * 131 + i, 3) - 0.5) * 0.14;
  const cloth = routing
    ? body
    : tint > 0
      ? mix(body, "#ffffff", tint)
      : mix(body, "#000000", -tint);
  const steel = s.t.armor >= 2 ? "#aeb4bd" : "#7b6248";
  ctx.save();
  // Shadow, cast down and right in screen space.
  ctx.beginPath();
  const horse = role === "cav";
  ctx.ellipse(
    p.x + 0.14 * scale,
    p.y + 0.18 * scale,
    (horse ? 0.7 : 0.42) * scale,
    (horse ? 0.45 : 0.32) * scale,
    horse ? ang : 0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(10,18,8,.32)";
  ctx.fill();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.scale(scale, scale);
  const lw = 0.7 / scale;
  if (horse) {
    const coat = s.type === "knight" ? "#d9d4c8" : COATS[Math.floor(hash(s.id, i) * COATS.length)];
    ctx.beginPath();
    ctx.moveTo(-0.7, 0);
    ctx.lineTo(-0.98, 0.07);
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = "#1e1611";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-0.08, 0, 0.62, 0.27, 0, 0, Math.PI * 2);
    ctx.fillStyle = coat;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#1e1611";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.62, 0, 0.26, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (s.type === "knight" && !routing) {
      // A caparison in the rider's colours.
      ctx.beginPath();
      ctx.ellipse(-0.12, 0, 0.5, 0.33, 0, 0, Math.PI * 2);
      ctx.fillStyle = mix(side.color, "#ffffff", 0.15);
      ctx.fill();
      ctx.strokeStyle = side.dark;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(-0.06, 0, 0.17, 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = cloth;
    ctx.fill();
    ctx.strokeStyle = side.dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.stroke();
    if (!routing) {
      ctx.beginPath();
      ctx.moveTo(0.05, 0.24);
      ctx.lineTo(s.speedNow > 4 ? 1.7 : 0.7, 0.27);
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = s.speedNow > 4 ? "#e6dfcc" : "#c9ccd2";
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (!routing && role === "spear") {
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.26);
    ctx.lineTo(2.0, 0.26);
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = "#9c8058";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2.0, 0.26);
    ctx.lineTo(2.35, 0.26);
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = "#e4e6ea";
    ctx.stroke();
  }
  if (!routing && role === "ranged") {
    ctx.beginPath();
    ctx.arc(-0.12, 0, 0.5, -1.05, 1.05);
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = "#8b5a2b";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.12 + 0.5 * Math.cos(-1.05), 0.5 * Math.sin(-1.05));
    ctx.lineTo(-0.12 + 0.5 * Math.cos(1.05), 0.5 * Math.sin(1.05));
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = "#e8e2d2";
    ctx.stroke();
  }
  // Shoulders.
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.21, 0.36, 0, 0, Math.PI * 2);
  ctx.fillStyle = role === "ranged" ? mix(side.color, "#ffffff", 0.22) : cloth;
  if (routing) ctx.fillStyle = cloth;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = side.dark;
  ctx.stroke();
  // Sword arm.
  if (!routing && role === "inf") {
    ctx.beginPath();
    ctx.moveTo(0.1, 0.3);
    ctx.lineTo(0.62, 0.38);
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = "#c9ccd2";
    ctx.stroke();
  }
  // Helmet, or a hood for archers.
  ctx.beginPath();
  ctx.arc(0.03, 0, 0.18, 0, Math.PI * 2);
  ctx.fillStyle = role === "ranged" ? "#5c4a32" : steel;
  ctx.fill();
  ctx.strokeStyle = "#1c1c1c";
  ctx.stroke();
  // Shield on the left arm, out in front.
  if (!routing && s.t.shield > 0) {
    const r = s.t.shield >= 0.4 ? 0.28 : 0.2;
    ctx.beginPath();
    ctx.arc(0.28, -0.24, r, 0, Math.PI * 2);
    ctx.fillStyle = mix(side.color, "#ffffff", 0.35);
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = side.dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.28, -0.24, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "#c9ccd2";
    ctx.fill();
  }
  ctx.restore();
}

/** A man down: on his side, his weapon beside him. */
function fallenFigure(p, f, scale) {
  scale *= FIGURE;
  const a = hash(Math.round(f.x * 10), Math.round(f.y * 10)) * Math.PI * 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.ellipse(0.1, 0.05, 0.42, 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(90,18,18,.35)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.36, 0.17, 0, 0, Math.PI * 2);
  ctx.fillStyle = SIDE[f.side].dark;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.38, 0, 0.13, 0, Math.PI * 2);
  ctx.fillStyle = "#6f737a";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.3);
  ctx.lineTo(0.5, 0.42);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = "#9a9ca0";
  ctx.stroke();
  ctx.restore();
}

/** The whole field in a corner box, squads as blocks, the camera as a frame. */
function minimap(b, view, top) {
  const mw = 62;
  const mh = mw * 1.4;
  const x0 = W - mw - 10;
  const y0 = top + 10;
  const k = mw / 100;
  rrect(x0 - 3, y0 - 3, mw + 6, mh + 6, 8, "rgba(16,19,26,.82)", LINE);
  ctx.fillStyle = "#3f5d37";
  ctx.fillRect(x0, y0, mw, mh);
  for (const s of b.squads) {
    if (s.n === 0 || s.state === "fled" || s.state === "dead") continue;
    const routing = s.state === "routing";
    ctx.fillStyle = routing ? "#e6e6e6" : SIDE[s.side].color;
    const w = Math.max(2, Math.min(s.files0, s.n) * s.spacing * k);
    const h = Math.max(2, Math.ceil(s.n / Math.max(1, Math.min(s.files0, s.n))) * s.spacing * k);
    ctx.fillRect(x0 + s.x * k - w / 2, y0 + s.y * k - h / 2, w, h);
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0 + view.x * k, y0 + view.y * k, view.w * k, view.h * k);
}

function roleGlyph(role, x, y, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (role === "inf") {
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.lineTo(x + 4, y);
    ctx.quadraticCurveTo(x + 4, y + 3, x, y + 5);
    ctx.quadraticCurveTo(x - 4, y + 3, x - 4, y);
    ctx.closePath();
    ctx.fill();
  } else if (role === "spear") {
    ctx.moveTo(x - 4, y + 5);
    ctx.lineTo(x + 3, y - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(x + 1, y - 4);
    ctx.lineTo(x + 4, y - 1);
    ctx.closePath();
    ctx.fill();
  } else if (role === "ranged") {
    ctx.arc(x - 2, y, 5, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 0.5, y - 4.5);
    ctx.lineTo(x - 0.5, y + 4.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  } else {
    ctx.arc(x, y - 0.5, 4, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

ctx.fillStyle = BG;
ctx.fillRect(0, 0, W, H);
if (VIEW === "overview") drawOverview();
else if (VIEW === "battle") drawBattle();
else drawMap();
document.body.dataset.ready = "1";
