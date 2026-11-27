// Rule tests for the hives: what a jar is, eating and growing, hive types,
// feeding, swarms, splits, mites and wasps, and the helpers the hive sheet
// reads (careOf, forecast for a colony that is not standing yet, spoils).
// The forage plan itself is in forage.test.mjs.
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
  clearBeds,
  addHive,
  setDay,
  dayOn,
  flyDay,
  nextMorning,
  one,
  of,
  sunny,
  crowded,
  waspDay,
  careByStep,
} from "./helpers.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const AT = { plot: "home", x: 0, y: 0 };
const count = (r, type) => of(r.events, type).length;

// ---- honey --------------------------------------------------------------------

test("verdict: the biggest flower's share names the honey and its stars; syrup and hedgerow nectar count against it", () => {
  const v = (stores) => C.verdictOf(stores);
  assert.deepEqual(v({}), { product: null, flower: null, purity: 0, stars: 0 });
  assert.equal(v({ clover: 79, wild: 21 }).product, "honey:blend:0");
  assert.equal(v({ clover: 80, wild: 20 }).product, "honey:clover:1");
  assert.equal(v({ clover: 90, syrup: 10 }).product, "honey:clover:2");
  assert.equal(v({ clover: 96.9, lavender: 3.1 }).product, "honey:clover:2");
  assert.equal(v({ clover: 97, lavender: 3 }).product, "honey:clover:3");
  assert.deepEqual(v({ clover: 50, lavender: 50 }), {
    product: "honey:blend:0",
    flower: null,
    purity: 0.5,
    stars: 0,
  });
  assert.equal(v({ wild: 10 }).product, "honey:blend:0", "hedgerow nectar never names a honey");
  assert.equal(v({ syrup: 10 }).flower, null);
});

test("harvest: identical jars, taken from every source in proportion, and a block of wax for every second jar", () => {
  const s = edit(fresh(), (s) => (hive(s).stores = { clover: 27, wild: 3 }));
  assert.equal(C.jarsIn(hive(s)), 3);
  const r = ok(s, { type: "harvest", hive: 1, jars: 2 });
  const e = one(r.events, "harvested");
  assert.deepEqual(
    [e.jars, e.product, e.flower, e.stars, e.wax],
    [2, "honey:clover:2", "clover", 2, 1],
  );
  assert.deepEqual(hive(r.state).stores, { clover: 9, wild: 1 });
  assert.deepEqual(r.state.stock.honey, { "clover:2": 2 });
  assert.equal(r.state.stock.wax, 1);
  assert.equal(hive(r.state).harvested, 1, "the day honey was last taken is remembered");
  const again = ok(r.state, { type: "harvest", hive: 1 });
  assert.equal(one(again.events, "harvested").wax, 0);
  assert.equal(again.state.stock.waxBits, 1);
  assert.deepEqual(hive(again.state).stores, {});
  no(again.state, { type: "harvest", hive: 1, jars: 1 }, "no-jars");
  no(s, { type: "harvest", hive: 1, jars: 4 }, "no-jars");
  for (const jars of [0, -1, 1.5, "2"]) no(s, { type: "harvest", hive: 1, jars }, "bad-args");
  no(s, { type: "harvest", hive: 99, jars: 1 }, "no-hive");
});

// ---- eating and growing ---------------------------------------------------------

test("eating: a colony eats its strength each night, six tenths of it in winter", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(22), "snow");
    Object.assign(hive(s), { strength: 3, stores: { clover: 10 } });
  });
  assert.equal(C.mealOf(hive(s), dayOn(22)), 1.8);
  assert.equal(C.mealOf(hive(s), dayOn(9)), 3);
  const r = nextMorning(s);
  assert.deepEqual(one(r.events, "slept").eaten, [{ hive: 1, units: 1.8, hungry: false }]);
  assert.deepEqual(hive(r.state).stores, { clover: 8.2 });
});

test("hunger: the first hungry night is a warning, each one after costs a strength, and never the last", () => {
  let s = edit(fresh(), (s) => {
    setDay(s, dayOn(21), "snow");
    Object.assign(hive(s), { strength: 3, stores: { clover: 1 } });
  });
  const nights = [];
  for (let i = 0; i < 5; i++) {
    const r = nextMorning(s);
    const e = one(r.events, "hungry");
    assert.equal(e.winter, true);
    nights.push([e.lost, e.strength]);
    s = r.state;
  }
  assert.deepEqual(nights, [
    [0, 3],
    [1, 2],
    [1, 1],
    [0, 1],
    [0, 1],
  ]);
  assert.deepEqual(hive(s).stores, {});
  assert.deepEqual(C.attentionOf(s, hive(s)), ["hungry", "low"]);
  const fed = ok(
    edit(s, (s) => (s.stock.syrup = 1)),
    { type: "feed", hive: 1, n: 1 },
  ).state;
  const r = nextMorning(fed);
  assert.equal(count(r, "hungry"), 0);
  assert.equal(hive(r.state).hungry, false);
});

