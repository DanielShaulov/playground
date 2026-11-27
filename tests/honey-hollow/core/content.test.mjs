// Content checks: the tables in content/ agree with each other and with the
// rules that read them, so a typo in a goal, a recipe or a fact is caught
// here and not by a player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, T } from "./helpers.mjs";

const unique = (list, what) =>
  assert.equal(
    new Set(list).size,
    list.length,
    `${what} repeat: ${list.filter((x, i) => list.indexOf(x) !== i).join(", ")}`,
  );
const ascending = (list) => list.every((x, i) => i === 0 || x > list[i - 1]);
const whole = (n) => Number.isInteger(n) && n > 0;
const hat = (id) => C.WARDROBE.hat.find((h) => h.id === id);

/** A reward (a goal's or a regular's gift) hands over things that exist. */
function rewardOk(reward, where) {
  const kinds = ["coins", "renown", "seeds", "items", "recipe", "wardrobe"];
  assert.ok(Object.keys(reward).length > 0, `${where}: an empty reward`);
  for (const k of Object.keys(reward)) assert.ok(kinds.includes(k), `${where}: reward.${k}`);
  for (const k of ["coins", "renown"])
    if (k in reward) assert.ok(whole(reward[k]), `${where}: ${k}`);
  for (const [flower, n] of Object.entries(reward.seeds ?? {}))
    assert.ok(C.FLOWERS[flower]?.seed != null && whole(n), `${where}: seeds of ${flower}`);
  for (const [item, n] of Object.entries(reward.items ?? {}))
    assert.ok(Object.hasOwn(T.SHOP, item) && whole(n), `${where}: item ${item}`);
  if ("recipe" in reward)
    assert.ok(Object.hasOwn(C.RECIPES, reward.recipe), `${where}: recipe ${reward.recipe}`);
  if ("wardrobe" in reward)
    assert.ok(hat(reward.wardrobe), `${where}: wardrobe ${reward.wardrobe}`);
}

test("facts: each has an id, a key the core raises, words, and a source to check them against", () => {
  unique(
    C.FACTS.map((f) => f.id),
    "fact ids",
  );
  for (const f of C.FACTS) {
    assert.match(f.id, /^[a-z0-9-]+$/);
    assert.ok(C.TRIGGERS.includes(f.trigger), `${f.id}: the core raises no key "${f.trigger}"`);
    for (const k of ["topic", "title", "text"])
      assert.ok(typeof f[k] === "string" && f[k].trim().length > 0, `${f.id}.${k}`);
    assert.ok(Array.isArray(f.sources) && f.sources.length >= 1, `${f.id} names no source`);
    for (const src of f.sources) {
      assert.ok(
        typeof src.title === "string" && src.title.trim().length > 0,
        `${f.id}: a source without a title`,
      );
      assert.match(src.url, /^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/, `${f.id}: ${src.url}`);
    }
  }
});

test("keys without a page yet: only the regulars' first and third gifts (Mr Fenwick's are written)", () => {
  const written = new Set(C.FACTS.map((f) => f.trigger));
  const empty = C.REGULAR_IDS.filter((r) => r !== "fenwick").flatMap((r) => [
    `gift-${r}-1`,
    `gift-${r}-3`,
  ]);
  assert.deepEqual(
    C.TRIGGERS.filter((k) => !written.has(k)),
    empty,
  );
});

