// Saves: a state survives JSON, a save missing a slice gets its defaults, and
// anything else (including the demo's pre-split saves) starts a fresh game.
// Playtest saves are disposable until release, so there is no migration.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { playBot, BOTS } from "./helpers.mjs";

test("a mid-game state round-trips through a save", () => {
  const { state } = playBot(BOTS.careful, 5, 2);
  assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(state))), state);
});

test("a save missing a slice, or a field in one, gets the defaults", () => {
  const s = JSON.parse(JSON.stringify(C.newGame(9)));
  delete s.orders;
  delete s.customers.nextArrival;
  const loaded = C.loadSave(s);
  assert.deepEqual(loaded.orders, C.SLICES.orders());
  assert.equal(loaded.customers.nextArrival, 0);
  assert.deepEqual(loaded.shelf, s.shelf);
});

test("unknown slices are dropped, so an old build ignores a newer one's extras", () => {
  const s = { ...JSON.parse(JSON.stringify(C.newGame(9))), market: { stock: [] } };
  assert.equal("market" in C.loadSave(s), false);
});

test("the demo's flat v1 save and garbage start a fresh game", () => {
  const demo = {
    v: 1,
    seed: 4,
    day: 3,
    phase: "morning",
    clock: 0,
    coins: 80,
    rep: 6,
    nextId: 20,
    shelf: Array(9).fill(null),
    queue: [],
    orders: [],
  };
  assert.equal(C.loadSave(demo), null);
  for (const junk of [null, undefined, 3, "x", [], {}, { meta: {} }])
    assert.equal(C.loadSave(junk), null);
  const bad = JSON.parse(JSON.stringify(C.newGame(1)));
  bad.shelf.slots[0] = { id: 1, recipe: "toString", age: 0, servings: 2 };
  assert.equal(C.loadSave(bad), null);
});
