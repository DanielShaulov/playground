// Rule tests for The Brine Nook core: one rule per test, built on step().
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";
import {
  SERVINGS,
  SLOTS,
  START_COINS,
  START_SHELF,
} from "../../../games/ferment/content/tuning.js";
import { playBot, BOTS } from "./helpers.mjs";

const jar = (recipe, f, id = 1) => ({
  id,
  recipe,
  age: f * RECIPES[recipe].hours,
  servings: SERVINGS,
});
const cust = (recipe, lo, hi, extra = {}) => ({
  id: 500,
  name: "T",
  look: 1,
  recipe,
  lo,
  hi,
  patience: 2,
  ...extra,
});

/** Apply an action that must succeed. */
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
function openShop(seed = 3) {
  return ok(C.newGame(seed), { type: "open" }).state;
}

test("flavour runs 0 → 1 with age, and the lid pops at 1", () => {
  assert.equal(C.flavour(jar("kimchi", 0)), 0);
  assert.equal(C.flavour(jar("kimchi", 0.5)), 0.5);
  assert.equal(C.flavour(jar("kimchi", 1.4)), 1);
  assert.equal(C.isOver(jar("kimchi", 0.99)), false);
  assert.equal(C.isOver(jar("kimchi", 1)), true);
  assert.equal(C.bandOf(0.1).id, "crisp");
  assert.equal(C.bandOf(0.4).id, "tangy");
  assert.equal(C.bandOf(0.99).id, "funky");
  assert.equal(C.bandOf(1).id, "funky");
});

test("inside the window pays at least full price; outside pays less, the further the less", () => {
  const c = { recipe: "kimchi", lo: 0.3, hi: 0.5 };
  const price = RECIPES.kimchi.price;
  const centre = C.judge(c, 0.4);
  const edge = C.judge(c, 0.3);
  const near = C.judge(c, 0.55);
  const far = C.judge(c, 0.95);
  assert.equal(centre.mood, "delight");
  assert.ok(centre.pay > edge.pay && edge.pay >= price);
  assert.ok(near.pay < price && far.pay < near.pay && far.pay > 0);
  assert.equal(near.mood, "ok");
  assert.equal(far.mood, "meh");
  assert.ok(C.judge({ ...c, orderId: 9 }, 0.4).pay > centre.pay, "pre-orders pay a bonus");
});

test("a new game starts on a morning with a shelf in progress", () => {
  const s = C.newGame(5);
  assert.deepEqual(s.clock, { day: 1, phase: "morning", hour: 0 });
  assert.equal(s.shop.coins, START_COINS);
  assert.equal(s.shelf.slots.length, SLOTS);
  assert.equal(s.shelf.slots.filter(Boolean).length, START_SHELF.length);
  assert.ok(
    s.shelf.slots.every((j) => !j || C.menu(s).includes(j.recipe)),
    "starters are on the menu",
  );
  assert.deepEqual(C.newGame(5), s, "same seed, same start");
});

test("brewing costs the recipe's price and fills the slot; refusals leave state alone", () => {
  const s = C.newGame(1);
  const r = ok(s, { type: "brew", slot: 5, recipe: "kimchi" });
  assert.equal(r.state.shop.coins, START_COINS - RECIPES.kimchi.cost);
  assert.equal(r.state.shelf.slots[5].recipe, "kimchi");
  assert.equal(r.state.shelf.slots[5].age, 0);
  assert.equal(s.shelf.slots[5], null, "step never mutates its input");
  assert.equal(rejected(r.state, { type: "brew", slot: 5, recipe: "dill" }), "slot is full");
  assert.equal(rejected(s, { type: "brew", slot: 5, recipe: "nope" }), "no such recipe");
  assert.equal(rejected(s, { type: "brew", slot: 5, recipe: "kraut" }), "recipe not unlocked");
  assert.equal(rejected(s, { type: "brew", slot: 99, recipe: "dill" }), "no such slot");
  const poor = structuredClone(s);
  poor.shop.coins = 3;
  assert.equal(rejected(poor, { type: "brew", slot: 5, recipe: "dill" }), "not enough coins");
});

test("serving uses a serving, pays, and a jar empties after SERVINGS sales", () => {
  let s = openShop();
  s.shelf.slots = Array(SLOTS).fill(null);
  s.shelf.slots[0] = jar("dill", 0.4);
  for (let i = 0; i < SERVINGS; i++) {
    s.customers.queue = [cust("dill", 0.3, 0.5, { id: 50 + i })];
    const r = ok(s, { type: "serve", slot: 0 });
    assert.ok(r.state.shop.coins > s.shop.coins);
    assert.equal(r.events[0].type, "served");
    assert.equal(r.events[0].mood, "delight");
    s = r.state;
  }
  assert.equal(s.shelf.slots[0], null);
  assert.equal(s.shop.today.served, SERVINGS);
  s.customers.queue = [cust("kimchi", 0.3, 0.5)];
  s.shelf.slots[1] = jar("dill", 0.4);
  assert.equal(rejected(s, { type: "serve", slot: 1 }), "wrong recipe");
  s.shelf.slots[2] = jar("kimchi", 1);
  assert.equal(rejected(s, { type: "serve", slot: 2 }), "jar has gone over");
});

