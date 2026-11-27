// The paper the interface is made of: buttons, cards, the bottom sheet's torn
// edge, chips, the ribbon banner, speech bubbles, meters, the title lettering.
// The interface itself is DOM (real buttons, real text); these are the painted
// backgrounds it wears. ui/chrome.js turns them into CSS, ui/base.css uses them.
//
// A piece that has to grow with its content is painted once at a middling
// size and cut in nine: four corners that never stretch and a middle that
// REPEATS (border-image "round"), so a wide button is a longer wash, not a
// smeared one. `loop` below is what lets the middle repeat without a seam.

import { sprite, put, DPR } from "../paint/sprite.js";
import {
  wash,
  brush,
  pencil,
  splatter,
  ellipse,
  blob,
  rect,
  roundRect,
  smooth,
  resample,
  leaf,
  TAU,
} from "../paint/wash.js";
import { rgba } from "../paint/palette.js";
import { bee } from "./bee.js";

// Interface paper is soft, and every piece has to become a data URL before
// CSS can use it, so it is painted at 1.5× at most. Side by side with 2× on
// a 3× phone the difference is a slightly softer pencil, at half the cost.
const SCALE = Math.min(1, 1.5 / DPR);

// ------------------------------------------------------------ the lettering
// The title is lettered in Mali Bold on a canvas, so the face has to be in
// before the first stroke. ui/base.css declares it and ui/main.js waits for
// it before anything is painted; here we only look. (This module must never
// `await` at its top level: it is imported from many places at once, and one
// module that is slow to finish must not be able to leave the others without
// an interface. tests/honey-hollow/core/modules.test.mjs holds that.)

