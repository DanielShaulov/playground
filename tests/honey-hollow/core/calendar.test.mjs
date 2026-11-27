// The calendar: the year, the three phases of a day, weather, bloom windows
// and stages, and the night card.
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
} from "./helpers.mjs";

test("calendar: a year is four seasons of seven days, and day 1 is the first of spring", () => {
  assert.equal(T.SEASON_DAYS, 7);
  assert.equal(T.YEAR_DAYS, 28);
  assert.deepEqual(C.calendarOf(1), {
    day: 1,
    year: 1,
    doy: 0,
    season: 0,
    seasonName: "spring",
    dayOfSeason: 1,
  });
  assert.deepEqual(C.calendarOf(8), {
    day: 8,
    year: 1,
    doy: 7,
    season: 1,
    seasonName: "summer",
    dayOfSeason: 1,
  });
  assert.equal(C.calendarOf(21).seasonName, "autumn");
  assert.equal(C.calendarOf(22).seasonName, "winter");
  assert.deepEqual(C.calendarOf(29), {
    day: 29,
    year: 2,
    doy: 0,
    season: 0,
    seasonName: "spring",
    dayOfSeason: 1,
  });
  for (const junk of [0, -4, NaN, undefined]) assert.equal(C.calendarOf(junk).day, 1);
});

test("a day: morning, then the bees fly for 240 ticks, then the evening, then sleep", () => {
  const s = fresh();
  assert.equal(DAY, 240);
  no(s, { type: "tick" }, "not-day");
  no(s, { type: "sleep" }, "not-evening");
  const d = ok(s, { type: "startDay" });
  assert.equal(d.state.clock.phase, "day");
  assert.deepEqual(
    { ...one(d.events, "dayStarted"), plan: null },
    { type: "dayStarted", day: 1, weather: "sunny", flying: true, plan: null },
  );
  no(d.state, { type: "startDay" }, "not-morning");
  for (const n of [0, -1, 1.5, "3", null]) no(d.state, { type: "tick", n }, "bad-args");
  const t = ok(d.state, { type: "tick" }).state;
  assert.equal(t.clock.tick, 1);
  const e = ok(t, { type: "tick", n: 100000 });
  assert.deepEqual(e.state.clock, { day: 1, phase: "evening", tick: DAY });
  assert.equal(one(e.events, "dayEnded").hives[0].id, hive(s).id);
  no(e.state, { type: "tick" }, "not-day");
  const m = ok(e.state, { type: "sleep" });
  assert.deepEqual(m.state.clock, { day: 2, phase: "morning", tick: 0 });
  assert.equal(one(m.events, "slept").day, 1);
});

test("weather: tomorrow's is always known, the first two days are sunny, and each season draws from its own odds", () => {
  let s = fresh(5);
  assert.deepEqual(s.weather, { today: "sunny", tomorrow: "sunny" });
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const promised = s.weather.tomorrow;
    s = nextMorning(s).state;
    assert.equal(s.weather.today, promised, "today is what last night's forecast said");
    const odds = T.WEATHER_ODDS[C.calendarOf(s.clock.day + 1).seasonName];
    assert.ok(
      Object.hasOwn(odds, s.weather.tomorrow),
      `${s.weather.tomorrow} on day ${s.clock.day + 1}`,
    );
    seen.add(s.weather.tomorrow);
  }
  for (const w of ["sunny", "cloudy", "windy", "rain", "snow", "frost"])
    assert.ok(seen.has(w), `never saw ${w}`);
  assert.ok(T.FLIGHT.snow === 0 && T.FLIGHT.frost === 0);
});

test("winter: the bees stay in, so startDay goes straight to the evening and nothing is gathered", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(22), "snow");
    hive(s).stores = { clover: 30 };
  });
  assert.equal(C.fliesToday(s, "home"), false);
  const r = ok(s, { type: "startDay" });
  assert.equal(r.state.clock.phase, "evening");
  assert.equal(one(r.events, "dayStarted").flying, false);
  one(r.events, "dayEnded");
  assert.equal(hive(r.state).today.got, 0);
  assert.deepEqual(r.state.plan.hives, {});
});

