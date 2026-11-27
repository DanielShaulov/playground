// Reach, the forage plan, sharing, and the promise the whole game leans on:
// what the forecast shows in the morning is what the bees bring home.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  W,
  DAY,
  ok,
  no,
  run,
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
  rngOf,
  one,
  of,
} from "./helpers.mjs";

const near = (a, b, eps = 0.0011) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
/** A bare Home Meadow in high summer (clover and lavender both out), one hive at (2,3). */
const bare = (doy = 8, weather = "sunny") =>
  edit(fresh(), (s) => {
    clearBeds(s);
    setDay(s, dayOn(doy), weather);
  });

test("reach: a hive forages two squares out, the near ring at full weight and the far ring at half", () => {
  const reach = C.reachOf("home", 2, 3);
  assert.equal(reach.length, 24, "5 × 5 less its own square");
  assert.equal(reach.filter((r) => r.w === T.NEAR).length, 8);
  assert.equal(reach.filter((r) => r.w === T.FAR).length, 16);
  assert.ok(reach.every((r) => Math.max(Math.abs(r.x - 2), Math.abs(r.y - 3)) <= 2));
  assert.equal(C.reachOf("home", 0, 0).length, 8, "a corner hive reaches only what is on the plot");
});

test("carry: six units for each strength, cut by the weather", () => {
  for (const [weather, flight] of Object.entries(T.FLIGHT)) {
    const f = C.forecast(bare(8, weather), hive(bare()).id);
    near(f.carry, T.START_HIVE_STRENGTH * T.FORAGE_PER_STRENGTH * flight);
  }
  assert.equal(T.FLIGHT.sunny, 1);
  assert.ok(
    T.FLIGHT.rain < T.FLIGHT.windy && T.FLIGHT.windy < T.FLIGHT.cloudy && T.FLIGHT.cloudy < 1,
  );
});

test("carry: Heather Hill is windier, so a windy day costs more up there", () => {
  assert.equal(C.flightFor("windy", "hill"), T.WINDY_HILL_FLIGHT);
  assert.equal(C.flightFor("windy", "home"), T.FLIGHT.windy);
  assert.equal(C.flightFor("sunny", "hill"), 1);
});

test("carry: in summer a hive within two squares of water carries a tenth more", () => {
  const at = (doy) =>
    edit(
      fresh(),
      (s) => (
        setDay(s, dayOn(doy)),
        addHive(s, "pond", 3, 2, { strength: 4 }),
        addHive(s, "pond", 0, 0, { strength: 4 })
      ),
    );
  const [wet, dry] = at(8).hives.list.slice(1);
  near(C.forecast(at(8), wet.id).carry, 4 * T.FORAGE_PER_STRENGTH * (1 + T.WATER_BONUS));
  near(C.forecast(at(8), dry.id).carry, 4 * T.FORAGE_PER_STRENGTH);
  near(C.forecast(at(2), wet.id).carry, 4 * T.FORAGE_PER_STRENGTH, 0.0011);
});

test("plan: a hive asks its beds in proportion to weight × nectar, so a near bed gives twice a far one", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 1; // carries 6
    bed(s, "home", 3, 3, "clover"); // near, 5 units
    bed(s, "home", 4, 3, "lavender"); // far, 5 units
  });
  const f = C.forecast(s, hive(s).id);
  near(f.by.clover, 4);
  near(f.by.lavender, 2);
  near(f.total, 6);
  assert.equal(f.wild, 0);
});

test("plan: a bed never gives more than its flower's nectar in a day", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 4;
    bed(s, "home", 3, 3, "clover");
  });
  const f = C.forecast(s, hive(s).id);
  near(f.by.clover, C.FLOWERS.clover.nectar);
});

