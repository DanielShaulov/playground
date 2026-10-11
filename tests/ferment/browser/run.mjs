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

const FLOWS = [day, gallery];
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
  const ctx = await browser.newContext({ ...PHONES[phone], hasTouch: true });
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
      return [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > w + 1;
        })
        .slice(0, 3)
        .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`);
    });
    if (over.length) throw new Error(`overflows the screen at "${name}": ${over.join(", ")}`);
  };
  try {
    await page.goto(`${server.url}games/ferment/`);
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

const results = await Promise.all(
  FLOWS.flatMap((flow) => Object.keys(PHONES).map((phone) => play(flow, phone))),
);
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