test("winter need: tonight's meal and every winter night after it, and the flags that warn of it", () => {
  const at = (doy, over) =>
    edit(fresh(), (s) => {
      setDay(s, dayOn(doy));
      Object.assign(hive(s), { strength: 3, stores: { ivy: 15 }, ...over });
    });
  const flags = (s) => C.attentionOf(s, hive(s));
  assert.equal(C.winterNeed(at(14), hive(at(14))), 15.6);
  assert.equal(C.winterNeed(at(21), hive(at(21))), 12.6);
  assert.equal(C.winterNeed(at(27), hive(at(27))), 1.8);
  assert.deepEqual(flags(at(13)), [], "nobody worries in summer");
  assert.deepEqual(flags(at(14)), ["winter-short"]);
  assert.deepEqual(flags(at(14, { stores: { ivy: 15.6 } })), []);
  assert.deepEqual(flags(at(14, { stores: { ivy: 2 } })), ["low"]);
  assert.deepEqual(flags(at(14, { stores: { ivy: 54 } })), ["full"]);
  assert.deepEqual(flags(at(13, { mites: 40 })), ["mites"]);
  assert.deepEqual(flags(at(13, { mites: 80 })), ["mites-bad"]);
});

test("growing: two good days make a colony one stronger, up to what its hive allows", () => {
  let r = nextMorning(fresh());
  assert.equal(hive(r.state).grow, 1);
  assert.equal(count(r, "grew"), 0);
  r = nextMorning(r.state);
  assert.deepEqual(one(r.events, "grew"), { type: "grew", hive: 1, strength: 4, max: true });
  r = nextMorning(sunny(r.state));
  assert.equal(count(r, "grew"), 0, "a skep holds four");
  assert.equal(hive(r.state).strength, 4);
});

test("growing: it takes a good day's forage in spring or summer, and a colony that mites have not stalled", () => {
  const beds = (doy, over = {}, talent = undefined) =>
    edit(fresh(1, talent), (s) => {
      setDay(s, dayOn(doy));
      clearBeds(s);
      for (const [x, y] of [
        [1, 2],
        [3, 2],
        [3, 4],
        [1, 4],
      ])
        bed(s, "home", x, y, "sunflower");
      Object.assign(hive(s), { stores: { sunflower: 20 }, ...over });
    });
  const after = (s) => hive(nextMorning(s).state);
  assert.equal(after(beds(10)).grow, 1, "a summer day in the sunflowers");
  assert.equal(after(beds(14)).grow, 0, "the same day in autumn");
  assert.equal(
    after(edit(beds(10), (s) => (s.weather.today = "rain"))).grow,
    0,
    "a rainy day brings too little",
  );
  assert.equal(after(beds(10, { mites: T.MITES_STALL })).grow, 0, "mites stall the brood");
  assert.equal(after(beds(10, { mites: T.MITES_STALL - 1 })).grow, 1);
  assert.equal(
    after(beds(10, {}, "whisperer")).strength,
    4,
    "the bee whisperer's colonies grow in one day",
  );
});

// ---- hive types -----------------------------------------------------------------

test("hive types: each holds more and lets the colony grow further; upgrading moves colony and stores in as they are", () => {
  const rows = C.HIVE_IDS.map((type) => [
    type,
    C.capacityOf({ type }),
    C.limitOf({ type }),
    C.upgradeOf({ type })?.cost ?? null,
  ]);
  assert.deepEqual(rows, [
    ["skep", 60, 4, 60],
    ["box", 100, 6, 120],
    ["double", 160, 8, 240],
    ["stack", 240, 10, null],
  ]);
  let s = edit(fresh(), (s) => {
    s.purse.coins = 60 + 120 + 240;
    Object.assign(hive(s), { strength: 4, stores: { clover: 33, wild: 2 }, mites: 12 });
  });
  for (const [i, type] of ["box", "double", "stack"].entries()) {
    const r = ok(s, { type: "upgradeHive", hive: 1 });
    assert.deepEqual(one(r.events, "hiveUpgraded"), {
      type: "hiveUpgraded",
      hive: 1,
      hiveType: type,
      cost: C.HIVES[type].cost,
      rank: i + 1,
    });
    s = r.state;
  }
  assert.equal(s.purse.coins, 0);
  assert.deepEqual(
    [hive(s).type, hive(s).strength, hive(s).stores, hive(s).mites],
    ["stack", 4, { clover: 33, wild: 2 }, 12],
  );
  no(s, { type: "upgradeHive", hive: 1 }, "top-hive");
  no(
    edit(fresh(), (s) => (s.purse.coins = 59)),
    { type: "upgradeHive", hive: 1 },
    "no-coins",
  );
  no(s, { type: "upgradeHive", hive: 99 }, "no-hive");
});

