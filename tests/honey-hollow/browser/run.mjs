// Phone flows and screenshot gallery for Honey Hollow.
// Run: npm run test:honey-hollow:browser
//
// Every flow plays on a small phone (320 × 568) and a large one (430 × 932),
// touch only, with each phone's safe areas. A flow fails on anything the game
// should have done and did not, and on any of these, on any screen it visits:
// a console error or warning, a page error, a failed request (or one that
// leaves this machine), the document wider than the screen, the page itself
// scrolling, a button under 44 × 44, anything to tap under a safe area.
// The shots land in tests/honey-hollow/browser/shots/ with an index.html to
// look through (CI uploads the folder as the "honey-hollow-shots" artifact).
//
//   FLOWS=meadow,year   just those flows
//   PHONES=small        just that phone
//   BREAK=1             the suite checks itself: each flow runs once with the
//                       one fault it names switched on, and must go red
//
// Chromium comes from $CHROMIUM, else /opt/pw-browsers/chromium (agent
// sessions), else Playwright's own lookup. Never run `playwright install`.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";
import { serve } from "./serve.mjs";
import { Kit } from "./helpers.mjs";
import * as firstDay from "./flows/first-day.mjs";
import * as save from "./flows/save.mjs";
import * as meadow from "./flows/meadow.mjs";
import * as sheets from "./flows/sheets.mjs";
import * as year from "./flows/year.mjs";
import * as settings from "./flows/settings.mjs";

const ALL = [firstDay, save, meadow, sheets, year, settings];
const only = process.env.FLOWS?.split(",");
const FLOWS = only ? ALL.filter((f) => only.includes(f.name)) : ALL;
const BREAK = !!process.env.BREAK;

// The two ends of what the game promises to fit, with the safe areas of the
// phones those sizes belong to (an iPhone SE; an iPhone 15 Pro Max).
const EVERY_PHONE = {
  small: { viewport: { width: 320, height: 568 }, safe: { top: 20, bottom: 0 } },
  large: { viewport: { width: 430, height: 932 }, safe: { top: 59, bottom: 34 } },
};
const wanted = BREAK ? ["small"] : (process.env.PHONES?.split(",") ?? Object.keys(EVERY_PHONE));
const PHONES = Object.fromEntries(wanted.map((p) => [p, EVERY_PHONE[p]]));
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));

const executablePath =
  process.env.CHROMIUM ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const started = Date.now();
if (!BREAK) {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
}
const server = await serve();
const browser = await chromium.launch({ executablePath });

async function play(flow, phone, fault) {
  const { viewport, safe } = PHONES[phone];
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: devices["iPhone 13"].userAgent,
    locale: "en-GB",
    // Still by default, so nothing is tapped mid-slide; a flow about a new
    // player or about the motion setting asks for a phone that moves.
    reducedMotion: flow.motion ? "no-preference" : "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const t = new Kit({
    page,
    phone,
    safe,
    base: server.url,
    flow: flow.name,
    shotsDir: BREAK ? null : SHOTS,
  });
  const began = Date.now();
  try {
    // The notch and the home bar: Chrome can pretend to have them.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safe }).catch(() => {
      // An old Chrome: play on, with no bars to keep clear of, and say so.
      t.safe = { top: 0, bottom: 0 };
      noBars = true;
    });
    if (fault) await fault.install(page, t);
    const note = await flow.run(t);
    await t.audit("the end");
    if (t.problems.length) throw new Error(`${note}\n  but:\n  - ${t.problems.join("\n  - ")}`);
    return { flow: flow.name, phone, ok: true, note, shots: t.shots, ms: Date.now() - began };
  } catch (e) {
    const where = await t.where();
    await t.snap("failed").catch(() => {});
    const also =
      t.problems.length && !String(e.message).includes("  but:")
        ? `\n  also:\n  - ${t.problems.join("\n  - ")}`
        : "";
    return {
      flow: flow.name,
      phone,
      ok: false,
      note: `${e.message ?? String(e)}${also}\n  on screen: ${where}`,
      shots: t.shots,
      ms: Date.now() - began,
    };
  } finally {
    await ctx.close();
  }
}

/** Run jobs a few at a time: the meadow is painted on the CPU, and four phones painting at once is plenty. */
async function pool(jobs, size) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}
const JOBS = Number(process.env.JOBS ?? 6);

let failed = false;
let noBars = false;
if (BREAK) {
  // A check never seen to fail proves nothing. Each flow names one fault that
  // it guards against; with the fault switched on the flow must fail, and for
  // the reason it says.
  const results = await pool(
    FLOWS.map((flow) => () => play(flow, "small", flow.fault)),
    JOBS,
  );
  for (const [i, r] of results.entries()) {
    const fault = FLOWS[i].fault;
    const red = !r.ok && fault.expect.test(r.note);
    failed ||= !red;
    console.log(
      `${red ? "red " : r.ok ? "STILL GREEN" : "RED FOR ANOTHER REASON"} ${r.flow} with "${fault.what}":\n     ${r.note.split("\n").slice(0, 4).join("\n     ")}`,
    );
  }
} else {
  const results = await pool(
    FLOWS.flatMap((flow) => Object.keys(PHONES).map((phone) => () => play(flow, phone))),
    JOBS,
  );
  const cell = (r) =>
    r.shots
      .map((f) => `<figure><img src="${f}" loading="lazy"><figcaption>${f}</figcaption></figure>`)
      .join("");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  writeFileSync(
    `${SHOTS}index.html`,
    `<!doctype html><meta charset="utf-8"><title>Honey Hollow shots</title>
<style>body{font:14px system-ui;margin:16px}section{display:flex;gap:12px;overflow-x:auto}
figure{margin:0}img{height:480px;border:1px solid #ccc}figcaption{font-size:12px;color:#666}
pre{white-space:pre-wrap;color:#555}.bad,.bad+pre{color:#b00}</style>
${results
  .map(
    (r) =>
      `<h2 class="${r.ok ? "" : "bad"}">${r.flow} · ${r.phone} · ${r.ok ? "ok" : "FAILED"}</h2><pre>${esc(r.note)}</pre><section>${cell(r)}</section>`,
  )
  .join("\n")}`,
  );
  for (const r of results)
    console.log(
      `${r.ok ? "ok  " : "FAIL"} ${r.flow} on ${r.phone} (${(r.ms / 1000).toFixed(1)} s): ${r.note}`,
    );
  console.log(`shots: ${SHOTS}index.html`);
  failed = !results.every((r) => r.ok);
}
await browser.close();
server.close();
if (noBars) console.log("note: this Chrome cannot emulate safe areas; that check ran with none");
console.log(`${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exitCode = failed ? 1 : 0;
