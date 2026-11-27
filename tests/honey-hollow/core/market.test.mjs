// Rule tests for the market: products and prices, the stall and its
// customers, regulars and their hearts, the grocer, the Honey Show and the
// Winter Fair. Prices are checked for a keeper without the selling talent
// (the bee whisperer) unless a test says otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  C,
  T,
  ok,
  no,
  edit,
  fresh,
  setDay,
  dayOn,
  flyDay,
  nextMorning,
  one,
  of,
  atStall,
} from "./helpers.mjs";

const plain = () => fresh(1, "whisperer");
const on = (doy, state = plain()) =>
  edit(state, (s) => setDay(s, dayOn(doy), doy >= 21 ? "snow" : "sunny"));

test("products: one id space for honeys by stars, the blend and the workshop's goods", () => {
  assert.deepEqual(C.productInfo("honey:clover:2"), {
    id: "honey:clover:2",
    kind: "honey",
    name: "Clover honey",
    price: 8,
    key: "honey:clover",
    stockKey: "clover:2",
    honey: "clover",
    flower: "clover",
    stars: 2,
    pure: true,
    traits: ["light", "mild"],
    good: null,
    family: null,
  });
  const blend = C.productInfo("honey:blend:0");
  assert.deepEqual(
    [blend.stockKey, blend.stars, blend.pure, blend.flower, blend.traits],
    ["blend:0", 0, false, null, []],
  );
  const candle = C.productInfo("good:lavender-candle");
  assert.deepEqual(
    [candle.kind, candle.key, candle.stockKey, candle.family, candle.pure, candle.price],
    ["good", "good:lavender-candle", "lavender-candle", "candle", false, 24],
  );
  for (const junk of [
    "honey:clover:0",
    "honey:clover:4",
    "honey:blend:1",
    "honey:nope:1",
    "good:nope",
    "clover",
    "honey:clover",
    "",
    7,
    null,
    undefined,
  ])
    assert.equal(C.productInfo(junk), null, String(junk));
});

test("prices: base × stars × season × the day's wobble × glut", () => {
  const s = plain();
  const price = (product, state = s) => C.priceOf(state, product);
  assert.deepEqual(
    [
      "honey:clover:1",
      "honey:clover:2",
      "honey:clover:3",
      "honey:heather:3",
      "honey:blend:0",
      "good:candle",
    ].map((p) => price(p)),
    [8, 10, 12, 32, 6, 14],
  );
  assert.equal(price("honey:nope:1"), 0);
  // Season: honey is worth a tenth more in winter; candles and balm when the nights draw in.
  assert.deepEqual(
    [
      price("honey:clover:1", on(21)),
      price("good:candle", on(14)),
      price("good:candle", on(21)),
      price("good:balm", on(21)),
      price("good:wraps", on(21)),
    ],
    [9, 16, 20, 26, 22],
  );
  // The day's wobble.
  assert.equal(
    price(
      "honey:clover:1",
      edit(s, (s) => (s.market.mood["honey:clover"] = 0.9)),
    ),
    7,
  );
  // Glut: three hundredths off for each one sold lately, every star of a honey together, never below six tenths.
  const glut = (n) => edit(s, (s) => (s.market.glut["honey:clover"] = n));
  assert.deepEqual(
    [
      price("honey:clover:1", glut(5)),
      price("honey:clover:3", glut(5)),
      price("honey:clover:1", glut(20)),
      price("honey:lavender:1", glut(20)),
    ],
    [7, 10, 5, 14],
  );
});

