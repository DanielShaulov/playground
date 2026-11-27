// The land: plots and their ground, what may be planted where, digging,
// bunches, buying plots, and the wild flowers of the Home Meadow.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  W,
  ok,
  no,
  edit,
  fresh,
  hive,
  bed,
  clearBeds,
  setDay,
  dayOn,
  nextMorning,
  one,
  of,
} from "./helpers.mjs";

test("the Hollow: four plots of six by six, the Home Meadow owned and the rest for sale", () => {
  const s = fresh();
  assert.deepEqual(C.PLOT_IDS, ["home", "pond", "orchard", "hill"]);
  assert.deepEqual(
    C.PLOT_IDS.map((p) => C.PLOTS[p].price),
    [0, 150, 320, 600],
  );
  assert.deepEqual(
    C.PLOT_IDS.map((p) => s.land.plots[p].owned),
    [true, false, false, false],
  );
  for (const p of C.PLOT_IDS) {
    assert.equal(C.PLOTS[p].terrain.length, T.PLOT_H);
    for (const row of C.PLOTS[p].terrain) {
      assert.equal(row.length, W);
      for (const ch of row) assert.ok(Object.hasOwn(C.TERRAIN, ch), `terrain "${ch}" on ${p}`);
    }
    assert.equal(s.land.plots[p].squares.length, W * T.PLOT_H);
  }
  assert.equal(C.terrainAt("home", 0, 0), "grass");
  assert.equal(C.terrainAt("pond", 5, 5), "water");
  assert.equal(C.terrainAt("orchard", 1, 1), "tree");
  assert.equal(C.terrainAt("hill", 2, 1), "rock");
  assert.equal(C.terrainAt("hill", 0, 0), "hill");
  assert.equal(C.terrainAt("home", 6, 0), null);
  assert.equal(C.terrainAt("moon", 0, 0), null);
});

test("a new game: one skep on the Home Meadow and six wild dandelion beds, all in its reach", () => {
  const s = fresh();
  const h = hive(s);
  assert.deepEqual(C.squareAt(s, "home", h.x, h.y), { t: "hive", id: h.id });
  assert.deepEqual(C.squareAt(s, "home", 1, 2), {
    t: "bed",
    flower: "dandelion",
    planted: 0,
    picked: 0,
    wild: true,
  });
  assert.equal(C.squareAt(s, "home", 0, 0), null);
  assert.equal(C.squareAt(s, "home", 9, 9), null);
  const beds = s.land.plots.home.squares.filter((q) => q?.t === "bed");
  assert.equal(beds.length, T.WILD_BEDS);
  const reach = C.reachOf("home", h.x, h.y);
  for (const [x, y] of C.START.wild)
    assert.ok(
      reach.some((r) => r.x === x && r.y === y),
      `${x},${y} is out of reach`,
    );
  assert.equal(s.purse.coins, T.START_COINS);
  assert.equal(h.strength, T.START_HIVE_STRENGTH);
});

test("planting: where each flower may go, and the code for every refusal", () => {
  const s = edit(fresh(), (s) => {
    for (const p of ["pond", "orchard"]) s.land.plots[p].owned = true;
    s.stock.seeds = { thyme: 1, mint: 1 };
    s.purse.coins = 100;
  });
  const cases = [
    ["home", 0, 0, "clover", true],
    ["home", 0, 0, "nope", "no-flower"],
    ["home", 0, 0, "apple", "not-plantable"],
    ["moon", 0, 0, "clover", "no-plot"],
    ["home", 6, 0, "clover", "off-plot"],
    ["home", 0, -1, "clover", "off-plot"],
    ["hill", 0, 0, "clover", "not-owned"],
    ["pond", 5, 5, "clover", "bad-ground"],
    ["orchard", 1, 1, "clover", "bad-ground"],
    ["home", 2, 3, "clover", "square-taken"],
    ["home", 1, 2, "clover", "square-taken"],
    ["home", 0, 0, "thyme", "needs-hill"],
    ["home", 0, 0, "mint", "needs-water"],
    ["pond", 0, 0, "mint", "needs-water"],
    ["pond", 2, 2, "mint", "needs-water"],
    ["pond", 3, 3, "mint", true],
    ["pond", 2, 5, "mint", true],
    ["home", 0, 0, "borage", "flower-locked"],
  ];
  for (const [plot, x, y, flower, want] of cases) {
    assert.equal(C.canPlant(s, plot, x, y, flower), want, `${flower} at ${plot} ${x},${y}`);
    const action = { type: "plant", plot, x, y, flower };
    if (want === true) ok(s, action);
    else no(s, action, want);
  }
  const hill = edit(s, (s) => (s.land.plots.hill.owned = true));
  assert.equal(C.canPlant(hill, "hill", 0, 0, "thyme"), true);
  assert.equal(C.canPlant(hill, "hill", 2, 1, "thyme"), "bad-ground", "a rock");
  assert.equal(
    C.canPlant(hill, "hill", 0, 0, "clover"),
    true,
    "the plain flowers grow on the hill too",
  );
});

