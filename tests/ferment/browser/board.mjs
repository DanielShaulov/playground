// Phone flow: the order board and morning planning. Seeds a morning with a
// regular's visit, a pre-order and a bulk order on the board plus a bulk offer,
// takes the offer, plans a jar for the pre-order (the planner's marker must sit
// where core planFor says, and salt must move it), starts it, and checks the
// ticket then shows that jar, kept back from walk-ins. An off-menu request
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
  const plain = await planned(902, []);
  assert.ok(Math.abs((await markAt()) - Math.min(1, plain.f)) < 0.002, "marker matches planFor");
  assert.ok(plain.fits, "a kimchi started now suits tomorrow's pickup");
  assert.match(await page.locator(".plan .verdict").innerText(), /Just right/);
  await page.locator('.plan [data-act="board-add"][data-ingredient="salt"]').tap();
  const salted = await planned(902, ["salt"]);
  assert.ok(salted.f < plain.f, "salt slows it");
  assert.ok(Math.abs((await markAt()) - salted.f) < 0.002, "marker follows the salt");
  assert.match(await page.locator(".plan .verdict").innerText(), /Still too/);
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
  await page.locator(`.slot[data-slot="${slot}"].held .held-tag`).waitFor();
  await snap("4-started");

  // Keep a kimchi already on the shelf back for Sam too, then let one go.
  await page.locator('.ticket[data-order="902"]').tap();
  assert.equal(await page.locator(".plan .spot.can").count(), 2, "both kimchi jars last till then");
  await page.locator(".plan .spot.can").first().tap();
  s = await state();
  assert.equal(s.orders.list.find((o) => o.id === 902).jars?.length, 2, "kimchi kept back");
  await page.locator(".plan .spot.mine").first().tap();
  s = await state();
  assert.equal(s.orders.list.find((o) => o.id === 902).jars?.length, 1, "and let go again");
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  // A regular's planner says how often they come.
  await page.locator('.ticket[data-order="901"]').tap();
  assert.match(await page.locator(".plan .regular").innerText(), /every other day for crisp dill/);
  await snap("6-regular");
  await page.locator('.plan .btns [data-act="board-close"]').tap();

  // A walk-in wants kimchi: Sam's jar is not theirs unless you let it go.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.clock.phase = "open";
    s.customers.queue = [
      { id: 950, name: "Wren", look: 9, recipe: "kimchi", lo: 0, hi: 0.2, patience: 2 },
    ];
    window.__ferment.state = s;
  });
  assert.ok(
    !(await page.locator(`.slot[data-slot="${slot}"]`).getAttribute("class")).includes("fits"),
  );
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
