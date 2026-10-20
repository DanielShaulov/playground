// Phone flow: speed on a slow phone. The CPU is slowed 4× (Chrome's "mid-tier
// mobile" setting) and the biggest release save (a tier-5 shop, 15 spots,
// a full order board) is played through real taps. Each tap is timed from
// the touch to the next frame painted with its result (the browser's Event
// Timing entries, the same numbers as Interaction to Next Paint).
//
// The budget (proposed for the release check), at 4× slower:
//   - a tap inside a screen paints within TAP_MS (Google's line for "good"
//     responsiveness is 200 ms on a real phone; a 4× slowed runner is
//     roughly a mid-range one);
//   - a tap that swaps the whole screen (closing for the night, sleeping into
//     the morning) paints within SCREEN_MS: it draws every jar and face anew,
//     once a day, under the dusk and dawn fades;
//   - the open shop, with nothing tapped, keeps the main thread busy less than
//     BUSY_SHARE of the time (the clock and a redraw ten times a second).
// Like the balance sim, going over budget is a warning on the PR, not a red
// build (runners are noisy); only going over twice the budget fails, since
// that is something broken, not noise. A tap that can be undone gets two tries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const name = "perf";
/** Runs on its own, after the other flows (run.mjs), so they don't slow it down. */
export const alone = true;

const TAP_MS = 200;
const SCREEN_MS = 300;
const BUSY_SHARE = 0.35;
const SAVE = readFileSync(new URL("../core/fixtures/high-tier.json", import.meta.url), "utf8");

export async function run(page, snap) {
  // Load the big shop into storage, off the game's page so it can't save over it.
  const game = page.url();
  const blank = new URL("/__blank", game).href;
  await page.route(blank, (r) =>
    r.fulfill({ contentType: "text/html", body: '<link rel="icon" href="data:,">' }),
  );
  await page.goto(blank);
  await page.evaluate((json) => localStorage.setItem("playground:ferment:save", json), SAVE);
  await page.goto(game);
  await page.locator(".shelf .slot").first().waitFor();
  // Early in the day, so the shop doesn't close by itself while it's being timed.
  await page.evaluate(() => {
    const s = structuredClone(window.__ferment.state);
    s.clock.hour = 1;
    window.__ferment.state = s;
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    window.__taps = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.interactionId) window.__taps.push({ id: e.interactionId, ms: e.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: false });
  });

  /**
   * Tap `sel`, wait for `ready`, and log the slowest event of that interaction (ms).
   * A slow tap that `undo` can take back is tried once more, and the better time counts.
   */
  const timed = async (label, sel, ready, budget = TAP_MS) => {
    let best = Infinity;
    for (let attempt = 0; attempt < (undo ? 2 : 1) && best > budget; attempt++) {
      if (attempt) await undo();
      await page.evaluate(() => (window.__taps.length = 0));
      await page.locator(sel).first().tap();
      if (ready) await page.locator(ready).first().waitFor();
      await page.waitForTimeout(250); // let the observer report
      const ms = await page.evaluate(() => Math.max(0, ...window.__taps.map((t) => t.ms)));
      best = Math.min(best, ms);
    }
    times.push([label, Math.round(best), budget]);
    return best;
  };
  const times = [];
  let undo = null;

  const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const jar = s.shelf.slots.findIndex((j) => j);
  const empty = s.shelf.slots.findIndex((j) => !j);

  undo = () => page.locator(`.slot[data-slot="${jar}"]`).tap();
  await timed("pick a jar", `.slot[data-slot="${jar}"]`, `.slot[data-slot="${jar}"].sel`);
  await page.locator(`.slot[data-slot="${jar}"]`).tap();
  undo = () => page.locator('.sheet [data-act="cancel"]').tap();
  await timed("open the brew sheet", `.slot[data-slot="${empty}"]`, ".sheet .recipe");
  await snap("1-brew-sheet");
  undo = null;
  await timed(
    "start a jar",
    '.recipe[data-recipe="kimchi"]',
    `.slot[data-slot="${empty}"] svg.jar`,
  );
  undo = () => page.locator('.plan [data-act="board-close"]').first().tap();
  await timed("open an order", ".board .ticket", ".plan");
  await snap("2-planner");
  await page.locator('.plan [data-act="board-close"]').first().tap();
  undo = () => page.locator('[data-act="set-close"]').tap();
  await timed("open settings", '[data-act="settings"]', '[data-act="set-close"]');
  await page.locator('[data-act="set-close"]').tap();

  // The open shop left alone for a while: how busy is the main thread?
  const metric = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = (n) => metrics.find((m) => m.name === n).value;
    return { busy: get("TaskDuration"), at: get("Timestamp") };
  };
  await cdp.send("Performance.enable");
  const a = await metric();
  await page.waitForTimeout(4000);
  const b = await metric();
  const busy = (b.busy - a.busy) / (b.at - a.at);

  // Into the evening and through its tabs (anyone who came in meanwhile is sent off first).
  undo = null;
  for (let i = 0; i < 6 && (await page.locator('[data-act="close"]').count()) === 0; i++) {
    await page
      .locator('[data-act="away"]')
      .first()
      .tap({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(1700); // the customer walks out
  }
  await timed("close for the night", '[data-act="close"]', ".evening .receipt", SCREEN_MS);
  for (const tab of ["orders", "market", "workshop", "goals"]) {
    undo = () => page.locator('.evening .tab[data-tab="till"]').tap();
    await timed(`evening: ${tab}`, `.evening .tab[data-tab="${tab}"]`, null);
  }
  await snap("3-evening");
  undo = () => page.locator('.bench [data-act="bench-close"]').first().tap();
  await timed("open the bench", '.evening .actions [data-act="bench"]', ".bench");
  await page.locator('.bench [data-act="bench-close"]').first().tap();
  undo = null;
  await timed("sleep", '.evening [data-act="sleep"]', '[data-act="open"]', SCREEN_MS);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const over = times.filter(([, ms, budget]) => ms > budget);
  for (const [label, ms, budget] of over)
    console.log(
      `::warning title=Ferment speed::"${label}" took ${ms} ms at 4× slower (budget ${budget} ms)`,
    );
  if (busy > BUSY_SHARE)
    console.log(
      `::warning title=Ferment speed::the open shop keeps the main thread ${Math.round(busy * 100)}% busy (budget ${BUSY_SHARE * 100}%)`,
    );
  const broken = times.filter(([, ms, budget]) => ms > 2 * budget);
  assert.deepEqual(broken, [], "taps over twice their budget");
  assert.ok(
    busy < 2 * BUSY_SHARE,
    `the open shop keeps the main thread ${Math.round(busy * 100)}% busy`,
  );
  const worst = times.reduce((w, t) => (t[1] > w[1] ? t : w));
  return `4× slower: ${times.length} taps, worst ${worst[1]} ms (${worst[0]}), median ${
    times.map((t) => t[1]).sort((x, y) => x - y)[times.length >> 1]
  } ms; idle shop ${Math.round(busy * 100)}% busy${over.length ? `; OVER BUDGET: ${over.map((t) => `${t[0]} ${t[1]}`).join(", ")}` : ""}`;
}
