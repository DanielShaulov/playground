// Watercolour, the cheap way. A wash is a shape laid down as many nearly
// transparent copies of itself, each with its edge shaken a little
// differently. Where the copies agree the colour is full; where they
// disagree it thins out, which reads as pigment bleeding into wet paper.
// (The layering idea is Tyler Hobbs's "watercolor" essay.)
//
// Everything here paints into a 2D context once. Nothing runs per frame:
// see sprite.js.

import { P, rgba, vary, darken } from "./palette.js";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shapes
// Every shape is a list of [x, y] points, closed unless noted.

export function ellipse(cx, cy, rx, ry = rx, n = 12, rot = 0) {
  const out = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** A lumpy circle: `lump` 0 is round, 0.3 is a potato. */
export function blob(r, cx, cy, radius, lump = 0.15, n = 9, squash = 1) {
  const out = [];
  const ph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ph;
    const k = radius * (1 + r.gauss() * lump);
    out.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k * squash]);
  }
  return out;
}

export function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h],
    [x + w / 2, y + h],
    [x, y + h],
    [x, y + h / 2],
  ];
}

/** A rectangle with soft corners. */
export function roundRect(x, y, w, h, rad) {
  const k = Math.min(rad, w / 2, h / 2);
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + (i / 3) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
    }
  };
  corner(x + w - k, y + k, -Math.PI / 2);
  corner(x + w - k, y + h - k, 0);
  corner(x + k, y + h - k, Math.PI / 2);
  corner(x + k, y + k, Math.PI);
  return out;
}

/** A teardrop from its base at (x, y), `len` long, pointing along `angle`. */
export function petal(x, y, len, wid, angle, tip = 0.62) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  return [
    at(0, 0),
    at(len * 0.3, -wid * 0.36),
    at(len * tip, -wid * 0.5),
    at(len * 0.9, -wid * 0.28),
    at(len, 0),
    at(len * 0.9, wid * 0.28),
    at(len * tip, wid * 0.5),
    at(len * 0.3, wid * 0.36),
  ];
}

/** A leaf: pointed at both ends, fattest at `belly` of the way along. */
export function leaf(x, y, len, wid, angle, belly = 0.42) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  return [
    at(0, 0),
    at(len * belly * 0.5, -wid * 0.36),
    at(len * belly, -wid * 0.5),
    at(len * 0.75, -wid * 0.3),
    at(len, 0),
    at(len * 0.75, wid * 0.3),
    at(len * belly, wid * 0.5),
    at(len * belly * 0.5, wid * 0.36),
  ];
}

/**
 * Smooth a few control points into a curve (Catmull-Rom), `n` points per
 * span. Use it to turn a handful of hand-placed points into an outline.
 */
export function smooth(pts, n = 6, closed = true) {
  const out = [];
  const m = pts.length;
  const at = (i) => (closed ? pts[(i + m) % m] : pts[Math.max(0, Math.min(m - 1, i))]);
  const spans = closed ? m : m - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[m - 1]);
  return out;
}

/**
 * The outline of a brush stroke along an open path. `width(t)` gives the
 * full width at t = 0..1; the default is a stroke that swells in the middle.
 */
export function ribbon(path, width) {
  const w =
    typeof width === "function" ? width : (t) => width * Math.sin(Math.PI * (0.12 + 0.88 * t));
  const left = [];
  const right = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const half = w(i / (n - 1)) / 2;
    left.push([path[i][0] - (dy / len) * half, path[i][1] + (dx / len) * half]);
    right.push([path[i][0] + (dy / len) * half, path[i][1] - (dx / len) * half]);
  }
  return left.concat(right.reverse());
}

/**
 * Walk a closed outline and drop a point every `step` px. Long straight
 * edges shake wildly when deformed (the shake is in proportion to the edge);
 * resample a big shape first and its edge only ripples.
 */
export function resample(pts, step) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    while (d < len) {
      const t = d / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/** Run `paint()` with drawing confined to a shape (its true outline, unshaken). */
export function within(ctx, pts, paint) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();
  paint();
  ctx.restore();
}

// ---------------------------------------------------------------- edges

