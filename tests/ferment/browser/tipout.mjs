// Phone flow: tipping out a jar before it pops. Taps a fresh jar in the
// morning, asks to tip it out, keeps it, then tips it out from the confirm
// sheet (which names the order counting on it); then, while open, tips out a
// jar the customer at the counter can't have. A popped jar still goes in one
// tap. Depends on window.__ferment and the data-slot / data-act attributes.
import assert from "node:assert/strict";

export const name = "tipout";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const sheet = page.locator("#sheet .tip-sheet");

  // Sam has a portion of slot 0's jar kept.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.orders.list.push({
      id: 950,
      kind: "preorder",
      name: "Sam",
      look: 33,
      recipe: s.shelf.slots[0].recipe,
      lo: 0.2,
      hi: 0.4,
      due: 2,
      arriveAt: 4,
      arrived: false,
      jars: [s.shelf.slots[0].id],
    });
    window.__ferment.state = s;
  });
  let s = await state();
  const coins = s.shop.coins;
  assert.ok(
    s.shelf.slots[0] &&
      !(await page.evaluate(() =>
        window.__ferment.core.isOver(window.__ferment.state.shelf.slots[0]),
      )),
  );

  await page.locator('.slot[data-slot="0"]').tap();
  await snap("0-selected");
  await page.locator('.actions [data-act="tip-ask"]').tap();
  await sheet.waitFor();
  assert.match(await sheet.textContent(), /Sam is counting on this jar/);
  await snap("1-confirm");

  // Keep it: nothing changes.
  await page.locator('#sheet [data-act="cancel"]').tap();
  await sheet.waitFor({ state: "hidden" });
  assert.ok((await state()).shelf.slots[0], "kept");

  // Tip it out: the spot is empty, nothing refunded, Sam's order lets go.
  await page.locator('.actions [data-act="tip-ask"]').tap();
  await page.locator('#sheet [data-act="tip"]').tap();
  s = await state();
  assert.equal(s.shelf.slots[0], null);
  assert.equal(s.shop.coins, coins);
  assert.deepEqual(s.orders.list.find((o) => o.id === 950).jars, []);
  assert.ok(await page.locator("#sheet").isHidden());
  await snap("2-tipped");

  // Open with a customer for another recipe: tip-out takes the middle spot, and the shop pauses on the confirm.
  await page.locator('[data-act="open"]').tap();
  await page.waitForFunction(() => window.__ferment.state.customers.queue.length > 0, null, {
    timeout: 30000,
  });
  s = await state();
  const want = s.customers.queue[0].recipe;
  const other = s.shelf.slots.findIndex((j) => j && j.recipe !== want);
  assert.ok(other >= 0, "a jar of another recipe on the shelf");
  await page.locator(`.slot[data-slot="${other}"]`).tap();
  await snap("3-selected-open");
  await page.locator('.actions [data-act="tip-ask"]').tap();
  await sheet.waitFor();
  const hour = (await state()).clock.hour;
  await page.waitForTimeout(800);
  assert.equal((await state()).clock.hour, hour, "the shop waits while the confirm is up");
  await snap("4-confirm-open");
  await page.locator('#sheet [data-act="tip"]').tap();
  assert.equal((await state()).shelf.slots[other], null);

  // A popped jar goes in one tap, no confirm.
  const popped = (await state()).shelf.slots.findIndex((j) => j);
  await page.evaluate((i) => {
    const s = structuredClone(window.__ferment.state);
    s.shelf.slots[i].age = 9999;
    window.__ferment.state = s;
  }, popped);
  await page.locator(`.slot[data-slot="${popped}"]`).tap();
  await page.locator('.actions [data-act="tip"]').tap();
  assert.equal((await state()).shelf.slots[popped], null);
  assert.ok(await page.locator("#sheet").isHidden());
  return "tip out early with confirm, kept order released, popped jar in one tap";
}
