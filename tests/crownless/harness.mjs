/**
 * Shared plumbing for driving Crownless in a real browser.
 *
 * The same contract as the Checkwiz harness (tests/checkwiz/README.md):
 *
 *   - **Input** is taps. Buttons are DOM and are pressed by their visible
 *     names; the field is a canvas and is tapped at the coordinates
 *     view/layout.js gives the game itself. No test hooks.
 *   - **Output** is `localStorage`: the save is the whole battle as the
 *     rules keep it, written after every action and every round.
 *   - **Setup** is also `localStorage`: write a save, reload, press
 *     Continue, and the game resumes any position.
 *
 * Positions are built with the rules (createBattle, skirmish) because a
 * battle's state is too long to write out by hand; that is setup, like
 * planning a bot's move. What a check *expects* is always a literal worked
 * out by hand, never something the rules computed.
 */
import { chromium, devices } from "playwright-core";
import { layout, toScreen, hitArea } from "../../games/crownless/view/layout.js";
import { SAVE_V as CURRENT_V } from "../../games/crownless/rules/save.js";

export const URL = process.env.CROWNLESS_URL ?? "http://localhost:8000/games/crownless/";
export const KEY = "playground:crownless:save";
const CHROMIUM = process.env.CROWNLESS_CHROMIUM ?? "/opt/pw-browsers/chromium";

/** Save version to seed; set SAVE_V to point the suite at an older build. */
export const SAVE_V = Number(process.env.SAVE_V ?? CURRENT_V);

/** Boot a portrait phone on the game and return everything needed to play it. */
export async function openGame({ device = "iPhone 13", headless = true, clear = true } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless });
  const context = await browser.newContext({ ...devices[device], hasTouch: true });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  const response = await page.goto(URL, { waitUntil: "load" }).catch(() => null);
  if (!response) throw new Error(`cannot reach ${URL} — run \`npm start\` first`);
  if (clear) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
  }
  await page.waitForTimeout(500);

  const rect = await page.evaluate(() => {
    const r = document.querySelector("canvas").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const L = () => layout(rect.width, rect.height);
  const settle = (ms = 250) => page.waitForTimeout(ms);
  const tap = (x, y) => page.touchscreen.tap(rect.left + x, rect.top + y);

  const game = {
    page,
    browser,
    rect,
    errors,
    layout: L,
    settle,
    tap,

    /** The save as the game last wrote it. */
    read: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY),
    store: (key) =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `playground:crownless:${key}`),

    /** Press a DOM button by its visible (or aria) name. */
    async press(name, ms = 250) {
      const btn = page.getByRole("button", { name, exact: true });
      await btn.first().tap();
      await settle(ms);
    },

    /**
     * Hold a press on an element for `ms` (a mouse, so the click that ends
     * it is real) and return the tip it shows, or null.
     */
    async hold(locator, ms = 650) {
      const r = await locator.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await settle(ms);
      const tip = await page
        .locator(".cl-tip")
        .textContent({ timeout: 300 })
        .catch(() => null);
      await page.mouse.up();
      await settle();
      return tip;
    },

    /** Is a button with this name on screen, and enabled? */
    async can(name) {
      const btn = page.getByRole("button", { name, exact: true }).first();
      return (await btn.count()) > 0 && (await btn.isVisible()) && (await btn.isEnabled());
    },

    /** Tap a point of the field, in metres. */
    async tapField(x, y, ms = 250) {
      const p = toScreen(L(), x, y);
      await tap(p.x, p.y);
      await settle(ms);
    },

    /** Tap a squad where the save says it stands, at its hit area's centre. */
    async tapSquad(s, ms = 250) {
      const h = hitArea(L(), s);
      await tap(h.x, h.y);
      await settle(ms);
    },

    /** The chip for one of your squads: its button, found by squad id. */
    chip: (id) => page.locator(`button[data-squad="${id}"]`),

    /** Press Go and wait out the three seconds of the round. */
    async go() {
      await game.press("Go ▶", 50);
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].some((b) =>
            /^Go ▶$|^Begin ▶$/.test(b.textContent),
          ) || document.querySelector('[aria-label="Result"]'),
        null,
        { timeout: 8000 },
      );
      await settle(150);
    },

    /** Seed a save, reload, and press Continue. */
    async resume(save) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, save]);
      await page.reload({ waitUntil: "load" });
      await settle(400);
      await page
        .getByRole("button", { name: /^Continue/ })
        .first()
        .tap();
      await settle(300);
    },

    async reload() {
      await page.reload({ waitUntil: "load" });
      await settle(400);
    },

    close: () => browser.close(),
  };
  return game;
}

/** A save around a battle, as game.js writes it. */
export function saveOf(battle, { phase = "plan", odds = null, setup = null } = {}) {
  return {
    v: SAVE_V,
    setup: setup ?? {
      terrain: "open",
      sides: [
        { culture: "vale", doctrine: "balanced", worth: 100, hero: 5 },
        { culture: "fen", doctrine: "yeomen", worth: 100, hero: 5 },
      ],
    },
    odds: odds ?? { wins: 4, runs: 8, word: "Even", losses: {} },
    phase,
    battle,
    result: null,
  };
}

export function createReport() {
  const results = [];
  return {
    check(name, ok, detail = "") {
      results.push({ name, ok: !!ok });
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  — ${detail}` : ""}`);
      return ok;
    },
    finish() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} checks passed`);
      return failed;
    },
  };
}