// Give each corner of a shape its own softness, changing slowly around the
// outline, so one side of a wash is crisp and another bleeds.
function soften(pts, r, soft) {
  const n = pts.length;
  const ph = r() * TAU;
  const ph2 = r() * TAU;
  return pts.map(([x, y], i) => {
    const t = (i / n) * TAU;
    const wave = 0.5 + 0.5 * Math.sin(t + ph) * Math.cos(2 * t + ph2);
    return [x, y, soft * (0.35 + 1.1 * wave)];
  });
}

/**
 * Split every edge at a shaken midpoint, `rounds` times. Each point carries
 * its softness as a third number; the shake is in proportion to the edge's
 * length, so detail gets finer each round.
 */
export function deform(pts, rounds, r, closed = true) {
  let p = pts;
  for (let k = 0; k < rounds; k++) {
    const out = [];
    const n = p.length;
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1e-6;
      const s = ((a[2] ?? 0.25) + (b[2] ?? 0.25)) / 2;
      const g = r.gauss() * len * s;
      const t = 0.5 + (r() - 0.5) * 0.3;
      out.push(a, [a[0] + dx * t - (dy / len) * g, a[1] + dy * t + (dx / len) * g, s * 0.92]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

function trace(ctx, pts, closed = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

// ---------------------------------------------------------------- washes

/**
 * Lay a watercolour wash.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts   the shape
 * @param {string} color     a palette name or hex
 * @param {object} o
 * @param {Function} o.r     the sprite's rng (required)
 * @param {number} [o.strength] how solid the middle ends up, 0..1 (0.7)
 * @param {number} [o.soft]     how far the edge bleeds, 0 crisp .. 0.6 very wet (0.22)
 * @param {number} [o.layers]   copies laid down (16); fewer for tiny shapes
 * @param {number} [o.vary]     pigment unevenness between copies (0.04)
 * @param {number} [o.edge]     dark rim where pigment pools, 0..1 (0.5)
 * @param {boolean} [o.glaze]   multiply over what is there, like a second coat
 * @param {{ color: string, n?: number, strength?: number }} [o.charge]
 *        a second colour dropped in while wet
 */
export function wash(ctx, pts, color, o) {
  const r = o.r;
  const layers = o.layers ?? 16;
  const strength = o.strength ?? 0.7;
  const alpha = 1 - Math.pow(1 - strength, 1 / layers);
  const base = deform(soften(pts, r, o.soft ?? 0.22), o.rounds ?? 2, r);
  ctx.save();
  if (o.glaze) ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < layers; i++) {
    ctx.fillStyle = rgba(vary(color, r, o.vary ?? 0.04), alpha);
    trace(ctx, deform(base, o.detail ?? 2, r));
    ctx.fill();
  }
  if (o.charge) {
    ctx.save();
    trace(ctx, base);
    ctx.clip();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of base) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const size = Math.max(x1 - x0, y1 - y0);
    for (let i = 0; i < (o.charge.n ?? 3); i++) {
      const cx = r.range(x0, x1);
      const cy = r.range(y0, y1);
      wash(ctx, blob(r, cx, cy, size * r.range(0.16, 0.34), 0.25), o.charge.color, {
        r,
        layers: 8,
        strength: o.charge.strength ?? 0.4,
        soft: 0.5,
        edge: 0,
      });
    }
    ctx.restore();
  }
  const edge = o.edge ?? 0.5;
  if (edge > 0) {
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = rgba(darken(color, 0.3), edge * 0.16);
    for (let i = 0; i < 2; i++) {
      ctx.lineWidth = (o.edgeWidth ?? 1) * r.range(0.7, 1.3);
      trace(ctx, deform(base, 1, r));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A soft cast shadow on the ground: a flat cool wash, multiplied. */
export function shadow(ctx, cx, cy, rx, ry, r, strength = 0.2) {
  wash(ctx, ellipse(cx, cy, rx, ry, 10), "shadow", {
    r,
    strength,
    soft: 0.3,
    layers: 10,
    edge: 0,
    glaze: true,
  });
}

/** Lift pigment off again with a wet brush: a pale patch, a highlight. */
export function lift(ctx, pts, r, strength = 0.5, soft = 0.4) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const layers = 8;
  const alpha = 1 - Math.pow(1 - strength, 1 / layers);
  const base = deform(soften(pts, r, soft), 2, r);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let i = 0; i < layers; i++) {
    trace(ctx, deform(base, 2, r));
    ctx.fill();
  }
  ctx.restore();
}

/** An opaque-ish highlight, like a touch of white gouache. */
export function gouache(ctx, pts, r, color = "white", strength = 0.8) {
  wash(ctx, pts, color, { r, strength, soft: 0.12, layers: 6, edge: 0, vary: 0.01 });
}

/**
 * One brush stroke along an open path: stems, grass, hair, straw.
 * `width` is the fattest width, or a function of t.
 */
export function brush(ctx, path, color, o) {
  wash(ctx, ribbon(path, o.width ?? 2), color, {
    layers: 6,
    soft: 0.1,
    strength: 0.8,
    edge: 0.3,
    rounds: 1,
    detail: 1,
    ...o,
  });
}

/** Flecks flicked off the brush. */
export function splatter(ctx, cx, cy, radius, color, o) {
  const r = o.r;
  ctx.save();
  for (let i = 0; i < (o.n ?? 12); i++) {
    const a = r() * TAU;
    const d = radius * Math.sqrt(r());
    const s = (o.size ?? 1.2) * r.range(0.4, 1.4);
    ctx.fillStyle = rgba(vary(color, r, 0.06), r.range(0.25, 0.7) * (o.strength ?? 1));
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      s,
      s * r.range(0.7, 1),
      r() * TAU,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- pencil

/**
 * A loose pencil line through points: slightly off, pressure coming and
 * going, sometimes lifting off the paper. Draw it after the washes, a little
 * out of register with them; that looseness is the storybook look.
 *
 * @param {object} o
 * @param {Function} o.r
 * @param {string} [o.color]  ("ink")
 * @param {number} [o.width]  (1)
 * @param {number} [o.alpha]  (0.7)
 * @param {number} [o.wobble] shake in px (0.5)
 * @param {number} [o.gaps]   chance a stretch is skipped (0.05)
 * @param {boolean} [o.closed]
 * @param {number} [o.passes] (2) a second, fainter pass makes it sketchy
 */
export function pencil(ctx, pts, o) {
  const r = o.r;
  const color = o.color ?? "ink";
  const width = o.width ?? 1;
  const wobble = o.wobble ?? 0.5;
  const closed = o.closed ?? false;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  for (let k = 0; k < (o.passes ?? 2); k++) {
    const shaken = pts.map(([x, y]) => [x + r.gauss() * wobble, y + r.gauss() * wobble]);
    const line = smooth(shaken, 4, closed);
    if (closed) line.push(line[0]);
    const ph = r() * TAU;
    const alpha = (o.alpha ?? 0.7) * (k === 0 ? 1 : 0.45);
    let skip = 0;
    for (let i = 1; i < line.length; i++) {
      if (skip > 0) {
        skip--;
        continue;
      }
      if (r.chance((o.gaps ?? 0.05) / 4)) {
        skip = r.int(1, 3);
        continue;
      }
      const t = i / line.length;
      const press = 0.7 + 0.3 * Math.sin(t * 9 + ph) + r.gauss() * 0.06;
      ctx.strokeStyle = rgba(color, alpha * Math.min(1, 0.6 + press * 0.4));
      ctx.lineWidth = Math.max(0.35, width * press);
      ctx.beginPath();
      ctx.moveTo(line[i - 1][0], line[i - 1][1]);
      ctx.lineTo(line[i][0], line[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A few short pencil hatches inside a box: shading, straw, wood grain. */
export function hatch(ctx, x, y, w, h, angle, o) {
  const r = o.r;
  const n = o.n ?? 5;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    const len = (o.len ?? 5) * r.range(0.6, 1.3);
    pencil(
      ctx,
      [
        [px, py],
        [px + c * len, py + s * len],
      ],
      { passes: 1, alpha: 0.4, width: 0.7, ...o },
    );
  }
}

export { TAU, P };
