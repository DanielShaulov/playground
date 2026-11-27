// The small lives of the meadow: the swarm that hangs on a branch, the wasp
// that raids, and the ones that are only there to be charming. All tiny, so
// all are painted larger than life (the `scale` option) and drawn small.
// Everything that flies faces right; flip it to face left.

import { sprite } from "../paint/sprite.js";
import { rng } from "../paint/rng.js";
import {
  wash,
  brush,
  pencil,
  shadow,
  lift,
  ellipse,
  leaf,
  petal,
  smooth,
  within,
  TAU,
} from "../paint/wash.js";
import { rgba } from "../paint/palette.js";
import { bee, BEE_W, BEE_H } from "./bee.js";
import { along, dot, tick, dab } from "./flowers.js";

export { bee, BEE_W, BEE_H };

// A crisp little disc or line, for eyes and legs, where a wash would blur.
function disc(ctx, x, y, rad, color, alpha = 1) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
}

function line(ctx, pts, color, width, alpha = 1) {
  ctx.save();
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3) ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ swarm

export const SWARM_W = 60;
export const SWARM_H = 78;
const SWARM_FEET = 0.92;

// One bee of the hundreds: a gold dab, a dark band, a glint of wing.
function speckBee(ctx, r, x, y, s = 1) {
  const a = r() * TAU;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  dot(ctx, r, x, y, 1.25 * s, r.pick(["honey", "sunflower", "honey", "amber"]), 0.95);
  tick(
    ctx,
    r,
    x - sn * 1.1 * s,
    y + c * 1.1 * s,
    x + sn * 1.1 * s,
    y - c * 1.1 * s,
    "coal",
    0.75,
    0.7 * s,
  );
  dot(ctx, r, x - c * 1.2 * s, y - sn * 1.2 * s - 0.4, 0.75 * s, "sky", 0.7);
}

/**
 * A swarm: a cluster of bees hanging from a bent branch stuck in the
 * ground. It stands on a square like a bed (anchored at its foot, drawn at
 * tile / 64). The two frames differ only in where the bees are, so
 * alternating them makes the cluster shimmer.
 * @param {0|1} frame
 */
export function swarm(frame = 0) {
  return sprite(
    `swarm-${frame ? 1 : 0}`,
    SWARM_W,
    SWARM_H,
    (ctx, w, h, r) => {
      const s = rng("swarm-shape"); // the branch and the cluster's outline never move
      const cx = w / 2;
      const foot = h * SWARM_FEET;
      shadow(ctx, cx + 3, foot + 2, 20, 4.5, s, 0.22);
      // The branch: up from the ground, then over, bowed by the weight.
      const branch = smooth(
        [
          [cx - 15, foot],
          [cx - 16, foot - 26],
          [cx - 11, foot - 52],
          [cx + 1, foot - 64],
          [cx + 15, foot - 61],
        ],
        6,
        false,
      );
      brush(ctx, branch, "bark", {
        r: s,
        width: (t) => 4.4 - t * 2.8,
        strength: 0.9,
        layers: 8,
        charge: { color: "umber", n: 2, strength: 0.3 },
      });
      pencil(ctx, branch.map(([x, y]) => [x - 1.4, y - 0.6]).slice(2), {
        r: s,
        passes: 1,
        alpha: 0.4,
        width: 0.6,
        gaps: 0.2,
      });
      // A side twig with the last two leaves on it.
      const twig = smooth(
        [along(branch, 0.5), [cx - 22, foot - 50], [cx - 25, foot - 58]],
        4,
        false,
      );
      brush(ctx, twig, "bark", { r: s, width: 1.6, strength: 0.85 });
      for (const [t, a] of [
        [1, -2.2],
        [0.6, -3.5],
      ]) {
        const [x, y] = along(twig, t);
        wash(ctx, leaf(x, y, 8, 4.4, a), s.pick(["leaf", "sap"]), {
          r: s,
          layers: 5,
          strength: 0.8,
          soft: 0.12,
        });
      }
      wash(ctx, leaf(cx + 15, foot - 61, 8, 4.4, -0.5), "leaf", {
        r: s,
        layers: 5,
        strength: 0.8,
        soft: 0.12,
      });
      // The cluster: a beard of bees, widest a third of the way down.
      const top = foot - 62;
      const hang = [cx + 6, top];
      const beard = smooth(
        [
          [hang[0] - 4, top - 1],
          [hang[0] - 10, top + 9],
          [hang[0] - 11.5, top + 20],
          [hang[0] - 7, top + 31],
          [hang[0] - 0.5, top + 37],
          [hang[0] + 6, top + 31],
          [hang[0] + 10.5, top + 19],
          [hang[0] + 9, top + 8],
          [hang[0] + 4, top - 1],
        ],
        4,
      );
      wash(ctx, beard, "amber", {
        r: s,
        layers: 12,
        strength: 0.9,
        soft: 0.14,
        edge: 0.7,
        charge: { color: "chestnut", n: 3, strength: 0.4 },
      });
      wash(ctx, ellipse(hang[0] + 3, top + 22, 5, 11, 9), "umber", {
        r: s,
        layers: 6,
        strength: 0.3,
        soft: 0.5,
        edge: 0,
        glaze: true,
      });
      // The bees themselves. Each frame deals them out afresh.
      const inBeard = (y) => {
        const t = (y - top) / 37;
        return 11 * Math.sin(Math.PI * Math.pow(Math.max(0, Math.min(1, t)), 0.75)) + 1;
      };
      for (let i = 0; i < 64; i++) {
        const y = top + 1 + r() * 35;
        const half = inBeard(y);
        const x = hang[0] - 0.5 + (r() * 2 - 1) * half;
        speckBee(ctx, r, x, y, r.range(0.85, 1.1));
      }
      // Stragglers in the air round it.
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU;
        const d = r.range(15, 25);
        const x = hang[0] + Math.cos(a) * d * 0.95;
        const y = top + 17 + Math.sin(a) * d;
        if (x < 3 || x > w - 3 || y < 3) continue;
        speckBee(ctx, r, x, y, 1.05);
      }
      pencil(ctx, beard, { r: s, closed: true, passes: 1, alpha: 0.3, width: 0.6, gaps: 0.4 });
    },
    { ay: SWARM_FEET },
  );
}

