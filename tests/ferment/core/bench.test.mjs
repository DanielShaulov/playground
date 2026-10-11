// Bench rules: add-ins bending how a jar ripens, the time-lapse preview, the
// evening pantry, experiments, recipe discovery and the recipe card.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES, RECIPE_IDS, VARIANT_IDS } from "../../../games/ferment/content/recipes.js";
import {
  INGREDIENTS,
  INGREDIENT_IDS,
  MAX_ADDS,
  MAX_STOCK,
} from "../../../games/ferment/content/ingredients.js";
import { SLOTS } from "../../../games/ferment/content/tuning.js";
import { testRng } from "./helpers.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} ≉ ${b}`);
const jar = (recipe, age, adds) => ({ id: 1, recipe, age, servings: 2, ...(adds && { adds }) });

function ok(s, action) {
  const r = C.step(s, action);
  assert.notEqual(r.events[0]?.type, "rejected", `${action.type} rejected: ${r.events[0]?.why}`);
  return r;
}
function why(s, action) {
  const r = C.step(s, action);
  assert.equal(r.events[0]?.type, "rejected", `${action.type} should be rejected`);
  assert.equal(r.state, s);
  return r.events[0].why;
}
/** A day-1 game moved to the evening, with `coins` and a pantry of `stock`. */
function evening({ coins = 200, stock = {} } = {}) {
  let s = ok(C.newGame(5), { type: "open" }).state;
  s = ok(s, { type: "close" }).state;
  s = structuredClone(s);
  s.shop.coins = coins;
  s.pantry.stock = { ...stock };
  return s;
}
function morning(opts) {
  const s = ok(evening(opts), { type: "sleep" }).state;
  s.shelf.slots = Array(SLOTS).fill(null);
  return s;
}

test("a plain jar ripens exactly as before add-ins existed", () => {
  for (const recipe of RECIPE_IDS) {
    const h = RECIPES[recipe].hours;
    for (const age of [0, 0.05, 1 / 3, 7.123, h / 2, h - 1e-12, h, h + 3]) {
      assert.equal(C.flavour(jar(recipe, age)), Math.min(1, age / h));
      assert.equal(C.isOver(jar(recipe, age)), age >= h);
      assert.equal(C.forecast(recipe, age), age / h);
    }
  }
});

test("salt slows a jar, chili and honey speed it up, and speeds multiply", () => {
  assert.equal(C.lifeOf("kimchi", ["salt"]), 96);
  near(C.lifeOf("kimchi", ["chili"]), 54);
  near(C.lifeOf("dill", ["honey"]), 40);
  near(C.lifeOf("kimchi", ["salt", "chili"]), 72);
  near(C.flavour(jar("kimchi", 48, ["salt"])), 0.5);
  assert.equal(C.isOver(jar("kimchi", 72, ["salt"])), false);
  assert.equal(C.isOver(jar("kimchi", 54, ["chili"])), true);
});

test("pear and garlic are flavour only: a jar with them ripens like a plain one", () => {
  for (const recipe of RECIPE_IDS) {
    const h = RECIPES[recipe].hours;
    for (const adds of [["pear"], ["garlic"], ["pear", "garlic"]]) {
      assert.equal(C.lifeOf(recipe, adds), h);
      for (const age of [0, 1 / 3, h / 2, h - 1e-9, h]) {
        assert.equal(C.flavour(jar(recipe, age, adds)), C.flavour(jar(recipe, age)));
        assert.equal(C.isOver(jar(recipe, age, adds)), C.isOver(jar(recipe, age)));
      }
    }
  }
  near(C.lifeOf("kimchi", ["garlic", "chili"]), 54, "chili still speeds a garlic jar");
});

