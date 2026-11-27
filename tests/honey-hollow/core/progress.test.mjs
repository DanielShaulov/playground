// Rule tests for progress: renown and its tiers, the goal list and its
// rewards, the shop, the day's tally, the year's end, and the running
// statistics (checked against the events of whole games).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  ok,
  no,
  edit,
  fresh,
  hive,
  setDay,
  dayOn,
  flyDay,
  nextMorning,
  one,
  of,
  atStall,
  playOut,
} from "./helpers.mjs";
import { makeBot } from "../sim/bots.mjs";

const open = (s) => C.goalsNow(s).map((g) => g.goal.id);
/** A new game with every goal before `id` claimed, then arranged by `more`. */
const claimedBefore = (id, more = () => {}) =>
  edit(fresh(), (s) => {
    s.progress.claimed = C.GOAL_IDS.slice(0, C.GOAL_IDS.indexOf(id));
    more(s);
  });

test("renown: five tiers, each bringing seeds, recipes or a hat, and one more customer an evening", () => {
  assert.deepEqual(
    C.TIERS.map((t) => [t.tier, t.renown]),
    [
      [0, 0],
      [1, 10],
      [2, 30],
      [3, 70],
      [4, 140],
    ],
  );
  const t0 = C.tierOf(fresh());
  assert.deepEqual(
    [t0.tier, t0.name, t0.renown, t0.next.tier, t0.next.renown, t0.customers],
    [0, "New in the Hollow", 0, 1, 10, 2],
  );
  const brings = {
    1: [
      ["flower", "borage"],
      ["flower", "sunflower"],
    ],
    2: [
      ["flower", "buckwheat"],
      ["flower", "ivy"],
      ["recipe", "balm"],
      ["recipe", "wraps"],
    ],
    3: [["recipe", "basket"]],
    4: [["wardrobe", "golden-veil"]],
  };
  for (const tier of [1, 2, 3, 4]) {
    const before = atStall(
      edit(fresh(), (s) => {
        s.progress.renown = C.TIERS[tier].renown - 1;
        s.progress.tier = tier - 1;
      }),
      [{ type: "any" }],
      { "clover:1": 1 },
    );
    const r = ok(before, { type: "offer", product: "honey:clover:1" });
    assert.deepEqual(one(r.events, "renownUp"), {
      type: "renownUp",
      tier,
      name: C.TIERS[tier].name,
    });
    assert.deepEqual(
      of(r.events, "unlocked").map((e) => [e.what, e.id]),
      brings[tier],
    );
    assert.deepEqual([C.tierOf(r.state).tier, C.tierOf(r.state).customers], [tier, 2 + tier]);
    if (tier === 4) assert.equal(C.tierOf(r.state).next, null);
  }
});

test("goals: three open at a time, in list order, each claimed once for its reward", () => {
  const s = fresh();
  assert.equal(C.GOALS_OPEN, 3);
  assert.deepEqual(
    C.goalsNow(s).map((g) => [g.goal.id, g.have, g.need, g.ready]),
    [
      ["first-flight", 0, 1, false],
      ["first-jar", 0, 1, false],
      ["first-sale", 0, 1, false],
    ],
  );
  no(s, { type: "claimGoal", goal: "first-flight" }, "goal-not-ready");
  no(s, { type: "claimGoal", goal: "all-stars" }, "goal-not-open");
  no(s, { type: "claimGoal", goal: "nope" }, "no-goal");
  const day = ok(s, { type: "startDay" });
  assert.deepEqual(one(day.events, "goalReady"), { type: "goalReady", goal: "first-flight" });
  assert.deepEqual(day.state.progress.ready, ["first-flight"]);
  assert.equal(
    of(ok(day.state, { type: "tick", n: 10 }).events, "goalReady").length,
    0,
    "a goal is announced once",
  );
  const r = ok(day.state, { type: "claimGoal", goal: "first-flight" });
  assert.deepEqual(one(r.events, "goalClaimed"), {
    type: "goalClaimed",
    goal: "first-flight",
    reward: { coins: 5 },
  });
  assert.equal(r.state.purse.coins, T.START_COINS + 5);
  assert.deepEqual([r.state.progress.claimed, r.state.progress.ready], [["first-flight"], []]);
  assert.deepEqual(open(r.state), ["first-jar", "first-sale", "first-beds"]);
  no(r.state, { type: "claimGoal", goal: "first-flight" }, "goal-not-open");
  const many = edit(s, (s) => (s.progress.stats.days = 9));
  assert.deepEqual(
    [C.goalsNow(many)[0].have, C.measure(many, C.GOALS[0])],
    [1, 9],
    "the list shows no more than is needed",
  );
});

