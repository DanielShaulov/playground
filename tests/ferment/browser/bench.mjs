// Phone flow: the brewing bench. Evening: open it from the takings sheet, see
// the sweet spot move when chili goes in, buy pear, try a mix that discovers
// pear kimchi. Next morning: brew a salted jar into a shelf spot from the bench.
// Depends on window.__ferment and the data-act / data-recipe / data-ingredient
// attributes of the bench's buttons.
import assert from "node:assert/strict";

export const name = "bench";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const bandLeft = () =>
    page.locator(".bench .curve").evaluate((el) => parseFloat(el.dataset.peak));

  // Into the evening, then onto the bench.
  await page.evaluate(() => {
    window.__ferment.dispatch({ type: "open" });
    window.__ferment.dispatch({ type: "close" });
  });
  await page.locator('.sheet [data-act="bench"]').tap();
  await page.locator(".bench").waitFor();
  await snap("1-evening");

  // Kimchi with chili: the best stretch comes sooner, and the screen says so.
  await page.locator('.bench [data-act="bench-base"][data-recipe="kimchi"]').tap();
  const plain = await bandLeft();
  await page.locator('.bench [data-act="bench-add"][data-ingredient="chili"]').tap();
  const hot = await bandLeft();
  assert.ok(hot < plain, `chili moves the most wanted moment earlier (${plain}% → ${hot}%)`);
  await page.locator(".bench .lapse .soon").waitFor();
  assert.equal(await page.locator(".bench .curve .ghost").count(), 1, "plain demand ghost drawn");
  await snap("2-chili");

  // Buy a pear and mix it in: the bench hints something new may come of it.
  let s = await state();
  await page.locator('.bench [data-act="bench-buy"][data-ingredient="pear"]').tap();
  const bought = await state();
  assert.equal(bought.pantry.stock.pear, 1);
  assert.equal(bought.shop.coins, s.shop.coins - 3);
  await page.locator('.bench [data-act="bench-add"][data-ingredient="pear"]').tap();
  assert.match(await page.locator(".bench .mix h3").innerText(), /✨\?/);

  // Try it: pear kimchi is discovered, the card fills in, stock is used.
  await page.locator('.bench [data-act="bench-try"]').tap();
  s = await state();
  assert.ok(s.bench.known.includes("pearkimchi"), "pear kimchi discovered");
  assert.deepEqual([...s.bench.tried.kimchi].sort(), ["chili", "pear"]);
  assert.equal(s.pantry.stock.pear, 0);
  await page.locator(".bench .note.big").waitFor();
  const card = await page.locator(".bench .rcard").innerText();
  assert.match(card, /Chili: most wanted \d+h sooner · pops 18h sooner/);
  assert.match(card, /Pear kimchi =/);
  assert.match(card, /Pear: goes into ✨ Pear kimchi/);
  assert.doesNotMatch(card, /timing/);
  await snap("3-discovered");

  // Back to the evening sheet, sleep, and brew a salted dill jar from the bench.
  await page.locator('.bench .actions [data-act="bench-close"]').tap();
  assert.ok(await page.locator(".bench").isHidden());
  await page.locator('[data-act="sleep"]').tap();
  s = await state();
  const empty = s.shelf.slots.findIndex((j) => !j);
  await page.locator(`.slot[data-slot="${empty}"]`).tap();
  await page.locator('.sheet [data-act="bench"]').tap();
  await page.locator('.bench [data-act="bench-base"][data-recipe="dill"]').tap();
  await page.locator('.bench [data-act="bench-add"][data-ingredient="salt"]').tap();
  await page.locator(".bench .lapse .late").waitFor();
  await snap("4-morning-brew");
  await page.locator('.bench [data-act="bench-brew"]').tap();
  s = await state();
  assert.equal(s.shelf.slots[empty].recipe, "dill");
  assert.deepEqual(s.shelf.slots[empty].adds, ["salt"]);
  assert.ok(await page.locator(".bench").isHidden(), "bench closes after brewing");
  await snap("5-brewed");
  return `most wanted ${plain.toFixed(0)}% → ${hot.toFixed(0)}% along with chili; pear kimchi found`;
}
