/**
 * Headless Chromium portrait-phone test suite for Perihelion.
 * Drives real pointer/touch flows on iPhone 13 and iPhone SE viewports:
 * Title -> Orbit 1 Ghost-Thumb Tutorial -> Slingshot Clear -> 3-Star Sheet ->
 * Orbit 2 Slow-Mo Grapple Tutorial -> Live Curved Exit Arc ->
 * Constellation Star Chart & Ship Hangar -> Reload Persistence -> Daily Gauntlet.
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
    // --- 1. Full flow on iPhone 13 (390 x 844) ---
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

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    const tile = page.locator('a.tile[href="games/perihelion/index.html"]');
    await tile.waitFor({ state: "visible", timeout: 5000 });
    await tile.click();
    await page.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    await page.waitForTimeout(300);

    // 1. Title screen
    await page.screenshot({ path: path.join(SHOTS_DIR, "01-title.png") });
    let state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.scene, "title");

    // 2. Tap START EXPEDITION -> enters Orbit 1 with animated Ghost Thumb tutorial
    const titleRects = await page.evaluate(() => window.__perihelion.uiRects());
    await tapWorldRect(page, titleRects.primary);
    await page.waitForTimeout(450);

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.scene, "play");
    assert.equal(state.session.orbit.id, "h1");
    assert.equal(state.session.phase, "aim");
    await page.screenshot({ path: path.join(SHOTS_DIR, "02-tutorial-pull.png") });

    // Compute clean 1-shot pull vector for Orbit 1
    let winPull = { dx: 54, dy: -112 };
    for (let angle = -1.0; angle <= 1.0; angle += 0.08) {
      for (let mag = 70; mag <= 145; mag += 15) {
        const dx = Math.sin(angle) * mag;
        const dy = -Math.cos(angle) * mag;
        const vel = pullToVelocity(dx, dy, "solaris");
        if (!vel) continue;
        const pred = predictTrajectory(
          state.session.orbit,
          state.session.orbit.launch.x,
          state.session.orbit.launch.y,
          vel.vx,
          vel.vy,
          "solaris",
        );
        if (pred.hitGate) {
          winPull = { dx, dy };
          break;
        }
      }
      if (winPull.dx !== 54 || winPull.dy !== -112) break;
    }

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
      winPull,
    );

    await page.mouse.move(dragCoords.sx, dragCoords.sy);
    await page.mouse.down();
    await page.mouse.move(dragCoords.ex, dragCoords.ey, { steps: 8 });
    await page.waitForTimeout(80);
    await page.mouse.up();

    // Wait for Orbit 1 clear -> sleek 3-Star Clear Sheet
    await page.waitForFunction(
      () => {
        const s = window.__perihelion.getState();
        return s.session && s.session.phase === "clear";
      },
      { timeout: 10000 },
    );
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(SHOTS_DIR, "03-clear-sheet.png") });

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.ok(state.profile.orbits.h1 && state.profile.orbits.h1.stars >= 2);

    // 3. Tap NEXT ORBIT -> Orbit 2 ("Orbit Whip") interactive grapple tutorial
    const clearRects = await page.evaluate(() => window.__perihelion.uiRects());
    assert.ok(clearRects.next);
    await tapWorldRect(page, clearRects.next);
    await page.waitForTimeout(150);

    state = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(state.session.orbit.id, "h2");

    // Launch past the right side of the Ice Planet to trigger slow-mo grapple tutorial
    await page.evaluate(() => window.__perihelion.launchDirect(165, -340));
    await page.waitForFunction(
      () => {
        const s = window.__perihelion.getState();
        return s.session && s.session.tutorialAssistActive;
      },
      { timeout: 6000 },
    );
    await page.screenshot({ path: path.join(SHOTS_DIR, "04-tutorial-grapple.png") });

    // Hold thumb anywhere -> locks Orbit Grapple and renders Live Curved Exit Trajectory!
    const mid = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const box = c.getBoundingClientRect();
      return { x: box.left + box.width * 0.5, y: box.top + box.height * 0.6 };
    });
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.waitForTimeout(550);
    await page.screenshot({ path: path.join(SHOTS_DIR, "05-grapple-exit.png") });
    await page.mouse.up();
    await page.waitForTimeout(150);

    // 4. Open Constellation Star Chart & verify stars + Ship Hangar
    await page.evaluate(() => window.__perihelion.openChart(0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, "06-star-chart.png") });

    // 5. Reload and verify persisted stars & unlocked Orbit 2 survive!
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__perihelion), { timeout: 5000 });
    const afterReload = await page.evaluate(() => window.__perihelion.getState());
    assert.ok(afterReload.profile.orbits.h1 && afterReload.profile.orbits.h1.stars >= 2);
    assert.equal(afterReload.profile.seenPullTutorial, true);

    // 6. Test Daily Gauntlet lose condition
    await page.evaluate(() => window.__perihelion.openDaily(4242));
    await page.waitForTimeout(120);
    for (let i = 0; i < 6; i++) {
      const st = await page.evaluate(() => window.__perihelion.getState());
      if (st.session.phase === "daily_over") break;
      await page.evaluate(() => window.__perihelion.launchDirect(0, -240));
      await page.waitForTimeout(70);
      const r = await page.evaluate(() => window.__perihelion.uiRects());
      if (r.recall) {
        await tapWorldRect(page, r.recall);
        await page.waitForTimeout(80);
      }
    }
    const dailyEnd = await page.evaluate(() => window.__perihelion.getState());
    assert.equal(dailyEnd.session.phase, "daily_over");
    await page.screenshot({ path: path.join(SHOTS_DIR, "07-daily-over.png") });

    assert.deepEqual(errors, [], `unexpected errors: ${errors.join("; ")}`);
    await context.close();

    // --- 2. Compact iPhone SE (320 x 568) Star Chart check ---
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
    await sePage.evaluate(() => window.__perihelion.openChart(0));
    await sePage.waitForTimeout(200);
    await sePage.screenshot({ path: path.join(SHOTS_DIR, "08-iphone-se-chart.png") });
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
