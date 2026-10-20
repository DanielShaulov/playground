// Phone flow: a brand-new shop, as a player first sees it. The intro scene,
// then the keeper's notes through the first day's moments by real taps:
// the parting jars, starting a jar, the first serve (with the clock held
// while the note is up), the first evening's market, the bench on day 2,
// "No more notes", and replaying it all from the start.
import assert from "node:assert/strict";

export const name = "intro";
/** This flow wants the player's start, not the plain shop the other flows get. */
export const page = "";

export async function run(page, snap) {
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__ferment.state)));
  const tip = () => page.evaluate(() => window.__ferment.core.tipNow(window.__ferment.state));
  const note = page.locator(".tip-note");
  const noteSays = async (re) => {
    await page.waitForFunction(
      (src) =>
        new RegExp(src).test(
          document.querySelector(".tip-note:not([hidden]) p")?.textContent ?? "",
        ),
      re.source,
    );
  };

  // The intro: three pictures, then the door opens on day 1.
  const intro = page.locator(".intro");
  await intro.waitFor();
  await snap("1-street");
  await page.locator('[data-act="intro-next"]').tap();
  await snap("2-letter");
  await page.locator('[data-act="intro-next"]').tap();
  await snap("3-inside");
  await page.locator('[data-act="intro-next"]').tap();
  await intro.waitFor({ state: "hidden" });
  let s = await state();
  assert.equal(s.clock.day, 1);
  assert.equal(s.shelf.slots.filter(Boolean).length, 2, "two parting jars, the rest empty");

  // The parting jars.
  await noteSays(/ripe/);
  await snap("4-gift-note");
  await page.locator('[data-act="tip-next"]').tap();

  // Starting a jar: the note follows the empty spot, the sheet, the new jar, the sign.
  await noteSays(/empty spot/);
  await page.locator("#shelf .slot.empty").first().tap();
  await noteSays(/Pick one/);
  await snap("5-brew-sheet-note");
  await page.locator('.recipe[data-recipe="dill"]').tap();
  await noteSays(/crisp/);
  await snap("6-new-jar-note");
  await page.locator('[data-act="tip-next"]').tap();
  await noteSays(/sign/);
  await page.locator('[data-act="open"]').tap();

  // Day 1's scripted customers. First: a jar on the shelf fits right now.
  const nextCustomer = (as) =>
    page.waitForFunction((want) => window.__ferment.state.customers.queue[0]?.script === want, as, {
      timeout: 30000,
    });
  await nextCustomer("serve");
  await noteSays(/knows what they like/);
  const hour = (await state()).clock.hour;
  await page.waitForTimeout(1200);
  assert.equal((await state()).clock.hour, hour, "the clock waits while a note is up");
  await snap("7-serve-note");
  await page.locator('[data-act="tip-next"]').tap();
  await noteSays(/inside the box/);
  assert.ok((await page.locator("#shelf .slot.fits").count()) > 0, "a jar fits the first customer");
  await page.locator("#shelf .slot.fits").first().tap();
  await noteSays(/Hand it over/);
  await snap("8-hand-over");
  await page.locator('[data-act="serve"]').tap();
  await noteSays(/tip/);
  await page.locator('[data-act="tip-next"]').tap();

  // Second: wants it riper; a pre-order, kept from the jar started this morning.
  await nextCustomer("keep");
  await noteSays(/riper than anything/);
  await page.locator('[data-act="tip-next"]').tap();
  await noteSays(/pre-order/);
  await snap("9-keep-preorder");
  await page.locator('[data-act="preorder"]').tap();
  await page.waitForTimeout(1700); // the customer walks out
  const ticket = async () => {
    const t = await tip();
    // The pre-order may open the planner straight away; otherwise tap the ticket.
    if (t.point === "ticket") {
      await snap(`${t.id}-ticket`);
      await page.locator(`#board [data-act="order"][data-order="${t.order}"]`).tap();
    }
  };
  await noteSays(/board|Keep a portion/);
  await ticket();
  await noteSays(/Keep a portion back/);
  await snap("10-keep-planner");
  await page.locator('.sheet.plan [data-act="board-hold"]').tap();
  await noteSays(/spoken for/);
  await snap("11-kept");
  s = await state();
  const kept = s.orders.list.find((o) => o.jars?.length);
  assert.ok(kept, "a portion was kept for the second customer");
  await page.locator('[data-act="tip-next"]').tap();

  // Third: nothing on the shelf will do; a pre-order and a new jar.
  await nextCustomer("fresh");
  await noteSays(/Nothing on the shelf/);
  await page.locator('[data-act="tip-next"]').tap();
  await noteSays(/pre-order all the same/);
  await page.locator('[data-act="preorder"]').tap();
  await page.waitForTimeout(1700);
  await noteSays(/board|new jar/);
  await ticket();
  await noteSays(/Start a new jar/);
  await snap("12-fresh-planner");
  const jars = (await state()).shelf.slots.filter(Boolean).length;
  await page.locator('.sheet.plan [data-act="board-start"]').tap();
  await noteSays(/theirs/);
  await snap("13-fresh-jar");
  assert.equal((await state()).shelf.slots.filter(Boolean).length, jars + 1, "a new jar went on");
  await page.locator('[data-act="tip-next"]').tap();
  await note.waitFor({ state: "hidden" });

  // The first evening: the market.
  await page.evaluate(() => window.__ferment.dispatch({ type: "close" }));
  await noteSays(/market/);
  await snap("14-market-note");
  await page.locator('.evening .tab[data-tab="market"]').tap();
  await noteSays(/Add-ins/);
  await page.locator('[data-act="tip-next"]').tap();
  await note.waitFor({ state: "hidden" });

  // Day 2's evening: the bench.
  await page.locator('[data-act="sleep"]').tap();
  await page.evaluate(() => {
    const f = window.__ferment;
    f.dispatch({ type: "open" });
    f.dispatch({ type: "close" });
  });
  await noteSays(/bench/);
  await page.locator('.evening [data-act="bench"]').tap();
  await noteSays(/pantry into the mix/);
  await snap("15-bench-note");

  // No more notes: they stop, and the clock runs again.
  await page.locator('[data-act="tip-skip"]').tap();
  await note.waitFor({ state: "hidden" });
  s = await state();
  assert.equal(s.tutorial.on, false);

  // Replay from the settings sheet: the intro comes back.
  await page.locator('.bench [data-act="bench-close"]').first().tap();
  await page.locator('.evening [data-act="eve-close"]').first().tap();
  await page.locator('.app > .top [data-act="settings"]').tap();
  await page.locator('[data-act="set-intro"]').tap();
  await intro.waitFor();
  await page.locator('[data-act="intro-skip"]').tap();
  await intro.waitFor({ state: "hidden" });
  s = await state();
  assert.equal(s.tutorial.on, true);
  assert.equal(s.tutorial.intro, false);
  return `served, kept and started a jar on day 1, ${s.tutorial.done.length} notes done after replay`;
}
