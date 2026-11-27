// A whole year, at a run: a day in each season's meadow, a winter day, the
// Honey Show, the Winter Fair, the last night, the year page, and spring of
// year 2. The positions are the sim bot's own game; between them the flow
// starts days, skips or plays the stall and sleeps by the buttons, and flies
// the hours through the hook.
import { SEL, NAME } from "../helpers.mjs";
import { positions, C } from "../positions.mjs";

export const name = "year";

const cap = (w) => w[0].toUpperCase() + w.slice(1);

export async function run(t) {
  const P = positions();
  await t.boot();

  // ── Spring, summer, autumn: the meadow of the season, and a day through to the next morning.
  for (const season of ["spring", "summer", "autumn"]) {
    const cal = C.calendarOf(P[season].clock.day);
    await t.seed(P[season]);
    await t.saysDay(season, cal.dayOfSeason);
    await t.snap(season);
    await t.tap(SEL.act("start"));
    await t.until(
      () => window.__hollow.state.clock.phase !== "morning",
      null,
      `the ${season} day to start`,
    );
    await t.flyToEvening();
    await t.skipAndSleep();
    const s = await t.state();
    t.eq(
      [s.clock.day, s.clock.phase],
      [cal.day + 1, "morning"],
      `the morning after a ${season} day`,
    );
  }

  // ── Winter: no flying. The button goes straight to the evening.
  const winter = C.calendarOf(P.winter.clock.day);
  await t.seed(P.winter);
  await t.saysDay("winter", winter.dayOfSeason);
  t.expect(
    /stall/i.test(await t.text(SEL.act("start"))),
    "in winter the big button does not go to the stall",
  );
  await t.snap("winter");
  await t.tap(SEL.act("start"));
  await t.until(() => window.__hollow.state.clock.phase === "evening", null, "the winter evening");
  await t.scene("stall");
  await t.finishStall();
  await t.sleep(winter.day);
  await t.saysDay("winter", winter.dayOfSeason + 1);

  // ── The Honey Show: a jar on the bench, a ribbon, the prize it says.
  await t.seed(P.show);
  await t.tap(SEL.act("stall"));
  await t.scene("stall");
  await t.page.locator(SEL.showPhase("bench")).waitFor();
  let before = await t.state();
  await t.tap(t.page.locator(SEL.shelfItem).first(), "a jar for the bench");
  await t.snap("show-bench");
  await t.tap(t.button(NAME.enter, SEL.scene("stall")), "Enter the show");
  await t.until(() => window.__hollow.state.market.show?.entered === true, null, "the judging");
  await t.page.locator(SEL.showPhase("results")).waitFor();
  let s = await t.state();
  const entries = s.market.show.entries;
  const prize = entries.reduce((a, e) => a + e.coins, 0);
  t.expect(
    entries.length === 1 && entries[0].medal,
    `one jar entered, and the judges gave: ${JSON.stringify(entries)}`,
  );
  t.eq(s.purse.coins - before.purse.coins, prize, "coins from the show against its prize money");
  t.eq(s.progress.ribbons.length, before.progress.ribbons.length + 1, "ribbons after the show");
  const results = await t.text(SEL.showPhase("results"));
  t.expect(
    results.includes(String(prize)) && new RegExp(entries[0].medal, "i").test(results),
    `the results do not show the ${entries[0].medal} ribbon and its ${prize} coins: "${results.slice(0, 160)}"`,
  );
  await t.snap("show-ribbons");
  await t.tap(t.button(NAME.onToStall, SEL.scene("stall")), "On to the stall");
  await t.until(
    () => window.__hollow.state.market.open === true,
    null,
    "the stall to open after the show",
  );
  await t.finishStall();

  // ── The Winter Fair: its card, then a sale at the price on the button.
  await t.seed(P.fair);
  await t.tap(SEL.act("stall"));
  await t.scene("stall");
  await t.page.locator(SEL.fairCard).waitFor();
  await t.snap("fair");
  await t.tap(t.button(NAME.openStall, SEL.scene("stall")), "Open the stall");
  await t.until(() => window.__hollow.state.market.open === true, null, "the fair's stall to open");
  s = await t.state();
  t.expect(
    s.market.fair === true && s.market.queue.length >= 5,
    `the fair has ${s.market.queue.length} visitors (fair: ${s.market.fair})`,
  );
  await t.page.locator(SEL.shelfItem).first().waitFor();
  const fair = await t.sellOne();
  t.expect(
    fair.got === fair.shown,
    `at the fair the coins went up by ${fair.got}; the Offer button said ${fair.shown}`,
  );
  await t.snap("fair-sold");
  await t.finishStall();

  // ── The last night, the year page, and spring again.
  await t.seed(P.lastNight);
  before = await t.state();
  await t.tap(SEL.act("skip"));
  await t.scene("night");
  await t.snap("last-night");
  await t.sleep(before.clock.day, "year");
  const cover = await t.text(SEL.scene("year"));
  t.expect(
    cover.includes(before.keeper.name) && /year/i.test(cover),
    `the year page does not say whose year it was: "${cover.slice(0, 120)}"`,
  );
  await t.snap("year-page");
  const next = t.loc(SEL.yearNext);
  for (let i = 0; i < 6 && (await next.getAttribute("data-last")) !== "true"; i++) {
    const page = await t.text(SEL.scene("year"));
    await t.tap(next, "Turn the page");
    await t.until(
      ([sel, was]) => document.querySelector(sel)?.innerText.replace(/\s+/g, " ").trim() !== was,
      [SEL.scene("year"), page],
      "the year page to turn",
    );
  }
  const last = await t.text(SEL.scene("year"));
  t.expect(
    last.includes("An idea from Sari"),
    `“An idea from Sari” is not on the year page: "${last.slice(0, 160)}"`,
  );
  await t.snap("year-credits");
  await t.tap(next, "Carry on");
  await t.scene("meadow");
  s = await t.state();
  const now = C.calendarOf(s.clock.day);
  t.eq(
    [now.year, now.season, now.dayOfSeason, s.clock.phase],
    [2, 0, 1, "morning"],
    "where “Carry on” leaves you",
  );
  t.eq(s.progress.yearsSeen, 1, "years seen after the year page");
  await t.saysDay("spring", 1);
  await t.tap(SEL.act("calendar"));
  await t.sheet("calendar");
  t.expect(/year 2/i.test(await t.text(SEL.sheetTitle)), "the calendar does not say Year 2");
  await t.snap("year-2");
  await t.closeSheet("escape");
  return `a day in ${["spring", "summer", "autumn", "winter"].map(cap).join(", ")}; ${entries[0].medal} at the show for ${prize}; a fair sale for ${fair.shown}; the year page, then spring of year 2 (day ${s.clock.day})`;
}

export const fault = {
  what: "the credit line loses its name on the way to the phone",
  expect: /“An idea from Sari” is not on the year page/,
  install: (page) =>
    page.route("**/games/honey-hollow/ui/words**", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll("An idea from Sari", "An idea");
      await route.fulfill({ response, body });
    }),
};