// ------------------------------------------------------------------- wasp

export const WASP_W = 18;
export const WASP_H = 13;

/**
 * A wasp: thin-waisted, bright yellow, legs trailing. A little menacing.
 * @param {0|1} frame wings up or down
 */
export function wasp(frame = 0) {
  return sprite(
    `wasp-${frame ? 1 : 0}`,
    WASP_W,
    WASP_H,
    (ctx, w, h, r) => {
      const cx = w / 2;
      const cy = h * 0.6;
      // Long narrow wings, swept back.
      const swing = frame ? -1.35 : -0.75;
      for (const [dx, rot, len] of [
        [0.2, swing - 0.25, 7.6],
        [1.2, swing + 0.2, 6.8],
      ]) {
        const wing = petal(cx + dx, cy - 1.7, len, 2.7, -Math.PI / 2 + rot, 0.6);
        wash(ctx, wing, "straw", { r, layers: 4, strength: 0.5, soft: 0.06, edge: 0.6, rounds: 1 });
        pencil(ctx, wing, {
          r,
          closed: true,
          passes: 1,
          alpha: 0.45,
          width: 0.3,
          wobble: 0.06,
          gaps: 0,
        });
      }
      // Legs dangling under.
      for (const [x0, x1, y1] of [
        [0.8, -0.6, 4.2],
        [1.8, 1.6, 4.4],
        [2.8, 4, 3.8],
      ])
        line(
          ctx,
          [
            [cx + x0, cy + 1],
            [cx + (x0 + x1) / 2 - 0.8, cy + 2.6],
            [cx + x1, cy + y1],
          ],
          "coal",
          0.4,
          0.85,
        );
      // The abdomen: a pointed drop, tipped down like a threat.
      const tail = smooth(
        [
          [cx - 7.6, cy + 1.9],
          [cx - 5.2, cy - 0.9],
          [cx - 2.2, cy - 1.9],
          [cx - 0.1, cy - 0.9],
          [cx - 0.1, cy + 0.9],
          [cx - 2.4, cy + 2.2],
          [cx - 5.4, cy + 2.6],
        ],
        4,
      );
      wash(ctx, tail, "dandelion", {
        r,
        layers: 7,
        strength: 0.97,
        soft: 0.03,
        rounds: 1,
        charge: { color: "butter", n: 1, strength: 0.3 },
      });
      within(ctx, tail, () => {
        for (const sx of [-6.9, -4.9, -3, -1.2])
          wash(ctx, ellipse(cx + sx, cy + 0.6, sx < -6 ? 0.9 : 0.55, 3.4, 8, 0.25), "coal", {
            r,
            layers: 4,
            strength: 0.9,
            soft: 0.03,
            rounds: 1,
            edge: 0,
          });
      });
      pencil(ctx, tail, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.5,
        width: 0.32,
        wobble: 0.06,
        gaps: 0,
      });
      // Thorax and head: dark, with a yellow face.
      wash(ctx, ellipse(cx + 2, cy - 0.2, 2.1, 1.9, 10), "coal", {
        r,
        layers: 6,
        strength: 0.93,
        soft: 0.03,
        rounds: 1,
        edge: 0,
      });
      disc(ctx, cx + 1.5, cy - 0.9, 0.55, "dandelion", 0.9);
      wash(ctx, ellipse(cx + 5.1, cy + 0.2, 1.75, 1.85, 10), "coal", {
        r,
        layers: 6,
        strength: 0.93,
        soft: 0.03,
        rounds: 1,
        edge: 0,
      });
      wash(ctx, ellipse(cx + 5.9, cy + 0.6, 0.85, 1.15, 7), "dandelion", {
        r,
        layers: 4,
        strength: 0.95,
        soft: 0.04,
        rounds: 1,
        edge: 0,
      });
      // A slanted eye and long cranked feelers.
      line(
        ctx,
        [
          [cx + 4.5, cy - 0.9],
          [cx + 5.9, cy - 0.3],
        ],
        "white",
        0.5,
        0.95,
      );
      line(
        ctx,
        [
          [cx + 5.2, cy - 1.5],
          [cx + 6.6, cy - 3.6],
          [cx + 8.2, cy - 3.1],
        ],
        "coal",
        0.4,
        0.9,
      );
      line(
        ctx,
        [
          [cx + 4.6, cy - 1.6],
          [cx + 5.2, cy - 4.2],
          [cx + 6.8, cy - 4.5],
        ],
        "coal",
        0.4,
        0.9,
      );
    },
    { ax: 0.5, ay: 0.6, scale: 3, grain: 0.4 },
  );
}

