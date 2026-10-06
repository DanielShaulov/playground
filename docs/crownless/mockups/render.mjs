/**
 * Renders the mockups to PNGs next to this file.
 *
 *     node docs/crownless/mockups/render.mjs              # map, overview, battle
 *     VIEWS=battle ROUND=5 STEP=10 node docs/crownless/mockups/render.mjs
 *
 * Serves the repo itself on a free port (module imports don't work from
 * file://) and drives the Chromium already on the machine, like the Checkwiz
 * harness. Point CROWNLESS_CHROMIUM elsewhere if yours lives somewhere else.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const CHROMIUM = process.env.CROWNLESS_CHROMIUM ?? "/opt/pw-browsers/chromium";
const VIEWS = (process.env.VIEWS ?? "map,overview,battle").split(",");
const OUT = process.env.OUT ?? here;
const SUFFIX = process.env.SUFFIX ?? "";
const extra = new URLSearchParams();
for (const k of ["seed", "round", "step"]) {
  const v = process.env[k.toUpperCase()];
  if (v) extra.set(k, v);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/docs/crownless/mockups/`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on(
  "console",
  (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()),
);

for (const view of VIEWS) {
  const q = new URLSearchParams(extra);
  q.set("view", view);
  q.set("dpr", "2");
  await page.goto(`${base}index.html?${q}`);
  await page.waitForSelector("body[data-ready]", { timeout: 15000 });
  // The canvas is drawn at 2× into a 390-wide box; screenshot the canvas
  // element at device scale 2 for a retina-sized PNG.
  const shot = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  shot.on("pageerror", (e) => errors.push(e.message));
  await shot.goto(`${base}index.html?${q}`);
  await shot.waitForSelector("body[data-ready]", { timeout: 15000 });
  await shot.locator("canvas").screenshot({ path: join(OUT, `${view}${SUFFIX}.png`) });
  await shot.close();
  console.log(`${view}${SUFFIX}.png`);
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
