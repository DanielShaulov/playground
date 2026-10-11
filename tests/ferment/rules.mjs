// Rules checks for The Brine Nook demo. Run: npm run test:ferment
import assert from "node:assert/strict";
import * as R from "../../games/ferment/rules.js";

const jar = (recipe, f) => ({ id: 1, recipe, age: f * R.RECIPES[recipe].hours, servings: 3 });

// Flavour runs 0 → 1 with age, and the lid pops at 1.
{
  assert.equal(R.flavour(jar("kimchi", 0)), 0);
  assert.equal(R.flavour(jar("kimchi", 0.5)), 0.5);
  assert.equal(R.isOver(jar("kimchi", 0.99)), false);
  assert.equal(R.isOver(jar("kimchi", 1)), true);
  assert.equal(R.bandOf(0.1).id, "crisp");
  assert.equal(R.bandOf(0.4).id, "tangy");
  assert.equal(R.bandOf(0.99).id, "funky");
}

// Inside the window pays at least full price; outside pays less, the further the less.
{
  const c = { recipe: "kimchi", lo: 0.3, hi: 0.5 };
  const price = R.RECIPES.kimchi.price;
  const centre = R.judge(c, 0.4);
  const edge = R.judge(c, 0.3);
  const near = R.judge(c, 0.55);
  const far = R.judge(c, 0.95);
  assert.equal(centre.mood, "delight");
  assert.ok(centre.pay > edge.pay && edge.pay >= price);
  assert.ok(near.pay < price && far.pay < near.pay && far.pay > 0);
  assert.equal(far.mood, "meh");
}

// Serving uses a serving, pays, and a jar empties after SERVINGS sales.
{
  const s = R.newGame(3);
  s.shelf = Array(R.SLOTS).fill(null);
  s.shelf[0] = jar("dill", 0.4);
  R.openShop(s);
  for (let i = 0; i < R.SERVINGS; i++) {
    s.queue = [{ id: 50 + i, name: "T", look: 1, recipe: "dill", lo: 0.3, hi: 0.5, patience: 2 }];
    const before = s.coins;
    const res = R.serve(s, 0);
    assert.ok(res.ok, res.why);
    assert.ok(s.coins > before);
  }
  assert.equal(s.shelf[0], null);
  s.queue = [{ id: 60, name: "T", look: 1, recipe: "kimchi", lo: 0.3, hi: 0.5, patience: 2 }];
  s.shelf[1] = jar("dill", 0.4);
  assert.equal(R.serve(s, 1).ok, false, "wrong recipe must be refused");
}

// A pre-order comes back on its due day, and a jar started today can make it.
{
  const s = R.newGame(4);
  R.openShop(s);
  s.queue = [{ id: 70, name: "Ama", look: 2, recipe: "kimchi", lo: 0.3, hi: 0.52, patience: 2 }];
  const { order } = R.preorder(s);
  assert.ok(order.due > s.day);
  const start = s.shelf.findIndex((j) => !j);
  assert.ok(R.brew(s, start, "kimchi").ok);
  let seen = false;
  for (let guard = 0; guard < 20 && !seen; guard++) {
    while (s.phase === "open") {
      for (const e of R.tick(s, 0.05)) {
        if (e.type === "arrived" && e.customer.orderId === order.id) {
          seen = true;
          assert.equal(s.day, order.due);
          const f = R.flavour(s.shelf[start]);
          assert.ok(f >= order.lo && f <= order.hi, `jar at ${f} too far from window`);
          const res = R.serve(s, start);
          assert.ok(res.ok);
        }
      }
      // Keep the counter clear of walk-ins so the run is about the order.
      while (s.queue[0] && !s.queue[0].orderId) R.sendAway(s);
    }
    if (!seen) {
      R.sleep(s);
      R.openShop(s);
    }
  }
  assert.ok(seen, "pre-order customer never arrived");
}

// A greedy shopkeeper plays 10 days without errors and makes money; same seed, same game.
function play(seed) {
  const s = R.newGame(seed);
  for (let d = 0; d < 10; d++) {
    s.shelf.forEach((j, i) => {
      if (j && R.isOver(j)) R.tipOut(s, i);
      if (!s.shelf[i]) R.brew(s, i, R.RECIPE_IDS[(i + d) % 4]);
    });
    R.openShop(s);
    while (s.phase === "open") {
      R.tick(s, 0.05);
      const c = s.queue[0];
      if (!c) continue;
      let best = -1,
        bestPay = 0;
      s.shelf.forEach((j, i) => {
        if (!j || j.recipe !== c.recipe || R.isOver(j)) return;
        const v = R.judge(c, R.flavour(j));
        if (v.pay > bestPay) ((best = i), (bestPay = v.pay));
      });
      if (best >= 0) R.serve(s, best);
      else if (!c.orderId) R.preorder(s);
      else R.sendAway(s);
    }
    assert.equal(s.queue.length, 0);
    R.sleep(s);
  }
  return s;
}
{
  const a = play(11);
  const b = play(11);
  assert.deepEqual(a, b, "same seed must replay identically");
  assert.ok(a.coins > 40, `bot ended with ${a.coins} coins`);
  assert.equal(a.day, 11);
  JSON.parse(JSON.stringify(a));
  console.log(`bot after 10 days: ${a.coins} coins, rep ${a.rep}`);
}

console.log("ferment rules: ok");
