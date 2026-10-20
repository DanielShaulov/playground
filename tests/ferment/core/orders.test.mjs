// Rule tests for orders and regulars: planFor, starting a jar for an order,
// bulk offers, and the regulars data.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES, VARIANT_IDS } from "../../../games/ferment/content/recipes.js";
import { NAMES } from "../../../games/ferment/content/names.js";
import { REGULARS, REGULAR_IDS } from "../../../games/ferment/content/regulars.js";
import { BULK_MISS, DEMAND_SPREAD, SLOTS } from "../../../games/ferment/content/tuning.js";

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

/** Sleep through to the morning of `day` (shop opened and closed each day). */
function toMorning(s, day) {
  while (s.clock.day < day || s.clock.phase !== "morning") {
    if (s.clock.phase === "morning") s = ok(s, { type: "open" }).state;
    else if (s.clock.phase === "open") s = ok(s, { type: "close" }).state;
    else s = ok(s, { type: "sleep" }).state;
  }
  return s;
}
/** Tick the open shop until `pred(state, events)` holds; returns the state. */
function tickUntil(s, pred) {
  for (let i = 0; i < 2000 && s.clock.phase === "open"; i++) {
    const r = ok(s, { type: "tick", n: 3 });
    s = r.state;
    // Keep walk-ins away from the counter so the test is about orders.
    while (s.customers.queue[0] && !s.customers.queue[0].orderId && !s.customers.queue[0].regular)
      s = ok(s, { type: "sendAway" }).state;
    if (pred(s, r.events)) return s;
  }
  assert.fail("never happened");
}
const plainJar = (recipe, f, id) => ({
  id,
  recipe,
  age: f * RECIPES[recipe].hours,
  servings: 2,
});

/** Mrs. Okafor's first day: she drops in as a walk-in and is served at her spot. */
function okaforJoins(seed = 5) {
  let s = structuredClone(toMorning(C.newGame(seed), 2));
  s = ok(s, { type: "open" }).state;
  s = tickUntil(s, (x) => x.customers.queue[0]?.regular === "okafor");
  s = structuredClone(s);
  s.shelf.slots[8] = plainJar("dill", REGULARS.okafor.spot, 9000);
  s.meta.nextId = Math.max(s.meta.nextId, 9001);
  return ok(s, { type: "serve", slot: 8 });
}

test("a regular-to-be drops in as a walk-in first, with nothing on the board", () => {
  const s = toMorning(C.newGame(5), 2);
  assert.ok(s.regulars.met.okafor?.pending, "Mrs. Okafor started dropping in on day 2");
  assert.equal(
    s.orders.list.find((o) => o.regular === "okafor"),
    undefined,
    "no visit booked",
  );
  assert.equal(s.regulars.met.kenji, undefined, "Kenji waits for a better reputation");
  let open = ok(s, { type: "open" }).state;
  open = tickUntil(open, (x) => x.customers.queue[0]?.regular === "okafor");
  const c = open.customers.queue[0];
  assert.equal(c.orderId, undefined, "a walk-in, not an order");
  assert.equal(c.recipe, REGULARS.okafor.recipe);
  assert.ok(c.lo < REGULARS.okafor.spot && REGULARS.okafor.spot < c.hi);
});

test("served, a regular-to-be becomes a regular and their next visit is booked", () => {
  const r = okaforJoins();
  const s = r.state;
  assert.equal(r.events[0].mood, "delight");
  assert.ok(r.events.some((e) => e.type === "regularJoined" && e.regular === "okafor"));
  const met = s.regulars.met.okafor;
  assert.equal(met.pending, undefined);
  assert.deepEqual(
    { since: met.since, visits: met.visits, happy: met.happy },
    { since: 2, visits: 1, happy: 1 },
  );
  const next = s.orders.list.find((o) => o.regular === "okafor");
  assert.equal(next.kind, "standing");
  assert.equal(next.due, 2 + REGULARS.okafor.every);
  assert.equal(next.arriveAt, REGULARS.okafor.hour);
});

test("a regular-to-be who books ahead becomes a regular from that order", () => {
  let s = structuredClone(toMorning(C.newGame(5), 2));
  s = ok(s, { type: "open" }).state;
  s = tickUntil(s, (x) => x.customers.queue[0]?.regular === "okafor");
  const r = ok(s, { type: "preorder" });
  const order = r.state.orders.list.find((o) => o.regular === "okafor");
  assert.equal(order.kind, "standing");
  assert.equal(r.state.regulars.met.okafor.pending, undefined);
  assert.ok(r.events.some((e) => e.type === "regularJoined"));
});

