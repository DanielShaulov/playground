// Paper. Watercolour is as much the paper as the paint: the grain shows
// through thin washes as pale flecks and collects pigment as dark ones.

import { P, rgb } from "./palette.js";
import { rng } from "./rng.js";

let grainTile = null;

// A small tile of flecks on a transparent ground: pale ones where the paper's
// bumps show through, dark ones where pigment has settled in the hollows.
function grain() {
  if (grainTile) return grainTile;
  const N = 192;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(N, N);
  const r = rng("paper-grain");
  // A coarse field, so the flecks clump the way real grain does.
  const M = 48;
  const coarse = new Float32Array(M * M);
  for (let i = 0; i < coarse.length; i++) coarse[i] = r();
  const at = (x, y) => coarse[((y + M) % M) * M + ((x + M) % M)];
  const [dr, dg, db] = rgb(P.umber);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * M;
      const fy = (y / N) * M;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const lo =
        at(ix, iy) * (1 - tx) * (1 - ty) +
        at(ix + 1, iy) * tx * (1 - ty) +
        at(ix, iy + 1) * (1 - tx) * ty +
        at(ix + 1, iy + 1) * tx * ty;
      const v = (r() - 0.5) * 0.85 + (lo - 0.5) * 0.6;
      const i = (y * N + x) * 4;
      if (v > 0.12) {
        img.data[i] = img.data[i + 1] = 255;
        img.data[i + 2] = 250;
        img.data[i + 3] = Math.min(255, (v - 0.12) * 190);
      } else if (v < -0.14) {
        img.data[i] = dr;
        img.data[i + 1] = dg;
        img.data[i + 2] = db;
        img.data[i + 3] = Math.min(255, (-v - 0.14) * 120);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * Press the paper's grain into whatever has been painted so far (and only
 * there: transparent pixels stay transparent). Call once, last.
 */
export function granulate(ctx, w, h, amount = 1) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = Math.min(1, 0.55 * amount);
  ctx.fillStyle = ctx.createPattern(grain(), "repeat");
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Fill with cream paper: a flat tone, faint warm clouds, then the grain. */
export function paper(ctx, w, h, r, tone = P.paper) {
  ctx.save();
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, w, h);
  const [sr, sg, sb] = rgb(P.paperShade);
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = Math.max(w, h) * r.range(0.2, 0.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${sr},${sg},${sb},0.22)`);
    g.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  granulate(ctx, w, h, 0.45);
}
