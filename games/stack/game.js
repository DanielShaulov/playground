/**
 * Stack — a block slides across the top of the tower; tap to drop it.
 *
 * Whatever hangs over the edge gets sliced off and falls away, so every
 * imprecise drop makes the tower narrower and the next one harder. Land one
 * within a few pixels and it snaps flush instead, keeping its full width —
 * that's the whole skill curve, and the reason there's a ceiling worth
 * chasing rather than just a difficulty ramp.
 *
 * World coordinates run *upward* from the bottom of the stage: a block's `y`
 * is its underside. Only the camera converts to screen space.
 */

import { createLoop, createInput, vibrate } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const BLOCK_H = 26;
const START_WIDTH = 0.62; // fraction of the stage
const BASE_SPEED = 165; // px/s for the first block
const SPEED_STEP = 7; // added per block placed
const MAX_SPEED = 430; // past this it stops being a game of skill
const PERFECT_TOL = 5; // px of slop that still counts as flush
// Keep the live block a quarter of the way down, so the tower you've built
// fills the rest of a tall screen instead of the empty sky above it.
const CAMERA_ANCHOR = 0.75;
const GRAVITY = 900;

const shell = createShell({ title: "Stack", stats: ["Score", "Best"] });
const { stage } = shell;
const store = createStore("stack");

let tower = []; // placed blocks: { x, w, y, hue }
let debris = []; // sliced-off pieces falling away
let live = null; // the block currently sliding
let camera = 0;
let score = 0;
let flash = 0; // fades out the highlight on a flush landing
let playing = false;

const best = () => store.get("best", 0);
const hueFor = (i) => (198 + i * 7) % 360;

/** Screen y of a block's top edge. */
const topOf = (b) => stage.height - (b.y + BLOCK_H - camera);

function reset() {
  const w = stage.width * START_WIDTH;
  tower = [{ x: (stage.width - w) / 2, w, y: 0, hue: hueFor(0) }];
  debris = [];
  camera = 0;
  score = 0;
  flash = 0;
  spawn();
}

function spawn() {
  const prev = tower[tower.length - 1];
  // Alternate the entry side so the rhythm doesn't turn into a metronome.
  const fromLeft = tower.length % 2 === 0;
  live = {
    x: fromLeft ? 0 : stage.width - prev.w,
    w: prev.w,
    y: prev.y + BLOCK_H,
    hue: hueFor(tower.length),
    dir: fromLeft ? 1 : -1,
    speed: Math.min(BASE_SPEED + tower.length * SPEED_STEP, MAX_SPEED),
  };
}

function drop() {
  const prev = tower[tower.length - 1];
  const w = live.w;
  let { x } = live;

  if (Math.abs(x - prev.x) <= PERFECT_TOL) x = prev.x;

  const left = Math.max(x, prev.x);
  const right = Math.min(x + w, prev.x + prev.w);
  const overlap = right - left;

  if (overlap <= 0) {
    end();
    return;
  }

  // Push the overhang off as debris — one piece per side that stuck out.
  if (x < left) {
    debris.push({ x, w: left - x, y: live.y, hue: live.hue, vx: -50, vy: 60 });
  }
  if (x + w > right) {
    debris.push({ x: right, w: x + w - right, y: live.y, hue: live.hue, vx: 50, vy: 60 });
  }

  tower.push({ x: left, w: overlap, y: live.y, hue: live.hue });
  score++;
  shell.setStat("Score", score);

  const flush = overlap === w;
  if (flush) flash = 1;
  vibrate(flush ? 22 : 10);

  spawn();
}

function end() {
  playing = false;
  // The block that missed topples off rather than just disappearing.
  debris.push({ ...live, vx: live.dir * 70, vy: 40 });
  live = null;

  const isRecord = score > best();
  store.setBest("best", score);
  shell.setStat("Best", best());
  shell.overlay.show({
    heading: isRecord ? "New best!" : "Toppled",
    score,
    body: isRecord ? `${score} blocks. Nothing to beat but yourself now.` : `Best so far: ${best()}`,
    button: "Play again",
    onButton: start,
  });
}

function start() {
  reset();
  playing = true;
  shell.setStat("Score", 0);
  shell.overlay.hide();
}

// Widths are stored in pixels, so a width change (rotation, or a desktop
// window drag) has to rescale the tower or the stack stops lining up.
let lastWidth = stage.width;
stage.onResize((w) => {
  if (w && lastWidth && w !== lastWidth) {
    const k = w / lastWidth;
    for (const b of [...tower, ...debris, live].filter(Boolean)) {
      b.x *= k;
      b.w *= k;
    }
  }
  lastWidth = w;
});

createInput(stage, {
  onTap() {
    if (playing && live) drop();
  },
});

function drawBlock(ctx, b, alpha = 1) {
  const top = topOf(b);
  if (top > stage.height || top + BLOCK_H < 0) return; // off-screen
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `hsl(${b.hue} 62% 55%)`;
  ctx.fillRect(b.x, top, b.w, BLOCK_H);
  ctx.fillStyle = `hsl(${b.hue} 72% 68%)`;
  ctx.fillRect(b.x, top, b.w, 3);
  ctx.globalAlpha = 1;
}

createLoop((dt) => {
  const { ctx, width, height } = stage;

  if (playing && live) {
    live.x += live.dir * live.speed * dt;
    if (live.x <= 0) {
      live.x = 0;
      live.dir = 1;
    } else if (live.x + live.w >= width) {
      live.x = width - live.w;
      live.dir = -1;
    }
  }

  // Ease the camera so the tower rises smoothly instead of jumping a block.
  const target = live ? Math.max(0, live.y + BLOCK_H - height * CAMERA_ANCHOR) : camera;
  camera += (target - camera) * Math.min(1, dt * 6);

  for (const d of debris) {
    d.vy -= GRAVITY * dt; // world y points up, so gravity is negative
    d.y += d.vy * dt;
    d.x += d.vx * dt;
  }
  debris = debris.filter((d) => topOf(d) < height + 120);

  flash = Math.max(0, flash - dt * 2.5);

  ctx.clearRect(0, 0, width, height);

  for (const b of tower) drawBlock(ctx, b);
  for (const d of debris) drawBlock(ctx, d, 0.5);
  if (live) drawBlock(ctx, live);

  if (flash > 0) {
    const b = tower[tower.length - 1];
    ctx.globalAlpha = flash;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, topOf(b), b.w, BLOCK_H);
    ctx.globalAlpha = 1;
  }
});

reset(); // so there's a tower behind the start overlay
shell.setStat("Score", 0);
shell.setStat("Best", best());
shell.overlay.show({
  heading: "Stack",
  body: "Tap to drop the block. Overhang gets sliced off — land it flush to keep your width.",
  button: "Start",
  onButton: start,
});