test("mint grows only on the seven squares right beside the pond", () => {
  const s = edit(fresh(), (s) => {
    s.land.plots.pond.owned = true;
    s.stock.seeds.mint = 1;
  });
  const squares = [];
  for (let y = 0; y < T.PLOT_H; y++)
    for (let x = 0; x < W; x++)
      if (C.canPlant(s, "pond", x, y, "mint") === true) squares.push(`${x},${y}`);
  assert.deepEqual(squares, ["3,2", "4,2", "5,2", "2,3", "3,3", "2,4", "2,5"]);
});

test("planting: a seed in hand is used first, else the seed price is paid, and the bed is a seed until morning", () => {
  const s = edit(fresh(), (s) => {
    s.purse.coins = 10;
    s.stock.seeds = { clover: 1 };
  });
  const a = ok(s, { type: "plant", plot: "home", x: 0, y: 0, flower: "clover" });
  assert.equal(one(a.events, "planted").cost, 0);
  assert.equal(a.state.purse.coins, 10);
  assert.deepEqual(a.state.stock.seeds, {});
  const b = ok(a.state, { type: "plant", plot: "home", x: 5, y: 5, flower: "clover" });
  assert.equal(one(b.events, "planted").cost, C.FLOWERS.clover.seed);
  assert.equal(b.state.purse.coins, 6);
  const made = C.squareAt(b.state, "home", 5, 5);
  assert.deepEqual(made, { t: "bed", flower: "clover", planted: 1, picked: 0 });
  assert.equal(C.stageOf(b.state, made), "seed");
  const c = ok(b.state, { type: "plant", plot: "home", x: 5, y: 4, flower: "lavender" }).state;
  assert.equal(c.purse.coins, 0);
  no(c, { type: "plant", plot: "home", x: 5, y: 3, flower: "lavender" }, "no-coins");
});

test("digging: free, nothing comes back, and only a bed can be dug", () => {
  const s = fresh();
  const r = ok(s, { type: "dig", plot: "home", x: 1, y: 2 });
  assert.equal(one(r.events, "dug").flower, "dandelion");
  assert.equal(C.squareAt(r.state, "home", 1, 2), null);
  assert.equal(r.state.purse.coins, s.purse.coins);
  no(r.state, { type: "dig", plot: "home", x: 1, y: 2 }, "no-bed");
  no(s, { type: "dig", plot: "home", x: 2, y: 3 }, "no-bed");
  no(s, { type: "dig", plot: "home", x: 7, y: 3 }, "off-plot");
  no(s, { type: "dig", plot: "moon", x: 1, y: 2 }, "no-plot");
});

test("bunches: one a year from a blooming bed of lavender, thyme or mint, in the morning", () => {
  assert.deepEqual(C.BUNCHES, ["lavender", "thyme", "mint"]);
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(8));
    bed(s, "home", 0, 0, "lavender");
    bed(s, "home", 5, 5, "clover");
    bed(s, "home", 5, 0, "lavender", dayOn(8)); // planted this morning
  });
  const pick = { type: "pickBunch", plot: "home", x: 0, y: 0 };
  no(s, { ...pick, x: 5, y: 5 }, "no-bunch");
  no(s, { ...pick, x: 4, y: 4 }, "no-bed");
  no(s, { ...pick, x: 5, y: 0 }, "not-blooming");
  no(
    edit(s, (s) => setDay(s, dayOn(2))),
    pick,
    "not-blooming",
  );
  no(ok(s, { type: "startDay" }).state, pick, "not-morning");
  const r = ok(s, pick);
  assert.equal(one(r.events, "picked").flower, "lavender");
  assert.deepEqual(r.state.stock.bunches, { lavender: 1 });
  assert.equal(C.squareAt(r.state, "home", 0, 0).picked, dayOn(8));
  no(r.state, pick, "already-picked");
  no(
    edit(r.state, (s) => setDay(s, dayOn(10))),
    pick,
    "already-picked",
  );
  ok(
    edit(r.state, (s) => setDay(s, dayOn(8, 2))),
    pick,
  );
});

