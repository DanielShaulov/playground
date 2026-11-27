// The ground of a plot: one big wet wash of meadow, painted as a picture on
// the page with its edges left ragged, the way a watercolourist would. The
// plot's terrain is painted into the same picture: water squares run
// together into one pond, hill squares turn to dry heath. Rocks and trees
// stand on top as their own sprites (scenery.js).

import { sprite } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  lift,
  blob,
  ellipse,
  leaf,
  roundRect,
  smooth,
  resample,
  within,
  TAU,
} from "../paint/wash.js";
import { mix } from "../paint/palette.js";
import { stem, dot, tick, dab } from "./flowers.js";

export const SEASONS = ["spring", "summer", "autumn", "winter"];

const GRASS = {
  spring: {
    base: "meadow",
    charge: ["sap", "butter", "mint"],
    grass: ["sap", "leaf"],
    dots: ["butter", "white", "blush"],
  },
  summer: {
    base: "sap",
    charge: ["meadow", "leaf", "butter"],
    grass: ["leaf", "moss"],
    dots: ["butter", "white", "lilac"],
  },
  autumn: {
    base: "olive",
    charge: ["straw", "apricot", "sap"],
    grass: ["olive", "amber"],
    dots: ["apricot", "straw", "terracotta"],
  },
  winter: {
    base: "snow",
    charge: ["cloud", "sky", "white"],
    grass: ["stone", "sage"],
    dots: ["white", "cloud", "sky"],
  },
};

// Hill ground: drier, heathery, a little purple in it.
const HEATH = {
  spring: {
    base: mix("heath", "meadow", 0.45),
    charge: ["sage", "heathBloom", "butter"],
    grass: ["olive", "sap"],
    dots: ["butter", "white", "mauve"],
  },
  summer: {
    base: mix("heath", "olive", 0.4),
    charge: ["olive", "heathBloom", "straw"],
    grass: ["olive", "moss"],
    dots: ["mauve", "straw", "white"],
  },
  autumn: {
    base: mix("heath", "mauve", 0.3),
    charge: ["heathBloom", "mauve", "straw"],
    grass: ["olive", "chestnut"],
    dots: ["heather", "mauve", "apricot"],
  },
  winter: {
    base: "snow",
    charge: ["cloud", "lilac", "sky"],
    grass: ["stone", "heathBloom"],
    dots: ["white", "cloud", "lilac"],
  },
};

// What makes one plot's meadow its own: the pond bank is cooler and lusher,
// the orchard is dappled and strewn with whatever the trees have dropped.
const FEEL = {
  pond: {
    spring: { charge: ["sap", "mint", "sage"] },
    summer: { charge: ["leaf", "mint", "meadow"], dots: ["white", "sky", "butter"] },
    autumn: { charge: ["straw", "sage", "sap"] },
    winter: { charge: ["cloud", "sky", "sky"] },
  },
  orchard: {
    spring: { charge: ["sap", "butter", "blush"], dots: ["blush", "white", "rose"] },
    summer: { charge: ["leaf", "meadow", "butter"], dots: ["butter", "white", "blush"] },
    autumn: { charge: ["straw", "apricot", "amber"], dots: ["amber", "terracotta", "straw"] },
    winter: {},
  },
};

// ---------------------------------------------------------------- terrain

const N = 6;

function parse(terrain) {
  if (!Array.isArray(terrain) || terrain.length !== N || terrain.some((row) => row.length !== N))
    throw new Error(`terrain must be ${N} strings of ${N} characters`);
  for (const row of terrain)
    for (const c of row) if (!".h~rT".includes(c)) throw new Error(`no terrain "${c}"`);
  return terrain;
}

// A rock stands on whatever ground is round it; a tree stands on grass.
function groundOf(cells, x, y) {
  const c = cells[y][x];
  if (c !== "r") return c === "T" ? "." : c;
  let hill = 0;
  let grass = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const n = cells[y + dy]?.[x + dx];
    if (n === "h") hill++;
    else if (n === "." || n === "T") grass++;
  }
  return hill >= grass && hill > 0 ? "h" : ".";
}

/**
 * The outlines of every connected patch of squares that pass `is(x, y)`,
 * as loops of the midpoints of their boundary edges (in square units).
 * Midpoints, not corners: joined up smoothly they round every corner off.
 */
