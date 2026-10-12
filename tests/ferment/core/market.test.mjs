// Market rules: today's stalls (stock and prices), the evening `buy`, and the
// marketToday() read helper the market screen draws from.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import {
  INGREDIENTS,
  INGREDIENT_IDS,
  MAX_STOCK,
} from "../../../games/ferment/content/ingredients.js";
import { STALLS, PRICE_BAND } from "../../../games/ferment/content/market.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";

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
/** A game moved to the evening of `day`, with `coins` and a pantry of `stock`. */
function evening({ seed = 5, day = 1, coins = 200, stock = {} } = {}) {
  let s = C.newGame(seed);
  for (;;) {
    s = ok(s, { type: "open" }).state;
    s = ok(s, { type: "close" }).state;
    if (s.clock.day === day) break;
    s = ok(s, { type: "sleep" }).state;
  }
  s = structuredClone(s);
  s.shop.coins = coins;
  s.pantry.stock = { ...stock };
  return s;
}

test("the market is out from day 1 and every morning after", () => {
  for (let seed = 0; seed < 20; seed++) {
    const s = C.newGame(seed);
    assert.equal(s.market.day, 1);
    const out = C.marketToday(s).map((m) => m.ingredient);
    for (const id of INGREDIENT_IDS)
      if (INGREDIENTS[id].stall !== "rare") assert.ok(out.includes(id), `${id} on day 1`);
  }
  const day2 = evening({ day: 2 });
  assert.equal(day2.market.day, 2);
  for (const item of C.marketToday(day2)) {
    assert.ok(INGREDIENT_IDS.includes(item.ingredient));
    assert.ok(Number.isInteger(item.price) && item.price > 0);
    assert.ok(Number.isInteger(item.left) && item.left >= 0);
    assert.equal(item.have, day2.pantry.stock[item.ingredient] ?? 0);
    assert.equal(item.room, MAX_STOCK - item.have);
  }
});

test("buying in the evening pays today's price and takes from the stall", () => {
  const s = evening({ coins: 10 });
  const salt = s.market.items.salt;
  const r = ok(s, { type: "buy", ingredient: "salt", n: 2 });
  assert.equal(r.state.shop.coins, 10 - 2 * salt.price);
  assert.equal(r.state.pantry.stock.salt, 2);
  assert.equal(r.state.market.items.salt.left, salt.left - 2);
  assert.deepEqual(r.events, [{ type: "bought", ingredient: "salt", n: 2, cost: 2 * salt.price }]);
  assert.equal(why(s, { type: "buy", ingredient: "butter" }), "no such ingredient");
  assert.equal(why(s, { type: "buy", ingredient: "toString" }), "no such ingredient");
  assert.equal(why(s, { type: "buy", ingredient: "salt", n: 0 }), "bad amount");
  assert.equal(why(s, { type: "buy", ingredient: "salt", n: 1.5 }), "bad amount");
  assert.equal(
    why(C.newGame(1), { type: "buy", ingredient: "salt" }),
    "market opens in the evening",
  );
});

test("buy refuses what the coins, the pantry or the stall can't cover", () => {
  const poor = evening({ coins: 1 });
  assert.equal(why(poor, { type: "buy", ingredient: "salt" }), "not enough coins");
  const full = evening({ stock: { salt: MAX_STOCK - 1 } });
  ok(full, { type: "buy", ingredient: "salt" });
  assert.equal(why(full, { type: "buy", ingredient: "salt", n: 2 }), "pantry is full");
  const low = structuredClone(evening());
  low.market.items.salt.left = 1;
  assert.equal(why(low, { type: "buy", ingredient: "salt", n: 2 }), "sold out");
  delete low.market.items.chili;
  assert.equal(why(low, { type: "buy", ingredient: "chili" }), "not at the market today");
  low.market.day = 0;
  assert.deepEqual(C.marketToday(low), []);
  assert.equal(why(low, { type: "buy", ingredient: "salt" }), "not at the market today");
});

test("an old save without a market loads, and the stalls come out next morning", () => {
  const old = JSON.parse(JSON.stringify(evening()));
  delete old.market;
  const s = C.loadSave(old);
  assert.deepEqual(s.market, C.SLICES.market());
  assert.deepEqual(C.marketToday(s), []);
  const next = ok(s, { type: "sleep" }).state;
  assert.equal(next.market.day, next.clock.day);
  assert.ok(C.marketToday(next).length > 0);
});

test("every ingredient has a cost, a speed and a stall", () => {
  for (const id of INGREDIENT_IDS) {
    const g = INGREDIENTS[id];
    assert.ok(Number.isInteger(g.cost) && g.cost > 0, id);
    assert.ok(g.speed > 0, id);
    assert.ok(Object.hasOwn(STALLS, g.stall), id);
  }
  // Every discovered recipe's needs can be bought on most days.
  for (const r of Object.values(RECIPES))
    for (const n of r.needs ?? []) assert.notEqual(INGREDIENTS[n].stall, "rare", n);
});

