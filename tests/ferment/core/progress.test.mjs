// Progression: upgrades, reputation tiers and the endless goals ladder.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { UPGRADES, UPGRADE_IDS } from "../../../games/ferment/content/upgrades.js";
import { GOALS, GOAL_TEXT, MORE, TIERS } from "../../../games/ferment/content/goals.js";
import { REP_MAX, SERVINGS, SLOTS } from "../../../games/ferment/content/tuning.js";
import { RECIPES, RECIPE_IDS, TIER_IDS } from "../../../games/ferment/content/recipes.js";
import { REGULARS, REGULAR_IDS } from "../../../games/ferment/content/regulars.js";
import { MAX_STOCK } from "../../../games/ferment/content/ingredients.js";

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

test("tiers climb in reputation and takings from the start", () => {
  assert.equal(TIERS[0].earned, 0);
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].earned > TIERS[i - 1].earned);
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

// ---- Rules ----

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
/** A day-1 evening with an empty shelf, `coins` and the shop at `tier`. */
function evening({ coins = 1000, tier = 0 } = {}) {
  const s = C.newGame(1);
  s.clock.phase = "evening";
  s.clock.hour = 12;
  s.shelf.slots = Array(SLOTS).fill(null);
  s.shop.coins = coins;
  s.progress.tier = tier;
  s.progress.stats.earned = TIERS[tier].earned;
  return s;
}
const morning = (s) => ok(s, { type: "sleep" }).state;
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("upgrades are bought in the evening, need the tier and the coins", () => {
  const s = evening({ coins: 1000, tier: 0 });
  assert.equal(rejected(s, { type: "upgrade", id: "shelf" }), "needs a higher tier");
  assert.equal(rejected(s, { type: "upgrade", id: "nope" }), "no such upgrade");
  assert.equal(rejected(s, { type: "upgrade", id: "toString" }), "no such upgrade");
  const poor = evening({ coins: 10, tier: 1 });
  assert.equal(rejected(poor, { type: "upgrade", id: "shelf" }), "not enough coins");
  const open = evening({ tier: 1 });
  open.clock.phase = "open";
  assert.equal(rejected(open, { type: "upgrade", id: "shelf" }), "only in the evening");
});

test("more shelf space adds spots that work like any other, and saves keep them", () => {
  const s0 = evening({ coins: 5000, tier: 3 });
  const { state: s1, events } = ok(s0, { type: "upgrade", id: "shelf" });
  assert.deepEqual(events, [
    { type: "upgraded", id: "shelf", level: 1, cost: UPGRADES.shelf.levels[0].cost },
  ]);
  assert.equal(s1.shop.coins, 5000 - UPGRADES.shelf.levels[0].cost);
  assert.equal(s1.shelf.slots.length, SLOTS + UPGRADES.shelf.slots);
  assert.equal(C.slotCount(s1), s1.shelf.slots.length);
  let s = morning(s1);
  const last = s.shelf.slots.length - 1;
  s = ok(s, { type: "brew", slot: last, recipe: "dill" }).state;
  assert.equal(s.shelf.slots[last].recipe, "dill");
  rejected(s, { type: "brew", slot: last + 1, recipe: "dill" });
  assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(s))), s);
  // A save whose shelf doesn't match what was bought starts fresh.
  const bad = JSON.parse(JSON.stringify(s));
  bad.shelf.slots.pop();
  assert.equal(C.loadSave(bad), null);
  // Every level, then nothing more.
  let t = s1;
  for (let i = 1; i < UPGRADES.shelf.levels.length; i++)
    t = ok(t, { type: "upgrade", id: "shelf" }).state;
  assert.equal(t.shelf.slots.length, SLOTS + UPGRADES.shelf.slots * UPGRADES.shelf.levels.length);
  assert.equal(rejected(t, { type: "upgrade", id: "shelf" }), "nothing more to buy");
});