test("goals: some wait for another goal, a day, a season, a tier or a plot, unless they are already met", () => {
  const at = (doy, more = () => {}) =>
    claimedBefore("first-bunch", (s) => {
      setDay(s, dayOn(doy));
      more(s);
    });
  assert.deepEqual(
    open(at(0)),
    ["box-hive", "pond", "familiar-face"],
    "no bunches to pick in spring, no mites yet, no wasps",
  );
  assert.deepEqual(open(at(7)), ["first-bunch", "box-hive", "pond"], "summer: the lavender is out");
  assert.deepEqual(
    open(at(0, (s) => (s.progress.stats.picked = 1))),
    ["first-bunch", "box-hive", "pond"],
    "a goal already met is shown whatever the season",
  );
  assert.deepEqual(
    open(at(9, (s) => s.progress.claimed.push("first-bunch"))),
    ["first-soap", "box-hive", "pond"],
    "soap waits for the bunch",
  );
  const boxed = (doy) =>
    at(doy, (s) => s.progress.claimed.push("first-bunch", "first-soap", "box-hive"));
  assert.deepEqual(open(boxed(6)), ["pond", "familiar-face", "five-kinds"]);
  assert.deepEqual(
    open(boxed(7)),
    ["queen-cells", "pond", "familiar-face"],
    "splitting is offered from day 8",
  );
  assert.deepEqual(open(boxed(11)), ["queen-cells", "pond", "mites"]);
  const mint = (more = () => {}) => claimedBefore("mint-honey", more);
  assert.deepEqual(open(mint()), ["familiar-face", "five-kinds", "orchard"]);
  assert.deepEqual(
    open(mint((s) => (s.land.plots.pond.owned = true))),
    ["mint-honey", "familiar-face", "five-kinds"],
    "mint honey waits for the pond",
  );
  const balm = (more = () => {}) => claimedBefore("lip-balm", more);
  assert.deepEqual(open(balm()), ["five-hives", "three-best", "hill"]);
  assert.deepEqual(
    open(balm((s) => Object.assign(s.progress, { tier: 2, renown: 30 }))),
    ["lip-balm", "five-hives", "three-best"],
    "lip balm waits for the recipe's tier",
  );
});

test("rewards: coins, seeds, items, recipes, wardrobe pieces and renown all arrive", () => {
  const claim = (id, ready) => {
    const before = claimedBefore(id, ready);
    return { before, ...ok(before, { type: "claimGoal", goal: id }) };
  };
  let r = claim("first-sale", (s) => (s.progress.stats.customers = 1));
  assert.deepEqual(r.state.stock.seeds, { clover: 4 });
  r = claim("delight-3", (s) => (s.progress.stats.delighted = 3));
  assert.deepEqual(
    [
      r.state.purse.coins - r.before.purse.coins,
      r.state.purse.today.earned,
      r.state.progress.renown,
    ],
    [10, 10, 1],
  );
  r = claim("first-candle", (s) => (s.progress.stats.craftedBy.candle = 1));
  assert.ok(r.state.progress.unlocked.recipes.includes("lavender-candle"));
  assert.deepEqual(
    of(r.events, "unlocked").map((e) => [e.what, e.id]),
    [["recipe", "lavender-candle"]],
  );
  r = claim("box-hive", (s) => (s.progress.stats.upgraded = 1));
  assert.equal(r.state.hives.spare, 1);
  r = claim("mites", (s) => {
    setDay(s, 10);
    s.progress.stats.dusted = 1;
  });
  assert.equal(r.state.stock.remedy, 1);
  r = claim("winter-ready", (s) => {
    setDay(s, 15);
    s.progress.stats.goodWinters = 1;
  });
  assert.ok(C.owns(r.state, "hat", "knit"));
  assert.equal(r.state.purse.coins - r.before.purse.coins, 30);
});