test("buying hives: a skep with a small colony, dearer with every hive kept, four to a plot", () => {
  let s = edit(fresh(), (s) => (s.purse.coins = 1000));
  assert.equal(C.newHiveType(s), "skep");
  assert.equal(C.canBuyHive(s), true);
  const costs = [];
  for (const [x, y] of [
    [0, 0],
    [5, 0],
    [5, 5],
  ]) {
    costs.push(C.hiveCost(s));
    const r = ok(s, { type: "buyHive", plot: "home", x, y });
    const e = one(r.events, "hiveBought");
    assert.deepEqual(
      [e.plot, e.x, e.y, e.cost, e.hives],
      ["home", x, y, costs.at(-1), s.hives.list.length + 1],
    );
    s = r.state;
  }
  assert.deepEqual(costs, [40, 60, 80]);
  assert.equal(s.purse.coins, 1000 - 180);
  const young = s.hives.list.at(-1);
  assert.deepEqual([young.type, young.strength, young.stores], ["skep", T.NEW_HIVE_STRENGTH, {}]);
  assert.deepEqual(
    s.hives.list.map((h) => C.hiveNumber(s, h.id)),
    [1, 2, 3, 4],
    "a hive goes by its place in the list",
  );
  assert.equal(C.hiveNumber(s, 999), 0);
  no(s, { type: "buyHive", plot: "home", x: 0, y: 5 }, "plot-full");
  assert.equal(C.canBuyHive(s), "plot-full");
  no(s, { type: "buyHive", plot: "pond", x: 0, y: 0 }, "not-owned");
  const more = edit(s, (s) => (s.land.plots.pond.owned = true));
  assert.equal(C.canBuyHive(more), true, "another plot is room for four more");
  no(more, { type: "buyHive", plot: "pond", x: 5, y: 5 }, "bad-ground");
  const poor = edit(fresh(), (s) => (s.purse.coins = 39));
  assert.equal(C.canBuyHive(poor), "no-coins");
  no(poor, { type: "buyHive", plot: "home", x: 0, y: 0 }, "no-coins");
  no(fresh(), { type: "buyHive", plot: "home", x: 1, y: 2 }, "square-taken");
  const packed = edit(fresh(), (s) => {
    s.purse.coins = 500;
    for (let i = 0; i < 36; i++)
      if (!s.land.plots.home.squares[i]) bed(s, "home", i % 6, Math.floor(i / 6), "clover");
  });
  assert.equal(C.canBuyHive(packed), "square-taken");
});

test("feeding: a portion of syrup is ten units in the comb, and it counts against the honey", () => {
  const s = edit(fresh(), (s) => {
    s.stock.syrup = 3;
    hive(s).stores = { clover: 40 };
  });
  const r = ok(s, { type: "feed", hive: 1, n: 1 });
  assert.deepEqual(one(r.events, "fed"), { type: "fed", hive: 1, n: 1, units: 10 });
  assert.deepEqual(hive(r.state).stores, { clover: 40, syrup: 10 });
  assert.equal(r.state.stock.syrup, 2);
  assert.equal(C.verdictOf(hive(r.state).stores).stars, 1, "three stars before, one after");
  no(r.state, { type: "feed", hive: 1, n: 2 }, "hive-full");
  assert.equal(C.totalOf(hive(ok(r.state, { type: "feed", hive: 1 }).state).stores), 60);
  no(s, { type: "feed", hive: 1, n: 4 }, "no-syrup");
  no(s, { type: "feed", hive: 1, n: 0 }, "bad-args");
  no(s, { type: "feed", hive: 99, n: 1 }, "no-hive");
});

// ---- swarms -------------------------------------------------------------------