test("a crock's pace is stored on the jar, and planFor with that slot stays true", () => {
  let s = evening({ coins: 1000, tier: 1 });
  assert.equal(rejected(s, { type: "upgrade", id: "warm" }), "no such slot");
  s = ok(s, { type: "upgrade", id: "warm", slot: 2 }).state;
  assert.equal(rejected(s, { type: "upgrade", id: "warm", slot: 2 }), "already fitted");
  assert.deepEqual(C.crockAt(s, 2), { id: "warm", pace: UPGRADES.warm.pace });
  s = morning(s);
  const o = {
    recipe: "dill",
    lo: 0.4,
    hi: 0.56,
    due: s.clock.day + 1,
    arriveAt: 4,
  };
  const plain = C.planFor(s, o, []);
  const warm = C.planFor(s, o, [], 2);
  assert.equal(plain.pace, 1);
  assert.equal(warm.pace, UPGRADES.warm.pace);
  assert.ok(warm.f > plain.f, "a warm crock gets further by pickup");
  s = ok(s, { type: "brew", slot: 2, recipe: "dill" }).state;
  s = ok(s, { type: "brew", slot: 3, recipe: "dill" }).state;
  assert.equal(s.shelf.slots[2].pace, UPGRADES.warm.pace);
  assert.equal("pace" in s.shelf.slots[3], false, "a plain crock stores no pace");
  // Age both jars to the pickup and compare with the plans.
  const hours = 24 + 4;
  const aged = (j) => ({ ...j, age: j.age + hours });
  assert.ok(near(C.flavour(aged(s.shelf.slots[2])), warm.f));
  assert.ok(near(C.flavour(aged(s.shelf.slots[3])), plain.f));
  assert.ok(near(C.forecast("dill", hours, [], UPGRADES.warm.pace), warm.f));
  assert.ok(near(C.ageAt("dill", [], 1, UPGRADES.warm.pace), 48 / UPGRADES.warm.pace));
  // Swapping the crock later changes nothing about the jar already in it.
  s.clock.phase = "evening";
  s = ok(s, { type: "upgrade", id: "cool", slot: 2 }).state;
  assert.equal(s.shelf.slots[2].pace, UPGRADES.warm.pace);
  assert.deepEqual(C.crockAt(s, 2), { id: "cool", pace: UPGRADES.cool.pace });
});

test("a plain crock leaves a jar exactly as before", () => {
  const j = { id: 1, recipe: "kimchi", age: 30, servings: 2, size: 2, adds: ["salt"] };
  assert.equal(C.flavour({ ...j, pace: 1 }), C.flavour(j));
  assert.equal(C.forecast("kimchi", 30, ["salt"], 1), C.forecast("kimchi", 30, ["salt"]));
  assert.equal(C.forecast("kimchi", 30, [], 1), 30 / 72);
});

test("bigger jars hold one more portion, and every portion sells", () => {
  let s = evening({ coins: 1000, tier: 2 });
  s = ok(s, { type: "upgrade", id: "bigjars" }).state;
  assert.equal(C.jarSize(s), SERVINGS + 1);
  s = morning(s);
  s = ok(s, { type: "brew", slot: 0, recipe: "dill" }).state;
  const jar = s.shelf.slots[0];
  assert.equal(jar.size, SERVINGS + 1);
  assert.equal(jar.servings, SERVINGS + 1);
  assert.equal(C.freePortions(s, jar), SERVINGS + 1);
  jar.age = 0.3 * 48;
  s = ok(s, { type: "open" }).state;
  for (let i = 0; i < SERVINGS + 1; i++) {
    s.customers.queue = [
      { id: 5000 + i, name: "T", look: 1, recipe: "dill", lo: 0.2, hi: 0.4, patience: 2 },
    ];
    s = ok(s, { type: "serve", slot: 0 }).state;
  }
  assert.equal(s.shelf.slots[0], null, "empty after its last portion");
  assert.equal(s.progress.stats.served, SERVINGS + 1);
});

test("tiers climb with lifetime takings, never drop, and unlock recipes and regulars", () => {
  const s0 = C.newGame(1);
  s0.progress.stats.earned = TIERS[1].earned - 1;
  assert.deepEqual(C.menu(s0).includes("beets"), false);
  rejected(s0, { type: "brew", slot: 5, recipe: "beets" });
  // Full hearts alone don't climb a tier.
  const loved = structuredClone(s0);
  loved.shop.rep = REP_MAX;
  assert.equal(C.tierOf(ok(loved, { type: "open" }).state), 0);
  s0.progress.stats.earned = TIERS[1].earned;
  // Any accepted action notices the climb.
  const { state: s1, events } = ok(s0, { type: "open" });
  assert.deepEqual(
    events.filter((e) => e.type === "tierUp"),
    [{ type: "tierUp", tier: 1 }],
  );
  assert.equal(C.tierOf(s1), 1);
  assert.ok(C.menu(s1).includes("beets"));
  assert.ok(!C.menu(s1).includes("lemons"));
  const s2 = ok(s1, { type: "brew", slot: 5, recipe: "beets" }).state;
  assert.equal(s2.shelf.slots[5].recipe, "beets");
  // Reputation falls, the tier stays.
  s2.shop.rep = 0;
  const s3 = ok(s2, { type: "close" }).state;
  assert.equal(C.tierOf(s3), 1);
  assert.ok(C.menu(s3).includes("beets"));
  // The tier's regular starts the next morning, as a walk-in first.
  const s4 = ok(s3, { type: "sleep" }).state;
  assert.equal(s4.regulars.met.ames?.pending, true);
  assert.ok(!s4.orders.list.some((o) => o.regular === "ames"), "no visit on the board yet");
});

