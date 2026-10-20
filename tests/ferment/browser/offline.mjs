// Phone flow: the game installed from the launcher, then played with no
// network at all. The launcher registers the site's service worker (sw.js);
// opening the game once caches every file it loads. Then the server is shut
// down (not just a flag in the browser: nothing answers at all) and the game
// must start again from the cache, play a whole day through real taps, sleep,
// and come back on day 2 after a reload and after a cold start from the
// launcher. Runs on its own server, so its saves and cache are its own.
import assert from "node:assert/strict";
import { serve } from "./serve.mjs";

export const name = "offline";

export async function run(page, snap) {
  const server = await serve();
  const game = `${server.url}games/ferment/index.html`;
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  try {
    // Install: open the launcher, let its service worker take over, open the game from it.
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.locator('a[href="games/ferment/index.html"]').first().tap();
    await page.waitForURL(game);
    await page.locator(".intro").waitFor();
    // Every file the game loaded must be in the cache before the network goes.
    const missing = () =>
      page.evaluate(async () => {
        const urls = [
          location.href,
          ...performance.getEntriesByType("resource").map((e) => e.name),
        ];
        const ours = urls.filter((u) => u.startsWith(location.origin));
        const hits = await Promise.all(ours.map((u) => caches.match(u)));
        return ours.length > 10 ? ours.filter((u, i) => !hits[i]) : ["(too few files seen)"];
      });
    let left = await missing();
    for (let i = 0; i < 50 && left.length; i++, left = await missing())
      await page.waitForTimeout(200);
    assert.deepEqual(left, [], "files the game loaded but the cache doesn't hold");
  } finally {
    server.close();
  }
  const down = await page
    .context()
    .request.get(server.url, { timeout: 2000 })
    .catch(() => null);
  assert.equal(down, null, "the server is really gone");

  // Offline from here on. The game starts from the cache.
  await page.reload();
  await page.locator(".intro").waitFor();
  await page.locator('[data-act="intro-skip"]').tap();
  await page.locator('[data-act="tip-skip"]').tap();
  await snap("1-offline-morning");

  // A whole day through the screen: start a jar, open up, serve or pre-order
  // everyone who comes, close, sleep. The clock is run along between customers.
  let s = await state();
  const empty = s.shelf.slots.findIndex((j) => !j);
  await page.locator(`.slot[data-slot="${empty}"]`).tap();
  await page.locator('.recipe[data-recipe="dill"]').tap();
  await page.locator('[data-act="open"]').tap();
  let served = 0;
  let booked = 0;
  for (let guard = 0; (s = await state()).clock.phase === "open"; guard++) {
    assert.ok(guard < 400, "the day never ended");
    const c = s.customers.queue[0];
    if (!c) {
      await page.evaluate(() => window.__ferment.dispatch({ type: "tick", n: 30 }));
      continue;
    }
    await page.waitForTimeout(50);
    // The jar that pays for this customer, as the game judges it, or -1.
    const slot = await page.evaluate((c) => {
      const C = window.__ferment.core;
      const st = window.__ferment.state;
      return st.shelf.slots.findIndex(
        (j) =>
          j &&
          j.recipe === c.recipe &&
          !C.isOver(j) &&
          C.freePortions(st, j, c.orderId) >= 1 &&
          C.judge(c, C.flavour(j)).pay > 0,
      );
    }, c);
    if (slot >= 0) {
      await page.locator(`.slot[data-slot="${slot}"]`).tap();
      await page.locator('[data-act="serve"]').tap();
      served++;
    } else if (!c.orderId && (await page.locator('[data-act="preorder"]').count())) {
      await page.locator('[data-act="preorder"]').tap();
      await page.locator('.plan [data-act="board-close"]').first().tap();
      booked++;
    } else {
      await page.locator('[data-act="away"]').tap();
    }
    if (served + booked === 1) await snap("2-offline-serving");
  }
  await page.locator('.evening [data-act="sleep"]').waitFor();
  await snap("3-offline-evening");
  const takings = s.shop.today.earned;
  await page.locator('.evening [data-act="sleep"]').tap();
  assert.equal((await state()).clock.day, 2);

  // Still offline: a reload, then a cold start from the launcher, both come back on day 2.
  await page.waitForTimeout(100);
  await page.reload();
  assert.equal((await state()).clock.day, 2, "the save survives an offline reload");
  await page.goto(server.url);
  await page.locator('a[href="games/ferment/index.html"]').first().tap();
  await page.waitForURL(game);
  assert.equal((await state()).clock.day, 2, "and a cold start from the launcher");
  await snap("4-offline-day2");
  return `day 1 offline: served ${served}, pre-orders ${booked}, took ${takings}`;
}