test("plots: bought in any order for their price, and each brings its own flowers", () => {
  const s = edit(fresh(), (s) => (s.purse.coins = 1100));
  assert.equal(C.canBuyPlot(s, "home"), "owned");
  assert.equal(C.canBuyPlot(s, "moon"), "no-plot");
  assert.equal(C.canBuyPlot(s, "hill"), true);
  assert.equal(C.canBuyPlot(fresh(), "pond"), "no-coins");
  no(fresh(), { type: "buyPlot", plot: "pond" }, "no-coins");
  no(s, { type: "buyPlot", plot: "home" }, "owned");
  no(s, { type: "buyPlot", plot: "moon" }, "no-plot");
  const r = ok(s, { type: "buyPlot", plot: "hill" });
  assert.deepEqual(one(r.events, "plotBought"), { type: "plotBought", plot: "hill", price: 600 });
  assert.equal(r.state.purse.coins, 500);
  assert.deepEqual(
    of(r.events, "unlocked")
      .map((e) => e.id)
      .sort(),
    ["heather", "remedy", "thyme"],
  );
  assert.equal(C.canBuyPlot(r.state, "hill"), "owned");
  const pond = ok(r.state, { type: "buyPlot", plot: "pond" });
  assert.deepEqual(
    of(pond.events, "unlocked").map((e) => e.id),
    ["mint"],
  );
  const orchard = ok(pond.state, { type: "buyPlot", plot: "orchard" });
  assert.equal(of(orchard.events, "unlocked").length, 0, "apple blossom is not a seed");
  assert.equal(orchard.state.purse.coins, 1100 - 600 - 150 - 320);
});

test("whereGrows: the plots a flower could ever stand on, and canPlant agrees", () => {
  const s = fresh();
  assert.deepEqual(C.whereGrows(s, "clover"), C.PLOT_IDS);
  assert.deepEqual(C.whereGrows(s, "mint"), ["pond"]);
  assert.deepEqual(C.whereGrows(s, "thyme"), ["hill"]);
  assert.deepEqual(C.whereGrows(s, "heather"), ["hill"]);
  assert.deepEqual(C.whereGrows(s, "apple"), ["orchard"]);
  assert.deepEqual(C.whereGrows(s, "nope"), []);
  const all = edit(s, (s) => {
    for (const p of C.PLOT_IDS) s.land.plots[p].owned = true;
    s.progress.unlocked.flowers = [...C.FLOWER_IDS];
  });
  for (const f of C.FLOWER_IDS.filter((f) => C.FLOWERS[f].seed !== null))
    for (const p of C.PLOT_IDS) {
      let can = false;
      for (let i = 0; i < W * T.PLOT_H; i++)
        can ||= C.canPlant(all, p, i % W, Math.floor(i / W), f) === true;
      assert.equal(C.whereGrows(s, f).includes(p), can, `${f} on ${p}`);
    }
});

test("near water: within two squares of the pond, for the summer bonus", () => {
  assert.equal(C.nearWater("pond", 3, 2), true);
  assert.equal(C.nearWater("pond", 1, 2), true);
  assert.equal(C.nearWater("pond", 0, 2), false);
  assert.equal(C.nearWater("home", 3, 3), false);
  assert.equal(C.nearWater("pond", 9, 9), false);
  assert.equal(T.WATER_RANGE, 2);
});

test("wild flowers: a bare Home Meadow seeds itself on the first morning of spring, summer and autumn", () => {
  const eve = (doy, f) =>
    edit(fresh(), (s) => {
      setDay(s, dayOn(doy));
      hive(s).stores = { clover: 50 };
      f?.(s);
    });
  const summer = nextMorning(eve(6, clearBeds));
  const grown = one(summer.events, "wildflowers");
  assert.equal(grown.flower, "clover");
  assert.deepEqual(
    grown.squares.map((q) => [q.x, q.y]),
    C.START.wild,
    "on the squares the first dandelions grew on",
  );
  const made = C.squareAt(summer.state, "home", 1, 2);
  assert.equal(made.wild, true);
  assert.equal(C.stageOf(summer.state, made), "bloom", "full grown at once");
  assert.equal(one(nextMorning(eve(13, clearBeds)).events, "wildflowers").flower, "ivy");
  assert.equal(one(nextMorning(eve(27, clearBeds)).events, "wildflowers").flower, "dandelion");
  assert.equal(
    of(nextMorning(eve(20, clearBeds)).events, "wildflowers").length,
    0,
    "nothing in winter",
  );
  assert.equal(
    of(nextMorning(eve(6)).events, "wildflowers").length,
    0,
    "a meadow with six beds is left alone",
  );
  const two = nextMorning(
    eve(6, (s) => {
      clearBeds(s);
      [0, 1, 2, 3].forEach((x) => bed(s, "home", x, 0, "lavender"));
    }),
  );
  assert.equal(one(two.events, "wildflowers").squares.length, 2, "only up to six beds in all");
});
