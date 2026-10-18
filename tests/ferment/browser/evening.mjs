// Phone flow: the evening. Close the shop and land on the till; visit the
// market (buy one, see a rare crate stand out), the workshop (fit a crock to
// a chosen spot, build shelf space and see the shelf grow, get bigger jars),
// and the goals ladder (claim a met goal). The bench's pantry links to the
// market. Sleep ends the evening. Jars are never started in the evening.
// Depends on window.__ferment and the data-act / data-tab / data-id /
// data-slot / data-ingredient attributes of the evening's buttons.
import assert from "node:assert/strict";

export const name = "evening";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const tab = (id) => page.locator(`.evening .tab[data-tab="${id}"]`).tap();

  // Close up: the evening opens on the till, with the receipt.
  await page.evaluate(() => {
    window.__ferment.dispatch({ type: "open" });
    window.__ferment.dispatch({ type: "close" });
  });
  await page.locator(".evening .receipt").waitFor();
  assert.match(await page.locator(".evening .receipt").innerText(), /Day 1/);
  await snap("1-till");

  // Back to the shop (its order board), and back again.
  await page.locator('.evening .actions [data-act="eve-close"]').tap();
  assert.ok(await page.locator(".evening").isHidden());
  await page.locator('.actions [data-act="evening"]').tap();
  await page.locator(".evening .receipt").waitFor();

  // A rich shop with a rare stall out tonight, a goal met, and tier 2 reached.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.shop.coins = 5000;
    s.progress.stats.earned = 2400;
    s.progress.tier = 2;
    s.progress.stats.served = 12;
    s.market.items.whey = { price: 7, left: 2 };
    delete s.market.items.honey;
    window.__ferment.state = s;
  });
  await page.locator(".evening .tonight").waitFor();
  assert.match(await page.locator(".evening .tonight").innerText(), /Whey.*market/);
  assert.equal(await page.locator('.evening .tab[data-tab="goals"] .dot').count(), 1);

  // The market: a rare crate stands out, a missing one says so, buying fills the pantry.
  await tab("market");
  await page.locator('.crate.rare[data-ingredient="whey"] .ribbon').waitFor();
  assert.match(await page.locator('.crate[data-ingredient="honey"]').innerText(), /Not out today/);
  let s = await state();
  await page.locator('.crate[data-ingredient="whey"] [data-act="mk-buy"]').tap();
  let after = await state();
  assert.equal(after.pantry.stock.whey, 1);
  assert.equal(after.shop.coins, s.shop.coins - 7);
  assert.equal(await page.locator('.crate[data-ingredient="whey"] .pips i').count(), 1);
  await snap("2-market");

  // The workshop: a crock goes into the spot picked on the mini shelf.
  await tab("workshop");
  await page.locator('.up[data-id="cool"] [data-act="up-spot"][data-slot="5"]').tap();
  await page.locator('.up[data-id="cool"] [data-act="up-buy"][data-slot="5"]').tap();
  after = await state();
  assert.equal(after.progress.crocks[5], "cool");
  await page.locator('.up[data-id="cool"] .spot.c-cool').first().waitFor();
  await snap("3-workshop");

  // Shelf space: three new spots, and the shop's shelf grows to match.
  const spots = after.shelf.slots.length;
  await page.locator('.up[data-id="shelf"] [data-act="up-buy"]').tap();
  after = await state();
  assert.equal(after.shelf.slots.length, spots + 3);
  // Bigger jars: the card draws the bigger jar larger.
  const jar = page.locator('.up[data-id="bigjars"] .bigger svg');
  const small = await page.locator('.up[data-id="bigjars"] figure:first-child svg').boundingBox();
  const big = await jar.boundingBox();
  assert.ok(big && small && big.height > small.height, "the bigger jar is drawn bigger");
  await page.locator('.up[data-id="bigjars"] [data-act="up-buy"]').tap();
  after = await state();
  assert.equal(after.progress.upgrades.bigjars, 1);
  await snap("4-built");

  // Goals: the met goal is claimed for its coins and the next rung opens.
  await tab("goals");
  await page.locator(".evening .tiers .heart").waitFor();
  s = await state();
  await page.locator('.evening [data-act="eve-claim"]').tap();
  after = await state();
  assert.equal(after.progress.goal, s.progress.goal + 1);
  assert.ok(after.shop.coins > s.shop.coins, "the reward is paid");
  await snap("5-goals");

  // The bench's pantry has a way to the market; the shelf in the shop shows the new spots.
  await page.locator('.evening .actions [data-act="bench"]').tap();
  await page.locator('.bench [data-act="evening"][data-tab="market"]').tap();
  assert.ok(await page.locator(".bench").isHidden());
  await page.locator(".evening .crates").waitFor();
  await page.locator('.evening .actions [data-act="eve-close"]').tap();
  assert.equal(await page.locator(".shelf .slot").count(), after.shelf.slots.length);
  await page.locator(".slot.crock-cool").waitFor();
  await snap("6-shelf");

  // Sleep: morning, no evening screen; a new jar in the crock spot takes its pace.
  await page.locator('.actions [data-act="evening"]').tap();
  await page.locator('.evening [data-act="sleep"]').tap();
  assert.ok(await page.locator(".evening").isHidden());
  s = await state();
  assert.equal(s.clock.phase, "morning");
  if (s.shelf.slots[5])
    await page.evaluate(() => window.__ferment.dispatch({ type: "tipOut", slot: 5 }));
  await page.locator('.slot[data-slot="5"]').tap();
  await page.locator(".sheet .recipe").first().tap();
  s = await state();
  assert.equal(s.shelf.slots[5].pace, 0.75);
  assert.equal(s.shelf.slots[5].size, 3);
  return `crock in spot 6, shelf ${spots} → ${spots + 3}, goal ${after.progress.goal} open`;
}
