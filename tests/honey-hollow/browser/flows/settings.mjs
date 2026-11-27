// Settings: sound off, reduced motion, the day speed, a backup code out and
// back in on a fresh profile, and "Start again", which asks twice.
import { SEL, KEY } from "../helpers.mjs";
import { positions } from "../positions.mjs";

export const name = "settings";
/** The motion switch only means something on a phone that has not asked for stillness itself. */
export const motion = true;

const part = (s) => ({
  clock: s.clock,
  keeper: s.keeper,
  coins: s.purse.coins,
  land: s.land,
  hives: s.hives,
  stock: s.stock,
});
const motionNow = (t) => t.in(() => document.documentElement.dataset.motion);
/** How many bees are in the air over the meadow (the game's own probe). */
const beesOut = (t) => t.in(() => window.__hollow.meadow.beesOut());
async function fromMore(t) {
  await t.tap(SEL.act("more"));
  await t.sheet("more");
  await t.tap(SEL.more("settings"));
  await t.sheet("settings");
}
async function flip(t, key, to) {
  const sw = t.loc(SEL.setting(key));
  t.eq(await sw.getAttribute("aria-checked"), String(!to), `the ${key} switch before it is tapped`);
  await t.tap(sw);
  await t.until(
    ([sel, want]) => document.querySelector(sel)?.getAttribute("aria-checked") === want,
    [SEL.setting(key), String(to)],
    `the ${key} switch to turn`,
  );
}

export async function run(t) {
  const game = positions().flying;

  // ── From the title: sound off, fast days.
  await t.boot();
  await t.scene("title");
  await t.tap(SEL.act("settings"));
  await t.sheet("settings");
  await flip(t, "sound", false);
  t.eq((await t.settings()).sound, false, "the sound setting, switched off");
  t.eq(await t.in(() => window.__hollowAudio?.muted), true, "the audio engine, muted");
  await t.tap(SEL.speed("fast"));
  t.eq((await t.settings()).speed, "fast", "the day speed, set to fast");
  await t.snap("settings");
  await t.closeSheet("cross");

  // ── On the meadow, mid-day, bees in the air: reduced motion stills it.
  await t.seed(game);
  t.eq(await motionNow(t), "full", "the page's data-motion before the switch");
  await t.tap(SEL.act("start"));
  await t.until(() => window.__hollow.state.clock.phase === "day", null, "the day to start");
  t.eq(
    await t.loc(SEL.act("speed-fast")).getAttribute("aria-pressed"),
    "true",
    "the day's speed toggle after choosing fast days in settings",
  );
  await t.until(
    () => window.__hollow.meadow.beesOut() > 0,
    null,
    "bees to fly out over the meadow",
    15000,
  );
  const moving = await beesOut(t);
  await t.snap("bees-out");
  await fromMore(t);
  await flip(t, "motion", true);
  t.eq(await motionNow(t), "calm", "the page's data-motion with reduced motion on");
  t.eq((await t.settings()).motion, false, "the motion setting with reduced motion on");
  await t.closeSheet("escape");
  await t.page.waitForTimeout(600);
  const still = await beesOut(t);
  t.eq(still, 0, "bees still flying about with reduced motion on");
  await t.snap("calm-meadow");
  await t.flyToEvening();

  // ── All three are kept: close the app and open it.
  const before = await t.state();
  await t.reload();
  await t.scene("title");
  const kept = await t.settings();
  t.expect(kept.sound === false, `sound is back on after a reload (${JSON.stringify(kept)})`);
  t.eq(
    [kept.motion, kept.speed, await motionNow(t)],
    [false, "fast", "calm"],
    "motion and speed after a reload",
  );
  t.eq(await t.in(() => window.__hollowAudio?.muted), true, "the audio engine after a reload");

  // ── A backup code out…
  await t.tap(SEL.act("settings"));
  await t.sheet("settings");
  await t.tap(SEL.act("backup"));
  await t.until(
    (sel) => (document.querySelector(sel)?.value ?? "").length > 50,
    SEL.backupCode,
    "a backup code",
  );
  const code = await t.loc(SEL.backupCode).inputValue();
  await t.tap(SEL.act("copy"));
  const copied = await t.in(() => navigator.clipboard.readText().catch(() => null));
  if (copied !== null) t.eq(copied, code, "what “Copy” put on the clipboard");
  await t.snap("backup");

  // ── …and back in, on a phone that has never seen the game.
  await t.profile({});
  await t.boot();
  await t.scene("title");
  t.expect(!(await t.visible(SEL.act("continue"))), "a fresh profile is offered Continue");
  await t.tap(SEL.act("settings"));
  await t.sheet("settings");
  await t.tap(SEL.act("restore"));
  await t.loc(SEL.restoreCode).fill("this is not a backup code");
  await t.tap(SEL.act("restore-go"));
  await t.until(
    (sel) => (document.querySelector(sel)?.innerText ?? "").trim().length > 0,
    SEL.toasts,
    "a toast saying the code does not open",
  );
  t.eq(
    [(await t.state()).keeper.made, await t.confirms()],
    [false, 0],
    "the game after a code that is not one",
  );
  await t.loc(SEL.restoreCode).fill(code);
  await t.tap(SEL.act("restore-go"));
  const asks = await t.confirm(true);
  t.expect(
    asks.includes(before.keeper.name),
    `restoring does not say whose game the code holds: "${asks}"`,
  );
  await t.until(
    () => window.__hollow.state.keeper.made === true,
    null,
    "the backup to be restored",
  );
  if ((await t.ui()).sheet) await t.closeSheet("cross");
  await t.scene("title");
  const title = await t.text(SEL.scene("title"));
  t.expect(
    title.includes(before.keeper.name),
    `the title after a restore does not name ${before.keeper.name}: "${title.slice(0, 120)}"`,
  );
  await t.snap("restored");
  await t.tap(SEL.act("continue"));
  await t.scene("meadow");
  t.eq(part(await t.state()), part(before), "the game restored from its code");

  // ── Start again: asks twice, and means it.
  await fromMore(t);
  await t.tap(SEL.act("restart"));
  await t.confirm(false);
  t.eq(part(await t.state()), part(before), "the game after “no” to starting again");
  await t.tap(SEL.act("restart"));
  const first = await t.confirm(true);
  await t.page.locator(SEL.confirm).waitFor();
  t.eq(part(await t.state()), part(before), "the game after one “yes” to starting again");
  await t.snap("start-again-asks-twice");
  const second = await t.confirm(true);
  t.expect(first !== second, `starting again asks the same thing twice: "${first}"`);
  await t.until(
    () => window.__hollow.state.keeper.made === false && window.__hollow.state.clock.day === 1,
    null,
    "a new game",
  );
  await t.scene("title");
  t.expect(
    !(await t.visible(SEL.act("continue"))),
    "after starting again the title still offers Continue",
  );
  await t.until(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.keeper?.made !== true,
    KEY.save,
    "the old save to be gone from storage",
  );
  await t.tap(SEL.act("new"));
  await t.scene("intro");
  await t.snap("started-again");
  return `sound off and fast days kept over a reload; reduced motion took the ${moving} flying bees out of the air; a ${code.length}-letter backup code restored day ${before.clock.day} on a fresh profile; “Start again” asked twice and started again`;
}

export const fault = {
  what: "settings are never written to storage",
  expect: /sound is back on after a reload/,
  install: (page) =>
    page.addInitScript(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (!String(key).endsWith(":honey-hollow:settings")) real.call(this, key, value);
      };
    }),
};