test("a regular-to-be who isn't served drops in again the next day", () => {
  let s = structuredClone(toMorning(C.newGame(5), 2));
  s = ok(s, { type: "open" }).state;
  s = tickUntil(s, (x) => x.customers.queue[0]?.regular === "okafor");
  s = ok(s, { type: "sendAway" }).state;
  s = toMorning(s, 3);
  assert.ok(s.regulars.met.okafor.pending);
  s = ok(s, { type: "open" }).state;
  tickUntil(s, (x) => x.customers.queue[0]?.regular === "okafor");
});

test("a regular's visit: served at their spot, they come back `every` days later", () => {
  let s = structuredClone(toMorning(okaforJoins().state, 4));
  const visit = s.orders.list.find((o) => o.regular === "okafor");
  assert.equal(visit.due, 4);
  s.shelf.slots[7] = plainJar("dill", REGULARS.okafor.spot - visit.arriveAt / 48, 9100);
  s = ok(s, { type: "open" }).state;
  s = tickUntil(s, (x) => x.customers.queue[0]?.regular === "okafor");
  const r = ok(s, { type: "serve", slot: 7 });
  assert.equal(r.events[0].mood, "delight");
  s = r.state;
  assert.deepEqual(
    { visits: s.regulars.met.okafor.visits, happy: s.regulars.met.okafor.happy },
    { visits: 2, happy: 2 },
  );
  const next = s.orders.list.find((o) => o.regular === "okafor");
  assert.equal(next.due, 4 + REGULARS.okafor.every);
  assert.ok(r.events.some((e) => e.type === "booked"));
});

test("a missed visit costs reputation and they still come back", () => {
  let s = toMorning(okaforJoins().state, 4);
  const rep = s.shop.rep;
  s = ok(s, { type: "open" }).state;
  s = ok(s, { type: "close" }).state; // closed before she arrived
  assert.equal(s.regulars.met.okafor.missed, 1);
  assert.equal(s.shop.rep, Math.max(0, rep - 2));
  assert.equal(s.orders.list.find((o) => o.regular === "okafor").due, 4 + REGULARS.okafor.every);
});

test("a bulk order: offered, accepted, and filled one whole jar at a time", () => {
  let s = toMorning(C.newGame(5), 4);
  const offer = s.orders.offers.find((o) => o.regular === "noodlebar");
  assert.ok(offer, "the noodle bar offers an order on day 4");
  assert.equal(offer.qty, REGULARS.noodlebar.qty);
  assert.equal(offer.due, 4 + REGULARS.noodlebar.lead);
  // Not taking it: it lapses at closing, at no cost.
  const lapsed = ok(ok(s, { type: "open" }).state, { type: "close" }).state;
  assert.equal(lapsed.orders.offers.length, 0);
  assert.ok(!lapsed.orders.list.some((o) => o.regular === "noodlebar"));

  s = ok(s, { type: "acceptOrder", orderId: offer.id }).state;
  s = structuredClone(toMorning(s, offer.due));
  const mid = (offer.lo + offer.hi) / 2 - offer.arriveAt / 48;
  for (let i = 0; i < SLOTS; i++) s.shelf.slots[i] = plainJar("dill", mid, 9000 + i);
  s.meta.nextId = 9100;
  s = ok(s, { type: "open" }).state;
  s = tickUntil(s, (x) => x.customers.queue[0]?.regular === "noodlebar");
  const coins = s.shop.coins;
  const first = ok(s, { type: "serve", slot: 0 });
  const e = first.events[0];
  assert.equal(e.type, "delivered");
  assert.equal(e.done, false);
  assert.equal(first.state.shelf.slots[0], null, "the whole jar goes");
  assert.equal(first.state.shop.coins - coins, e.pay);
  assert.equal(e.pay, C.judge(first.state.customers.queue[0], C.flavour(s.shelf.slots[0])).pay * 2);
  s = first.state;
  for (let i = 1; i < offer.qty; i++) s = ok(s, { type: "serve", slot: i }).state;
  assert.ok(!s.orders.list.some((o) => o.regular === "noodlebar"), "order closed");
  assert.notEqual(s.customers.queue[0]?.regular, "noodlebar", "they left");
  assert.equal(s.regulars.met.noodlebar.visits, 1);
});

test("a bulk order missed costs more than a pre-order", () => {
  let s = toMorning(C.newGame(5), 4);
  const offer = s.orders.offers[0];
  s = ok(s, { type: "acceptOrder", orderId: offer.id }).state;
  s = structuredClone(toMorning(s, offer.due));
  s.shop.rep = 8;
  s.orders.list = s.orders.list.filter((o) => o.kind === "bulk");
  s = ok(ok(s, { type: "open" }).state, { type: "close" }).state;
  assert.equal(s.shop.rep, 8 - BULK_MISS);
  assert.ok(BULK_MISS > 2);
});

