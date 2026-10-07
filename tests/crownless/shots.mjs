/**
 * Screenshots of every Crownless screen whose text or buttons can overflow,
 * on the tallest and the shortest phone worth caring about (ui.md: 390 × 844
 * and 375 × 667).
 *
 *     node tests/crownless/shots.mjs   # writes tests/crownless/shots/*.png
 *
 * Assertions can't see a label cut off by the edge of a chip, or the last
 * row of a sheet hidden behind its buttons. This is the check for that:
 * look at the pictures. It also fails if any of the game's buttons is smaller than
 * 44 px or runs off the screen, and if the console isn't clean.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openGame, saveOf } from "./harness.mjs";
import { createBattle, playRound } from "../../games/crownless/rules/battle.js";
import { skirmish } from "../../games/crownless/rules/battle-setup.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");
await mkdir(OUT, { recursive: true });
let problems = 0;

/** Every visible button: at least 44 px each way, and wholly on screen. */
async function checkButtons(page, label, name) {
  const bad = await page.evaluate(() => {
    const out = [];
    const W = innerWidth;
    const H = innerHeight;
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // Scrolled rows clip their own overflow; judge what is inside the row.
      const row = b.closest(".cl-chips, .cl-abilities, .cl-body");
      const box = row ? row.getBoundingClientRect() : { left: 0, right: W, top: 0, bottom: H };
      const visible =
        r.right > box.left + 1 &&
        r.left < box.right - 1 &&
        r.bottom > box.top + 1 &&
        r.top < box.bottom - 1;
      if (!visible) continue;
      const text = (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 24);
      if (r.height < 43.5 || r.width < 43.5)
        out.push(`${text}: ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (!row && (r.left < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5))
        out.push(`${text}: off screen`);
    }
    return out;
  });
  if (bad.length) {
    problems++;
    console.log(`FAIL  ${name} @ ${label}: ${bad.join("; ")}`);
  }
}

for (const device of ["iPhone 13", "iPhone SE"]) {
  const label = device.replace(/\s+/g, "-").toLowerCase();
  const game = await openGame({ device });
  const { page, press, settle } = game;
  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `${name}-${label}.png`) });
    await checkButtons(page, label, name);
  };

  await settle(800);
  await shot("title");

  await press("Skirmish", 500);
  await page.waitForFunction(() => /Odds: \w+ \(\d of 8\)/.test(document.body.textContent), null, {
    timeout: 20000,
  });
  await shot("setup");
  await page.locator(".cl-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await settle(200);
  await shot("setup-bottom");
  await press("Their army");
  await page.getByRole("group", { name: "Culture" }).getByRole("button", { name: "Ulus" }).tap();
  await page.getByRole("group", { name: "Doctrine" }).getByRole("button", { name: "Random" }).tap();
  await settle(300);
  await shot("setup-theirs");

  // The biggest army: Kharum's horde at 200 against Ulus at 200, in woods,
  // level-20 heroes. The most chips, abilities and soldiers there can be.
  const big = skirmish({
    seed: 11,
    terrain: "woods",
    sides: [
      { culture: "hold", doctrine: "horde", worth: 200, hero: 20 },
      { culture: "ulus", doctrine: "steppe", worth: 200, hero: 20 },
    ],
  });
  await game.resume(saveOf(big, { phase: "deploy" }));
  await shot("deploy");
  await press("Begin ▶");
  await shot("plan");
  await press("Advance");
  await shot("target");
  await press("Done");

  // A battle a few rounds in: lines locked, volleys, floating losses.
  const mid = skirmish({
    seed: 5,
    terrain: "woods",
    sides: [
      { culture: "vale", doctrine: "balanced", worth: 150, hero: 10 },
      { culture: "fen", doctrine: "yeomen", worth: 150, hero: 10, ai: true },
    ],
  });
  for (const s of mid.squads)
    if (s.side === 0) s.cmd = s.banner ? { kind: "escort" } : { kind: "advance" };
  for (let i = 0; i < 4; i++) playRound(mid, { record: false });
  await game.resume(saveOf(mid));
  await game.press("Go ▶", 1400);
  await shot("round");
  await settle(2200);
  await game.chip(mid.squads.find((s) => s.side === 0 && !s.banner).id).tap();
  await settle();
  await press("More");
  await shot("more");
  await page.getByRole("group", { name: "Camera" }).getByRole("button", { name: "Follow" }).tap();
  await press("Back");
  await settle(1200);
  await shot("follow");
  await press("More");
  await page
    .getByRole("group", { name: "Camera" })
    .getByRole("button", { name: "Whole field" })
    .tap();
  await press("Auto finish", 600);
  await shot("result");

  if (game.errors.length) {
    problems++;
    console.log(`FAIL  console @ ${label}: ${game.errors.join(" | ")}`);
  }
  await game.close();
}

console.log(`screenshots written to ${OUT}`);
process.exit(problems ? 1 : 0);
