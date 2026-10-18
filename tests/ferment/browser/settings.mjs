// Phone flow: the settings sheet (ui/settings.js). The gear opens it and the
// shop clock stands still while it is open. Sound flips ui/audio.js's mute;
// motion overrides the phone (Full shows the motion layer even though these
// tests run with reduced motion, Calm hides it), and both survive a reload.
// The Patterns strip keeps its four bands apart in greyscale: the check
// screenshots a bare strip, greys it on a canvas and compares the bands.
// A backup code copies out, bad pastes get a polite message, a good code
// loads after a confirm and survives a reload. Start over asks first and
// keeps the settings. The intro button appears once onboarding registers it.
// Depends on window.__ferment, __fermentAudio, __fermentSettings and data-act.
import assert from "node:assert/strict";

export const name = "settings";

const BANDS = [
  ["crisp", 0, 0.3],
  ["tangy", 0.3, 0.55],
  ["sour", 0.55, 0.8],
  ["funky", 0.8, 1],
];

export async function run(page, snap) {
  const tap = (sel) => page.locator(sel).first().tap();
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const prefs = () => page.evaluate(() => ({ ...window.__fermentSettings.prefs }));
  const html = (attr) => page.evaluate((a) => document.documentElement.dataset[a], attr);
  const pressed = (act) =>
    page.evaluate(
      (a) => document.querySelector(`.settings [data-act="${a}"][aria-pressed="true"]`)?.dataset.v,
      act,
    );
  const fxShown = () =>
    page.evaluate(() => getComputedStyle(document.querySelector(".fx-layer")).display !== "none");
  const sheet = page.locator(".sheet.settings");

  // The gear opens the sheet; the clock stands still under it.
  await page.waitForFunction(() => document.querySelector(".fx-layer"));
  await tap('[data-act="open"]');
  await tap('.top [data-act="settings"]');
  await sheet.locator("h2").waitFor();
  const hour = (await state()).clock.hour;
  await page.waitForTimeout(1500);
  assert.equal((await state()).clock.hour, hour, "the shop waits while settings are open");
  // The onboarding registers its intro, so the sheet offers it.
  assert.equal(await page.locator('.settings [data-act="set-intro"]').count(), 1);
  await snap("1-sheet");

  // Sound: the same mute ui/audio.js keeps.
  await tap('[data-act="set-sound"][data-v="off"]');
  assert.equal(await page.evaluate(() => window.__fermentAudio.muted), true);
  assert.equal(await pressed("set-sound"), "off");
  await tap('[data-act="set-sound"][data-v="on"]');
  assert.equal(await page.evaluate(() => window.__fermentAudio.muted), false);

  // Motion: these tests run with the phone asking for less motion.
  assert.equal(await fxShown(), false, "Like my phone follows reduced motion");
  await tap('[data-act="set-motion"][data-v="full"]');
  assert.equal(await html("motion"), "full");
  assert.equal(await fxShown(), true, "Full overrides the phone");
  assert.equal(
    await page.evaluate(async () => (await import("/games/ferment/ui/settings.js")).calmMotion()),
    false,
  );
  await tap('[data-act="set-motion"][data-v="calm"]');
  assert.equal(await fxShown(), false);
  const anim = await page.evaluate(() => {
    const pill = document.querySelector(".pill");
    pill.classList.add("bump");
    return getComputedStyle(pill).animationName;
  });
  assert.equal(anim, "none", "Calm stops CSS animations too");

  // Strip style.
  await tap('[data-act="set-strip"][data-v="marked"]');
  assert.equal(await html("strip"), "marked");
  await snap("2-patterns");

  // Both choices survive a reload.
  await page.reload();
  await page.waitForFunction(() => window.__fermentSettings);
  assert.deepEqual(await prefs(), { motion: "calm", strip: "marked" });
  assert.equal(await html("strip"), "marked");
  await page.evaluate(() => window.__fermentSettings.set("motion", "auto"));

  // Greyscale: every band of the Patterns strip stands apart from its neighbours.
  const marked = await bandStats(page);
  for (let i = 1; i < marked.length; i++) {
    const [a, b] = [marked[i - 1], marked[i]];
    // Each band is clearly darker than the one before it, crisp to funky.
    assert.ok(
      a.mean - b.mean > 25,
      `${a.id} and ${b.id} look alike in grey: ${JSON.stringify(marked)}`,
    );
  }
  // ...and the notches between bands show as a light gap in the strip.
  for (const n of marked.slice(1))
    assert.ok(n.notch > 12, `no notch before ${n.id}: ${JSON.stringify(marked)}`);
  await page.evaluate(() => document.documentElement.style.setProperty("filter", "grayscale(1)"));
  await snap("3-grey-shop");
  await page.evaluate(() => document.documentElement.style.removeProperty("filter"));
  // The plain strip has no notches: the check above would catch the patterns going missing.
  await page.evaluate(() => window.__fermentSettings.set("strip", "plain"));
  const plain = await bandStats(page);
  assert.ok(
    plain.slice(1).every((n) => n.notch < 12),
    `plain strip has notches: ${JSON.stringify(plain)}`,
  );
  await page.evaluate(() => window.__fermentSettings.set("strip", "marked"));

  // Backup: the code copies out.
  await tap('.top [data-act="settings"]');
  await tap('[data-act="set-backup"]');
  const code = await page.locator(".settings textarea.code[readonly]").inputValue();
  assert.match(code, /^BRINE1\.[\w-]+\.[\w-]{6}$/);
  await tap('[data-act="set-copy"]');
  await page.locator('[data-act="set-copy"]', { hasText: "Copied" }).waitFor();
  await snap("4-backup");

  // Bad pastes are turned away politely, and the paste stays in the box.
  const paste = page.locator(".settings textarea.paste");
  const tryLoad = async (text) => {
    await paste.fill(text);
    await tap('[data-act="set-load"]');
    return page.locator(".set-error").textContent();
  };
  assert.match(await tryLoad(""), /Paste a shop code/);
  assert.match(await tryLoad("pickles please"), /doesn't look like a shop code/);
  assert.match(await tryLoad(code.slice(0, -25)), /missing or changed/);
  assert.equal(await paste.inputValue(), code.slice(0, -25));
  await snap("5-bad-code");

  // A good code (another shop, on day 6) asks first, then loads and stays loaded.
  const other = await page.evaluate(() => {
    const C = window.__ferment.core;
    const s = C.newGame(77);
    s.clock.day = 6;
    s.shop.coins = 321;
    return C.saveCode(s);
  });
  await paste.fill(other.match(/.{1,60}/g).join("\n"));
  await tap('[data-act="set-load"]');
  await sheet.locator("h2", { hasText: "Load this shop?" }).waitFor();
  assert.match(await sheet.textContent(), /day 6 with 🪙 321/);
  await snap("6-load-confirm");
  await tap('[data-act="set-load-yes"]');
  assert.equal(await sheet.isHidden(), true);
  let s = await state();
  assert.equal(s.clock.day, 6);
  assert.equal(s.shop.coins, 321);
  await page.reload();
  await page.waitForFunction(() => window.__ferment);
  assert.equal((await state()).shop.coins, 321, "a loaded shop is saved");

  // Credits.
  await tap('.top [data-act="settings"]');
  await tap('[data-act="set-credits"]');
  assert.match(await sheet.textContent(), /ZzFX by Frank Force.*MIT licence/);
  await snap("7-credits");
  await tap('[data-act="set-back"]');

  // Start over asks first; Keep my shop changes nothing; the settings stay.
  await tap('[data-act="set-restart"]');
  await snap("8-restart-confirm");
  await tap('[data-act="set-cancel"]');
  assert.equal((await state()).clock.day, 6);
  await tap('[data-act="set-restart"]');
  await tap('[data-act="set-restart-yes"]');
  s = await state();
  assert.equal(s.clock.day, 1);
  assert.notEqual(s.shop.coins, 321);
  assert.equal((await prefs()).strip, "marked", "starting over keeps the settings");

  // Tapping outside closes the sheet.
  await tap('.top [data-act="settings"]');
  await page.mouse.click(5, 40);
  assert.equal(await sheet.isHidden(), true);

  // The intro button calls whatever the onboarding screens handed over.
  await page.evaluate(async () => {
    const m = await import("/games/ferment/ui/settings.js");
    m.onReplayIntro(() => (window.__introPlayed = (window.__introPlayed ?? 0) + 1));
  });
  await tap('.top [data-act="settings"]');
  await tap('[data-act="set-intro"]');
  assert.equal(await page.evaluate(() => window.__introPlayed), 1);
  assert.equal(await sheet.isHidden(), true);

  const sum = marked.map((b) => `${b.id} ${Math.round(b.mean)}±${Math.round(b.sd)}`).join(", ");
  return `grey bands: ${sum}; code ${code.length} chars`;
}

/**
 * Screenshot a bare big strip, grey it on a canvas, and measure each band away
 * from its edges (mean and spread of grey), plus the brightest grey in the
 * columns at the band's left edge above both neighbouring bands (the notch).
 */
async function bandStats(page) {
  await page.evaluate(async () => {
    const { strip } = await import("/games/ferment/ui/strip.js");
    const box = document.createElement("div");
    box.id = "strip-probe";
    box.style.cssText =
      "position:fixed;left:10px;top:120px;width:300px;padding:6px 0;z-index:99;background:var(--bg)";
    box.innerHTML = strip({ big: true });
    document.body.appendChild(box);
  });
  const png = await page.locator("#strip-probe .strip").screenshot();
  const stats = await page.evaluate(
    async ({ b64, bands }) => {
      document.getElementById("strip-probe")?.remove();
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
      const grey = (x, y) => {
        const i = (y * width + x) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };
      const y0 = Math.floor(height * 0.25);
      const y1 = Math.ceil(height * 0.75);
      const out = bands.map(([id, lo, hi]) => {
        const xs = [];
        for (let x = Math.ceil(lo * width) + 5; x < Math.floor(hi * width) - 5; x++) xs.push(x);
        const v = [];
        for (const x of xs) for (let y = y0; y < y1; y++) v.push(grey(x, y));
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
        const edge = Math.round(lo * width);
        let notch = 0;
        for (let x = Math.max(0, edge - 2); x <= Math.min(width - 1, edge + 2); x++) {
          let col = 0;
          for (let y = y0; y < y1; y++) col += grey(x, y);
          notch = Math.max(notch, col / (y1 - y0));
        }
        return { id, mean, sd, notch };
      });
      out.forEach((b, i) => (b.notch = i ? b.notch - Math.max(b.mean, out[i - 1].mean) : 0));
      return out;
    },
    { b64: png.toString("base64"), bands: BANDS },
  );
  return stats;
}
