/**
 * The hex grid (world.md §1): pointy-top hexes in rows, odd rows shifted half
 * a hex right. A hex is one integer, `r * cols + c`, so the realm's layers
 * are flat typed arrays and a path is a list of numbers.
 *
 * Geometry here is in hex units (a hex is 1 from centre to corner); the map
 * view multiplies by its own radius. Only + − × ÷ and Math.sqrt, so the same
 * map comes out of every JavaScript engine (tech.md §3).
 */

export const SQ3 = Math.sqrt(3);

// Neighbour offsets by row parity, in a fixed order: E, NE, NW, W, SW, SE.
const DIRS = [
  [
    [1, 0],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 1],
  ],
];

/** A grid of `cols` × `rows`, with every hex's six neighbours (−1 off the edge). */
export function makeGrid(cols, rows) {
  const n = cols * rows;
  const nb = new Int32Array(n * 6).fill(-1);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const d = DIRS[r & 1];
      for (let k = 0; k < 6; k++) {
        const cc = c + d[k][0];
        const rr = r + d[k][1];
        if (cc >= 0 && rr >= 0 && cc < cols && rr < rows)
          nb[(r * cols + c) * 6 + k] = rr * cols + cc;
      }
    }
  return { cols, rows, n, nb };
}

export const colOf = (g, i) => i % g.cols;
export const rowOf = (g, i) => Math.floor(i / g.cols);
export const index = (g, c, r) =>
  c >= 0 && r >= 0 && c < g.cols && r < g.rows ? r * g.cols + c : -1;

/** The neighbours of hex i that are on the map. */
export function neighbours(g, i) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const j = g.nb[i * 6 + k];
    if (j >= 0) out.push(j);
  }
  return out;
}

/** Steps between two hexes. */
export function dist(g, a, b) {
  const ra = rowOf(g, a);
  const rb = rowOf(g, b);
  const xa = colOf(g, a) - (ra - (ra & 1)) / 2;
  const xb = colOf(g, b) - (rb - (rb & 1)) / 2;
  const dx = xa - xb;
  const dz = ra - rb;
  return Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dx + dz));
}

/** A hex's centre, in hex units: (0, 0) is the top-left corner of the map. */
export function centre(g, i) {
  const r = rowOf(g, i);
  return { x: SQ3 * (colOf(g, i) + 0.5 * (r & 1)) + SQ3 / 2, y: 1.5 * r + 1 };
}

/** The whole map's size in hex units. */
export const extent = (g) => ({ w: SQ3 * (g.cols + 0.5), h: 1.5 * g.rows + 0.5 });

/** The hex under a point in hex units, or −1 off the map. */
export function hexAt(g, x, y) {
  const px = x - SQ3 / 2;
  const py = y - 1;
  // Fractional axial coordinates, rounded in cube space.
  const q = (SQ3 / 3) * px - py / 3;
  const r = (2 / 3) * py;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  const c = rq + (rr - (rr & 1)) / 2;
  return index(g, c, rr);
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/** A binary min-heap of [priority, order, value]; ties go first-in, first-out. */
function heap() {
  const a = [];
  let order = 0;
  const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  return {
    get size() {
      return a.length;
    },
    push(p, v) {
      a.push([p, order++, v]);
      let i = a.length - 1;
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (!less(a[i], a[up])) break;
        [a[i], a[up]] = [a[up], a[i]];
        i = up;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && less(a[l], a[m])) m = l;
          if (r < a.length && less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    },
  };
}

/**
 * The cheapest path from `from` to `to`, both included, or null. `cost(i)` is
 * what entering hex i costs (Infinity where you can't); `least` is the
 * cheapest any hex can cost, which keeps the search exact.
 */
export function findPath(g, from, to, cost, least = 0) {
  if (from === to) return { path: [from], cost: 0 };
  if (!Number.isFinite(cost(to))) return null;
  const best = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  const open = heap();
  best[from] = 0;
  open.push(dist(g, from, to) * least, from);
  while (open.size) {
    const [, , i] = open.pop();
    if (i === to) break;
    const gi = best[i];
    for (let k = 0; k < 6; k++) {
      const j = g.nb[i * 6 + k];
      if (j < 0) continue;
      const step = cost(j);
      if (!Number.isFinite(step)) continue;
      const gj = gi + step;
      if (gj < best[j]) {
        best[j] = gj;
        prev[j] = i;
        open.push(gj + dist(g, j, to) * least, j);
      }
    }
  }
  if (!Number.isFinite(best[to])) return null;
  const path = [to];
  for (let i = to; i !== from;) {
    i = prev[i];
    path.push(i);
  }
  path.reverse();
  return { path, cost: best[to] };
}

/**
 * Cheapest cost from any of `sources` to every hex (Infinity where it can't
 * reach), and which source got there first. `cost(i, from)` prices a step.
 */
export function spread(g, sources, cost) {
  const best = new Float64Array(g.n).fill(Infinity);
  const owner = new Int32Array(g.n).fill(-1);
  const open = heap();
  sources.forEach((s, k) => {
    best[s] = 0;
    owner[s] = k;
    open.push(0, s);
  });
  while (open.size) {
    const [d, , i] = open.pop();
    if (d > best[i]) continue;
    for (let k = 0; k < 6; k++) {
      const j = g.nb[i * 6 + k];
      if (j < 0) continue;
      const step = cost(j, i);
      if (!Number.isFinite(step)) continue;
      if (d + step < best[j]) {
        best[j] = d + step;
        owner[j] = owner[i];
        open.push(d + step, j);
      }
    }
  }
  return { best, owner };
}

/** Every hex within `radius` steps of `at`. */
export function within(g, at, radius) {
  const out = [at];
  const seen = new Uint8Array(g.n);
  seen[at] = 1;
  let ring = [at];
  for (let d = 0; d < radius; d++) {
    const next = [];
    for (const i of ring)
      for (let k = 0; k < 6; k++) {
        const j = g.nb[i * 6 + k];
        if (j >= 0 && !seen[j]) {
          seen[j] = 1;
          next.push(j);
          out.push(j);
        }
      }
    ring = next;
  }
  return out;
}