// ------------------------------------------------------------ butterflies

export const BUTTERFLY_W = 22;
export const BUTTERFLY_H = 20;
export const BUTTERFLIES = ["white", "blue", "orange"];

const WINGS = {
  // base, the colour dropped into it, the wing tip, the spots
  white: { base: "white", charge: "cream", tip: "dusk", spot: "coal", line: 0.55 },
  blue: { base: "borage", charge: "sky", tip: "cornflower", spot: "white", line: 0.4 },
  orange: { base: "apricot", charge: "amber", tip: "coal", spot: "butter", line: 0.45 },
};

/**
 * A butterfly seen from above, head up; turn it to fly it anywhere.
 * @param {"white"|"blue"|"orange"} kind
 * @param {0|1} frame wings spread, or half closed
 */
export function butterfly(kind = "white", frame = 0) {
  const look = WINGS[kind];
  if (!look) throw new Error(`no butterfly "${kind}"`);
  return sprite(
    `butterfly-${kind}-${frame ? 1 : 0}`,
    BUTTERFLY_W,
    BUTTERFLY_H,
    (ctx, w, h, r) => {
      const cx = w / 2;
      const cy = h / 2 + 0.5;
      const fold = frame ? 0.5 : 1; // half closed: the wings narrow toward the body
      for (const side of [-1, 1]) {
        const X = (u) => cx + side * u * fold;
        const fore = smooth(
          [
            [X(0.6), cy - 1.2],
            [X(3.4), cy - 6.6],
            [X(8.6), cy - 8.2],
            [X(9.6), cy - 4.6],
            [X(7), cy - 0.6],
            [X(2.6), cy + 0.6],
          ],
          4,
        );
        const hind = smooth(
          [
            [X(0.6), cy + 0.2],
            [X(5.6), cy + 0.2],
            [X(7.6), cy + 3.4],
            [X(5.6), cy + 6.8],
            [X(2.6), cy + 6.4],
            [X(0.8), cy + 3],
          ],
          4,
        );
        for (const wing of [hind, fore]) {
          wash(ctx, wing, look.base, {
            r,
            layers: 6,
            strength: 0.93,
            soft: 0.05,
            edge: 0.7,
            rounds: 1,
            charge: { color: look.charge, n: 1, strength: 0.4 },
          });
        }
        // The dark tip of the forewing, kept inside it.
        within(ctx, fore, () => {
          wash(ctx, ellipse(X(9.4), cy - 7.6, 3.2 * fold + 0.6, 3, 8), look.tip, {
            r,
            layers: 4,
            strength: kind === "white" ? 0.6 : 0.8,
            soft: 0.2,
            edge: 0,
            rounds: 1,
          });
          if (kind === "orange") {
            // A tortoiseshell's dark bars along the leading edge.
            for (const u of [3.4, 5.8])
              wash(
                ctx,
                ellipse(X(u), cy - 6.2 + (u - 3.4) * -0.5, 0.9 * fold + 0.2, 1.5, 6),
                "coal",
                {
                  r,
                  layers: 3,
                  strength: 0.8,
                  soft: 0.1,
                  edge: 0,
                  rounds: 1,
                },
              );
          }
        });
        within(ctx, hind, () => {
          if (kind === "orange")
            for (let k = 0; k < 3; k++)
              disc(ctx, X(4.4 + k * 1.2), cy + 5.6 - k * 1.3, 0.55, "borage", 0.9);
          if (kind === "blue")
            wash(ctx, ellipse(X(5.4), cy + 5.4, 3.4 * fold, 1.6, 7, side * -0.7), "white", {
              r,
              layers: 3,
              strength: 0.55,
              soft: 0.3,
              edge: 0,
              rounds: 1,
            });
        });
        disc(ctx, X(6.2), cy - 4.3, kind === "white" ? 0.75 : 0.6, look.spot, 0.85);
        if (kind !== "blue") disc(ctx, X(4.6), cy + 2.8, 0.5, look.spot, 0.7);
        pencil(ctx, fore, {
          r,
          closed: true,
          passes: 1,
          alpha: look.line,
          width: 0.35,
          wobble: 0.08,
          gaps: 0.02,
        });
        pencil(ctx, hind, {
          r,
          closed: true,
          passes: 1,
          alpha: look.line,
          width: 0.35,
          wobble: 0.08,
          gaps: 0.02,
        });
      }
      // Body and feelers.
      wash(ctx, ellipse(cx, cy + 0.6, 0.95, 4.2, 8), "umber", {
        r,
        layers: 5,
        strength: 0.92,
        soft: 0.04,
        rounds: 1,
        edge: 0,
      });
      disc(ctx, cx, cy - 3.6, 1.05, "umber", 0.95);
      for (const side of [-1, 1]) {
        line(
          ctx,
          [
            [cx + side * 0.3, cy - 4.2],
            [cx + side * 1, cy - 6.6],
            [cx + side * 2.6, cy - 8],
          ],
          "umber",
          0.35,
          0.85,
        );
        disc(ctx, cx + side * 2.6, cy - 8, 0.45, "umber", 0.9);
      }
    },
    { ax: 0.5, ay: 0.5, scale: 3, grain: 0.4 },
  );
}

