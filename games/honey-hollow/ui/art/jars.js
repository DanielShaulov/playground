// A jar of honey. The honey's colour is the point: it is how a player learns
// that lavender is pale gold and buckwheat nearly black.

import { sprite } from "../paint/sprite.js";
import { wash, pencil, lift, shadow, ellipse, roundRect, smooth, rect } from "../paint/wash.js";

export const JAR_W = 44;
export const JAR_H = 52;

/** Honey colours by flower, as palette names or hexes. */
export const HONEY_COLOR = {
  dandelion: "#f0c232",
  apple: "#f3dc98",
  clover: "#f4e2a6",
  borage: "#f6edc8",
  lavender: "#efcf78",
  thyme: "#d99a3a",
  mint: "#cf9142",
  sunflower: "#f0b93a",
  buckwheat: "#6b3f2a",
  heather: "#b9603a",
  ivy: "#ead9a8",
  blend: "#e6a94a",
};

/**
 * @param {string} flower a honey's flower id, or "blend"
 * @param {0|1|2|3} stars
 */
export function jar(flower, stars = 0) {
  return sprite(
    `jar-${flower}-${stars}`,
    JAR_W,
    JAR_H,
    (ctx, w, h, r) => {
      const cx = w / 2;
      const base = h - 5;
      shadow(ctx, cx + 1, base, 15, 3.5, r, 0.3);
      const jw = 28;
      const jh = 30;
      const top = base - jh;
      const glass = roundRect(cx - jw / 2, top, jw, jh, 6);
      // Honey nearly to the shoulder.
      wash(
        ctx,
        roundRect(cx - jw / 2 + 1.5, top + 4, jw - 3, jh - 5.5, 5),
        HONEY_COLOR[flower] ?? HONEY_COLOR.blend,
        {
          r,
          layers: 16,
          strength: 0.93,
          soft: 0.06,
          charge: { color: "amber", n: 2, strength: flower === "buckwheat" ? 0.1 : 0.22 },
        },
      );
      // Light through the glass on the left, a rim of shade on the right.
      lift(
        ctx,
        smooth(
          [
            [cx - jw / 2 + 4, top + 8],
            [cx - jw / 2 + 7, top + 7],
            [cx - jw / 2 + 7, base - 6],
            [cx - jw / 2 + 4, base - 5],
          ],
          3,
        ),
        r,
        0.45,
        0.3,
      );
      wash(ctx, rect(cx + jw / 2 - 6, top + 5, 4, jh - 9), "umber", {
        r,
        layers: 5,
        strength: 0.14,
        soft: 0.4,
        edge: 0,
        glaze: true,
      });
      pencil(ctx, glass, { r, closed: true, alpha: 0.55, width: 0.85 });
      // A cloth cap tied with string.
      const cap = smooth(
        [
          [cx - jw / 2 - 2.5, top + 3.5],
          [cx - jw / 2 + 1, top - 3],
          [cx, top - 5],
          [cx + jw / 2 - 1, top - 3],
          [cx + jw / 2 + 2.5, top + 3.5],
          [cx + jw / 4, top + 2],
          [cx, top + 4],
          [cx - jw / 4, top + 2],
        ],
        4,
      );
      const cloth = stars >= 3 ? "lilac" : stars === 2 ? "rose" : stars === 1 ? "sky" : "cream";
      wash(ctx, cap, cloth, {
        r,
        layers: 10,
        strength: 0.92,
        soft: 0.1,
        charge: { color: "white", n: 2, strength: 0.35 },
      });
      pencil(ctx, cap, { r, closed: true, alpha: 0.5, width: 0.8 });
      pencil(
        ctx,
        [
          [cx - jw / 2 + 0.5, top + 0.5],
          [cx, top + 1.6],
          [cx + jw / 2 - 0.5, top + 0.5],
        ],
        { r, color: "bark", alpha: 0.7, width: 1 },
      );
      // A paper label.
      const label = roundRect(cx - 8.5, top + 11, 17, 12.5, 2);
      wash(ctx, label, "white", { r, layers: 8, strength: 0.94, soft: 0.05, edge: 0.3 });
      pencil(ctx, label, { r, closed: true, alpha: 0.4, width: 0.6, passes: 1 });
      // A tiny bloom of the honey's colour on the label, like a painted swatch.
      wash(ctx, ellipse(cx, top + 17.2, 4, 3.2, 8), HONEY_COLOR[flower] ?? HONEY_COLOR.blend, {
        r,
        layers: 6,
        strength: 0.75,
        soft: 0.25,
      });
    },
    { ay: 0.92 },
  );
}

export const GALLERY = Object.keys(HONEY_COLOR).map((flower, i) => ({
  name: `jar · ${flower}`,
  make: () => jar(flower, i % 4),
  zoom: 2,
}));
