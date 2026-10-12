// Progression: upgrades, reputation tiers and the endless goals ladder.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { UPGRADES, UPGRADE_IDS } from "../../../games/ferment/content/upgrades.js";
import { GOALS, GOAL_TEXT, MORE, TIERS } from "../../../games/ferment/content/goals.js";
import { SERVINGS, SLOTS } from "../../../games/ferment/content/tuning.js";

test("a new game starts at the first tier and rung, with nothing bought", () => {
  const s = C.newGame(1);
  assert.deepEqual(s.progress, C.SLICES.progress());
  assert.equal(C.tierOf(s), 0);
  assert.equal(C.slotCount(s), SLOTS);
  assert.equal(C.jarSize(s), SERVINGS);
  assert.deepEqual(C.crockAt(s, 0), { id: null, pace: 1 });
  const g = C.goalNow(s);
  assert.equal(g.i, 0);
  assert.deepEqual(g.goal, GOALS[0]);
  assert.equal(g.ready, false);
});

test("upgrade content is well formed", () => {
  for (const id of UPGRADE_IDS) {
    const u = UPGRADES[id];
    assert.ok(["shelf", "jars", "crock"].includes(u.kind), id);
    assert.ok(u.levels.length >= 1, id);
    for (const l of u.levels) {
      assert.ok(l.cost > 0, id);
      assert.ok(Number.isInteger(l.tier) && l.tier >= 0 && l.tier < TIERS.length, id);
    }
    if (u.kind === "crock") {
      assert.equal(u.levels.length, 1, `${id}: a crock is bought once per spot`);
      assert.ok(u.pace > 0 && u.pace !== 1, id);
    }
    if (u.kind === "shelf") assert.ok(u.slots > 0, id);
  }
});

test("tiers climb in reputation from the start", () => {
  assert.equal(TIERS[0].rep, 0);
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].rep > TIERS[i - 1].rep);
});

test("the ladder never ends and keeps asking more", () => {
  const seen = {};
  for (let i = 0; i < GOALS.length + MORE.length * 6; i++) {
    const g = C.goalAt(i);
    assert.ok(Object.hasOwn(GOAL_TEXT, g.kind), `rung ${i}`);
    assert.ok(g.n > 0 && g.reward.coins > 0, `rung ${i}`);
    assert.ok(!C.goalText(g).includes("{"), `rung ${i} text`);
    if (i >= GOALS.length) {
      if (seen[g.kind] !== undefined) assert.ok(g.n > seen[g.kind], `rung ${i} asks more`);
      seen[g.kind] = g.n;
    }
  }
});

test("every upgrade is offered, none bought", () => {
  const offers = C.upgradeOffers(C.newGame(1));
  assert.deepEqual(
    offers.map((o) => o.id),
    UPGRADE_IDS,
  );
  for (const o of offers) {
    assert.equal(o.level, 0);
    assert.equal(o.next.level, 1);
    assert.equal(o.locked, o.next.tier > 0);
  }
});