test("off-menu requests: asked for something undiscovered, they leave a hint", () => {
  // Find a walk-in asking off the menu in a long game.
  let s = C.newGame(2);
  let found = null;
  for (let day = 0; day < 30 && !found; day++) {
    s = ok(s, { type: "open" }).state;
    while (s.clock.phase === "open" && !found) {
      const r = ok(s, { type: "tick", n: 6 });
      s = r.state;
      found = r.events.find((e) => e.type === "arrived" && e.customer.offMenu);
      if (found) break;
      while (s.customers.queue[0]) s = ok(s, { type: "sendAway" }).state;
    }
    if (!found) s = ok(s, { type: "sleep" }).state;
  }
  assert.ok(found, "nobody asked off the menu in 30 days");
  const c = found.customer;
  assert.ok(RECIPES[c.recipe].base, "an off-menu request is for a discovered recipe");
  assert.ok(!s.bench.known.includes(c.recipe));
  assert.ok(s.bench.hints.includes(c.recipe), "the bench hints at it");
  while (s.customers.queue[0].id !== c.id) s = ok(s, { type: "sendAway" }).state;
  const rep = s.shop.rep;
  assert.equal(ok(s, { type: "sendAway" }).state.shop.rep, rep, "no grudge");
});

test("an off-menu request for a hidden recipe puts it on the card as a hint", () => {
  let s = structuredClone(C.newGame(2));
  // Only Black garlic kimchi is left to discover, and it starts hidden.
  s.bench.known = VARIANT_IDS.filter((id) => id !== "funkykimchi");
  s.bench.hints = [];
  let seen = null;
  for (let day = 0; day < 40 && !seen; day++) {
    s = ok(s, { type: "open" }).state;
    while (s.clock.phase === "open" && !seen) {
      const r = ok(s, { type: "tick", n: 6 });
      s = r.state;
      seen = r.events.find((e) => e.type === "hinted");
      while (s.customers.queue[0]) s = ok(s, { type: "sendAway" }).state;
    }
    if (!seen) s = ok(s, { type: "sleep" }).state;
  }
  assert.ok(seen);
  assert.equal(seen.recipe, "funkykimchi");
  const card = C.recipeCard(s, "kimchi");
  assert.equal(card.found.find((f) => f.recipe === "funkykimchi").state, "hinted");
});

test("walk-ins never borrow a regular's name", () => {
  for (const id of REGULAR_IDS) assert.ok(!NAMES.includes(REGULARS[id].name), REGULARS[id].name);
});

test("a reputation regular needs both their day and the reputation", () => {
  let s = structuredClone(toMorning(C.newGame(5), 4));
  s.shop.rep = 9;
  s = ok(ok(ok(s, { type: "open" }).state, { type: "close" }).state, { type: "sleep" }).state;
  assert.ok(s.regulars.met.kenji, "day 5 with a good name: Kenji comes");
  let low = structuredClone(toMorning(C.newGame(5), 4));
  low.shop.rep = 2;
  low = ok(ok(ok(low, { type: "open" }).state, { type: "close" }).state, { type: "sleep" }).state;
  assert.equal(low.regulars.met.kenji, undefined, "not at reputation 2");
});

test("off-menu requests stay on the board until the recipe is discovered", () => {
  let s = structuredClone(C.newGame(2));
  let seen = null;
  for (let day = 0; day < 40 && !seen; day++) {
    s = ok(s, { type: "open" }).state;
    while (s.clock.phase === "open" && !seen) {
      const r = ok(s, { type: "tick", n: 6 });
      s = r.state;
      seen = r.events.find((e) => e.type === "arrived" && e.customer.offMenu)?.customer;
      while (s.customers.queue[0]) s = ok(s, { type: "sendAway" }).state;
    }
    if (!seen) s = ok(s, { type: "sleep" }).state;
  }
  assert.ok(seen);
  const asked = s.orders.asked.find((a) => a.recipe === seen.recipe);
  assert.deepEqual(asked, {
    recipe: seen.recipe,
    name: seen.name,
    look: seen.look,
    day: s.clock.day,
  });
  // Discover it at the bench: the request is answered.
  s = structuredClone(ok(s, { type: "close" }).state);
  const { base, needs } = RECIPES[seen.recipe];
  for (const n of needs) s.pantry.stock[n] = 1;
  s = ok(s, { type: "experiment", recipe: base, adds: needs }).state;
  assert.ok(!s.orders.asked.some((a) => a.recipe === seen.recipe));
});

