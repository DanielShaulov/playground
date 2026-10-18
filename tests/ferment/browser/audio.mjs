// Phone flow: sound and haptics. No AudioContext exists until the first tap;
// a day with sound on plays sounds (and buzzes where navigator.vibrate exists);
// the Sound switch in the settings sheet mutes both, the choice survives a reload, and a muted
// page never opens audio at all. Every sound in content/sounds.js builds
// cleanly (finite samples, no clipping, short). Runs without vibrate too, as
// on iOS Safari. Depends on window.__ferment, window.__fermentAudio and the
// the settings sheet's data-act="set-sound" switch.
import assert from "node:assert/strict";

export const name = "audio";

export async function run(page, snap) {
  // Count AudioContexts, started sounds and vibrate calls from outside the game.
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__ac = { made: 0, starts: 0, buzz: [], list: [] };
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      constructor(...a) {
        super(...a);
        w.__ac.made++;
        w.__ac.list.push(this);
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      w.__ac.starts++;
      return start.apply(this, a);
    };
    if (sessionStorage.getItem("noVibrate")) delete Navigator.prototype.vibrate;
    else navigator.vibrate = (p) => (w.__ac.buzz.push(p), true);
  });
  await page.reload();
  const ac = () =>
    page.evaluate(() => ({
      ...window.__ac,
      list: undefined,
      played: window.__fermentAudio.played,
    }));
  // The Sound switch lives in the settings sheet (gear in the top bar).
  const sound = async (v) => {
    await page.locator('.top [data-act="settings"]').tap();
    await page.locator(`[data-act="set-sound"][data-v="${v}"]`).tap();
    const on = await page
      .locator('[data-act="set-sound"][aria-pressed="true"]')
      .getAttribute("data-v");
    await page.locator('[data-act="set-close"]').tap();
    return on;
  };
  const muted = () => page.evaluate(() => window.__fermentAudio.muted);
  const dayPasses = () =>
    page.evaluate(() => {
      const f = window.__ferment;
      for (let i = 0; i < 40 && f.state.clock.phase === "open"; i++)
        f.dispatch({ type: "tick", n: f.core.STEPS_PER_HOUR / 2 });
    });

  // Nothing opens audio before a tap.
  await page.waitForTimeout(400);
  let a = await ac();
  assert.equal(a.made, 0, "no AudioContext before the first tap");
  assert.equal(await muted(), false);

  // Every sound builds cleanly.
  const bad = await page.evaluate(async () => {
    const { ZZFX } = await import("/games/ferment/vendor/zzfx.js");
    const { SOUNDS } = await import("/games/ferment/content/sounds.js");
    const out = [];
    for (const [id, s] of Object.entries(SOUNDS))
      for (const [at, zz] of s.notes) {
        const b = ZZFX.buildSamples(...zz);
        let peak = 0;
        for (const v of b) peak = Math.max(peak, Math.abs(v));
        const secs = at + b.length / ZZFX.sampleRate;
        if (!b.length || !(peak <= 1) || secs > 2.5) out.push(`${id}: peak ${peak}, ${secs}s`);
      }
    return out;
  });
  assert.deepEqual(bad, [], "sounds must be short and unclipped");

  // First tap (starting a jar) opens audio; opening the shop rings the bell.
  const s = await page.evaluate(() => window.__ferment.state);
  const empty = s.shelf.slots.findIndex((j) => !j);
  await page.locator(`.slot[data-slot="${empty}"]`).tap();
  await page.locator('.recipe[data-recipe="kimchi"]').tap();
  a = await ac();
  assert.equal(a.made, 1, "one AudioContext after the first tap");
  assert.equal(
    await page.evaluate(() => window.__ac.list[0].state),
    "running",
    "audio runs after a tap",
  );
  await page.locator('[data-act="open"]').tap();
  const atOpen = (await ac()).played;
  assert.ok(atOpen >= 1, "the shop bell rings at opening");
  await snap("1-sound-on");

  // The day plays out with sound: customers arrive, the shop closes.
  await dayPasses();
  a = await ac();
  assert.ok(a.played > atOpen, `a day with sound plays sounds (${a.played})`);
  assert.ok(a.starts > a.played, "sounds reach the speaker");
  // A delighted customer buzzes; a sound with no buzz does not.
  await page.evaluate(async () => {
    const m = await import("/games/ferment/ui/audio.js");
    window.__ac.buzz.length = 0;
    m.play("delight");
    m.play("ok");
  });
  assert.deepEqual((await ac()).buzz, [[12]]);

  // Mute: the button says so, nothing more plays or buzzes, the day goes on.
  await page.locator('[data-act="sleep"]').tap();
  assert.equal(await sound("off"), "off");
  assert.equal(await muted(), true);
  await snap("2-muted");
  const quiet = await ac();
  await page.locator('[data-act="open"]').tap();
  await dayPasses();
  await page.evaluate(async () => (await import("/games/ferment/ui/audio.js")).play("delight"));
  a = await ac();
  assert.equal(a.played, quiet.played, "muted plays nothing");
  assert.equal(a.starts, quiet.starts, "muted starts no sound");
  assert.equal(a.buzz.length, quiet.buzz.length, "muted does not buzz");
  assert.equal(await page.evaluate(() => window.__ferment.state.clock.phase), "evening");

  // The choice survives a reload, and a muted page never opens audio, even on a tap.
  await page.evaluate(() => sessionStorage.setItem("noVibrate", "1"));
  await page.reload();
  await page.locator('[data-act="sleep"]').tap();
  assert.equal(await muted(), true);
  assert.equal((await ac()).made, 0, "muted: no AudioContext");

  // Unmuting is a tap, so it opens audio; with no vibrate (iOS) nothing breaks.
  assert.equal(await page.evaluate(() => typeof navigator.vibrate), "undefined");
  assert.equal(await sound("on"), "on");
  assert.equal(await muted(), false);
  await page.locator('[data-act="open"]').tap();
  await page.evaluate(async () => (await import("/games/ferment/ui/audio.js")).play("tierUp"));
  a = await ac();
  assert.equal(a.made, 1);
  assert.ok(a.played >= 2, "sound back on after unmuting");
  return `sounds played, mute persisted, ${a.made} context after tap`;
}
