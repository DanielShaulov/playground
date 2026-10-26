// Phone flow: the end of the first month. Day 30's evening, Sleep, and the
// morning after it: the dusk street with the player's jars, Agnes's letter
// naming the regular who came most, the month's book, signing the shop's book
// on the letter wheels and the board of best months, then the credit roll
// with the regulars' faces, which scrolls itself. "Keep the shop open" goes
// back to day 31's shop, and the scene doesn't come back; the settings
// offer it again, and watching it again changes nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const name = "ending";

const MONTH_END = readFileSync(new URL("../core/fixtures/month-end.json", import.meta.url), "utf8");

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const ending = page.locator(".ending");

  // Day 30's evening: no scene yet.
  await page.evaluate((json) => {
    const s = JSON.parse(json);
    s.clock = { day: 30, phase: "evening", hour: 12 };
    window.__ferment.state = s;
  }, MONTH_END);
  await page.locator(".evening .receipt").waitFor();
  assert.ok(await ending.isHidden(), "nothing on day 30's evening");

  // Sleep: the morning after the month.
  await page.locator('.evening [data-act="sleep"]').tap();
  await ending.waitFor();
  let s = await state();
  assert.equal(s.clock.day, 31);
  const fav = await page.evaluate(() => {
    const m = window.__ferment.core.monthOf(window.__ferment.state);
    return m.regulars[0];
  });
  assert.match(await ending.textContent(), /Thirty days/);
  assert.ok(
    (await page.locator(".ending .intro-art .jar").count()) > 2,
    "the player's jars in the window",
  );
  await snap("1-dusk");
  await page.locator('[data-act="end-next"]').tap();
  assert.match(await ending.textContent(), /letter/);
  assert.ok(fav, "the save has regulars");
  await snap("2-letter");
  await page.locator('[data-act="end-next"]').tap();
  assert.match(await ending.textContent(), new RegExp(`${s.progress.stats.served} portions sold`));
  await snap("3-ledger");
  await page.locator('[data-act="end-next"]').tap();

  // The book: sign with three letters on the wheels (they start at AAA), then the board.
  await page.locator(".wheels").waitFor();
  for (let k = 0; k < 7; k++) await page.locator('[data-act="end-down"][data-i="0"]').tap();
  await page.locator('[data-act="end-up"][data-i="1"]').tap();
  for (let k = 0; k < 3; k++) await page.locator('[data-act="end-down"][data-i="2"]').tap();
  assert.equal(
    await page
      .locator(".wheels")
      .textContent()
      .then((x) => x.replace(/[^A-Z]/g, "")),
    "HZD",
  );
  await snap("4-sign");
  await page.locator('[data-act="end-sign"]').tap();
  await page.locator(".hiscores li.mine").waitFor();
  assert.match(
    await page.locator(".hiscores li.mine").textContent(),
    new RegExp(`HZD.*${s.progress.stats.earned}`),
  );
  assert.equal((await state()).ending.name, "HZD");
  const board = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("playground:ferment:scores")),
  );
  assert.equal(board.length, 1);
  await snap("5-board");
  await page.locator('.ending [data-act="end-next"]').tap();

  // The roll: the regulars' faces, and it moves by itself (the phones here ask for less
  // motion, and then the player scrolls it, so turn motion on for this part).
  await page.evaluate(() => window.__fermentSettings.set("motion", "full"));
  const roll = page.locator(".end-roll");
  await roll.waitFor();
  const regulars = Object.values(s.regulars.met).filter((m) => !m.pending).length;
  assert.equal(await page.locator(".end-face").count(), regulars);
  const top = await roll.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(1200);
  assert.ok((await roll.evaluate((el) => el.scrollTop)) > top, "the credits roll");
  assert.match(await roll.textContent(), /Keeper of the Brine Nook\s*HZD/i);
  await snap("6-credits");
  await roll.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(100);
  await snap("7-thanks");
  await page.evaluate(() => window.__fermentSettings.set("motion", "auto"));

  // Back to the shop on day 31, and the scene is done with.
  await page.locator('[data-act="end-done"]').tap();
  await ending.waitFor({ state: "hidden" });
  s = await state();
  assert.equal(s.ending.seen, true);
  assert.equal(s.clock.day, 31);
  assert.equal(s.clock.phase, "morning");
  await page.reload();
  await page.waitForTimeout(300);
  assert.ok(await ending.isHidden(), "seen once, gone for good");

  // Watch it again from the settings: skip, close, nothing changed.
  await page.locator('.app > .top [data-act="settings"]').tap();
  await page.locator('[data-act="set-ending"]').tap();
  await ending.waitFor();
  await page.locator('[data-act="end-skip"]').tap();
  await page.locator(".hiscores li.mine").waitFor();
  await page.locator('.ending [data-act="end-next"]').tap();
  await page.locator('[data-act="end-done"]').tap();
  await ending.waitFor({ state: "hidden" });
  assert.deepEqual(await state(), s);

  // The board in the settings, signed once only.
  await page.locator('.app > .top [data-act="settings"]').tap();
  await page.locator('[data-act="set-scores"]').tap();
  assert.equal(
    await page.locator(".settings .hiscores li").count(),
    6,
    "the house's five and ours",
  );
  assert.match(await page.locator(".settings .hiscores li").first().textContent(), /AGP/);
  await snap("8-settings-board");
  await page.locator('[data-act="set-back"]').tap();
  await page.locator('[data-act="set-close"]').tap();
  return `day 31 with ${regulars} regulars in the credits`;
}
