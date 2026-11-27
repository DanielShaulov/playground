// Gallery only: whole meadows laid out at phone size, because that is how
// every piece is really seen. A square here is 60 px; the pieces are drawn
// exactly as the meadow screen draws them (scale tile / 64, feet at 0.86 of
// the way down the square). Nothing in the game imports this file.

import { sprite, put } from "../paint/sprite.js";
import { bed } from "./flowers.js";
import { hive } from "./hives.js";
import { ground, SEASONS, SAMPLE_TERRAIN } from "./ground.js";
import { tree, rock, marker } from "./scenery.js";
import { bee, wasp, butterfly, ladybird, snail, bird, swarm, BUTTERFLIES } from "./creatures.js";
import { cloudShadow, raindrop, snowflake } from "./sky.js";
import { rng } from "../paint/rng.js";

const TILE = 60;
const PAD = 12;

const FLOWER = {
  D: "dandelion",
  C: "clover",
  B: "borage",
  L: "lavender",
  Y: "thyme",
  M: "mint",
  S: "sunflower",
  W: "buckwheat",
  E: "heather",
  I: "ivy",
};
const HIVE = { 1: "skep", 2: "box", 3: "double", 4: "stack" };

// Roughly what each flower is doing in the middle of each season.
const STAGE = {
  spring: {
    D: "bloom",
    C: "bud",
    B: "leaf",
    L: "leaf",
    Y: "leaf",
    M: "leaf",
    S: "seed",
    W: "seed",
    E: "leaf",
    I: "leaf",
  },
  summer: {
    D: "faded",
    C: "bloom",
    B: "bloom",
    L: "bloom",
    Y: "bloom",
    M: "bloom",
    S: "bloom",
    W: "bud",
    E: "bud",
    I: "leaf",
  },
  autumn: {
    D: "faded",
    C: "faded",
    B: "faded",
    L: "faded",
    Y: "faded",
    M: "faded",
    S: "faded",
    W: "bloom",
    E: "bloom",
    I: "bloom",
  },
  winter: {
    D: "dormant",
    C: "dormant",
    B: "dormant",
    L: "dormant",
    Y: "dormant",
    M: "dormant",
    S: "dormant",
    W: "dormant",
    E: "dormant",
    I: "dormant",
  },
};
const TREE = { spring: "bloom", summer: "leaf", autumn: "fruit", winter: "dormant" };

// What stands on each square (a letter from FLOWER, a digit from HIVE).
const PLANTING = {
  // A bit of everything, for the one-per-season sheets.
  sampler: {
    terrain: ["..T..T", "......", "......", "hh..~~", "hhr~~~", "hhh.~~"],
    beds: ["LL.SI.", "L2LS.C", "BBD.CC", "EY.MM.", "E..M..", "YE3W..", ""],
    rings: [1, 1],
  },
  home: {
    terrain: SAMPLE_TERRAIN.home,
    beds: ["..LLL.", "D...L.", ".D.D.C", "..1.DC", "...D.C", ".D..2.", ""],
    rings: [2, 3],
  },
  pond: {
    terrain: SAMPLE_TERRAIN.pond,
    beds: ["BB..S.", "B3..S.", "...MMI", ".C.M..", ".CM...", "..M...", ""],
  },
  orchard: {
    terrain: SAMPLE_TERRAIN.orchard,
    beds: ["W.C.S.", "..C...", "W4CC.S", "W....S", ".B.I..", "...B.2", ""],
  },
  hill: {
    terrain: SAMPLE_TERRAIN.hill,
    beds: ["EE.YY.", "E..Y2.", "..LL..", "EE.L..", ".EYY..", "..1.YE", ""],
  },
};

/**
 * One whole meadow as a single picture.
 * @param {keyof typeof PLANTING} name
 * @param {"spring"|"summer"|"autumn"|"winter"} season
 */
