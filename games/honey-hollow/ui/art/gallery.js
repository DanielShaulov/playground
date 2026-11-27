// The gallery page: every art module's GALLERY list, painted and laid out.
// A module that paints something new adds itself to SHEETS here.

import { img } from "../paint/sprite.js";

const SHEETS = {
  flowers: () => import("./flowers.js"),
  hives: () => import("./hives.js"),
  bees: () => import("./bee.js"),
  jars: () => import("./jars.js"),
  ground: () => import("./ground.js"),
  scenery: () => import("./scenery.js"),
  creatures: () => import("./creatures.js"),
  sky: () => import("./sky.js"),
  meadow: () => import("./meadow-sample.js"),
  plots: () => import("./meadow-sample.js").then((m) => ({ GALLERY: m.PLOTS_GALLERY })),
  people: () => import("./people.js"),
  "people-wardrobe": () => import("./people/sheets.js").then((m) => ({ GALLERY: m.WARDROBE })),
  "people-poses": () => import("./people/sheets.js").then((m) => ({ GALLERY: m.POSING })),
  villagers: () => import("./people/sheets.js").then((m) => ({ GALLERY: m.VILLAGE })),
  "people-sizes": () => import("./people/sheets.js").then((m) => ({ GALLERY: m.SIZES })),
  goods: () => import("./goods.js"),
  items: () => import("./goods.js").then((m) => ({ GALLERY: m.GALLERY_ITEMS })),
  icons: () => import("./icons.js"),
  "icons-green": () => import("./icons.js").then((m) => ({ GALLERY: m.GALLERY_ON_GREEN })),
  chrome: () => import("./chrome.js"),
};

const q = new URLSearchParams(location.search);
const only = q.get("only")?.split(",");
const zoom = Number(q.get("zoom") ?? 1.5);
const root = document.getElementById("sheets");

// In a function: no module of the game waits at its top level
// (tests/honey-hollow/core/modules.test.mjs).
async function paint() {
  for (const [name, load] of Object.entries(SHEETS)) {
    if (only && !only.includes(name)) continue;
    const t0 = performance.now();
    const mod = await load();
    const h2 = document.createElement("h2");
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const item of mod.GALLERY) {
      const s = item.make();
      const fig = document.createElement("figure");
      fig.append(img(s, s.w * zoom * (item.zoom ?? 1), item.name));
      const cap = document.createElement("figcaption");
      cap.textContent = item.name;
      fig.append(cap);
      grid.append(fig);
    }
    h2.textContent = `${name} (${mod.GALLERY.length} pieces, ${Math.round(performance.now() - t0)} ms)`;
    root.append(h2, grid);
  }
  document.body.dataset.ready = "1";
}
paint();
