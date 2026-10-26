// Shop decor (buyDecor, useDecor) and the Shop pride goals that win decor (claimPride).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../../games/ferment/core/index.js";
import { DECOR, DECOR_IDS, SPOTS } from "../../../games/ferment/content/decor.js";
import { PRIDE, TIERS } from "../../../games/ferment/content/goals.js";
import { VARIANT_IDS } from "../../../games/ferment/content/recipes.js";
import { REGULAR_IDS } from "../../../games/ferment/content/regulars.js";

/** A game at the evening of day 1, with coins and a tier set. */
function evening({ coins = 5000, tier = 5 } = {}) {
  let s = C.newGame(3);
  s = C.step(s, { type: "open" }).state;
  s = C.step(s, { type: "close" }).state;
  assert.equal(s.clock.phase, "evening");
  s = structuredClone(s);
  s.shop.coins = coins;
  s.progress.tier = tier;
  s.progress.stats.earned = TIERS[tier].earned;
  return s;
}

const why = (r) => (r.events[0].type === "rejected" ? r.events[0].why : null);

test("decor content is well formed: each spot has one starting piece, prices climb with tiers", () => {
  const spots = SPOTS.map((x) => x.id);
  const prides = PRIDE.map((p) => p.id);
  for (const { id: spot } of SPOTS) {
    const pieces = DECOR_IDS.filter((id) => DECOR[id].spot === spot);
    const start = pieces.filter((id) => !DECOR[id].cost && !DECOR[id].pride);
    assert.equal(start.length, 1, `${spot}: one starting piece`);
    assert.equal(pieces[0], start[0], `${spot}: the starting piece comes first`);
    assert.ok(pieces.filter((id) => DECOR[id].cost > 0).length >= 3, `${spot}: things to buy`);
  }
  for (const id of DECOR_IDS) {
    const d = DECOR[id];
    assert.ok(spots.includes(d.spot), id);
    assert.ok(Number.isInteger(d.tier) && d.tier >= 0 && d.tier < TIERS.length, id);
    if (d.pride) {
      assert.ok(prides.includes(d.pride), `${id}: names a real pride goal`);
      assert.equal(d.cost, 0, `${id}: won, not sold`);
    }
  }
  // Every pride goal wins exactly one piece.
  for (const p of PRIDE)
    assert.equal(DECOR_IDS.filter((id) => DECOR[id].pride === p.id).length, 1, p.id);
});

test("pride goals are reachable and line up with the content they read", () => {
  const ids = new Set();
  for (const p of PRIDE) {
    assert.ok(!ids.has(p.id), `${p.id} once`);
    ids.add(p.id);
    assert.ok(p.n > 0 && p.text, p.id);
  }
  const by = Object.fromEntries(PRIDE.map((p) => [p.id, p]));
  assert.equal(by.secrets.n, VARIANT_IDS.length, "all the hidden recipes");
  assert.equal(by.everyone.n, REGULAR_IDS.length, "all the regulars");
  for (const p of PRIDE.filter((p) => p.kind === "tier")) assert.ok(p.n < TIERS.length, p.id);
});

test("a new shop shows its starting pieces and owns nothing more", () => {
  const s = C.newGame(1);
  assert.deepEqual(s.decor, { owned: [], on: {} });
  assert.deepEqual(s.progress.pride, []);
  const look = C.decorLook(s);
  for (const { id: spot } of SPOTS) {
    const id = look[spot];
    assert.equal(DECOR[id].spot, spot);
    assert.equal(DECOR[id].cost, 0);
    assert.ok(!DECOR[id].pride);
  }
  assert.equal(C.decorCount(s), 0);
});

test("buying decor: evening only, costs coins, needs its tier, goes up straight away", () => {
  const s = evening({ coins: 1000, tier: 1 });
  assert.equal(why(C.step(s, { type: "buyDecor", id: "nope" })), "no such decor");
  assert.equal(why(C.step(s, { type: "buyDecor", id: "toString" })), "no such decor");
  assert.equal(why(C.step(s, { type: "buyDecor", id: "boards" })), "already yours");
  assert.equal(why(C.step(s, { type: "buyDecor", id: "cat" })), "won, not sold");
  assert.equal(why(C.step(s, { type: "buyDecor", id: "tiles" })), "needs a higher tier");
  const r = C.step(s, { type: "buyDecor", id: "stripes" });
  assert.equal(why(r), null);
  assert.equal(r.state.shop.coins, 1000 - DECOR.stripes.cost);
  assert.equal(C.decorOn(r.state, "wall"), "stripes");
  assert.deepEqual(r.events[0], { type: "boughtDecor", id: "stripes", cost: DECOR.stripes.cost });
  assert.equal(why(C.step(r.state, { type: "buyDecor", id: "stripes" })), "already yours");

  const poor = evening({ coins: 10, tier: 5 });
  assert.equal(why(C.step(poor, { type: "buyDecor", id: "stripes" })), "not enough coins");

  const morning = C.step(r.state, { type: "sleep" }).state;
  assert.equal(why(C.step(morning, { type: "buyDecor", id: "gingham" })), "only in the evening");
});

