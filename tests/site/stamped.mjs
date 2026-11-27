// Every game, loaded from a copy of the site built the way the deploy builds
// it (scripts/stamp-build.mjs). The deploy rewrites each game's page, and the
// other tests play the repo's own unstamped files, so nothing else would see
// a page the stamp broke.
// Run: npm run test:site
//
// For each game: the page loads with a clean console and no failed request,
// and every script and stylesheet of the site it asks for carries the build's
// ?v=, so no phone can be answered with an older build's file.
//
// Chromium comes from $CHROMIUM, else /opt/pw-browsers/chromium (agent
// sessions), else Playwright's own lookup. Never run `playwright install`.
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";
import { serve } from "../honey-hollow/browser/serve.mjs";
import { stamp } from "../../scripts/stamp-build.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHA = "5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e";
const MARK = `?v=${SHA.slice(0, 12)}`;

const dir = mkdtempSync(join(tmpdir(), "site-"));
for (const part of ["games", "shared", "manifest.webmanifest", "icon.svg", "icon-180.png"])
  cpSync(join(ROOT, part), join(dir, part), { recursive: true });
stamp(dir, SHA);

const executablePath =
  process.env.CHROMIUM ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const server = await serve(dir);
const browser = await chromium.launch({ executablePath });
let failed = false;
try {
  for (const id of readdirSync(join(dir, "games")).sort()) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    const wrong = [];
    const asked = [];
    page.on("pageerror", (e) => wrong.push(`page error: ${String(e).slice(0, 200)}`));
    page.on("console", (m) => {
      if (m.type() === "error") wrong.push(`console error: ${m.text().slice(0, 200)}`);
    });
    page.on("requestfailed", (r) => wrong.push(`request failed: ${r.url()}`));
    page.on("response", (r) => {
      if (r.status() >= 400) wrong.push(`${r.status()} for ${r.url()}`);
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (r.url().startsWith(server.url) && /\.(js|css)$/.test(u.pathname)) asked.push(u);
    });
    await page.goto(`${server.url}games/${id}/index.html`, { waitUntil: "load" });
    // Long enough for a game to import what it imports lazily at the start.
    await page.waitForTimeout(1500);
    const plain = asked.filter((u) => u.search !== MARK).map((u) => u.pathname + u.search);
    if (plain.length) wrong.push(`asked for without the build's mark: ${plain.join(", ")}`);
    if (!asked.some((u) => u.pathname.endsWith(".js"))) wrong.push("no script was asked for");
    failed ||= wrong.length > 0;
    console.log(
      wrong.length
        ? `FAIL ${id}\n  - ${wrong.join("\n  - ")}`
        : `ok   ${id}: ${asked.length} scripts and stylesheets, all marked`,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
