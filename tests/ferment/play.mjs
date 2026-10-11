// Browser smoke test for The Brine Nook: plays part of a day on a phone viewport.
// Needs `npm start` running. Run: npm run test:ferment:play [-- --shots dir]
import assert from "node:assert/strict";
import { chromium, devices } from "playwright-core";

const URL = process.env.URL ?? "http://localhost:8000/games/ferment/";
const shots = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1]
  : null;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
const snap = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));

await snap("1-morning");

// Brew into an empty slot through the sheet.
let s = await state();
const empty = s.shelf.findIndex((j) => !j);
await page.locator(`.slot[data-slot="${empty}"]`).tap();
await page.locator(".sheet .recipe").first().waitFor();
await snap("2-brew-sheet");
await page.locator('.recipe[data-recipe="hotsauce"]').tap();
s = await state();
assert.equal(s.shelf[empty].recipe, "hotsauce");
assert.equal(s.coins, 40 - 9);

// Open, wait for a customer, serve the best matching jar (or pre-order).
await page.locator('[data-act="open"]').tap();
let served = 0,
  preorders = 0;
for (let round = 0; round < 4; round++) {
  await page.waitForFunction(() => window.__ferment.state.queue.length > 0, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1700); // let any departing customer clear the counter
  s = await state();
  const c = s.queue[0];
  const R = { hours: { dill: 48, hotsauce: 36, kimchi: 72, kraut: 120 } };
  let best = -1,
    bestD = 9;
  s.shelf.forEach((j, i) => {
    if (!j || j.recipe !== c.recipe) return;
    const f = j.age / R.hours[j.recipe];
    if (f >= 1) return;
    const d = f < c.lo ? c.lo - f : f > c.hi ? f - c.hi : 0;
    if (d < bestD) ((bestD = d), (best = i));
  });
  if (best >= 0) {
    await page.locator(`.slot[data-slot="${best}"]`).tap();
    if (round === 0) await snap("3-customer-selected");
    const coins = s.coins;
    await page.locator('[data-act="serve"]').tap();
    assert.ok((await state()).coins > coins, "serving must pay");
    served++;
    if (round === 0) await snap("4-served");
  } else {
    await page.locator('[data-act="preorder"]').tap();
    assert.ok((await state()).orders.length > 0);
    preorders++;
  }
}

// Close early, see the summary, sleep into day 2. Jars must have aged a full day.
const before = await state();
await page
  .locator('[data-act="close"]')
  .tap()
  .catch(async () => {
    await page.evaluate(() => window.__ferment.R.closeShop(window.__ferment.state));
  });
await page.locator('[data-act="sleep"]').waitFor();
await snap("5-evening");
await page.locator('[data-act="sleep"]').tap();
const after = await state();
assert.equal(after.day, 2);
assert.equal(after.phase, "morning");
const j = before.shelf.findIndex((x, i) => x && after.shelf[i] && x.id === after.shelf[i].id);
assert.ok(after.shelf[j].age > before.shelf[j].age + 11, "overnight ageing");

// Save survives a reload.
await page.waitForTimeout(100);
await page.reload();
assert.equal((await state()).day, 2);
await snap("6-day2");

assert.deepEqual(errors, []);
console.log(`ferment play: ok (served ${served}, pre-orders ${preorders})`);
await browser.close();
