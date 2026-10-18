// Onboarding: the player's start (intro, the keeper's parting jars), the
// first days' notes moving on with the game, and the promise that tips only
// ever read the game: a game with them plays exactly like one without.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../../games/ferment/core/index.js";
import { MOMENTS, MOMENT_IDS, MAX_TRIES, SCRIPT } from "../../../games/ferment/content/tutorial.js";
import { START_GIFT, START_SHELF } from "../../../games/ferment/content/tuning.js";
import { BOTS, bestJar } from "./helpers.mjs";

const ok = (s, a) => {
  const r = C.step(s, a);
  assert.notEqual(r.events[0]?.type, "rejected", `${JSON.stringify(a)}: ${r.events[0]?.why}`);
  return r;
};
const why = (s, a) => C.step(s, a).events.find((e) => e.type === "rejected")?.why;
const strip = (s) => {
  const { tutorial, ...rest } = s;
  return rest;
};

/**
 * A player who follows the notes: does what a beat asks, reads the rest, and
 * otherwise plays like the careful bot. `ui` beats are what the screen would
 * dispatch once the player has made that tap.
 */
/** What the learner starts when a note says to start a jar. */
let firstJar = "dill";

function learner(s) {
  const tip = C.tipNow(s);
  if (tip) {
    if (!tip.on) return { type: "tutorial", do: "next", id: tip.id };
    const c = s.customers.queue[0];
    if (tip.on.includes("brewed")) {
      const slot = s.shelf.slots.findIndex((j) => !j);
      return { type: "brew", slot, recipe: firstJar };
    }
    if (tip.on.includes("opened")) return { type: "open" };
    if (tip.on.includes("served") && c) {
      const best = freeBest(s, c);
      if (best >= 0) return { type: "serve", slot: best };
    }
    if (tip.on.includes("preordered") && c) return { type: "preorder" };
    const order = s.orders.list.find((o) => o.id === tip.order);
    if (tip.on.includes("held") && order) {
      const slot = s.shelf.slots
        .map((j, i) => ({ j, i }))
        .filter(({ j }) => j && j.recipe === order.recipe)
        .sort((a, b) => a.j.age - b.j.age)[0].i;
      return { type: "hold", orderId: order.id, slot };
    }
    if (tip.on.includes("startedForOrder") && order)
      return { type: "startForOrder", orderId: order.id, slot: s.shelf.slots.findIndex((j) => !j) };
    if (tip.on.includes("experimented")) {
      const ing = Object.keys(s.pantry.stock).find((id) => s.pantry.stock[id] > 0);
      if (ing) return { type: "experiment", recipe: "dill", adds: [ing] };
    }
  }
  // Like the careful bot, but never sells a portion kept for someone else.
  const c = s.customers.queue[0];
  if (s.clock.phase === "open" && c) {
    const best = freeBest(s, c);
    if (best >= 0) return { type: "serve", slot: best };
    return c.orderId ? { type: "sendAway" } : { type: "preorder" };
  }
  return BOTS.careful(s);
}

/** The best-paying jar the customer at the counter may have, or -1. */
function freeBest(s, c) {
  let best = -1,
    pay = 0;
  s.shelf.slots.forEach((j, i) => {
    if (!j || j.recipe !== c.recipe || C.isOver(j) || C.freePortions(s, j, c.orderId) < 1) return;
    const v = C.judge(c, C.flavour(j));
    if (v.pay > pay) ((best = i), (pay = v.pay));
  });
  return best;
}

function play(s, bot, days) {
  const events = [];
  for (let guard = 0; s.clock.day <= days; guard++) {
    if (guard > 200000) throw new Error("stuck");
    const r = ok(s, bot(s));
    events.push(...r.events);
    s = r.state;
  }
  return { s, events };
}

test("without the tutorial a new game is unchanged; with it, the keeper's jars and an empty shelf", () => {
  const plain = C.newGame(4);
  assert.deepEqual(plain.tutorial, C.SLICES.tutorial());
  assert.equal(plain.tutorial.on, false);
  assert.equal(plain.shelf.slots.filter(Boolean).length, START_SHELF.length);

  const s = C.newGame(4, { tutorial: true });
  assert.equal(s.tutorial.on, true);
  assert.equal(s.tutorial.intro, true);
  assert.equal(C.tipNow(s), null, "no note before the intro is over");
  assert.equal(s.shelf.slots.filter(Boolean).length, START_GIFT.length);
  for (const [slot, recipe] of START_GIFT) assert.equal(s.shelf.slots[slot].recipe, recipe);
  assert.deepEqual(C.newGame(4, { tutorial: true }), s, "same seed, same start");
});

test("the keeper's jars sell on the first morning", () => {
  const s = C.newGame(1, { tutorial: true });
  for (const [slot] of START_GIFT) {
    const jar = s.shelf.slots[slot];
    const { lo, hi } = C.recipeCard(s, jar.recipe).sweet;
    const f = C.flavour(jar);
    assert.ok(f >= lo - 0.05 && f <= hi, `${jar.recipe} at ${f} is near its best`);
  }
});