test("quote: what a sale brings, each unit knocking the price of the next", () => {
  const s = plain();
  assert.equal(C.quote(s, "honey:clover:1", 2, "delighted"), 20);
  assert.equal(C.quote(s, "honey:lavender:3", 1, "fine"), 17);
  assert.equal(C.quote(s, "honey:clover:1", 1, "grocer"), 5);
  assert.equal(C.quote(s, "honey:clover:1"), 5, "the grocer, one, when nothing else is said");
  assert.equal(C.quote(s, "honey:clover:1", 10, "grocer"), Math.round(8 * (10 - 0.03 * 45) * 0.6));
  assert.equal(C.quote(s, "honey:nope:1", 1, "fine"), 0);
  assert.equal(C.quote(s, "honey:clover:1", 0, "fine"), 0);
  // The gift for selling: every customer pays a tenth more; the grocer does not.
  assert.equal(C.quote(fresh(), "honey:clover:1", 1, "delighted"), 11);
  assert.equal(C.quote(fresh(), "honey:clover:1", 1, "grocer"), 5);
});

test("wishes: what satisfies each kind", () => {
  const yes = (wish, product) =>
    assert.equal(C.satisfies(wish, product), true, `${JSON.stringify(wish)} ${product}`);
  const nope = (wish, product) =>
    assert.equal(C.satisfies(wish, product), false, `${JSON.stringify(wish)} ${product}`);
  yes({ type: "any" }, "honey:blend:0");
  yes({ type: "any" }, "good:wraps");
  yes({ type: "kind", value: "honey:clover" }, "honey:clover:3");
  nope({ type: "kind", value: "honey:clover" }, "honey:borage:1");
  yes({ type: "kind", value: "honey:blend" }, "honey:blend:0");
  yes({ type: "kind", value: "good:balm" }, "good:balm");
  yes({ type: "kind", value: "family:candle" }, "good:lavender-candle");
  yes({ type: "kind", value: "family:soap" }, "good:soap-mint");
  nope({ type: "kind", value: "family:soap" }, "good:candle");
  yes({ type: "trait", value: "dark" }, "honey:buckwheat:1");
  nope({ type: "trait", value: "dark" }, "honey:clover:3");
  nope({ type: "trait", value: "light" }, "honey:blend:0");
  yes({ type: "finest" }, "honey:ivy:2");
  nope({ type: "finest" }, "honey:heather:1");
  nope({ type: "finest" }, "good:basket");
  yes({ type: "gift" }, "good:candle");
  nope({ type: "gift" }, "honey:heather:3");
  nope({ type: "riddle" }, "honey:clover:1");
  nope({ type: "any" }, "honey:nope:1");
});

test("the stall: what was wished for delights, anything else is taken for less, and passing costs nothing", () => {
  const s = atStall(
    plain(),
    [
      { type: "kind", value: "honey:clover", qty: 2 },
      { type: "trait", value: "dark" },
      { type: "any", qty: 3 },
      { type: "finest" },
    ],
    { "clover:1": 4, "lavender:3": 2 },
  );
  const [a, b, c, d] = s.market.queue.map((q) => q.id);
  no(s, { type: "offer", customer: b, product: "honey:clover:1" }, "not-your-turn");
  no(s, { type: "offer", customer: a, product: "honey:nope:1" }, "no-product");
  no(s, { type: "offer", customer: a, product: "honey:heather:1" }, "no-stock");
  let r = ok(s, { type: "offer", customer: a, product: "honey:clover:1" });
  let e = one(r.events, "sold");
  assert.deepEqual(
    [e.customer, e.who, e.product, e.n, e.coins, e.mood, e.renown, e.fair],
    [a, null, "honey:clover:1", 2, 20, "delighted", 1, false],
  );
  assert.equal(r.state.purse.coins, s.purse.coins + 20);
  assert.equal(r.state.stock.honey["clover:1"], 2);
  assert.equal(r.state.market.glut["honey:clover"], 2);
  assert.equal(r.state.progress.renown, 1);
  assert.deepEqual(r.state.market.queue[0].bought, {
    product: "honey:clover:1",
    n: 2,
    coins: 20,
    mood: "delighted",
  });
  r = ok(r.state, { type: "offer", customer: b, product: "honey:lavender:3" });
  e = one(r.events, "sold");
  assert.deepEqual([e.n, e.coins, e.mood, e.renown], [1, 17, "fine", 0]);
  assert.equal(r.state.progress.renown, 1, "a customer who settles spreads no word");
  r = ok(r.state, { type: "pass", customer: c });
  assert.deepEqual(one(r.events, "passed"), { type: "passed", customer: c, who: null });
  assert.deepEqual(r.state.market.queue[2].bought, {
    product: null,
    n: 0,
    coins: 0,
    mood: "passed",
  });
  r = ok(r.state, { type: "offer", customer: d, product: "honey:lavender:3" });
  assert.equal(
    one(r.events, "sold").renown,
    2,
    "three stars to someone who asked for the finest: the word spreads twice as far",
  );
  no(r.state, { type: "offer", product: "honey:clover:1" }, "no-customer");
  no(r.state, { type: "pass" }, "no-customer");
  // When the stall is not open.
  const evening = flyDay(plain()).state;
  no(evening, { type: "offer", product: "honey:clover:1" }, "stall-closed");
  no(evening, { type: "pass" }, "stall-closed");
  no(plain(), { type: "offer", product: "honey:clover:1" }, "not-evening");
  no(plain(), { type: "openStall" }, "not-evening");
  no(ok(evening, { type: "openStall" }).state, { type: "openStall" }, "stall-open");
});