test("fliesToday: every day but winter's, whatever the weather lets through", () => {
  const on = (doy, weather) => edit(fresh(), (s) => setDay(s, dayOn(doy), weather));
  assert.equal(C.fliesToday(on(8, "sunny"), "home"), true);
  assert.equal(C.fliesToday(on(8, "rain"), "hill"), true, "a little, even in rain");
  assert.equal(C.fliesToday(on(20, "windy"), "hill"), true);
  assert.equal(C.fliesToday(on(21, "frost"), "home"), false);
  assert.equal(C.fliesToday(on(27, "sunny"), "home"), false, "winter, whatever the sky says");
});

test("bloom: every flower blooms inside its window, a green thumb's a day longer, and never in winter", () => {
  const s = fresh(1, "selling");
  const g = fresh(1, "green-thumb");
  for (const id of C.FLOWER_IDS) {
    const f = C.FLOWERS[id];
    assert.deepEqual(C.bloomWindow(s, id), { from: f.from, to: f.to });
    assert.deepEqual(C.bloomWindow(g, id), {
      from: f.from,
      to: Math.min(3 * T.SEASON_DAYS - 1, f.to + 1),
    });
    for (let doy = 0; doy < T.YEAR_DAYS; doy++)
      assert.equal(
        C.inBloom(s, id, dayOn(doy, 2)),
        doy >= f.from && doy <= f.to,
        `${id} on day-of-year ${doy}`,
      );
  }
  assert.equal(C.bloomWindow(s, "nope"), null);
  assert.equal(C.inBloom(s, "nope", 3), false);
});

test("stages: seed the day it is planted, leaf, bud the day before, bloom, faded, dormant in winter", () => {
  const s = fresh();
  const lavender = { flower: "lavender", planted: 0 }; // blooms 7–12
  const stage = (doy) => C.stageOf(s, lavender, dayOn(doy));
  assert.deepEqual([0, 5, 6, 7, 12, 13, 20, 21, 27].map(stage), [
    "leaf",
    "leaf",
    "bud",
    "bloom",
    "bloom",
    "faded",
    "faded",
    "dormant",
    "dormant",
  ]);
  assert.equal(C.stageOf(s, { flower: "lavender", planted: dayOn(8) }, dayOn(8)), "seed");
  assert.equal(C.stageOf(s, { flower: "lavender", planted: dayOn(8) }, dayOn(9)), "bloom");
  assert.equal(
    C.stageOf(s, { flower: "dandelion", planted: 0 }),
    "bloom",
    "today, when no day is named",
  );
});

test("apple trees: bud, blossom, leaf, fruit from late summer to the end of autumn, bare in winter", () => {
  const s = fresh();
  const stage = (doy) => C.treeStageOf(s, dayOn(doy));
  const [from, to] = T.TREE_FRUIT_DOY;
  assert.deepEqual([0, 1, 4, 5, from - 1, from, to, 21, 27].map(stage), [
    "bud",
    "bloom",
    "bloom",
    "leaf",
    "leaf",
    "fruit",
    "fruit",
    "dormant",
    "dormant",
  ]);
  assert.equal(C.treeStageOf(s), "bud", "today, when no day is named");
  assert.equal(
    C.treeStageOf(fresh(1, "green-thumb"), dayOn(5)),
    "bloom",
    "a green thumb's blossom lasts a day longer",
  );
});

test("daysUntil: to the next day that falls on a day of the year", () => {
  const s = fresh();
  assert.equal(C.daysUntil(s, T.SHOW_DOY), 20);
  assert.equal(C.daysUntil(s, 0), 0, "today");
  const winter = edit(s, (s) => setDay(s, dayOn(21)));
  assert.equal(C.daysUntil(winter, T.FAIR_DOY), 3);
  assert.equal(C.daysUntil(winter, T.SHOW_DOY), 27, "next year's");
});

