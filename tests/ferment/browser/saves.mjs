// Phone flow: each release save (tests/ferment/core/fixtures/) put in the
// phone's storage and opened, as a player coming back to the game would.
// The right screen comes up for it (the intro, a keeper's note, the evening,
// the month's end, the shelf with its extra spots), nothing breaks or
// overflows, and the first tap still works. One shot per save, for the bug sweep.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

export const name = "saves";

const DIR = new URL("../core/fixtures/", import.meta.url);
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f.replace(".json", ""), readFileSync(new URL(f, DIR), "utf8")]);

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  for (const [i, [fixture, json]] of FIXTURES.entries()) {
    const raw = JSON.parse(json);
    // Off the game's page first: leaving it saves the game it had over ours.
    const game = page.url();
    const blank = new URL("/__blank", game).href;
    await page.route(blank, (r) =>
      r.fulfill({ contentType: "text/html", body: '<link rel="icon" href="data:,">' }),
    );
    await page.goto(blank);
    await page.evaluate((json) => {
      localStorage.clear();
      localStorage.setItem("playground:ferment:save", json);
    }, json);
    await page.goto(game);
    const s = await state();
    assert.equal(s.meta.seed, raw.meta.seed, `${fixture}: the save was dropped`);
    assert.equal(s.clock.day, raw.clock.day);
    assert.match(
      await page.locator("header.top").first().textContent(),
      new RegExp(`Day ${raw.clock.day}`),
    );
    assert.equal(await page.locator(".shelf .slot").count(), raw.shelf.slots.length);
    const ending = await page.evaluate(() =>
      window.__ferment.core.endingDue(window.__ferment.state),
    );
    if (raw.tutorial.intro) await page.locator(".intro").waitFor();
    else if (ending) await page.locator(".ending").waitFor();
    else if (raw.clock.phase === "evening") await page.locator(".evening .receipt").waitFor();
    else if (raw.tutorial.now) await page.locator(".tip-note:not([hidden])").waitFor();
    await page.waitForTimeout(150);
    await snap(`${i + 1}-${fixture}`);

    // The first tap: past the intro, the evening or the note, then a jar on the shelf.
    if (raw.tutorial.intro) {
      await page.locator('[data-act="intro-skip"]').tap();
      await page.locator(".intro").waitFor({ state: "hidden" });
    } else if (ending) {
      await page.locator('[data-act="end-skip"]').tap();
      await page.locator('[data-act="end-sign"]').tap();
      await page.locator('.ending [data-act="end-next"]').tap();
      await page.locator('[data-act="end-done"]').tap();
      await page.locator(".ending").waitFor({ state: "hidden" });
    } else if (raw.clock.phase === "evening") {
      await page.locator('.evening .top [data-act="eve-close"]').tap();
    }
    const tipUp = await page.locator(".tip-note:not([hidden])").count();
    if (tipUp && (await page.locator('.tip-note [data-act="tip-next"]').count()))
      await page.locator('.tip-note [data-act="tip-next"]').tap();
    const slot = (await state()).shelf.slots.findIndex((j) => j);
    if (slot >= 0 && !(await page.locator(".tip-note:not([hidden])").count())) {
      await page.locator(`.slot[data-slot="${slot}"]`).tap();
      await page.locator(`.slot[data-slot="${slot}"].sel`).waitFor({ timeout: 2000 });
    }
  }
  return `${FIXTURES.length} saves opened`;
}