// --------------------------------------------------------------- ladybird

export const LADYBIRD_W = 12;
export const LADYBIRD_H = 10;

/** A ladybird, seen a little from above, walking right. */
export function ladybird() {
  return sprite(
    "ladybird",
    LADYBIRD_W,
    LADYBIRD_H,
    (ctx, w, h, r) => {
      const cx = w / 2 - 0.6;
      const cy = h * 0.55;
      for (const dx of [-2.4, 0, 2.4]) {
        line(
          ctx,
          [
            [cx + dx, cy + 1],
            [cx + dx - 0.6, cy + 3.6],
          ],
          "coal",
          0.42,
          0.9,
        );
      }
      wash(ctx, ellipse(cx + 3.8, cy + 0.6, 1.7, 2, 9), "coal", {
        r,
        layers: 5,
        strength: 0.93,
        soft: 0.03,
        rounds: 1,
        edge: 0,
      });
      disc(ctx, cx + 4.3, cy - 0.5, 0.5, "white", 0.95);
      line(
        ctx,
        [
          [cx + 4.6, cy - 1],
          [cx + 5.6, cy - 2.4],
        ],
        "coal",
        0.32,
        0.85,
      );
      const shell = ellipse(cx, cy, 4.1, 3.4, 14);
      wash(ctx, shell, "poppy", {
        r,
        layers: 8,
        strength: 0.97,
        soft: 0.03,
        rounds: 1,
        charge: { color: "cheekBerry", n: 1, strength: 0.4 },
      });
      within(ctx, shell, () => {
        for (const [dx, dy, s] of [
          [-1.9, -1.1, 0.8],
          [0.9, -1.6, 0.75],
          [-0.4, 1.2, 0.85],
          [2.4, 0.7, 0.7],
          [-3.3, 1.1, 0.65],
        ])
          disc(ctx, cx + dx, cy + dy, s, "coal", 0.92);
        line(
          ctx,
          [
            [cx + 0.9, cy - 3.4],
            [cx + 0.4, cy],
            [cx + 0.9, cy + 3.4],
          ],
          "coal",
          0.3,
          0.5,
        );
      });
      lift(ctx, ellipse(cx - 1, cy - 2.1, 1.3, 0.55, 6, -0.3), r, 0.55, 0.2);
      pencil(ctx, shell, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.45,
        width: 0.3,
        wobble: 0.05,
        gaps: 0,
      });
    },
    { ax: 0.5, ay: 0.9, scale: 4, grain: 0.3 },
  );
}

