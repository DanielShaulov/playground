// Invariant fuzzing: thousands of actions, sensible and senseless, and after
// every one the state must still be a game somebody could play.
//
// Each run mixes a keeper bot (so the game gets somewhere: plots, hives, the
// stall, the workshop, winter) with random actions aimed at whatever is on
// the table, and with plain rubbish. Held every step: a refused action hands
// back the same object, the input is never written to, no coin, jar or store
// goes negative, nothing is NaN, stores fit the hive, a square holds one
// thing, strength stays between 1 and the hive's limit. Held now and then:
// the state survives JSON and loadSave unchanged, and a lazy keeper can pick
// the game up from there and play on without one refused action; and the
// screens' read-only helpers (careOf, canBuyHive, canCatchSwarm, canBuyPlot,
// canCraftNow, recipesNow, grocerQuote, forecast) say what step() says.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  deepFreeze,
  invariants,
  roundTrips,
  rngOf,
  edit,
  fresh,
  idleTo,
  dry,
  careByStep,
  buyByStep,
  catchByStep,
} from "./helpers.mjs";
import { makeBot, play } from "../sim/bots.mjs";
import { documentedWhys } from "./docs.mjs";

const STEPS = Number(process.env.FUZZ_STEPS ?? 2500);
const SEEDS = Number(process.env.FUZZ_SEEDS ?? 6);

const PRODUCTS = [
  ...C.FLOWER_IDS.flatMap((f) => [1, 2, 3].map((n) => `honey:${f}:${n}`)),
  "honey:blend:0",
  ...C.GOOD_IDS.map((g) => `good:${g}`),
  "honey:nope:1",
  "honey:clover:9",
  "good:nope",
  "",
  7,
  null,
];
const JUNK = [
  undefined,
  null,
  -1,
  0,
  1.5,
  99,
  NaN,
  Infinity,
  "x",
  "",
  {},
  [],
  true,
  "__proto__",
  "constructor",
];
const ITEMS = ["syrup", "spare", "remedy", "nope", 3];

/** One random action, aimed at the state often enough to land. */
function randomAction(s, rnd) {
  const coord = () => (rnd() < 0.9 ? rnd.below(T.PLOT_W) : rnd.pick(JUNK));
  const owned = C.PLOT_IDS.filter((p) => s.land.plots[p].owned);
  const plot = () =>
    rnd() < 0.8 ? rnd.pick(owned) : rnd() < 0.8 ? rnd.pick(C.PLOT_IDS) : rnd.pick(JUNK);
  const hive = () => (rnd() < 0.9 ? rnd.pick(s.hives.list).id : rnd.pick(JUNK));
  const flower = () => (rnd() < 0.9 ? rnd.pick(C.FLOWER_IDS) : rnd.pick(JUNK));
  const product = () => {
    const shelf = C.shelf(s);
    return shelf.length && rnd() < 0.75 ? rnd.pick(shelf).product : rnd.pick(PRODUCTS);
  };
  const small = () => (rnd() < 0.85 ? 1 + rnd.below(4) : rnd.pick(JUNK));
  const customer = () =>
    rnd() < 0.7 ? s.market.queue[s.market.at]?.id : rnd() < 0.5 ? undefined : rnd.pick(JUNK);
  const look = () => {
    const w = C.WARDROBE;
    const any = (list) => rnd.pick(list.map((x) => x.id ?? x));
    return {
      name: rnd() < 0.9 ? "Fuzz" : rnd.pick(JUNK),
      body: any(w.body),
      skin: any(w.skin),
      hair: any([...w.hair.woman, ...w.hair.man]),
      hairColor: any(w.hairColor),
      overalls: any(w.overalls),
      shirt: any(w.shirt),
      hat: any(w.hat),
      beard: any(w.beard),
      glasses: any(w.glasses),
    };
  };
  const makers = {
    createKeeper: () => ({
      keeper: { ...look(), talent: rnd() < 0.9 ? rnd.pick(C.TALENT_IDS) : rnd.pick(JUNK) },
    }),
    setLook: () => ({ look: rnd() < 0.9 ? look() : rnd.pick(JUNK) }),
    startDay: () => ({}),
    tick: () => ({ n: rnd() < 0.8 ? 1 + rnd.below(120) : rnd.pick(JUNK) }),
    sleep: () => ({}),
    plant: () => ({ plot: plot(), x: coord(), y: coord(), flower: flower() }),
    dig: () => ({ plot: plot(), x: coord(), y: coord() }),
    pickBunch: () => ({ plot: plot(), x: coord(), y: coord() }),
    buyPlot: () => ({ plot: rnd() < 0.8 ? rnd.pick(C.PLOT_IDS) : rnd.pick(JUNK) }),
    buyHive: () => ({ plot: plot(), x: coord(), y: coord() }),
    moveHive: () => ({ hive: hive(), plot: plot(), x: coord(), y: coord() }),
    upgradeHive: () => ({ hive: hive() }),
    harvest: () => ({ hive: hive(), jars: small() }),
    feed: () => ({ hive: hive(), n: small() }),
    dust: () => ({ hive: hive() }),
    remedy: () => ({ hive: hive() }),
    split: () => ({ hive: hive(), plot: plot(), x: coord(), y: coord() }),
    catchSwarm: () => ({
      swarm: rnd() < 0.8 ? s.hives.swarms[0]?.id : rnd.pick(JUNK),
      plot: plot(),
      x: coord(),
      y: coord(),
    }),
    fendWasps: () => ({ hive: hive() }),
    buy: () => ({ item: rnd.pick(ITEMS), n: small() }),
    enterShow: () => ({
      honeys:
        rnd() < 0.8 ? [product(), product(), product()].slice(0, 1 + rnd.below(3)) : rnd.pick(JUNK),
    }),
    openStall: () => ({}),
    offer: () => ({
      customer: customer(),
      product: product(),
      ...(rnd() < 0.3 ? { n: small() } : {}),
    }),
    pass: () => ({ customer: customer() }),
    sellToGrocer: () => ({ product: product(), n: small() }),
    craft: () => ({
      recipe: rnd() < 0.9 ? rnd.pick(C.RECIPE_IDS) : rnd.pick(JUNK),
      bunch: rnd() < 0.8 ? rnd.pick(C.BUNCHES) : rnd.pick(JUNK),
      honey: product(),
      candle: product(),
      soap: product(),
    }),
    claimGoal: () => ({ goal: rnd() < 0.9 ? rnd.pick(C.GOAL_IDS) : rnd.pick(JUNK) }),
    readFact: () => ({ fact: rnd() < 0.7 ? (s.book.unread[0] ?? "nope") : rnd.pick(JUNK) }),
    seenYear: () => ({ year: rnd() < 0.8 ? (C.yearDue(s)?.year ?? 1) : rnd.pick(JUNK) }),
  };
  const type = rnd.pick(Object.keys(makers));
  if (rnd() < 0.04)
    return rnd.pick([
      null,
      undefined,
      5,
      "plant",
      {},
      { type: 5 },
      { type: "nope" },
      { type: "__proto__" },
      { type: "toString" },
      { type },
    ]);
  return { type, ...makers[type]() };
}

