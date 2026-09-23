/**
 * Where everything sits on the screen, as plain rectangles.
 *
 * Pure geometry: given the stage size, it says where the board, the bar and
 * every button are. game.js draws and hit-tests from it, and the browser test
 * harness taps from it — so there is exactly one copy of where things are, and
 * moving a button cannot silently leave the tests tapping thin air.
 *
 * Portrait, one thumb: the board floats up top where it can be seen, and
 * everything touched every turn sits in the bottom band under a thumb.
 */

const PAD = 10;
const TOP = 44;
const ROW = 54;

export function layout(W, H, size) {
  // The action row plus the soul row, kept in the bottom quarter.
  const barH = Math.min(166, Math.max(140, H * 0.25));
  const barY = H - barH;
  const avail = barY - TOP - PAD;
  const cell = Math.floor(Math.min((W - PAD * 2) / size, avail / size));
  const span = cell * size;
  const rowY = barY + 10;
  const slotsY = rowY + ROW + 10;
  return {
    W,
    H,
    pad: PAD,
    topH: TOP,
    barY,
    barH,
    cell,
    span,
    bx: Math.round((W - span) / 2),
    by: Math.round(TOP + (avail - span) / 2),
    /** The wide left-hand panel of the action row: hints, and the confirm button. */
    main: { x: PAD, y: rowY, w: W - PAD * 2 - 100, h: ROW },
    /** The right-hand button of the action row: Wait, Cancel, Skip, OK. */
    aside: { x: W - PAD - 90, y: rowY, w: 90, h: ROW },
    slotsY,
    slotsH: Math.max(48, H - slotsY - 12),
  };
}

/** Soul slot `i` of `n` along the bottom row. */
export function slotRect(L, i, n) {
  const gap = 8;
  const w = (L.W - L.pad * 2 - gap * (n - 1)) / n;
  return { x: L.pad + i * (w + gap), y: L.slotsY, w, h: L.slotsH };
}

/** The centre of square (r, c). */
export const cellCenter = (L, r, c) => ({
  x: L.bx + (c + 0.5) * L.cell,
  y: L.by + (r + 0.5) * L.cell,
});

/** The codex button, top right. */
export const codexButton = (L) => ({ x: L.W - 44, y: 4, w: 36, h: 36 });

/** The strip of relic glyphs along the top, which opens the codex on your relics. */
export const relicStrip = (L, hearts) => {
  const x = 16 + hearts * 19 + 6;
  return { x, y: 4, w: Math.max(0, L.W - 52 - x), h: 36 };
};

/** Title screen buttons, top to bottom. `saved` adds a Continue at the top. */
export function titleButtons(W, H, saved) {
  const w = Math.min(280, W - 60);
  const x = W / 2 - w / 2;
  let y = H * 0.2 + 160;
  const out = [];
  if (saved) {
    out.push({ id: "continue", x, y, w, h: 58 });
    y += 68;
    out.push({ id: "new", x, y, w, h: 52 });
    y += 62;
  } else {
    out.push({ id: "new", x, y, w, h: 58 });
    y += 68;
  }
  out.push({ id: "codex", x, y, w, h: 52 });
  return out;
}

/** The three relic cards of a draft. */
export function draftCards(W, H, n) {
  const pad = 18;
  const h = 86;
  const top = Math.max(150, H * 0.13 + 100);
  return Array.from({ length: n }, (_, i) => ({
    x: pad,
    y: top + i * (h + 12),
    w: W - pad * 2,
    h,
  }));
}

/** The codex's two buttons along the bottom: next page, and back. */
export function codexButtons(W, H) {
  const pad = 16;
  const w = (W - pad * 2 - 10) / 2;
  const y = H - 70;
  return { next: { x: pad, y, w, h: 52 }, back: { x: pad + w + 10, y, w, h: 52 } };
}

export const centre = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