test("the shop: seeds as they are unlocked, and syrup, spare hives and remedies from the first summer", () => {
  const s = fresh();
  const shop = C.shopNow(s);
  assert.deepEqual(
    shop.seeds.map((x) => [x.flower, x.price, x.have, x.inShop]),
    [
      ["dandelion", 2, 0, true],
      ["clover", 4, 0, true],
      ["lavender", 6, 0, true],
    ],
  );
  assert.deepEqual(
    shop.items.map((i) => [i.id, i.price, i.have, i.open]),
    [
      ["syrup", 8, 0, false],
      ["spare", 25, 0, false],
      ["remedy", 15, 0, false],
    ],
  );
  assert.deepEqual(shop.hive, { price: 40 });
  assert.deepEqual(
    shop.plots.map((p) => [p.plot, p.price]),
    [
      ["pond", 150],
      ["orchard", 320],
      ["hill", 600],
    ],
  );
  no(s, { type: "buy", item: "syrup", n: 1 }, "not-yet");
  const summer = edit(s, (s) => {
    setDay(s, T.SHOP_ITEMS_FROM_DAY);
    s.purse.coins = 100;
    s.stock.seeds.mint = 3;
  });
  assert.ok(C.shopNow(summer).items.every((i) => i.open));
  const mint = C.shopNow(summer).seeds.at(-1);
  assert.deepEqual(
    [mint.flower, mint.price, mint.have, mint.inShop],
    ["mint", 7, 3, false],
    "seed in hand is listed though the shop has none",
  );
  let r = ok(summer, { type: "buy", item: "syrup", n: 2 });
  assert.deepEqual(one(r.events, "bought"), { type: "bought", item: "syrup", n: 2, coins: 16 });
  assert.deepEqual(
    [r.state.stock.syrup, r.state.purse.coins, r.state.purse.today.spent],
    [2, 84, 16],
  );
  r = ok(r.state, { type: "buy", item: "spare" });
  r = ok(r.state, { type: "buy", item: "remedy", n: 3 });
  assert.deepEqual([r.state.hives.spare, r.state.stock.remedy, r.state.purse.coins], [1, 3, 14]);
  assert.deepEqual(
    C.shopNow(r.state).items.map((i) => i.have),
    [2, 1, 3],
  );
  no(r.state, { type: "buy", item: "spare" }, "no-coins");
  no(summer, { type: "buy", item: "honey" }, "not-for-sale");
  no(summer, { type: "buy", item: 3 }, "not-for-sale");
  for (const n of [0, 100, 1.5, "1"]) no(summer, { type: "buy", item: "syrup", n }, "bad-args");
});

test("today's tally: jars taken, coins at the stall and from the grocer, hearts won; wiped each morning", () => {
  let s = edit(fresh(1, "whisperer"), (s) => (hive(s).stores = { clover: 40 }));
  assert.deepEqual(s.progress.today, { jars: 0, stall: 0, grocer: 0, hearts: 0 });
  s = ok(s, { type: "harvest", hive: 1, jars: 3 }).state;
  s = atStall(s, [{ who: "barley", type: "trait", value: "mild", qty: 1 }]);
  const stall = C.quote(s, "honey:clover:3", 1, "delighted");
  s = ok(s, { type: "offer", product: "honey:clover:3" }).state;
  const grocer = C.quote(s, "honey:clover:3", 2, "grocer");
  s = ok(s, { type: "sellToGrocer", product: "honey:clover:3", n: 2 }).state;
  assert.deepEqual(s.progress.today, { jars: 3, stall, grocer, hearts: 1 });
  assert.deepEqual(s.purse.today, { earned: stall + grocer, spent: 0 });
  const next = nextMorning(s).state;
  assert.deepEqual(next.progress.today, { jars: 0, stall: 0, grocer: 0, hearts: 0 });
  assert.deepEqual(next.purse.today, { earned: 0, spent: 0 });
  assert.equal(next.progress.stats.jars, 3, "the running count stays");
});

test("the year's end: the almanac keeps the year as it stood, hearts by regular and friends included", () => {
  const last = (more = () => {}) =>
    flyDay(
      edit(fresh(), (s) => {
        setDay(s, dayOn(27), "snow");
        hive(s).stores = { ivy: 20 };
        s.regulars.hearts = { posy: 3, wren: 1 };
        s.progress.ribbons = [{ year: 1, honey: "clover", medal: "gold" }];
        s.progress.year = {
          jars: 12,
          pure: 9,
          kinds: ["clover", "dandelion"],
          earned: 140,
          hungryWinter: 0,
        };
        s.progress.claimed = ["first-flight"];
        s.purse.coins = 77;
        more(s);
      }),
    ).state;
  const eve = last();
  assert.equal(C.yearDue(eve), null);
  const r = nextMorning(eve);
  const e = one(r.events, "yearEnded");
  assert.equal(e.year, 1);
  assert.deepEqual(e.summary, {
    year: 1,
    jars: 12,
    pure: 9,
    kinds: ["clover", "dandelion"],
    earned: 140,
    ribbons: [{ honey: "clover", medal: "gold" }],
    facts: eve.book.facts.length,
    hives: 1,
    plots: 1,
    renown: 0,
    tier: 0,
    goals: 1,
    hearts: 4,
    heartsBy: {
      hattie: 0,
      fenwick: 0,
      posy: 3,
      linden: 0,
      marguerite: 0,
      tobias: 0,
      wren: 1,
      barley: 0,
    },
    friends: 1,
    hungryWinter: 0,
    coins: 77,
  });
  assert.deepEqual(one(r.events, "seasonChanged"), {
    type: "seasonChanged",
    season: "spring",
    year: 2,
  });
  assert.deepEqual(r.state.progress.almanac, [e.summary]);
  assert.deepEqual(r.state.progress.year, {
    jars: 0,
    pure: 0,
    kinds: [],
    earned: 0,
    hungryWinter: 0,
  });
  assert.equal(r.state.progress.stats.goodWinters, 1);
  // The year page waits to be read.
  assert.deepEqual(C.yearDue(r.state), e.summary);
  for (const year of [2, 0, "1", undefined])
    no(r.state, { type: "seenYear", year }, "nothing-to-see");
  const seen = ok(r.state, { type: "seenYear", year: 1 });
  assert.deepEqual(one(seen.events, "yearSeen"), { type: "yearSeen", year: 1 });
  assert.equal(C.yearDue(seen.state), null);
  no(seen.state, { type: "seenYear", year: 1 }, "nothing-to-see");
  // A colony that goes hungry on the very last night of winter spoils that winter, not the next.
  const hungry = nextMorning(last((s) => (hive(s).stores = {})));
  assert.equal(one(hungry.events, "yearEnded").summary.hungryWinter, 1);
  assert.deepEqual(
    [
      hungry.state.progress.stats.goodWinters,
      hungry.state.progress.stats.hungry,
      hungry.state.progress.year.hungryWinter,
    ],
    [0, 1, 0],
  );
  assert.equal(
    nextMorning(last((s) => (s.progress.year.hungryWinter = 2))).state.progress.stats.goodWinters,
    0,
  );
});

