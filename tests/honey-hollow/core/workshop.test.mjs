// Rule tests for the workshop: when it opens, how many crafts a day, what
// each recipe takes and makes, and the rows the workshop screen reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  ok,
  no,
  edit,
  fresh,
  hive,
  setDay,
  dayOn,
  flyDay,
  nextMorning,
  one,
  dry,
} from "./helpers.mjs";

/** A keeper with wax, every recipe learned, and whatever else is put on the shelves. */
const shop = (over = {}, talent = "whisperer") =>
  edit(fresh(1, talent), (s) => {
    s.progress.stats.wax = 1;
    s.progress.unlocked.recipes = [...C.RECIPE_IDS];
    s.stock.wax = 10;
    Object.assign(s.stock, over);
  });
const make = (recipe, more = {}) => ({ type: "craft", recipe, ...more });

test("the workshop opens with the first beeswax, in the morning and the evening", () => {
  const s = fresh();
  assert.equal(C.workshopOpen(s), false);
  assert.equal(C.canCraftNow(s), "workshop-closed");
  no(
    edit(s, (s) => (s.stock.wax = 5)),
    make("candle"),
    "workshop-closed",
  );
  const waxed = ok(
    edit(s, (s) => (hive(s).stores = { dandelion: 20 })),
    { type: "harvest", hive: 1, jars: 2 },
  ).state;
  assert.equal(C.workshopOpen(waxed), true);
  assert.equal(C.canCraftNow(waxed), true);
  no(waxed, make("candle"), "no-wax");
  const r = ok(
    edit(waxed, (s) => (s.stock.wax = 2)),
    make("candle"),
  );
  assert.deepEqual(one(r.events, "crafted"), {
    type: "crafted",
    recipe: "candle",
    made: "candle",
    product: "good:candle",
    family: "candle",
    used: { wax: 2 },
    left: 2,
  });
  assert.deepEqual([r.state.stock.wax, r.state.stock.goods], [0, { candle: 1 }]);
  no(waxed, make("nope"), "no-recipe");
  no(waxed, make(5), "no-recipe");
  no(waxed, make("balm"), "recipe-locked");
  const out = ok(shop(), { type: "startDay" }).state;
  assert.equal(C.canCraftNow(out), "not-now");
  no(out, make("candle"), "not-now");
  ok(flyDay(shop()).state, make("candle"));
});

test("crafts: three a day between morning and evening, six in winter, one more for clever hands", () => {
  let s = shop();
  for (const left of [2, 1]) {
    assert.equal(C.craftsLeft(s), left + 1);
    const r = ok(s, make("candle"));
    assert.equal(one(r.events, "crafted").left, left);
    s = r.state;
  }
  s = flyDay(s).state;
  assert.equal(C.craftsLeft(s), 1, "the evening shares the morning's count");
  s = ok(s, make("candle")).state;
  assert.equal(C.canCraftNow(s), "no-crafts-left");
  no(s, make("candle"), "no-crafts-left");
  assert.equal(C.craftsLeft(nextMorning(s).state), T.CRAFTS_PER_DAY);
  const winter = (state) => edit(state, (s) => setDay(s, dayOn(21), "snow"));
  assert.equal(C.craftsLeft(winter(shop())), 6);
  const clever = shop({}, "clever-hands");
  assert.deepEqual([C.craftsLeft(clever), C.craftsLeft(winter(clever))], [4, 7]);
  // ... and every recipe takes one wax less, though never none.
  const wax = (state) => C.RECIPE_IDS.map((id) => C.waxFor(state, C.RECIPES[id]));
  assert.deepEqual(wax(shop()), [2, 2, 1, 1, 3, 0, 0]);
  assert.deepEqual(wax(clever), [1, 1, 1, 1, 2, 0, 0]);
});

