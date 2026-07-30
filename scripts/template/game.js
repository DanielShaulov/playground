/**
 * __TITLE__
 */

import { createLoop, createInput, vibrate, clamp, rand } from "../../shared/engine.js";
import { createShell } from "../../shared/ui.js";
import { createStore } from "../../shared/storage.js";

const shell = createShell({ title: "__TITLE__", stats: ["Score", "Best"] });
const { stage } = shell;
const store = createStore("__ID__");

let score = 0;
let playing = false;

function start() {
  score = 0;
  playing = true;
  shell.setStat("Score", 0);
  shell.overlay.hide();
}

function end() {
  playing = false;
  const isRecord = store.setBest("best", score);
  shell.setStat("Best", store.get("best", 0));
  shell.overlay.show({
    heading: isRecord ? "New best!" : "Game over",
    score,
    button: "Play again",
    onButton: start,
  });
}

createInput(stage, {
  onTap({ x, y }) {
    if (!playing) return;
    // TODO: your input goes here.
  },
  // onSwipe({ dir }) {},
  // onMove({ x, y, dx, dy }) {},
});

createLoop((dt) => {
  const { ctx, width, height } = stage;

  if (playing) {
    // TODO: your update goes here.
  }

  ctx.clearRect(0, 0, width, height);

  // TODO: your drawing goes here. Positions are in CSS pixels; use `width`
  // and `height` rather than constants so it fits every phone.
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.15, 0, Math.PI * 2);
  ctx.fill();
});

shell.setStat("Best", store.get("best", 0));
shell.overlay.show({
  heading: "__TITLE__",
  body: "Describe the controls here.",
  button: "Start",
  onButton: start,
});
