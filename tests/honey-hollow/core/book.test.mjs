// Rule tests for the bee book: every key the core can raise has a way to be
// raised (so no page is unreachable), the keys are the ones rules.md lists,
// and pages are found once and stay unread until read.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  DAY,
  ok,
  no,
  edit,
  fresh,
  hive,
  bed,
  setDay,
  dayOn,
  flyDay,
  nextMorning,
  one,
  of,
  atStall,
  crowded,
  waspDay,
  playOut,
} from "./helpers.mjs";
import { makeBot } from "../sim/bots.mjs";
import { documentedTriggers } from "./docs.mjs";

const act = (s, ...actions) => actions.reduce((state, a) => ok(state, a).state, s);
const night = (s) => nextMorning(s).state;
const on = (doy, more = () => {}) =>
  edit(fresh(), (s) => {
    setDay(s, dayOn(doy), doy >= 21 ? "snow" : "sunny");
    more(s);
  });
/** A keeper with everything to hand. */
const rich = (more = () => {}) =>
  edit(fresh(), (s) => {
    s.purse.coins = 2000;
    s.hives.spare = 1;
    Object.assign(s.stock, {
      syrup: 1,
      remedy: 1,
      wax: 9,
      bunches: { lavender: 1 },
      honey: { "clover:1": 2 },
    });
    s.progress.stats.wax = 1;
    s.progress.unlocked.recipes = [...C.RECIPE_IDS];
    more(s);
  });
const jar = (stores, jars = 1) =>
  act(
    edit(fresh(), (s) => (hive(s).stores = stores)),
    { type: "harvest", hive: 1, jars },
  );
const sale = (arrange, wish) =>
  act(atStall(edit(fresh(), arrange), [wish], { "clover:1": 1 }), {
    type: "offer",
    product: "honey:clover:1",
  });
const swarmed = () => edit(night(night(crowded())), (s) => (s.hives.spare = 1));

/** For every key, the shortest way to raise it. */
const HOW = {
  "first-day": () => act(fresh(), { type: "startDay" }),
  "first-rain": () =>
    act(
      edit(fresh(), (s) => (s.weather.today = "rain")),
      { type: "startDay" },
    ),
  "first-harvest": () => jar({ wild: 20 }),
  "first-pure": () => jar({ clover: 16, wild: 4 }),
  "first-blend": () => jar({ wild: 20 }),
  "first-three-star": () => jar({ clover: 20 }),
  "first-wax": () => jar({ clover: 20 }, 2),
  "first-sale": () =>
    act(flyDay(rich()).state, { type: "sellToGrocer", product: "honey:clover:1", n: 1 }),
  "first-move": () => act(fresh(), { type: "moveHive", hive: 1, plot: "home", x: 0, y: 0 }),
  "first-candle": () => act(rich(), { type: "craft", recipe: "candle" }),
  "first-soap": () => act(rich(), { type: "craft", recipe: "soap" }),
  "first-balm": () => act(rich(), { type: "craft", recipe: "balm" }),
  "first-bunch": () =>
    act(
      on(8, (s) => bed(s, "home", 0, 0, "lavender")),
      { type: "pickBunch", plot: "home", x: 0, y: 0 },
    ),
  "first-queen-cells": () => night(crowded()),
  "first-swarm": () => night(night(crowded())),
  "first-catch": () => {
    const s = swarmed();
    return act(s, { type: "catchSwarm", swarm: s.hives.swarms[0].id, plot: "home", x: 0, y: 0 });
  },
  "first-split": () =>
    act(
      rich((s) => (hive(s).strength = 4)),
      { type: "split", hive: 1, plot: "home", x: 0, y: 0 },
    ),
  "first-mites": () =>
    night(on(14, (s) => Object.assign(hive(s), { mites: 39, stores: { ivy: 30 } }))),
  "first-remedy": () =>
    act(
      rich((s) => (hive(s).mites = 50)),
      { type: "remedy", hive: 1 },
    ),
  "first-wasps": () => act(waspDay(), { type: "tick", n: DAY }),
  "first-feed": () => act(rich(), { type: "feed", hive: 1, n: 1 }),
  "first-hungry": () => night(on(22)),
  "first-upgrade": () => act(rich(), { type: "upgradeHive", hive: 1 }),
  "second-hive": () => act(rich(), { type: "buyHive", plot: "home", x: 0, y: 0 }),
  "strength-max": () => night(night(fresh())),
  "season-summer": () => night(on(6)),
  "season-autumn": () => night(on(13)),
  "season-winter": () => night(on(20)),
  "second-spring": () => night(on(27)),
  "first-ribbon": () =>
    act(flyDay(on(20, (s) => (s.stock.honey = { "clover:1": 1 }))).state, {
      type: "enterShow",
      honeys: ["honey:clover:1"],
    }),
};
for (const plot of C.PLOT_IDS.slice(1))
  HOW[`plot-${plot}`] = () => act(rich(), { type: "buyPlot", plot });