test("the time-lapse runs from starting the jar to its lid popping", () => {
  const plain = C.previewCurve("dill");
  assert.equal(plain.points.length, 5);
  assert.deepEqual(
    plain.points.map((p) => p.hour),
    [0, 12, 24, 36, 48],
  );
  assert.deepEqual(
    plain.points.map((p) => p.f),
    [0, 0.25, 0.5, 0.75, 1],
  );
  assert.deepEqual([plain.sweet.lo, plain.sweet.hi], [0.2, 0.4]);
  near(plain.sweet.from, 9.6);
  near(plain.sweet.to, 19.2);
  assert.equal(plain.sooner, 0);
  assert.equal(plain.recipe, "dill");

  const chili = C.previewCurve("kimchi", ["chili"]);
  near(chili.popAt, 54);
  near(chili.sooner, 0.45 * 72 - 0.45 * 54, "chili brings the sweet spot forward");
  assert.ok(C.previewCurve("kimchi", ["salt"]).sooner < 0, "salt pushes it later");
  assert.equal(C.previewCurve("hotsauce", ["garlic"]).sooner, 0, "garlic moves nothing");
  assert.equal(C.previewCurve("kimchi", ["pear"]).recipe, "pearkimchi");
  for (const c of [
    C.previewCurve("hotsauce", ["pear", "salt"], 9),
    C.previewCurve("kraut", ["garlic"], 3),
  ]) {
    assert.equal(c.points[0].hour, 0);
    near(c.points.at(-1).f, 1);
    near(c.points.at(-1).hour, c.popAt);
    for (let i = 1; i < c.points.length; i++) assert.ok(c.points[i].f >= c.points[i - 1].f);
  }
  for (const bad of [
    ["nope"],
    ["toString"],
    ["dill", ["salt", "salt"]],
    ["dill", ["butter"]],
    ["dill", "salt"],
    ["dill", ["salt", "chili", "pear", "garlic"]],
  ])
    assert.equal(C.previewCurve(...bad), null, JSON.stringify(bad));
});

test("a mix that covers a discovered recipe's needs makes that recipe", () => {
  assert.deepEqual(C.resolveMix("kimchi", ["pear", "salt"]), {
    recipe: "pearkimchi",
    base: "kimchi",
    adds: ["pear", "salt"],
  });
  assert.equal(C.resolveMix("kimchi", ["chili", "garlic"]).recipe, "funkykimchi");
  assert.equal(C.resolveMix("kimchi", ["garlic"]).recipe, "kimchi");
  assert.deepEqual(C.resolveMix("pearkimchi", ["salt"]).adds, ["pear", "salt"]);
  assert.equal(C.resolveMix("kimchi", []).recipe, "kimchi");
});

test("the pantry sells ingredients in the evening only", () => {
  const s = evening({ coins: 10 });
  const r = ok(s, { type: "buy", ingredient: "salt", n: 2 });
  assert.equal(r.state.shop.coins, 10 - 2 * INGREDIENTS.salt.cost);
  assert.equal(r.state.pantry.stock.salt, 2);
  assert.deepEqual(r.events, [{ type: "bought", ingredient: "salt", n: 2, cost: 4 }]);
  assert.equal(why(s, { type: "buy", ingredient: "honey", n: 3 }), "not enough coins");
  assert.equal(why(s, { type: "buy", ingredient: "butter" }), "no such ingredient");
  assert.equal(why(s, { type: "buy", ingredient: "toString" }), "no such ingredient");
  assert.equal(why(s, { type: "buy", ingredient: "salt", n: 0 }), "bad amount");
  assert.equal(why(s, { type: "buy", ingredient: "salt", n: 1.5 }), "bad amount");
  const full = evening({ stock: { garlic: MAX_STOCK - 1 } });
  ok(full, { type: "buy", ingredient: "garlic" });
  assert.equal(why(full, { type: "buy", ingredient: "garlic", n: 2 }), "pantry is full");
  assert.equal(
    why(C.newGame(1), { type: "buy", ingredient: "salt" }),
    "pantry opens in the evening",
  );
});