test("swarming: a colony as strong as its hive allows raises queen cells, and leaves the night after", () => {
  const s = crowded();
  assert.deepEqual(C.attentionOf(s, hive(s)), ["swarm-risk"]);
  let r = nextMorning(s);
  assert.deepEqual(one(r.events, "queenCells"), { type: "queenCells", hive: 1 });
  assert.equal(count(r, "swarmed"), 0);
  assert.equal(hive(r.state).swarmCells, true);
  assert.equal(hive(r.state).swarmYear, 1);
  assert.ok(C.attentionOf(r.state, hive(r.state)).includes("queen-cells"));
  r = nextMorning(r.state);
  const e = one(r.events, "swarmed");
  assert.deepEqual(
    [e.hive, e.strength, e.swarm.strength, e.swarm.plot, e.swarm.day, e.swarm.from],
    [1, 2, 2, "home", r.state.clock.day, 1],
  );
  assert.equal(hive(r.state).strength, 2, "half the colony went with the old queen");
  assert.equal(hive(r.state).swarmCells, false);
  assert.deepEqual(r.state.hives.swarms, [e.swarm]);
  assert.equal(
    C.squareAt(r.state, "home", e.swarm.x, e.swarm.y),
    null,
    "it hangs over free ground",
  );
  r = nextMorning(r.state);
  assert.deepEqual(one(r.events, "swarmLost"), {
    type: "swarmLost",
    swarm: e.swarm.id,
    strength: 2,
  });
  assert.deepEqual(r.state.hives.swarms, []);
});

test("swarming: not before the first summer, only in season, only at the hive's limit, and once a year", () => {
  const strong = (day, strength = 4) =>
    edit(fresh(), (s) => {
      setDay(s, day);
      Object.assign(hive(s), { strength, stores: { clover: 30 } });
    });
  const cells = (s) => count(nextMorning(s), "queenCells");
  assert.equal(cells(strong(7)), 0, "day 7: too soon in a first year");
  assert.equal(cells(strong(8)), 1);
  assert.equal(cells(strong(dayOn(2, 2))), 0, "the season opens on spring day 4");
  assert.equal(cells(strong(dayOn(3, 2))), 1);
  assert.equal(cells(strong(dayOn(12))), 1);
  assert.equal(cells(strong(dayOn(13))), 0, "and closes after summer day 6");
  assert.equal(cells(strong(dayOn(8), 3)), 0, "a colony with room stays put");
  // A colony that has swarmed is settled until next spring, even back at full strength.
  let s = nextMorning(nextMorning(crowded(7)).state).state;
  assert.equal(hive(s).strength, 2);
  s = edit(s, (s) => (hive(s).strength = 4));
  for (let i = 0; i < 3; i++) {
    const r = nextMorning(s);
    assert.equal(count(r, "queenCells") + count(r, "swarmed"), 0);
    s = r.state;
  }
  assert.equal(cells(edit(s, (s) => setDay(s, dayOn(8, 2)))), 1, "next year they may again");
});

test("queen cells: honey taken that day, a bigger hive, a split, an empty comb or the season's end keeps them home", () => {
  const withCells = nextMorning(crowded()).state;
  assert.equal(hive(withCells).swarmCells, true);
  // Honey taken in the evening: they stay tonight, and go tomorrow night if nothing is done.
  let r = nextMorning(ok(flyDay(withCells).state, { type: "harvest", hive: 1, jars: 1 }).state);
  assert.equal(count(r, "swarmed"), 0);
  assert.equal(hive(r.state).swarmCells, true, "the cells are still there");
  assert.equal(count(nextMorning(r.state), "swarmed"), 1);
  // Taken in the morning counts as well.
  assert.equal(
    count(nextMorning(ok(withCells, { type: "harvest", hive: 1, jars: 1 }).state), "swarmed"),
    0,
  );
  // A bigger hive: the cells come down at once, and the colony is settled for the year.
  const roomy = ok(
    edit(withCells, (s) => (s.purse.coins = 60)),
    { type: "upgradeHive", hive: 1 },
  ).state;
  assert.equal(hive(roomy).swarmCells, false);
  r = nextMorning(roomy);
  assert.equal(count(r, "swarmed") + count(r, "queenCells"), 0);
  // A split.
  const halves = ok(
    edit(withCells, (s) => (s.hives.spare = 1)),
    { type: "split", hive: 1, ...AT },
  ).state;
  assert.deepEqual(
    halves.hives.list.map((h) => [h.strength, h.swarmCells, h.swarmYear]),
    [
      [2, false, 1],
      [2, false, 1],
    ],
  );
  assert.equal(count(nextMorning(halves), "swarmed"), 0);
  // Less than a jar in the comb: nothing to leave with.
  r = nextMorning(edit(withCells, (s) => (hive(s).stores = {})));
  assert.equal(count(r, "swarmed"), 0);
  assert.equal(hive(r.state).swarmCells, true);
  // The season ends, or the colony is no longer crowded: the cells are torn down.
  r = nextMorning(edit(withCells, (s) => setDay(s, dayOn(13))));
  assert.deepEqual([count(r, "swarmed"), hive(r.state).swarmCells], [0, false]);
  r = nextMorning(edit(withCells, (s) => (hive(s).strength = 3)));
  assert.deepEqual([count(r, "swarmed"), hive(r.state).swarmCells], [0, false]);
});