test("moment content is well formed", () => {
  for (const id of MOMENT_IDS) {
    assert.ok(MOMENTS[id].beats.length > 0, id);
    for (const b of MOMENTS[id].beats) {
      assert.ok(b.text && b.point, id);
      assert.ok(!(b.on && b.ui), `${id}: a beat moves on either by the game or by the screen`);
      for (const k of b.text.match(/\{\w+\}/g) ?? [])
        assert.ok(["{name}", "{tier}", "{opens}"].includes(k), `${id}: ${k}`);
    }
  }
});

test("day 1 morning: the intro, the gift note, then starting a jar, then the sign", () => {
  let s = C.newGame(2, { tutorial: true });
  assert.match(why(s, { type: "tutorial", do: "next", id: "gift" }), /no tip/);
  let r = ok(s, { type: "tutorial", do: "begin" });
  s = r.state;
  assert.deepEqual(r.events, [{ type: "tip", id: "gift" }]);
  assert.equal(C.tipNow(s).point, "gift");
  assert.match(why(s, { type: "tutorial", do: "next", id: "brew" }), /different/);
  r = ok(s, { type: "tutorial", do: "next", id: "gift" });
  s = r.state;
  assert.deepEqual(
    r.events.map((e) => e.type),
    ["tipDone", "tip"],
  );
  assert.equal(C.tipNow(s).id, "brew");
  s = ok(s, { type: "tutorial", do: "next", id: "brew" }).state; // the sheet opened
  assert.equal(C.tipNow(s).point, "sheet");
  assert.match(why(s, { type: "tutorial", do: "next", id: "brew" }), /waiting/);
  s = ok(s, { type: "brew", slot: 4, recipe: "dill" }).state;
  assert.equal(C.tipNow(s).point, "brewed");
  assert.equal(C.tipNow(s).slot, 4);
  s = ok(s, { type: "tutorial", do: "next", id: "brew" }).state;
  r = ok(s, { type: "open" });
  assert.ok(r.events.some((e) => e.type === "tipDone" && e.id === "brew"));
  assert.deepEqual(r.state.tutorial.done, ["gift", "brew"]);
});

