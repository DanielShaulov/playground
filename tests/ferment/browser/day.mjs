// Phone flow: plays most of a first day and sleeps into day two, through real
// taps. Depends on the game's test hook (window.__ferment: state, dispatch) and on
// the data-slot / data-act / data-recipe attributes of its buttons.
import assert from "node:assert/strict";

export const name = "day";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));

  await snap("1-morning");

  // Brew into an empty slot through the sheet.
  let s = await state();
  const empty = s.shelf.slots.findIndex((j) => !j);
  await page.locator(`.slot[data-slot="${empty}"]`).tap();
  await page.locator(".sheet .recipe").first().waitFor();
  await snap("2-brew-sheet");
  await page.locator('.recipe[data-recipe="hotsauce"]').tap();
  s = await state();
  assert.equal(s.shelf.slots[empty].recipe, "hotsauce");
  assert.equal(s.shop.coins, 40 - 9);

  // Open, wait for a customer, serve the best matching jar (or pre-order).
  await page.locator('[data-act="open"]').tap();
  let served = 0,
    preorders = 0;
  for (let round = 0; round < 4; round++) {
    await page.waitForFunction(() => window.__ferment.state.customers.queue.length > 0, null, {
      timeout: 30000,
    });
    await page.waitForTimeout(1700); // let any departing customer clear the counter
    s = await state();
    const c = s.customers.queue[0];
    const R = { hours: { dill: 48, hotsauce: 36, kimchi: 72, kraut: 120 } };
    let best = -1,
      bestD = 9;
    s.shelf.slots.forEach((j, i) => {
      if (!j || j.recipe !== c.recipe) return;
      const f = j.age / R.hours[j.recipe];
      if (f >= 1) return;
      const d = f < c.lo ? c.lo - f : f > c.hi ? f - c.hi : 0;
      if (d < bestD) ((bestD = d), (best = i));
    });
    if (best >= 0) {
      await page.locator(`.slot[data-slot="${best}"]`).tap();
      if (round === 0) await snap("3-customer-selected");
      const coins = s.shop.coins;
      await page.locator('[data-act="serve"]').tap();
      assert.ok((await state()).shop.coins > coins, "serving must pay");
      served++;
      if (round === 0) await snap("4-served");
    } else {
      await page.locator('[data-act="preorder"]').tap();
      assert.ok((await state()).orders.list.length > 0);
      preorders++;
    }
  }

  // Close early, see the summary, sleep into day 2. Jars must have aged a full day.
  const before = await state();
  await page
    .locator('[data-act="close"]')
    .tap()
    .catch(async () => {
      await page.evaluate(() => window.__ferment.dispatch({ type: "close" }));
    });
  await page.locator('[data-act="sleep"]').waitFor();
  await snap("5-evening");
  await page.locator('[data-act="sleep"]').tap();
  const after = await state();
  assert.equal(after.clock.day, 2);
  assert.equal(after.clock.phase, "morning");
  const j = before.shelf.slots.findIndex(
    (x, i) => x && after.shelf.slots[i] && x.id === after.shelf.slots[i].id,
  );
  assert.ok(after.shelf.slots[j].age > before.shelf.slots[j].age + 11, "overnight ageing");

  // Save survives a reload.
  await page.waitForTimeout(100);
  await page.reload();
  assert.equal((await state()).clock.day, 2);
  await snap("6-day2");

  return `served ${served}, pre-orders ${preorders}`;
}