test("catching a swarm: into a spare hive on any free square, at any time of the day it hangs", () => {
  const gone = nextMorning(nextMorning(crowded()).state);
  const sw = one(gone.events, "swarmed").swarm;
  const s = gone.state;
  const grab = { type: "catchSwarm", swarm: sw.id, ...AT };
  assert.equal(C.canCatchSwarm(s, sw.id), "no-spare");
  no(s, grab, "no-spare");
  const ready = edit(s, (s) => (s.hives.spare = 1));
  assert.equal(C.canCatchSwarm(ready, sw.id), true);
  assert.equal(C.canCatchSwarm(ready, 999), "no-swarm");
  no(ready, { ...grab, swarm: 999 }, "no-swarm");
  no(ready, { ...grab, x: 1, y: 2 }, "square-taken");
  for (const at of [ready, ok(ready, { type: "startDay" }).state, flyDay(ready).state]) {
    const r = ok(at, grab);
    const e = one(r.events, "swarmCaught");
    const h = C.hiveById(r.state, e.hive);
    assert.deepEqual(
      [h.type, h.strength, h.swarmYear, h.plot, h.x, h.y, e.strength, e.hives],
      ["skep", 2, 1, "home", 0, 0, 2, 2],
    );
    assert.equal(r.state.hives.spare, 0);
    assert.deepEqual(r.state.hives.swarms, []);
  }
  const full = edit(ready, (s) => {
    for (const [x, y] of [
      [0, 0],
      [5, 0],
      [5, 5],
    ])
      addHive(s, "home", x, y);
  });
  assert.equal(C.canCatchSwarm(full, sw.id), "plot-full");
  no(full, { ...grab, x: 0, y: 5 }, "plot-full");
  // A swarm out of a tall stack is more than a skep holds: four move in.
  const big = edit(
    crowded(8, { type: "stack", strength: 10, stores: { clover: 100 }, swarmCells: true }),
    (s) => (s.hives.spare = 1),
  );
  const left = nextMorning(big);
  const e = one(left.events, "swarmed");
  assert.equal(e.swarm.strength, 5);
  assert.equal(
    one(ok(left.state, { ...grab, swarm: e.swarm.id }).events, "swarmCaught").strength,
    4,
  );
});

test("splitting: in the morning, half the colony and half the stores go into a spare hive", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(9));
    s.hives.spare = 1;
    Object.assign(hive(s), {
      type: "box",
      strength: 5,
      stores: { clover: 30, wild: 10 },
      mites: 22,
    });
  });
  const cut = { type: "split", hive: 1, ...AT };
  no(
    edit(s, (s) => (s.hives.spare = 0)),
    cut,
    "no-spare",
  );
  no(
    edit(s, (s) => (hive(s).strength = 3)),
    cut,
    "too-weak",
  );
  no(ok(s, { type: "startDay" }).state, cut, "not-morning");
  no(s, { ...cut, x: 1, y: 2 }, "square-taken");
  no(s, { ...cut, hive: 7 }, "no-hive");
  const r = ok(s, cut);
  const e = one(r.events, "split");
  assert.deepEqual(
    [e.hive, e.strength, e.madeStrength, e.hives, e.plot, e.x, e.y],
    [1, 3, 2, 2, "home", 0, 0],
  );
  const young = C.hiveById(r.state, e.made);
  assert.deepEqual(
    [young.type, young.strength, young.stores, young.mites, young.swarmYear],
    ["skep", 2, { clover: 15, wild: 5 }, 22, 1],
  );
  assert.deepEqual(
    [hive(r.state).strength, hive(r.state).stores, hive(r.state).swarmYear],
    [3, { clover: 15, wild: 5 }, 1],
  );
  assert.equal(r.state.hives.spare, 0);
  // Out of a tall stack only what a skep can take goes across.
  const t = ok(
    edit(s, (s) =>
      Object.assign(hive(s), { type: "stack", strength: 10, stores: { clover: 200 } }),
    ),
    cut,
  ).state;
  assert.deepEqual(
    t.hives.list.map((h) => [h.strength, h.stores]),
    [
      [6, { clover: 140 }],
      [4, { clover: 60 }],
    ],
  );
});

// ---- forecast -----------------------------------------------------------------