test("using decor swaps between pieces the shop owns, the starting one included", () => {
  let s = evening();
  assert.equal(why(C.step(s, { type: "useDecor", id: "bow" })), "not yours yet");
  assert.equal(why(C.step(s, { type: "useDecor", id: "plain" })), "already up");
  s = C.step(s, { type: "buyDecor", id: "bow" }).state;
  s = C.step(s, { type: "buyDecor", id: "twine" }).state;
  assert.equal(C.decorOn(s, "jars"), "twine");
  const r = C.step(s, { type: "useDecor", id: "bow" });
  assert.deepEqual(r.events[0], { type: "usedDecor", id: "bow" });
  assert.equal(C.decorOn(r.state, "jars"), "bow");
  s = C.step(r.state, { type: "useDecor", id: "plain" }).state;
  assert.equal(C.decorOn(s, "jars"), "plain");
  const offers = C.decorOffers(s).filter((o) => o.spot === "jars");
  assert.deepEqual(
    offers.filter((o) => o.owned).map((o) => o.id),
    ["plain", "twine", "bow"],
  );
  assert.equal(offers.find((o) => o.on).id, "plain");
  assert.equal(offers.find((o) => o.id === "gold").pride, "pride");
});

test("decorOffers marks pieces a tier away as locked, and pride pieces as never locked by tier", () => {
  const s = evening({ tier: 0 });
  const o = Object.fromEntries(C.decorOffers(s).map((x) => [x.id, x]));
  assert.equal(o.stripes.locked, false);
  assert.equal(o.damask.locked, true);
  assert.equal(o.cat.locked, false);
  assert.equal(o.cat.owned, false);
});

test("a junk piece in the save shows the starting piece instead", () => {
  const s = C.newGame(1);
  s.decor.on.wall = "tiles"; // not owned
  s.decor.on.wood = "stripes"; // owned, but not wood
  s.decor.owned.push("stripes");
  assert.equal(C.decorOn(s, "wall"), "boards");
  assert.equal(C.decorOn(s, "wood"), "oak");
});

test("Shop pride: met goals say so once, claim once, and put their prize up", () => {
  let s = evening({ tier: 3 });
  s.progress.stats.earned = TIERS[3].earned;
  let now = Object.fromEntries(C.prideNow(s).map((p) => [p.pride.id, p]));
  assert.equal(now.famous.ready, false);
  assert.equal(why(C.step(s, { type: "claimPride", id: "famous" })), "not done yet");
  assert.equal(why(C.step(s, { type: "claimPride", id: "nope" })), "no such goal");

  // Taking enough coins climbs to tier 4 on the next action, which meets "famous".
  s.progress.stats.earned = TIERS[4].earned;
  const r = C.step(s, { type: "useDecor", id: "linen" }); // rejected: nothing changes
  assert.equal(why(r), "already up");
  const t = C.step(s, { type: "buyDecor", id: "gingham" });
  const types = t.events.map((e) => e.type);
  assert.ok(types.includes("tierUp"));
  assert.ok(t.events.some((e) => e.type === "prideReady" && e.id === "famous"));
  s = t.state;
  now = Object.fromEntries(C.prideNow(s).map((p) => [p.pride.id, p]));
  assert.equal(now.famous.ready, true);
  assert.equal(now.famous.reward, "lanterns");

  const c = C.step(s, { type: "claimPride", id: "famous" });
  assert.deepEqual(
    c.events.find((e) => e.type === "claimedPride"),
    {
      type: "claimedPride",
      id: "famous",
      decor: "lanterns",
    },
  );
  s = c.state;
  assert.equal(C.decorOn(s, "garland"), "lanterns");
  assert.ok(C.owns(s, "lanterns"));
  assert.equal(why(C.step(s, { type: "claimPride", id: "famous" })), "already claimed");
  // No more prideReady for it once claimed.
  const after = C.step(s, { type: "buyDecor", id: "lace" });
  assert.ok(!after.events.some((e) => e.type === "prideReady"));
  // The prize can be taken down and put back.
  s = C.step(after.state, { type: "useDecor", id: "bare" }).state;
  assert.equal(C.decorOn(s, "garland"), "bare");
  s = C.step(s, { type: "useDecor", id: "lanterns" }).state;
  assert.equal(C.decorOn(s, "garland"), "lanterns");
});

test("pride goals read the shop: hidden recipes found, regulars won, lifetime stats", () => {
  const s = C.newGame(1);
  s.bench.known = VARIANT_IDS.slice();
  for (const id of REGULAR_IDS) s.regulars.met[id] = { since: 1, visits: 1, happy: 0, missed: 0 };
  Object.assign(s.progress.stats, { bestDay: 500, delight: 300, served: 400 });
  s.progress.tier = 5;
  for (const p of C.prideNow(s)) assert.equal(p.ready, true, p.pride.id);
  // A regular still dropping in as a walk-in doesn't count yet.
  s.regulars.met[REGULAR_IDS[0]].pending = true;
  assert.equal(C.prideNow(s).find((p) => p.pride.id === "everyone").ready, false);
});

test("the late-game save from the release gets its pride goals and keeps playing with decor", () => {
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/high-tier.json", import.meta.url), "utf8"),
  );
  let s = C.loadSave(raw);
  assert.ok(s);
  assert.deepEqual(s.decor, { owned: [], on: {} });
  assert.deepEqual(s.progress.pride, []);
  const ready = C.prideNow(s)
    .filter((p) => p.ready)
    .map((p) => p.pride.id);
  assert.ok(ready.includes("famous") && ready.includes("pride"), ready.join());
  s = C.step(s, { type: "claimPride", id: "pride" }).state;
  assert.equal(C.decorOn(s, "jars"), "gold");
  const back = C.loadSave(JSON.parse(JSON.stringify(s)));
  assert.equal(C.decorOn(back, "jars"), "gold");
  assert.deepEqual(back.progress.pride, ["pride"]);
});

test("a save with a broken decor slice starts fresh rather than crash", () => {
  const s = JSON.parse(JSON.stringify(C.newGame(1)));
  s.decor = { owned: "nope", on: {} };
  assert.equal(C.loadSave(s), null);
});
