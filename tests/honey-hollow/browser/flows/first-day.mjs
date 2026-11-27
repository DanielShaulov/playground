// A new player's first day, by the buttons a player sees: title, intro, make
// a beekeeper, the meadow, the bees' day (waited for, at the fast speed), a
// jar from the hive, a sale at the stall, the night card, and morning again.
import { SEL, NAME, KEY, jars } from "../helpers.mjs";

export const name = "first-day";
/** A new player's phone moves: this flow plays with every slide and fade on. */
export const motion = true;

const KEEPER = "Juniper";

export async function run(t) {
  await t.boot();
  await t.scene("title");
  t.expect(!(await t.visible(SEL.act("continue"))), "a new player is offered Continue");
  await t.snap("title");
  await t.tap(SEL.act("new"));

  // The intro: three cards, turned by hand.
  await t.scene("intro");
  await t.page.locator(SEL.introPage(1)).waitFor();
  await t.snap("intro");
  for (const n of [2, 3]) {
    await t.tap(t.button(NAME.turn, SEL.scene("intro")), "Turn the page");
    await t.page.locator(SEL.introPage(n)).waitFor();
  }
  await t.tap(t.button(NAME.makeKeeper, SEL.scene("intro")), "Make my beekeeper");

  // The beekeeper: another body, other hair, another hair colour, a name, a talent.
  const here = SEL.scene("creator");
  await t.scene("creator");
  await t.page.locator(`${here} ${SEL.keeperPainted}`).waitFor();
  const pick = async (tab, id) => {
    await t.tap(`${here} ${SEL.keeperTab(tab)}`);
    const choice = id
      ? t.page.locator(`${here} ${SEL.keeperChoice(tab, id)}`)
      : t.page.locator(`${here} ${SEL.keeperOther(tab)}`).first();
    const chosen = await choice.getAttribute("data-id");
    await t.tap(choice, `the ${tab} "${chosen}"`);
    await t.until(
      (sel) => !!document.querySelector(sel),
      `${here} ${SEL.keeperChoice(tab, chosen)}[aria-pressed="true"]`,
      `the ${tab} "${chosen}" to be chosen`,
    );
    return chosen;
  };
  const body = await pick("body", "man");
  const hair = await pick("hair");
  const hairColor = await pick("hairColor");
  await t.page.locator(`${here} ${SEL.keeperName}`).fill(KEEPER);
  await t.snap("creator");
  await t.tap(t.button(NAME.toTalent, here), "Next: a talent");
  const talent = t.page.locator(`${here} ${SEL.talents}`).nth(1);
  const talentId = await talent.getAttribute("data-talent");
  await t.tap(talent, "the second talent");
  await t.expect(
    (await talent.getAttribute("aria-checked")) === "true",
    "the talent tapped is not the one chosen",
  );
  await t.snap("talent");
  await t.tap(t.button(NAME.begin, here), "Begin");

  // The meadow, the first morning.
  await t.scene("meadow", 15000);
  let s = await t.state();
  t.eq(
    {
      made: s.keeper.made,
      name: s.keeper.name,
      body: s.keeper.body,
      hair: s.keeper.hair,
      hairColor: s.keeper.hairColor,
      talent: s.keeper.talent,
    },
    { made: true, name: KEEPER, body, hair, hairColor, talent: talentId },
    "the beekeeper is not the one made",
  );
  t.eq([s.clock.day, s.clock.phase], [1, "morning"], "the first morning");
  await t.saysDay("Spring", 1);
  const coins0 = s.purse.coins;
  await t.snap("morning");

  // The day: the bees fly by themselves. Fast, and waited for.
  await t.tap(SEL.act("start"));
  await t.until(() => window.__hollow.state.clock.phase === "day", null, "the day to start");
  await t.tap(SEL.act("speed-fast"));
  const tick = (await t.state()).clock.tick;
  await t.page.waitForTimeout(1500);
  t.expect(
    (await t.state()).clock.tick > tick,
    "the day does not pass by itself: no tick in a second and a half",
  );
  await t.snap("flying");
  await t.until(
    () => window.__hollow.state.clock.phase === "evening",
    null,
    "the sun to set",
    150000,
  );
  s = await t.state();
  t.eq(jars(s), 0, "jars in stock before any were taken");

  // The hive: tap its square, take what it has.
  const hive = s.hives.list[0];
  await t.tapSquare(hive.plot, hive.x, hive.y);
  await t.sheet("hive");
  const take = t.button(NAME.take, SEL.sheet);
  const taking = Number((await t.text(take)).match(/\d+/)[0]);
  await t.snap("hive");
  await t.tap(take, "Take jars");
  await t.until(
    (n) => Object.values(window.__hollow.state.stock.honey).reduce((a, b) => a + b, 0) === n,
    taking,
    `${taking} jar(s) in stock`,
  );
  if ((await t.ui()).sheet) await t.closeSheet("cross");

  // The stall: the first customer buys, for the price on the button.
  await t.tap(SEL.act("stall"));
  await t.scene("stall");
  await t.page.locator(SEL.shelfItem).first().waitFor();
  await t.snap("stall");
  const { shown, sale, got, after } = await t.sellOne();
  t.expect(got === shown, `the coins went up by ${got}; the Offer button said ${shown}`);
  t.eq(after.purse.coins, coins0 + shown, "coins after the first sale");
  t.eq(jars(after), taking - sale.n, "jars in stock after the sale");
  await t.snap("sold");
  await t.finishStall();

  // The night card, sleep, and the second morning.
  s = await t.state();
  const night = await t.text(SEL.scene("night"));
  t.expect(
    night.includes(`+${s.purse.today.earned}`),
    `the night card does not show the +${s.purse.today.earned} coins earned: "${night.slice(0, 160)}"`,
  );
  await t.snap("night");
  await t.sleep(1);
  s = await t.state();
  t.eq([s.clock.day, s.clock.phase], [2, "morning"], "the second morning");
  await t.saysDay("Spring", 2);
  await t.snap("morning-2");

  // The save has it all: the day, and whose meadow it is.
  await t.until(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.clock?.day === 2,
    KEY.save,
    "day 2 to be saved",
  );
  const saved = await t.stored(KEY.save);
  t.eq(saved.keeper.name, KEEPER, "the keeper's name in the save");
  t.eq(saved.purse.coins, s.purse.coins, "the coins in the save");
  return `${KEEPER} took ${taking} jar, sold ${sale.n} for ${shown} and woke on day 2 with ${s.purse.coins} coins`;
}

export const fault = {
  what: "the Offer button promises one coin more than the sale pays",
  expect: /the coins went up by \d+; the Offer button said \d+/,
  install: (page) =>
    page.addInitScript(() => {
      new MutationObserver(() => {
        for (const b of document.querySelectorAll("button")) {
          const words = () => b.textContent.replace(/\s+/g, " ").trim();
          const m = /^Offer ?(\d+)$/.exec(words());
          if (!m || b.dataset.lie === words()) continue;
          const texts = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
          let number = null;
          for (let n = texts.nextNode(); n; n = texts.nextNode()) if (/\d/.test(n.data)) number = n;
          number.data = number.data.replace(/\d+/, String(Number(m[1]) + 1));
          b.dataset.lie = words();
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    }),
};
