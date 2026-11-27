// Saving: a day played and slept on comes back after a reload; a save from an
// earlier build still opens and plays; rubbish in storage never breaks the title.
import { readFileSync } from "node:fs";
import { SEL, KEY } from "../helpers.mjs";
import { dayOne } from "../positions.mjs";

export const name = "save";

// A save "from an earlier build": the sim bot's game on a summer morning,
// taken from today's build (positions(1).summer), with two slices deleted
// (workshop, regulars) and a dozen fields (stock.syrup, .remedy, .waxBits;
// market.fair, .show; progress.almanac, .yearsSeen; keeper.glasses, .beard;
// hives.spare; every hive's dusted, hungry, raid). Kept as a file on purpose:
// it must go on opening as the game moves on.
const OLD = JSON.parse(readFileSync(new URL("../fixtures/old-save.json", import.meta.url), "utf8"));

const part = (s) => ({
  clock: s.clock,
  keeper: s.keeper,
  land: s.land,
  hives: s.hives,
  stock: s.stock,
});

export async function run(t) {
  // Day 1, quickly: a bed planted, the day started by its button and flown by
  // the hook, a jar taken and sold to the grocer, the stall skipped, sleep.
  await t.boot();
  await t.seed(dayOne(7, "Sari"));
  const [bx, by] = (await t.squares("home", "plant:dandelion"))[0];
  await t.dispatch({ type: "plant", plot: "home", x: bx, y: by, flower: "dandelion" });
  await t.tap(SEL.act("start"));
  await t.until(() => window.__hollow.state.clock.phase === "day", null, "the day to start");
  await t.flyToEvening();
  let s = await t.state();
  await t.dispatch({ type: "harvest", hive: s.hives.list[0].id, jars: 1 });
  s = await t.state();
  await t.dispatch({
    type: "sellToGrocer",
    product: `honey:${Object.keys(s.stock.honey)[0]}`,
    n: 1,
  });
  await t.skipAndSleep();
  const before = await t.state();
  t.eq([before.clock.day, before.clock.phase], [2, "morning"], "the morning after day 1");

  // Close the app and open it: Continue, and the same morning.
  await t.reload();
  await t.scene("title");
  const go = t.loc(SEL.act("continue"));
  t.expect(await go.isVisible(), "no Continue on the title after a day was played");
  const title = await t.text(SEL.scene("title"));
  t.expect(
    title.includes("Sari") && /day 2\b/.test(title),
    `the title does not say whose game and which day: "${title.slice(0, 120)}"`,
  );
  await t.snap("continue");
  await t.tap(go);
  await t.scene("meadow");
  const after = await t.state();
  t.eq(after.purse.coins, before.purse.coins, "the coins after Continue");
  t.eq(after.land, before.land, "the beds after Continue");
  t.eq(after.hives, before.hives, "the hives after Continue");
  t.eq(part(after), part(before), "the game after Continue");
  await t.snap("resumed");

  // A save from an earlier build: it opens, the missing parts are there, and it plays a day.
  await t.profile({ [KEY.save]: JSON.stringify(OLD) });
  await t.boot();
  await t.scene("title");
  await t.tap(SEL.act("continue"));
  await t.scene("meadow");
  s = await t.state();
  t.eq(
    [s.clock.day, s.keeper.name, s.purse.coins],
    [OLD.clock.day, OLD.keeper.name, OLD.purse.coins],
    "the old save, opened",
  );
  t.expect(
    s.workshop?.made && s.regulars?.hearts,
    "the slices the old save lacked were not filled in",
  );
  t.expect(
    s.hives.list.every((h) => "dusted" in h && "raid" in h) &&
      "spare" in s.hives &&
      "syrup" in s.stock,
    "the fields the old save lacked were not filled in",
  );
  await t.tap(SEL.act("start"));
  await t.until(
    () => window.__hollow.state.clock.phase !== "morning",
    null,
    "the old save's day to start",
  );
  await t.flyToEvening();
  await t.skipAndSleep();
  t.eq(
    (await t.state()).clock.day,
    OLD.clock.day + 1,
    "the day after a day played on the old save",
  );
  await t.snap("old-save-next-day");

  // Rubbish in storage: the title comes up all the same, offering a new game.
  const rubbish = [
    { [KEY.save]: "{ not json at all" },
    {
      [KEY.save]: JSON.stringify({ hello: "there", clock: 3 }),
      [KEY.settings]: JSON.stringify({ sound: "loud", motion: 7, speed: null, notes: "none" }),
    },
    {
      [KEY.save]: JSON.stringify({
        ...OLD,
        land: { plots: { home: { squares: "gone" } } },
        hives: { list: 5 },
      }),
      [KEY.settings]: "[[[",
    },
  ];
  for (const [i, entries] of rubbish.entries()) {
    await t.profile(entries);
    await t.boot();
    await t.scene("title");
    t.expect(
      await t.visible(SEL.act("new")),
      `rubbish ${i + 1} in storage: the title has no New game`,
    );
    t.expect(
      !(await t.visible(SEL.act("continue"))),
      `rubbish ${i + 1} in storage: the title offers to continue it`,
    );
    t.expect(
      (await t.state()).keeper.made === false,
      `rubbish ${i + 1} in storage: not a fresh game`,
    );
    if (i)
      t.eq(
        await t.stored(KEY.broken),
        JSON.parse(entries[KEY.save]),
        `rubbish ${i + 1}: the save that would not open, put aside`,
      );
  }
  await t.snap("after-rubbish");
  await t.tap(SEL.act("new"));
  await t.scene("intro");
  return `day 2 came back after a reload with ${before.purse.coins} coins; a day-${OLD.clock.day} save without two slices played on; three kinds of rubbish left the title standing`;
}

export const fault = {
  what: "five coins are added to every save as it is written",
  expect: /the coins after Continue/,
  install: (page) =>
    page.addInitScript(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (String(key).endsWith(":honey-hollow:save")) {
          try {
            const s = JSON.parse(value);
            s.purse.coins += 5;
            value = JSON.stringify(s);
          } catch {}
        }
        return real.call(this, key, value);
      };
    }),
};
