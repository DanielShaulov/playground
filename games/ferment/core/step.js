// @ts-check
/**
 * step(state, action) → { state, events }: the only way the game changes.
 *
 * Pure: the input state is never touched. A rejected action returns the same
 * state object and one { type: "rejected", action, why } event. Every action
 * is plain JSON, so a seed plus an action list replays any game exactly.
 *
 * To add an action, add one line to ACTIONS pointing at a handler
 * `(state, action, events) => reason | undefined` that mutates the copy.
 */

import { tick, open, close, sleep } from "./clock.js";
import { brew, tipOut, serve } from "./shop.js";
import { sendAway } from "./customers.js";
import { preorder, startForOrder, acceptOrder, declineOrder, hold, release } from "./orders.js";
import { experiment } from "./bench.js";
import { buy } from "./market.js";
import { upgrade, claimGoal, track } from "./progress.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */

/** @type {Record<string, import("./types.js").Handler>} */
export const ACTIONS = {
  tick,
  open,
  close,
  sleep,
  brew,
  tipOut,
  serve,
  preorder,
  sendAway,
  buy,
  experiment,
  startForOrder,
  acceptOrder,
  hold,
  release,
  declineOrder,
  upgrade,
  claimGoal,
};

/** @returns {{ state: State, events: GameEvent[] }} */
export function step(/** @type {State} */ state, /** @type {Action} */ action) {
  const handler = Object.hasOwn(ACTIONS, action?.type) ? ACTIONS[action.type] : null;
  if (!handler)
    return { state, events: [{ type: "rejected", action: action?.type, why: "unknown action" }] };
  const next = structuredClone(state);
  /** @type {GameEvent[]} */
  const events = [];
  const why = handler(next, action, events);
  if (why) return { state, events: [{ type: "rejected", action: action.type, why }] };
  track(state, next, events);
  return { state: next, events };
}
