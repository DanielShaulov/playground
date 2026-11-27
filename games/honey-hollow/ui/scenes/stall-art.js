// @ts-check
/**
 * The painted pieces the market scenes share, and the small picture helpers
 * the stall, the night card and the year page all use.
 *
 *   paintStage(canvas, { season, look, mood, fair, sign })
 *       the evening picture: sky, grass, the striped stall with your
 *       beekeeper behind the counter. One canvas, redrawn only when one of
 *       those changes; every piece in it is a cached sprite.
 *   productPic(info)   the jar or the made thing for a product
 *   coinTag(n)         a painted coin and an amount
 *   starsPic(n)        the purity stars, small
 *   safe(make)         a sprite, or null if its painter does not know it
 *
 * The stall itself is painted here, with the same tools as ui/art/.
 */

import { el } from "../dom.js";
import { number } from "../words.js";
import { pic } from "../chrome.js";
import { sprite, put, DPR } from "../paint/sprite.js";
import {
  wash,
  pencil,
  shadow,
  brush,
  rect,
  roundRect,
  smooth,
  ellipse,
  resample,
  P,
} from "../paint/wash.js";
import { jar } from "../art/jars.js";
import { good, item, starsBadge } from "../art/goods.js";
import { keeper } from "../art/people.js";
import { skyBand } from "../art/sky.js";
import { ground } from "../art/ground.js";

/** The picture's own units: 8 wide to 5 high. CSS fits it to the phone. */
export const STAGE_W = 320;
export const STAGE_H = 200;

const BOOTH_W = 210;
const BOOTH_H = 190;
const COUNTER_H = 92;

/** A sprite, or null when its painter throws (an id the art does not know). */
export function safe(make) {
  try {
    return make() ?? null;
  } catch {
    return null;
  }
}

/** The posts and the striped awning: everything that stands behind the beekeeper. */
export function boothBack() {
  return sprite(
    "stall-booth-back-2",
    BOOTH_W,
    BOOTH_H,
    (ctx, w, h, r) => {
      for (const x of [25, 178]) {
        const post = resample(roundRect(x, 44, 7, 140, 2), 10);
        wash(ctx, post, "wood", {
          r,
          layers: 8,
          strength: 0.9,
          soft: 0.06,
          charge: { color: "bark", n: 2, strength: 0.25 },
        });
        pencil(ctx, post, { r, closed: true, alpha: 0.5, width: 0.9, gaps: 0.1 });
      }
      // A rail under the awning, and the cool shade it throws.
      wash(ctx, resample(rect(30, 58, 150, 4), 10), "bark", {
        r,
        layers: 5,
        strength: 0.5,
        soft: 0.1,
      });
      wash(ctx, resample(rect(22, 60, 166, 14), 10), "shadow", {
        r,
        layers: 4,
        strength: 0.22,
        soft: 0.5,
        edge: 0,
        glaze: true,
      });
      // The awning: nine stripes, each ending in a scallop.
      const n = 9;
      const top = [34, 176];
      const bot = [7, 203];
      const yT = 12;
      const yB = 50;
      const at = (edge, t) => edge[0] + (edge[1] - edge[0]) * t;
      for (let i = 0; i < n; i++) {
        const a = i / n;
        const b = (i + 1) / n;
        const red = i % 2 === 0;
        const quad = [
          [at(top, a), yT],
          [at(top, b), yT],
          [at(bot, b), yB],
          [at(bot, a), yB],
        ];
        wash(ctx, resample(quad, 8), red ? "poppy" : "cream", {
          r,
          layers: 8,
          strength: red ? 0.86 : 0.94,
          soft: 0.05,
          edge: 0.3,
          charge: { color: red ? "apricot" : "white", n: 2, strength: 0.3 },
        });
        const x0 = at(bot, a);
        const x1 = at(bot, b);
        const drop = [
          [x0 + 0.5, yB - 1],
          [x1 - 0.5, yB - 1],
          [x1 - 1, yB + 7],
          [(x0 + x1) / 2, yB + 12.5],
          [x0 + 1, yB + 7],
        ];
        wash(ctx, smooth(drop, 4), red ? "poppy" : "cream", {
          r,
          layers: 6,
          strength: red ? 0.84 : 0.94,
          soft: 0.06,
          edge: 0.4,
        });
        pencil(ctx, smooth(drop.slice(1), 4, false), { r, alpha: 0.4, width: 0.7, gaps: 0.12 });
      }
      pencil(
        ctx,
        resample(
          [
            [bot[0], yB],
            [top[0], yT],
            [top[1], yT],
            [bot[1], yB],
          ],
          10,
        ).slice(0, -5),
        { r, alpha: 0.45, width: 0.9, gaps: 0.08, wobble: 0.35 },
      );
    },
    { ax: 0, ay: 0 },
  );
}

