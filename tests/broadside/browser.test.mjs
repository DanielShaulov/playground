/**
 * Headless Chromium portrait-phone test suite for Broadside! (The Bridge & One Persistent Warship).
 *
 * Drives real one-thumb pointer/touch gameplay on both iPhone 13 (390×844) and
 * iPhone SE (320×568):
 * Launcher Tile -> Title -> First Watch Patrol Tutorial (Step 1 tap water -> Step 2 drag lead -> fire) ->
 * AP/HE & 2-state STOP/FULL Toggle -> Victory Aftermath -> Modular Trade-Off Drydock (buy Twin Torps & Ironclad) ->
 * The Bridge (Horizon + 3 Dispatches with Mini-Map Thumbnails) -> Mission 2 Defeat ("Escaped With Injuries!") ->
 * Drydock Damaged Part Repair -> Reload Persistence (SAVE_V=6) -> iPhone SE layout verification.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, devices } from "playwright-core";

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

async function tapCanvasRect(page, rect) {
  const pt = await page.evaluate(
    ({ x, y }) => {
      const box = document.querySelector("canvas").getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    },
    { x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.5 },
  );
  await page.mouse.click(pt.x, pt.y);
}

async function run() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    // =========================================================================
    // 1. Full Portrait Gameplay Flow on iPhone 13 (390 × 844)
    // =========================================================================
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => {
      console.error("pageerror:", e);
      errors.push(`pageerror: ${e.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("console.error:", msg.text());
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    // Launcher -> Broadside!
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    const tile = page.locator('a.tile[href="games/broadside/index.html"]');
    await tile.waitFor({ state: "visible", timeout: 5000 });
    await tile.click();
    await page.waitForFunction(() => Boolean(window.__broadside), undefined, { timeout: 5000 });
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(SHOTS_DIR, "01-title.png") });
    assert.equal(await page.evaluate(() => window.__broadside.scene), "title");

    // Tap SET SAIL -> drops new Gunboat straight into First Watch Patrol!
    let rects = await page.evaluate(() => window.__broadside.getUiRects("title"));
    await tapCanvasRect(page, rects.primary);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__broadside.scene), "battle");
    assert.equal(await page.evaluate(() => window.__broadside.battle.player.maxHp), 6);
    await page.screenshot({ path: path.join(SHOTS_DIR, "02-battle-1.png") });

    // Step 1: Tap water -> sets waypoint & clears steered coach
    const canvasBox = await page.locator("canvas").boundingBox();
    await page.mouse.click(canvasBox.x + 100, canvasBox.y + 420);
    assert.equal(await page.evaluate(() => window.__broadside.campaign.tutorialSeen.steered), true);

    // Step 2: Drag anywhere -> Battle 1 LEAD ghost pip -> Lift to Fire!
    await page.mouse.move(canvasBox.x + 210, canvasBox.y + 520);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 236, canvasBox.y + 512, { steps: 8 });
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.__broadside.aimDrag.active), true);
    // Regression guard: taking a hit (hitFlash > 0) while aiming with seaLiftY > 0 must never throw or clip the bottom pills!
    await page.evaluate(() => {
      const b = window.__broadside.battle;
      b.shells.push({
        friendly: false,
        ammo: "he",
        salvoId: "reg_hit",
        sx: b.player.x,
        sy: b.player.y - 40,
        tx: b.player.x,
        ty: b.player.y,
        x: b.player.x,
        y: b.player.y,
        z: 0,
        t: 0.49,
        flightTime: 0.5,
        peakH: 16,
        ang: Math.PI * 0.5,
      });
    });
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(SHOTS_DIR, "03-battle-aim.png") });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__broadside.battle.shotsFired), 1);
    assert.equal(await page.evaluate(() => window.__broadside.campaign.tutorialSeen.fired), true);

    // Test AP/HE & 2-state STOP/FULL toggle
    rects = await page.evaluate(() => window.__broadside.getUiRects("battle"));
    await tapCanvasRect(page, rects.ammoBtn);
    assert.equal(await page.evaluate(() => window.__broadside.battle.player.ammo), "he");
    await tapCanvasRect(page, rects.throttleBtn);
    assert.equal(await page.evaluate(() => window.__broadside.battle.player.throttle), 0);
    await tapCanvasRect(page, rects.throttleBtn);
    assert.equal(await page.evaluate(() => window.__broadside.battle.player.throttle), 2);

    // Finish Battle 1 -> Victory Aftermath!
    await page.evaluate(() => {
      const b = window.__broadside.battle;
      for (const e of b.enemies) {
        if (e.hp > 0) {
          e.hp = 0;
          b.goldCollected += e.gold || 2;
          b.shipsSunk += 1;
        }
      }
    });
    await page.waitForFunction(() => window.__broadside.scene === "aftermath", undefined, {
      timeout: 6000,
    });
    assert.equal(await page.evaluate(() => window.__broadside.aftermath.won), true);
    assert.ok(await page.evaluate(() => window.__broadside.campaign.gold >= 10));
    await page.screenshot({ path: path.join(SHOTS_DIR, "04-aftermath-win.png") });

    // Open Modular Drydock from Aftermath -> buy Ironclad Belt (10💰) or Twin Torps (8💰)!
    rects = await page.evaluate(() => window.__broadside.getUiRects("aftermath"));
    await tapCanvasRect(page, rects.drydock);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__broadside.scene), "drydock");
    await page.screenshot({ path: path.join(SHOTS_DIR, "05-drydock-hull.png") });

    // Switch to Deck (aux) bay and buy Twin Torp Tubes (8💰)!
    rects = await page.evaluate(() => window.__broadside.getUiRects("drydock"));
    const deckTab = rects.bayTabs.find((t) => t.bayId === "aux");
    await tapCanvasRect(page, deckTab);
    await page.waitForTimeout(150);
    rects = await page.evaluate(() => window.__broadside.getUiRects("drydock"));
    const torpCard = rects.partCards.find((c) => c.partId === "aux_torp2");
    await tapCanvasRect(page, torpCard);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__broadside.campaign.equipped.aux), "aux_torp2");

    // Return to THE BRIDGE!
    rects = await page.evaluate(() => window.__broadside.getUiRects("drydock"));
    await tapCanvasRect(page, rects.primary);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__broadside.scene), "bridge");
    assert.equal(await page.evaluate(() => window.__broadside.dispatches.length), 3);
    await page.screenshot({ path: path.join(SHOTS_DIR, "06-bridge.png") });

    // Launch Dispatch 2 from Bridge -> capture handcrafted arena -> Sink ship -> Verify Option A!
    rects = await page.evaluate(() => window.__broadside.getUiRects("bridge"));
    await tapCanvasRect(page, rects.dispatches[1]); // select Tactical Contract
    await page.waitForTimeout(120);
    await tapCanvasRect(page, rects.primary); // Engage!
    await page.waitForFunction(() => window.__broadside.scene === "battle", undefined, {
      timeout: 5000,
    });
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(SHOTS_DIR, "06b-battle-2-arena.png") });
    await page.evaluate(() => {
      window.__broadside.battle.player.hp = 0;
    });
    await page.waitForFunction(() => window.__broadside.scene === "aftermath", undefined, {
      timeout: 5000,
    });
    assert.equal(await page.evaluate(() => window.__broadside.aftermath.won), false);
    assert.equal(
      await page.evaluate(() => window.__broadside.campaign.damagedParts.aux_torp2),
      true,
    );
    await page.screenshot({ path: path.join(SHOTS_DIR, "07-aftermath-escaped.png") });

    // Tap "Repair in Drydock" -> opens Drydock auto-focused on the damaged Deck bay!
    rects = await page.evaluate(() => window.__broadside.getUiRects("aftermath"));
    await tapCanvasRect(page, rects.drydock);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__broadside.scene), "drydock");
    assert.equal(await page.evaluate(() => window.__broadside.selectedBay), "aux");
    await page.screenshot({ path: path.join(SHOTS_DIR, "08-drydock-damaged.png") });

    // Reload Persistence Check (SAVE_V = 6)
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__broadside), undefined, { timeout: 5000 });
    assert.equal(
      await page.evaluate(() => window.__broadside.campaign.damagedParts.aux_torp2),
      true,
    );

    assert.deepEqual(
      errors,
      [],
      `Unexpected console/page errors on iPhone 13: ${errors.join("; ")}`,
    );
    await context.close();

    // =========================================================================
    // 2. Small-Screen Layout Pass on iPhone SE (320 × 568)
    // =========================================================================
    const seContext = await browser.newContext({
      ...devices["iPhone SE"],
      hasTouch: true,
    });
    const sePage = await seContext.newPage();
    const seErrors = [];
    sePage.on("pageerror", (e) => seErrors.push(e.message));
    sePage.on("console", (msg) => {
      if (msg.type() === "error") seErrors.push(msg.text());
    });

    await sePage.goto(`${baseUrl}/games/broadside/index.html`, { waitUntil: "networkidle" });
    await sePage.waitForFunction(() => Boolean(window.__broadside), undefined, { timeout: 5000 });
    await sePage.waitForTimeout(200);

    // Open Drydock -> Bridge -> Battle on compact iPhone SE
    let seRects = await sePage.evaluate(() => window.__broadside.getUiRects("title"));
    await tapCanvasRect(sePage, seRects.drydock);
    await sePage.waitForTimeout(200);
    await sePage.screenshot({ path: path.join(SHOTS_DIR, "09-se-drydock.png") });

    seRects = await sePage.evaluate(() => window.__broadside.getUiRects("drydock"));
    await tapCanvasRect(sePage, seRects.primary);
    await sePage.waitForTimeout(200);
    assert.equal(await sePage.evaluate(() => window.__broadside.scene), "bridge");
    await sePage.screenshot({ path: path.join(SHOTS_DIR, "10-se-bridge.png") });

    seRects = await sePage.evaluate(() => window.__broadside.getUiRects("bridge"));
    await tapCanvasRect(sePage, seRects.primary);
    await sePage.waitForTimeout(200);
    assert.equal(await sePage.evaluate(() => window.__broadside.scene), "battle");
    await sePage.screenshot({ path: path.join(SHOTS_DIR, "11-se-battle.png") });

    assert.deepEqual(
      seErrors,
      [],
      `Unexpected console/page errors on iPhone SE: ${seErrors.join("; ")}`,
    );
    await seContext.close();

    console.log("Broadside! Bridge + Drydock verification passed on iPhone 13 & iPhone SE.");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
