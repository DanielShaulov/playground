/**
 * Checkwiz — a wizard alone against a chess court.
 *
 * Not chess: there is one of you, you have no army, and nobody is trying to
 * mate you. What is borrowed is the part of chess that is interesting on a
 * phone — geometry. Every piece strikes the squares it would attack in a real
 * game, and every piece you take gives you one move in its shape.
 *
 * The rules live in rules.js and the screen geometry in layout.js, both pure,
 * so the simulator and the tests can use them directly. This file is
 * everything a person sees and touches: drawing, animation, input, saving.
 *
 * Everything is canvas, menus included. The board floats up top where it can
 * be seen; everything tapped every turn sits in the bottom band under a thumb.
 * The rules resolve a whole turn at once and hand back a list of events, and
 * the animation plays those back — so the state is always settled the moment
 * you tap, and a slow animation can never make a fast thumb lose a move.
 */

import { createLoop, createInput, vibrate, rand, randInt } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";
import * as R from "./rules.js";
import {
  layout,
  slotRect,
  cellCenter,
  codexButton,
  relicStrip,
  titleButtons,
  draftCards,
  codexButtons,
} from "./layout.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// Relic glyphs come from whatever symbol font the platform has; keep a deep
// fallback chain so none render as tofu. The pieces themselves are drawn.
const GLYPH = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", serif';

const FG = "#e8ecf4";
const DIM = "#8d98ad";
const FAINT = "#4b5566";
const CARD = "#1c2331";
const RAISED = "#232b3c";
const ACCENT = "#4ade80"; // the wizard, and everything that is his
const DANGER = "#f87171";
const GOLD = "#fbbf24";
const ROYAL = "#c084fc"; // the Sovereign and his guard

// --- Shell and persistence ----------------------------------------------------

const shell = createShell({ title: "Checkwiz", stats: ["Chamber", "Best"] });
const { stage } = shell;
const ctx = stage.ctx;
const store = createStore("checkwiz");

let run = null; // the live run, exactly as rules.js and the save file see it
let demo = R.newRun(); // a board to glow behind the title screen
let scene = "title"; // title | play | draft | codex | over
let codexFrom = "title";
let codexPage = 0;
let savedRun = null;

function loadRun() {
  const saved = store.get("run", null);
  // An older save is a different game; not worth migrating for a toy.
  if (!saved || saved.v !== R.SAVE_V || !saved.board) return null;
  if (saved.phase === "dead" || saved.phase === "won") return null;
  return saved;
}

function persist() {
  if (run.phase === "dead" || run.phase === "won") store.clear("run");
  else store.set("run", run);
}

const best = () => store.get("best", 0);

function syncHud() {
  shell.setStat("Chamber", run ? Math.min(run.chamber, R.FINAL) : 1);
  shell.setStat("Best", best());
}

// --- Derived view -------------------------------------------------------------
// The danger map and the list of legal moves are recomputed only when the
// board changes, not every frame.

let version = 0;
let cached = null;

function view() {
  const r = run ?? demo;
  if (!cached || cached.version !== version || cached.run !== r) {
    const b = r.board;
    const king = R.kingOf(b);
    cached = {
      version,
      run: r,
      danger: R.dangerMap(r),
      opts: r.phase === "play" || r.phase === "bonus" ? R.options(r) : [],
      throne: king
        ? R.strikersAt(r, king.r, king.c, king).reduce((n, p) => n + R.KINDS[p.kind].hit, 0)
        : 0,
    };
  }
  return cached;
}

const touch = () => version++;

// --- Interface state ------------------------------------------------------------

let sel = null; // a move awaiting confirmation: an option from rules.options, or a costly wait
let aim = null; // the soul slot being aimed
let inspect = null; // id of the piece whose lines are on show

function clearUi() {
  sel = null;
  aim = null;
  inspect = null;
}

// --- Animation ------------------------------------------------------------------

let elapsed = 0;
let shake = 0;
let banner = null;
let flash = 0; // red vignette when struck
let sparks = [];
let floaters = [];
let beams = [];
let ghosts = []; // pieces that have just died, fading where they stood
let flights = []; // souls flying from a taken piece into the hand
let timeline = []; // { at, fn } — effects waiting their turn
let anim = new Map(); // piece id -> drawn position { x, y, delay, alpha }
let wiz = null; // the wizard's drawn position and any move in flight
let hits = []; // tappable rects, rebuilt every frame while drawing

const later = (delay, fn) => timeline.push({ at: elapsed + delay, fn });

function resetFx() {
  sparks = [];
  floaters = [];
  beams = [];
  ghosts = [];
  flights = [];
  timeline = [];
  anim = new Map();
  wiz = null;
  banner = null;
}

function say(text, color, at) {
  floaters.push({ text, color, r: at.r, c: at.c, life: 1.3, max: 1.3 });
}

function burst(r, c, color, count = 12, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(0.6, 2.6) * power;
    sparks.push({
      r,
      c,
      vr: Math.sin(a) * v,
      vc: Math.cos(a) * v,
      life: rand(0.35, 0.8),
      max: 0.8,
      color,
      size: rand(1.5, 3.5),
    });
  }
}

const announce = (text, color = FG, life = 2) => (banner = { text, color, life, max: life });

/**
 * Turn a turn's events into things to watch. The order is the order they
 * happened: the wizard moves and takes, the court strikes, then the court moves.
 */