test("sending someone away costs one reputation, a pre-order collector two", () => {
  let s = openShop();
  s.customers.queue = [cust("dill", 0.3, 0.5)];
  const rep = s.shop.rep;
  s = ok(s, { type: "sendAway" }).state;
  assert.equal(s.shop.rep, rep - 1);
  s.customers.queue = [cust("dill", 0.3, 0.5, { orderId: 77 })];
  s.orders.list = [
    {
      id: 77,
      name: "T",
      look: 1,
      recipe: "dill",
      lo: 0.3,
      hi: 0.5,
      due: 1,
      arriveAt: 1,
      arrived: true,
    },
  ];
  s = ok(s, { type: "sendAway" }).state;
  assert.equal(s.shop.rep, rep - 3);
  assert.equal(s.orders.list.length, 0);
  assert.equal(s.shop.today.missed, 1);
});

test("an impatient customer walks out", () => {
  let s = openShop();
  s.customers.nextArrival = 99; // no walk-ins
  s.customers.queue = [cust("dill", 0.3, 0.5, { patience: 0.02 })];
  const r = ok(s, { type: "tick", n: 3 });
  assert.equal(r.state.customers.queue.length, 0);
  assert.deepEqual(
    r.events.map((e) => [e.type, e.why]),
    [["left", "impatient"]],
  );
  assert.equal(r.state.shop.today.left, 1);
});

test("time only moves in whole steps while the shop is open", () => {
  const s = C.newGame(2);
  assert.equal(rejected(s, { type: "tick" }), "shop is not open");
  const open = openShop(2);
  assert.equal(rejected(open, { type: "tick", n: 0 }), "bad step count");
  assert.equal(rejected(open, { type: "tick", n: 1.5 }), "bad step count");
  const one = ok(open, { type: "tick" }).state;
  assert.equal(one.clock.hour, C.STEP);
  const j = open.shelf.slots[0];
  assert.equal(one.shelf.slots[0].age, j.age + C.STEP);
});

test("the shop closes itself at the end of the day, and sleeping ages jars to a full day", () => {
  let s = openShop(8);
  let closed = null;
  while (s.clock.phase === "open") {
    const r = ok(s, { type: "tick", n: 50 });
    closed ??= r.events.find((e) => e.type === "closed");
    s = r.state;
  }
  assert.ok(closed, "a closed event is emitted");
  assert.equal(s.clock.phase, "evening");
  assert.equal(s.customers.queue.length, 0);
  const age = s.shelf.slots.find(Boolean).age;
  const r = ok(s, { type: "sleep" });
  assert.equal(r.state.clock.day, 2);
  assert.equal(r.state.clock.phase, "morning");
  const id = s.shelf.slots.find(Boolean).id;
  const after = r.state.shelf.slots.find((x) => x?.id === id);
  assert.ok(Math.abs(after.age - (age + 12)) < 1e-9, "12h open + 12h overnight");
  assert.equal(r.events[0].type, "slept");
});

test("a pre-order comes back on its due day, and a jar started today can make it", () => {
  let s = openShop(4);
  s.customers.queue = [cust("kimchi", 0.3, 0.52, { id: 70, name: "Ama" })];
  const { state, events } = ok(s, { type: "preorder" });
  s = state;
  const order = events[0].order;
  assert.ok(order.due > s.clock.day);
  const start = s.shelf.slots.findIndex((j) => !j);
  s = ok(s, { type: "brew", slot: start, recipe: "kimchi" }).state;
  let seen = false;
  for (let guard = 0; guard < 20 && !seen; guard++) {
    while (s.clock.phase === "open") {
      const r = ok(s, { type: "tick", n: 6 });
      s = r.state;
      for (const e of r.events) {
        if (e.type === "arrived" && e.customer.orderId === order.id) {
          seen = true;
          assert.equal(s.clock.day, order.due);
          const f = C.flavour(s.shelf.slots[start]);
          assert.ok(f >= order.lo && f <= order.hi, `jar at ${f} too far from window`);
          // They jump the queue to the counter or right behind whoever is there.
          const at = s.customers.queue.findIndex((c) => c.orderId === order.id);
          assert.ok(at <= 1);
          while (s.customers.queue[0].orderId !== order.id) s = ok(s, { type: "sendAway" }).state;
          s = ok(s, { type: "serve", slot: start }).state;
        }
      }
      // Keep the counter clear of walk-ins so the run is about the order.
      while (s.customers.queue[0] && !s.customers.queue[0].orderId)
        s = ok(s, { type: "sendAway" }).state;
    }
    if (!seen) s = ok(ok(s, { type: "sleep" }).state, { type: "open" }).state;
  }
  assert.ok(seen, "pre-order customer never arrived");
  assert.ok(!s.orders.list.some((o) => o.id === order.id), "the order is closed");
});

test("a careful bot plays 10 days, makes money, and the same seed replays the same game", () => {
  const a = playBot(BOTS.careful, 11, 10);
  const b = playBot(BOTS.careful, 11, 10);
  assert.deepEqual(a.state, b.state);
  assert.ok(a.state.shop.coins > START_COINS, `bot ended with ${a.state.shop.coins} coins`);
  assert.equal(a.state.clock.day, 11);
  assert.deepEqual(JSON.parse(JSON.stringify(a.state)), a.state);
});