test("recipes: what goes in is chosen, or the cheapest that will do", () => {
  // Soap: the bunch decides the bar.
  let s = shop({ bunches: { mint: 1, thyme: 2 } });
  let e = one(ok(s, make("soap")).events, "crafted");
  assert.deepEqual(
    [e.made, e.product, e.family, e.used],
    ["soap-mint", "good:soap-mint", "soap", { wax: 1, bunch: "mint" }],
  );
  let r = ok(s, make("soap", { bunch: "thyme" }));
  assert.deepEqual(
    [one(r.events, "crafted").made, r.state.stock.bunches, r.state.stock.goods],
    ["soap-thyme", { mint: 1, thyme: 1 }, { "soap-thyme": 1 }],
  );
  no(s, make("soap", { bunch: "lavender" }), "no-bunch");
  no(s, make("soap", { bunch: "clover" }), "no-bunch");
  no(s, make("lavender-candle"), "no-bunch");
  assert.equal(
    one(
      ok(
        edit(s, (s) => (s.stock.bunches.lavender = 1)),
        make("lavender-candle"),
      ).events,
      "crafted",
    ).product,
    "good:lavender-candle",
  );
  // The thyme remedy is not for sale: it goes to the hive shelf.
  r = ok(s, make("remedy"));
  e = one(r.events, "crafted");
  assert.deepEqual(
    [e.made, e.product, e.family, e.used],
    ["remedy", null, null, { wax: 0, bunch: "thyme" }],
  );
  assert.deepEqual([r.state.stock.remedy, r.state.stock.goods, r.state.stock.wax], [1, {}, 10]);
  // Lip balm: any jar, the least precious unless one is named.
  s = shop({ honey: { "heather:3": 1, "ivy:1": 1, "blend:0": 1 } });
  r = ok(s, make("balm"));
  assert.deepEqual(one(r.events, "crafted").used, { wax: 1, honey: "honey:ivy:1" });
  assert.deepEqual(r.state.stock.honey, { "heather:3": 1, "blend:0": 1 });
  assert.equal(
    one(ok(s, make("balm", { honey: "honey:heather:3" })).events, "crafted").used.honey,
    "honey:heather:3",
  );
  no(s, make("balm", { honey: "honey:mint:1" }), "no-honey");
  no(s, make("balm", { honey: "good:candle" }), "no-honey");
  no(shop(), make("balm"), "no-honey");
  // The gift basket: a pure honey, a candle and a soap.
  s = shop({ honey: { "blend:0": 1 }, goods: { candle: 1, "lavender-candle": 1, "soap-mint": 1 } });
  no(s, make("basket"), "no-honey");
  const full = edit(s, (s) => (s.stock.honey["clover:1"] = 1));
  no(
    edit(full, (s) => (s.stock.goods = { "soap-mint": 1 })),
    make("basket"),
    "no-candle",
  );
  no(
    edit(full, (s) => (s.stock.goods = { candle: 1 })),
    make("basket"),
    "no-soap",
  );
  no(full, make("basket", { candle: "soap-mint" }), "no-candle");
  r = ok(full, make("basket"));
  assert.deepEqual(one(r.events, "crafted").used, {
    wax: 0,
    honey: "honey:clover:1",
    candle: "candle",
    soap: "soap-mint",
  });
  assert.deepEqual(
    [r.state.stock.goods, r.state.stock.honey],
    [{ "lavender-candle": 1, basket: 1 }, { "blend:0": 1 }],
  );
  assert.equal(
    one(ok(full, make("basket", { candle: "lavender-candle" })).events, "crafted").used.candle,
    "lavender-candle",
  );
});

test("recipesNow: every recipe the keeper knows, what there is to choose from, and why it cannot be made", () => {
  assert.deepEqual(C.recipesNow(fresh()), [
    {
      recipe: "candle",
      name: "Beeswax candle",
      makes: ["candle"],
      wax: 2,
      options: {},
      missing: ["workshop-closed", "no-wax"],
      canMake: false,
    },
  ]);
  const s = shop({ bunches: { mint: 1 }, honey: { "ivy:1": 1 }, goods: { candle: 1 } });
  const by = Object.fromEntries(C.recipesNow(s).map((r) => [r.recipe, r]));
  assert.deepEqual(Object.keys(by), C.RECIPE_IDS);
  assert.deepEqual(
    [by.soap.makes, by.soap.options, by.soap.missing, by.soap.canMake],
    [["soap-lavender", "soap-mint", "soap-thyme"], { bunch: ["mint"] }, [], true],
  );
  assert.deepEqual(by["lavender-candle"].missing, ["no-bunch"]);
  assert.deepEqual(
    [by.basket.options, by.basket.missing],
    [{ honey: ["honey:ivy:1"], candle: ["candle"], soap: [] }, ["no-soap"]],
  );
  assert.deepEqual(by.balm.options, { honey: ["honey:ivy:1"] });
  // While the bees are out every row says so; and a row never promises what step() would refuse.
  const out = ok(s, { type: "startDay" }).state;
  for (const row of C.recipesNow(out))
    assert.deepEqual([row.missing[0], row.canMake], ["not-now", false]);
  let spent = s;
  for (let i = 0; i < 3; i++) spent = ok(spent, make("candle")).state;
  assert.ok(C.recipesNow(spent).every((row) => row.missing[0] === "no-crafts-left"));
  for (const state of [s, out, flyDay(s).state, spent, shop({ wax: 0 }), shop()])
    for (const row of C.recipesNow(state))
      assert.equal(
        row.canMake,
        dry(state, make(row.recipe)) === true,
        `${row.recipe} on day ${state.clock.day}, ${state.clock.phase}`,
      );
});