test("offer n: any number from one up to what they want and what there is; left out, as many as they want", () => {
  const s = atStall(plain(), [{ type: "any", qty: 3 }], { "clover:1": 2 });
  const sell = { type: "offer", customer: s.market.queue[0].id, product: "honey:clover:1" };
  for (const n of [0, -1, 1.5, "2", null]) no(s, { ...sell, n }, "bad-args");
  no(s, { ...sell, n: 3 }, "no-stock");
  const more = edit(s, (s) => (s.stock.honey["clover:1"] = 9));
  no(more, { ...sell, n: 4 }, "bad-args");
  const single = one(ok(s, { ...sell, n: 1 }).events, "sold");
  assert.deepEqual([single.n, single.coins], [1, C.quote(s, "honey:clover:1", 1, "delighted")]);
  assert.equal(one(ok(s, sell).events, "sold").n, 2, "as many as there are");
  assert.equal(one(ok(more, sell).events, "sold").n, 3, "as many as they want");
  assert.equal(one(ok(more, { ...sell, n: 2 }).events, "sold").n, 2);
});

test("the grocer: takes anything in the evening for six tenths, and grocerQuote says what a basket fetches", () => {
  const s = edit(flyDay(plain()).state, (s) => {
    s.stock.honey = { "clover:1": 5, "clover:3": 2, "blend:0": 1 };
    s.stock.goods = { candle: 2 };
  });
  const basket = {
    "honey:clover:1": 5,
    "honey:clover:3": 2,
    "good:candle": 1,
    "honey:blend:0": 4,
    "honey:nope:1": 2,
    "good:balm": 1,
    "honey:heather:1": 0,
  };
  let t = s;
  let coins = 0;
  for (const [product, n] of [
    ["honey:clover:1", 5],
    ["honey:clover:3", 2],
    ["good:candle", 1],
    ["honey:blend:0", 1],
  ]) {
    const r = ok(t, { type: "sellToGrocer", product, n });
    assert.deepEqual(one(r.events, "soldToGrocer"), {
      type: "soldToGrocer",
      product,
      n,
      coins: C.quote(t, product, n, "grocer"),
    });
    coins += one(r.events, "soldToGrocer").coins;
    t = r.state;
  }
  assert.equal(C.grocerQuote(s, basket), coins, "the quote is the sale, glut and all");
  assert.equal(t.purse.coins, s.purse.coins + coins);
  assert.deepEqual(
    [t.stock.honey, t.stock.goods, t.market.glut],
    [{}, { candle: 1 }, { "honey:clover": 7, "good:candle": 1, "honey:blend": 1 }],
  );
  assert.equal(C.grocerQuote(s, { "honey:clover:1": 1 }), 5);
  assert.ok(C.grocerQuote(s, { "honey:clover:3": 2, "honey:clover:1": 5 }) !== undefined);
  for (const junk of [
    null,
    5,
    [],
    {},
    { x: 1 },
    { "honey:clover:1": 0 },
    { "honey:clover:1": 1.5 },
    { "honey:clover:1": -2 },
  ])
    assert.equal(C.grocerQuote(s, junk), 0);
  assert.equal(
    one(ok(s, { type: "sellToGrocer", product: "good:candle" }).events, "soldToGrocer").n,
    1,
  );
  no(plain(), { type: "sellToGrocer", product: "honey:clover:1", n: 1 }, "not-evening");
  no(s, { type: "sellToGrocer", product: "nope", n: 1 }, "no-product");
  no(s, { type: "sellToGrocer", product: "honey:clover:1", n: 0 }, "bad-args");
  no(s, { type: "sellToGrocer", product: "honey:clover:1", n: 6 }, "no-stock");
});