/** The counter: everything that stands in front of the beekeeper. */
export function counter(sign) {
  return sprite(
    `stall-counter-${sign}`,
    BOOTH_W,
    COUNTER_H,
    (ctx, w, h, r) => {
      shadow(ctx, w / 2, h - 5, 94, 5, r, 0.26);
      const front = resample(roundRect(21, 38, 168, 48, 3), 10);
      wash(ctx, front, "straw", {
        r,
        layers: 10,
        strength: 0.92,
        soft: 0.05,
        charge: { color: "wood", n: 3, strength: 0.24 },
      });
      for (const x of [62, 148])
        pencil(
          ctx,
          [
            [x, 42],
            [x + 0.8, 84],
          ],
          { r, alpha: 0.3, width: 0.8, gaps: 0.2 },
        );
      pencil(ctx, front, { r, closed: true, alpha: 0.5, width: 0.9, gaps: 0.08 });
      const top = resample(roundRect(11, 30, 188, 10, 4), 10);
      wash(ctx, top, "wood", {
        r,
        layers: 10,
        strength: 0.93,
        soft: 0.05,
        charge: { color: "bark", n: 2, strength: 0.25 },
      });
      pencil(ctx, top, { r, closed: true, alpha: 0.55, width: 0.9 });
      // The little board with the stall's name on it.
      const board = resample(roundRect(72, 48, 66, 25, 5), 8);
      wash(ctx, board, "cream", {
        r,
        layers: 8,
        strength: 0.95,
        soft: 0.05,
        edge: 0.3,
        charge: { color: "white", n: 2, strength: 0.4 },
      });
      pencil(ctx, board, { r, closed: true, alpha: 0.5, width: 0.8 });
      ctx.save();
      ctx.font = '700 15px "Mali", ui-rounded, system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = P?.ink ?? "#5a4433";
      ctx.globalAlpha = 0.86;
      ctx.fillText(String(sign), 105, 61, 58);
      ctx.restore();
      // What is out on the counter tonight.
      put(ctx, jar("lavender", 2), 40, 32, 0.52);
      put(ctx, jar("buckwheat", 1), 58, 33, 0.46);
      put(ctx, jar("clover", 3), 166, 32, 0.52);
      const candle = safe(() => good("candle"));
      if (candle) put(ctx, candle, 148, 33, 0.48);
    },
    { ax: 0, ay: 0 },
  );
}

/** A string of paper lanterns for the Winter Fair, hung across the whole picture. */
function lanterns() {
  return sprite(
    "stall-lanterns",
    STAGE_W,
    56,
    (ctx, w, h, r) => {
      const sag = (t) => 8 + Math.sin(Math.PI * t) * 20 + Math.sin(Math.PI * 3 * t) * 3;
      const line = [];
      for (let i = 0; i <= 16; i++) line.push([(w * i) / 16, sag(i / 16)]);
      pencil(ctx, line, { r, alpha: 0.55, width: 0.9, gaps: 0 });
      const colours = ["dandelion", "poppy", "apricot", "butter", "rose", "dandelion", "apricot"];
      colours.forEach((colour, i) => {
        const t = (i + 0.6) / (colours.length + 0.2);
        const x = w * t;
        const y = sag(t) + 9;
        wash(ctx, ellipse(x, y, 13, 13, 12), "butter", {
          r,
          layers: 5,
          strength: 0.3,
          soft: 0.6,
          edge: 0,
        });
        wash(ctx, ellipse(x, y, 6, 7.5, 10), colour, {
          r,
          layers: 8,
          strength: 0.9,
          soft: 0.08,
          charge: { color: "white", n: 1, strength: 0.35 },
        });
        pencil(ctx, ellipse(x, y, 6, 7.5, 10), { r, closed: true, alpha: 0.4, width: 0.7 });
        brush(
          ctx,
          [
            [x, y - 7.5],
            [x, y - 10],
          ],
          "bark",
          { r, width: 1.2 },
        );
      });
    },
    { ax: 0, ay: 0, grain: 0.6 },
  );
}