test("hold: portions set aside for orders are only for their customers", () => {
  let s = C.newGame(1);
  s.orders.list.push(order(), order({ id: 901, name: "U", due: 3 }));
  // Slot 0 starts as a dill jar with SERVINGS portions; hold one for each order.
  const jar0 = s.shelf.slots[0];
  assert.equal(jar0.servings, 2, "this test assumes two portions a jar");
  s = ok(s, { type: "hold", orderId: 900, slot: 0 }).state;
  assert.equal(rejected(s, { type: "hold", orderId: 900, slot: 0 }), "already set aside");
  assert.equal(rejected(s, { type: "hold", orderId: 900, slot: 1 }), "wrong recipe");
  const open = (st, c) => {
    const x = structuredClone(st);
    x.clock.phase = "open";
    x.customers.queue = [c];
    return x;
  };
  const walkIn = { id: 77, name: "W", look: 2, recipe: "dill", lo: 0, hi: 1, patience: 2 };

  // One portion is still free: a walk-in can have it.
  assert.equal(C.freePortions(s, s.shelf.slots[0]), 1);
  const sold = ok(open(s, walkIn), { type: "serve", slot: 0 }).state;
  assert.equal(sold.shelf.slots[0].servings, 1);
  assert.equal(rejected(sold, { type: "hold", orderId: 901, slot: 0 }), "no portion free");

  // Both portions set aside: walk-ins can't, either order's customer can.
  s = ok(s, { type: "hold", orderId: 901, slot: 0 }).state;
  assert.deepEqual(
    C.holdsOn(s, s.shelf.slots[0]).map((h) => h.order.id),
    [900, 901],
  );
  assert.equal(rejected(open(s, walkIn), { type: "serve", slot: 0 }), "set aside for someone else");
  const collector = { ...order(), id: 78, orderId: 900, patience: 3 };
  const served = ok(open(s, collector), { type: "serve", slot: 0 }).state;
  assert.equal(served.orders.list.length, 1, "900 is collected");
  assert.equal(C.freePortions(served, served.shelf.slots[0]), 0, "the last portion is still U's");

  // Letting go: the hold collected last goes first.
  const freed = ok(open(s, walkIn), { type: "release", slot: 0 }).state;
  assert.deepEqual(
    C.holdsOn(freed, freed.shelf.slots[0]).map((h) => h.order.id),
    [900],
  );
  ok(freed, { type: "serve", slot: 0 });
  const both = ok(freed, { type: "release", slot: 0, orderId: 900 }).state;
  assert.equal(rejected(both, { type: "release", slot: 0 }), "not set aside");
});

test("hold: a bulk order sets the whole jar aside", () => {
  let s = C.newGame(1);
  s.orders.list.push(order({ kind: "bulk", qty: 2, got: 0 }), order({ id: 901 }));
  s = ok(s, { type: "hold", orderId: 900, slot: 0 }).state;
  assert.equal(C.freePortions(s, s.shelf.slots[0]), 0);
  assert.equal(rejected(s, { type: "hold", orderId: 901, slot: 0 }), "no portion free");
  // And it needs the whole jar free.
  let t = C.newGame(1);
  t.orders.list.push(order({ kind: "bulk", qty: 2, got: 0 }), order({ id: 901 }));
  t = ok(t, { type: "hold", orderId: 901, slot: 0 }).state;
  assert.equal(rejected(t, { type: "hold", orderId: 900, slot: 0 }), "no portion free");
});

test("startForOrder: the new jar is set aside for that order", () => {
  let s = C.newGame(1);
  s.orders.list.push(order());
  s = ok(s, { type: "startForOrder", orderId: 900, slot: 5 }).state;
  assert.deepEqual(
    C.holdsOn(s, s.shelf.slots[5]).map((h) => h.order.id),
    [900],
  );
});

test("startForOrder: after closing, the jar goes on tonight and ripens overnight", () => {
  let s = structuredClone(C.newGame(1));
  s.clock.phase = "evening";
  s.clock.hour = 9; // closed early
  s.orders.list.push(order({ due: 4 }));
  const plan = C.planFor(s, s.orders.list[0], ["salt"], 5);
  const coins = s.shop.coins;
  s = ok(s, { type: "startForOrder", orderId: 900, slot: 5, adds: ["salt"] }).state;
  const jar = s.shelf.slots[5];
  assert.equal(jar.recipe, "dill");
  assert.equal(s.shop.coins, coins - RECIPES.dill.cost, "paid tonight");
  assert.deepEqual(s.orders.list[0].jars, [jar.id]);
  s = ok(s, { type: "sleep" }).state;
  assert.equal(s.shelf.slots[5].age, 24 - 9, "the rest of the night is its head start");
  // The planner said so: tonight's jar is further along at pickup than one started at opening.
  assert.ok(plan.f > C.planFor(s, s.orders.list[0], ["salt"], 5).f);
});