test("customers: two an evening and one more with each tier, wishing only for what the keeper has made", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(C.customersFor), [2, 3, 4, 5, 6]);
  assert.deepEqual(C.makeable(plain()), {
    honeys: [],
    traits: [],
    goods: [],
    families: [],
    finest: false,
  });
  for (let seed = 1; seed <= 20; seed++) {
    const r = ok(flyDay(fresh(seed)).state, { type: "openStall" });
    const q = r.state.market.queue;
    assert.deepEqual(one(r.events, "stallOpened").queue, q);
    assert.deepEqual(
      q.map((c) => [c.who, c.wish.type, c.bought]),
      [
        [null, "any", null],
        [null, "any", null],
      ],
      "nothing made yet: nobody asks for anything in particular",
    );
  }
  // With clover honey made, they may ask for clover, or something light or mild, and three regulars have a reason to come.
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const eve = edit(flyDay(fresh(seed)).state, (s) => {
      s.progress.stats.jarsBy.clover = 3;
      s.progress.stats.stars.clover = 1;
      s.progress.renown = 30;
      s.progress.tier = 2;
      s.stock.honey["clover:1"] = 3;
    });
    assert.deepEqual(C.makeable(eve), {
      honeys: ["clover"],
      traits: ["light", "mild"],
      goods: [],
      families: [],
      finest: false,
    });
    const q = ok(eve, { type: "openStall" }).state.market.queue;
    assert.equal(q.length, 4);
    assert.equal(new Set(q.map((c) => c.id)).size, 4);
    const who = q.map((c) => c.who).filter(Boolean);
    assert.equal(new Set(who).size, who.length, "a regular comes once an evening");
    for (const c of q) {
      assert.ok(
        C.satisfies(c.wish, "honey:clover:1"),
        `nobody can wish for ${JSON.stringify(c.wish)} yet`,
      );
      assert.ok(c.wish.qty >= 1 && c.wish.qty <= 3);
      if (c.who) seen.add(c.who);
      if (c.who === "barley") assert.equal(c.wish.qty, 3, "Farmer Barley buys three");
    }
  }
  assert.deepEqual([...seen].sort(), ["barley", "posy", "wren"]);
});