/** The market of each morning for `days` days of an idle game. */
function mornings(seed, days) {
  let s = C.newGame(seed);
  const out = [{ s, events: [] }];
  while (out.length < days) {
    s = ok(s, { type: "open" }).state;
    s = ok(s, { type: "close" }).state;
    const r = ok(s, { type: "sleep" });
    s = r.state;
    out.push({ s, events: r.events });
  }
  return out;
}

test("staples are out every day; the rest come and go; stock and prices stay in their bands", () => {
  const seen = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, 0]));
  const prices = Object.fromEntries(INGREDIENT_IDS.map((id) => [id, new Set()]));
  const DAYS = 120;
  for (const { s } of mornings(3, DAYS)) {
    for (const id of INGREDIENT_IDS) {
      const g = INGREDIENTS[id];
      const item = s.market.items[id];
      if (g.stall === "staple") assert.ok(item, `${id} missing on day ${s.clock.day}`);
      if (!item) continue;
      seen[id]++;
      prices[id].add(item.price);
      const [lo, hi] = STALLS[g.stall].stock;
      assert.ok(Number.isInteger(item.left) && item.left >= lo && item.left <= hi, id);
      assert.ok(item.price >= 1, id);
      assert.ok(Math.abs(s.market.drift[id] - 1) <= PRICE_BAND + 1e-9, id);
      assert.ok(
        Math.abs(item.price - g.cost) <= Math.ceil(g.cost * PRICE_BAND),
        `${id} ${item.price}`,
      );
    }
  }
  for (const id of INGREDIENT_IDS) {
    const rate = seen[id] / DAYS;
    const want = STALLS[INGREDIENTS[id].stall].chance;
    assert.ok(Math.abs(rate - want) < 0.15, `${id} out ${rate}, want about ${want}`);
  }
  // Prices move: a pricier ingredient sees several prices over a few months.
  assert.ok(prices.honey.size >= 2 && prices.whey.size >= 2, "prices never drift");
});

test("prices drift a little each day, not jump", () => {
  const days = mornings(8, 40);
  for (let i = 1; i < days.length; i++) {
    for (const id of INGREDIENT_IDS) {
      const a = days[i - 1].s.market.drift[id];
      const b = days[i].s.market.drift[id];
      assert.ok(Math.abs(a - b) <= 0.12 + 1e-3, `${id}: ${a} → ${b}`);
    }
  }
});

test("a rare ingredient at the market is announced", () => {
  const days = mornings(1, 60);
  const rareDays = days.filter(({ s }) => s.market.items.whey);
  assert.ok(rareDays.length > 0, "whey never came");
  for (const { s, events } of days.slice(1)) {
    const e = events.find((x) => x.type === "rareAtMarket");
    assert.deepEqual(e?.ingredients ?? [], s.market.items.whey ? ["whey"] : []);
  }
});

test("the market replays exactly from a seed, and seeds differ", () => {
  const a = mornings(12, 10).map(({ s }) => s.market);
  const b = mornings(12, 10).map(({ s }) => s.market);
  assert.deepEqual(a, b);
  assert.notDeepEqual(mornings(12, 5).at(-1).s.market, mornings(13, 5).at(-1).s.market);
});

test("a new timing ingredient works in the planner and the bench with no other code", () => {
  // Whey and oak leaves are only rows in content/ingredients.js.
  const order = { recipe: "kimchi", lo: 0.37, hi: 0.53, due: 3, arriveAt: 2 };
  const s = C.newGame(1);
  const plain = C.planFor(s, order, []);
  const whey = C.planFor(s, order, ["whey"]);
  const oak = C.planFor(s, order, ["oak"]);
  assert.ok(whey.right && oak.right);
  assert.ok(whey.f > plain.f && oak.f < plain.f);
  assert.ok(C.previewCurve("dill", ["whey"]).sooner > 0);
  assert.ok(C.previewCurve("dill", ["oak"]).sooner < 0);
});

test("an add-in that makes another recipe never plans as the order's recipe", () => {
  const s = C.newGame(1);
  for (const recipe of Object.keys(RECIPES))
    for (const id of INGREDIENT_IDS) {
      const order = { recipe, lo: 0.3, hi: 0.46, due: 4, arriveAt: 3 };
      const p = C.planFor(s, order, [id]);
      const mix = C.resolveMix(recipe, [id]);
      if (!p) continue;
      assert.equal(p.right, mix.recipe === recipe, `${recipe} + ${id}`);
      if (!p.right) assert.equal(p.fits, false);
    }
});