test("opening early after starting a jar still counts the jar lesson as learnt", () => {
  let s = ok(C.newGame(2, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
  s = ok(s, { type: "tutorial", do: "next", id: "gift" }).state;
  s = ok(s, { type: "tutorial", do: "next", id: "brew" }).state;
  s = ok(s, { type: "brew", slot: 3, recipe: "kimchi" }).state;
  s = ok(s, { type: "open" }).state;
  assert.ok(s.tutorial.done.includes("brew"));
});

test("a moment that passes unfinished comes back, up to MAX_TRIES times", () => {
  let s = ok(C.newGame(3, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
  s = ok(s, { type: "tutorial", do: "next", id: "gift" }).state;
  for (let i = 1; i <= MAX_TRIES; i++) {
    assert.equal(C.tipNow(s)?.id, "brew", `morning ${i}`);
    s = ok(s, { type: "open" }).state; // walked past the note
    assert.equal(s.tutorial.tries.brew, i);
    s = ok(s, { type: "close" }).state;
    if (C.tipNow(s)) s = ok(s, { type: "tutorial", do: "skip" }).state;
    s.tutorial.on = true; // keep only the brew moment in play for this test
    s.tutorial.done.push("market", "bench", "serve", "regular", "tier");
    s = ok(s, { type: "sleep" }).state;
  }
  assert.ok(s.tutorial.done.includes("brew"));
  assert.equal(C.tipNow(s), null);
});

test("the first serve: the note waits on the customer, and goes if they leave", () => {
  let s = C.newGame(5, { tutorial: true });
  s.tutorial = { ...s.tutorial, intro: false, done: ["gift", "brew"] };
  s = ok(s, { type: "open" }).state;
  // Someone asking for a recipe the shelf can't give opens no note; wait for one it can.
  for (;;) {
    while (!s.customers.queue.length) s = ok(s, { type: "tick", n: 1 }).state;
    if (C.tipNow(s)) break;
    const front = s.customers.queue[0];
    assert.ok(bestJar(s, front) < 0 || front.regular, "a servable walk-in opens the serve note");
    s = ok(s, { type: "sendAway" }).state;
  }
  const c = s.customers.queue[0];
  const tip = C.tipNow(s);
  assert.equal(tip.id, "serve");
  assert.equal(tip.who, c.id);
  assert.equal(tip.name, c.name);
  // Sent away: the note goes, to come back with the next customer.
  const gone = ok(s, { type: "sendAway" }).state;
  assert.equal(gone.tutorial.now, null);
  assert.equal(gone.tutorial.tries.serve, 1);
  // Served straight off: skips to the last note.
  const served = ok(s, { type: "serve", slot: bestJar(s, c) }).state;
  assert.equal(C.tipNow(served).point, "coins");
  const after = ok(served, { type: "tutorial", do: "next", id: "serve" }).state;
  assert.ok(after.tutorial.done.includes("serve"));
});

test("a learner meets every moment in the first days", () => {
  let s = ok(C.newGame(1, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
  const { s: end, events } = play(s, learner, 8);
  const met = events.filter((e) => e.type === "tipDone").map((e) => e.id);
  assert.deepEqual([...met].sort(), [...MOMENT_IDS].sort(), `met: ${met.join(", ")}`);
  assert.equal(end.tutorial.now, null);
  for (const id of MOMENT_IDS) assert.equal(end.tutorial.tries[id] ?? 0, 0, `${id} passed by`);
});

test("with the notes skipped, the game plays exactly as one without them", () => {
  for (const seed of [1, 9, 23]) {
    const on = C.newGame(seed, { tutorial: true });
    const off = structuredClone(on);
    off.tutorial = C.SLICES.tutorial();
    const begun = ok(on, { type: "tutorial", do: "begin" }).state;
    const a = play(ok(begun, { type: "tutorial", do: "skip" }).state, BOTS.careful, 5).s;
    const b = play(off, BOTS.careful, 5).s;
    assert.deepEqual(strip(a), strip(b), `seed ${seed}`);
  }
});

test("day 1's scripted customers: one served now, one kept for, one new jar, all just right", () => {
  for (const [seed, jar] of [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
    [n, "dill"],
    [n, "kimchi"],
  ])) {
    firstJar = jar;
    let s = ok(C.newGame(seed, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
    const { events } = play(s, learner, 3);
    const arrivals = events.filter((e) => e.type === "arrived" && e.customer.script);
    assert.deepEqual(
      arrivals.map((e) => e.customer.script),
      SCRIPT.map((x) => x.as),
      `seed ${seed}, ${jar} first: every case came in`,
    );
    const firstFit = events.find((e) => e.type === "served" && e.customer.script === "serve");
    assert.ok(firstFit, `seed ${seed}: the first customer was served`);
    assert.ok(firstFit.f >= firstFit.customer.lo && firstFit.f <= firstFit.customer.hi);
    for (const as of ["keep", "fresh"]) {
      const booked = events.find((e) => e.type === "preordered" && e.customer.script === as);
      assert.ok(booked, `seed ${seed}: ${as} booked`);
      const how = as === "keep" ? "held" : "startedForOrder";
      assert.ok(
        events.some((e) => e.type === how && e.order.id === booked.order.id),
        `seed ${seed}: ${as} got its jar`,
      );
      const back = events.find(
        (e) => e.type === "served" && e.customer.orderId === booked.order.id,
      );
      assert.ok(back, `seed ${seed}: ${as} came back and was served`);
      assert.ok(
        back.f >= back.customer.lo && back.f <= back.customer.hi,
        `seed ${seed}: ${as}'s jar was just right (${back.f.toFixed(2)} in ${back.customer.lo.toFixed(2)}–${back.customer.hi.toFixed(2)})`,
      );
    }
  }
});

test("skip turns notes off; replay starts again from the intro", () => {
  let s = ok(C.newGame(6, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
  s = ok(s, { type: "tutorial", do: "skip" }).state;
  assert.equal(C.tipNow(s), null);
  assert.match(why(s, { type: "tutorial", do: "skip" }), /off/);
  s = ok(s, { type: "open" }).state;
  s = ok(s, { type: "tick", n: 400 }).state;
  assert.equal(C.tipNow(s), null, "no notes once skipped");
  const r = ok(s, { type: "tutorial", do: "replay" });
  assert.ok(r.events.some((e) => e.type === "tutorialReplayed"));
  assert.equal(r.state.tutorial.intro, true);
  assert.deepEqual(r.state.tutorial.done, []);
  // A plain game can replay too (the settings screen offers it to everyone).
  assert.equal(ok(C.newGame(6), { type: "tutorial", do: "replay" }).state.tutorial.on, true);
  assert.match(why(s, { type: "tutorial", do: "dance" }), /no such/);
});

test("a save mid-tutorial loads as it was, and an old save gets tips off", () => {
  let s = ok(C.newGame(8, { tutorial: true }), { type: "tutorial", do: "begin" }).state;
  s = ok(s, { type: "tutorial", do: "next", id: "gift" }).state;
  s = ok(s, { type: "tutorial", do: "next", id: "brew" }).state;
  assert.equal(C.tipNow(s).point, "sheet");
  assert.deepEqual(C.loadSave(JSON.parse(JSON.stringify(s))), s);
  const old = JSON.parse(JSON.stringify(C.newGame(8)));
  delete old.tutorial;
  assert.equal(C.loadSave(old).tutorial.on, false);
});