test("several tiers at once climb one by one", () => {
  const s = C.newGame(1);
  s.progress.stats.earned = 1e6;
  const { state, events } = ok(s, { type: "open" });
  assert.deepEqual(
    events.filter((e) => e.type === "tierUp").map((e) => e.tier),
    [1, 2, 3],
  );
  assert.equal(C.tierOf(state), TIERS.length - 1);
});

test("tier content: recipes and regulars name a real tier, and regulars want unlocked recipes", () => {
  for (const id of TIER_IDS) {
    const t = RECIPES[id].tier;
    assert.ok(t >= 1 && t < TIERS.length, id);
  }
  for (const id of REGULAR_IDS) {
    const r = REGULARS[id];
    const t = r.joins.tier ?? 0;
    assert.ok(t < TIERS.length, id);
    assert.ok((RECIPES[r.recipe].tier ?? 0) <= t, `${id} wants a recipe locked at their tier`);
  }
});

test("goals count what happens, say when they're met, and pay out once claimed", () => {
  let s = C.newGame(1);
  s.shelf.slots = Array(SLOTS).fill(null);
  s.shelf.slots[0] = { id: 900, recipe: "dill", age: 0.3 * 48, servings: 99, size: 99 };
  s = ok(s, { type: "open" }).state;
  assert.equal(rejected(s, { type: "claimGoal" }), "not done yet");
  const ready = [];
  let earned = 0;
  for (let i = 0; i < GOALS[0].n; i++) {
    s.customers.queue = [
      { id: 6000 + i, name: "T", look: 1, recipe: "dill", lo: 0.2, hi: 0.4, patience: 2 },
    ];
    const r = ok(s, { type: "serve", slot: 0 });
    earned += r.events.find((e) => e.type === "served").pay;
    ready.push(...r.events.filter((e) => e.type === "goalReady"));
    s = r.state;
  }
  assert.equal(ready.length, 1, "said once");
  assert.equal(ready[0].i, 0);
  assert.equal(s.progress.stats.served, GOALS[0].n);
  assert.equal(s.progress.stats.earned, earned);
  assert.ok(s.progress.stats.delight > 0);
  const g = C.goalNow(s);
  assert.equal(g.ready, true);
  assert.equal(g.text, `Sell ${GOALS[0].n} portions`);
  const coins = s.shop.coins;
  const { state, events } = ok(s, { type: "claimGoal" });
  assert.equal(state.shop.coins, coins + GOALS[0].reward.coins);
  assert.equal(state.progress.goal, 1);
  assert.deepEqual(events[0], { type: "claimedGoal", i: 0, goal: GOALS[0] });
  assert.equal(rejected(state, { type: "claimGoal" }), "not done yet");
});

test("a reward's pantry stock tops up to the pantry's limit", () => {
  const s = C.newGame(1);
  const i = GOALS.findIndex((g) => g.reward.stock);
  assert.equal(GOALS[i].kind, "recipes");
  s.progress.goal = i;
  s.bench.known = ["garlicdill", "honeyhot", "pearkimchi"];
  const [id, n] = Object.entries(GOALS[i].reward.stock)[0];
  s.pantry.stock[id] = MAX_STOCK - n + 1;
  const after = ok(s, { type: "claimGoal" }).state;
  assert.equal(after.pantry.stock[id], MAX_STOCK);
});

test("a claimed rung whose next one is already met says so at once", () => {
  const s = C.newGame(1);
  s.progress.stats.served = 10;
  s.progress.stats.orders = 5;
  const { events } = ok(s, { type: "claimGoal" });
  assert.deepEqual(
    events.map((e) => e.type),
    ["claimedGoal", "goalReady"],
  );
});

test("the best day is kept at closing", () => {
  let s = C.newGame(1);
  s = ok(s, { type: "open" }).state;
  s.shop.today.earned = 77;
  s = ok(s, { type: "close" }).state;
  assert.equal(s.progress.stats.bestDay, 77);
  s = ok(ok(s, { type: "sleep" }).state, { type: "open" }).state;
  s.shop.today.earned = 20;
  s = ok(s, { type: "close" }).state;
  assert.equal(s.progress.stats.bestDay, 77);
});

test("state measures read the shop as it is", () => {
  const s = C.newGame(1);
  assert.equal(C.measure(s, "recipes"), RECIPE_IDS.length);
  assert.equal(C.measure(s, "rep"), s.shop.rep);
  assert.equal(C.measure(s, "upgrades"), 0);
  s.regulars.met = { okafor: { since: 1, visits: 0, happy: 0, missed: 0, pending: true } };
  assert.equal(C.measure(s, "regulars"), 0);
  s.regulars.met.bram = { since: 1, visits: 1, happy: 0, missed: 0 };
  assert.equal(C.measure(s, "regulars"), 1);
  s.progress.upgrades.shelf = 2;
  s.progress.crocks[0] = "cool";
  assert.equal(C.measure(s, "upgrades"), 3);
});