for (const [kind, seed, days] of [
  ["sensible", 11, 45],
  ["lazy", 12, 60],
  ["greedy", 13, 45],
  ["completionist", 14, 45],
])
  test(`counting: after ${days} days of a ${kind} keeper the statistics say what the events said, and every coin, jar and block of wax is accounted for`, () => {
    const { state, events } = playOut(makeBot(kind, seed), seed, days);
    const sum = (type, f = () => 1) => of(events, type).reduce((a, e) => a + f(e), 0);
    const st = state.progress.stats;
    const counted = {
      days: sum("dayStarted"),
      jars: sum("harvested", (e) => e.jars),
      wax: sum("harvested", (e) => e.wax),
      customers: sum("sold"),
      sold: sum("sold", (e) => e.n),
      delighted: sum("sold", (e) => (e.mood === "delighted" ? 1 : 0)),
      fine: sum("sold", (e) => (e.mood === "fine" ? 1 : 0)),
      passed: sum("passed"),
      grocer: sum("soldToGrocer", (e) => e.n),
      planted: sum("planted"),
      picked: sum("picked"),
      hivesBought: sum("hiveBought"),
      upgraded: sum("hiveUpgraded"),
      dusted: sum("dusted"),
      splits: sum("split"),
      caught: sum("swarmCaught"),
      swarms: sum("swarmed"),
      hungry: sum("hungry"),
      crafted: sum("crafted"),
      ribbons: sum("showJudged", (e) => e.entries.length),
    };
    assert.deepEqual(Object.fromEntries(Object.keys(counted).map((k) => [k, st[k]])), counted);
    const earned =
      sum("sold", (e) => e.coins) +
      sum("soldToGrocer", (e) => e.coins) +
      sum("showJudged", (e) => e.coins);
    assert.equal(st.earned, earned);
    const given =
      sum("goalClaimed", (e) => e.reward.coins ?? 0) +
      sum("heart", (e) => e.gift?.reward.coins ?? 0);
    const spent =
      sum("planted", (e) => e.cost) +
      sum("hiveBought", (e) => e.cost) +
      sum("hiveUpgraded", (e) => e.cost) +
      sum("plotBought", (e) => e.price) +
      sum("bought", (e) => e.coins);
    assert.equal(state.purse.coins, T.START_COINS + earned + given - spent, "coins");
    const honey = (e) => (String(e.product).startsWith("honey:") ? e.n : 0);
    const shelf = Object.values(state.stock.honey).reduce((a, b) => a + b, 0);
    assert.equal(
      st.jars,
      shelf +
        sum("sold", honey) +
        sum("soldToGrocer", honey) +
        sum("crafted", (e) => (e.used.honey ? 1 : 0)) +
        counted.ribbons,
      "jars",
    );
    assert.equal(st.wax, state.stock.wax + sum("crafted", (e) => e.used.wax), "wax");
    assert.equal(
      state.hives.list.length,
      1 + counted.hivesBought + counted.splits + counted.caught,
      "hives",
    );
    assert.ok(earned > 0 && counted.jars > 0, "the keeper got somewhere");
  });
