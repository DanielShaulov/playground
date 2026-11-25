/**
 * Headless Chromium portrait-phone test suite for Perihelion.
 * Drives real pointer/touch interactions on iPhone 13 and iPhone SE viewports,
 * asserting gameplay, trajectory aim, scoring, warp -> relic draft, save/resume,
 * lose condition, best-score persistence, and zero console errors.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, devices } from "playwright-core";
import { pullToVelocity, predictTrajectory } from "../../games/perihelion/core/physics.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SHOTS_DIR = path.join(import.meta.dirname, "shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || "/").split("?")[0];
      if (cleanUrl === "/pr/index.json") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end("[]");
        return;
      }
      let filePath = path.join(ROOT, cleanUrl === "/" ? "index.html" : cleanUrl);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function findChromium() {
  for (const cand of [
    process.env.CHROMIUM,
    "/opt/pw-browsers/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    if (cand && fs.existsSync(cand)) return cand;
  }
  return undefined;
}

async function tapWorldRect(page, rect) {
  const pt = await page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector("canvas");
      const box = c.getBoundingClientRect();
      const s = window.__perihelion.worldToScreen(x, y);
      return { x: box.left + s.x, y: box.top + s.y };
    },
    { x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.5 },
  );
  await page.mouse.click(pt.x, pt.y);
}

async function run() {
  const { server, baseUrl } = await startServer();
  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    // --- 1. Full gameplay flow on iPhone 13 (390 x 844) ---
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    // Verify launcher tile opens Perihelion
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    const tile = page.locator('a.tile[href="games/perihelion/index.html"]');
    await tile.waitFor({ state: "visible", timeout: 5000 });
    await tile.click();
    await page.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    await page.waitForTimeout(350);

    // Screenshot 1: Title screen
    await page.screenshot({ path: path.join(SHOTS_DIR, "01-title.png") });
    let state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.scene, "title");

    // Tap LAUNCH RUN
    const titleRects = await page.evaluate(() => window.__perihelion.uiRects());
    await tapWorldRect(page, titleRects.start);
    await page.waitForTimeout(150);

    // Seed a known Sector 1 for deterministic aiming test
    await page.evaluate(() => window.__perihelion.startSeed(42));
    await page.waitForTimeout(120);
    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.scene, "play");
    assert.equal(state.run.phase, "aim");
    assert.equal(state.run.sectorNum, 1);

    // Find a pull vector that threads Sector 1 straight into the Warp Gate
    const winningPull = await page.evaluate(() => {
      const { run } = window.__perihelion.getState();
      return { sector: run.sector };
    });

    let bestPull = { dx: 68, dy: -118 };
    for (let angle = -1.0; angle <= 1.0; angle += 0.08) {
      for (let mag = 70; mag <= 140; mag += 15) {
        const dx = Math.sin(angle) * mag;
        const dy = -Math.cos(angle) * mag;
        const vel = pullToVelocity(dx, dy, []);
        if (!vel) continue;
        const pred = predictTrajectory(
          winningPull.sector,
          winningPull.sector.launch.x,
          winningPull.sector.launch.y,
          vel.vx,
          vel.vy,
          [],
        );
        if (pred.hitGate) {
          bestPull = { dx, dy };
          break;
        }
      }
      if (bestPull.dx !== 68 || bestPull.dy !== -118) break;
    }

    // Perform real pointer drag to aim -> capture aim screenshot -> release to launch!
    const dragCoords = await page.evaluate(
      ({ dx, dy }) => {
        const c = document.querySelector("canvas");
        const box = c.getBoundingClientRect();
        const start = window.__perihelion.worldToScreen(200, 480);
        const end = window.__perihelion.worldToScreen(200 - dx, 480 - dy);
        return {
          sx: box.left + start.x,
          sy: box.top + start.y,
          ex: box.left + end.x,
          ey: box.top + end.y,
        };
      },
      bestPull,
    );

    await page.mouse.move(dragCoords.sx, dragCoords.sy);
    await page.mouse.down();
    await page.mouse.move(dragCoords.ex, dragCoords.ey, { steps: 8 });
    await page.waitForTimeout(120);

    // Screenshot 2: Live aiming with bending RK4 trajectory arc
    await page.screenshot({ path: path.join(SHOTS_DIR, "02-aim.png") });
    await page.mouse.up();

    // Wait for probe to fly and clear Sector 1 -> Relic Draft
    await page.waitForFunction(
      () => {
        const s = window.__perihelion.getState();
        return s.run && s.run.phase === "draft";
      },
      { timeout: 10000 },
    );

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.run.phase, "draft");
    assert.ok(state.run.score > 400, `expected score > 400, got ${state.run.score}`);
    assert.equal(state.run.draftChoices.length, 3);

    // Screenshot 3: Sector clear + Relic Draft cards
    await page.screenshot({ path: path.join(SHOTS_DIR, "03-draft.png") });

    // Tap first relic card -> advance to Sector 2
    const draftRects = await page.evaluate(() => window.__perihelion.uiRects());
    const chosenRelic = draftRects.cards[0].id;
    await tapWorldRect(page, draftRects.cards[0]);
    await page.waitForTimeout(150);

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.run.sectorNum, 2);
    assert.equal(state.run.phase, "aim");
    assert.ok(state.run.relics.includes(chosenRelic));
    const scoreAtSector2 = state.run.score;

    // Reload page and verify RESUME + best score persistence
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    await page.waitForTimeout(180);

    const resumedRects = await page.evaluate(() => window.__perihelion.uiRects());
    assert.ok(resumedRects.resume, "Resume button should appear for saved run");
    await tapWorldRect(page, resumedRects.resume);
    await page.waitForTimeout(150);

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.run.sectorNum, 2);
    assert.equal(state.run.score, scoreAtSector2);
    assert.ok(state.run.relics.includes(chosenRelic));

    // Screenshot 4: Sector 2 live playfield with relic installed
    await page.screenshot({ path: path.join(SHOTS_DIR, "04-sector2.png") });

    // Drive lose condition by launching and tapping RECALL until 0 probes remain
    let safety = 0;
    while (safety++ < 10) {
      state = await page.evaluate(() => window.__perihelion.getState());
      if (state.run.phase === "over") break;
      await page.evaluate(() => window.__perihelion.launchDirect(0, -240));
      await page.waitForTimeout(80);
      const flightRects = await page.evaluate(() => window.__perihelion.uiRects());
      if (flightRects.recall) {
        await tapWorldRect(page, flightRects.recall);
        await page.waitForTimeout(100);
      }
    }

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.run.phase, "over");
    assert.equal(state.run.probes, 0);
    await page.screenshot({ path: path.join(SHOTS_DIR, "05-gameover.png") });

    // Reload and verify best score persisted even after game over cleared saved run
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    const afterReload = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(afterReload.best, scoreAtSector2);
    assert.deepEqual(errors, [], `unexpected console/page errors: ${errors.join("; ")}`);
    await context.close();

    // --- 2. Compact viewport sanity check on iPhone SE (320 x 568) ---
    const seCtx = await browser.newContext({
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const sePage = await seCtx.newPage();
    const seErrors = [];
    sePage.on("pageerror", (e) => seErrors.push(e.message));
    await sePage.goto(`${baseUrl}/games/perihelion/index.html`, { waitUntil: "networkidle" });
    await sePage.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    await sePage.waitForTimeout(200);
    await sePage.screenshot({ path: path.join(SHOTS_DIR, "06-iphone-se.png") });
    assert.deepEqual(seErrors, []);
    await seCtx.close();

    console.log("Perihelion browser tests passed (iPhone 13 + iPhone SE).");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