// ------------------------------------------------------------------- bird

export const BIRD_W = 40;
export const BIRD_H = 36;
const BIRD_FEET = 0.93;

/**
 * A blue tit for the title screen, standing, facing right.
 * @param {0|1} frame 0 looking about, 1 head up and beak open, singing
 */
export function bird(frame = 0) {
  return sprite(
    `bird-${frame ? 1 : 0}`,
    BIRD_W,
    BIRD_H,
    (ctx, w, h, r) => {
      const s = rng("bird-shape");
      const cx = w / 2 - 1;
      const foot = h * BIRD_FEET;
      const sing = frame ? 1 : 0;
      const by = foot - 13; // the middle of the body
      shadow(ctx, cx + 1, foot + 1, 10, 2.2, s, 0.2);
      // Legs.
      for (const dx of [-0.5, 3]) {
        line(
          ctx,
          [
            [cx + dx, by + 7],
            [cx + dx + 0.6, foot],
          ],
          "bark",
          0.8,
          0.9,
        );
        line(
          ctx,
          [
            [cx + dx - 1.6, foot + 0.3],
            [cx + dx + 0.6, foot],
            [cx + dx + 2.8, foot + 0.3],
          ],
          "bark",
          0.7,
          0.9,
        );
      }
      // Tail, cocked when singing.
      const ta = Math.PI + 0.35 - sing * 0.5;
      const tail = petal(cx - 7, by + 2, 11, 4.6, ta, 0.5);
      wash(ctx, tail, "cornflower", { r: s, layers: 6, strength: 0.85, soft: 0.08, edge: 0.6 });
      pencil(ctx, tail, { r: s, closed: true, passes: 1, alpha: 0.4, width: 0.5, gaps: 0.2 });
      // The body: a round yellow puff.
      const body = smooth(
        [
          [cx - 8.5, by + 1.5],
          [cx - 6.5, by - 5.5],
          [cx - 0.5, by - 8],
          [cx + 5.5, by - 5],
          [cx + 7.5, by + 1],
          [cx + 4.5, by + 6.5],
          [cx - 1.5, by + 8],
          [cx - 6.5, by + 6],
        ],
        4,
      );
      wash(ctx, body, "butter", {
        r: s,
        layers: 10,
        strength: 0.95,
        soft: 0.07,
        charge: { color: "dandelion", n: 2, strength: 0.35 },
      });
      pencil(ctx, body, { r: s, closed: true, passes: 1, alpha: 0.4, width: 0.6, gaps: 0.25 });
      // The wing folded along the back: blue, with a pale bar.
      const wing = smooth(
        [
          [cx - 9.5, by + 3.5 - sing],
          [cx - 5.5, by - 4.5 - sing],
          [cx + 1.5, by - 3.5],
          [cx + 2.5, by + 1.5],
          [cx - 3.5, by + 4.5],
        ],
        4,
      );
      wash(ctx, wing, "borage", {
        r: s,
        layers: 8,
        strength: 0.9,
        soft: 0.08,
        edge: 0.7,
        charge: { color: "cornflower", n: 2, strength: 0.4 },
      });
      brush(
        ctx,
        [
          [cx - 4.5, by - 1.5 - sing * 0.5],
          [cx - 1, by - 0.5],
          [cx + 2, by - 0.2],
        ],
        "white",
        {
          r: s,
          width: 1.3,
          strength: 0.85,
          edge: 0,
        },
      );
      pencil(ctx, wing, { r: s, closed: true, passes: 1, alpha: 0.4, width: 0.5, gaps: 0.25 });
      // The head: white cheeks, a blue cap, a dark line through the eye.
      const hx = cx + 6 + sing * 0.5;
      const hy = by - 8.5 - sing * 1.5;
      const head = ellipse(hx, hy, 6.2, 5.8, 12);
      wash(ctx, head, "white", {
        r: s,
        layers: 8,
        strength: 0.97,
        soft: 0.05,
        edge: 0.5,
        vary: 0.01,
      });
      within(ctx, head, () => {
        wash(ctx, ellipse(hx - 0.5, hy - 4.6, 6, 2.8, 9, 0.12), "borage", {
          r: s,
          layers: 6,
          strength: 0.92,
          soft: 0.1,
          edge: 0,
          charge: { color: "cornflower", n: 1, strength: 0.4 },
        });
        wash(ctx, ellipse(hx + 2.5, hy + 5.4, 3, 1.7, 8), "coal", {
          r: s,
          layers: 4,
          strength: 0.75,
          soft: 0.15,
          edge: 0,
        });
        line(
          ctx,
          [
            [hx - 6, hy - 0.2],
            [hx, hy - 1.3],
            [hx + 6, hy - 0.9],
          ],
          "coal",
          1,
          0.8,
        );
        wash(ctx, ellipse(hx - 4.5, hy + 3.4, 2.4, 2, 7), "borage", {
          r: s,
          layers: 4,
          strength: 0.6,
          soft: 0.3,
          edge: 0,
        });
      });
      disc(ctx, hx - 1.6, hy + 2, 1.5, "cheekRose", 0.5);
      pencil(ctx, head, { r: s, closed: true, passes: 1, alpha: 0.4, width: 0.6, gaps: 0.25 });
      disc(ctx, hx + 2.2, hy - 1, 1.05, "coal", 0.95);
      disc(ctx, hx + 2.55, hy - 1.35, 0.38, "white", 0.95);
      // The beak: shut, or open in song.
      if (sing) {
        line(
          ctx,
          [
            [hx + 5.6, hy - 0.2],
            [hx + 9, hy - 2.2],
          ],
          "umber",
          1.1,
          0.95,
        );
        line(
          ctx,
          [
            [hx + 5.6, hy + 0.6],
            [hx + 8.4, hy + 1.4],
          ],
          "umber",
          1,
          0.95,
        );
      } else {
        const beak = [
          [hx + 5.6, hy - 0.9],
          [hx + 9, hy + 0.3],
          [hx + 5.6, hy + 1.2],
        ];
        wash(ctx, beak, "umber", {
          r: s,
          layers: 4,
          strength: 0.95,
          soft: 0.03,
          rounds: 1,
          edge: 0,
        });
      }
    },
    { ax: 0.5, ay: BIRD_FEET, scale: 2 },
  );
}

