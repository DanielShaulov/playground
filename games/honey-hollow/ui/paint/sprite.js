// Paint once, draw many times. A sprite is an offscreen canvas painted at
// device resolution the first time it is asked for, then kept. The screens
// only ever call drawImage on these (or show them as <img>), so the heavy
// watercolour work never runs inside a frame.

import { rng } from "./rng.js";
import { granulate } from "./paper.js";

/**
 * @typedef {object} Sprite
 * @property {HTMLCanvasElement} canvas
 * @property {number} w   width in CSS px
 * @property {number} h   height in CSS px
 * @property {number} ax  anchor, 0..1 across (0.5: centre)
 * @property {number} ay  anchor, 0..1 down (1: feet on the ground)
 * @property {string} key
 */

/**
 * The cache, kept in order of use: a hit moves its key to the end, so the
 * front of the map is whatever was asked for longest ago.
 * @type {Map<string, Sprite>}
 */
const cache = new Map();
const urls = new Map();

/**
 * The cache looks after its own size. Past `BUDGET` bytes of canvas the
 * pieces used longest ago are let go (the beekeeper maker paints a new figure
 * on every tap, about a megabyte each on a 3x phone). A piece that is let go
 * is simply painted again the next time it is asked for; whoever still holds
 * its canvas can go on drawing it.
 */
const BUDGET = 96 * 1024 * 1024;
let held = 0;
const bytes = (/** @type {Sprite} */ s) => s.canvas.width * s.canvas.height * 4;

function evict(/** @type {string} */ keep) {
  for (const [key, s] of cache) {
    if (held <= BUDGET * 0.75) break;
    if (key === keep) continue;
    cache.delete(key);
    urls.delete(key);
    held -= bytes(s);
  }
}

/** Phones report 2 or 3; more than 3 only costs memory. */
export const DPR = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));

/**
 * Get the sprite for `key`, painting it now if this is the first time.
 * `draw(ctx, w, h, r)` paints in CSS px; `r` is an rng seeded from the key,
 * so the same key always gives the same picture.
 *
 * @param {string} key
 * @param {number} w
 * @param {number} h
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number, r: any) => void} draw
 * @param {{ ax?: number, ay?: number, grain?: number, scale?: number }} [o]
 * @returns {Sprite}
 */
export function sprite(key, w, h, draw, o = {}) {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const scale = DPR * (o.scale ?? 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  draw(ctx, w, h, rng(key));
  granulate(ctx, w, h, o.grain ?? 1);
  const s = { canvas, w, h, ax: o.ax ?? 0.5, ay: o.ay ?? 1, key };
  cache.set(key, s);
  held += bytes(s);
  if (held > BUDGET) evict(key);
  return s;
}

/**
 * Draw a sprite with its anchor at (x, y). `k` scales it; `o.rot` leans it
 * about the anchor (flowers swaying); `o.flip` mirrors it; `o.alpha` fades it.
 */
export function put(ctx, s, x, y, k = 1, o) {
  if (!o) {
    ctx.drawImage(s.canvas, x - s.w * s.ax * k, y - s.h * s.ay * k, s.w * k, s.h * k);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.drawImage(s.canvas, -s.w * s.ax * k, -s.h * s.ay * k, s.w * k, s.h * k);
  ctx.restore();
}

/** The sprite as a data URL, for CSS backgrounds and <img>. Cached. */
export function url(s) {
  let u = urls.get(s.key);
  if (!u) {
    u = s.canvas.toDataURL("image/png");
    urls.set(s.key, u);
  }
  return u;
}

/** The sprite as an <img> element `cssWidth` px wide (default: natural). */
export function img(s, cssWidth = s.w, alt = "") {
  const el = document.createElement("img");
  el.src = url(s);
  el.alt = alt;
  el.width = Math.round(cssWidth);
  el.height = Math.round((cssWidth * s.h) / s.w);
  el.draggable = false;
  return el;
}

/**
 * Paint a list of sprites without freezing the page: `jobs` are functions
 * that each paint (or fetch) one sprite. Yields to the browser every ~12 ms
 * and reports progress 0..1, for the loading screen.
 */
export async function paintAll(jobs, onProgress) {
  let last = performance.now();
  for (let i = 0; i < jobs.length; i++) {
    jobs[i]();
    if (performance.now() - last > 12) {
      onProgress?.((i + 1) / jobs.length);
      await new Promise((ok) => setTimeout(ok, 0));
      last = performance.now();
    }
  }
  onProgress?.(1);
}

/**
 * Forget everything (tests, and a change of device pixel ratio). A screen
 * should never need this: the cache trims itself. To let go of a screen's
 * own one-off pieces as it leaves, use `drop`.
 */
export function forget() {
  cache.clear();
  urls.clear();
  held = 0;
}

/**
 * Let go of the pieces whose key `test` accepts (a string is a prefix).
 * @param {string | ((key: string) => boolean)} test
 */
export function drop(test) {
  const hit = typeof test === "string" ? (/** @type {string} */ k) => k.startsWith(test) : test;
  for (const [key, s] of cache) {
    if (!hit(key)) continue;
    cache.delete(key);
    urls.delete(key);
    held -= bytes(s);
  }
}

export function cached() {
  return cache.size;
}

/** Megabytes of canvas the cache holds now (for the gallery and tests). */
export function heldMB() {
  return held / (1024 * 1024);
}