test("forecast: a split, a caught swarm and a bought skep are forecast exactly as the day then plays", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(9));
    clearBeds(s);
    for (const [x, y] of [
      [1, 2],
      [3, 2],
      [3, 4],
      [1, 1],
    ])
      bed(s, "home", x, y, "clover");
    s.hives.spare = 1;
    s.purse.coins = 100;
    Object.assign(hive(s), { type: "box", strength: 5, stores: { clover: 30, wild: 10 } });
  });
  // The split: the new colony's day, and what its parent loses by it.
  const f = C.forecast(s, null, AT, { split: 1 });
  const was = C.forecast(s, 1).total;
  let r = flyDay(ok(s, { type: "split", hive: 1, ...AT }).state);
  let [parent, young] = r.state.hives.list;
  assert.equal(f.carry, 12);
  near(f.total, young.today.got + young.today.lost);
  assert.equal(f.stored, young.today.got);
  assert.deepEqual(f.storesAfter, young.stores);
  assert.deepEqual(f.verdict, C.verdictOf(young.stores));
  assert.equal(f.others.length, 1);
  assert.deepEqual([f.others[0].id, f.others[0].was], [1, was]);
  near(f.others[0].total, parent.today.got + parent.today.lost);
  assert.ok(f.others[0].total < was, "the parent flies with fewer bees");
  // A skep bought there.
  const b = C.forecast(s, null, AT);
  r = flyDay(ok(s, { type: "buyHive", ...AT }).state);
  assert.equal(b.carry, 12);
  assert.deepEqual(b.storesAfter, r.state.hives.list[1].stores);
  // Any colony: its strength as far as a skep allows, and what it would hold.
  assert.equal(C.forecast(s, null, AT, { strength: 3 }).carry, 18);
  assert.equal(C.forecast(s, null, AT, { strength: 9 }).carry, 24);
  assert.ok(
    C.forecast(s, null, AT, { strength: 3, stores: { clover: 20 } }).storesAfter.clover > 20,
  );
  // A swarm caught there.
  const gone = nextMorning(nextMorning(crowded()).state);
  const sw = one(gone.events, "swarmed").swarm;
  const g = sunny(edit(gone.state, (s) => (s.hives.spare = 1)));
  const c = C.forecast(g, null, AT, { swarm: sw.id });
  r = flyDay(ok(g, { type: "catchSwarm", swarm: sw.id, ...AT }).state);
  assert.equal(c.carry, 12);
  assert.deepEqual(c.storesAfter, r.state.hives.list[1].stores);
  // Nothing to forecast.
  assert.equal(C.forecast(s, 99), null);
  assert.equal(C.forecast(s, null), null);
  assert.equal(C.forecast(s, null, AT, { split: 99 }), null);
  assert.equal(C.forecast(s, null, AT, { swarm: 99 }), null);
  assert.equal(C.forecast(s, null, { plot: "moon", x: 0, y: 0 }), null);
});

test("forecast during the day: only what is still to come is added, so nothing is counted twice", () => {
  const s = edit(fresh(), (s) => (hive(s).stores = { dandelion: 20 }));
  const m = C.forecast(s, 1);
  assert.deepEqual([m.total, m.got, m.left, m.room, m.stored], [18, 0, 18, 40, 18]);
  const day = ok(ok(s, { type: "startDay" }).state, { type: "tick", n: 60 }).state;
  const mid = C.forecast(day, 1);
  assert.deepEqual([mid.total, mid.got, mid.left, mid.room, mid.stored], [18, 4.5, 13.5, 35.5, 18]);
  const eve = ok(day, { type: "tick", n: DAY }).state;
  assert.deepEqual(hive(eve).stores, { dandelion: 38 });
  assert.deepEqual(m.storesAfter, hive(eve).stores);
  assert.deepEqual(mid.storesAfter, hive(eve).stores);
  // A hive with little room: what will not fit is in `left` but not in `stored`.
  const tight = edit(s, (s) => (hive(s).stores = { dandelion: 50 }));
  const t = C.forecast(tight, 1);
  const done = flyDay(tight).state;
  assert.deepEqual([t.total, t.left, t.room], [18, 18, 10]);
  near(t.stored, hive(done).today.got, 0.002);
  near(t.stored, 10, 0.002);
  near(hive(done).today.lost, 8, 0.002);
});

test("forecast in the evening: tomorrow's flight comes after tonight's supper", () => {
  const evening = flyDay(fresh()).state;
  const f = C.forecast(evening, 1);
  assert.deepEqual([f.day, f.weather, f.total, f.got, f.room], [2, "sunny", 18, 0, 45]);
  assert.deepEqual(f.storesAfter, { dandelion: 33 });
  assert.deepEqual(f.storesAfter, hive(flyDay(nextMorning(evening).state).state).stores);
});