// ------------------------------------------------------------------ snail

export const SNAIL_W = 22;
export const SNAIL_H = 16;

/** A snail for the meadow's edge, going right, in no hurry. */
export function snail() {
  return sprite(
    "snail",
    SNAIL_W,
    SNAIL_H,
    (ctx, w, h, r) => {
      const foot = h * 0.86;
      const cx = w / 2;
      shadow(ctx, cx, foot + 0.6, 8.5, 1.5, r, 0.2);
      // The body: a soft slipper, head lifted.
      const body = smooth(
        [
          [cx - 8.5, foot],
          [cx - 5, foot - 2.2],
          [cx + 3, foot - 2.6],
          [cx + 6.4, foot - 5.6],
          [cx + 8.8, foot - 5],
          [cx + 8.6, foot - 1.6],
          [cx + 6, foot + 0.2],
          [cx - 2, foot + 0.4],
        ],
        4,
      );
      wash(ctx, body, "straw", {
        r,
        layers: 7,
        strength: 0.93,
        soft: 0.05,
        rounds: 1,
        charge: { color: "cream", n: 1, strength: 0.4 },
      });
      pencil(ctx, body, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.5,
        width: 0.35,
        wobble: 0.08,
        gaps: 0.03,
      });
      // Eye stalks.
      for (const [dx, dy] of [
        [1.4, -3.6],
        [-0.4, -3.9],
      ]) {
        line(
          ctx,
          [
            [cx + 7.6, foot - 5.2],
            [cx + 7.6 + dx, foot - 5.2 + dy],
          ],
          "bark",
          0.42,
          0.9,
        );
        disc(ctx, cx + 7.6 + dx, foot - 5.2 + dy, 0.55, "coal", 0.95);
      }
      disc(ctx, cx + 8, foot - 2.9, 0.3, "coal", 0.7);
      // The shell: a coil, warm, with the paper left for its shine.
      const sx = cx - 1.2;
      const sy = foot - 6.4;
      const shell = ellipse(sx, sy, 5.4, 5.1, 14);
      wash(ctx, shell, "apricot", {
        r,
        layers: 8,
        strength: 0.95,
        soft: 0.04,
        rounds: 1,
        charge: { color: "terracotta", n: 2, strength: 0.45 },
      });
      lift(ctx, ellipse(sx - 1.6, sy - 2.2, 1.6, 0.9, 6, -0.5), r, 0.5, 0.25);
      const coil = [];
      for (let i = 0; i <= 26; i++) {
        const a = -0.4 + (i / 26) * TAU * 1.9;
        const d = 5 * (1 - i / 30);
        coil.push([sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.95]);
      }
      pencil(ctx, coil, {
        r,
        color: "chestnut",
        passes: 1,
        alpha: 0.6,
        width: 0.4,
        wobble: 0.06,
        gaps: 0.02,
      });
      pencil(ctx, shell, {
        r,
        closed: true,
        passes: 1,
        alpha: 0.5,
        width: 0.35,
        wobble: 0.07,
        gaps: 0.02,
      });
    },
    { ax: 0.5, ay: 0.86, scale: 3, grain: 0.4 },
  );
}

