/**
 * Shared plumbing for driving Checkwiz in a real browser.
 *
 * The game has no test hooks and should not grow any — it is a canvas and a
 * tap handler, and the moment it starts exporting internals for a test, the
 * test stops proving anything about the thing people actually play. So this
 * talks to it the way a thumb does, and reads it the way the game itself does:
 *
 *   - **Input** is real taps at real coordinates. `layout()` below mirrors
 *     `layout()` in game.js, which is the one piece of duplicated knowledge
 *     here. If the bar gets taller or the board moves, this is what to fix.
 *   - **Output** is `localStorage`. The game persists the whole run — board,
 *     pieces, life, mana — at the end of every turn, so the save file is a
 *     complete, honest state dump that costs the game nothing to provide.
 *   - **Setup** is also localStorage: write a save, reload, press Continue, and
 *     the game resumes any position you like. That is what makes it possible to
 *     ask "does a beam kill a warded king" without playing to chamber four.
 *
 * The one thing to know about timing: clearing a chamber does not persist
 * immediately. `clearChamber()` waits ~1.1s so the death burst can land before
 * the draft replaces the board, so a read taken straight after a killing blow
 * still shows the *old* chamber. Anything asserting that a chamber did **not**
 * clear has to outwait that, or it passes for the wrong reason. (It did, once.)
 */
import { chromium, devices } from "playwright-core";

export const URL = process.env.CHECKWIZ_URL ?? "http://localhost:8000/games/checkwiz/";
export const KEY = "playground:checkwiz:run";

/** Chromium comes pre-installed in this repo's agent sessions; never fetch one. */
const CHROMIUM = process.env.CHECKWIZ_CHROMIUM ?? "/opt/pw-browsers/chromium";

/**
 * Save-format version to seed. Bump it in game.js and this follows; set it back
 * to an older number to point the same suite at an older build, which is how
 * you check that a regression test would actually have caught the regression.
 */
export const SAVE_V = Number(process.env.SAVE_V ?? 2);

// --- Board vocabulary, mirrored ---------------------------------------------
// Enough of the rules to reason about a position from outside: what attacks
// what, what it costs, and what is holding a piece up.

export const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
export const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
export const ALL8 = [...ORTH, ...DIAG];
const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

export const SHAPE = {
  pawn: {
    steps: [
      [1, -1],
      [1, 1],
    ],
    hit: 1,
  },
  knight: { steps: KNIGHT, hit: 1 },
  bishop: { dirs: DIAG, hit: 1 },
  rook: { dirs: ORTH, hit: 2 },
  queen: { dirs: ALL8, hit: 3 },
  king: { steps: ALL8, hit: 1 },
};

export const cheb = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export const guardsOf = (b) => b.pieces.filter((p) => p.kind !== "king");

/** Every square a piece attacks. The wizard never blocks a line — game rule. */
export function raysOf(b, p) {
  if (p.stun > 0) return [];
  // A Sovereign whose court has fallen projects nothing: his ward is his aura.
  if (p.kind === "king" && !guardsOf(b).length) return [];
  const on = (r, c) => r >= 0 && c >= 0 && r < b.size && c < b.size;
  const busy = (r, c) =>
    b.pieces.some((q) => q !== p && q.r === r && q.c === c) ||
    b.walls.some((w) => w.r === r && w.c === c);
  const shape = SHAPE[p.kind];
  const out = [];
  if (shape.dirs) {
    for (const [dr, dc] of shape.dirs) {
      let r = p.r + dr;
      let c = p.c + dc;
      while (on(r, c)) {
        out.push({ r, c });
        if (busy(r, c)) break;
        r += dr;
        c += dc;
      }
    }
  } else {
    for (const [dr, dc] of shape.steps) {
      if (on(p.r + dr, p.c + dc)) out.push({ r: p.r + dr, c: p.c + dc });
    }
  }
  return out;
}

/** Life a square would cost to stand on, which is what the red ticks count. */
export function dangerMap(b) {
  const d = Array.from({ length: b.size }, () => new Array(b.size).fill(0));
  for (const p of b.pieces) for (const s of raysOf(b, p)) d[s.r][s.c] += SHAPE[p.kind].hit;
  return d;
}

/** The Sovereign holds up nobody — his ward shields him, never his court. */
export const defended = (b, piece) =>
  b.pieces.some(
    (p) =>
      p !== piece &&
      p.stun <= 0 &&
      p.kind !== "king" &&
      raysOf(b, p).some((s) => s.r === piece.r && s.c === piece.c),
  );