const MALI = "Mali";
/** Is Mali Bold in? If not, the title is lettered in the phone's own rounded face. */
function lettered() {
  try {
    for (const face of document.fonts) {
      if (face.family.replace(/["']/g, "") !== MALI) continue;
      if (face.weight === "700" || face.weight === "bold") return face.status === "loaded";
    }
  } catch {
    // An old browser's font set cannot be walked: letter it plain.
  }
  return false;
}

// ------------------------------------------------------------ small helpers

function trace(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Nudge an outline the way a hand cutting paper would: slow, small, never straight. */
function hand(pts, r, amp = 0.6) {
  const a = r() * TAU;
  const b = r() * TAU;
  return pts.map(([x, y], i) => [
    x + Math.sin(i * 0.61 + a) * amp + r.gauss() * amp * 0.25,
    y + Math.cos(i * 0.47 + b) * amp + r.gauss() * amp * 0.25,
  ]);
}

// A shape that has been resampled already has all the points its edge needs:
// one round of shaking per layer is plenty, and four times cheaper.
const FINE = { rounds: 1, detail: 1 };

/**
 * Drop a second colour into a wash while it is wet: a few soft blots, kept
 * inside the shape. (wash's own `charge` does this with far more layers than
 * a button needs.) `wide` pulls each blot out sideways: on a short piece the
 * colour should change from top to bottom, not from one cap to the other,
 * or the join between the caps and the middle shows.
 */
function run(ctx, r, shape, color, n = 4, strength = 0.3, wide = 1) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of shape) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const rad = Math.min((y1 - y0) * 0.9, (x1 - x0) * 0.3);
  ctx.save();
  trace(ctx, shape);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const cx = r.range(x0, x1);
    const cy = r.range(y0, y1);
    let spot = blob(r, cx, cy, rad * r.range(0.5, 1), 0.25);
    // Long and low, so no blot ends in an edge as tall as the piece.
    if (wide !== 1) spot = spot.map(([x, y]) => [cx + (x - cx) * wide, cy + (y - cy) * 0.5]);
    wash(ctx, spot, color, { r, layers: 3, strength, soft: 0.5, edge: 0 });
  }
  ctx.restore();
}

/**
 * The engine's pencil, cheaper: the same wobble and the same pressure coming
 * and going, but stroked in short runs instead of one segment at a time. An
 * outline all the way round a button is a few dozen strokes, not three hundred.
 */
function sketch(ctx, pts, o) {
  const r = o.r;
  const width = o.width ?? 1;
  const wobble = o.wobble ?? 0.5;
  const closed = o.closed ?? false;
  const RUN = 5;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  for (let k = 0; k < (o.passes ?? 2); k++) {
    const line = smooth(
      pts.map(([x, y]) => [x + r.gauss() * wobble, y + r.gauss() * wobble]),
      4,
      closed,
    );
    if (closed) line.push(line[0]);
    const ph = r() * TAU;
    const alpha = (o.alpha ?? 0.7) * (k === 0 ? 1 : 0.45);
    for (let i = 0; i + 1 < line.length; i += RUN) {
      // Now and then the pencil lifts off the paper for a moment.
      const from = r.chance(o.gaps ?? 0.05) ? i + 2 : i;
      const to = Math.min(i + RUN, line.length - 1);
      if (from >= to) continue;
      const press = 0.7 + 0.3 * Math.sin((i / line.length) * 9 + ph) + r.gauss() * 0.06;
      ctx.strokeStyle = rgba(o.color ?? "ink", alpha * Math.min(1, 0.6 + press * 0.4));
      ctx.lineWidth = Math.max(0.35, width * press);
      ctx.beginPath();
      ctx.moveTo(line[from][0], line[from][1]);
      for (let j = from + 1; j <= to; j++) ctx.lineTo(line[j][0], line[j][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/**
 * Lay down the paper a piece is painted on: opaque, so the meadow never shows
 * through thin paint, with a soft violet shadow underneath it.
 */
function ground(ctx, shape, o = {}) {
  const k = ctx.getTransform().a;
  ctx.save();
  if (o.shadow !== 0) {
    ctx.shadowColor = rgba("shadow", o.shadow ?? 0.42);
    ctx.shadowBlur = (o.blur ?? 4) * k;
    ctx.shadowOffsetY = (o.drop ?? 2.5) * k;
  }
  ctx.fillStyle = rgba(o.paper ?? "white", 1);
  trace(ctx, shape);
  ctx.fill();
  ctx.restore();
}

/** A second canvas the size of this one, with the same scale, to paint a layer on. */
function layer(ctx) {
  const c = document.createElement("canvas");
  c.width = ctx.canvas.width;
  c.height = ctx.canvas.height;
  const l = c.getContext("2d");
  l.setTransform(ctx.getTransform());
  return l;
}

// A band of the canvas (device px, `n` long, starting at `from` along the
// axis), lifted off as its own little canvas and faded along its length: its
// weight runs 0→1 when `rising`, 1→0 otherwise.
function band(c, across, from, n, rising) {
  const strip = document.createElement("canvas");
  strip.width = across ? n : c.width;
  strip.height = across ? c.height : n;
  const s = strip.getContext("2d");
  s.drawImage(c, across ? -from : 0, across ? 0 : -from);
  s.globalCompositeOperation = "destination-in";
  s.fillStyle = ramp(s, across, 0, n, rising);
  s.fillRect(0, 0, strip.width, strip.height);
  return strip;
}

function ramp(g, across, at, n, rising) {
  const grad = across
    ? g.createLinearGradient(at, 0, at + n, 0)
    : g.createLinearGradient(0, at, 0, at + n);
  grad.addColorStop(0, `rgba(0,0,0,${rising ? 0 : 1})`);
  grad.addColorStop(1, `rgba(0,0,0,${rising ? 1 : 0})`);
  return grad;
}

// Dissolve a faded band into the canvas at `at`: what is there keeps
// whatever weight the band does not take.
function blend(ctx, strip, across, at, n, rising) {
  const x = across ? at : 0;
  const y = across ? 0 : at;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, strip.width, strip.height);
  ctx.clip();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = ramp(ctx, across, at, n, rising);
  ctx.fillRect(x, y, strip.width, strip.height);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(strip, x, y);
  ctx.restore();
}

/**
 * Make the middle of a painted piece repeat without a seam along one axis.
 * `a` and `b` are the caps (CSS px) at the start and end of that axis. The
 * last `blend` px of the middle dissolve into what comes just before the
 * middle, and the first `blend` px of the far cap dissolve out of the start
 * of the middle, so middle follows middle, and the far cap follows either.
 * Both caps must be at least `blend` longer than the corner they hold.
 */
function loop(ctx, axis, a, b, soft = 8) {
  const c = ctx.canvas;
  const k = ctx.getTransform().a;
  const across = axis === "x";
  const lo = Math.round(a * k);
  const hi = (across ? c.width : c.height) - Math.round(b * k);
  const n = Math.round(soft * k);
  if (hi - lo < n || lo < n) return;
  // Lift both borrowed bands off before either blend changes the canvas.
  const before = band(c, across, lo - n, n, true);
  const start = band(c, across, lo, n, false);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  blend(ctx, before, across, hi - n, n, true);
  blend(ctx, start, across, hi, n, false);
  ctx.restore();
}

/**
 * Paint a strip that repeats sideways for ever (a torn edge, a pencil rule):
 * `paint(ctx, w + 2 * margin, h)` paints it too long, the middle is made to
 * loop, and only the middle is kept.
 */
function strip(ctx, w, h, paint, margin = 12) {
  const k = ctx.getTransform().a;
  const c = document.createElement("canvas");
  c.width = Math.ceil((w + margin * 2) * k);
  c.height = ctx.canvas.height;
  const l = c.getContext("2d");
  l.scale(k, k);
  paint(l, w + margin * 2, h);
  loop(l, "x", margin, margin, margin - 2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, -Math.round(margin * k), 0);
  ctx.restore();
}

// ------------------------------------------------------------ the pieces
// Every painter gets (ctx, w, h, r, box) where box = [x, y, w, h] is the part
// of the sprite the DOM element's own box covers; the rest is spill (shadow,
// a ragged edge) that hangs outside the element.

/** A painted button: paper, one wash with a second colour run in, pencil. */
function button(ctx, r, [x, y, w, h], o) {
  const rad = o.rad ?? 15;
  const shape = hand(resample(roundRect(x, y, w, h, rad), 6), r, 0.5);
  ground(ctx, shape, { shadow: 0.5, blur: 3.5, drop: 2.6 });
  wash(ctx, shape, o.color, { r, layers: 5, strength: o.strength ?? 0.93, soft: 0.05, ...FINE });
  run(ctx, r, shape, o.charge, o.runs ?? 4, o.run ?? 0.32, o.wide);
  // Pigment settles along the bottom; the top keeps the light.
  wash(ctx, resample(roundRect(x + 4, y + h - 10, w - 8, 8.5, 6), 8), o.pool, {
    r,
    layers: 3,
    strength: o.deep ?? 0.2,
    soft: 0.4,
    edge: 0,
    ...FINE,
  });
  if (o.shine !== 0)
    wash(ctx, resample(roundRect(x + 7, y + 3.5, w - 14, 6, 3), 8), "white", {
      r,
      layers: 3,
      strength: o.shine ?? 0.22,
      soft: 0.5,
      edge: 0,
      ...FINE,
    });
  sketch(ctx, resample(roundRect(x + 0.7, y - 0.3, w - 0.6, h + 0.2, rad), 10), {
    r,
    closed: true,
    alpha: o.line ?? 0.5,
    width: 0.95,
    gaps: 0.06,
    wobble: 0.45,
  });
}

/** Deckle-edged paper: a card. The edge is torn, not cut, so it gets no pencil. */
function deckle(ctx, r, [x, y, w, h], o = {}) {
  const torn = resample(roundRect(x, y, w, h, o.rad ?? 5), 3.2).map(([px, py]) => [
    px + r.gauss() * (o.tear ?? 0.55),
    py + r.gauss() * (o.tear ?? 0.55),
  ]);
  ground(ctx, torn, { shadow: o.shadow ?? 0.4, blur: o.blur ?? 5, drop: o.drop ?? 3 });
  // The faintest warm wash, so the card is paper and not a white box.
  const inner = resample(roundRect(x + 2, y + 2, w - 4, h - 4, 6), 10);
  wash(ctx, inner, o.tint ?? "cream", {
    r,
    layers: 5,
    strength: o.strength ?? 0.3,
    soft: 0.2,
    edge: 0.4,
    ...FINE,
  });
  run(ctx, r, inner, o.charge ?? "white", 4, 0.5);
}

/** A slip of cut paper: straight-ish edges, small corners, a faint pencil. */
function slip(ctx, r, [x, y, w, h], o = {}) {
  const shape = hand(resample(roundRect(x, y, w, h, o.rad ?? 3), 6), r, 0.45);
  ground(ctx, shape, { shadow: o.shadow ?? 0.45, blur: 4, drop: 2.5, paper: "white" });
  wash(ctx, shape, o.tint ?? "cream", {
    r,
    layers: 5,
    strength: o.strength ?? 0.5,
    soft: 0.06,
    edge: 0.5,
    ...FINE,
  });
  run(ctx, r, shape, o.charge ?? "white", 4, 0.45);
  if (o.line)
    sketch(ctx, resample(roundRect(x + 0.5, y - 0.3, w - 0.4, h + 0.3, o.rad ?? 3), 15), {
      r,
      closed: true,
      alpha: o.line,
      width: 0.8,
      gaps: 0.12,
    });
}

/** A pill: chips and the count badge. */
function pill(ctx, r, [x, y, w, h], o) {
  const rad = h / 2 - 0.5;
  const shape = hand(resample(roundRect(x, y, w, h, rad), 4.5), r, 0.3);
  ground(ctx, shape, { shadow: o.shadow ?? 0.34, blur: 2.4, drop: 1.4 });
  wash(ctx, shape, o.color, { r, layers: 6, strength: o.strength ?? 0.88, soft: 0.05, ...FINE });
  run(ctx, r, shape, o.charge, 4, 0.26, o.wide ?? 2.6);
  if (o.line)
    sketch(ctx, resample(roundRect(x + 0.4, y - 0.2, w, h, rad), 7), {
      r,
      closed: true,
      alpha: o.line,
      width: 0.8,
      gaps: 0.08,
      wobble: 0.3,
    });
}

/** A round button face (close, the stepper's minus and plus). */
function round(ctx, r, [x, y, w, h], o) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const shape = hand(ellipse(cx, cy, w / 2, h / 2, 26), r, 0.35);
  ground(ctx, shape, { shadow: 0.46, blur: 3, drop: 2.2 });
  wash(ctx, shape, o.color, { r, layers: 6, strength: o.strength ?? 0.9, soft: 0.05, ...FINE });
  run(ctx, r, shape, o.charge, 3, 0.35);
  wash(ctx, ellipse(cx + 1, cy + h * 0.26, w * 0.34, h * 0.16, 10), o.pool, {
    r,
    layers: 5,
    strength: 0.16,
    soft: 0.35,
    edge: 0,
  });
  sketch(ctx, ellipse(cx + 0.5, cy - 0.3, w / 2, h / 2, 14), {
    r,
    closed: true,
    alpha: o.line ?? 0.55,
    width: 0.95,
    gaps: 0.06,
    wobble: 0.4,
  });
}

/** A speech bubble's body: white paper, a clear pencil edge. */
function bubble(ctx, r, [x, y, w, h]) {
  const shape = hand(resample(roundRect(x, y, w, h, 17), 6), r, 0.7);
  ground(ctx, shape, { shadow: 0.36, blur: 3.5, drop: 2.5 });
  wash(ctx, shape, "white", { r, layers: 4, strength: 0.6, soft: 0.06, edge: 0.3, ...FINE });
  run(ctx, r, shape, "cream", 3, 0.3);
  sketch(ctx, resample(roundRect(x + 0.5, y - 0.4, w, h, 17), 10), {
    r,
    closed: true,
    alpha: 0.6,
    width: 1,
    gaps: 0.05,
  });
}

/** The bubble's tail, hung below its bottom edge and covering the pencil there. */
function tail(ctx, w, h, r) {
  const tip = [w * 0.28, h - 2.5];
  const shape = smooth(
    [[2, 0], [w - 2, 0], [w - 3, 5], [w * 0.62, 8], tip, [w * 0.3, 7], [3, 5]],
    4,
  );
  ground(ctx, shape, { shadow: 0.3, blur: 2.5, drop: 2 });
  // Rub out the shadow where the tail joins the bubble.
  ctx.fillStyle = rgba("white", 1);
  ctx.fillRect(2.5, 0, w - 5, 5.5);
  pencil(ctx, [[1.5, 4.6], [w * 0.24, 8], tip], { r, alpha: 0.6, width: 1 });
  pencil(ctx, [tip, [w * 0.6, 8.6], [w - 1.5, 4.6]], { r, alpha: 0.6, width: 1 });
}

/** A show ribbon for titles: a band with two folded tails. */
function banner(ctx, r, [x, y, w, h], o) {
  const fold = 17; // how far each tail sticks out past the band
  const drop = 7; // how far the tails hang below it
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? x : x + w;
    const tailShape = hand(
      [
        [x0 - side * 26, y + drop],
        [x0 + side * fold, y + drop + 0.5],
        [x0 + side * (fold - 8), y + drop + h / 2],
        [x0 + side * fold, y + drop + h - 0.5],
        [x0 - side * 26, y + drop + h],
      ],
      r,
      0.4,
    );
    ground(ctx, tailShape, { shadow: 0 });
    wash(ctx, tailShape, o.deep, { r, layers: 6, strength: 0.9, soft: 0.04, rounds: 1 });
    sketch(ctx, tailShape, { r, closed: true, alpha: 0.45, width: 0.85, gaps: 0.1 });
  }
  const band = hand(resample(roundRect(x, y, w, h, 2.5), 6), r, 0.5);
  ground(ctx, band, { shadow: 0.42, blur: 3, drop: 2.2 });
  wash(ctx, band, o.color, { r, layers: 6, strength: 0.92, soft: 0.05, ...FINE });
  run(ctx, r, band, o.charge, 5, 0.34);
  // The little dark triangles where the band folds back into its tails.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? x : x + w;
    const tuck = [
      [x0, y + h - 0.5],
      [x0 - side * 9, y + h - 0.5],
      [x0 - side * 9, y + h + drop],
    ];
    wash(ctx, tuck, o.dark, { r, layers: 6, strength: 0.9, soft: 0.05, rounds: 1 });
    sketch(ctx, tuck, { r, closed: true, alpha: 0.4, width: 0.7, passes: 1 });
  }
  // Two rows of stitches: 8 px apart, so they keep step where the band repeats.
  ctx.save();
  ctx.strokeStyle = rgba("white", 0.9);
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.setLineDash([3.4, 4.6]);
  for (const yy of [y + 5, y + h - 5]) {
    ctx.beginPath();
    ctx.moveTo(x + 8, yy);
    ctx.lineTo(x + w - 7, yy + 0.3);
    ctx.stroke();
  }
  ctx.restore();
  sketch(ctx, resample(roundRect(x + 0.5, y - 0.3, w, h, 2.5), 14), {
    r,
    closed: true,
    alpha: 0.5,
    width: 0.9,
    gaps: 0.08,
  });
}

/** The meter's empty trough: a hand-drawn bar. */
function trough(ctx, r, [x, y, w, h]) {
  const shape = hand(resample(roundRect(x, y, w, h, h / 2 - 0.5), 5), r, 0.3);
  ground(ctx, shape, { shadow: 0.25, blur: 1.5, drop: 1 });
  wash(ctx, shape, "paperShade", {
    r,
    layers: 6,
    strength: 0.75,
    soft: 0.05,
    edge: 0.6,
    ...FINE,
  });
  // The shade under the trough's top lip.
  wash(ctx, resample(roundRect(x + 4, y + 1.5, w - 8, 4, 2), 7), "soil", {
    r,
    layers: 4,
    strength: 0.2,
    soft: 0.4,
    edge: 0,
    ...FINE,
  });
  sketch(ctx, resample(roundRect(x + 0.4, y - 0.2, w, h, h / 2 - 0.5), 8), {
    r,
    closed: true,
    alpha: 0.6,
    width: 0.95,
    gaps: 0.05,
    wobble: 0.35,
  });
}

/**
 * What fills a meter: one long stroke of a loaded brush, ragged where it
 * stops. It is painted full length and the meter shows its right-hand end, so
 * the stroke is never stretched.
 */
function fill(ctx, w, h, r, o) {
  const top = [];
  const bottom = [];
  for (let x = 5; x <= w - 6; x += 9) {
    top.push([x, 1.1 + Math.sin(x * 0.07) * 0.35]);
    bottom.unshift([x, h - 1 + Math.cos(x * 0.06) * 0.35]);
  }
  const shape = [
    [1.5, h / 2],
    ...top,
    [w - 1.2, 3.2],
    [w - 2.6, h / 2 + 0.6],
    [w - 0.8, h - 3.2],
    ...bottom,
  ];
  wash(ctx, shape, o.color, { r, layers: 6, strength: 0.95, soft: 0.05, ...FINE });
  run(ctx, r, shape, o.charge, 8, 0.24);
  wash(ctx, resample(roundRect(5, 2, w - 11, 2.6, 1.3), 8), "white", {
    r,
    layers: 3,
    strength: 0.36,
    soft: 0.5,
    edge: 0,
    ...FINE,
  });
}

/** A sprig: a stem with paired leaves and a few buds. Dividers and the title. */
function sprig(ctx, r, x0, y0, len, angle, o = {}) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const bow = o.bow ?? 0.12;
  const at = (t, off = 0) => {
    const u = t * len;
    const v = Math.sin(t * Math.PI) * len * bow + off;
    return [x0 + u * c - v * s, y0 + u * s + v * c];
  };
  const stemPts = [];
  for (let i = 0; i <= 8; i++) stemPts.push(at(i / 8));
  brush(ctx, stemPts, "leaf", { r, width: o.stem ?? 1.3, strength: 0.85 });
  const pairs = o.pairs ?? 4;
  for (let i = 0; i < pairs; i++) {
    const t = 0.12 + (i / pairs) * 0.62;
    const [px, py] = at(t);
    const size = (o.leaf ?? 7) * (1 - i * 0.09);
    for (const side of [-1, 1]) {
      const a = angle + side * (0.75 + r.gauss() * 0.08);
      wash(ctx, leaf(px, py, size, size * 0.46, a), r.pick(["sap", "leaf", "sage"]), {
        r,
        layers: 5,
        strength: 0.82,
        soft: 0.14,
        rounds: 1,
        detail: 1,
      });
    }
  }
  for (let i = 0; i < (o.buds ?? 5); i++) {
    const t = 0.8 + (i / (o.buds ?? 5)) * 0.24;
    const [px, py] = at(Math.min(1.02, t), (i % 2 ? 1 : -1) * 1.5);
    wash(ctx, ellipse(px, py, 1.9, 1.6, 7), r.pick(o.tones ?? ["lavender", "violet", "lilac"]), {
      r,
      layers: 5,
      strength: 0.85,
      soft: 0.15,
      rounds: 1,
      detail: 1,
    });
  }
}

// ------------------------------------------------------------ the catalogue

const WASHES = {
  primary: { color: "honey", charge: "dandelion", pool: "amber", line: 0.5 },
  secondary: {
    color: "cream",
    charge: "white",
    pool: "straw",
    strength: 0.8,
    run: 0.5,
    deep: 0.16,
    shine: 0,
    line: 0.62,
  },
  danger: { color: "rose", charge: "blush", pool: "clover", strength: 0.9, deep: 0.26, line: 0.5 },
  leaf: { color: "meadow", charge: "mint", pool: "leaf", deep: 0.26, line: 0.5 },
};

// One button shape in each of its washes: `${prefix}-primary` and so on.
function buttons(prefix, geometry, rad, runs, wide) {
  const out = {};
  for (const [name, tones] of Object.entries(WASHES))
    out[`${prefix}-${name}`] = {
      ...geometry,
      paint: (c, r, b) => button(c, r, b, { ...tones, rad, runs, wide }),
    };
  return out;
}

/** How long a meter's fill is painted: as wide as the widest phone's meter. */
export const FILL_W = 420;

/**
 * name → { w, h, out, slice, repeat, paint }
 *   w, h    sprite size, CSS px
 *   out     [top, right, bottom, left]: paint that hangs outside the element
 *   slice   [top, right, bottom, left]: the caps of a nine-slice (absent: a
 *           plain picture, or a strip that repeats sideways when `repeat`).
 *           An element must be at least as big as its caps less its `out`,
 *           or the browser shrinks the caps to fit (base.css sets the minimums).
 *   stretch the middle is plain enough to stretch rather than repeat
 */
const PIECES = {
  ...buttons("btn", { w: 156, h: 58, out: [3, 4, 7, 4], slice: [23, 30, 26, 30] }, 15, 4),
  // The 44 px button is painted at its own size, so a short one is not a
  // big one squeezed.
  ...buttons(
    "btn-small",
    { w: 84, h: 53, out: [3, 4, 6, 4], slice: [21, 25, 23, 25], blend: 6 },
    13,
    4,
    2.4,
  ),
  round: {
    w: 52,
    h: 54,
    out: [3, 4, 7, 4],
    slice: "half",
    paint: (c, r, b) => round(c, r, b, { color: "cream", charge: "white", pool: "straw" }),
  },
  "round-honey": {
    w: 52,
    h: 54,
    out: [3, 4, 7, 4],
    slice: "half",
    paint: (c, r, b) => round(c, r, b, { color: "honey", charge: "dandelion", pool: "amber" }),
  },
  card: {
    w: 140,
    h: 146,
    scale: 0.75,
    out: [6, 8, 12, 8],
    slice: [32, 34, 38, 34],
    blend: 12,
    paint: (c, r, b) => deckle(c, r, b),
  },
  "card-tint": {
    w: 140,
    h: 146,
    scale: 0.75,
    out: [6, 8, 12, 8],
    slice: [32, 34, 38, 34],
    blend: 12,
    paint: (c, r, b) => deckle(c, r, b, { tint: "butter", charge: "cream", strength: 0.5 }),
  },
  toast: {
    w: 128,
    h: 64,
    out: [4, 6, 9, 6],
    slice: [22, 26, 26, 26],
    paint: (c, r, b) => slip(c, r, b, { tint: "cream", strength: 0.55, line: 0.4 }),
  },
  note: {
    w: 140,
    h: 88,
    out: [4, 6, 10, 6],
    slice: [26, 28, 30, 28],
    paint: (c, r, b) =>
      slip(c, r, b, { tint: "butter", charge: "cream", strength: 0.72, line: 0.3 }),
  },
  bubble: {
    w: 116,
    h: 74,
    out: [3, 4, 7, 4],
    slice: [27, 32, 30, 32],
    paint: (c, r, b) => bubble(c, r, b),
  },
  "bubble-tail": { w: 26, h: 20, paint: (c, r, b, w, h) => tail(c, w, h, r) },
  banner: {
    w: 236,
    h: 62,
    out: [4, 20, 14, 20],
    slice: [28, 66, 30, 66],
    blend: 18,
    paint: (c, r, b) =>
      banner(c, r, b, { color: "rose", charge: "blush", deep: "clover", dark: "heather" }),
  },
  "banner-honey": {
    w: 236,
    h: 62,
    out: [4, 20, 14, 20],
    slice: [28, 66, 30, 66],
    blend: 18,
    paint: (c, r, b) =>
      banner(c, r, b, { color: "butter", charge: "dandelion", deep: "honey", dark: "amber" }),
  },
  chip: {
    w: 76,
    h: 36,
    out: [2, 3, 4, 3],
    slice: [17, 24, 18, 24],
    blend: 6,
    paint: (c, r, b) =>
      pill(c, r, b, { color: "cream", charge: "white", strength: 0.7, line: 0.5 }),
  },
  "chip-honey": {
    w: 76,
    h: 36,
    out: [2, 3, 4, 3],
    slice: [17, 24, 18, 24],
    blend: 6,
    paint: (c, r, b) => pill(c, r, b, { color: "butter", charge: "dandelion", line: 0.45 }),
  },
  "chip-leaf": {
    w: 76,
    h: 36,
    out: [2, 3, 4, 3],
    slice: [17, 24, 18, 24],
    blend: 6,
    paint: (c, r, b) => pill(c, r, b, { color: "meadow", charge: "mint", line: 0.45 }),
  },
  "chip-sky": {
    w: 76,
    h: 36,
    out: [2, 3, 4, 3],
    slice: [17, 24, 18, 24],
    blend: 6,
    paint: (c, r, b) => pill(c, r, b, { color: "sky", charge: "white", line: 0.45 }),
  },
  "chip-rose": {
    w: 76,
    h: 36,
    out: [2, 3, 4, 3],
    slice: [17, 24, 18, 24],
    blend: 6,
    paint: (c, r, b) => pill(c, r, b, { color: "blush", charge: "rose", line: 0.45 }),
  },
  // A count. Its caps are the whole round, so one digit is a circle; the
  // middle is plain colour and may simply stretch.
  badge: {
    w: 38,
    h: 27,
    out: [1, 2, 4, 2],
    slice: [13, 13, 14, 13],
    stretch: true,
    paint: (c, r, b) =>
      pill(c, r, b, { color: "poppy", charge: "terracotta", strength: 0.92, shadow: 0.4 }),
  },
  // The "something new" dot.
  dot: {
    w: 16,
    h: 16,
    paint: (ctx, r, b, w, h) => {
      const shape = ellipse(w / 2, h / 2 - 0.5, 5.2, 5.2, 12);
      ground(ctx, shape, { shadow: 0.4, blur: 1.6, drop: 1 });
      wash(ctx, shape, "poppy", {
        r,
        layers: 8,
        strength: 0.92,
        soft: 0.04,
        rounds: 1,
        charge: { color: "terracotta", n: 2, strength: 0.3 },
      });
    },
  },
  meter: {
    w: 84,
    h: 23,
    out: [1, 2, 4, 2],
    slice: [11, 22, 12, 22],
    blend: 6,
    paint: (c, r, b) => trough(c, r, b),
  },
  "fill-honey": {
    w: FILL_W,
    h: 12,
    scale: 0.75,
    paint: (c, r, b, w, h) => fill(c, w, h, r, { color: "honey", charge: "dandelion" }),
  },
  "fill-leaf": {
    w: FILL_W,
    h: 12,
    scale: 0.75,
    paint: (c, r, b, w, h) => fill(c, w, h, r, { color: "sap", charge: "meadow" }),
  },
  "fill-rose": {
    w: FILL_W,
    h: 12,
    scale: 0.75,
    paint: (c, r, b, w, h) => fill(c, w, h, r, { color: "clover", charge: "rose" }),
  },
  // The marker tick on a meter: a pencil stroke with a little flag.
  mark: {
    w: 12,
    h: 30,
    paint: (ctx, r, b, w, h) => {
      wash(
        ctx,
        [
          [w / 2 - 4, 1.5],
          [w / 2 + 4, 1.5],
          [w / 2, 8],
        ],
        "chestnut",
        { r, layers: 6, strength: 0.9, soft: 0.06, rounds: 1, detail: 1 },
      );
      pencil(
        ctx,
        [
          [w / 2, 5],
          [w / 2 + 0.3, h / 2],
          [w / 2 - 0.2, h - 2],
        ],
        { r, alpha: 0.85, width: 1.5, wobble: 0.25 },
      );
    },
  },
  // The blot behind the tab you are on.
  blot: {
    w: 60,
    h: 42,
    paint: (ctx, r, b, w, h) => {
      wash(ctx, blob(r, w / 2, h / 2, 19, 0.12, 11, 0.74), "butter", {
        r,
        layers: 10,
        strength: 0.95,
        soft: 0.2,
        charge: { color: "dandelion", n: 4, strength: 0.5 },
      });
      splatter(ctx, w / 2, h / 2, 26, "honey", { r, n: 6, size: 0.9, strength: 0.8 });
    },
  },
  // The grab handle on top of a sheet: two pencil strokes.
  handle: {
    w: 48,
    h: 12,
    paint: (ctx, r, b, w, h) => {
      for (const y of [4, 7.5])
        pencil(
          ctx,
          [
            [6, y],
            [w / 2, y + 0.4],
            [w - 6, y],
          ],
          { r, color: "inkSoft", alpha: 0.6, width: 1.3, wobble: 0.3 },
        );
    },
  },
  // A strip of washi tape, a little see-through, with pinked ends.
  tape: {
    w: 64,
    h: 24,
    paint: (ctx, r, b, w, h) => {
      const pts = [];
      const y0 = 4;
      const y1 = h - 5;
      pts.push([4, y0], [w / 2, y0 - 0.4], [w - 4, y0]);
      for (let i = 0; i <= 4; i++) pts.push([w - 4 - (i % 2 ? 0 : 2.4), y0 + ((y1 - y0) * i) / 4]);
      pts.push([w / 2, y1 + 0.4], [4, y1]);
      for (let i = 4; i >= 0; i--) pts.push([4 + (i % 2 ? 0 : 2.4), y0 + ((y1 - y0) * i) / 4]);
      wash(ctx, pts, "rose", { r, layers: 10, strength: 0.78, soft: 0.03, rounds: 1 });
      for (let x = 10; x < w - 8; x += 7.5) {
        wash(ctx, ellipse(x + r.gauss() * 0.4, h / 2 - 0.5, 1.5, 1.5, 7), "white", {
          r,
          layers: 4,
          strength: 0.8,
          soft: 0.1,
          rounds: 1,
          detail: 1,
          edge: 0,
        });
      }
    },
  },
  // A pencil rule that repeats sideways.
  rule: {
    w: 120,
    h: 6,
    repeat: true,
    paint: (ctx, r, b, w, h) =>
      strip(ctx, w, h, (l, lw) => {
        const pts = [];
        for (let x = -4; x <= lw + 4; x += 12) pts.push([x, h / 2 + Math.sin(x * 0.11) * 0.5]);
        pencil(l, pts, { r, color: "inkSoft", alpha: 0.5, width: 0.9, gaps: 0.12, wobble: 0.3 });
      }),
  },
  // The little sprig in the middle of a divider.
  sprig: {
    w: 64,
    h: 24,
    paint: (ctx, r, b, w, h) => {
      sprig(ctx, r, w / 2 - 1, h / 2 + 3, 26, -0.16, { pairs: 3, leaf: 6.5 });
      sprig(ctx, r, w / 2 + 1, h / 2 + 3, 26, Math.PI + 0.16, { pairs: 3, leaf: 6.5, bow: -0.12 });
      wash(ctx, ellipse(w / 2, h / 2 + 3, 2.6, 2.4, 8), "honey", { r, layers: 6, strength: 0.9 });
    },
  },
  // The torn top edge of a sheet of paper, with the shadow it throws upward.
  "sheet-edge": {
    w: 192,
    h: 26,
    repeat: true,
    grain: 0.82,
    paint: (ctx, r, b, w, h) =>
      strip(ctx, w, h, (l, lw) => {
        const edge = [];
        for (let x = -6; x <= lw + 6; x += 3.4)
          edge.push([x, 14 + Math.sin(x * 0.045) * 1.4 + r.gauss() * 0.6]);
        const shape = [...edge, [lw + 6, h + 4], [-6, h + 4]];
        const k = l.getTransform().a;
        l.save();
        l.shadowColor = rgba("shadow", 0.5);
        l.shadowBlur = 6 * k;
        l.shadowOffsetY = -2 * k;
        l.fillStyle = rgba("paper", 1);
        trace(l, shape);
        l.fill();
        l.restore();
        // The torn fibres catch the light.
        pencil(l, shift(edge, 0, 1.1), {
          r,
          color: "white",
          alpha: 0.9,
          width: 1.6,
          passes: 1,
          wobble: 0.2,
          gaps: 0,
        });
      }),
  },
};

function boxOf(p) {
  const [t, rt, bt, l] = p.out ?? [0, 0, 0, 0];
  return [l, t, p.w - l - rt, p.h - t - bt];
}

/** Every piece's name. */
export const PIECE_NAMES = Object.keys(PIECES);

/**
 * A painted piece of interface.
 * @param {string} name one of PIECE_NAMES
 * @returns {{ sprite: import("../paint/sprite.js").Sprite, w: number, h: number,
 *   out: number[], slice: number[] | "half" | undefined, stretch: boolean, repeat: boolean }}
 */
export function piece(name) {
  const p = PIECES[name];
  if (!p) throw new Error(`no interface piece called "${name}"`);
  const s = sprite(
    `chrome-${name}`,
    p.w,
    p.h,
    (ctx, w, h, r) => {
      p.paint(ctx, r, boxOf(p), w, h);
      if (Array.isArray(p.slice) && !p.stretch) {
        const [t, rt, bt, l] = p.slice;
        loop(ctx, "x", l, rt, p.blend ?? 8);
        if (h - t - bt >= 2) loop(ctx, "y", t, bt, Math.min(p.blend ?? 8, 4));
      }
    },
    { scale: SCALE * (p.scale ?? 1), ax: 0, ay: 0, grain: p.grain ?? 0.7 },
  );
  return {
    sprite: s,
    w: p.w,
    h: p.h,
    out: p.out ?? [0, 0, 0, 0],
    slice: p.slice,
    stretch: !!p.stretch,
    repeat: !!p.repeat,
  };
}

// ------------------------------------------------------------ paper

/**
 * Paper: one flat cream tone and the grain, as a tile that repeats both ways
 * (it is the grain's own size, so the seams line up). The page, the sheets
 * and the tab bar are all cut from it. Painted at 1×: paper is soft anyway.
 */
export function paperTile() {
  return sprite(
    "chrome-paper",
    192,
    192,
    (ctx, w, h) => {
      ctx.fillStyle = rgba("paper", 1);
      ctx.fillRect(0, 0, w, h);
    },
    { scale: 1 / DPR, ax: 0, ay: 0, grain: 0.82 },
  );
}

// ------------------------------------------------------------ the title

export const LOGO_W = 288;
export const LOGO_H = 176;

// One word, lettered in watercolour: a wash seen through the letters as a
// stencil, then the pencil a little out of register.
function word(ctx, r, text, x, y, size, rot, tones) {
  const font = `700 ${size}px ${MALI}, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
  const set = (g) => {
    g.translate(x, y);
    g.rotate(rot);
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.lineJoin = g.lineCap = "round";
  };
  // The stencil: a few faint passes a hair apart, so the letters' edges are
  // soft and uneven the way a wash's are.
  const stencil = layer(ctx);
  set(stencil);
  for (let i = 0; i < 7; i++) {
    stencil.globalAlpha = 0.42;
    stencil.fillText(text, r.gauss() * 0.55, r.gauss() * 0.55);
  }
  const paint = layer(ctx);
  ctx.save();
  set(ctx);
  const wide = ctx.measureText(text).width;
  ctx.restore();
  paint.translate(x, y);
  paint.rotate(rot);
  const top = -size * 0.86;
  const tall = size * 1.22;
  const x0 = -wide / 2 - 8;
  const x1 = wide / 2 + 8;
  wash(paint, resample(rect(x0, top, wide + 16, tall), 14), tones[2], {
    r,
    layers: 8,
    strength: 0.97,
    soft: 0.05,
    edge: 0,
    ...FINE,
  });
  run(paint, r, rect(x0, -size * 0.2, wide + 16, size * 0.5), tones[3], 6, 0.3);
  // Honey poured over the top of the letters, running down in slow drips.
  const pour = [
    [x0, top],
    [x1, top],
  ];
  for (let x = x1; x >= x0; x -= size * 0.17) {
    const drip = r.chance(0.3) ? r.range(0.12, 0.26) : r.range(-0.05, 0.06);
    pour.push([x + r.gauss() * 1.5, -size * (0.4 - drip)]);
  }
  const poured = smooth(pour, 5);
  wash(paint, poured, tones[0], {
    r,
    layers: 9,
    strength: 0.96,
    soft: 0.03,
    edge: 1,
    edgeWidth: 1.4,
    ...FINE,
  });
  paint.save();
  trace(paint, poured);
  paint.clip();
  run(paint, r, rect(x0, top, wide + 16, size * 0.7), tones[1], 5, 0.3);
  wash(paint, resample(rect(x0, top, wide + 16, size * 0.24), 14), "butter", {
    r,
    layers: 4,
    strength: 0.3,
    soft: 0.5,
    edge: 0,
    ...FINE,
  });
  paint.restore();
  paint.setTransform(1, 0, 0, 1, 0, 0);
  paint.globalCompositeOperation = "destination-in";
  paint.drawImage(stencil.canvas, 0, 0);
  // The letters' own soft shadow on the page.
  const k = ctx.getTransform().a;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = rgba("shadow", 0.45);
  ctx.shadowBlur = 2.5 * k;
  ctx.shadowOffsetY = 2 * k;
  ctx.drawImage(paint.canvas, 0, 0);
  ctx.restore();
  // Pencil, twice, each a little off.
  for (const [dx, dy, alpha, dash] of [
    [0.9, -0.7, 0.62, [96, 3, 150, 4, 64, 2.5]],
    [-0.5, 0.5, 0.24, [50, 9, 110, 13]],
  ]) {
    ctx.save();
    ctx.translate(dx, dy);
    set(ctx);
    ctx.strokeStyle = rgba("umber", alpha);
    ctx.lineWidth = 0.95;
    ctx.setLineDash(dash);
    ctx.lineDashOffset = r() * 40;
    ctx.strokeText(text, 0, 0);
    ctx.restore();
  }
  return wide;
}

/** The title: "Honey Hollow", painted, with a bee and a sprig. */
export function logo() {
  return sprite(
    `chrome-logo-${lettered() ? "mali" : "plain"}`,
    LOGO_W,
    LOGO_H,
    (ctx, w, h, r) => {
      const gold = ["dandelion", "butter", "honey", "amber"];
      // A pale blot of honey behind the words, like the first wash on the page.
      wash(ctx, blob(r, w * 0.5, h * 0.5, 96, 0.1, 13, 0.56), "butter", {
        r,
        layers: 14,
        strength: 0.5,
        soft: 0.3,
        edge: 0.4,
        charge: { color: "blush", n: 4, strength: 0.22 },
      });
      // The sprigs go down first so the words sit on them.
      sprig(ctx, r, 30, h - 22, 104, -0.1, { pairs: 6, leaf: 12, stem: 1.8, buds: 9 });
      sprig(ctx, r, w - 26, h - 16, 86, Math.PI + 0.14, {
        pairs: 5,
        leaf: 11,
        stem: 1.8,
        bow: -0.12,
        buds: 8,
        tones: ["clover", "rose", "heather"],
      });
      word(ctx, r, "Honey", w * 0.42, 72, 70, -0.07, gold);
      word(ctx, r, "Hollow", w * 0.54, 136, 70, -0.035, gold);
      // The bee, and the looping way it came.
      const path = smooth(
        [
          [w - 78, 58],
          [w - 58, 66],
          [w - 46, 54],
          [w - 56, 44],
          [w - 68, 52],
          [w - 58, 68],
          [w - 36, 62],
          [w - 28, 42],
        ],
        6,
        false,
      );
      for (let i = 0; i + 2 < path.length; i += 4)
        pencil(ctx, [path[i], path[i + 1], path[i + 2]], {
          r,
          alpha: 0.5,
          width: 0.9,
          passes: 1,
          wobble: 0.15,
        });
      put(ctx, bee(0), w - 22, 30, 1.9, { rot: -0.5 });
      splatter(ctx, w * 0.5, h * 0.5, 120, "honey", { r, n: 14, size: 1.2, strength: 0.8 });
    },
    { scale: SCALE, ax: 0.5, ay: 0.5, grain: 0.8 },
  );
}

// ------------------------------------------------------------ gallery

export const GALLERY = [
  { name: "logo", make: logo },
  ...PIECE_NAMES.map((name) => ({ name, make: () => piece(name).sprite })),
  { name: "paper (tile)", make: paperTile, zoom: 0.5 },
];
