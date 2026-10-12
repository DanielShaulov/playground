// Phone flow: the order board and morning planning. Seeds a morning with a
// regular's visit, a pre-order and a bulk order on the board plus a bulk offer,
// takes the offer, plans a jar for the pre-order (the planner's marker must sit
// where core planFor says, and salt must move it), starts it, and checks the
// ticket then shows that jar, with Sam's portion kept back from walk-ins; then
// lets it go and keeps it again from the planner's list of shelf jars. An off-menu request
// opens the bench. Depends on
// window.__ferment and the data-act / data-order / data-ingredient attributes
// of the board's buttons.
import assert from "node:assert/strict";

export const name = "board";

const ORDERS = [
  {
    id: 901,
    kind: "standing",
    regular: "okafor",
    name: "Mrs. Okafor",
    look: 212,
    recipe: "dill",
    lo: 0.17,
    hi: 0.33,
    due: 3,
    arriveAt: 1.5,
    arrived: false,
  },
  {
    id: 902,
    kind: "preorder",
    name: "Sam",
    look: 33,
    recipe: "kimchi",
    lo: 0.32,
    hi: 0.48,
    due: 2,
    arriveAt: 4,
    arrived: false,
  },
  {
    id: 903,
    kind: "bulk",
    regular: "noodlebar",
    name: "Mei from Lucky Noodle",
    look: 377,
    recipe: "dill",
    lo: 0.12,
    hi: 0.28,
    due: 4,
    arriveAt: 3,
    arrived: false,
    qty: 4,
    got: 0,
  },
];
const OFFER = {
  id: 904,
  kind: "bulk",
  regular: "tacotruck",
  name: "Luis from the taco truck",
  look: 731,
  recipe: "hotsauce",
  lo: 0.44,
  hi: 0.6,
  due: 3,
  arriveAt: 6,
  arrived: false,
  qty: 3,
  got: 0,
};

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const markAt = () =>
    page
      .locator(".plan .pickup .strip .mark:not(.ghost)")
      .evaluate((el) => parseFloat(/** @type {HTMLElement} */ (el).style.left) / 100);
  const planned = (id, adds) =>
    page.evaluate(
      ([id, adds]) => {
        const s = window.__ferment.state;
        return window.__ferment.core.planFor(
          s,
          s.orders.list.find((o) => o.id === id),
          adds,
        );
      },
      [id, adds],
    );

  await page.evaluate(
    ([orders, offer]) => {
      const s = structuredClone(window.__ferment.state);
      s.orders.list.push(...orders);
      s.orders.offers.push(offer);
      s.orders.asked.push({ recipe: "pearkimchi", name: "Ada", look: 5, day: 1 });
      window.__ferment.state = s;
    },
    [ORDERS, OFFER],
  );
  await page.locator(".board .ticket").first().waitFor();
  assert.equal(
    await page.locator(".board .ticket").count(),
    5,
    "three orders, an offer, a request",
  );
  assert.match(await page.locator('.ticket[data-order="901"] .stamp').innerText(), /regular/i);
  assert.equal(await page.locator('.ticket[data-order="903"] .pips i').count(), 4, "a pip per jar");
  await snap("1-board");

  // The offer opens a preview with Take / Pass; taking it puts it on the board.
  await page.locator('.ticket[data-order="904"]').tap();
  await page.locator(".plan .timeline").waitFor();
  await snap("2-offer");
  await page.locator('.plan [data-act="board-take"]').tap();
  let s = await state();
  assert.equal(s.orders.offers.length, 0);
  assert.ok(
    s.orders.list.some((o) => o.id === 904),
    "offer accepted",
  );

  // Plan Sam's kimchi: the marker sits where planFor says; salt pulls it back.
  await page.locator('.plan .btns [data-act="board-close"]').tap();
  await page.locator('.ticket[data-order="902"]').tap();
  // A kimchi already on the shelf is an option too; plan a new one here.
  const newOpt = page.locator('.plan .opt[data-src="new"]');
  if (await newOpt.count()) await newOpt.tap();
  const plain = await planned(902, []);
  assert.ok(Math.abs((await markAt()) - Math.min(1, plain.f)) < 0.002, "marker matches planFor");
  assert.ok(plain.fits, "a kimchi started now suits tomorrow's pickup");
  assert.match(await page.locator(".plan .verdict").innerText(), /Just right/);
  await page.locator('.plan [data-act="board-add"][data-ingredient="salt"]').tap();
  const salted = await planned(902, ["salt"]);
  assert.ok(salted.f < plain.f, "salt slows it");
  assert.ok(Math.abs((await markAt()) - salted.f) < 0.002, "marker follows the salt");
  assert.match(await page.locator(".plan .verdict").innerText(), /Not ready yet/);
  await snap("3-salted");
  await page.locator('.plan [data-act="board-add"][data-ingredient="salt"]').tap();

  // Start it: the jar goes on the shelf, the order remembers it, the ticket shows it.
  s = await state();
  const slot = s.shelf.slots.findIndex((j) => !j);
  await page.locator('.plan [data-act="board-start"]').tap();
  s = await state();
  const jar = s.shelf.slots[slot];
  assert.equal(jar?.recipe, "kimchi");
  assert.deepEqual(s.orders.list.find((o) => o.id === 902).jars, [jar.id]);
  assert.ok(await page.locator(".plan").isHidden(), "planner closes once the order is covered");
  await page.locator('.ticket[data-order="902"] .strip.fits .jarmark').waitFor();
  // One portion is kept for Sam (a chip with Sam's face), the other is free.
  await page.locator(`.slot[data-slot="${slot}"] .portions i.held`).waitFor();
  assert.equal(await page.locator(`.slot[data-slot="${slot}"] .portions i`).count(), jar.servings);
  assert.equal(await page.locator(`.slot[data-slot="${slot}"].held`).count(), 0, "not all kept");
  await snap("4-started");

  // Covered, the planner offers nothing more, only letting the jar go.
  await page.locator('.ticket[data-order="902"]').tap();
  assert.equal(await page.locator(".plan .opt").count(), 0, "no more than Sam needs");
  assert.match(await page.locator(".plan .btns .main").innerText(), /All set/);
  await page.locator(`.plan .kept[data-slot="${slot}"]`).tap();
  s = await state();
  assert.deepEqual(s.orders.list.find((o) => o.id === 902).jars, [], "let go");
  // Then each kimchi on the shelf is an option, with how it'll be at pickup.
  const opts = page.locator(".plan .opt:not([data-src=new])");
  assert.equal(await opts.count(), 3, "every kimchi jar lasts till then");
  for (const t of await opts.locator(".fit").allInnerTexts())
    assert.match(t, /Just right|Not ready|Gone/);
  await page.locator(`.plan .opt[data-src="${slot}"]`).tap();
  assert.match(await page.locator(".plan .btns .main").innerText(), /Keep a portion for Sam/);
  assert.equal(await page.locator(".plan .add").count(), 0, "no add-ins for a jar already going");
  await snap("4b-options");
  await page.locator('.plan .btns [data-act="board-hold"]').tap();
  s = await state();
  assert.deepEqual(s.orders.list.find((o) => o.id === 902).jars, [jar.id], "kept again");
  assert.ok(await page.locator(".plan").isHidden(), "and the planner closes");

  // A regular's planner says how often they come.
  await page.locator('.ticket[data-order="901"]').tap();
  assert.match(await page.locator(".plan .regular").innerText(), /every other day for crisp dill/);
  await snap("6-regular");
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  // Walk-ins want kimchi: the first gets the free portion of Sam's jar; the
  // next finds only Sam's portion left, and has it only if you let it go.
  const walkIn = (id, name) =>
    page.evaluate(
      ([id, name]) => {
        const s = structuredClone(window.__ferment.state);
        s.clock.phase = "open";
        s.customers.queue = [{ id, name, look: 9, recipe: "kimchi", lo: 0, hi: 0.2, patience: 2 }];
        window.__ferment.state = s;
      },
      [id, name],
    );
  await walkIn(950, "Wren");
  await page.locator(`.slot[data-slot="${slot}"].fits`).tap();
  await page.locator('.actions [data-act="serve"]').tap();
  s = await state();
  assert.equal(s.shelf.slots[slot].servings, jar.servings - 1, "a free portion sold");
  assert.deepEqual(s.orders.list.find((o) => o.id === 902).jars, [jar.id], "Sam's still kept");
  await walkIn(951, "Ash");
  await page.locator(`.slot[data-slot="${slot}"].held`).waitFor();
  await page.locator(`.slot[data-slot="${slot}"]`).tap();
  assert.match(await page.locator(".actions .main").innerText(), /For Sam/);
  await snap("5-kept-back");
  const coins = (await state()).shop.coins;
  await page.locator('.actions [data-act="board-release"]').tap();
  s = await state();
  assert.ok(s.shop.coins > coins, "sold anyway");
  assert.deepEqual(s.orders.list.find((o) => o.id === 902).jars, [], "no longer kept for Sam");
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.clock.phase = "morning";
    s.customers.queue = [];
    window.__ferment.state = s;
  });

  // A jar kept that won't suit by pickup: the planner offers to pick another.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    const old = s.shelf.slots
      .filter((j) => j && j.recipe === "kimchi")
      .sort((a, b) => b.age - a.age)[0];
    s.orders.list.find((o) => o.id === 902).jars = [old.id];
    window.__ferment.state = s;
  });
  await page.locator('.ticket[data-order="902"]').tap();
  assert.match(await page.locator(".plan .verdict").innerText(), /Gone|popped/);
  await page.locator('.plan .btns .main:text("Pick another jar")').tap();
  await page.locator(".plan .opt").first().waitFor();
  assert.deepEqual((await state()).orders.list.find((o) => o.id === 902).jars, [], "let go");
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.orders.list.push({
      id: 905,
      kind: "preorder",
      name: "Ama",
      look: 50,
      recipe: "firekraut",
      lo: 0.55,
      hi: 0.75,
      due: 4,
      arriveAt: 6.5,
      arrived: false,
    });
    window.__ferment.state = s;
  });
  // Chili is already in fire kraut, so once it's known chili isn't offered as a
  // timing add-in; until then the order sends you to the bench instead.
  await page.locator('.ticket[data-order="905"]').tap();
  assert.equal(await page.locator(".plan .add").count(), 0, "no jar for an unknown recipe");
  assert.match(await page.locator(".plan .btns .main").innerText(), /bench/);
  await page.locator('.plan .btns [data-act="board-close"]').tap();
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.bench.known.push("firekraut");
    window.__ferment.state = s;
  });
  await page.locator('.ticket[data-order="905"]').tap();
  await page.locator('.plan .add[data-ingredient="salt"]').waitFor();
  assert.equal(await page.locator('.plan .add[data-ingredient="chili"]').count(), 0);
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  // The bulk order with a jar started too soon says when to start instead.
  await page.locator('.ticket[data-order="903"]').tap();
  const v = await page.locator(".plan .verdict").innerText();
  assert.match(v, /popped|Gone/);
  assert.match(v, /salt|Start it/);
  await snap("7-too-soon");
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  // An off-menu request opens the bench on the recipe it grows from.
  await page.locator('.ticket.hint[data-recipe="pearkimchi"]').tap();
  await page.locator('.bench .base.on[data-recipe="kimchi"]').waitFor();
  await page.locator('.bench .actions [data-act="bench-close"]').tap();

  return `marker ${plain.f.toFixed(2)} → ${salted.f.toFixed(2)} with salt; bulk tip: ${v.split("\n").pop()}`;
}
