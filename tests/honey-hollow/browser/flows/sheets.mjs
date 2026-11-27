// Every sheet, opened from where a player opens it, on a mid-game morning:
// each shows something, scrolls inside itself, and closes by its cross, by
// the scrim and by Escape. Then the three small jobs done in sheets: claim a
// goal, read a new page of the bee book, make a candle.
import { SEL, NAME } from "../helpers.mjs";
import { positions } from "../positions.mjs";

export const name = "sheets";

export async function run(t) {
  // The bot's game on a morning with a goal met and a bee book page unread.
  // Wax for two candles is seeded through the hook.
  const start = positions().news;
  start.stock.wax = 4;
  await t.boot();
  await t.seed(start);
  const hive = start.hives.list[0];
  const bed = (await t.squares(hive.plot, "bed"))[0];
  const viaMore = (sheet) => async () => {
    await t.tap(SEL.act("more"));
    await t.sheet("more");
    await t.tap(SEL.more(sheet));
  };
  const OPEN = {
    seeds: () => t.tap(SEL.act("seeds")),
    hives: () => t.tap(SEL.act("hives")),
    hive: () => t.tapSquare(hive.plot, hive.x, hive.y),
    bed: () => t.tapSquare(hive.plot, ...bed),
    calendar: () => t.tap(SEL.act("calendar")),
    workshop: () => t.tap(SEL.act("workshop")),
    book: () => t.tap(SEL.act("book")),
    more: () => t.tap(SEL.act("more")),
    map: viaMore("map"),
    goals: viaMore("goals"),
    wardrobe: viaMore("wardrobe"),
    settings: viaMore("settings"),
  };

  const rolled = [];
  for (const [sheet, open] of Object.entries(OPEN)) {
    for (const how of ["cross", "scrim", "escape"]) {
      await open();
      await t.sheet(sheet);
      if (how === "cross") {
        // It shows something.
        const seen = await t.in(
          ([panel, body, title]) => {
            const b = document.querySelector(body);
            const r = b.getBoundingClientRect();
            return {
              title: document.querySelector(title)?.textContent.trim() ?? "",
              words: b.innerText.trim().length,
              pictures: b.querySelectorAll("canvas, img, svg").length,
              height: r.height,
              panel: document.querySelector(panel).getBoundingClientRect().height,
            };
          },
          [SEL.sheet, SEL.sheetBody(sheet), SEL.sheetTitle],
        );
        t.expect(seen.title, `the ${sheet} sheet has no title`);
        t.expect(
          seen.height > 60 && seen.words + seen.pictures > 3,
          `the ${sheet} sheet is empty: ${JSON.stringify(seen)}`,
        );
        await t.snap(sheet);
        // It scrolls inside itself (when there is more than fits), and the page stays put.
        const roll = await t.in((panel) => {
          let best = null;
          for (const el of document.querySelector(panel).querySelectorAll("*")) {
            if (
              !/auto|scroll/.test(getComputedStyle(el).overflowY) ||
              el.scrollHeight <= el.clientHeight + 40
            )
              continue;
            if (!best || el.clientHeight > best.clientHeight) best = el;
          }
          if (!best) return null;
          best.dataset.rolls = "1";
          const r = best.getBoundingClientRect();
          return {
            x: r.left + r.width / 2,
            top: r.top,
            bottom: Math.min(r.bottom, window.innerHeight),
          };
        }, SEL.sheet);
        if (roll) {
          await t.swipe(
            roll.x,
            roll.bottom - 30,
            Math.max(roll.top + 10, roll.bottom - 230),
            "[data-rolls]",
          );
          const moved = await t.in(() => ({
            inside: document.querySelector("[data-rolls]")?.scrollTop ?? 0,
            page: window.scrollY + document.documentElement.scrollTop,
          }));
          t.expect(moved.inside > 0, `a thumb dragged up the ${sheet} sheet does not scroll it`);
          t.expect(moved.page === 0, `dragging the ${sheet} sheet scrolled the page behind it`);
          await t.audit(`${sheet}, scrolled`);
          rolled.push(sheet);
        }
        t.eq(
          (await t.ui()).sheet,
          sheet,
          `the sheet that is up after scrolling the ${sheet} sheet`,
        );
      }
      await t.closeSheet(how);
    }
  }
  t.expect(
    rolled.includes("seeds"),
    `the seed tray, longer than any phone, was never scrolled (scrolled: ${rolled.join(", ") || "none"})`,
  );

  // ── Claim the goal that is ready.
  let s = await t.state();
  const goal = s.progress.ready[0];
  t.expect(goal, "the position has no goal ready to claim");
  await OPEN.goals();
  await t.sheet("goals");
  await t.tap(t.button(NAME.claim, SEL.sheetBody("goals")), "Claim");
  await t.until(
    (g) => window.__hollow.state.progress.claimed.includes(g),
    goal,
    `the goal “${goal}” to be claimed`,
  );
  t.expect(
    !(await t.state()).progress.ready.includes(goal),
    "a claimed goal is still ready to claim",
  );
  await t.snap("goal-claimed");
  await t.closeSheet("cross");

  // ── Read the new page: the Book button's badge counts down.
  s = await t.state();
  const fact = s.book.unread[0];
  const count = async () =>
    (await t.visible(SEL.badge("book"))) ? Number(await t.text(SEL.badge("book"))) : 0;
  const unread = await count();
  t.eq(unread, s.book.unread.length, "the Book button's badge against the pages unread");
  await OPEN.book();
  await t.sheet("book");
  if (!(await t.visible(SEL.factOpen(fact)))) {
    const topic = await t.in((f) => window.__hollow.core.FACTS[f]?.topic, fact);
    await t.tap(SEL.bookTopic(topic));
  }
  await t.tap(SEL.factOpen(fact));
  await t.until(
    (f) => !window.__hollow.state.book.unread.includes(f),
    fact,
    `the page “${fact}” to be read`,
  );
  t.expect(
    (await t.text(SEL.fact(fact))).length > 60,
    "the opened page of the bee book has nothing to read",
  );
  await t.snap("fact-read");
  await t.closeSheet("cross");
  t.eq(await count(), unread - 1, "the Book button's badge after reading one page");

  // ── Make a candle: wax goes, a candle comes.
  s = await t.state();
  await OPEN.workshop();
  await t.sheet("workshop");
  await t.tap(SEL.make("candle"));
  await t.until(
    (n) => (window.__hollow.state.stock.goods.candle ?? 0) === n + 1,
    s.stock.goods.candle ?? 0,
    "a candle in stock",
  );
  const wax = (await t.state()).stock.wax;
  t.expect(wax < s.stock.wax, `making a candle used no wax (${s.stock.wax} before, ${wax} after)`);
  await t.snap("candle-made");
  await t.closeSheet("escape");
  return `12 sheets opened and closed three ways (scrolled: ${rolled.join(", ")}); claimed “${goal}”, read “${fact}”, made a candle from ${s.stock.wax - wax} wax`;
}

export const fault = {
  what: "the Escape key never reaches the game",
  expect: /did not close by Escape/,
  install: (page) =>
    page.addInitScript(() => {
      window.addEventListener(
        "keydown",
        (e) => e.key === "Escape" && e.stopImmediatePropagation(),
        true,
      );
    }),
};
