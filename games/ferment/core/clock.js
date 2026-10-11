// @ts-check
/**
 * The day cycle and the fixed-step clock.
 *
 * A day is 24h of jar ageing: morning (plan) → open (OPEN_HOURS, the only part
 * that runs in real time) → evening → sleep, which ages jars through the night.
 *
 * While open, time only moves in fixed steps of STEP hours ({ type: "tick" }),
 * never by a real-time delta, so a fast phone and a slow phone play the same
 * game and a list of actions replays exactly. The UI turns real seconds into
 * whole steps (HOUR_SECONDS real seconds per in-game hour).
 */

import { OPEN_HOURS } from "../content/tuning.js";
import { ageJars } from "./jars.js";
import { firstArrival, leave, walkIns, wearPatience } from "./customers.js";
import { missOverdue, orderArrivals } from "./orders.js";
import { freshToday } from "./shop.js";

/** @typedef {import("./types.js").State} State */

export const STEPS_PER_HOUR = 120;
export const STEP = 1 / STEPS_PER_HOUR;
/** Most steps one tick action may carry (far more than a whole open day). */
export const MAX_TICK_STEPS = 10000;

/** One fixed step of the open shop. The order of the parts is part of the rules. */
function stepOpen(/** @type {State} */ s, events) {
  const dh = Math.min(STEP, OPEN_HOURS - s.clock.hour);
  s.clock.hour += dh;
  for (const jar of ageJars(s, dh)) events.push({ type: "popped", jar });
  orderArrivals(s, events);
  walkIns(s, events);
  wearPatience(s, dh, events);
  if (s.clock.hour >= OPEN_HOURS) closeNow(s, events);
}

/** { type: "tick", n? } — advance the open shop by n (default 1) fixed steps. */
export function tick(s, { n = 1 }, events) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_TICK_STEPS) return "bad step count";
  if (s.clock.phase !== "open") return "shop is not open";
  for (let i = 0; i < n && s.clock.phase === "open"; i++) stepOpen(s, events);
}

/** { type: "open" } */
export function open(s, _action, events) {
  if (s.clock.phase !== "morning") return "not morning";
  s.clock.phase = "open";
  s.clock.hour = 0;
  s.customers.nextArrival = firstArrival(s);
  s.shop.today = freshToday(s.shop.rep);
  events.push({ type: "opened" });
}

function closeNow(/** @type {State} */ s, events) {
  while (s.customers.queue.length) leave(s, events, "closed");
  missOverdue(s);
  s.clock.phase = "evening";
  events.push({ type: "closed", today: { ...s.shop.today } });
}

/** { type: "close" } — close early (the clock also closes the shop at OPEN_HOURS). */
export function close(s, _action, events) {
  if (s.clock.phase !== "open") return "not open";
  closeNow(s, events);
}

/** { type: "sleep" } — jars age through the night into the next morning. */
export function sleep(s, _action, events) {
  if (s.clock.phase !== "evening") return "not evening";
  const popped = ageJars(s, 24 - s.clock.hour);
  s.clock.day++;
  s.clock.hour = 0;
  s.clock.phase = "morning";
  events.push({ type: "slept", day: s.clock.day, popped });
}
