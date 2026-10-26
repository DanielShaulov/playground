// Phone flows and screenshot gallery for The Brine Nook.
// Run: npm run test:ferment:browser
//
// Every flow plays on a small and a large phone at once. Each snap saves a
// screenshot and fails the flow if anything sticks out past the right edge;
// a flow also fails on any console error. The shots land in
// tests/ferment/browser/shots/ with an index.html to look through (CI uploads
// the folder as the "ferment-shots" artifact).
//
// Chromium comes from $CHROMIUM, else /opt/pw-browsers/chromium (agent
// sessions), else Playwright's own lookup. Never run `playwright install`.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";
import { serve } from "./serve.mjs";
import * as day from "./day.mjs";
import * as gallery from "./gallery.mjs";
import * as bench from "./bench.mjs";
import * as board from "./board.mjs";
import * as evening from "./evening.mjs";
import * as audio from "./audio.mjs";
import * as fx from "./fx.mjs";
import * as settings from "./settings.mjs";
import * as report from "./report.mjs";
import * as orders from "./orders.mjs";
import * as tipout from "./tipout.mjs";
import * as intro from "./intro.mjs";
import * as saves from "./saves.mjs";
import * as offline from "./offline.mjs";
import * as perf from "./perf.mjs";
import * as decor from "./decor.mjs";

const ALL = [
  day,
  gallery,
  bench,
  board,
  evening,
  decor,
  orders,
  tipout,
  audio,
  fx,
  settings,
  report,
  intro,
  saves,
  offline,
  perf,
];
// FLOWS=fx,day runs just those (handy while working on one screen).
const only = process.env.FLOWS?.split(",");
const FLOWS = only ? ALL.filter((f) => only.includes(f.name)) : ALL;
const PHONES = { small: devices["iPhone SE"], large: devices["iPhone 15 Pro Max"] };
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));

const executablePath =
  process.env.CHROMIUM ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const server = await serve();
const browser = await chromium.launch({ executablePath });

async function play(flow, phone) {
  const ctx = await browser.newContext({
    ...PHONES[phone],
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shots = [];
  const snap = async (name) => {
    const file = `${phone}/${flow.name}-${name}.png`;
    mkdirSync(`${SHOTS}${phone}`, { recursive: true });
    await page.screenshot({ path: SHOTS + file });
    shots.push(file);
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      // A row meant to scroll sideways (data-scroll-x, like the order board) may run past the edge.
      const inScroller = (el) => {
        const p = el.parentElement?.closest("[data-scroll-x]");
        return !!p && p.getBoundingClientRect().right <= w + 1;
      };
      return [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > w + 1 && !inScroller(el);
        })
        .slice(0, 3)
        .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`);
    });
    if (over.length) throw new Error(`overflows the screen at "${name}": ${over.join(", ")}`);
  };
  try {
    // Flows start a plain shop (no intro or notes) unless they ask for a page of their own.
    await page.goto(`${server.url}games/ferment/${flow.page ?? "?tips=off"}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const note = await flow.run(page, snap);
    if (errors.length) throw new Error(`console errors:\n  ${errors.join("\n  ")}`);
    return { flow: flow.name, phone, ok: true, note, shots };
  } catch (e) {
    await snap("failed").catch(() => {});
    return { flow: flow.name, phone, ok: false, note: e.stack ?? String(e), shots };
  } finally {
    await ctx.close();
  }
}

// Flows that time things (export alone = true) run after the rest, one at a time,
// so the other flows aren't taking the CPU while they measure.
const results = await Promise.all(
  FLOWS.filter((f) => !f.alone).flatMap((flow) =>
    Object.keys(PHONES).map((phone) => play(flow, phone)),
  ),
);
for (const flow of FLOWS.filter((f) => f.alone))
  for (const phone of Object.keys(PHONES)) results.push(await play(flow, phone));
await browser.close();
server.close();

const cell = (r) =>
  r.shots
    .map((f) => `<figure><img src="${f}" loading="lazy"><figcaption>${f}</figcaption></figure>`)
    .join("");
writeFileSync(
  `${SHOTS}index.html`,
  `<!doctype html><meta charset="utf-8"><title>Ferment shots</title>
<style>body{font:14px system-ui;margin:16px}section{display:flex;gap:12px;overflow-x:auto}
figure{margin:0}img{height:480px;border:1px solid #ccc}figcaption{font-size:12px;color:#666}
.bad{color:#b00}</style>
${results
  .map(
    (r) =>
      `<h2 class="${r.ok ? "" : "bad"}">${r.flow} · ${r.phone} · ${r.ok ? "ok" : "FAILED"}</h2><section>${cell(r)}</section>`,
  )
  .join("\n")}`,
);

for (const r of results)
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.flow} on ${r.phone}: ${r.note}`);
console.log(`shots: ${SHOTS}index.html`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