test("spoils: the next flight would cost a hive's pure honey its name or a star", () => {
  const last = edit(fresh(), (s) => {
    setDay(s, dayOn(3));
    hive(s).stores = { dandelion: 30 };
  });
  assert.equal(C.spoils(last, 1), false, "the dandelions still bloom today");
  const eve = flyDay(last).state;
  assert.equal(C.spoils(eve, 1), true, "tomorrow there is only the hedgerow");
  assert.deepEqual(C.tomorrow(eve).spoils, [1]);
  const taken = ok(eve, { type: "harvest", hive: 1, jars: C.jarsIn(hive(eve)) }).state;
  assert.equal(C.spoils(taken, 1), false, "the jars are safe on the shelf");
  assert.deepEqual(C.tomorrow(taken).spoils, []);
  assert.equal(
    C.spoils(nextMorning(eve).state, 1),
    true,
    "in the morning it speaks of today's flight",
  );
  assert.equal(
    C.spoils(
      edit(eve, (s) => (hive(s).stores = { dandelion: 20, wild: 20 })),
      1,
    ),
    false,
    "a blend has nothing to lose",
  );
  assert.equal(
    C.spoils(
      edit(eve, (s) => (hive(s).stores = { dandelion: 9 })),
      1,
    ),
    false,
    "nor has less than a jar",
  );
  assert.equal(C.spoils(eve, 99), false);
});

// ---- mites and wasps -----------------------------------------------------------

test("mites: none before the first summer, then a little every night but winter's, spotted at forty", () => {
  const at = (day, over = {}, talent = undefined) =>
    edit(fresh(1, talent), (s) => {
      setDay(s, day);
      Object.assign(hive(s), { stores: { clover: 40 }, ...over });
    });
  const after = (s) => hive(nextMorning(s).state).mites;
  assert.equal(after(at(7)), 0);
  assert.equal(after(at(8)), 1.8);
  assert.equal(after(at(8, { strength: 2 })), 1.2, "fewer bees, fewer mites");
  assert.equal(after(at(8, {}, "whisperer")), 1.26);
  assert.equal(after(at(dayOn(22), { mites: 10 })), 10, "winter");
  assert.equal(after(at(dayOn(14), { mites: 99.5 })), 100);
  const r = nextMorning(at(dayOn(14), { mites: 39 }));
  assert.deepEqual(one(r.events, "mitesSpotted"), { type: "mitesSpotted", hive: 1, mites: 40.8 });
  assert.equal(count(nextMorning(r.state), "mitesSpotted"), 0, "spotted once");
});

test("mites: at eighty a colony loses a strength that night and every second night after, but never its last", () => {
  const sick = (over = {}) =>
    edit(fresh(), (s) => {
      setDay(s, dayOn(14));
      Object.assign(hive(s), { strength: 4, mites: 79, stores: { ivy: 50 }, ...over });
    });
  let s = sick();
  const nights = [];
  for (let i = 0; i < 7; i++) {
    const r = nextMorning(s);
    nights.push(count(r, "mitesHarmed") ? hive(r.state).strength : 0);
    s = r.state;
  }
  assert.deepEqual(nights, [3, 0, 2, 0, 1, 0, 0]);
  // Dusting: twenty off, free, once a day. Under eighty the harm stops and the count starts over.
  const bad = sick({ mites: 85, sick: 1 });
  const d = ok(bad, { type: "dust", hive: 1 });
  assert.deepEqual(one(d.events, "dusted"), { type: "dusted", hive: 1, mites: 65 });
  no(d.state, { type: "dust", hive: 1 }, "already-dusted");
  const r = nextMorning(d.state);
  assert.deepEqual([count(r, "mitesHarmed"), hive(r.state).sick], [0, 0]);
  ok(r.state, { type: "dust", hive: 1 });
  no(sick({ mites: 0 }), { type: "dust", hive: 1 }, "no-mites");
  // The thyme remedy: seventy off, from the shelf.
  no(bad, { type: "remedy", hive: 1 }, "no-remedy");
  const m = ok(
    edit(bad, (s) => (s.stock.remedy = 1)),
    { type: "remedy", hive: 1 },
  );
  assert.deepEqual(one(m.events, "remedied"), { type: "remedied", hive: 1, mites: 15 });
  assert.equal(m.state.stock.remedy, 0);
  no(
    edit(sick({ mites: 0 }), (s) => (s.stock.remedy = 1)),
    { type: "remedy", hive: 1 },
    "no-mites",
  );
});