test("every action type has a random maker, so the fuzzer reaches all of step()", () => {
  const made = new Set();
  const rnd = rngOf(1);
  const s = fresh(1);
  for (let i = 0; i < 4000; i++) {
    const a = randomAction(s, rnd);
    if (a && typeof a === "object" && typeof a.type === "string") made.add(a.type);
  }
  for (const type of Object.keys(C.ACTIONS)) assert.ok(made.has(type), `no random ${type}`);
});

/** The screens' read-only helpers say what step() would say, and never throw, wherever the game has got to. */
function helpersAgree(s) {
  for (const h of s.hives.list) {
    assert.deepEqual(C.careOf(s, h.id), careByStep(s, h.id), `careOf hive ${h.id}`);
    const f = C.forecast(s, h.id);
    assert.ok(
      f && f.stored <= f.total + 1e-6 && f.left >= 0 && f.room >= 0,
      `forecast hive ${h.id}`,
    );
    C.spoils(s, h.id);
  }
  assert.equal(C.canBuyHive(s), buyByStep(s), "canBuyHive");
  for (const w of s.hives.swarms)
    assert.equal(C.canCatchSwarm(s, w.id), catchByStep(s, w.id), "canCatchSwarm");
  for (const p of C.PLOT_IDS)
    assert.equal(C.canBuyPlot(s, p), dry(s, { type: "buyPlot", plot: p }), `canBuyPlot ${p}`);
  const now = C.canCraftNow(s);
  for (const row of C.recipesNow(s)) {
    const said = dry(s, { type: "craft", recipe: row.recipe });
    assert.equal(row.canMake, said === true, `recipesNow ${row.recipe}`);
    if (now !== true) assert.equal(said, now, "canCraftNow");
  }
  if (s.clock.phase === "evening") {
    const basket = Object.fromEntries(C.shelf(s).map((r) => [r.product, r.n]));
    let t = s;
    let coins = 0;
    for (const [product, n] of Object.entries(basket)) {
      const r = C.step(t, { type: "sellToGrocer", product, n });
      coins += r.events[0].coins;
      t = r.state;
    }
    assert.equal(C.grocerQuote(s, basket), coins, "grocerQuote");
  }
  C.tomorrow(s);
  C.goalsNow(s);
  C.shopNow(s);
  C.wardrobeNow(s);
  C.tierOf(s);
  C.flowersKnown(s);
}

const KINDS = ["sensible", "greedy", "lazy", "completionist"];
const whys = documentedWhys();
const seenWhys = new Set();
const seenActions = new Set();