test("sharing: two hives on one bed split it in proportion to what each asks", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 2; // asks 12
    addHive(s, "home", 4, 3, { strength: 4 }); // asks 24
    bed(s, "home", 3, 3, "clover"); // 5 units, next to both
  });
  const [a, b] = s.hives.list;
  const plans = C.forecastPlot(s, "home");
  near(plans[a.id].by.clover, (5 * 12) / 36);
  near(plans[b.id].by.clover, (5 * 24) / 36);
  near(plans[a.id].by.clover + plans[b.id].by.clover, 5, 0.002);
});

test("sharing: what a crowded bed could not give is asked of a hive's other beds", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 1; // carries 6
    addHive(s, "home", 5, 3, { strength: 4 }); // a big neighbour two squares off
    bed(s, "home", 3, 3, "clover"); // shared: near the first, far from the second
    bed(s, "home", 0, 3, "clover"); // the first hive's own far beds, 5 units each
    bed(s, "home", 0, 2, "clover");
  });
  const [a] = s.hives.list;
  const f = C.forecast(s, a.id);
  // The first round asks the shared bed for 3 and is given little more than half a unit: stopping
  // there it would bring home 3.56. The later rounds ask its own beds for the rest, and it fills up.
  near(f.total, 6, 0.01);
  assert.equal(f.wild, 0);
  for (const b of f.beds.filter((b) => b.x === 0))
    assert.ok(b.units > 2.5, `own bed gave ${b.units}`);
  // But a bed never gives more than it has: with one own bed of 5 it ends on all of that and its
  // 4/28 of the shared one, and the neighbour is not robbed to make up the load.
  const one = edit(s, (s) => (s.land.plots.home.squares[2 * W + 0] = null));
  near(C.forecast(one, a.id).total, 5 + (5 * 4) / 28, 0.002);
});

test("hedgerows: a hive with nothing in reach still brings home three tenths of a load, as wild nectar", () => {
  const s = bare();
  const f = C.forecast(s, hive(s).id);
  near(f.wild, T.WILD_SHARE * T.START_HIVE_STRENGTH * T.FORAGE_PER_STRENGTH);
  assert.deepEqual(f.by, { wild: f.wild });
  assert.equal(f.beds.length, 0);
  // Wild nectar tops a thin day up to that share and no further.
  const thin = edit(s, (s) => bed(s, "home", 3, 3, "clover"));
  const g = C.forecast(thin, hive(thin).id);
  near(g.by.clover + g.wild, T.WILD_SHARE * 18);
  // A hive with plenty of beds takes none.
  const rich = edit(s, (s) => [0, 1, 2, 3, 4].forEach((x) => bed(s, "home", x, 2, "clover")));
  assert.equal(C.forecast(rich, hive(rich).id).wild, 0);
});

test("hedgerows: wild nectar alone is never a growth day, and never names a honey", () => {
  const s = bare();
  const h = hive(s);
  assert.ok(C.forecast(s, h.id).total < T.GROW_FACTOR * C.mealOf(h, s.clock.day));
  assert.equal(C.verdictOf({ wild: 30 }).product, "honey:blend:0");
});

test("plan: only beds in bloom give nectar, a bed planted today gives from tomorrow, and a picked bed gives none that day", () => {
  let s = edit(bare(8), (s) => {
    bed(s, "home", 3, 3, "dandelion"); // over by now
    bed(s, "home", 1, 3, "lavender");
    s.purse.coins = 50;
    s.progress.stats.wax = 1;
  });
  const id = hive(s).id;
  assert.deepEqual(Object.keys(C.forecast(s, id).by).sort(), ["lavender", "wild"]);
  s = ok(s, { type: "plant", plot: "home", x: 2, y: 2, flower: "clover" }).state;
  assert.equal(C.forecast(s, id).by.clover, undefined, "not today");
  assert.ok(C.forecast(s, id, null, { day: s.clock.day + 1 }).by.clover > 0, "from tomorrow");
  s = ok(s, { type: "pickBunch", plot: "home", x: 1, y: 3 }).state;
  assert.equal(C.forecast(s, id).by.lavender, undefined, "a picked bed rests for the day");
});