test("goals: each measures something real, can come up, and rewards something that exists", () => {
  unique(C.GOAL_IDS, "goal ids");
  assert.deepEqual(
    C.GOALS.map((g) => g.id),
    C.GOAL_IDS,
  );
  const most = {
    kinds: C.FLOWER_IDS.length,
    kinds3: C.FLOWER_IDS.length,
    bestHive: C.HIVE_IDS.length - 1,
    friends: C.REGULAR_IDS.length,
    facts: C.FACTS.length,
    hives: C.PLOT_IDS.length * T.HIVES_PER_PLOT,
  };
  for (const [i, g] of C.GOALS.entries()) {
    assert.ok(Object.hasOwn(C.MEASURES, g.measure), `${g.id}: nothing measures "${g.measure}"`);
    assert.ok(whole(g.need), `${g.id}.need`);
    assert.ok(g.name.trim().length > 0 && g.text.trim().length > 0, `${g.id} needs words`);
    rewardOk(g.reward, g.id);
    if (g.measure === "jarsOf") assert.ok(C.FLOWER_IDS.includes(g.arg), `${g.id}: ${g.arg}`);
    if (g.measure === "craftedOf") assert.ok(C.FAMILIES.includes(g.arg), `${g.id}: ${g.arg}`);
    if (g.measure === "plot")
      assert.ok(C.PLOT_IDS.includes(g.arg) && C.PLOTS[g.arg].price > 0, `${g.id}: ${g.arg}`);
    if (g.measure in most)
      assert.ok(g.need <= most[g.measure], `${g.id} asks for ${g.need} of ${most[g.measure]}`);
    if (g.after)
      assert.ok(
        C.GOAL_IDS.indexOf(g.after) >= 0 && C.GOAL_IDS.indexOf(g.after) < i,
        `${g.id} waits for a goal that is not before it`,
      );
    if (g.plot) assert.ok(C.PLOT_IDS.includes(g.plot), `${g.id}: plot ${g.plot}`);
    if (g.tier !== undefined)
      assert.ok(g.tier >= 1 && g.tier < C.TIERS.length, `${g.id}: tier ${g.tier}`);
    if (g.season)
      assert.ok(
        g.season.length === 2 &&
          g.season[0] >= 0 &&
          g.season[0] <= g.season[1] &&
          g.season[1] < T.YEAR_DAYS,
        `${g.id}: season`,
      );
    if (g.fromDay !== undefined) assert.ok(whole(g.fromDay), `${g.id}: fromDay`);
  }
});

test("unlocks: every recipe, seed and hat that is earned is given by what it names, and the other way round", () => {
  const one = (u, where) => assert.equal(Object.keys(u).length, 1, `${where}: one way to unlock`);
  const tier = (n) => Number.isInteger(n) && n >= 1 && n < C.TIERS.length;
  for (const r of Object.values(C.RECIPES)) {
    const u = r.unlock;
    one(u, r.id);
    if (u.goal)
      assert.equal(
        C.GOALS.find((g) => g.id === u.goal)?.reward.recipe,
        r.id,
        `${r.id}: goal ${u.goal} does not teach it`,
      );
    else if (u.tier !== undefined) assert.ok(tier(u.tier), r.id);
    else if (u.plot) assert.ok(C.PLOT_IDS.includes(u.plot), r.id);
    else assert.equal(u.start, true, r.id);
  }
  for (const g of C.GOALS) {
    if (g.reward.recipe)
      assert.equal(
        C.RECIPES[g.reward.recipe].unlock.goal,
        g.id,
        `${g.id}'s recipe is unlocked some other way`,
      );
    if (g.reward.wardrobe)
      assert.equal(
        hat(g.reward.wardrobe).unlock.goal,
        g.id,
        `${g.id}'s hat is earned some other way`,
      );
  }
  for (const f of Object.values(C.FLOWERS)) {
    const u = f.unlock;
    one(u, f.id);
    if (u.tier !== undefined) assert.ok(tier(u.tier), f.id);
    else if (u.plot) assert.ok(C.PLOT_IDS.includes(u.plot), f.id);
    else assert.equal(u.start, true, f.id);
  }
  unique(
    C.WARDROBE.hat.map((h) => h.id),
    "hats",
  );
  for (const h of C.WARDROBE.hat) {
    const u = h.unlock;
    one(u, h.id);
    if (u.goal)
      assert.equal(
        C.GOALS.find((g) => g.id === u.goal)?.reward.wardrobe,
        h.id,
        `${h.id}: goal ${u.goal} does not give it`,
      );
    else if (u.gift)
      assert.equal(
        C.REGULARS[u.gift[0]]?.gifts[u.gift[1] - 1]?.wardrobe,
        h.id,
        `${h.id}: ${u.gift} does not give it`,
      );
    else if (u.tier !== undefined) assert.ok(tier(u.tier), h.id);
    else assert.ok(u.start === true || u.ribbon === true, h.id);
  }
  for (const r of Object.values(C.REGULARS))
    r.gifts.forEach(
      (gift, i) => gift.wardrobe && assert.deepEqual(hat(gift.wardrobe).unlock.gift, [r.id, i + 1]),
    );
  // Everything but hats is there from the first screen, and so is the look a keeper starts from.
  assert.deepEqual(Object.keys(C.WARDROBE), C.LOOK_PARTS);
  for (const part of C.LOOK_PARTS.filter((p) => p !== "hat")) {
    const items =
      part === "hair" ? [...C.WARDROBE.hair.woman, ...C.WARDROBE.hair.man] : C.WARDROBE[part];
    unique(
      items.map((i) => i.id),
      part,
    );
    for (const item of items) assert.deepEqual(item.unlock, { start: true }, `${part} ${item.id}`);
  }
  for (const [part, id] of Object.entries(C.DEFAULT_LOOK))
    assert.ok(C.owns(C.newGame(1), part, id), `the starting ${part}`);
});