export function meadow(name, season) {
  const plan = PLANTING[name];
  const top = Math.round(TILE * 1.25); // headroom for a tree in the top row
  const side = 16; // and elbow room for one in the end columns
  const G = TILE * 6 + PAD * 2;
  const W = G + side * 2;
  const H = G + top;
  return sprite(
    `meadow-sample-${name}-${season}`,
    W,
    H,
    (ctx) => {
      const k = TILE / 64;
      ctx.translate(side, 0);
      put(ctx, ground(name === "sampler" ? "pond" : name, season, G, G, plan.terrain, PAD), 0, top);
      const at = (x, y) => [PAD + x * TILE + TILE / 2, top + PAD + y * TILE + TILE * 0.86];
      // A hive's two rings, and a picked square, to see the markers in place.
      if (plan.rings && season === "summer") {
        const [hx, hy] = plan.rings;
        for (let y = hy - 2; y <= hy + 2; y++)
          for (let x = hx - 2; x <= hx + 2; x++) {
            if (x < 0 || y < 0 || x > 5 || y > 5 || (x === hx && y === hy)) continue;
            if ("~rT".includes(plan.terrain[y][x])) continue;
            const near = Math.abs(x - hx) <= 1 && Math.abs(y - hy) <= 1;
            put(
              ctx,
              marker(near ? "near" : "far"),
              PAD + (x + 0.5) * TILE,
              top + PAD + (y + 0.5) * TILE,
              k,
            );
          }
      }
      if (plan.rings && season === "spring") {
        put(ctx, marker("ok"), PAD + 3.5 * TILE, top + PAD + 1.5 * TILE, k);
        put(ctx, marker("ok"), PAD + 4.5 * TILE, top + PAD + 1.5 * TILE, k);
        put(ctx, marker("no"), PAD + 5.5 * TILE, top + PAD + 1.5 * TILE, k);
        put(ctx, marker("pick"), PAD + 3.5 * TILE, top + PAD + 2.5 * TILE, k);
      }
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 6; x++) {
          const [px, py] = at(x, y);
          const t = plan.terrain[y][x];
          const b = plan.beds[y]?.[x] ?? ".";
          if (t === "T") put(ctx, tree(TREE[season], (x + y) % 2), px, py, k);
          else if (t === "r") put(ctx, rock((x * 2 + y) % 3, season === "winter"), px, py, k);
          else if (t === "~") continue;
          else if (FLOWER[b]) put(ctx, bed(FLOWER[b], STAGE[season][b], (x + y) % 2), px, py, k);
          else if (HIVE[b]) put(ctx, hive(HIVE[b]), px, py, k);
        }
      // The small lives and the weather, as the screen would scatter them.
      const r = rng(`meadow-sample-${name}-${season}`);
      const spot = () => [PAD + r.range(0.2, 5.8) * TILE, top + PAD + r.range(0.2, 5.8) * TILE];
      if (season === "winter") {
        put(ctx, bird(0), ...at(2, 2), 0.62);
        for (let i = 0; i < 46; i++) put(ctx, snowflake(), ...spot(), r.range(0.7, 1.1));
        return;
      }
      if (name === "sampler" && season === "summer") put(ctx, swarm(0), ...at(3, 2), k);
      if (season === "summer") put(ctx, cloudShadow(), PAD + TILE * 4.2, top + PAD + TILE * 1.6);
      for (let i = 0; i < (season === "summer" ? 20 : 11); i++)
        put(ctx, bee(i % 2), ...spot(), 1, { flip: r() < 0.5, rot: r.gauss() * 0.3 });
      if (season !== "autumn")
        BUTTERFLIES.forEach((kind, i) =>
          put(ctx, butterfly(kind, i % 2), ...spot(), 1, { rot: r.gauss() * 0.7 }),
        );
      put(ctx, ladybird(), ...spot(), 1, { flip: r() < 0.5 });
      put(ctx, snail(), PAD + TILE * 0.5, top + PAD + TILE * 6 - 4);
      if (season === "autumn") {
        for (let i = 0; i < 2; i++) put(ctx, wasp(i), ...spot(), 1, { rot: r.gauss() * 0.3 });
        if (name === "pond") for (let i = 0; i < 40; i++) put(ctx, raindrop(), ...spot());
      }
    },
    { ax: 0, ay: 0, grain: 0 },
  );
}

export const GALLERY = SEASONS.map((season) => ({
  name: `meadow at phone size · ${season} (use ?zoom=1)`,
  make: () => meadow("sampler", season),
}));

/** The four real plots, planted, in every season. */
export const PLOTS_GALLERY = ["home", "pond", "orchard", "hill"].flatMap((plot) =>
  SEASONS.map((season) => ({
    name: `${plot} · ${season}`,
    make: () => meadow(plot, season),
  })),
);
