// Phone flow: decor and Shop pride. A late-game shop closes for the night;
// the goals corner lists Shop pride with the met ones claimable, and claiming
// one puts its prize up in the shop. In the decor corner a piece the shop
// doesn't own is tried on in the miniature without buying; "Put back" undoes
// it; buying puts it up and costs its price; tapping an owned piece swaps
// back for free. Back in the shop, the back wall, garland, jar dressing and
// window show what was put up, and a served customer's bag sits on the counter.
// Depends on window.__ferment and the data-act / data-id / data-tab /
// data-spot attributes of the decor and goals corners.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const name = "decor";

const FIXTURE = readFileSync(new URL("../core/fixtures/high-tier.json", import.meta.url), "utf8");

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const tab = (id) => page.locator(`.evening .tab[data-tab="${id}"]`).tap();
  const on = (s, spot) => s.decor.on[spot];

  await page.evaluate((json) => {
    window.__ferment.state = JSON.parse(json);
    window.__ferment.dispatch({ type: "close" });
  }, FIXTURE);
  await page.locator(".evening .receipt").waitFor();
  // The till points at the pride goal waiting to be claimed.
  assert.match(await page.locator(".evening .tonight").innerText(), /Shop pride/);
  assert.equal(await page.locator('.evening .tab[data-tab="goals"] .dot').count(), 1);

  // Goals: Shop pride, met goals first, each with its prize drawn.
  await tab("goals");
  await page.locator(".evening .prides").waitFor();
  const ready = page.locator('.evening .pride.ready [data-act="eve-pride"]');
  assert.ok((await ready.count()) >= 2, "famous and pride are met on this save");
  assert.equal(
    await page
      .locator(".evening .pride .prize svg, .evening .pride .prize img, .evening .pride .prize i")
      .count(),
    7,
  );
  await snap("1-pride");
  await page.locator('.evening [data-act="eve-pride"][data-id="pride"]').tap();
  let s = await state();
  assert.deepEqual(s.progress.pride, ["pride"]);
  assert.equal(on(s, "jars"), "gold");
  assert.equal(await page.locator('.evening [data-act="eve-pride"][data-id="pride"]').count(), 0);

  // Decor: try on a wallpaper without buying it, then put it back.
  await tab("decor");
  await page.locator(".evening .dprev .mini").waitFor();
  const coins = s.shop.coins;
  await page.locator('.evening .sw[data-id="sprig"]').tap();
  await page.locator(".evening .dprev.trying").waitFor();
  assert.equal((await state()).shop.coins, coins, "trying on is free");
  assert.equal(on(await state(), "wall"), undefined);
  const mini = await page.locator(".evening .mini").getAttribute("style");
  assert.match(mini, /--panel:#f4e6dc/, "the miniature wears the tried-on wall");
  await snap("2-try-on");
  await page.locator('.evening [data-act="dc-undo"]').tap();
  assert.equal(await page.locator(".evening .dprev.trying").count(), 0);

  // Buy it: it costs its price and goes up.
  await page.locator('.evening .sw[data-id="sprig"]').tap();
  await page.locator('.evening .dspot[data-spot="wall"] [data-act="dc-buy"]').tap();
  s = await state();
  assert.equal(s.shop.coins, coins - 300);
  assert.equal(on(s, "wall"), "sprig");
  assert.equal(await page.locator('.evening .sw[data-id="sprig"].on').count(), 1);

  // A prize not won yet points at its goal; a piece too dear says how far off it is.
  await page.locator('.evening .sw[data-id="cat"]').tap();
  assert.match(
    await page.locator('.evening .dspot[data-spot="sill"] .dline').innerText(),
    /Win it: delight 300/,
  );
  await page.evaluate(() => {
    const st = structuredClone(window.__ferment.state);
    st.shop.coins = 50;
    window.__ferment.state = st;
  });
  if (await page.locator(".evening").isHidden())
    await page.locator('.actions [data-act="evening"]').tap();
  await tab("decor");
  await page.locator('.evening .sw[data-id="fairy"]').tap();
  assert.match(
    await page.locator('.evening .dspot[data-spot="garland"] .dline button').innerText(),
    /550 more to go/,
  );
  assert.ok(await page.locator('.evening .dspot[data-spot="garland"] .dline button').isDisabled());

  // Owned pieces swap for free, the starting one included.
  await page.locator('.evening .sw[data-id="plain"]').tap();
  assert.equal(on(await state(), "jars"), "plain");
  await page.locator('.evening .sw[data-id="gold"]').tap();
  assert.equal(on(await state(), "jars"), "gold");
  await page.evaluate(() => (document.querySelector(".evening .scroll").scrollTop = 0));
  await snap("3-decor");

  // The shop wears it: the back wall, the dressed jars.
  await page.locator('.evening .top [data-act="eve-close"]').tap();
  const look = await page.evaluate(() => {
    const app = document.querySelector(".app");
    return {
      panel: app.style.getPropertyValue("--panel"),
      paper: app.style.getPropertyValue("--paper"),
      jar: document.querySelector(".shelf .slot svg.jar")?.outerHTML ?? "",
    };
  });
  assert.equal(look.panel, "#f4e6dc");
  assert.match(look.paper, /^url\(/);
  assert.match(look.jar, /#d9b864/, "jars wear the gold ribbon");
  await snap("4-shop");
  return "pride claimed, wall bought, jars swapped";
}