for (let seed = 1; seed <= SEEDS; seed++) {
  test(`fuzz, seed ${seed}: ${STEPS} actions hold every invariant`, () => {
    const rnd = rngOf(seed * 7919);
    const driver = makeBot(KINDS[seed % KINDS.length], seed);
    let s = C.newGame(seed);
    let accepted = 0;
    for (let i = 0; i < STEPS; i++) {
      const roll = rnd();
      const action =
        roll < 0.6 || (roll < 0.9 && s.clock.day > 20 && s.purse.coins < 5)
          ? driver(s)
          : randomAction(s, rnd);
      const before = JSON.stringify(s);
      const r = C.step(deepFreeze(s), action);
      const where = `seed ${seed}, step ${i}, day ${s.clock.day} ${s.clock.phase}, ${JSON.stringify(action)}`;
      assert.equal(JSON.stringify(s), before, `step() wrote to its input: ${where}`);
      if (r.events[0]?.type === "rejected") {
        assert.equal(r.state, s, `a refused action must return the same state: ${where}`);
        assert.equal(r.events.length, 1);
        assert.ok(
          whys.has(r.events[0].why),
          `"${r.events[0].why}" is not in architecture.md's list of why codes: ${where}`,
        );
        seenWhys.add(r.events[0].why);
        continue;
      }
      accepted++;
      seenActions.add(action.type);
      for (const e of r.events) assert.equal(typeof e.type, "string");
      try {
        invariants(r.state);
        if (i % 97 === 0) roundTrips(r.state);
        if (accepted % 100 === 0 && r.state.keeper.made) helpersAgree(r.state);
      } catch (err) {
        err.message = `${err.message}\n  after ${where}`;
        throw err;
      }
      s = r.state;
      // Now and then: could somebody carry on from here?
      if (i % 600 === 599 && s.keeper.made) play(makeBot("lazy", seed), s, s.clock.day + 10);
    }
    roundTrips(s);
    assert.ok(accepted > STEPS / 3, `only ${accepted} of ${STEPS} actions were accepted`);
    assert.ok(s.clock.day > 12, `the game only reached day ${s.clock.day}`);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  });
}

test("the fuzzer got somewhere: most actions were accepted at least once, and many refusals seen", () => {
  const never = Object.keys(C.ACTIONS).filter((t) => !seenActions.has(t));
  assert.ok(never.length <= 3, `never accepted in any run: ${never.join(", ")}`);
  assert.ok(
    seenWhys.size >= 35,
    `only ${seenWhys.size} different why codes seen: ${[...seenWhys].sort().join(" ")}`,
  );
});

/** The plainest keeper there could be: fly, sleep, take a jar when one is there, sell it to the grocer. */
function idler(s) {
  const due = C.yearDue(s);
  if (due) return { type: "seenYear", year: due.year };
  if (s.clock.phase === "morning") {
    for (const h of s.hives.list)
      if (C.jarsIn(h) > 0 && C.totalOf(h.stores) - T.NECTAR_PER_JAR >= C.mealOf(h, s.clock.day))
        return { type: "harvest", hive: h.id, jars: 1 };
    return { type: "startDay" };
  }
  if (s.clock.phase === "day") {
    const raided = s.hives.list.find((h) => h.raid);
    return raided ? { type: "fendWasps", hive: raided.id } : { type: "tick", n: T.TICKS_PER_DAY };
  }
  const it = C.shelf(s)[0];
  return it ? { type: "sellToGrocer", product: it.product, n: it.n } : { type: "sleep" };
}

for (const doy of [0, 9, 16, 21, 27]) {
  test(`no dead end: with no coins, beds, jars or stores on day-of-year ${doy}, an idle keeper earns again within a year`, () => {
    // The worst place to be: nothing in the purse or the shed, every bed dug up,
    // one colony down to a single strength with empty combs and mites.
    const start = edit(idleTo(fresh(3), T.YEAR_DAYS + doy + 1).state, (s) => {
      s.purse.coins = 0;
      s.stock = {
        honey: {},
        wax: 0,
        waxBits: 0,
        bunches: {},
        goods: {},
        seeds: {},
        remedy: 0,
        syrup: 0,
      };
      for (const p of C.PLOT_IDS)
        s.land.plots[p].squares = s.land.plots[p].squares.map((q) => (q?.t === "bed" ? null : q));
      for (const h of s.hives.list)
        Object.assign(h, { strength: 1, stores: {}, mites: 95, hungry: true, grow: 0 });
    });
    const end = play(idler, start, start.clock.day + T.YEAR_DAYS + 1).state;
    assert.ok(
      end.purse.coins > 0,
      `still no coins a year later (strength ${end.hives.list[0].strength})`,
    );
    assert.ok(end.hives.list[0].strength >= 1);
    // And with those coins there is something to spend them on.
    const shop = C.shopNow(end);
    assert.ok(
      shop.seeds.some((x) => x.price <= end.purse.coins),
      `nothing in the shop for ${end.purse.coins} coins`,
    );
  });
}