/**
 * Paint the evening picture into `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {{ season: string, look: any, mood?: string, fair?: boolean, sign: string, phase?: string, h?: number }} o
 *        `h`: the picture's height in its own units (200 and up): a taller
 *        picture has more sky and a bigger stall
 */
export function paintStage(canvas, o) {
  const H = Math.max(STAGE_H, Math.round(o.h ?? STAGE_H));
  const w = Math.ceil(STAGE_W * DPR);
  const h = Math.ceil(H * DPR);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, H);
  const season = /** @type {any} */ (o.season);
  // One tall sky serves every taller picture: its foot stays on the horizon.
  const skyH = H > STAGE_H ? 334 : 150;
  const sky = safe(() => skyBand(season, /** @type {any} */ (o.phase ?? "evening"), STAGE_W, skyH));
  if (sky) ctx.drawImage(sky.canvas, 0, H - 50 - skyH, sky.w, sky.h);
  const turf = safe(() => ground("stall", season, STAGE_W, 92));
  if (turf) ctx.drawImage(turf.canvas, 0, H - 88, turf.w, turf.h);
  // The stall stands on the bottom edge and grows with the picture.
  const k = 1 + Math.min(1.5, (H - STAGE_H) / 100) * 0.26;
  ctx.save();
  ctx.translate(4, H - 4);
  ctx.scale(k, k);
  put(ctx, boothBack(), 0, -BOOTH_H);
  const you = safe(() => keeper(o.look, "stand", /** @type {any} */ (o.mood ?? "calm")));
  if (you) put(ctx, you, BOOTH_W / 2, 186 - BOOTH_H, 1.08);
  put(ctx, counter(o.sign), 0, -COUNTER_H);
  ctx.restore();
  if (o.fair) {
    // Lantern light: a warm pool under each lantern, over the snow and the stall.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.6) / 7.2;
      const lx = STAGE_W * t;
      const ly = 17 + Math.sin(Math.PI * t) * 20 + Math.sin(Math.PI * 3 * t) * 3;
      const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 46);
      glow.addColorStop(0, "rgba(255, 214, 140, 0.5)");
      glow.addColorStop(0.45, "rgba(255, 200, 120, 0.16)");
      glow.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 48, ly - 48, 96, 96);
    }
    ctx.restore();
    put(ctx, lanterns(), 0, 0);
  }
}

/** Jobs that paint the stage's pieces ahead of time, for the loading bar. */
export function stageJobs(o) {
  const season = /** @type {any} */ (o.season);
  return [
    () => safe(() => skyBand(season, "evening", STAGE_W, 150)),
    () => safe(() => ground("stall", season, STAGE_W, 92)),
    () => boothBack(),
    () => counter(o.sign),
    () => safe(() => keeper(o.look, "stand", "calm")),
  ];
}

/**
 * The picture of a product: its jar, or the thing made.
 * @param {{ kind: string, honey?: string | null, stars?: number, good?: string | null }} info the core's productInfo
 */
export function productPic(info) {
  if (info.kind === "honey")
    return jar(info.honey ?? "blend", /** @type {any} */ (info.stars ?? 0));
  return safe(() => good(String(info.good))) ?? jar("blend", 0);
}

/** A painted coin and an amount, kept together. */
export function coinTag(n, size = 18) {
  return el("span.hh-coins", null, pic(item("coin"), size), number(n));
}

/** The purity stars as a small picture `height` px tall, or null for a blend. */
export function starsPic(n, height = 13) {
  const s = n >= 1 && n <= 3 ? safe(() => starsBadge(/** @type {any} */ (n))) : null;
  return s ? pic(s, (s.w * height) / s.h, "★".repeat(n)) : null;
}