for (const f of C.FLOWER_IDS) HOW[`honey-${f}`] = () => jar({ [f]: 20 });
for (const t of C.TIERS.slice(1))
  HOW[`renown-${t.tier}`] = () =>
    sale((s) => Object.assign(s.progress, { renown: t.renown - 1, tier: t.tier - 1 }), {
      type: "any",
    });
for (const r of C.REGULAR_IDS)
  T.HEART_GIFTS.forEach((hearts, i) => {
    HOW[`gift-${r}-${i + 1}`] = () =>
      sale(
        (s) => {
          s.regulars.hearts[r] = hearts - 1;
          s.regulars.gifts[r] = i;
        },
        { who: r, type: "any" },
      );
  });

test("the keys the core raises are exactly the keys rules.md lists", () => {
  assert.equal(new Set(C.TRIGGERS).size, C.TRIGGERS.length);
  assert.deepEqual([...C.TRIGGERS].sort(), documentedTriggers().sort());
});

test("every key can be raised, and brings its pages into the book unread", () => {
  assert.deepEqual(
    Object.keys(HOW).sort(),
    [...C.TRIGGERS].sort(),
    "a way to raise every key, and no key that is not one",
  );
  for (const key of C.TRIGGERS) {
    const s = HOW[key]();
    assert.ok(
      s.book.fired.includes(key),
      `${key} was not raised (raised: ${s.book.fired.join(" ")})`,
    );
    for (const f of C.FACTS.filter((f) => f.trigger === key)) {
      assert.ok(s.book.facts.includes(f.id), `${key} did not bring ${f.id}`);
      assert.ok(s.book.unread.includes(f.id));
    }
  }
  // A key with no page yet is remembered, so a page written later turns up on the next load.
  const quiet = HOW["gift-hattie-1"]();
  assert.ok(quiet.book.fired.includes("gift-hattie-1"));
  assert.equal(C.FACTS.filter((f) => f.trigger === "gift-hattie-1").length, 0);
});

test("a whole game raises nothing the list does not know", () => {
  const { state, events } = playOut(makeBot("completionist", 9), 9, 40);
  for (const key of state.book.fired) assert.ok(C.TRIGGERS.includes(key), key);
  for (const e of of(events, "factUnlocked"))
    assert.ok(
      C.TRIGGERS.includes(e.trigger) &&
        C.FACTS.some((f) => f.id === e.fact && f.trigger === e.trigger),
    );
  assert.ok(state.book.fired.length >= 15, `only ${state.book.fired.length} keys in 40 days`);
  assert.equal(of(events, "factUnlocked").length, state.book.facts.length);
});

test("pages: found once, and unread until they are read", () => {
  const first = C.FACTS.filter((f) => f.trigger === "first-day").map((f) => f.id);
  assert.ok(first.length >= 1);
  const day = ok(fresh(), { type: "startDay" });
  assert.deepEqual(
    of(day.events, "factUnlocked"),
    first.map((fact) => ({ type: "factUnlocked", fact, trigger: "first-day" })),
  );
  assert.deepEqual(day.state.book, { facts: first, unread: first, fired: ["first-day"] });
  const r = ok(day.state, { type: "readFact", fact: first[0] });
  assert.deepEqual(one(r.events, "factRead"), { type: "factRead", fact: first[0] });
  assert.deepEqual([r.state.book.facts, r.state.book.unread], [first, first.slice(1)]);
  no(r.state, { type: "readFact", fact: first[0] }, "already-read");
  no(r.state, { type: "readFact", fact: "nope" }, "no-fact");
  no(r.state, { type: "readFact" }, "no-fact");
  const again = ok(night(ok(r.state, { type: "tick", n: DAY }).state), { type: "startDay" });
  assert.equal(
    of(again.events, "factUnlocked").filter((e) => e.trigger === "first-day").length,
    0,
    "the second morning is not a first",
  );
});

test("loading: pages written since the save, for keys it had raised, turn up unread; pages that are gone drop out", () => {
  const first = C.FACTS.filter((f) => f.trigger === "first-day").map((f) => f.id);
  const old = edit(ok(fresh(), { type: "startDay" }).state, (s) => {
    s.book.facts = ["a-page-since-removed"];
    s.book.unread = ["a-page-since-removed", "never-found"];
  });
  const loaded = C.loadSave(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(loaded.book, { facts: first, unread: first, fired: ["first-day"] });
});
