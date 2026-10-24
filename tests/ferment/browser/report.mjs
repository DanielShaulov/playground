// Phone flow: Settings → Report a problem (ui/report.js). The sheet gets the
// report ready, keeps what the player types, and Write the email opens a
// mailto: link to the reports address with a "[Ferment report]" subject, the
// note, and a report code. The code read back holds the shop, and replaying
// its trail lands exactly on that shop. The trail survives a reload, and a
// second report after it still replays.
// Depends on window.__ferment, window.__fermentReport (open is swapped so the
// page never leaves for a mail app) and data-act.
import assert from "node:assert/strict";

export const name = "report";

export async function run(page, snap) {
  const tap = (sel) => page.locator(sel).first().tap();
  const send = page.locator('[data-act="set-report-send"]');

  /** Open the report view, type a note, send, and read back what the mail app would get. */
  async function report(note) {
    await page.evaluate(() => {
      window.__fermentReport.open = () => {};
      window.__fermentReport.lastMail = "";
    });
    await tap('.top [data-act="settings"]');
    await tap('[data-act="set-report"]');
    await page.locator(".report-note").fill(note);
    await page.waitForTimeout(500); // the report lands and the sheet redraws meanwhile
    assert.equal(
      await page.locator(".report-note").inputValue(),
      note,
      "typing survives the sheet getting ready",
    );
    await send.tap();
    await page.waitForFunction(() => window.__fermentReport.lastMail);
    return page.evaluate(async () => {
      const url = new URL(window.__fermentReport.lastMail);
      const body = url.searchParams.get("body");
      const { decodeReport, replayReport } = await import(
        new URL("./ui/report-code.js", location.href).href
      );
      const r = await decodeReport(body);
      const live = JSON.parse(JSON.stringify(window.__ferment.state));
      return {
        to: url.pathname,
        subject: url.searchParams.get("subject"),
        body,
        actions: r.actions.length,
        types: r.actions.map((a) => a.type),
        matches: replayReport(r, window.__ferment.core.step).matches,
        nowIsLive: JSON.stringify(r.now) === JSON.stringify(live),
        sha: r.build.sha,
        taps: r.taps.map((t) => t.act),
      };
    });
  }

  // Play a little: open the shop, let the clock run, send someone away.
  await tap('[data-act="open"]');
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__ferment.dispatch({ type: "sendAway" }));
  await page.waitForTimeout(600);

  const r = await report("The jar vanished after I tipped it out");
  assert.equal(r.to, "daniel.shaulov+ferment@gmail.com");
  assert.equal(r.subject, "[Ferment report] The jar vanished after I tipped it out");
  assert.match(r.body, /^The jar vanished after I tipped it out\r\n/);
  assert.match(r.body, /FERMENT-REPORT1\.[zj]\./);
  assert.equal(r.sha, "dev", "build.json from the repo");
  assert.ok(r.types.includes("open") && r.types.includes("tick"), `trail: ${r.types}`);
  assert.equal(r.matches, true, "replaying the trail lands on the reported shop");
  assert.equal(r.nowIsLive, true);
  assert.deepEqual(r.taps.slice(-3), ["open", "settings", "set-report"]);
  assert.equal(
    await page.locator('[data-act="set-report-copy"]').count(),
    1,
    "a way out when no mail app opens",
  );
  await snap("1-sent");

  // The trail is saved with the shop: after a reload a new report still replays.
  await tap('[data-act="set-back"]');
  await tap('[data-act="set-close"]');
  await page.reload();
  await page.waitForTimeout(800);
  const again = await report("");
  assert.equal(again.subject, "[Ferment report] (no description)");
  assert.ok(again.actions >= r.actions, "the trail carried on after the reload");
  assert.equal(again.matches, true);
  return `${r.actions} actions in the first report, replay matches`;
}
