// The board planner's "start it then instead" tip (ui/board.js bestStart),
// which is pure enough to check in Node.
import test from "node:test";
import assert from "node:assert/strict";
import { bestStart } from "../../games/ferment/ui/board.js";

const dill = { recipe: "dill", adds: [] };
// Dill ripens in 48 h; this window wants it about 12 h old early on day 2.
const order = { recipe: "dill", lo: 0.17, hi: 0.33, due: 2, arriveAt: 0.5 };

test("bestStart: while open, the best start can be later today", () => {
  const t = bestStart({ clock: { day: 1, hour: 3, phase: "open" } }, order, dill);
  assert.ok(t && t.day === 1 && t.hour > 3 && t.hour < 12);
});

test("bestStart: after closing early, nothing is suggested for tonight", () => {
  const t = bestStart({ clock: { day: 1, hour: 3, phase: "evening" } }, order, dill);
  assert.ok(t === null || t.day >= 2, `suggested day ${t?.day} at ${t?.hour}`);
});