test("orchard: apple trees are forage in spring without planting anything", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(2));
    addHive(s, "orchard", 2, 2, { strength: 4 });
  });
  const f = C.forecast(s, s.hives.list[1].id);
  assert.ok(f.by.apple > 10, `apple ${f.by.apple}`);
  assert.equal(
    C.canPlant(s, "orchard", 1, 1, "clover"),
    "bad-ground",
    "nothing is planted on a tree",
  );
});

test("forecast = delivery: the morning forecast is exactly what the day brings, hive by hive and flower by flower", () => {
  const rnd = rngOf(42);
  const weathers = ["sunny", "cloudy", "windy", "rain"];
  let checked = 0;
  for (let round = 0; round < 60; round++) {
    const s = edit(fresh(1 + round), (s) => {
      setDay(s, dayOn(rnd.below(21), 1 + rnd.below(2)), rnd.pick(weathers));
      for (const plot of C.PLOT_IDS) {
        s.land.plots[plot].owned = true;
        const grounds =
          plot === "hill"
            ? ["thyme", "heather", "clover", "borage"]
            : ["dandelion", "clover", "lavender", "borage", "sunflower", "buckwheat", "ivy"];
        for (let i = 0; i < W * T.PLOT_H; i++) {
          const x = i % W;
          const y = Math.floor(i / W);
          const ground = C.terrainAt(plot, x, y);
          if (s.land.plots[plot].squares[i] || (ground !== "grass" && ground !== "hill")) continue;
          if (
            rnd() < 0.08 &&
            s.hives.list.filter((h) => h.plot === plot).length < T.HIVES_PER_PLOT
          ) {
            const type = rnd.pick(C.HIVE_IDS);
            const strength = 1 + rnd.below(C.HIVES[type].limit);
            // Some hives nearly full, so that part of the day's load does not fit.
            const stores =
              rnd() < 0.3
                ? { clover: C.HIVES[type].jars * T.NECTAR_PER_JAR - rnd.below(8) }
                : { clover: rnd.below(20) };
            addHive(s, plot, x, y, { type, strength, stores });
          } else if (rnd() < 0.5) bed(s, plot, x, y, rnd.pick(grounds));
        }
      }
    });
    const promised = Object.fromEntries(s.hives.list.map((h) => [h.id, C.forecast(s, h.id)]));
    const started = ok(s, { type: "startDay" });
    for (const h of s.hives.list)
      assert.deepEqual(
        started.state.plan.hives[h.id].by,
        promised[h.id].by,
        "the plan fixed at startDay is the forecast",
      );
    // Fly the day in uneven steps, seeing off any wasps (a raid takes stores, not forage).
    let t = started.state;
    while (t.clock.phase === "day") {
      for (const h of t.hives.list) if (h.raid) t = ok(t, { type: "fendWasps", hive: h.id }).state;
      t = ok(t, { type: "tick", n: 1 + rnd.below(90) }).state;
    }
    for (const before of s.hives.list) {
      const f = promised[before.id];
      const h = C.hiveById(t, before.id);
      near(h.today.got + h.today.lost, f.total, 0.0021);
      near(h.today.got, f.stored, 0.02);
      if (h.today.lost === 0) {
        assert.deepEqual(h.today.by, f.by, `hive ${h.id}: by flower`);
        near(C.totalOf(h.stores), C.totalOf(before.stores) + f.total, 0.002);
        assert.deepEqual(
          C.verdictOf(h.stores),
          f.verdict,
          "and the honey it said the stores would be",
        );
      }
      checked++;
    }
  }
  assert.ok(checked > 300, `only ${checked} hives checked`);
});

