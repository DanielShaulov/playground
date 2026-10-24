// Phone flow: tipping out a jar before it pops. Taps a fresh jar in the
// morning, asks to tip it out, keeps it, then tips it out from the confirm
// sheet (which names the order counting on it); then, while open, tips out a
// jar the customer at the counter can't have. A popped jar still goes in one
// tap. A tap on the action bar just as a customer steps up is dropped (it was
// meant for the button there before). With the shelf full, the order planner
// tips a jar out from its row of spots and starts the new jar there.
// Depends on window.__ferment and the data-slot / data-act attributes.
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
  await page.waitForTimeout(400); // the action bar settles after someone steps up
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

  // Someone steps up just as the thumb comes down: that tap doesn't send them away.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.customers.queue = [];
    s.shelf.slots[0] = { id: 8000, recipe: "dill", age: 5, servings: 2, size: 2 };
    window.__ferment.state = s;
  });
  await page.waitForTimeout(400);
  const jarAt = (await state()).shelf.slots.findIndex((j) => j);
  await page.locator(`.slot[data-slot="${jarAt}"]`).tap();
  const early = await page.evaluate(
    () =>
      new Promise((done) => {
        const s = structuredClone(window.__ferment.state);
        s.customers.queue = [
          { id: 9001, name: "Ada", look: 5, recipe: "kimchi", lo: 0.3, hi: 0.5, patience: 99 },
        ];
        window.__ferment.state = s;
        const tapWhenUp = () => {
          const b = /** @type {HTMLElement | null} */ (
            document.querySelector('#actions [data-act="away"]')
          );
          if (!b) return requestAnimationFrame(tapWhenUp);
          b.click();
          done(window.__ferment.state.customers.queue.length);
        };
        tapWhenUp();
      }),
  );
  assert.equal(early, 1, "a tap as the customer steps up is dropped");
  await page.waitForTimeout(400);
  await page.locator('#actions [data-act="away"]').tap();
  assert.ok(!(await state()).customers.queue.some((c) => c.id === 9001), "a settled tap works");
  await snap("5-settled");

  // The planner with a full shelf: tap a jar in its spots, confirm, and the new jar goes there.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    const dill = { ...s.shelf.slots.find((j) => j) };
    s.shelf.slots = s.shelf.slots.map((_, i) => ({ ...dill, id: 7000 + i, recipe: "dill" }));
    s.customers.queue = [];
    s.orders.list.push({
      id: 951,
      kind: "preorder",
      name: "Ines",
      look: 77,
      recipe: "kimchi",
      lo: 0.2,
      hi: 0.4,
      due: s.clock.day + 3,
      arriveAt: 4,
      arrived: false,
    });
    window.__ferment.state = s;
  });
  await page.locator('.ticket[data-order="951"]').tap();
  await page.locator(".plan .spots").waitFor();
  assert.match(await page.locator(".plan .btns .main").textContent(), /No room on the shelf/);
  await page.locator('.plan .spot.full[data-slot="4"]').tap();
  await page.locator(".plan .tipask").waitFor();
  await snap("6-planner-confirm");
  await page.locator('.plan [data-act="board-tipno"]').tap();
  await page.locator(".plan .tipask").waitFor({ state: "detached" });
  assert.ok((await state()).shelf.slots[4], "kept");
  await page.locator('.plan .spot.full[data-slot="4"]').tap();
  await page.locator('.plan [data-act="board-tip"]').tap();
  assert.equal((await state()).shelf.slots[4], null);
  await page.locator('.plan .spot.sel[data-slot="4"]').waitFor();
  await page.locator('.plan [data-act="board-start"]').tap();
  s = await state();
  assert.equal(s.shelf.slots[4]?.recipe, "kimchi", "the new jar went in the freed spot");
  assert.deepEqual(s.orders.list.find((o) => o.id === 951).jars, [s.shelf.slots[4].id]);
  return "tip out early with confirm, kept order released, popped jar in one tap, settle guard, planner tip-out";
}
