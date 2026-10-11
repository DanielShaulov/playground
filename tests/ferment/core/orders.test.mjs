// Rule tests for orders and regulars: planFor, starting a jar for an order,
// bulk offers, and the regulars data.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";
import { REGULARS, REGULAR_IDS } from "../../../games/ferment/content/regulars.js";
import { DEMAND_SPREAD } from "../../../games/ferment/content/tuning.js";

function ok(s, action) {
  const r = C.step(s, action);
  assert.notEqual(r.events[0]?.type, "rejected", `${action.type} rejected: ${r.events[0]?.why}`);
  return r;
}
function rejected(s, action) {
  const r = C.step(s, action);
  assert.equal(r.events[0]?.type, "rejected", `${action.type} should be rejected`);
  assert.equal(r.state, s, "a rejected action returns the same state");
  return r.events[0].why;
}
const order = (extra = {}) => ({
  id: 900,
  kind: "preorder",
  name: "T",
  look: 1,
  recipe: "dill",
  lo: 0.22,
  hi: 0.38,
  due: 2,
  arriveAt: 6,
  arrived: false,
  ...extra,
});

test("planFor: a plain jar started on a morning lands where the hours say", () => {
  const s = C.newGame(1); // day 1, morning, hour 0
  const p = C.planFor(s, order());
  // Pickup is 24 + 6 = 30 h after starting; dill crosses the strip in 48 h.
  assert.equal(p.f, 30 / 48);
  assert.equal(p.fits, false, "0.625 is past a 0.22–0.38 window");
  assert.equal(p.right, true);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(p.lands.day === 1 && near(p.lands.hour, 0.22 * 48), "enters the window at 10.6 h");
  assert.ok(p.leaves.day === 1 && near(p.leaves.hour, 0.38 * 48), "leaves it at 18.2 h");
  assert.ok(p.late > 0, "the pickup comes after the window");
});

test("planFor: add-ins move the landing, and salt can make an order fit", () => {
  const s = C.newGame(1);
  const plain = C.planFor(s, order());
  const salted = C.planFor(s, order(), ["salt"]);
  assert.ok(salted.lands.hour > plain.lands.hour || salted.lands.day > plain.lands.day);
  assert.ok(Math.abs(salted.late) < Math.abs(plain.late));
  // salt: 64 h life, 30 h pickup → 0.469; still sour, so a later window fits.
  const fit = C.planFor(s, order({ lo: 0.4, hi: 0.56 }), ["salt"]);
  assert.equal(fit.fits, true);
});

test("planFor: a mix that makes another recipe is not right, and never fits", () => {
  const s = C.newGame(1);
  const p = C.planFor(s, order({ lo: 0, hi: 1 }), ["garlic"]);
  assert.equal(p.recipe, "garlicdill");
  assert.equal(p.right, false);
  assert.equal(p.fits, false);
  assert.equal(C.planFor(s, order(), ["nope"]), null);
});

test("planFor: an undiscovered recipe brings what it needs", () => {
  const s = C.newGame(1);
  const p = C.planFor(s, order({ recipe: "garlicdill" }));
  assert.deepEqual(p.adds, ["garlic"]);
  assert.equal(p.right, true);
});

test("startForOrder brews the order's recipe and remembers the jar", () => {
  let s = C.newGame(1);
  s = structuredClone(s);
  s.orders.list.push(order({ id: 77 }));
  assert.equal(rejected(s, { type: "startForOrder", orderId: 5, slot: 5 }), "no such order");
  assert.equal(rejected(s, { type: "startForOrder", orderId: 77, slot: 0 }), "slot is full");
  assert.equal(
    rejected(s, { type: "startForOrder", orderId: 77, slot: 5, adds: ["garlic"] }),
    "mix makes something else",
  );
  const r = ok(s, { type: "startForOrder", orderId: 77, slot: 5, adds: ["salt"] });
  const jar = r.state.shelf.slots[5];
  assert.equal(jar.recipe, "dill");
  assert.deepEqual(jar.adds, ["salt"]);
  assert.deepEqual(r.state.orders.list[0].jars, [jar.id]);
  assert.equal(r.state.shop.coins, s.shop.coins - RECIPES.dill.cost);
});

test("startForOrder on an undiscovered recipe brews its base and discovers it", () => {
  let s = structuredClone(C.newGame(1));
  s.pantry.stock.garlic = 1;
  s.orders.list.push(order({ id: 77, recipe: "garlicdill" }));
  const r = ok(s, { type: "startForOrder", orderId: 77, slot: 5 });
  assert.equal(r.state.shelf.slots[5].recipe, "garlicdill");
  assert.ok(r.state.bench.known.includes("garlicdill"));
  assert.ok(r.events.some((e) => e.type === "discovered"));
});

test("bulk offers can be accepted or declined, not taken twice", () => {
  let s = structuredClone(C.newGame(1));
  s.orders.offers.push(order({ id: 60, kind: "bulk", qty: 4, got: 0 }));
  const taken = ok(s, { type: "acceptOrder", orderId: 60 }).state;
  assert.equal(taken.orders.offers.length, 0);
  assert.equal(taken.orders.list[0].id, 60);
  assert.equal(rejected(taken, { type: "acceptOrder", orderId: 60 }), "no such offer");
  const gone = ok(s, { type: "declineOrder", orderId: 60 }).state;
  assert.equal(gone.orders.offers.length, 0);
  assert.equal(gone.orders.list.length, 0);
});

test("regulars: every taste sits inside the walk-in bell curve", () => {
  for (const id of REGULAR_IDS) {
    const r = REGULARS[id];
    assert.ok(Object.hasOwn(RECIPES, r.recipe), `${id}: unknown recipe`);
    const { mean } = C.demand(r.recipe);
    assert.ok(Math.abs(r.spot - mean) <= DEMAND_SPREAD, `${id}: spot outside the curve`);
    assert.ok(Number.isInteger(r.every) && r.every >= 1, `${id}: bad rhythm`);
    if (r.kind === "bulk") assert.ok(r.qty >= 2 && r.lead >= 1, `${id}: bulk needs qty and lead`);
  }
});