function playBack(ev, prior) {
  const b = run.board;
  const w = { ...b.wizard };
  let strikeAt = 0.14;
  let moveAt = 0.3;
  let moves = 0;

  for (const e of ev) {
    switch (e.t) {
      case "walk":
      case "knight":
      case "bishop":
      case "rook":
      case "queen":
        wiz = {
          x: e.from.c,
          y: e.from.r,
          from: e.from,
          to: e.to,
          t: 0,
          dur: e.t === "walk" ? 0.12 : 0.26,
          arc: e.t === "knight" ? 0.9 : 0,
        };
        if (e.t !== "walk") burst(e.from.r, e.from.c, ACCENT, 10);
        vibrate(8);
        break;
      case "take": {
        const was = prior.find((p) => p.id === e.id);
        ghosts.push({ kind: e.kind, r: e.r, c: e.c, life: 0.5, max: 0.5, guard: was?.guard });
        const royal = e.kind === "king";
        later(0.08, () => {
          burst(e.r, e.c, royal ? ROYAL : GOLD, royal ? 36 : 16, royal ? 1.7 : 1.2);
          shake = Math.max(shake, royal ? 12 : 5);
          vibrate(royal ? 40 : 16);
        });
        break;
      }
      case "soul": {
        const i = run.hand.lastIndexOf(e.kind);
        flights.push({ kind: e.kind, from: { ...w }, slot: Math.max(0, i), t: -0.1, dur: 0.5 });
        later(0.1, () => say(`+${R.KINDS[e.kind].soul}`, ACCENT, w));
        break;
      }
      case "full":
        later(0.1, () => say("hand full", DIM, w));
        break;
      case "echo":
        later(0.2, () => say("the soul returns", ACCENT, w));
        break;
      case "fuse":
        later(0.3, () => announce("Three pawns crown a queen's soul", ACCENT));
        break;
      case "stone":
        burst(e.r, e.c, "#94a3b8", 12);
        vibrate(10);
        break;
      case "castle":
        later(0.15, () => announce("He castles!", ROYAL));
        break;
      case "strike": {
        const at = strikeAt;
        strikeAt += 0.07;
        later(at, () => {
          beams.push({
            r1: e.from.r,
            c1: e.from.c,
            r2: w.r,
            c2: w.c,
            life: 0.42,
            max: 0.42,
            color: DANGER,
            hop: e.kind === "knight",
          });
          say(`−${e.dmg}`, DANGER, w);
          burst(w.r, w.c, DANGER, 8 + e.dmg * 4, 1 + e.dmg * 0.2);
          shake = Math.max(shake, 6 + e.dmg * 3);
          flash = Math.min(1, flash + 0.35 + e.dmg * 0.1);
          vibrate(20 + e.dmg * 12);
        });
        moveAt = Math.max(moveAt, at + 0.2);
        break;
      }
      case "saved":
        later(strikeAt + 0.1, () => announce("Stalemate — you cling to one life", ACCENT, 2.4));
        break;
      case "move": {
        const a = anim.get(e.id);
        if (a) a.delay = moveAt + moves * 0.05;
        moves++;
        break;
      }
      case "crown":
        later(moveAt + 0.2, () => {
          burst(e.r, e.c, ROYAL, 20, 1.3);
          announce("A pawn is crowned", ROYAL);
          vibrate(30);
        });
        break;
      case "arrive":
        anim.set(e.id, { x: e.c, y: -0.9, delay: moveAt + 0.1, alpha: 0 });
        break;
      case "check":
        later(moveAt + 0.25, () => announce("Check", ROYAL, 1.4));
        break;
      case "stun":
        later(0.15, () => burst(e.r, e.c, "#93c5fd", 10));
        break;
      case "blitz":
        later(0.3, () => announce("Blitz — the court cannot answer", ACCENT, 1.4));
        break;
      case "sleep":
        later(0.15, () => say("the court sleeps", DIM, w));
        break;
      case "bonus":
        later(0.2, () => announce("Zwischenzug — a free step", ACCENT, 1.6));
        break;
      case "clear":
        for (const p of prior) {
          if (p.kind !== "king" && !ev.some((x) => x.t === "take" && x.id === p.id)) {
            ghosts.push({
              kind: p.kind,
              r: p.r,
              c: p.c,
              life: 0.9,
              max: 0.9,
              guard: p.guard,
              delay: 0.3,
            });
          }
        }
        later(0.25, () =>
          announce(
            e.flawless ? "Untouched — the Sovereign falls" : "The Sovereign falls",
            e.flawless ? ACCENT : ROYAL,
            1.4,
          ),
        );
        if (e.healed) later(0.5, () => say(`+${e.healed} life`, ACCENT, w));
        if (!ev.some((x) => x.t === "won")) {
          later(1.4, () => {
            scene = "draft";
            syncHud();
          });
        }
        break;
      case "dead":
        later(0.9, gameOver);
        break;
      case "won":
        store.set("wins", store.get("wins", 0) + 1);
        later(1.6, victory);
        break;
    }
  }
}

// --- Playing a move ---------------------------------------------------------------

function play(action) {
  if (!run || (run.phase !== "play" && run.phase !== "bonus")) return;
  const prior = run.board.pieces.map((p) => ({ ...p }));
  const chamber = run.chamber;
  const ev = R.act(run, action);
  if (!ev) {
    vibrate(4);
    return;
  }
  clearUi();
  touch();
  if (run.chamber > chamber) store.setBest("best", chamber);
  playBack(ev, prior);
  persist();
  syncHud();
}

/** Tapping a square: select, confirm, aim, or read, depending on what is going on. */
function tapSquare(r, c) {
  const { opts } = view();
  const b = run.board;

  if (aim !== null) {
    const o = opts.find((x) => x.type === "soul" && x.slot === aim && x.r === r && x.c === c);
    if (!o) {
      // Aiming at the throne is the one mistake worth explaining on the spot.
      if (R.pieceAt(b, r, c)?.kind === "king") {
        say("only by hand", ROYAL, { r, c });
        vibrate(4);
      }
      aim = null;
      sel = null;
      return;
    }
    if (sel && sel.r === r && sel.c === c) return play(sel);
    // A free move is just made; anything that costs life waits for a yes.
    if (o.cost === 0 && !o.target) return play(o);
    sel = o;
    return;
  }

  if (sel && sel.type !== "wait" && sel.r === r && sel.c === c) return play(sel);

  const step = opts.find((x) => x.type === "step" && x.r === r && x.c === c);
  if (step) {
    if (step.cost === 0 && !step.target) return play(step);
    sel = step;
    inspect = null;
    vibrate(4);
    return;
  }

  const p = R.pieceAt(b, r, c);
  sel = null;
  inspect = p && inspect !== p.id ? p.id : null;
}

function tapWait() {
  if (sel?.type === "wait") return play({ type: "wait" });
  const { danger } = view();
  const w = run.board.wizard;
  const cost = run.phase === "bonus" ? 0 : danger[w.r][w.c];
  if (cost === 0) return play({ type: "wait" });
  sel = { type: "wait", r: w.r, c: w.c, cost, strikers: R.strikersAt(run, w.r, w.c) };
  aim = null;
}

// --- Run flow -----------------------------------------------------------------------

function enterChamber() {
  clearUi();
  resetFx();
  touch();
  scene = "play";
  syncHud();
  const n = run.chamber;
  announce(`Chamber ${n} — ${R.chamberName(n)}`, run.board.boss ? ROYAL : FG, 2.2);
  if (n === R.FINAL)
    later(1.6, () => announce("The last Sovereign — he castles twice", ROYAL, 2.4));
  else if (run.board.boss)
    later(1.6, () => announce("A castle: his rook takes the first blow", ROYAL, 2.2));
}

function newRun() {
  shell.overlay.hide();
  savedRun = null;
  run = R.newRun();
  enterChamber();
  persist();
}

function resumeRun(saved) {
  run = saved;
  savedRun = null;
  shell.overlay.hide();
  if (run.phase === "draft") {
    resetFx();
    touch();
    scene = "draft";
    syncHud();
    return;
  }
  enterChamber();
}

function takeRelic(id) {
  if (!R.choose(run, id)) return;
  vibrate(20);
  enterChamber();
  persist();
}