test("an experiment uses up its add-ins, teaches the card and can discover a recipe", () => {
  const s = evening({ stock: { pear: 1, salt: 1 } });
  const r = ok(s, { type: "experiment", recipe: "kimchi", adds: ["pear", "salt"] });
  assert.deepEqual(r.state.pantry.stock, { pear: 0, salt: 0 });
  assert.equal(r.state.shop.coins, s.shop.coins, "experiments cost no coins");
  assert.deepEqual(r.state.bench.known, ["pearkimchi"]);
  assert.ok(!r.state.bench.hints.includes("pearkimchi"));
  assert.deepEqual(r.state.bench.tried, { kimchi: ["pear", "salt"] });
  assert.deepEqual(
    r.events.map((e) => e.type),
    ["discovered", "experimented"],
  );
  assert.equal(r.events[1].curve.recipe, "pearkimchi");

  const again = ok(evening({ stock: { pear: 1 } }), {
    type: "experiment",
    recipe: "dill",
    adds: ["pear"],
  });
  assert.deepEqual(again.state.bench.known, [], "pear in dill makes nothing new");
  assert.deepEqual(
    again.events.map((e) => e.type),
    ["experimented"],
  );

  assert.equal(
    why(evening({ stock: { pear: 1 } }), { type: "experiment", recipe: "kimchi", adds: [] }),
    "nothing to try",
  );
  assert.equal(
    why(evening(), { type: "experiment", recipe: "kimchi", adds: ["pear"] }),
    "not in the pantry",
  );
  assert.equal(
    why(evening({ stock: { pear: 1 } }), { type: "experiment", recipe: "pearkimchi", adds: [] }),
    "recipe not discovered",
  );
  assert.equal(
    why(evening(), { type: "experiment", recipe: "kimchi", adds: ["pear", "pear"] }),
    "bad add-ins",
  );
  assert.equal(
    why(evening(), { type: "experiment", recipe: "x", adds: ["pear"] }),
    "no such recipe",
  );
  assert.equal(
    why(C.newGame(1), { type: "experiment", recipe: "kimchi", adds: ["salt"] }),
    "bench opens in the evening",
  );
});

test("brewing with add-ins uses the pantry, and a discovering mix brews the new recipe", () => {
  const s = morning({ stock: { garlic: 2, chili: 1 } });
  const r = ok(s, { type: "brew", slot: 0, recipe: "kimchi", adds: ["garlic", "chili"] });
  const j = r.state.shelf.slots[0];
  assert.equal(j.recipe, "funkykimchi");
  assert.deepEqual(j.adds, ["garlic", "chili"]);
  assert.equal(r.state.shop.coins, s.shop.coins - RECIPES.kimchi.cost);
  assert.deepEqual(r.state.pantry.stock, { garlic: 1, chili: 0 });
  assert.deepEqual(
    r.events.map((e) => e.type),
    ["discovered", "brewed"],
  );
  assert.equal(
    why(s, { type: "brew", slot: 0, recipe: "kimchi", adds: ["salt"] }),
    "not in the pantry",
  );
  assert.equal(why(s, { type: "brew", slot: 0, recipe: "garlicdill" }), "recipe not discovered");

  // Once known, a discovered recipe brews by name, using what it needs from the pantry.
  assert.equal(why(r.state, { type: "brew", slot: 2, recipe: "funkykimchi" }), "not in the pantry");
  const s2 = structuredClone(r.state);
  s2.pantry.stock = { garlic: 1, chili: 1, salt: 1 };
  const byName = ok(s2, { type: "brew", slot: 1, recipe: "funkykimchi", adds: ["salt"] });
  assert.deepEqual(byName.state.shelf.slots[1].adds, ["garlic", "chili", "salt"]);
  assert.deepEqual(byName.state.pantry.stock, { garlic: 0, chili: 0, salt: 0 });

  // A plain brew stores no adds, so a plain jar looks exactly as it always did.
  assert.deepEqual(
    Object.keys(ok(s, { type: "brew", slot: 0, recipe: "dill" }).state.shelf.slots[0]).sort(),
    ["age", "id", "recipe", "servings"],
  );
});

test("discovered recipes join the menu, and walk-ins start asking for them", () => {
  const s = C.newGame(2);
  assert.deepEqual(C.menu(s), RECIPE_IDS);
  s.bench.known = ["firekraut", "garlicdill"];
  assert.deepEqual(C.menu(s), [...RECIPE_IDS, "garlicdill", "firekraut"]);
  const asked = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    let g = C.newGame(seed);
    g.bench.known = [...VARIANT_IDS];
    g = ok(g, { type: "open" }).state;
    for (const e of ok(g, { type: "tick", n: 120 * 11 }).events)
      if (e.type === "arrived") asked.add(e.customer.recipe);
  }
  for (const v of VARIANT_IDS) assert.ok(asked.has(v), `nobody asked for ${v}`);
});