test("flowers and honeys: one honey for each flower, windows inside the flying year, ground to grow on", () => {
  assert.deepEqual(C.HONEY_IDS, [...C.FLOWER_IDS, "blend"]);
  assert.equal(C.FLOWER_IDS.length, 11);
  const s = C.newGame(1);
  for (const [id, f] of Object.entries(C.FLOWERS)) {
    assert.equal(f.id, id);
    assert.ok(
      Number.isInteger(f.from) &&
        Number.isInteger(f.to) &&
        f.from >= 0 &&
        f.from <= f.to &&
        f.to <= 20,
      `${id} blooms ${f.from} to ${f.to}`,
    );
    assert.ok(f.nectar > 0, id);
    assert.ok(["any", "hill", "water", "tree"].includes(f.where), id);
    assert.equal(f.seed === null, f.where === "tree", `${id}: only the trees are never planted`);
    if (f.seed !== null) assert.ok(whole(f.seed), id);
    assert.ok(C.whereGrows(s, id).length >= 1, `${id} grows nowhere`);
    if (f.unlock.plot)
      assert.ok(
        C.whereGrows(s, id).includes(f.unlock.plot),
        `${id} comes with a plot it cannot grow on`,
      );
    assert.equal(C.BUNCHES.includes(id), !!f.bunch, id);
  }
  for (let doy = 0; doy <= 20; doy++)
    assert.ok(
      C.FLOWER_IDS.some((f) => C.FLOWERS[f].from <= doy && doy <= C.FLOWERS[f].to),
      `nothing blooms on day-of-year ${doy}`,
    );
  assert.deepEqual(
    Object.keys(C.TRAIT_NAMES),
    C.TRAITS,
    "a word for every trait, in the traits' own order",
  );
  for (const [id, h] of Object.entries(C.HONEYS)) {
    assert.equal(h.id, id);
    assert.ok(whole(h.price), id);
    unique(h.traits, `${id}'s traits`);
    for (const t of h.traits) assert.ok(C.TRAITS.includes(t), `${id}: ${t}`);
    assert.equal(
      h.traits.filter((t) => ["light", "amber", "dark"].includes(t)).length,
      id === "blend" ? 0 : 1,
      `${id} has one colour`,
    );
    if (id !== "blend") assert.ok(h.traits.length >= 2, `${id} has a taste`);
  }
  for (const t of C.TRAITS)
    assert.ok(
      Object.values(C.HONEYS).some((h) => h.traits.includes(t)),
      `no honey is ${t}`,
    );
});