test("wasps: they come for a weak hive from late summer; seen off they take nothing, let in they take five", () => {
  const day = waspDay();
  const { hive: id, at } = day.plan.wasps;
  no(day, { type: "fendWasps", hive: id }, "no-raid");
  const came = ok(day, { type: "tick", n: DAY });
  assert.equal(came.state.clock.tick, at, "the day stops when they arrive");
  assert.deepEqual(one(came.events, "waspsCame"), {
    type: "waspsCame",
    hive: id,
    until: Math.min(DAY, at + T.WASP_TICKS),
  });
  assert.ok(C.attentionOf(came.state, hive(came.state)).includes("wasps"));
  assert.equal(C.careOf(came.state, id).fendWasps, true);
  const fended = ok(came.state, { type: "fendWasps", hive: id });
  one(fended.events, "waspsFended");
  const calm = ok(fended.state, { type: "tick", n: DAY });
  assert.equal(count(calm, "waspsRaided"), 0);
  assert.equal(hive(calm.state).today.raided, 0);
  const robbed = ok(came.state, { type: "tick", n: DAY });
  assert.deepEqual(one(robbed.events, "waspsRaided"), {
    type: "waspsRaided",
    hive: id,
    lost: T.WASP_LOSS,
  });
  assert.equal(hive(robbed.state).today.raided, 5, "the hive remembers what was taken today");
  near(C.totalOf(hive(calm.state).stores) - C.totalOf(hive(robbed.state).stores), 5, 0.01);
  assert.equal(hive(nextMorning(robbed.state).state).today.raided, 0, "and forgets by morning");
  no(fresh(), { type: "fendWasps", hive: 1 }, "not-day");
  for (let seed = 1; seed <= 40; seed++) {
    const early = ok(
      edit(fresh(seed), (s) => setDay(s, dayOn(10))),
      { type: "startDay" },
    ).state;
    const strong = ok(
      edit(fresh(seed), (s) => {
        setDay(s, dayOn(12));
        hive(s).strength = 4;
      }),
      { type: "startDay" },
    ).state;
    assert.equal(early.plan.wasps, null, "not before late summer");
    assert.equal(strong.plan.wasps, null, "a strong colony guards its own door");
  }
});

// ---- the hive sheet -----------------------------------------------------------

test("careOf: for every kind of care, exactly what step() would answer", () => {
  const rich = edit(fresh(), (s) => {
    s.purse.coins = 500;
    s.stock.syrup = 2;
    s.stock.remedy = 1;
    s.hives.spare = 1;
    Object.assign(hive(s), { strength: 4, stores: { clover: 35 }, mites: 30 });
    addHive(s, "home", 5, 5, { stores: { clover: 60 }, dusted: s.clock.day, mites: 5 });
  });
  const full = edit(rich, (s) => {
    addHive(s, "home", 0, 0);
    addHive(s, "home", 5, 0);
  });
  const packed = edit(rich, (s) => {
    for (let i = 0; i < 36; i++)
      if (!s.land.plots.home.squares[i]) bed(s, "home", i % 6, Math.floor(i / 6), "clover");
  });
  const raid = ok(waspDay(), { type: "tick", n: DAY }).state;
  const positions = {
    fresh: fresh(),
    rich,
    full,
    packed,
    raid,
    day: ok(rich, { type: "startDay" }).state,
    evening: flyDay(rich).state,
  };
  for (const [name, s] of Object.entries(positions))
    for (const h of s.hives.list)
      assert.deepEqual(C.careOf(s, h.id), careByStep(s, h.id), `${name}, hive ${h.id}`);
  assert.deepEqual(C.careOf(fresh(), 1), {
    harvest: "no-jars",
    feed: "no-syrup",
    dust: "no-mites",
    remedy: "no-remedy",
    upgrade: "no-coins",
    split: "too-weak",
    move: true,
    fendWasps: "not-day",
  });
  assert.deepEqual(C.careOf(rich, 1), {
    harvest: true,
    feed: true,
    dust: true,
    remedy: true,
    upgrade: true,
    split: true,
    move: true,
    fendWasps: "not-day",
  });
  const second = rich.hives.list[1].id;
  assert.deepEqual(
    [C.careOf(rich, second).feed, C.careOf(rich, second).dust, C.careOf(rich, second).split],
    ["hive-full", "already-dusted", "too-weak"],
  );
  assert.deepEqual(
    [C.careOf(full, 1).split, C.careOf(full, 1).move],
    ["plot-full", true],
    "a hive may still move about its own full plot",
  );
  assert.deepEqual(
    [C.careOf(packed, 1).split, C.careOf(packed, 1).move],
    ["square-taken", "square-taken"],
  );
  assert.deepEqual(
    [C.careOf(positions.day, 1).split, C.careOf(positions.day, 1).move],
    ["not-morning", "not-morning"],
  );
  assert.equal(C.careOf(raid, 1).fendWasps, true);
  assert.deepEqual(new Set(Object.values(C.careOf(rich, 99))), new Set(["no-hive"]));
});
