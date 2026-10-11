// Invariant fuzzing: thousands of random action sequences must never reach an
// impossible state, never mutate step()'s input, and always survive a save.
// The second test also plays every random sequence on the demo's frozen rules
// and demands the same outcome, accepted or refused, action by action.
// FUZZ_RUNS=<n> runs more sequences locally.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import * as L from "./legacy/rules.js";
import { streamSeed } from "../../../games/ferment/core/rng.js";
import { RECIPE_IDS } from "../../../games/ferment/content/recipes.js";
import {
  MAX_QUEUE,
  OPEN_HOURS,
  REP_MAX,
  SERVINGS,
  SLOTS,
} from "../../../games/ferment/content/tuning.js";
import { testRng } from "./helpers.mjs";

const RUNS = Number(process.env.FUZZ_RUNS ?? 400);
const LENGTH = 400;

function randomAction(rnd, s, { validSlots = false } = {}) {
  const slot = () =>
    validSlots || rnd() < 0.9
      ? Math.floor(rnd() * SLOTS)
      : [-1, 9, 1.5, "2", null][Math.floor(rnd() * 5)];
  const r = rnd();
  // Mostly let time run while open; otherwise anything goes, valid or not.
  if (s.clock.phase === "open" && r < 0.55) return { type: "tick", n: 1 + Math.floor(rnd() * 30) };
  const kinds = [
    "open",
    "close",
    "sleep",
    "brew",
    "tipOut",
    "serve",
    "preorder",
    "sendAway",
    "tick",
  ];
  const type = kinds[Math.floor(rnd() * kinds.length)];
  if (type === "brew")
    return {
      type,
      slot: slot(),
      recipe: rnd() < 0.95 ? RECIPE_IDS[Math.floor(rnd() * RECIPE_IDS.length)] : "toString",
    };
  if (type === "tipOut" || type === "serve") return { type, slot: slot() };
  if (type === "tick") return { type, n: 1 + Math.floor(rnd() * 30) };
  return { type };
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function checkInvariants(s) {
  const at = `day ${s.clock.day} ${s.clock.phase} ${s.clock.hour.toFixed(3)}`;
  assert.ok(Number.isInteger(s.shop.coins) && s.shop.coins >= 0, `coins ${s.shop.coins} at ${at}`);
  assert.ok(
    Number.isInteger(s.shop.rep) && s.shop.rep >= 0 && s.shop.rep <= REP_MAX,
    `rep ${s.shop.rep}`,
  );
  assert.ok(["morning", "open", "evening"].includes(s.clock.phase));
  assert.ok(s.clock.hour >= 0 && s.clock.hour <= OPEN_HOURS, `hour ${s.clock.hour}`);
  assert.equal(s.shelf.slots.length, SLOTS);
  const ids = new Set();
  const own = (id) => {
    assert.ok(Number.isInteger(id) && id < s.meta.nextId, `id ${id} not yet handed out`);
    assert.ok(!ids.has(id), `id ${id} used twice at ${at}`);
    ids.add(id);
  };
  for (const j of s.shelf.slots) {
    if (!j) continue;
    own(j.id);
    assert.ok(j.servings >= 1 && j.servings <= SERVINGS, `jar servings ${j.servings}`);
    assert.ok(j.age >= 0);
  }
  for (const o of s.orders.list) {
    own(o.id);
    assert.ok(o.due >= s.clock.day, `order due day ${o.due} kept after day ${s.clock.day}`);
  }
  if (s.clock.phase !== "open")
    assert.equal(s.customers.queue.length, 0, `queue left over at ${at}`);
  const collectors = s.customers.queue.filter((c) => c.orderId).length;
  assert.ok(s.customers.queue.length - collectors <= MAX_QUEUE, "too many walk-ins queued");
  for (const c of s.customers.queue) {
    own(c.id);
    assert.ok(c.lo >= 0 && c.hi <= 1 && c.lo < c.hi);
    if (c.orderId)
      assert.ok(
        s.orders.list.some((o) => o.id === c.orderId),
        "collector without an order",
      );
  }
  const json = JSON.parse(JSON.stringify(s));
  assert.deepEqual(json, s, "state must round-trip through JSON");
  assert.deepEqual(C.loadSave(json), s, "state must survive loadSave");
}

test(`fuzz: ${RUNS} random games of ${LENGTH} actions keep every invariant`, () => {
  let accepted = 0;
  for (let run = 0; run < RUNS; run++) {
    const rnd = testRng(run * 7919 + 1);
    let s = deepFreeze(C.newGame(Math.floor(rnd() * 2 ** 31)));
    for (let i = 0; i < LENGTH; i++) {
      const action = randomAction(rnd, s);
      const r = C.step(s, action); // throws on a frozen input if step() mutates it
      if (r.events[0]?.type === "rejected") {
        assert.equal(r.state, s);
        assert.equal(r.events.length, 1);
        continue;
      }
      accepted++;
      checkInvariants(r.state);
      s = deepFreeze(r.state);
    }
  }
  assert.ok(accepted > RUNS * LENGTH * 0.4, `only ${accepted} actions were accepted`);
});

test("fuzz parity: random games play the same on the core and the demo's rules", () => {
  const legacy = {
    tick: (ls, a) => {
      if (ls.phase !== "open") return { ok: false };
      for (let i = 0; i < a.n && ls.phase === "open"; i++) L.tick(ls, C.STEP);
      return { ok: true };
    },
    open: (ls) => L.openShop(ls),
    close: (ls) => L.closeShop(ls),
    sleep: (ls) => L.sleep(ls),
    brew: (ls, a) => L.brew(ls, a.slot, a.recipe),
    tipOut: (ls, a) => L.tipOut(ls, a.slot),
    serve: (ls, a) => L.serve(ls, a.slot),
    preorder: (ls) => L.preorder(ls),
    sendAway: (ls) => L.sendAway(ls),
  };
  for (let run = 0; run < Math.ceil(RUNS / 3); run++) {
    const rnd = testRng(run * 104729 + 3);
    const seed = Math.floor(rnd() * 2 ** 31);
    let s = C.newGame(seed);
    const ls = L.newGame(0);
    ls.seed = streamSeed(seed, "customers");
    for (let i = 0; i < LENGTH; i++) {
      const action = randomAction(rnd, s, { validSlots: true });
      if (action.recipe === "toString") action.recipe = "nope"; // the demo looked recipes up on a plain object
      const r = C.step(s, action);
      const ok = legacy[action.type](ls, action).ok;
      assert.equal(
        r.events[0]?.type !== "rejected",
        ok,
        `run ${run} action ${i} ${JSON.stringify(action)}: accept/refuse differs`,
      );
      s = r.state;
      assert.equal(s.meta.nextId, ls.nextId);
      assert.equal(s.shop.coins, ls.coins);
      assert.equal(s.shop.rep, ls.rep);
      assert.equal(s.clock.hour, ls.clock);
      assert.deepEqual(s.shelf.slots, ls.shelf);
      assert.deepEqual(s.customers.queue, ls.queue);
      assert.deepEqual(s.orders.list, ls.orders);
      assert.deepEqual(s.shop.today, ls.today);
    }
  }
});