test("the recipe card ticks what you have tried and hints at what's left to find", () => {
  const s = evening({ stock: { chili: 1 } });
  const before = C.recipeCard(s, "kimchi");
  assert.deepEqual(before.sweet, C.previewCurve("kimchi").sweet);
  assert.ok(before.effects.every((e) => !e.known));
  assert.deepEqual(before.found, [
    { recipe: "pearkimchi", state: "hinted", tags: ["sweet"], needs: [] },
    { recipe: "funkykimchi", state: "hidden", tags: [], needs: [] },
  ]);
  const after = ok(s, { type: "experiment", recipe: "kimchi", adds: ["chili"] }).state;
  const card = C.recipeCard(after, "kimchi");
  assert.deepEqual(
    card.effects.filter((e) => e.known).map((e) => e.ingredient),
    ["chili"],
  );
  after.bench.known.push("pearkimchi");
  assert.deepEqual(C.recipeCard(after, "kimchi").found[0].needs, ["pear"]);
  assert.equal(C.recipeCard(s, "pearkimchi"), null);
  assert.equal(C.recipeCard(s, "toString"), null);
});

test("content rows are consistent", () => {
  for (const id of VARIANT_IDS) {
    const v = RECIPES[id];
    assert.ok(RECIPE_IDS.includes(v.base), `${id} base`);
    assert.equal(v.hours, RECIPES[v.base].hours, `${id} ripens like its base`);
    assert.ok(v.needs.length >= 1 && v.needs.length <= MAX_ADDS);
    assert.ok(v.needs.every((n) => INGREDIENT_IDS.includes(n)));
  }
  for (const id of Object.keys(RECIPES)) {
    const [lo, hi] = RECIPES[id].sweet;
    assert.ok(0 < lo && lo < hi && hi < 1, `${id} sweet spot`);
  }
  for (const i of Object.values(INGREDIENTS)) assert.ok(i.speed > 0 && Number.isInteger(i.cost));
});

test("saves keep add-ins, and a save with bad add-ins starts fresh", () => {
  const s = morning({ stock: { pear: 1 } });
  const brewed = ok(s, { type: "brew", slot: 3, recipe: "dill", adds: ["pear"] }).state;
  assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(brewed))), brewed);
  const bad = JSON.parse(JSON.stringify(brewed));
  bad.shelf.slots[3].adds = ["butter"];
  assert.equal(C.loadSave(bad), null);
  const old = JSON.parse(JSON.stringify(C.newGame(1)));
  delete old.bench;
  delete old.pantry;
  assert.deepEqual(C.loadSave(old).bench, C.SLICES.bench());
});

test("random bench play never reaches an impossible state", () => {
  const rnd = testRng(11);
  const any = (list) => list[Math.floor(rnd() * list.length)];
  const adds = () => Array.from({ length: Math.floor(rnd() * 3) }, () => any(INGREDIENT_IDS));
  const recipes = [...Object.keys(RECIPES), "toString"];
  for (let run = 0; run < 60; run++) {
    let s = C.newGame(run);
    for (let i = 0; i < 300; i++) {
      const kind = any([
        "buy",
        "buy",
        "experiment",
        "brew",
        "tipOut",
        "open",
        "close",
        "sleep",
        "tick",
      ]);
      const action =
        kind === "buy"
          ? { type: kind, ingredient: any([...INGREDIENT_IDS, "x"]), n: 1 + Math.floor(rnd() * 3) }
          : kind === "experiment" || kind === "brew"
            ? { type: kind, slot: Math.floor(rnd() * SLOTS), recipe: any(recipes), adds: adds() }
            : kind === "tipOut"
              ? { type: kind, slot: Math.floor(rnd() * SLOTS) }
              : kind === "tick"
                ? { type: kind, n: 1 + Math.floor(rnd() * 200) }
                : { type: kind };
      s = C.step(s, action).state;
      assert.ok(Number.isInteger(s.shop.coins) && s.shop.coins >= 0);
      for (const [k, n] of Object.entries(s.pantry.stock)) {
        assert.ok(INGREDIENT_IDS.includes(k), k);
        assert.ok(Number.isInteger(n) && n >= 0 && n <= MAX_STOCK, `${k}: ${n}`);
      }
      assert.equal(new Set(s.bench.known).size, s.bench.known.length);
      assert.ok(s.bench.known.every((k) => VARIANT_IDS.includes(k)));
      assert.ok(s.bench.known.every((k) => !s.bench.hints.includes(k)));
      for (const j of s.shelf.slots) {
        if (!j) continue;
        assert.ok(!j.adds || j.adds.length > 0);
        assert.equal(C.resolveMix(j.recipe, j.adds ?? []).recipe, j.recipe, "jar matches its mix");
        const f = C.flavour(j);
        assert.ok(f >= 0 && f <= 1);
      }
    }
    assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(s))), s);
  }
});