function gameOver() {
  scene = "over";
  const cleared = run.chamber - 1;
  savedRun = null;
  syncHud();
  shell.overlay.show({
    heading: "The court closes in",
    score: cleared,
    body:
      `Cut down in chamber ${run.chamber}, ${R.chamberName(run.chamber)}. ` +
      `${run.captures} ${run.captures === 1 ? "piece" : "pieces"} taken, ` +
      `${run.flawless} ${run.flawless === 1 ? "chamber" : "chambers"} untouched. ` +
      `Deepest run: ${best()}.`,
    button: "New run",
    onButton: newRun,
  });
}

function victory() {
  scene = "over";
  savedRun = null;
  syncHud();
  shell.overlay.show({
    heading: "The Keep is yours",
    score: R.FINAL,
    body:
      `Fifteen Sovereigns taken, ${run.captures} pieces with them, ` +
      `${run.flawless} ${run.flawless === 1 ? "chamber" : "chambers"} untouched, ` +
      `${run.hp} life to spare. Keeps taken: ${store.get("wins", 0)}.`,
    button: "New run",
    onButton: newRun,
  });
}

function openCodex(from, page = 0) {
  codexFrom = from;
  codexPage = page;
  scene = "codex";
}

// --- Drawing primitives --------------------------------------------------------------