test("regulars: a heart for each delight, and a gift at three, seven and twelve hearts", () => {
  const posy = { who: "posy", type: "trait", value: "mild" };
  const s = atStall(
    edit(plain(), (s) => (s.regulars.hearts.posy = 2)),
    [posy, posy, { who: "wren", type: "trait", value: "light" }],
    { "clover:1": 5, "heather:1": 1 },
  );
  let r = ok(s, { type: "offer", product: "honey:clover:1" });
  assert.deepEqual(one(r.events, "heart"), {
    type: "heart",
    regular: "posy",
    hearts: 3,
    gift: { n: 1, reward: { seeds: { sunflower: 4 } } },
  });
  assert.equal(r.state.stock.seeds.sunflower, 4);
  assert.deepEqual(r.state.regulars, { hearts: { posy: 3 }, gifts: { posy: 1 } });
  r = ok(r.state, { type: "offer", product: "honey:clover:1" });
  assert.deepEqual(one(r.events, "heart"), { type: "heart", regular: "posy", hearts: 4 });
  r = ok(r.state, { type: "offer", product: "honey:heather:1" });
  assert.equal(of(r.events, "heart").length, 0, "a sale that only does wins no heart");
  assert.equal(r.state.progress.today.hearts, 2);
  const sale = (hearts) => {
    const before = atStall(
      edit(plain(), (s) => {
        s.regulars.hearts.posy = hearts;
        s.regulars.gifts.posy = T.HEART_GIFTS.filter((g) => g <= hearts).length;
      }),
      [posy],
      { "clover:1": 1 },
    );
    return { before, ...ok(before, { type: "offer", product: "honey:clover:1" }) };
  };
  const seventh = sale(6);
  assert.deepEqual(one(seventh.events, "heart").gift, {
    n: 2,
    reward: { wardrobe: "flower-crown" },
  });
  assert.ok(C.owns(seventh.state, "hat", "flower-crown"));
  assert.ok(
    seventh.events.some(
      (e) => e.type === "unlocked" && e.what === "wardrobe" && e.id === "flower-crown",
    ),
  );
  const twelfth = sale(11);
  assert.deepEqual(one(twelfth.events, "heart").gift, { n: 3, reward: { coins: 60 } });
  assert.equal(twelfth.state.purse.coins, twelfth.before.purse.coins + 10 + 60);
  assert.equal(one(sale(12).events, "heart").gift, undefined, "after twelve there are only hearts");
});

test("the Honey Show: on autumn's last evening, up to three pure honeys of different flowers win ribbons by their stars", () => {
  assert.equal(C.tomorrow(on(19)).show, true);
  assert.equal(C.daysUntil(on(19), T.SHOW_DOY), 1);
  const eve = edit(
    flyDay(on(20)).state,
    (s) =>
      (s.stock.honey = {
        "clover:1": 1,
        "lavender:2": 1,
        "heather:3": 1,
        "clover:3": 1,
        "blend:0": 1,
      }),
  );
  assert.deepEqual(eve.market.show, { entered: false, entries: [] });
  const enter = (honeys) => ({ type: "enterShow", honeys });
  for (const bad of [
    [],
    ["honey:clover:1", "honey:lavender:2", "honey:heather:3", "honey:clover:3"],
    "honey:clover:1",
    undefined,
  ])
    no(eve, enter(bad), "bad-entry");
  no(eve, enter(["honey:blend:0"]), "not-pure");
  no(eve, enter(["good:candle"]), "not-pure");
  no(eve, enter(["honey:clover:1", "honey:clover:3"]), "same-honey");
  no(eve, enter(["honey:mint:1"]), "no-stock");
  no(eve, enter(["nope"]), "no-product");
  no(ok(eve, { type: "openStall" }).state, enter(["honey:clover:1"]), "stall-open");
  const r = ok(eve, enter(["honey:clover:1", "honey:lavender:2", "honey:heather:3"]));
  const e = one(r.events, "showJudged");
  assert.deepEqual(
    [
      e.year,
      e.coins,
      e.renown,
      e.entries.map((x) => [x.flower, x.stars, x.medal, x.coins, x.renown]),
    ],
    [
      1,
      155,
      14,
      [
        ["clover", 1, "bronze", 20, 2],
        ["lavender", 2, "silver", 45, 4],
        ["heather", 3, "gold", 90, 8],
      ],
    ],
  );
  assert.equal(r.state.purse.coins, eve.purse.coins + 155);
  assert.deepEqual([r.state.progress.renown, r.state.progress.tier], [14, 1]);
  assert.deepEqual(r.state.stock.honey, { "clover:3": 1, "blend:0": 1 });
  assert.deepEqual(r.state.progress.ribbons, [
    { year: 1, honey: "clover", medal: "bronze" },
    { year: 1, honey: "lavender", medal: "silver" },
    { year: 1, honey: "heather", medal: "gold" },
  ]);
  assert.ok(C.owns(r.state, "hat", "rosette"), "the first ribbon brings the rosette");
  assert.equal(r.state.market.show.entered, true);
  no(r.state, enter(["honey:clover:3"]), "show-done");
  ok(r.state, { type: "openStall" });
  no(flyDay(plain()).state, enter(["honey:clover:1"]), "no-show");
  no(plain(), enter(["honey:clover:1"]), "not-evening");
});