// ---------------------------------------------------------------- gallery

export const GALLERY = [
  { name: "bee · wings up", make: () => bee(0), zoom: 4 },
  { name: "bee · wings down", make: () => bee(1), zoom: 4 },
  { name: "wasp · 0", make: () => wasp(0), zoom: 4 },
  { name: "wasp · 1", make: () => wasp(1), zoom: 4 },
  ...BUTTERFLIES.flatMap((kind) =>
    [0, 1].map((frame) => ({
      name: `butterfly · ${kind} · ${frame}`,
      make: () => butterfly(kind, frame),
      zoom: 4,
    })),
  ),
  { name: "ladybird", make: () => ladybird(), zoom: 4 },
  { name: "snail", make: () => snail(), zoom: 4 },
  { name: "bird · 0", make: () => bird(0), zoom: 2.5 },
  { name: "bird · 1 (singing)", make: () => bird(1), zoom: 2.5 },
  { name: "swarm · 0", make: () => swarm(0), zoom: 1.6 },
  { name: "swarm · 1", make: () => swarm(1), zoom: 1.6 },
  // And at the size they are really seen.
  { name: "bee, true size", make: () => bee(0), zoom: 0.667 },
  { name: "wasp, true size", make: () => wasp(0), zoom: 0.667 },
  { name: "butterfly, true size", make: () => butterfly("orange", 0), zoom: 0.667 },
  { name: "ladybird, true size", make: () => ladybird(), zoom: 0.667 },
  { name: "snail, true size", make: () => snail(), zoom: 0.667 },
  { name: "bird, true size", make: () => bird(0), zoom: 0.667 },
  { name: "swarm, true size", make: () => swarm(0), zoom: 0.667 },
];