function patches(is) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N && is(x, y);
  const edges = new Map();
  const add = (x0, y0, x1, y1) => {
    const k = `${x0},${y0}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([x1, y1]);
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  const out = [];
  for (const [k, list] of edges) {
    while (list.length) {
      const [sx, sy] = k.split(",").map(Number);
      let x = sx;
      let y = sy;
      const loop = [];
      let area = 0;
      for (;;) {
        const next = edges.get(`${x},${y}`);
        if (!next || !next.length) break;
        const [nx, ny] = next.pop();
        loop.push([(x + nx) / 2, (y + ny) / 2]);
        area += x * ny - nx * y;
        x = nx;
        y = ny;
        if (x === sx && y === sy) break;
      }
      // A loop that runs the other way round is a hole (an island); skip it.
      if (loop.length >= 4 && area > 0) out.push(loop);
    }
  }
  return out;
}

function centre(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function contains(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ------------------------------------------------------------------- pond

function reeds(ctx, r, x, y, tall, season) {
  const winter = season === "winter";
  const blades =
    winter || season === "autumn" ? ["olive", "straw", "soil"] : ["leaf", "moss", "sap"];
  const n = winter ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const lean = r.gauss() * 0.28;
    const len = tall * r.range(0.55, 1) * (winter ? 0.75 : 1);
    brush(ctx, stem(r, x + r.range(-4, 4), y + r.range(-1, 1.5), len, lean, 0.3), r.pick(blades), {
      r,
      width: r.range(1.5, 2.4),
      strength: 0.82,
    });
  }
  // A bulrush or two.
  for (let i = 0; i < 2; i++) {
    const p = stem(
      r,
      x + (i ? 2.5 : -2),
      y,
      tall * r.range(0.95, 1.2),
      (i ? 1 : -1) * r.range(0.04, 0.2),
      0.1,
    );
    brush(ctx, p, winter ? "soil" : "moss", { r, width: 1.1, strength: 0.85 });
    const [tx, ty] = p[p.length - 1];
    wash(ctx, ellipse(tx, ty + 3.5, 1.7, 4.2, 7, r.gauss() * 0.1), "umber", {
      r,
      layers: 5,
      strength: 0.9,
      soft: 0.1,
    });
    if (winter) dot(ctx, r, tx, ty - 0.5, 1.5, "white", 0.95);
  }
}

function lilyPad(ctx, r, x, y, size, flower) {
  const a = r() * TAU;
  wash(ctx, ellipse(x, y, size, size * 0.62, 10), r.pick(["leaf", "moss"]), {
    r,
    layers: 6,
    strength: 0.88,
    soft: 0.08,
    edge: 0.7,
  });
  // The notch, lifted back to water, and a vein.
  lift(ctx, leaf(x, y, size * 1.05, size * 0.3, a, 0.8), r, 0.5, 0.15);
  tick(ctx, r, x, y, x - Math.cos(a) * size * 0.8, y - Math.sin(a) * size * 0.5, "pine", 0.4, 0.5);
  if (!flower) return;
  const fx = x + size * 0.9;
  const fy = y - size * 0.5;
  for (let k = 0; k < 6; k++) {
    const b = (k / 6) * TAU;
    dot(ctx, r, fx + Math.cos(b) * 2, fy + Math.sin(b) * 1.5, 1.4, k % 2 ? "white" : "blush", 0.95);
  }
  dot(ctx, r, fx, fy, 1, "dandelion", 0.95);
}

function pond(ctx, r, shape, tile, season) {
  const winter = season === "winter";
  const [cx, cy] = centre(shape);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of shape) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const span = Math.min(x1 - x0, y1 - y0);
  const grown = (k, dx = 0, dy = 0) =>
    shape.map(([x, y]) => [cx + (x - cx) * k + dx, cy + (y - cy) * k + dy]);
  // The damp bank, then the water lying in it.
  wash(ctx, grown(1.08), winter ? "dusk" : "moss", {
    r,
    layers: 10,
    strength: winter ? 0.22 : 0.34,
    soft: 0.3,
    edge: 0,
  });
  const water = winter ? "sky" : season === "autumn" ? mix("pond", "dusk", 0.22) : "pond";
  wash(ctx, shape, water, {
    r,
    layers: 20,
    strength: 0.93,
    soft: 0.08,
    edge: 0.9,
    edgeWidth: 1.5,
    charge: {
      color: winter ? "white" : "water",
      n: 5,
      strength: winter ? 0.5 : 0.4,
    },
  });
  within(ctx, shape, () => {
    // Deeper toward the near side, the sky's light on the far side.
    wash(ctx, grown(0.6, span * 0.06, span * 0.1), winter ? "pond" : "water", {
      r,
      layers: 10,
      strength: winter ? 0.3 : 0.42,
      soft: 0.5,
      edge: 0,
    });
    wash(
      ctx,
      ellipse(cx - span * 0.14, cy - span * 0.24, span * 0.3, span * 0.11, 10, -0.15),
      winter ? "white" : "sky",
      { r, layers: 8, strength: 0.5, soft: 0.5, edge: 0 },
    );
    // Glints: the paper itself, lifted clean.
    for (let i = 0; i < 4; i++) {
      const gx = cx + r.range(-0.3, 0.3) * (x1 - x0);
      const gy = cy + r.range(-0.3, 0.3) * (y1 - y0);
      lift(ctx, ellipse(gx, gy, tile * r.range(0.14, 0.26), 1.2, 8, -0.06), r, 0.8, 0.15);
      lift(
        ctx,
        ellipse(gx + tile * 0.12, gy + 3.2, tile * r.range(0.06, 0.12), 0.9, 6),
        r,
        0.7,
        0.15,
      );
    }
    if (winter) {
      // Skate marks on the ice.
      for (let i = 0; i < 3; i++) {
        const sx = cx + r.range(-0.25, 0.25) * (x1 - x0);
        const sy = cy + r.range(-0.2, 0.25) * (y1 - y0);
        const len = tile * r.range(0.5, 0.9);
        pencil(
          ctx,
          [
            [sx - len / 2, sy],
            [sx, sy - r.range(3, 8)],
            [sx + len / 2, sy + r.range(-2, 4)],
          ],
          { r, color: "dusk", passes: 1, alpha: 0.4, width: 0.7, gaps: 0.2 },
        );
      }
    } else {
      // Ripple rings.
      for (let i = 0; i < 3; i++) {
        const rx = cx + r.range(-0.28, 0.28) * (x1 - x0);
        const ry = cy + r.range(-0.2, 0.3) * (y1 - y0);
        const rad = tile * r.range(0.1, 0.18);
        pencil(ctx, ellipse(rx, ry, rad, rad * 0.4, 8), {
          r,
          color: "water",
          closed: true,
          passes: 1,
          alpha: 0.5,
          width: 0.7,
          gaps: 0.5,
        });
      }
    }
  });
  // Lily pads, well out from the bank.
  if (!winter) {
    const safe = grown(0.66);
    let made = 0;
    for (let tries = 0; tries < 60 && made < Math.max(2, Math.round(shape.length / 22)); tries++) {
      const x = r.range(x0, x1);
      const y = r.range(y0, y1);
      if (!contains(safe, x, y)) continue;
      lilyPad(ctx, r, x, y, tile * r.range(0.1, 0.13), made % 2 === 0 && season !== "autumn");
      if (made === 0) lilyPad(ctx, r, x - tile * 0.2, y + tile * 0.1, tile * 0.075, false);
      made++;
    }
    if (season === "autumn")
      for (let i = 0; i < 7; i++) {
        const x = r.range(x0, x1);
        const y = r.range(y0, y1);
        if (contains(safe, x, y))
          dab(ctx, r, x, y, 2.2, 1.3, r.pick(["amber", "apricot", "terracotta"]), {
            strength: 0.85,
          });
      }
  }
  // Snow heaped on the banks, or reeds standing in the shallows.
  if (winter)
    for (let i = 0; i < shape.length; i += 3) {
      const [x, y] = grown(1.05)[i];
      dab(ctx, r, x, y, tile * r.range(0.09, 0.15), tile * r.range(0.05, 0.08), "white", {
        layers: 5,
        strength: 0.9,
        soft: 0.3,
        edge: 0.15,
        vary: 0.01,
      });
    }
  const clumps = Math.max(3, Math.round(shape.length / 14));
  const start = r.int(0, shape.length - 1);
  for (let i = 0; i < clumps; i++) {
    const at =
      shape[
        (start + Math.round((i * shape.length) / clumps + r.range(-2, 2)) + shape.length) %
          shape.length
      ];
    // Keep clear of the near bank's middle, where it would hide the water.
    const k = at[1] > cy + (y1 - cy) * 0.6 ? 0.6 : 1;
    reeds(ctx, r, at[0], at[1] + 1, tile * 0.42 * k, season);
  }
}

// ----------------------------------------------------------------- ground

/**
 * The painted ground of one plot.
 *
 * With `terrain`, the 6 × 6 grid sits inside the picture inset by `pad` px
 * on every side (the meadow wash runs a little past the squares), so square
 * (x, y) covers x: pad + x * (w - 2 * pad) / 6 and likewise down.
 *
 * @param {string} plot    plot id (so each plot's wash is its own)
 * @param {"spring"|"summer"|"autumn"|"winter"} season
 * @param {number} w       CSS px
 * @param {number} h
 * @param {string[]} [terrain] six strings of six: "." grass, "h" hill,
 *        "~" water, "r" rock, "T" tree. Left out: all grass.
 * @param {number} [pad]   how far the grid is inset from the picture's edge (12)
 */
export function ground(plot, season, w, h, terrain, pad = 12) {
  if (!GRASS[season]) throw new Error(`no season "${season}"`);
  const cells = terrain ? parse(terrain) : null;
  const key =
    `ground-${plot}-${season}-${Math.round(w)}x${Math.round(h)}` +
    (cells ? `-${cells.join("")}-${Math.round(pad)}` : "");
  return sprite(key, w, h, (ctx, W, H, r) => paintGround(ctx, W, H, r, plot, season, cells, pad), {
    ax: 0,
    ay: 0,
    grain: 1,
  });
}

function paintGround(ctx, W, H, r, plot, season, cells, pad) {
  const winter = season === "winter";
  const tw = (W - pad * 2) / N;
  const th = (H - pad * 2) / N;
  const tile = Math.min(tw, th);
  const kind = (x, y) => (cells ? groundOf(cells, x, y) : ".");
  let hills = 0;
  if (cells)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (kind(x, y) === "h") hills++;
  // The plot is painted as whichever ground it has most of; the other kind
  // goes in as patches.
  const heathy = hills > (N * N) / 2;
  const look = { ...(heathy ? HEATH : GRASS)[season], ...(heathy ? null : FEEL[plot]?.[season]) };
  const other = (heathy ? GRASS : HEATH)[season];

  const m = Math.min(W, H) * 0.035;
  const body = resample(
    roundRect(m, m, W - m * 2, H - m * 2, Math.min(W, H) * 0.1),
    Math.min(W, H) / 14,
  );
  wash(ctx, body, look.base, {
    r,
    layers: 26,
    strength: 0.82,
    soft: 0.2,
    rounds: 2,
    edge: 0.7,
    edgeWidth: 1.6,
  });
  // Other greens dropped in while it was wet, kept inside the edge.
  within(ctx, body, () => {
    for (const c of look.charge) {
      for (let i = 0; i < 5; i++) {
        const rad = Math.min(W, H) * r.range(0.1, 0.22);
        wash(
          ctx,
          resample(
            blob(r, r.range(m * 3, W - m * 3), r.range(m * 3, H - m * 3), rad, 0.25, 9),
            rad / 3,
          ),
          c,
          { r, layers: 10, strength: 0.3, soft: 0.5, edge: 0 },
        );
      }
    }
  });

  const px = (loop, inset = 0, shake = 0.05) =>
    resample(
      smooth(
        loop.map(([x, y]) => [
          pad + Math.min(N - inset, Math.max(inset, x)) * tw + r.gauss() * tw * shake,
          pad + Math.min(N - inset, Math.max(inset, y)) * th + r.gauss() * th * shake,
        ]),
        4,
      ),
      tile / 5,
    );

  if (cells) {
    // Patches of the other ground.
    const odd = heathy ? "." : "h";
    within(ctx, body, () => {
      for (const loop of patches((x, y) => kind(x, y) === odd)) {
        const shape = px(loop, 0, 0.08);
        wash(ctx, shape, other.base, { r, layers: 14, strength: 0.72, soft: 0.5, edge: 0 });
        within(ctx, shape, () => {
          const [cx, cy] = centre(shape);
          for (const c of other.charge)
            for (let i = 0; i < 2; i++)
              wash(
                ctx,
                blob(
                  r,
                  cx + r.gauss() * tile,
                  cy + r.gauss() * tile,
                  tile * r.range(0.4, 0.8),
                  0.25,
                  9,
                ),
                c,
                {
                  r,
                  layers: 8,
                  strength: 0.3,
                  soft: 0.5,
                  edge: 0,
                },
              );
        });
      }
    });
  }

  if (heathy || hills) slope(ctx, r, W, H, pad, tw, th, kind, heathy ? null : "h", season);
  if (winter) drifts(ctx, r, W, H, m, body);

  // Tufts and specks: enough to read as grass, not enough to fight the beds.
  for (let i = 0; i < 46; i++) {
    const x = r.range(m * 3, W - m * 3);
    const y = r.range(m * 3, H - m * 3);
    const gx = Math.floor((x - pad) / tw);
    const gy = Math.floor((y - pad) / th);
    const here = cells?.[gy]?.[gx];
    if (here === "~") continue;
    const on = cells && gx >= 0 && gy >= 0 && gx < N && gy < N ? kind(gx, gy) : heathy ? "h" : ".";
    const colors = on === "h" ? HEATH[season].grass : (heathy ? GRASS[season] : look).grass;
    for (let k = 0; k < 3; k++) {
      const lean = (k - 1) * 0.45 + r.gauss() * 0.15;
      const len = r.range(4, 8);
      brush(
        ctx,
        smooth(
          [
            [x, y],
            [x + Math.sin(lean) * len * 0.5, y - len * 0.55],
            [x + Math.sin(lean) * len, y - len],
          ],
          3,
          false,
        ),
        r.pick(colors),
        { r, width: 1.4, strength: 0.5, layers: 4, edge: 0 },
      );
    }
    // On the hill, a sprig of heather beside some of the tufts.
    if (on === "h" && !winter && i % 2 === 0)
      for (let k = 0; k < 4; k++)
        dot(
          ctx,
          r,
          x + 3 + r.gauss() * 2,
          y - 2 + r.gauss() * 2,
          1,
          r.pick(HEATH[season].dots),
          0.75,
        );
  }
  for (const c of look.dots)
    splatter(ctx, W / 2, H / 2, Math.min(W, H) * 0.47, c, { r, n: 26, size: 1.3, strength: 0.9 });

  if (!cells) return;
  // What lies under the standing things: grit round a rock, and under a
  // tree whatever it has dropped this season.
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = cells[y][x];
      const cx = pad + (x + 0.5) * tw;
      const cy = pad + (y + 0.8) * th;
      if (c === "r") {
        splatter(ctx, cx, cy, tw * 0.42, winter ? "dusk" : "stone", {
          r,
          n: 9,
          size: 1.5,
          strength: 0.9,
        });
        splatter(ctx, cx, cy, tw * 0.42, winter ? "white" : "umber", {
          r,
          n: 5,
          size: 0.9,
          strength: 0.5,
        });
      } else if (c === "T") {
        const litter = {
          spring: ["blush", "white", "rose"],
          summer: null,
          autumn: ["amber", "terracotta", "apricot", "straw"],
          winter: null,
        }[season];
        if (!winter)
          wash(ctx, ellipse(cx + tw * 0.06, cy, tw * 0.5, th * 0.2, 12), "moss", {
            r,
            layers: 8,
            strength: 0.2,
            soft: 0.5,
            edge: 0,
          });
        if (litter)
          for (const col of litter)
            splatter(ctx, cx, cy, tw * 0.55, col, { r, n: 7, size: 1.4, strength: 1 });
      }
    }
  // Water last, so its banks sit over the grass and its reeds over everything.
  for (const loop of patches((x, y) => cells[y][x] === "~"))
    pond(ctx, r, px(loop, 0.1, 0.04), tile, season);
}

// A hint of slope on hill ground: long contour strokes, lighter above them
// and a little violet below, the way a hillside is drawn on a map.
function slope(ctx, r, W, H, pad, tw, th, kind, only, season) {
  const winter = season === "winter";
  const lines = 4;
  for (let i = 0; i < lines; i++) {
    const y = pad + ((i + 0.55) / lines) * (H - pad * 2) + r.gauss() * th * 0.25;
    const bow = th * r.range(0.2, 0.7);
    const x0 = pad + tw * r.range(0.1, 2.2);
    const x1 = W - pad - tw * r.range(0.1, 2.2);
    const steps = 7;
    const path = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const x = x0 + (x1 - x0) * u;
      const yy = y + Math.sin(u * Math.PI) * bow * (i % 2 ? 0.6 : 1) + r.gauss() * 1.5;
      path.push([x, yy]);
    }
    // Skip the stretch that is not hill, when only part of the plot is.
    const keep = path.filter(([x, yy]) => {
      if (!only) return true;
      const gx = Math.floor((x - pad) / tw);
      const gy = Math.floor((yy - pad) / th);
      return gx >= 0 && gy >= 0 && gx < N && gy < N && kind(gx, gy) === only;
    });
    if (keep.length < 3) continue;
    const curve = smooth(keep, 4, false);
    brush(
      ctx,
      curve.map(([x, yy]) => [x, yy + 4]),
      winter ? "dusk" : "heathBloom",
      {
        r,
        width: 9,
        strength: winter ? 0.14 : 0.22,
        soft: 0.4,
        layers: 6,
        edge: 0,
      },
    );
    brush(
      ctx,
      curve.map(([x, yy]) => [x, yy - 4]),
      winter ? "white" : "cream",
      {
        r,
        width: 7,
        strength: 0.14,
        soft: 0.4,
        layers: 5,
        edge: 0,
      },
    );
    pencil(ctx, keep, { r, passes: 1, alpha: 0.13, width: 0.7, gaps: 0.7, wobble: 0.8 });
  }
}

// Winter: blue shadows lying in the hollows of the snow.
function drifts(ctx, r, W, H, m, body) {
  within(ctx, body, () => {
    for (let i = 0; i < 9; i++) {
      const x = r.range(m * 3, W - m * 3);
      const y = r.range(m * 3, H - m * 3);
      const len = Math.min(W, H) * r.range(0.1, 0.22);
      const path = smooth(
        [
          [x - len, y + r.gauss() * 2],
          [x - len * 0.3, y - len * 0.12],
          [x + len * 0.4, y - len * 0.06],
          [x + len, y + len * 0.08],
        ],
        4,
        false,
      );
      brush(ctx, path, r.pick(["sky", "dusk", "sky"]), {
        r,
        width: len * 0.22,
        strength: 0.2,
        soft: 0.45,
        layers: 6,
        edge: 0,
      });
      brush(
        ctx,
        path.map(([px, py]) => [px, py - len * 0.12]),
        "white",
        {
          r,
          width: len * 0.12,
          strength: 0.5,
          soft: 0.4,
          layers: 5,
          edge: 0,
          vary: 0.01,
        },
      );
    }
  });
}

// ---------------------------------------------------------------- gallery

/**
 * Terrain to show the ground off with. The real terrain comes from
 * content/plots.js and is passed in by the screen; this copy only feeds the
 * gallery and the test pages.
 */
export const SAMPLE_TERRAIN = {
  home: ["......", "......", "......", "......", "......", "......"],
  pond: ["......", "......", "......", "....~~", "...~~~", "...~~~"],
  orchard: ["......", ".T.T.T", "......", "......", "T.T.T.", "......"],
  hill: ["hhhhhh", "hhrhhh", "hhhhhh", "hhhhrh", "rhhhhh", "hhhrhh"],
};

export const GALLERY = Object.keys(SAMPLE_TERRAIN).flatMap((plot) =>
  SEASONS.map((season) => ({
    name: `ground · ${plot} · ${season}`,
    make: () => ground(plot, season, 264, 264, SAMPLE_TERRAIN[plot]),
    wide: true,
  })),
);
