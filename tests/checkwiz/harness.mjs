/**
 * Shared plumbing for driving Checkwiz in a real browser.
 *
 * The game has no test hooks and should not grow any — it is a canvas and a
 * tap handler, and the moment it starts exporting internals for a test, the
 * test stops proving anything about the thing people actually play. So this
 * talks to it the way a thumb does, and reads it the way the game itself does:
 *
 *   - **Input** is real taps at real coordinates, from the game's own
 *     layout.js. There is no second copy of where the buttons are to drift.
 *   - **Output** is `localStorage`. The game persists the whole run at the end
 *     of every turn, so the save is a complete, honest state dump that costs
 *     the game nothing to provide.
 *   - **Setup** is also localStorage: write a save, reload, press Continue, and
 *     the game resumes any position you like. That is what makes it possible
 *     to ask "does a rook really cost two" without playing to chamber four.
 *
 * Positions are written out by hand in the tests, and expected numbers are
 * literals. rules.js is imported only to *plan* (which square is quiet, what
 * a bot should do), never to compute what an assertion expects — a test that
 * asks the rules what the rules should do proves nothing.
 */
import { chromium, devices } from "playwright-core";
import {
  layout,
  slotRect,
  titleButtons,
  draftCards,
  codexButtons,
  centre,
} from "../../games/checkwiz/layout.js";
import { SAVE_V as CURRENT_V } from "../../games/checkwiz/rules.js";

export const URL = process.env.CHECKWIZ_URL ?? "http://localhost:8000/games/checkwiz/";
export const KEY = "playground:checkwiz:run";

/** Chromium comes pre-installed in this repo's agent sessions; never fetch one. */
const CHROMIUM = process.env.CHECKWIZ_CHROMIUM ?? "/opt/pw-browsers/chromium";

/**
 * Save-format version to seed. Follows the game; set it to an older number to
 * point the same suite at an older build, which is how you check that a
 * regression test would actually have caught the regression.
 */
export const SAVE_V = Number(process.env.SAVE_V ?? CURRENT_V);

// --- Save building -------------------------------------------------------------

export const piece = (id, kind, r, c, { guard = false, stun = 0 } = {}) => ({
  id,
  kind,
  r,
  c,
  stun,
  guard,
});

/** A whole run with one board in it, every field spelled out. */
export function makeRun({
  chamber = 3,
  hp = 6,
  maxHp = 6,
  slots = 3,
  hand = [],
  relics = {},
  size = 7,
  pieces,
  wizard,
  pillars = [],
  stones = [],
  turn = 1,
  boss = false,
  castle = boss ? 1 : 0,
  pace = 99, // pawns hold still unless a test wants them marching
  call = 999, // and no reinforcements arrive
}) {
  return {
    v: SAVE_V,
    chamber,
    hp,
    maxHp,
    slots,
    hand,
    relics,
    spent: [],
    captures: 0,
    flawless: 0,
    turns: 0,
    phase: "play",
    draft: null,
    board: {
      size,
      pieces,
      pillars,
      stones,
      wizard,
      turn,
      boss,
      castle,
      pace,
      call,
      due: turn + call,
      need: 1,
      hurt: 0,
      sleep: 0,
      check: false,
      nextId: Math.max(0, ...pieces.map((p) => p.id)) + 1,
    },
  };
}

// --- Driving -------------------------------------------------------------------

/** Boot a portrait phone on the game and return everything needed to play it. */
export async function openGame({ device = "iPhone 13", headless = true } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless });
  const context = await browser.newContext({ ...devices[device], hasTouch: true });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  const response = await page.goto(URL, { waitUntil: "load" }).catch(() => null);
  if (!response) throw new Error(`cannot reach ${URL} — run \`npm start\` first`);
  await page.waitForTimeout(400);

  const rect = await page.evaluate(() => {
    const r = document.querySelector("canvas").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  const L = (size) => layout(rect.width, rect.height, size);
  const settle = (ms = 260) => page.waitForTimeout(ms);
  const tap = (x, y) => page.touchscreen.tap(rect.left + x, rect.top + y);
  const tapRect = async (r, ms) => {
    const p = centre(r);
    await tap(p.x, p.y);
    await settle(ms);
  };

  return {
    page,
    browser,
    rect,
    errors,
    layout: L,
    settle,
    tap,

    /** The whole run as the game last persisted it, or null once it is over. */
    read: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY),

    async tapCell(size, r, c) {
      const l = L(size);
      await tap(l.bx + (c + 0.5) * l.cell, l.by + (r + 0.5) * l.cell);
      await settle();
    },

    /** The right-hand button of the action row: Wait, Cancel, Skip, Close. */
    tapAside: (size) => tapRect(L(size).aside),

    /** The left-hand action button: confirms a pending move. Harmless when nothing is pending. */
    tapMain: (size) => tapRect(L(size).main),

    /** Soul slot `i` of `slots`. */
    tapSlot: (size, i, slots = 3) => tapRect(slotRect(L(size), i, slots)),

    /** One of the three relic cards on the draft screen. */
    tapDraft: (i) => tapRect(draftCards(rect.width, rect.height, 3)[i], 500),

    codex: codexButtons(rect.width, rect.height),
    tapRect,

    /** Seed a position, reload, and press Continue run. */
    async resume(run) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, run]);
      await page.reload({ waitUntil: "load" });
      await settle(400);
      const btn = titleButtons(rect.width, rect.height, true).find((b) => b.id === "continue");
      await tapRect(btn, 400);
    },

    /** Wipe any save and start a fresh run from the title screen. */
    async newRun() {
      await page.evaluate((k) => localStorage.removeItem(k), KEY);
      await page.reload({ waitUntil: "load" });
      await settle(400);
      const btn = titleButtons(rect.width, rect.height, false).find((b) => b.id === "new");
      await tapRect(btn, 500);
    },

    /** The title screen's buttons, for whether a save exists. */
    titleButtons: (saved) => titleButtons(rect.width, rect.height, saved),

    close: () => browser.close(),
  };
}

// --- Reporting -------------------------------------------------------------------

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