test("goods and recipes: everything on the shelf can be made, and every recipe is made of something", () => {
  const made = new Set();
  for (const [id, r] of Object.entries(C.RECIPES)) {
    assert.equal(r.id, id);
    assert.ok(Number.isInteger(r.wax) && r.wax >= 0, id);
    for (const f of r.bunch ?? [])
      assert.ok(C.BUNCHES.includes(f), `${id}: nobody picks bunches of ${f}`);
    if (r.honey) assert.ok(["any", "pure"].includes(r.honey), id);
    assert.ok(r.wax > 0 || r.bunch || r.honey || r.candle || r.soap, `${id} is made of nothing`);
    if (r.makes === "soap-*") for (const f of r.bunch) made.add(`soap-${f}`);
    else if (r.makes !== "remedy") made.add(r.makes);
  }
  assert.deepEqual([...made].sort(), [...C.GOOD_IDS].sort());
  for (const [id, g] of Object.entries(C.GOODS)) {
    assert.equal(g.id, id);
    assert.ok(whole(g.price), id);
    assert.ok(C.FAMILIES.includes(g.family), id);
    for (const [season, m] of Object.entries(g.season ?? {}))
      assert.ok(T.SEASONS.includes(season) && m > 0, `${id}: ${season}`);
  }
  for (const family of ["candle", "soap"])
    assert.ok(C.FAMILIES.includes(family), `the gift basket needs a ${family}`);
});

test("hives: a chain from the skep to the tall stack, each bigger and dearer than the last", () => {
  const chain = [];
  for (let id = C.HIVE_IDS[0]; id; id = C.HIVES[id].next) chain.push(id);
  assert.deepEqual(chain, C.HIVE_IDS);
  const rows = C.HIVE_IDS.map((id) => C.HIVES[id]);
  assert.equal(rows[0].cost, 0);
  for (const k of ["jars", "limit", "cost"]) assert.ok(ascending(rows.map((r) => r[k])), k);
  assert.ok(T.START_HIVE_STRENGTH <= rows[0].limit && T.NEW_HIVE_STRENGTH <= rows[0].limit);
  assert.ok(T.SPLIT_MIN_STRENGTH <= rows[0].limit, "a full skep can be split");
});

test("plots: six by six, the Home Meadow free, its first hive on grass with every wild bed in reach", () => {
  for (const p of Object.values(C.PLOTS)) {
    assert.equal(p.terrain.length, T.PLOT_H, p.id);
    for (const row of p.terrain) {
      assert.equal(row.length, T.PLOT_W, p.id);
      for (const ch of row) assert.ok(Object.hasOwn(C.TERRAIN, ch), `${p.id}: "${ch}"`);
    }
    assert.ok(
      [...p.terrain.join("")].filter((ch) => ch === "." || ch === "h").length >= 20,
      `${p.id} has room for hives and beds`,
    );
  }
  assert.deepEqual(
    C.PLOT_IDS.map((p) => C.PLOTS[p].price),
    [0, 150, 320, 600],
  );
  const { hive, wild } = C.START;
  assert.deepEqual([hive.plot, C.terrainAt(hive.plot, hive.x, hive.y)], ["home", "grass"]);
  assert.equal(wild.length, T.WILD_BEDS);
  unique(
    wild.map(([x, y]) => `${x},${y}`),
    "wild beds",
  );
  const reach = C.reachOf(hive.plot, hive.x, hive.y).map((r) => `${r.x},${r.y}`);
  for (const [x, y] of wild)
    assert.ok(
      C.terrainAt("home", x, y) === "grass" && reach.includes(`${x},${y}`),
      `wild bed ${x},${y}`,
    );
});

