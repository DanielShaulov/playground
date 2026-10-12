// Invariant fuzzing: thousands of random action sequences must never reach an
// impossible state, never mutate step()'s input, and always survive a save.
// FUZZ_RUNS=<n> runs more sequences locally.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPE_IDS, TIER_IDS } from "../../../games/ferment/content/recipes.js";
import { UPGRADE_IDS } from "../../../games/ferment/content/upgrades.js";
import { TIERS } from "../../../games/ferment/content/goals.js";
import {
  MAX_QUEUE,
  OPEN_HOURS,
  REP_MAX,
  SERVINGS,
  SLOTS,
} from "../../../games/ferment/content/tuning.js";
import { testRng } from "./helpers.mjs";

const BASES = [...RECIPE_IDS, ...TIER_IDS];

const RUNS = Number(process.env.FUZZ_RUNS ?? 400);
const LENGTH = 400;

function randomAction(rnd, s, { validSlots = false } = {}) {
  const slot = () =>
    validSlots || rnd() < 0.9
      ? Math.floor(rnd() * s.shelf.slots.length)
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
    "startForOrder",
    "acceptOrder",
    "declineOrder",
    "upgrade",
    "claimGoal",
  ];
  const type = kinds[Math.floor(rnd() * kinds.length)];
  if (type === "brew")
    return {
      type,
      slot: slot(),
      recipe: rnd() < 0.95 ? BASES[Math.floor(rnd() * BASES.length)] : "toString",
    };
  if (type === "tipOut" || type === "serve") return { type, slot: slot() };
  if (type === "upgrade")
    return {
      type,
      id: rnd() < 0.95 ? UPGRADE_IDS[Math.floor(rnd() * UPGRADE_IDS.length)] : "toString",
      slot: slot(),
    };
  if (type === "tick") return { type, n: 1 + Math.floor(rnd() * 30) };
  if (type === "startForOrder" || type === "acceptOrder" || type === "declineOrder") {
    const list = type === "startForOrder" ? s.orders.list : s.orders.offers;
    const o = list[Math.floor(rnd() * list.length)];
    return { type, orderId: rnd() < 0.9 ? o?.id : 12345, slot: slot() };
  }
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
  assert.equal(s.shelf.slots.length, C.slotCount(s));
  assert.ok(s.shelf.slots.length >= SLOTS);
  for (const k of Object.keys(s.progress.crocks)) assert.ok(Number(k) < s.shelf.slots.length);
  assert.ok(s.progress.tier >= 0 && s.progress.tier < TIERS.length);
  assert.ok(TIERS[s.progress.tier].earned <= s.progress.stats.earned);
  const ids = new Set();
  const own = (id) => {
    assert.ok(Number.isInteger(id) && id < s.meta.nextId, `id ${id} not yet handed out`);
    assert.ok(!ids.has(id), `id ${id} used twice at ${at}`);
    ids.add(id);
  };
  for (const j of s.shelf.slots) {
    if (!j) continue;
    own(j.id);
    assert.ok(j.size >= SERVINGS, `jar size ${j.size}`);
    assert.ok(j.servings >= 1 && j.servings <= j.size, `jar servings ${j.servings}/${j.size}`);
    if (j.pace !== undefined) assert.ok(j.pace > 0 && j.pace !== 1, `jar pace ${j.pace}`);
    assert.ok(j.age >= 0);
  }
  for (const o of s.orders.list) {
    own(o.id);
    assert.ok(o.due >= s.clock.day, `order due day ${o.due} kept after day ${s.clock.day}`);
    if (o.kind === "bulk") assert.ok(o.got >= 0 && o.got < o.qty, `bulk order ${o.got}/${o.qty}`);
  }
  for (const o of s.orders.offers) {
    own(o.id);
    assert.equal(o.kind, "bulk");
  }
  if (s.clock.phase === "evening")
    assert.equal(s.orders.offers.length, 0, "offers outlast the day");
  const visits = s.orders.list.filter((o) => o.kind === "standing").map((o) => o.regular);
  assert.equal(new Set(visits).size, visits.length, "a regular booked twice");
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
  const seen = {};
  for (let run = 0; run < RUNS; run++) {
    const rnd = testRng(run * 7919 + 1);
    const fresh = C.newGame(Math.floor(rnd() * 2 ** 31));
    // Every fourth game is rich and well liked, so upgrades and tiers get bought and climbed.
    if (run % 4 === 0) {
      Object.assign(fresh.shop, { coins: 3000, rep: 9 });
      fresh.progress.stats.served = 9;
      fresh.progress.stats.earned = 5000;
    }
    let s = deepFreeze(fresh);
    for (let i = 0; i < LENGTH; i++) {
      const action = randomAction(rnd, s);
      const r = C.step(s, action); // throws on a frozen input if step() mutates it
      if (r.events[0]?.type === "rejected") {
        assert.equal(r.state, s);
        assert.equal(r.events.length, 1);
        continue;
      }
      accepted++;
      for (const e of r.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
      checkInvariants(r.state);
      s = deepFreeze(r.state);
    }
  }
  assert.ok(accepted > RUNS * LENGTH * 0.4, `only ${accepted} actions were accepted`);
  for (const type of ["upgraded", "tierUp", "goalReady", "claimedGoal"])
    assert.ok(seen[type] > 0, `no ${type} in ${RUNS} games`);
});