test("bloomsWith: the flowers whose windows meet a flower's, with the days they share", () => {
  const s = fresh();
  assert.deepEqual(C.bloomsWith(s, "lavender"), [
    { flower: "clover", from: 7, to: 10, days: 4 },
    { flower: "borage", from: 7, to: 12, days: 6 },
    { flower: "thyme", from: 8, to: 12, days: 5 },
    { flower: "mint", from: 9, to: 12, days: 4 },
    { flower: "sunflower", from: 10, to: 12, days: 3 },
    { flower: "buckwheat", from: 12, to: 12, days: 1 },
  ]);
  assert.deepEqual(C.bloomsWith(s, "dandelion"), [{ flower: "apple", from: 1, to: 3, days: 3 }]);
  assert.deepEqual(C.bloomsWith(s, "nope"), []);
  for (const a of C.FLOWER_IDS)
    for (const w of C.bloomsWith(s, a)) {
      const back = C.bloomsWith(s, w.flower).find((x) => x.flower === a);
      assert.deepEqual({ ...back, flower: w.flower }, w, `${a} and ${w.flower} agree`);
    }
  const green = C.bloomsWith(fresh(1, "green-thumb"), "dandelion").map((w) => w.flower);
  assert.deepEqual(green, ["apple", "clover"], "a day longer, and the dandelions meet the clover");
});

test("flowersKnown: seeds in the shop or in hand, beds on owned land, and the orchard's apple blossom", () => {
  const s = fresh();
  assert.deepEqual(C.flowersKnown(s), ["dandelion", "clover", "lavender"]);
  const more = edit(s, (s) => {
    s.stock.seeds.mint = 2;
    s.land.plots.orchard.owned = true;
    bed(s, "hill", 0, 0, "heather");
  });
  assert.deepEqual(C.flowersKnown(more), [
    "dandelion",
    "apple",
    "clover",
    "lavender",
    "mint",
    "heather",
  ]);
  const bare = edit(s, (s) => (s.progress.unlocked.flowers = []));
  assert.deepEqual(C.flowersKnown(bare), ["dandelion"], "the wild beds on the Home Meadow");
});

test("the night card: tomorrow's weather, what opens, what is on its last day, what has ended, and who wants a look", () => {
  const on = (doy) =>
    edit(fresh(), (s) => {
      setDay(s, dayOn(doy));
      s.weather.tomorrow = "rain";
      bed(s, "home", 0, 0, "clover");
    });
  const t = C.tomorrow(on(3));
  assert.equal(t.day, dayOn(4));
  assert.equal(t.season, "spring");
  assert.equal(t.weather, "rain");
  assert.deepEqual([t.starts, t.lastDay, t.ended], [["clover"], [], ["dandelion"]]);
  assert.deepEqual([t.show, t.fair], [false, false]);
  assert.deepEqual(C.tomorrow(on(2)).lastDay, ["dandelion"]);
  assert.equal(C.tomorrow(on(T.SHOW_DOY - 1)).show, true);
  assert.equal(C.tomorrow(on(T.FAIR_DOY - 1)).fair, true);
  // An empty hive cannot eat tonight: it is on the card.
  assert.deepEqual(t.hives, [{ id: hive(on(3)).id, flags: ["low"] }]);
  assert.deepEqual(t.spoils, []);
  // Flowers nobody grows are not news.
  assert.deepEqual(C.tomorrow(edit(fresh(), (s) => setDay(s, dayOn(6)))).starts, []);
});

test("sleep: the day's takings are wiped, the season turns on its first morning", () => {
  const s = edit(fresh(), (s) => {
    setDay(s, dayOn(6));
    hive(s).stores = { clover: 30 };
    s.purse.today = { earned: 9, spent: 4 };
  });
  const r = ok(flyDay(s).state, { type: "sleep" });
  assert.deepEqual(r.state.purse.today, { earned: 0, spent: 0 });
  assert.deepEqual(one(r.events, "seasonChanged"), {
    type: "seasonChanged",
    season: "summer",
    year: 1,
  });
  assert.equal(of(nextMorning(r.state).events, "seasonChanged").length, 0);
});