test("regulars: eight, each loving something a keeper can come to make, with three gifts", () => {
  assert.equal(C.REGULAR_IDS.length, 8);
  for (const [id, r] of Object.entries(C.REGULARS)) {
    assert.equal(r.id, id);
    assert.equal(r.gifts.length, T.HEART_GIFTS.length, id);
    r.gifts.forEach((gift, i) => rewardOk(gift, `${id}'s gift ${i + 1}`));
    assert.ok(r.loves.length >= 1, id);
    for (const love of r.loves) {
      const [kind, what] = String(love.value).split(":");
      if (love.type === "trait")
        assert.ok(C.TRAITS.includes(love.value), `${id} loves ${love.value}`);
      else if (love.type === "kind")
        assert.ok(
          (kind === "honey" && C.FLOWER_IDS.includes(what)) ||
            (kind === "good" && C.GOOD_IDS.includes(what)) ||
            (kind === "family" && C.FAMILIES.includes(what)),
          `${id} loves ${love.value}`,
        );
      else assert.equal(love.type, "finest", id);
    }
    if (r.qty !== undefined) assert.ok([1, 2, 3].includes(r.qty), id);
  }
});

test("tuning: the numbers that lean on each other agree", () => {
  assert.equal(T.YEAR_DAYS, 28);
  assert.ok(
    T.WILD_SHARE < (T.GROW_FACTOR * T.EAT_PER_STRENGTH) / T.FORAGE_PER_STRENGTH,
    "the hedgerow alone must never grow a colony",
  );
  assert.ok(
    T.WILD_SHARE * T.FORAGE_PER_STRENGTH > T.EAT_PER_STRENGTH,
    "but on a sunny day it feeds one",
  );
  assert.ok(
    ascending(T.STARS.map((s) => s.at)) &&
      ascending(T.STARS.map((s) => s.mult)) &&
      T.STARS.at(-1).at <= 1,
  );
  assert.equal(T.RIBBONS.length, T.STARS.length);
  assert.ok(ascending(T.RIBBONS.map((r) => r.coins)) && ascending(T.RIBBONS.map((r) => r.renown)));
  assert.ok(ascending(T.HEART_GIFTS));
  assert.ok(ascending([0, T.MITES_SPOTTED, T.MITES_STALL, T.MITES_HARM, 100]));
  assert.ok(
    T.DUST_MITES > T.MITE_RATE * C.HIVES[C.HIVE_IDS.at(-1)].limit,
    "a dusting a day keeps even the biggest colony's mites down",
  );
  for (const [from, to] of [T.SWARM_DOY, T.WASP_DOY])
    assert.ok(from >= 0 && from <= to && to <= 20);
  assert.ok(
    T.WASP_WINDOW[0] >= 1 &&
      T.WASP_WINDOW[0] <= T.WASP_WINDOW[1] &&
      T.WASP_WINDOW[1] < T.TICKS_PER_DAY,
  );
  assert.deepEqual(
    [C.calendarOf(T.SHOW_DOY + 1).season, C.calendarOf(T.SHOW_DOY + 2).season],
    [2, 3],
    "the Show is autumn's last evening",
  );
  assert.equal(C.calendarOf(T.FAIR_DOY + 1).season, 3, "the Fair is in winter");
  assert.deepEqual(Object.keys(T.WEATHER_ODDS), T.SEASONS);
  for (const odds of Object.values(T.WEATHER_ODDS))
    for (const w of Object.keys(odds)) assert.ok(Object.hasOwn(T.FLIGHT, w), w);
  for (const [id, item] of Object.entries(T.SHOP))
    assert.ok(item.id === id && whole(item.price), id);
  assert.deepEqual(
    C.TIERS.map((t) => t.tier),
    [0, 1, 2, 3, 4],
  );
  assert.ok(C.TIERS[0].renown === 0 && ascending(C.TIERS.map((t) => t.renown)));
  assert.equal(C.customersFor(C.TIERS.length - 1), T.CUSTOMERS_MAX);
  assert.ok(
    T.GLUT_FLOOR > 0 &&
      T.GLUT_FLOOR < 1 &&
      T.GROCER_PAY < T.FINE_PAY &&
      T.FINE_PAY < 1 &&
      T.DELIGHTED_PAY > 1,
  );
});
