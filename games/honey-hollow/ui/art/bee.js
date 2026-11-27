// A honey bee, small enough to be one of forty on screen. Painted at three
// times its size so it stays crisp, in two wing positions to flicker between.
// Plump, with a face: at 16 px the eye is one bright speck, and that speck is
// what makes her a character rather than a striped dot.

import { sprite } from "../paint/sprite.js";
import { wash, pencil, ellipse, petal, smooth, within } from "../paint/wash.js";
import { rgba } from "../paint/palette.js";

export const BEE_W = 16;
export const BEE_H = 13;

/** @param {0|1} frame wings up or down. The bee faces right; flip to face left. */
export function bee(frame = 0) {
  return sprite(
    `bee-${frame ? 1 : 0}`,
    BEE_W,
    BEE_H,
    (ctx, w, h, r) => {
      const cx = w / 2 - 0.7;
      const cy = h * 0.63;
      // Wings first, so the body sits over their roots: two soft teardrops.
      const swing = frame ? -1.0 : -0.2;
      for (const [dx, rot, len] of [
        [-1.2, swing - 0.5, 5.6],
        [0.9, swing + 0.12, 5.2],
      ]) {
        const wing = petal(cx + dx, cy - 2.3, len, 4.6, -Math.PI / 2 + rot, 0.66);
        wash(ctx, wing, "sky", {
          r,
          layers: 5,
          strength: 0.62,
          soft: 0.06,
          edge: 0.6,
          rounds: 1,
        });
        wash(
          ctx,
          petal(cx + dx, cy - 2.6, len * 0.6, 1.8, -Math.PI / 2 + rot - 0.12, 0.6),
          "white",
          {
            r,
            layers: 3,
            strength: 0.6,
            soft: 0.1,
            edge: 0,
            rounds: 1,
          },
        );
        pencil(ctx, wing, {
          r,
          closed: true,
          passes: 1,
          alpha: 0.42,
          width: 0.32,
          wobble: 0.08,
          gaps: 0,
        });
      }
      // The body: a fat little drop, blunt behind and full at the shoulder.
      const body = smooth(
        [
          [cx - 4.9, cy + 0.3],
          [cx - 3.5, cy - 2.6],
          [cx - 0.2, cy - 3.5],
          [cx + 2.8, cy - 2.9],
          [cx + 3.8, cy],
          [cx + 2.8, cy + 2.8],
          [cx - 0.2, cy + 3.4],
          [cx - 3.5, cy + 2.7],
        ],
        4,
      );
      wash(ctx, body, "honey", {
        r,
        layers: 8,
        strength: 0.96,
        soft: 0.035,
        rounds: 1,
        charge: { color: "sunflower", n: 1 },
      });
      within(ctx, body, () => {
        // Two stripes, bowed like the body they wrap, and a dark tail tip.
        for (const [sx, sw] of [
          [-2.9, 0.95],
          [-0.3, 1.05],
        ]) {
          wash(ctx, ellipse(cx + sx, cy, sw, 3.9, 10), "coal", {
            r,
            layers: 5,
            strength: 0.85,
            soft: 0.04,
            rounds: 1,
            edge: 0,
          });
        }
        wash(ctx, ellipse(cx - 5.2, cy + 0.3, 1.1, 2, 8), "coal", {
          r,
          layers: 4,
          strength: 0.7,
          soft: 0.05,
          rounds: 1,
          edge: 0,
        });
        // A fuzzy pale shoulder.
        wash(ctx, ellipse(cx + 1.9, cy - 1.5, 1.5, 1.3, 8), "butter", {
          r,
          layers: 4,
          strength: 0.6,
          soft: 0.3,
          rounds: 1,
          edge: 0,
        });
      });
      pencil(ctx, body, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.5,
        width: 0.35,
        wobble: 0.07,
        gaps: 0,
      });
      // Head, feelers, and the speck of light in her eye.
      const hx = cx + 4.7;
      const hy = cy + 0.25;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba("coal", 0.85);
      ctx.lineWidth = 0.42;
      for (const [ex, ey] of [
        [1.9, -3.5],
        [0.2, -3.9],
      ]) {
        ctx.beginPath();
        ctx.moveTo(hx + 0.4, hy - 1.6);
        ctx.quadraticCurveTo(hx + ex * 0.3, hy + ey * 0.9, hx + ex, hy + ey);
        ctx.stroke();
      }
      ctx.restore();
      wash(ctx, ellipse(hx, hy, 2.35, 2.4, 14), "coal", {
        r,
        layers: 6,
        strength: 0.92,
        soft: 0.03,
        rounds: 1,
        edge: 0,
      });
      ctx.fillStyle = rgba("white", 0.95);
      ctx.beginPath();
      ctx.arc(hx + 0.9, hy - 0.55, 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba("rose", 0.75);
      ctx.beginPath();
      ctx.ellipse(hx + 0.5, hy + 0.95, 0.62, 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    { ax: 0.5, ay: 0.6, scale: 3, grain: 0.4 },
  );
}

export const GALLERY = [
  { name: "bee · wings up", make: () => bee(0), zoom: 4 },
  { name: "bee · wings down", make: () => bee(1), zoom: 4 },
];