test("forecast: after the bees are out it speaks of tomorrow, with tomorrow's weather", () => {
  const s = edit(bare(8), (s) => {
    [1, 2, 3].forEach((x) => bed(s, "home", x, 2, "clover"));
    s.weather.tomorrow = "rain";
    hive(s).strength = C.limitOf(hive(s)); // no growing overnight
    hive(s).stores = { clover: 30 };
  });
  const id = hive(s).id;
  assert.equal(C.forecast(s, id).day, s.clock.day);
  const evening = flyDay(s).state;
  const f = C.forecast(evening, id);
  assert.equal(f.day, s.clock.day + 1);
  assert.equal(f.weather, "rain");
  const next = flyDay(nextMorning(evening).state).state;
  near(hive(next).today.got, f.total, 0.002);
});

test("delivery: nectar comes home evenly through the day, and any way of slicing the ticks gives the same stores", () => {
  const s = edit(bare(), (s) => [0, 1, 2, 3, 4].forEach((x) => bed(s, "home", x, 2, "clover")));
  const id = hive(s).id;
  const total = C.forecast(s, id).total;
  const started = ok(s, { type: "startDay" }).state;
  const half = ok(started, { type: "tick", n: DAY / 2 }).state;
  near(hive(half).today.got, total / 2, 0.002);
  assert.equal(half.clock.phase, "day");
  const whole = ok(started, { type: "tick", n: DAY }).state;
  let t = started;
  while (t.clock.phase === "day") t = ok(t, { type: "tick", n: 7 }).state;
  assert.deepEqual(hive(t).stores, hive(whole).stores);
  assert.equal(whole.clock.phase, "evening");
  one(run(started, { type: "tick", n: DAY }).events, "dayEnded");
});

test("delivery: a full hive stores what fits and loses the rest", () => {
  const s = edit(bare(), (s) => {
    [0, 1, 2, 3, 4].forEach((x) => bed(s, "home", x, 2, "clover"));
    hive(s).stores = { clover: C.capacityOf(hive(s)) - 4 };
  });
  const f = C.forecast(s, hive(s).id);
  near(f.room, 4);
  near(f.stored, 4);
  const h = hive(flyDay(s).state);
  near(C.totalOf(h.stores), C.capacityOf(h), 0.01);
  near(h.today.got + h.today.lost, f.total, 0.002);
  assert.ok(h.today.lost > 0);
});

test("plan: fixed at startDay, so a bed dug at midday stops giving and a bed planted at midday waits for tomorrow", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 1;
    bed(s, "home", 3, 3, "clover");
    s.purse.coins = 50;
  });
  const id = hive(s).id;
  const total = C.forecast(s, id).total;
  const noon = run(s, { type: "startDay" }, { type: "tick", n: DAY / 2 }).state;
  const dug = run(noon, { type: "dig", plot: "home", x: 3, y: 3 }, { type: "tick", n: DAY }).state;
  near(hive(dug).today.by.clover, C.forecast(s, id).by.clover / 2, 0.002);
  const planted = run(
    noon,
    { type: "plant", plot: "home", x: 1, y: 3, flower: "lavender" },
    { type: "tick", n: DAY },
  ).state;
  near(hive(planted).today.got, total, 0.002);
  assert.equal(hive(planted).today.by.lavender, undefined);
});

test("moving: a moved hive flies at half strength that day, the forecast says so, and the next day it is settled", () => {
  const s = edit(bare(), (s) => {
    hive(s).strength = 2;
    // A ring of clover with the middle square left free for the hive.
    [3, 4, 5].forEach((x) =>
      [0, 1, 2].forEach((y) => (x === 4 && y === 1) || bed(s, "home", x, y, "clover")),
    );
  });
  const id = hive(s).id;
  const there = { plot: "home", x: 4, y: 1 };
  // Before moving: the range preview shows both the half day and what it will be once settled.
  const preview = C.forecast(s, id, there);
  assert.equal(preview.moved, true);
  near(preview.carry, 2 * T.FORAGE_PER_STRENGTH * T.MOVED_FLIGHT);
  near(preview.settled.total, 2 * T.FORAGE_PER_STRENGTH);
  const moved = ok(s, { type: "moveHive", hive: id, ...there });
  assert.equal(one(moved.events, "hiveMoved").half, true);
  near(C.forecast(moved.state, id).total, preview.total);
  const evening = flyDay(moved.state).state;
  near(hive(evening).today.got, 6, 0.002);
  const next = flyDay(nextMorning(evening).state).state;
  near(hive(next).today.got, 12, 0.002);
});

