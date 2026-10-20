// Phone flow: orders. Taking a walk-in's pre-order goes straight to the
// planner for it. In the evening the Orders tab lists every order still to
// collect, split into "Needs handling" (no jar yet, or a kept jar that won't
// suit) and "Reserved" (kept, and it will suit); a card opens the planner over
// the evening, and closing it leaves you on the list. Depends on
// window.__ferment and the data-act / data-order / data-tab attributes.
import assert from "node:assert/strict";

export const name = "orders";

const base = { kind: "preorder", look: 33, due: 2, arriveAt: 3, arrived: false };

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));

  // Morning: Okafor's dill gets a fresh jar timed for her, Ben has a portion of
  // that same jar kept though he wants it far sourer, Mei wants two jars and
  // has none, Sam's kimchi has nothing yet.
  await page.evaluate((base) => {
    const F = window.__ferment;
    const s = structuredClone(F.state);
    const okafor = {
      ...base,
      id: 911,
      kind: "standing",
      regular: "okafor",
      name: "Mrs. Okafor",
      look: 212,
      recipe: "dill",
      lo: 0,
      hi: 1,
    };
    const at = F.core.planFor(s, okafor, []).f;
    okafor.lo = Math.max(0, at - 0.08);
    okafor.hi = at + 0.08;
    s.orders.list.push(
      okafor,
      { ...base, id: 912, name: "Ben", look: 91, recipe: "dill", lo: 0.85, hi: 0.97 },
      {
        ...base,
        id: 913,
        kind: "bulk",
        regular: "noodlebar",
        name: "Mei from Lucky Noodle",
        look: 377,
        recipe: "dill",
        lo: 0.12,
        hi: 0.28,
        due: 3,
        qty: 2,
        got: 0,
      },
      { ...base, id: 914, name: "Sam", recipe: "kimchi", lo: 0.32, hi: 0.48, arriveAt: 5 },
    );
    s.shop.coins = 200;
    F.state = s;
    const slot = F.state.shelf.slots.findIndex((j) => !j);
    F.dispatch({ type: "startForOrder", orderId: 911, slot, adds: [] });
    F.dispatch({ type: "hold", orderId: 912, slot });
  }, base);
  let s = await state();
  assert.equal(s.orders.list.find((o) => o.id === 911).jars.length, 1, "Okafor's jar started");
  assert.equal(s.orders.list.find((o) => o.id === 912).jars.length, 1, "Ben's portion kept");

  // Pre-order a walk-in: the planner opens on their order at once.
  await page.locator('[data-act="open"]').tap();
  await page.waitForFunction(
    () => window.__ferment.state.customers.queue.some((c) => !c.orderId),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1700); // let the counter settle
  const before = (await state()).orders.list.length;
  await page.locator('.actions [data-act="preorder"]').tap();
  s = await state();
  assert.equal(s.orders.list.length, before + 1, "the pre-order is booked");
  const booked = s.orders.list.at(-1);
  await page.locator(".sheet.plan .panel").waitFor();
  assert.equal(await page.locator(".plan .phead h2").innerText(), booked.name);
  await snap("1-preorder-planner");
  await page.locator('.plan .btns [data-act="board-close"]').tap();
  assert.ok(await page.locator(".sheet.plan").isHidden());

  // Evening: the Orders tab, with a dot because something needs handling.
  await page.evaluate(() => window.__ferment.dispatch({ type: "close" }));
  await page.locator(".evening .receipt").waitFor();
  assert.match(await page.locator(".evening .tonight").innerText(), /still need/);
  assert.equal(await page.locator('.evening .tab[data-tab="orders"] .dot').count(), 1);
  await page.locator('.evening .tab[data-tab="orders"]').tap();
  await page.locator(".evening .olist").first().waitFor();
  const card = (id) => page.locator(`.evening .ocard[data-order="${id}"]`);
  assert.equal(
    await page.locator('.olist.set .ocard[data-order="911"]').count(),
    1,
    "Okafor reserved",
  );
  assert.match(await card(911).innerText(), /Reserved/);
  for (const id of [912, 913, 914, booked.id])
    assert.equal(
      await page.locator(`.olist.todo .ocard[data-order="${id}"]`).count(),
      1,
      `order ${id} needs handling`,
    );
  assert.match(await card(912).innerText(), /won't suit/);
  assert.match(await card(913).innerText(), /Needs 2 jars/);
  assert.match(await card(914).innerText(), /Needs a jar/);
  await snap("2-orders");

  // A card opens the planner over the evening; Not now goes back to the list.
  await card(914).tap();
  await page.locator(".sheet.plan .panel").waitFor();
  const onTop = await page.evaluate(() => {
    const el = document.querySelector(".sheet.plan .panel h2");
    const r = el.getBoundingClientRect();
    return !!document.elementFromPoint(r.x + 4, r.y + r.height / 2)?.closest(".sheet.plan");
  });
  assert.ok(onTop, "the planner shows above the evening");
  assert.equal(await page.locator(".plan .phead h2").innerText(), "Sam");
  await snap("3-orders-planner");
  await page.locator('.plan .btns [data-act="board-close"]').tap();
  assert.ok(await page.locator(".sheet.plan").isHidden());
  await page.locator(".evening .olist").first().waitFor();

  // Ben's kept jar won't suit: picking another lets it go, and the card says he needs a jar.
  await card(912).tap();
  await page.locator('.plan [data-act="board-unhold"]').first().tap();
  await page.locator('.plan .btns [data-act="board-close"]').tap();
  assert.match(await card(912).innerText(), /Needs a jar/);
  return `${(await state()).orders.list.length} orders, Okafor reserved`;
}
