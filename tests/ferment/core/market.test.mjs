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
  const s = C.newGame(1);
  assert.equal(s.market.day, 1);
  assert.ok(C.marketToday(s).length > 0);
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

test("every ingredient has a cost and a speed", () => {
  for (const id of INGREDIENT_IDS) {
    const g = INGREDIENTS[id];
    assert.ok(Number.isInteger(g.cost) && g.cost > 0, id);
    assert.ok(g.speed > 0, id);
  }
});
