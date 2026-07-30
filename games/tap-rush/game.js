/**
 * Tap Rush — tap targets before they shrink away. 30 seconds.
 *
 * Doubles as the reference game: it exercises every part of the shared setup
 * (stage, loop, tap input, HUD stats, overlays, persistent best score), so
 * it's a reasonable thing to copy when starting something new.
 */

import { createLoop, createInput, vibrate, rand, randInt } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const ROUND_SECONDS = 30;
const TARGET_LIFETIME = 1.4; // seconds from spawn to gone
const MIN_RADIUS = 34; // never smaller than a fingertip

const shell = createShell({ title: "Tap Rush", stats: ["Time", "Score", "Best"] });
const { stage } = shell;
const store = createStore("tap-rush");

let targets = [];
let score = 0;
let timeLeft = ROUND_SECONDS;
let playing = false;

const best = () => store.get("best", 0);

function spawn() {
  // Radius shrinks as the round goes on, so it gets harder.
  const progress = 1 - timeLeft / ROUND_SECONDS;
  const radius = Math.max(MIN_RADIUS, rand(46, 70) - progress * 22);
  const margin = radius + 8;
  targets.push({
    x: rand(margin, stage.width - margin),
    y: rand(margin, stage.height - margin),
    radius,
    age: 0,
    hue: randInt(90, 210),
  });
}

function start() {
  targets = [];
  score = 0;
  timeLeft = ROUND_SECONDS;
  playing = true;
  shell.overlay.hide();
  shell.setStat("Score", 0);
  spawn();
}

function end() {
  playing = false;
  targets = [];
  // Compare before storing, and against a 0 floor — otherwise a first game
  // scoring nothing beats the "no score yet" sentinel and claims a record.
  const isRecord = score > best();
  store.setBest("best", score);
  shell.setStat("Best", best());
  shell.overlay.show({
    heading: isRecord ? "New best!" : "Time's up",
    score,
    body: isRecord ? "Nothing to beat but yourself now." : `Best so far: ${best()}`,
    button: "Play again",
    onButton: start,
  });
}

createInput(stage, {
  onTap({ x, y }) {
    if (!playing) return;

    // Newest target first: when they overlap, the one on top should win.
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      if (Math.hypot(x - t.x, y - t.y) <= t.radius) {
        targets.splice(i, 1);
        score++;
        shell.setStat("Score", score);
        vibrate(10);
        spawn();
        // A second target sometimes, to keep the pressure up.
        if (score % 5 === 0) spawn();
        return;
      }
    }

    // Missing costs you, otherwise mashing the screen would be optimal.
    score = Math.max(0, score - 1);
    shell.setStat("Score", score);
  },
});

createLoop((dt) => {
  const { ctx, width, height } = stage;

  if (playing) {
    timeLeft -= dt;
    shell.setStat("Time", Math.max(0, timeLeft).toFixed(1));

    for (const t of targets) t.age += dt;
    // Expired targets just vanish — the time pressure is punishment enough.
    const before = targets.length;
    targets = targets.filter((t) => t.age < TARGET_LIFETIME);
    if (targets.length < before || targets.length === 0) spawn();

    if (timeLeft <= 0) end();
  }

  ctx.clearRect(0, 0, width, height);

  for (const t of targets) {
    const life = 1 - t.age / TARGET_LIFETIME;
    const r = t.radius * (0.35 + 0.65 * life);

    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${t.hue} 70% 58% / ${0.25 + 0.55 * life})`;
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = `hsl(${t.hue} 80% 70%)`;
    ctx.stroke();
  }
});

shell.setStat("Time", ROUND_SECONDS.toFixed(1));
shell.setStat("Best", best());
shell.overlay.show({
  heading: "Tap Rush",
  body: "Tap the circles before they fade. Misses cost a point. 30 seconds.",
  button: "Start",
  onButton: start,
});
