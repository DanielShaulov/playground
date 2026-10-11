// Parity: the split core plays exactly like the demo's rules.js it replaced.
// Bots play both side by side; after every action the two states must match.
// The demo had one random seed; the core's "customers" stream is the only one
// in use, so the legacy game is seeded with that stream's starting value.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "./legacy/rules.js";
import { STEP } from "../../../games/ferment/core/index.js";
import { streamSeed } from "../../../games/ferment/core/rng.js";
import { playBot, BOTS } from "./helpers.mjs";

/** The new sliced state in the demo's flat shape. */
const flat = (s) => ({
  day: s.clock.day,
  phase: s.clock.phase,
  clock: s.clock.hour,
  coins: s.shop.coins,
  rep: s.shop.rep,
  nextId: s.meta.nextId,
  shelf: s.shelf.slots,
  queue: s.customers.queue,
  orders: s.orders.list,
  nextArrival: s.customers.nextArrival,
  today: s.shop.today,
  seed: s.meta.rng.customers ?? streamSeed(s.meta.seed, "customers"),
});
const legacyFlat = ({ v, ...rest }) => rest;

function applyLegacy(ls, a) {
  const res = {
    tick: () => {
      for (let i = 0; i < (a.n ?? 1); i++) L.tick(ls, STEP);
      return { ok: true };
    },
    open: () => L.openShop(ls),
    close: () => L.closeShop(ls),
    sleep: () => L.sleep(ls),
    brew: () => L.brew(ls, a.slot, a.recipe),
    tipOut: () => L.tipOut(ls, a.slot),
    serve: () => L.serve(ls, a.slot),
    preorder: () => L.preorder(ls),
    sendAway: () => L.sendAway(ls),
  }[a.type]();
  assert.ok(res.ok, `legacy refused ${a.type}: ${res.why}`);
}

for (const [name, bot] of Object.entries(BOTS)) {
  for (const seed of [1, 11, 2024, -7]) {
    test(`parity: ${name} bot, seed ${seed}, 8 days`, () => {
      const ls = L.newGame(0);
      ls.seed = streamSeed(seed, "customers");
      let steps = 0;
      playBot(bot, seed, 8, (before, action, r) => {
        if (steps === 0) assert.deepEqual(flat(before), legacyFlat(ls), "start states differ");
        applyLegacy(ls, action);
        steps++;
        assert.deepEqual(
          flat(r.state),
          legacyFlat(ls),
          `diverged after action ${steps}: ${JSON.stringify(action)}`,
        );
      });
      assert.ok(steps > 100);
    });
  }
}