test("moving: putting a hive back where it woke undoes the half day", () => {
  const s = bare();
  const id = hive(s).id;
  const was = C.forecast(s, id).total;
  const away = ok(s, { type: "moveHive", hive: id, plot: "home", x: 0, y: 0 }).state;
  near(C.forecast(away, id).total, was / 2);
  const back = ok(away, { type: "moveHive", hive: id, plot: "home", x: 2, y: 3 });
  assert.equal(one(back.events, "hiveMoved").half, false);
  near(C.forecast(back.state, id).total, was);
  assert.equal(hive(back.state).moved, 0);
});

test("moving: mornings only, onto free ground the keeper owns, four hives to a plot", () => {
  const s = edit(bare(), (s) => {
    bed(s, "home", 0, 0, "clover");
    s.land.plots.pond.owned = true;
    [0, 2, 4].forEach((x) => addHive(s, "orchard", x, 0));
    addHive(s, "orchard", 1, 2);
  });
  const id = hive(s).id;
  no(s, { type: "moveHive", hive: id, plot: "home", x: 2, y: 3 }, "same-square");
  no(s, { type: "moveHive", hive: id, plot: "home", x: 0, y: 0 }, "square-taken");
  no(s, { type: "moveHive", hive: id, plot: "pond", x: 5, y: 5 }, "bad-ground");
  no(s, { type: "moveHive", hive: id, plot: "hill", x: 0, y: 0 }, "not-owned");
  no(s, { type: "moveHive", hive: id, plot: "moon", x: 0, y: 0 }, "no-plot");
  no(s, { type: "moveHive", hive: id, plot: "home", x: 6, y: 0 }, "off-plot");
  no(s, { type: "moveHive", hive: 999, plot: "home", x: 1, y: 1 }, "no-hive");
  no(s, { type: "moveHive", hive: id, plot: "orchard", x: 3, y: 3 }, "plot-full");
  // A hive already on a full plot may still move within it.
  ok(s, { type: "moveHive", hive: s.hives.list[1].id, plot: "orchard", x: 3, y: 3 });
  const day = ok(s, { type: "startDay" }).state;
  no(day, { type: "moveHive", hive: id, plot: "home", x: 1, y: 1 }, "not-morning");
  const moved = ok(s, { type: "moveHive", hive: id, plot: "pond", x: 0, y: 0 }).state;
  assert.equal(C.squareAt(moved, "home", 2, 3), null);
  assert.deepEqual(C.squareAt(moved, "pond", 0, 0), { t: "hive", id });
});

test("forecast: trying a hive on another square shows what the neighbours would lose", () => {
  const s = edit(bare(), (s) => {
    addHive(s, "home", 5, 0, { strength: 4 });
    // Two beds the neighbour has to itself: the first hive does not reach the top row from (2,3).
    [3, 4].forEach((x) => bed(s, "home", x, 0, "clover"));
  });
  const [a, b] = s.hives.list;
  assert.equal(C.forecast(s, a.id).beds.length, 0);
  const f = C.forecast(s, a.id, { plot: "home", x: 3, y: 2 }, { settled: true });
  const other = f.others.find((o) => o.id === b.id);
  assert.ok(other && other.total < other.was, JSON.stringify(f.others));
  near(other.was, 10);
  // A hive not yet bought can be previewed too.
  const g = C.forecast(s, null, { plot: "home", x: 2, y: 1 });
  near(g.carry, T.NEW_HIVE_STRENGTH * T.FORAGE_PER_STRENGTH);
  assert.equal(C.forecast(s, 999), null);
  assert.equal(of([], "x").length, 0);
});