// --- Save building -----------------------------------------------------------

export const piece = (id, kind, r, c, stun = 0) => ({ id, kind, r, c, stun, ax: c, ay: r });

export function makeRun({
  chamber = 1,
  hp = 6,
  maxHp = 6,
  mana = 10,
  size = 7,
  captures = 0,
  up = {},
  pieces,
  wizard,
  royal = false,
  turn = 1,
}) {
  return {
    v: SAVE_V,
    chamber,
    hp,
    maxHp,
    mana,
    captures,
    up,
    board: { size, pieces, walls: [], wizard, turn, royal },
  };
}

// --- Driving -----------------------------------------------------------------

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

  /** Mirrors layout() in game.js. Board geometry lives here and nowhere else. */
  const layout = (size) => {
    const W = rect.width;
    const H = rect.height;
    const pad = 10;
    const topH = 44;
    const barH = Math.min(158, Math.max(132, H * 0.24));
    const barY = H - barH;
    const avail = barY - topH - pad;
    const cell = Math.floor(Math.min((W - pad * 2) / size, avail / size));
    const span = cell * size;
    return {
      W,
      H,
      pad,
      topH,
      barY,
      barH,
      cell,
      span,
      rowH: 54,
      bx: Math.round((W - span) / 2),
      by: Math.round(topH + (avail - span) / 2),
    };
  };

  const settle = (ms = 240) => page.waitForTimeout(ms);
  const tap = (x, y) => page.touchscreen.tap(rect.left + x, rect.top + y);

  const api = {
    page,
    browser,
    context,
    rect,
    errors,
    layout,
    settle,
    tap,

    /** The whole run as the game last persisted it, or null once it is over. */
    read: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY),

    async tapCell(size, r, c) {
      const L = layout(size);
      await tap(L.bx + (c + 0.5) * L.cell, L.by + (r + 0.5) * L.cell);
      await settle();
    },

    /** Right-hand button of the action row: Hold, or Cancel / OK / Close. */
    async tapAside(size) {
      const L = layout(size);
      await tap(L.W - L.pad - 45, L.barY + 10 + L.rowH / 2);
      await settle();
    },

    /**
     * Left-hand action button — the confirm for a pending move or capture.
     * Harmless when nothing is pending: the hint panel is not a button, and the
     * tap lands below the board, so it neither selects nor spends a turn.
     */
    async tapConfirm(size) {
      const L = layout(size);
      await tap(L.pad + (L.W - L.pad * 2 - 100) / 2, L.barY + 10 + L.rowH / 2);
      await settle();
    },

    /** Spell `i` of `count` in the spellbook row (0 = Leap, 1 = Bulwark, ...). */
    async tapSpell(size, i, count) {
      const L = layout(size);
      const width = L.W - L.pad * 2;
      const gap = 8;
      const bw = (width - gap * (count - 1)) / count;
      const by = L.barY + 10 + L.rowH + 10;
      const bh = Math.max(56, L.barH - L.rowH - 26);
      await tap(L.pad + i * (bw + gap) + bw / 2, by + bh / 2);
      await settle();
    },

    /** Seed a position, reload, and press Continue run. */
    async resume(run) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, run]);
      await page.reload({ waitUntil: "load" });
      await settle(400);
      const L = layout(run.board.size);
      await tap(L.W / 2, L.H * 0.17 + 160 + 29);
      await settle(400);
    },

    /** Wipe any save and start a fresh run from the title screen. */
    async newRun() {
      await page.evaluate((k) => localStorage.removeItem(k), KEY);
      await page.reload({ waitUntil: "load" });
      await settle(400);
      const L = layout(6);
      await tap(L.W / 2, L.H * 0.17 + 160 + 29); // "Enter the first chamber"
      await settle(500);
    },

    close: () => browser.close(),
  };
  return api;
}

/** How many spells the book shows at a given depth — see SPELLS[].from. */
export const bookSize = (chamber) => [1, 1, 2, 4, 6].filter((from) => chamber >= from).length;

// --- Reporting ---------------------------------------------------------------

export function createReport() {
  const results = [];
  return {
    check(name, ok, detail = "") {
      results.push({ name, ok });
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
      return ok;
    },
    finish() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} checks passed`);
      return failed;
    },
  };
}