function text(str, x, y, opts = {}) {
  const {
    size = 14,
    color = FG,
    align = "center",
    baseline = "middle",
    weight = 400,
    font = FONT,
    alpha = 1,
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function panel(x, y, w, h, { fill = CARD, stroke = "rgba(255,255,255,0.07)", radius = 14 } = {}) {
  roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function wrap(str, width, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lines = [];
  let line = "";
  for (const word of str.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const TONES = {
  accent: [ACCENT, "#06210f"],
  danger: [DANGER, "#2a0808"],
  royal: [ROYAL, "#1e0b2e"],
  plain: [RAISED, FG],
};

/** Nothing tappable is ever shorter than a thumb; a disabled button does not register. */
function button(rect, label, { sub, tone = "accent", disabled = false, action } = {}) {
  const { x, y, w, h } = rect;
  const [bg, fg] = disabled ? ["#171d29", FAINT] : TONES[tone];
  roundRect(x, y, w, h, 13);
  ctx.fillStyle = bg;
  ctx.fill();
  if (tone === "plain" && !disabled) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const cx = x + w / 2;
  text(label, cx, y + h / 2 + (sub ? -8 : 0), { size: 15.5, weight: 650, color: fg });
  if (sub) text(sub, cx, y + h / 2 + 12, { size: 11, color: fg, alpha: 0.82 });
  if (!disabled && action) hits.push({ ...rect, action });
}

// --- The pieces --------------------------------------------------------------------------
// Drawn, not typed: chess glyphs come from a different font on every phone, and
// a board is only readable if a rook looks like a rook at 36 pixels.
// Coordinates are a 100-unit box centred on the square, base at +40.

const PLINTH = "M-30 40 L30 40 L30 33 Q30 26 23 26 L-23 26 Q-30 26 -30 33 Z";
const ball = (x, y, r) =>
  `M${x - r} ${y} A${r} ${r} 0 1 0 ${x + r} ${y} A${r} ${r} 0 1 0 ${x - r} ${y} Z`;

const SHAPES = {
  pawn: [
    PLINTH,
    "M-17 26 Q-11 12 -8 0 L-14 -2 Q-17 -8 -10 -10 L10 -10 Q17 -8 14 -2 L8 0 Q11 12 17 26 Z",
    ball(0, -24, 14),
  ].join(" "),
  rook: [
    PLINTH,
    "M-19 26 L-15 -10 L15 -10 L19 26 Z",
    "M-24 -8 L-24 -38 L-15 -38 L-15 -30 L-5 -30 L-5 -38 L5 -38 L5 -30 L15 -30 L15 -38 L24 -38 L24 -8 Z",
  ].join(" "),
  bishop: [
    PLINTH,
    "M-17 26 Q-10 12 -8 2 L-14 0 Q-16 -5 -10 -7 L10 -7 Q16 -5 14 0 L8 2 Q10 12 17 26 Z",
    "M0 -40 Q-18 -24 -12 -10 Q0 -4 12 -10 Q18 -24 0 -40 Z",
    ball(0, -43, 5),
  ].join(" "),
  knight: [
    PLINTH,
    "M-18 26 Q-21 8 -7 -3 Q-17 -1 -25 -5 Q-33 -10 -28 -17 L-12 -33 Q-9 -41 -3 -45 L1 -36 Q15 -36 21 -21 Q28 -3 21 26 Z",
  ].join(" "),
  queen: [
    PLINTH,
    "M-18 26 L-27 -20 L-16 -5 L-13 -30 L-5 -8 L0 -34 L5 -8 L13 -30 L16 -5 L27 -20 L18 26 Z",
    ball(-27, -21, 4.5),
    ball(-13, -31, 4.5),
    ball(0, -36, 4.5),
    ball(13, -31, 4.5),
    ball(27, -21, 4.5),
  ].join(" "),
  king: [
    PLINTH,
    "M-18 26 L-25 -12 Q0 -24 25 -12 L18 26 Z",
    "M-4 -46 L4 -46 L4 -38 L11 -38 L11 -31 L4 -31 L4 -19 L-4 -19 L-4 -31 L-11 -31 L-11 -38 L-4 -38 Z",
  ].join(" "),
};
const PATHS = Object.fromEntries(Object.entries(SHAPES).map(([k, d]) => [k, new Path2D(d)]));

const PALETTES = {
  court: ["#fbf3e1", "#c7b089", "#1b140d"],
  royal: ["#ffe9a3", "#d19a1c", "#2a1a04"],
  soul: ["#d9fbe5", "#34c26b", "#05230f"],
  stunned: ["#9aa3b3", "#5f6b80", "#151a24"],
  dim: ["#3a4458", "#2a3242", "#10141c"],
};

/**
 * One piece, centred on (x, y) and `size` pixels tall. The outline is a thick
 * stroke laid under the fill, so overlapping parts read as one silhouette.
 */
function drawShape(kind, x, y, size, palette = "court", alpha = 1) {
  const [top, bottom, edge] = PALETTES[palette];
  const s = size / 100;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  const path = PATHS[kind];
  ctx.lineJoin = "round";
  ctx.strokeStyle = edge;
  ctx.lineWidth = 9;
  ctx.stroke(path);
  const grad = ctx.createLinearGradient(0, -45, 0, 40);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fill(path);
  // A little detail that survives being small: the knight's eye, the mitre's slit.
  ctx.fillStyle = edge;
  if (kind === "knight") {
    ctx.beginPath();
    ctx.arc(-11, -24, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "bishop") {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(4, -30);
    ctx.lineTo(-5, -17);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Board ------------------------------------------------------------------------------

const MOTES = Array.from({ length: 12 }, () => ({
  x: Math.random(),
  y: Math.random(),
  kind: ["pawn", "knight", "bishop", "rook", "queen", "king"][randInt(0, 5)],
  size: rand(40, 110),
  speed: rand(0.004, 0.014),
}));

function drawBackdrop(L) {
  const grad = ctx.createRadialGradient(L.W / 2, L.H * 0.34, 20, L.W / 2, L.H * 0.34, L.H * 0.8);
  grad.addColorStop(0, "#161d2b");
  grad.addColorStop(1, "#0b0e15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, L.W, L.H);
  for (const m of MOTES) {
    const y = ((((m.y - elapsed * m.speed) % 1.2) + 1.2) % 1.2) * L.H;
    drawShape(m.kind, m.x * L.W, y, m.size, "dim", 0.35);
  }
}

function drawSquares(L, b, danger) {
  panel(L.bx - 7, L.by - 7, L.span + 14, L.span + 14, {
    fill: "#121824",
    stroke: "rgba(255,255,255,0.06)",
    radius: 16,
  });
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4);

  for (let r = 0; r < b.size; r++) {
    for (let c = 0; c < b.size; c++) {
      const x = L.bx + c * L.cell;
      const y = L.by + r * L.cell;
      ctx.fillStyle = (r + c) % 2 === 0 ? "#1d2434" : "#161b27";
      ctx.fillRect(x, y, L.cell, L.cell);

      const d = danger[r][c];
      if (d > 0 && !R.solidAt(b, r, c)) {
        // Light and dark squares take the same wash differently, so lift the
        // light ones — a threatened square has to read as one on both.
        const lift = (r + c) % 2 === 0 ? 0.04 : 0;
        ctx.fillStyle = `rgba(248,113,113,${0.14 + lift + Math.min(d, 4) * 0.07 + pulse * 0.04})`;
        ctx.fillRect(x, y, L.cell, L.cell);
        // The bill, readable without tapping anything: a pip per life up to
        // three, a number past that.
        if (d <= 3) {
          for (let i = 0; i < d; i++) {
            ctx.fillStyle = "rgba(254,202,202,0.95)";
            ctx.fillRect(x + 4 + i * 6, y + 4, 4, 4);
          }
        } else {
          text(String(d), x + 8, y + 9, { size: 10, weight: 800, color: "#fecaca" });
        }
      }
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < b.size; i++) {
    ctx.moveTo(L.bx + i * L.cell, L.by);
    ctx.lineTo(L.bx + i * L.cell, L.by + L.span);
    ctx.moveTo(L.bx, L.by + i * L.cell);
    ctx.lineTo(L.bx + L.span, L.by + i * L.cell);
  }
  ctx.stroke();
}

function drawTerrain(L, b) {
  for (const p of b.pillars) {
    const x = L.bx + p.c * L.cell;
    const y = L.by + p.r * L.cell;
    const s = L.cell;
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, "#39414f");
    g.addColorStop(1, "#20252f");
    roundRect(x + 3, y + 3, s - 6, s - 6, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + s / 2, y + s * 0.34, s * 0.3, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
  }
  for (const st of b.stones) {
    const x = L.bx + st.c * L.cell + 5;
    const y = L.by + st.r * L.cell + 5;
    const s = L.cell - 10;
    roundRect(x, y, s, s, 6);
    ctx.fillStyle = "#56627a";
    ctx.fill();
    ctx.strokeStyle = "#8391ab";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    roundRect(x, y, s, s, 6);
    ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + s / 2);
    ctx.lineTo(x + s, y + s / 2);
    ctx.moveTo(x + s / 2, y);
    ctx.lineTo(x + s / 2, y + s / 2);
    ctx.moveTo(x + s * 0.25, y + s / 2);
    ctx.lineTo(x + s * 0.25, y + s);
    ctx.stroke();
    ctx.restore();
    if (st.life < 50) text(String(st.life), x + s - 6, y + s - 7, { size: 9, color: "#dbe4f3" });
  }
}

/** Squares you could step to for nothing: outlined, so a safe walk is a glance. */
function drawStepHints(L, opts) {
  if (aim !== null || sel) return;
  for (const o of opts) {
    if (o.type !== "step" || o.target || o.cost > 0) continue;
    ctx.strokeStyle = "rgba(74,222,128,0.3)";
    ctx.lineWidth = 2;
    roundRect(L.bx + o.c * L.cell + 4, L.by + o.r * L.cell + 4, L.cell - 8, L.cell - 8, 8);
    ctx.stroke();
  }
}

/** Where the soul being aimed can go, each tagged with its price. */
function drawSoulTargets(L, opts) {
  if (aim === null) return;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5);
  for (const o of opts) {
    if (o.type !== "soul" || o.slot !== aim) continue;
    const x = L.bx + o.c * L.cell;
    const y = L.by + o.r * L.cell;
    roundRect(x + 3, y + 3, L.cell - 6, L.cell - 6, 9);
    ctx.fillStyle = `rgba(74,222,128,${0.1 + pulse * 0.08})`;
    ctx.fill();
    ctx.strokeStyle =
      o.cost > 0
        ? `rgba(251,191,36,${0.6 + pulse * 0.3})`
        : `rgba(74,222,128,${0.6 + pulse * 0.3})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (o.cost > 0) {
      text(`−${o.cost}`, x + L.cell - 10, y + L.cell - 10, { size: 11, weight: 800, color: GOLD });
    }
  }
}

/** The lines of the piece being inspected — the game's teaching tool. */
function drawInspection(L, b) {
  const p = inspect !== null ? b.pieces.find((x) => x.id === inspect) : null;
  if (!p) return;
  const squares = R.attacksOf(run ?? demo, p);
  const pulse = 0.55 + 0.45 * Math.sin(elapsed * 4);
  const from = cellCenter(L, p.r, p.c);
  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.25 + pulse * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of squares) {
    const to = cellCenter(L, s.r, s.c);
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
  for (const s of squares) {
    roundRect(L.bx + s.c * L.cell + 3, L.by + s.r * L.cell + 3, L.cell - 6, L.cell - 6, 8);
    ctx.strokeStyle = `rgba(251,191,36,${0.4 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** A pending move, and a dashed line from everyone who will strike you for it. */
function drawSelection(L) {
  if (!sel) return;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
  const x = L.bx + sel.c * L.cell;
  const y = L.by + sel.r * L.cell;
  roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, 9);
  ctx.strokeStyle = sel.cost > 0 ? DANGER : ACCENT;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!sel.strikers?.length) return;
  const to = sel.stone
    ? cellCenter(L, run.board.wizard.r, run.board.wizard.c)
    : cellCenter(L, sel.r, sel.c);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(248,113,113,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const p of sel.strikers) {
    const from = cellCenter(L, p.r, p.c);
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
  ctx.restore();
}

function piecePos(L, p) {
  let a = anim.get(p.id);
  if (!a) {
    a = { x: p.c, y: p.r, delay: 0, alpha: 1 };
    anim.set(p.id, a);
  }
  return { x: L.bx + (a.x + 0.5) * L.cell, y: L.by + (a.y + 0.5) * L.cell, alpha: a.alpha };
}

function drawPieces(L, b, live) {
  const w = b.wizard;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3);
  const { danger } = view();

  for (const p of b.pieces) {
    const { x, y, alpha } = piecePos(L, p);
    const royal = p.kind === "king";
    const held = live && R.cheb(w, p) === 1;

    // Shadow first, so everything stands on the board rather than floats.
    ctx.beginPath();
    ctx.ellipse(x, y + L.cell * 0.33, L.cell * 0.27, L.cell * 0.07, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
    ctx.fill();

    if (royal) {
      const checked = live && b.check;
      ctx.beginPath();
      ctx.arc(x, y, L.cell * 0.46, 0, Math.PI * 2);
      ctx.strokeStyle = checked
        ? `rgba(248,113,113,${0.5 + pulse * 0.5})`
        : `rgba(192,132,252,${0.2 + pulse * 0.25})`;
      ctx.lineWidth = checked ? 3 : 2;
      ctx.stroke();
    }

    // Held: the ring says what taking it would cost — green free, gold not.
    if (held) {
      const cost = danger[p.r][p.c];
      ctx.beginPath();
      ctx.arc(x, y, L.cell * 0.44, 0, Math.PI * 2);
      ctx.strokeStyle = cost === 0 ? ACCENT : GOLD;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 3]);
      ctx.lineDashOffset = -elapsed * 12;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const palette = p.stun > 0 ? "stunned" : royal ? "royal" : "court";
    ctx.save();
    if (royal) {
      ctx.shadowColor = ROYAL;
      ctx.shadowBlur = 14;
    }
    drawShape(p.kind, x, y + L.cell * 0.02, L.cell * (royal ? 0.84 : 0.78), palette, alpha);
    ctx.restore();

    // The palace guard wears his colour: a gem at the foot.
    if (p.guard && !royal) {
      const gx = x;
      const gy = y + L.cell * 0.34;
      const g = L.cell * 0.07;
      ctx.beginPath();
      ctx.moveTo(gx, gy - g);
      ctx.lineTo(gx + g, gy);
      ctx.lineTo(gx, gy + g);
      ctx.lineTo(gx - g, gy);
      ctx.closePath();
      ctx.fillStyle = ROYAL;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.stun > 0) {
      text("✦", x + L.cell * 0.3, y - L.cell * 0.3, { size: 12, font: GLYPH, color: "#93c5fd" });
    }
    if (royal && live && b.check) {
      text("CHECK", x, y - L.cell * 0.56, { size: 9, weight: 800, color: DANGER });
    }
  }

  for (const g of ghosts) {
    if (g.delay > 0) {
      const p = cellCenter(L, g.r, g.c);
      drawShape(g.kind, p.x, p.y, L.cell * 0.78, "court");
      continue;
    }
    const t = g.life / g.max;
    const p = cellCenter(L, g.r, g.c);
    drawShape(g.kind, p.x, p.y - (1 - t) * 8, L.cell * (0.78 + (1 - t) * 0.25), "court", t);
  }
}

function drawWizard(L, b) {
  if (!wiz) wiz = { x: b.wizard.c, y: b.wizard.r };
  let wx = wiz.x;
  let wy = wiz.y;
  if (wiz.to) {
    const t = Math.min(1, wiz.t / wiz.dur);
    const e = t * t * (3 - 2 * t);
    wx = wiz.from.c + (wiz.to.c - wiz.from.c) * e;
    wy = wiz.from.r + (wiz.to.r - wiz.from.r) * e - Math.sin(Math.PI * t) * wiz.arc;
  }
  const x = L.bx + (wx + 0.5) * L.cell;
  const y = L.by + (wy + 0.5) * L.cell;
  const s = L.cell / 44;
  const bob = Math.sin(elapsed * 2.5) * 1.2;

  // Tethers: the pieces he is holding, so "held" is something you can see.
  for (const p of b.pieces) {
    if (R.cheb(b.wizard, p) !== 1 || wiz.to) continue;
    const to = cellCenter(L, p.r, p.c);
    ctx.save();
    ctx.strokeStyle = "rgba(74,222,128,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = elapsed * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, "rgba(74,222,128,0.32)");
  glow.addColorStop(1, "rgba(74,222,128,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-26, -26, 52, 52);

  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.quadraticCurveTo(11, -2, 13, 17);
  ctx.lineTo(-13, 17);
  ctx.quadraticCurveTo(-11, -2, 0, -13);
  ctx.closePath();
  ctx.fillStyle = "#1f6f45";
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -13, 7.5, Math.PI, 0);
  ctx.lineTo(6, -7);
  ctx.quadraticCurveTo(0, -3, -6, -7);
  ctx.closePath();
  ctx.fillStyle = "#2a8a58";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -10.5, 4.6, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1a12";
  ctx.fill();
  ctx.fillStyle = "#9dffc4";
  ctx.fillRect(-2.6, -11.4, 1.7, 2.2);
  ctx.fillRect(1, -11.4, 1.7, 2.2);

  // The staff's orb brightens with every soul he carries.
  ctx.strokeStyle = "#8a6a45";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(11, 17);
  ctx.lineTo(9, -17);
  ctx.stroke();
  const held = run ? run.hand.length : 0;
  const orb = 2.4 + held * 0.7 + Math.sin(elapsed * 4) * 0.35;
  ctx.beginPath();
  ctx.arc(9, -18, orb, 0, Math.PI * 2);
  ctx.fillStyle = "#86efac";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 8 + held * 3;
  ctx.fill();
  ctx.restore();
}

function drawEffects(L) {
  for (const b of beams) {
    const t = b.life / b.max;
    const a = cellCenter(L, b.r1, b.c1);
    const z = cellCenter(L, b.r2, b.c2);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2 + t * 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    if (b.hop) {
      // A knight's strike arcs, because a knight's move is not a line.
      ctx.quadraticCurveTo(
        (a.x + z.x) / 2 + (z.y - a.y) * 0.3,
        (a.y + z.y) / 2 - (z.x - a.x) * 0.3,
        z.x,
        z.y,
      );
    } else {
      ctx.lineTo(z.x, z.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const s of sparks) {
    const p = cellCenter(L, s.r, s.c);
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const f of floaters) {
    const t = f.life / f.max;
    const p = cellCenter(L, f.r, f.c);
    text(f.text, p.x, p.y - L.cell * 0.4 - (1 - t) * 26, {
      size: 15,
      weight: 800,
      color: f.color,
      alpha: Math.min(1, t * 1.6),
    });
  }
}

/** Souls in flight from a taken piece to their slot in the hand. */
function drawFlights(L) {
  if (!run) return;
  for (const f of flights) {
    if (f.t < 0) continue;
    const t = Math.min(1, f.t / f.dur);
    const e = 1 - (1 - t) * (1 - t);
    const a = cellCenter(L, f.from.r, f.from.c);
    const slot = slotRect(L, Math.min(f.slot, run.slots - 1), run.slots);
    const zx = slot.x + slot.w / 2;
    const zy = slot.y + slot.h / 2;
    const x = a.x + (zx - a.x) * e;
    const y = a.y + (zy - a.y) * e - Math.sin(Math.PI * e) * 60;
    ctx.save();
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 16;
    drawShape(f.kind, x, y, 26 + (1 - t) * 10, "soul", 1 - t * 0.3);
    ctx.restore();
  }
}

function drawFlash(L) {
  if (flash <= 0) return;
  const g = ctx.createRadialGradient(L.W / 2, L.H / 2, L.H * 0.25, L.W / 2, L.H / 2, L.H * 0.75);
  g.addColorStop(0, "rgba(248,113,113,0)");
  g.addColorStop(1, `rgba(248,113,113,${flash * 0.35})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
}

function drawBanner(L) {
  if (!banner) return;
  const t = banner.life / banner.max;
  const alpha = Math.min(1, t * 3, (1 - t) * 8 + 0.2);
  const y = L.by + L.span / 2;
  ctx.font = `700 18px ${FONT}`;
  const width = Math.min(L.W - 24, ctx.measureText(banner.text).width + 44);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  panel(L.W / 2 - width / 2, y - 26, width, 52, {
    fill: "rgba(10,13,20,0.9)",
    stroke: "rgba(255,255,255,0.08)",
  });
  ctx.restore();
  text(banner.text, L.W / 2, y, { size: 18, weight: 700, color: banner.color, alpha });
}

// --- Top strip and bar -----------------------------------------------------------------

function drawTop(L) {
  const y = L.topH / 2;
  for (let i = 0; i < run.maxHp; i++) {
    const filled = i < run.hp;
    text("♥", 16 + i * 19, y, {
      size: 17,
      font: GLYPH,
      color: filled ? "#fb7185" : "#333c4d",
    });
  }

  // Relics as a row of glyphs; tap them to read what they do.
  const owned = Object.keys(run.relics);
  const strip = relicStrip(L, run.maxHp);
  const fit = Math.max(0, Math.floor(strip.w / 20));
  owned.slice(0, fit).forEach((id, i) => {
    text(R.relicById(id).glyph, strip.x + 10 + i * 20, y, { size: 15, font: GLYPH, color: ACCENT });
  });
  if (owned.length) hits.push({ ...strip, action: () => openCodex("play", 3) });

  button(codexButton(L), "?", { tone: "plain", action: () => openCodex("play") });
}

function hintText(b) {
  const { throne } = view();
  if (run.chamber === 1 && b.turn <= 2) return "Tap a piece to see which squares it strikes.";
  if (run.chamber === 1 && run.captures === 0)
    return "Walk up beside a piece and it is held. Take it from a quiet side.";
  if (run.hand.length && run.chamber <= 2 && !run.board.check)
    return "Tap a soul below to spend it: one move in that piece's shape.";
  if (b.check)
    return throne
      ? `Check. Taking him costs ${throne}.`
      : "Check — and his square is bare. Take him.";
  if (throne === 0) return "His square is bare. Walk up beside him, then take him.";
  return `Turn ${b.turn} · his square costs ${throne}`;
}

function describe(o) {
  if (o.type === "wait") return "Wait";
  if (o.stone) return "Raise a stone";
  if (o.target) return `Take the ${R.KINDS[o.target.kind].name}`;
  if (o.type === "soul") return `${R.KINDS[o.kind].soul} here`;
  return "Step here";
}

function drawBar(L) {
  panel(0, L.barY, L.W, L.barH + 40, {
    fill: "rgba(15,19,28,0.95)",
    stroke: "rgba(255,255,255,0.06)",
    radius: 20,
  });
  const b = run.board;
  const live = run.phase === "play" || run.phase === "bonus";

  if (sel) {
    const kills = sel.cost >= run.hp;
    const sub =
      sel.cost > 0
        ? `${sel.cost} damage — ${kills ? "this kills you" : "confirm"}`
        : sel.type === "wait"
          ? "pass the turn"
          : "free";
    button(L.main, describe(sel), {
      sub,
      tone: sel.cost > 0 ? "danger" : sel.target?.kind === "king" ? "royal" : "accent",
      action: () => (sel.type === "wait" ? play({ type: "wait" }) : play(sel)),
    });
    button(L.aside, "Cancel", { tone: "plain", action: () => (sel = null) });
  } else if (aim !== null && run.hand[aim]) {
    const kind = run.hand[aim];
    panel(L.main.x, L.main.y, L.main.w, L.main.h, { fill: "rgba(20,70,42,0.55)" });
    text(`${R.KINDS[kind].soul}`, L.main.x + 14, L.main.y + 15, {
      size: 14,
      weight: 700,
      align: "left",
      color: ACCENT,
    });
    wrap(R.KINDS[kind].soulTip, L.main.w - 24, 10.5)
      .slice(0, 2)
      .forEach((line, i) => {
        text(line, L.main.x + 14, L.main.y + 31 + i * 12.5, {
          size: 10.5,
          align: "left",
          color: DIM,
        });
      });
    button(L.aside, "Cancel", { tone: "plain", action: () => (aim = null) });
  } else if (run.phase === "bonus") {
    panel(L.main.x, L.main.y, L.main.w, L.main.h, { fill: "rgba(20,70,42,0.55)" });
    text("Zwischenzug", L.main.x + 16, L.main.y + 19, {
      size: 15,
      weight: 700,
      align: "left",
      color: ACCENT,
    });
    text("a free step before they move", L.main.x + 16, L.main.y + 38, {
      size: 11,
      align: "left",
      color: DIM,
    });
    button(L.aside, "Skip", { tone: "plain", action: () => play({ type: "wait" }) });
  } else if (inspect !== null && b.pieces.some((p) => p.id === inspect)) {
    // Reading a piece takes the whole row: a tip is worth more room than a
    // Close button, and tapping anywhere on it puts it away.
    const p = b.pieces.find((x) => x.id === inspect);
    const k = R.KINDS[p.kind];
    const row = { x: L.main.x, y: L.main.y, w: L.aside.x + L.aside.w - L.main.x, h: L.main.h };
    panel(row.x, row.y, row.w, row.h, { fill: RAISED });
    drawShape(p.kind, row.x + 24, row.y + row.h / 2 + 2, 34, p.kind === "king" ? "royal" : "court");
    const title =
      p.kind === "king"
        ? `Sovereign · his square costs ${view().throne}`
        : `${k.name}${p.guard ? " · palace guard" : ""} · hits ${k.hit}`;
    text(title, row.x + 48, row.y + 15, { size: 12.5, weight: 700, align: "left" });
    wrap(k.tip, row.w - 58, 11)
      .slice(0, 2)
      .forEach((line, i) => {
        text(line, row.x + 48, row.y + 31 + i * 13, { size: 11, color: DIM, align: "left" });
      });
    hits.push({ ...row, action: () => (inspect = null) });
  } else {
    panel(L.main.x, L.main.y, L.main.w, L.main.h, { fill: "rgba(35,43,60,0.6)" });
    const lines = wrap(live ? hintText(b) : "", L.main.w - 28, 12.5);
    lines.slice(0, 2).forEach((line, i, all) => {
      text(line, L.main.x + 14, L.main.y + L.main.h / 2 + (i - (all.length - 1) / 2) * 16, {
        size: 12.5,
        color: DIM,
        align: "left",
      });
    });
    const { danger } = view();
    const here = danger[b.wizard.r][b.wizard.c];
    button(L.aside, "Wait", {
      sub: here ? `costs ${here}` : "pass",
      tone: "plain",
      action: tapWait,
    });
  }

  // The hand: one slot per soul you can carry.
  for (let i = 0; i < run.slots; i++) {
    const r = slotRect(L, i, run.slots);
    const kind = run.hand[i];
    const active = aim === i;
    roundRect(r.x, r.y, r.w, r.h, 13);
    if (!kind) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    ctx.fillStyle = active ? "#16432a" : RAISED;
    ctx.fill();
    ctx.strokeStyle = active ? ACCENT : "rgba(74,222,128,0.25)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    const icon = Math.min(r.h * 0.62, r.w * 0.5);
    drawShape(kind, r.x + r.w / 2, r.y + r.h * 0.4, icon, "soul");
    text(R.KINDS[kind].soul, r.x + r.w / 2, r.y + r.h - 10, {
      size: 10.5,
      weight: 650,
      color: active ? ACCENT : FG,
    });
    if (live && run.phase !== "bonus") {
      hits.push({
        ...r,
        action: () => {
          sel = null;
          inspect = null;
          aim = aim === i ? null : i;
          vibrate(6);
        },
      });
    }
  }
}

// --- Screens ------------------------------------------------------------------------------

function drawTitle(L) {
  const cx = L.W / 2;
  const top = L.H * 0.2;
  ctx.save();
  ctx.shadowColor = ROYAL;
  ctx.shadowBlur = 36;
  drawShape("knight", cx, top - 6, 120, "royal");
  ctx.restore();
  text("CHECKWIZ", cx, top + 80, { size: 34, weight: 800 });
  text("Take the Sovereign. Keep what you take.", cx, top + 112, { size: 14, color: DIM });

  for (const btn of titleButtons(L.W, L.H, !!savedRun)) {
    if (btn.id === "continue") {
      button(btn, "Continue run", {
        sub: `chamber ${savedRun.chamber} · ${savedRun.hp} life`,
        action: () => resumeRun(savedRun),
      });
    } else if (btn.id === "new") {
      button(btn, savedRun ? "New run" : "Enter the first chamber", {
        tone: savedRun ? "plain" : "accent",
        action: newRun,
      });
    } else {
      button(btn, "How to play", { tone: "plain", action: () => openCodex("title") });
    }
  }
  const wins = store.get("wins", 0);
  const record = wins
    ? `The Keep taken ${wins === 1 ? "once" : `${wins} times`}`
    : `Deepest run: ${best()} of ${R.FINAL} chambers`;
  text(record, cx, L.H - 30, { size: 12, color: wins ? ROYAL : DIM });
}

const RULES = [
  "Red squares strike. When your move ends, everything attacking your square hits you — the pips say for how much.",
  "A piece that strikes stays put to do it. Everything else moves.",
  "Move up beside a piece and it is held: it cannot move away. It can still strike, so pick your side. Waiting holds nothing.",
  "Take a piece by moving onto it; the red on its square is the price. Its soul is yours: one move in its shape.",
  "Take the Sovereign by hand — a step, never a soul. Beside him is check, and the court gets one reply.",
  "Clear a chamber untouched and you heal. Souls do not survive the stairs.",
];

const CODEX_PAGES = ["The Court", "Souls", "The Rules", "Your Relics"];

function drawCodex(L) {
  ctx.fillStyle = "rgba(8,10,15,0.94)";
  ctx.fillRect(0, 0, L.W, L.H);
  const pad = 16;
  const width = L.W - pad * 2;
  const buttons = codexButtons(L.W, L.H);
  text(CODEX_PAGES[codexPage], L.W / 2, 32, { size: 22, weight: 700 });
  let y = 58;
  const room = buttons.next.y - 10;

  if (codexPage === 0 || codexPage === 1) {
    // The court page says what each piece does to you, the souls page what
    // it does for you once taken. One page could not hold both on a small phone.
    const souls = codexPage === 1;
    const kinds = ["pawn", "knight", "bishop", "rook", "queen", "king"].filter(
      (k) => !souls || R.KINDS[k].soul,
    );
    const each = Math.min(76, (room - y) / kinds.length - 6);
    for (const key of kinds) {
      const k = R.KINDS[key];
      panel(pad, y, width, each, { fill: CARD });
      const palette = souls ? "soul" : key === "king" ? "royal" : "court";
      drawShape(key, pad + 26, y + each / 2 + 2, Math.min(44, each * 0.7), palette);
      text(souls ? k.soul : k.name, pad + 52, y + 15, {
        size: 13,
        weight: 700,
        align: "left",
        color: souls ? ACCENT : FG,
      });
      const right = souls
        ? `from the ${k.name.toLowerCase()}`
        : k.hit
          ? `hits ${k.hit}`
          : "no strike";
      text(right, L.W - pad - 10, y + 15, {
        size: 11,
        color: !souls && k.hit > 1 ? DANGER : DIM,
        align: "right",
      });
      wrap(souls ? k.soulTip : k.tip, width - 64, 11)
        .slice(0, 2)
        .forEach((line, i) => {
          text(line, pad + 52, y + 31 + i * 13, { size: 11, color: DIM, align: "left" });
        });
      y += each + 6;
    }
  } else if (codexPage === 2) {
    RULES.forEach((rule, i) => {
      const lines = wrap(rule, width - 34, 12);
      text(String(i + 1), pad + 10, y + 9, { size: 16, weight: 800, color: ROYAL });
      lines.forEach((line, j) => {
        text(line, pad + 30, y + 9 + j * 15, { size: 12, color: FG, align: "left", alpha: 0.85 });
      });
      y += lines.length * 15 + 12;
    });
  } else {
    const source = run ?? savedRun;
    const owned = source ? Object.keys(source.relics) : [];
    const spent = source ? [...new Set(source.spent)].filter((id) => !owned.includes(id)) : [];
    if (!owned.length && !spent.length) {
      wrap(
        "No relics yet. Every time a Sovereign falls, you choose one of three.",
        width - 20,
        13,
      ).forEach((line, i) => text(line, L.W / 2, y + 30 + i * 18, { size: 13, color: DIM }));
    }
    for (const id of [...owned, ...spent]) {
      const relic = R.relicById(id);
      const used = !owned.includes(id);
      const lines = wrap(relic.blurb + (used ? " (spent)" : ""), width - 60, 11);
      const h = 24 + lines.length * 13;
      if (y + h > room) break;
      panel(pad, y, width, h, { fill: CARD });
      text(relic.glyph, pad + 22, y + h / 2, {
        size: 20,
        font: GLYPH,
        color: used ? FAINT : ACCENT,
      });
      const n = used ? source.spent.filter((x) => x === id).length : (source.relics[id] ?? 0);
      text(`${relic.name}${n > 1 ? ` ×${n}` : ""}`, pad + 44, y + 13, {
        size: 12.5,
        weight: 700,
        align: "left",
        color: used ? FAINT : FG,
      });
      lines.forEach((line, i) =>
        text(line, pad + 44, y + 29 + i * 13, { size: 11, color: DIM, align: "left" }),
      );
      y += h + 6;
    }
  }

  const next = (codexPage + 1) % CODEX_PAGES.length;
  button(buttons.next, CODEX_PAGES[next], { tone: "plain", action: () => (codexPage = next) });
  button(buttons.back, "Back", { action: () => (scene = codexFrom) });
}

function drawDraft(L) {
  ctx.fillStyle = "rgba(8,10,15,0.9)";
  ctx.fillRect(0, 0, L.W, L.H);
  const cx = L.W / 2;
  const top = L.H * 0.1;
  text("The Sovereign falls", cx, top, { size: 25, weight: 800, color: ROYAL });
  text(
    `Down to chamber ${run.chamber} of ${R.FINAL}, ${R.chamberName(run.chamber)}.`,
    cx,
    top + 28,
    {
      size: 12.5,
      color: DIM,
    },
  );
  text("Take one.", cx, top + 52, { size: 13 });

  const cards = draftCards(L.W, L.H, run.draft.length);
  run.draft.forEach((id, i) => {
    const relic = R.relicById(id);
    const c = cards[i];
    panel(c.x, c.y, c.w, c.h, { fill: CARD, stroke: "rgba(74,222,128,0.25)" });
    text(relic.glyph, c.x + 34, c.y + c.h / 2, { size: 28, font: GLYPH, color: ACCENT });
    text(relic.name, c.x + 64, c.y + 26, { size: 17, weight: 700, align: "left" });
    wrap(relic.blurb, c.w - 80, 12)
      .slice(0, 2)
      .forEach((line, j) =>
        text(line, c.x + 64, c.y + 50 + j * 15, { size: 12, color: DIM, align: "left" }),
      );
    hits.push({ ...c, action: () => takeRelic(id) });
  });

  text(
    `${run.hp}/${run.maxHp} life · ${run.captures} taken · ${run.flawless} untouched`,
    cx,
    L.H - 36,
    { size: 12, color: DIM },
  );
}

// --- Frame ---------------------------------------------------------------------------------

function update(dt) {
  elapsed += dt;

  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].at <= elapsed) {
      const [due] = timeline.splice(i, 1);
      due.fn();
    }
  }

  const b = (run ?? demo).board;
  const k = Math.min(1, dt * 14);
  for (const p of b.pieces) {
    const a = anim.get(p.id);
    if (!a) continue;
    if (a.delay > 0) {
      a.delay -= dt;
      continue;
    }
    a.x += (p.c - a.x) * k;
    a.y += (p.r - a.y) * k;
    a.alpha += (1 - a.alpha) * k;
  }
  if (wiz?.to) {
    wiz.t += dt;
    if (wiz.t >= wiz.dur) wiz = { x: wiz.to.c, y: wiz.to.r };
  } else if (wiz) {
    wiz.x += (b.wizard.c - wiz.x) * k;
    wiz.y += (b.wizard.r - wiz.y) * k;
  }

  for (const s of sparks) {
    s.r += s.vr * dt;
    s.c += s.vc * dt;
    s.vr += dt * 1.6;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter((f) => f.life > 0);
  for (const x of beams) x.life -= dt;
  beams = beams.filter((x) => x.life > 0);
  for (const g of ghosts) {
    if (g.delay > 0) g.delay -= dt;
    else g.life -= dt;
  }
  ghosts = ghosts.filter((g) => g.life > 0);
  for (const f of flights) f.t += dt;
  flights = flights.filter((f) => f.t < f.dur);
  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }
  shake = Math.max(0, shake - dt * 34);
  flash = Math.max(0, flash - dt * 1.8);
}

createLoop((dt) => {
  update(dt);
  const source = run ?? demo;
  const b = source.board;
  const L = layout(stage.width, stage.height, b.size);
  hits = [];
  const { danger, opts } = view();
  const live = scene === "play" && !!run && (run.phase === "play" || run.phase === "bonus");

  ctx.clearRect(0, 0, L.W, L.H);
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawBackdrop(L);
  drawSquares(L, b, danger);
  drawTerrain(L, b);
  if (live) {
    drawStepHints(L, opts);
    drawSoulTargets(L, opts);
  }
  drawInspection(L, b);
  if (live) drawSelection(L);
  drawPieces(L, b, live);
  if (scene === "play" || scene === "over") drawWizard(L, b);
  drawEffects(L);
  ctx.restore();
  drawFlash(L);

  if (scene === "play") {
    drawTop(L);
    drawBar(L);
    drawFlights(L);
    drawBanner(L);
  } else if (scene === "title") {
    ctx.fillStyle = "rgba(8,10,15,0.74)";
    ctx.fillRect(0, 0, L.W, L.H);
    drawTitle(L);
  } else if (scene === "codex") {
    drawCodex(L);
  } else if (scene === "draft") {
    drawDraft(L);
  }
});

// --- Input ---------------------------------------------------------------------------------

createInput(stage, {
  onTap({ x, y }) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        h.action();
        return;
      }
    }
    if (scene !== "play" || !run || (run.phase !== "play" && run.phase !== "bonus")) return;
    const L = layout(stage.width, stage.height, run.board.size);
    const c = Math.floor((x - L.bx) / L.cell);
    const r = Math.floor((y - L.by) / L.cell);
    if (!R.inBoard(run.board, r, c)) {
      clearUi();
      return;
    }
    tapSquare(r, c);
  },
});

// --- Boot ------------------------------------------------------------------------------------

// A run left mid-chamber is offered back on the title screen.
savedRun = loadRun();
syncHud();