test("the Winter Fair: six customers after presents, candles and the best jar, paying half as much again", () => {
  assert.equal(C.tomorrow(on(23)).fair, true);
  const eve = edit(flyDay(on(24)).state, (s) => (s.stock.goods = { candle: 3 }));
  assert.equal(eve.market.fair, true);
  const open = ok(eve, { type: "openStall" });
  assert.equal(one(open.events, "stallOpened").fair, true);
  const q = open.state.market.queue;
  assert.equal(q.length, T.FAIR_CUSTOMERS);
  for (const c of q)
    assert.ok(
      ["gift", "finest"].includes(c.wish.type) ||
        (c.wish.type === "kind" && c.wish.value === "family:candle"),
      JSON.stringify(c.wish),
    );
  assert.equal(C.quote(open.state, "good:candle", 1, "delighted"), 37);
  const r = ok(atStall(eve, [{ type: "gift", qty: 2 }]), { type: "offer", product: "good:candle" });
  const e = one(r.events, "sold");
  assert.deepEqual([e.n, e.fair, e.coins], [2, true, C.quote(eve, "good:candle", 2, "delighted")]);
  assert.equal(r.state.progress.stats.fairSold, 2);
  assert.equal(nextMorning(r.state).state.market.fair, false);
});

test("overnight: a third of every glut heals, and each product's price wobbles afresh within a tenth", () => {
  const eve = edit(
    flyDay(plain()).state,
    (s) => (s.market.glut = { "honey:clover": 6, "good:candle": 0.06 }),
  );
  const next = nextMorning(eve).state;
  assert.deepEqual(next.market.glut, { "honey:clover": 4 });
  const keys = [...C.HONEY_IDS.map((h) => `honey:${h}`), ...C.GOOD_IDS.map((g) => `good:${g}`)];
  assert.deepEqual(Object.keys(next.market.mood), keys);
  for (const m of Object.values(next.market.mood))
    assert.ok(m >= 1 - T.WOBBLE && m <= 1 + T.WOBBLE, `mood ${m}`);
  assert.ok(new Set(Object.values(next.market.mood)).size > 10, "each product has its own day");
  assert.notDeepEqual(nextMorning(next).state.market.mood, next.market.mood);
});

test("the shelf: honey in flower order with the best stars first, then the blend, then goods", () => {
  const s = edit(plain(), (s) => {
    s.stock.honey = { "clover:1": 2, "blend:0": 1, "clover:3": 1, "dandelion:2": 4, "mint:1": 0 };
    s.stock.goods = { wraps: 1, candle: 2 };
  });
  const rows = C.shelf(s);
  assert.deepEqual(
    rows.map((r) => [r.product, r.n, r.price]),
    [
      ["honey:dandelion:2", 4, 11],
      ["honey:clover:3", 1, 12],
      ["honey:clover:1", 2, 8],
      ["honey:blend:0", 1, 6],
      ["good:candle", 2, 14],
      ["good:wraps", 1, 22],
    ],
  );
  for (const r of rows) assert.deepEqual(r.info, C.productInfo(r.product));
  assert.deepEqual(C.shelf(plain()), []);
});
