// Save fixtures: saves that every build must go on loading. The files in
// fixtures/ are never regenerated; a build that changes the shape of the
// state adds a new fixture and keeps the old ones.
//
//   day-1.json                 a new game, keeper just made
//   year-2.json                a sensible keeper's save from the second summer
//   before-swarm-years.json    the same save as an older build wrote it:
//                              hives without `harvested`, `swarmYear` and
//                              `today.raided`, no `progress.today`, an almanac
//                              without hearts by regular, and the plan,
//                              regulars, workshop, wardrobe and book slices
//                              missing altogether
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { C, edit, invariants, roundTrips } from "./helpers.mjs";
import { makeBot, play } from "../sim/bots.mjs";

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

/** Everything the save held is still there after loading (loading may only add). */
function keeps(saved, loaded, path = "save") {
  for (const k of Object.keys(saved)) {
    const a = saved[k];
    const b = loaded?.[k];
    if (a && typeof a === "object") {
      if (Array.isArray(a)) assert.equal(b?.length, a.length, `${path}.${k}`);
      keeps(a, b, `${path}.${k}`);
    } else assert.equal(b, a, `${path}.${k}`);
  }
}

/** A lazy keeper picks the game up from `s` and plays on: no action refused, every invariant held. */
function playsOn(s, days) {
  invariants(s);
  const end = play(makeBot("lazy", 3), s, s.clock.day + days).state;
  invariants(end);
  roundTrips(end);
  assert.ok(end.clock.day >= s.clock.day + days);
  return end;
}

for (const [name, days] of [
  ["day-1.json", 30],
  ["year-2.json", 30],
])
  test(`${name} loads with nothing lost, and plays on`, () => {
    const saved = read(name);
    const s = C.loadSave(structuredClone(saved));
    assert.ok(s, "it loads");
    keeps(saved, s);
    assert.deepEqual(Object.keys(s), Object.keys(C.SLICES));
    playsOn(s, days);
  });

test("year-2.json is a game well under way", () => {
  const s = C.loadSave(read("year-2.json"));
  assert.ok(
    s.clock.day > 28 &&
      s.hives.list.length >= 3 &&
      s.progress.almanac.length === 1 &&
      s.book.facts.length >= 10 &&
      s.progress.claimed.length >= 8,
  );
});

test("a save from before swarm years, the day's tally and the wardrobe loads with all of them filled in", () => {
  const saved = read("before-swarm-years.json");
  for (const slice of ["plan", "regulars", "workshop", "wardrobe", "book"])
    assert.equal(saved[slice], undefined, `the fixture has no ${slice}`);
  assert.ok(
    saved.hives.list.every(
      (h) => !("harvested" in h) && !("swarmYear" in h) && !("raided" in h.today),
    ) && !("today" in saved.progress),
  );
  const s = C.loadSave(structuredClone(saved));
  assert.ok(s, "it loads");
  keeps(saved, s);
  for (const h of s.hives.list)
    assert.deepEqual([h.harvested, h.swarmYear, h.today.raided], [0, 0, 0]);
  assert.deepEqual(s.progress.today, { jars: 0, stall: 0, grocer: 0, hearts: 0 });
  assert.deepEqual(
    [s.plan, s.regulars, s.workshop, s.wardrobe, s.book],
    [
      { day: 0, hives: {}, wasps: null },
      { hearts: {}, gifts: {} },
      { made: { day: 0, n: 0 } },
      { owned: [] },
      { facts: [], unread: [], fired: [] },
    ],
  );
  assert.equal(
    s.progress.almanac[0].heartsBy,
    undefined,
    "an old year's page has no hearts by regular: nobody wrote them down",
  );
  const end = playsOn(s, 20);
  assert.equal(end.progress.almanac.length, 2);
  assert.equal(
    Object.keys(end.progress.almanac[1].heartsBy).length,
    C.REGULAR_IDS.length,
    "the next year's page has",
  );
});

test("loadSave: only what was never a save, or is broken beyond playing, is refused", () => {
  for (const junk of [
    null,
    undefined,
    5,
    "save",
    [],
    {},
    { meta: {} },
    { meta: {}, clock: {}, land: {}, hives: {} },
  ])
    assert.equal(C.loadSave(junk), null, JSON.stringify(junk));
  const good = read("year-2.json");
  const h = good.hives.list[0];
  const broken = {
    "day 0": (s) => (s.clock.day = 0),
    "an unknown phase": (s) => (s.clock.phase = "noon"),
    "a negative tick": (s) => (s.clock.tick = -1),
    "a negative purse": (s) => (s.purse.coins = -5),
    "half a coin": (s) => (s.purse.coins = 1.5),
    "no id counter": (s) => (s.meta.nextId = 0),
    "a plot of 35 squares": (s) => s.land.plots.home.squares.pop(),
    "no hives": (s) => (s.hives.list = []),
    "a hive of no known kind": (s) => (s.hives.list[0].type = "castle"),
    "a hive off the plot": (s) => (s.hives.list[0].x = 9),
    "a hive on no plot": (s) => (s.hives.list[0].plot = "moon"),
    "a hive the land knows nothing of": (s) => (s.land.plots[h.plot].squares[h.y * 6 + h.x] = null),
  };
  for (const [what, fn] of Object.entries(broken))
    assert.equal(C.loadSave(edit(good, fn)), null, what);
});

test("a save that has lost any one slice or field is refused outright or loads into a game that plays on", () => {
  const good = read("year-2.json");
  const refused = [];
  let loaded = 0;
  const tryIt = (label, saved) => {
    const s = C.loadSave(saved);
    if (!s) return refused.push(label);
    loaded++;
    try {
      invariants(s);
      invariants(play(makeBot("lazy", 3), s, s.clock.day + 3).state);
    } catch (err) {
      err.message = `without ${label}: ${err.message}`;
      throw err;
    }
  };
  for (const slice of Object.keys(C.SLICES)) {
    tryIt(
      slice,
      edit(good, (s) => delete s[slice]),
    );
    for (const key of Object.keys(good[slice]))
      tryIt(
        `${slice}.${key}`,
        edit(good, (s) => delete s[slice][key]),
      );
  }
  for (const key of Object.keys(good.hives.list[0]))
    tryIt(
      `hive.${key}`,
      edit(good, (s) => delete s.hives.list[0][key]),
    );
  const may = [
    "meta",
    "clock",
    "land",
    "hives",
    "land.plots",
    "hives.list",
    "hive.id",
    "hive.plot",
    "hive.x",
    "hive.y",
  ];
  for (const label of refused)
    assert.ok(may.includes(label), `a save without ${label} should still load`);
  for (const label of ["meta", "clock", "land", "hives"])
    assert.ok(refused.includes(label), `a save without ${label} is not a save`);
  assert.ok(loaded >= 70, `only ${loaded} loaded`);
  // The repairs a damaged save gets: ids that cannot repeat, a tier that follows renown, a colony that fits its hive.
  const mended = C.loadSave(
    edit(good, (s) => {
      s.meta.nextId = 1;
      s.progress.tier = 0;
      Object.assign(s.hives.list[0], {
        type: "skep",
        strength: 9,
        stores: { clover: 90, wild: 30 },
      });
    }),
  );
  assert.ok(mended.meta.nextId > Math.max(...mended.hives.list.map((x) => x.id)));
  assert.equal(mended.progress.tier, good.progress.tier);
  assert.deepEqual(
    [mended.hives.list[0].strength, mended.hives.list[0].stores],
    [4, { clover: 45, wild: 15 }],
  );
});
