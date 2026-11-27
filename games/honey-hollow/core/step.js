// @ts-check
/**
 * step(state, action) → { state, events }: the only way the game changes.
 *
 * Pure: the input state is never touched. A refused action returns the same
 * state object and one { type: "rejected", action, why } event; `why` is a
 * short stable code (docs/honey-hollow/architecture.md lists them all).
 * Every action is plain JSON, so a seed plus an action list replays any game
 * exactly.
 *
 * To add an action, add one line to ACTIONS pointing at a handler
 * `(state, action, events) => why | undefined` that mutates the copy.
 */

import { startDay, tick, sleep } from "./calendar.js";
import { createKeeper, setLook } from "./keeper.js";
import { plant, dig, pickBunch, buyPlot } from "./land.js";
import {
  buyHive,
  moveHive,
  upgradeHive,
  harvest,
  feed,
  dust,
  remedy,
  split,
  catchSwarm,
  fendWasps,
} from "./hives.js";
import { openStall, offer, pass, sellToGrocer, enterShow } from "./market.js";
import { craft } from "./workshop.js";
import { buy, claimGoal, seenYear, track } from "./progress.js";
import { readFact } from "./book.js";
import { clone } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */

/** @type {Record<string, import("./types.js").Handler>} */
export const ACTIONS = {
  createKeeper,
  setLook,
  startDay,
  tick,
  sleep,
  plant,
  dig,
  pickBunch,
  buyPlot,
  buyHive,
  moveHive,
  upgradeHive,
  harvest,
  feed,
  dust,
  remedy,
  split,
  catchSwarm,
  fendWasps,
  buy,
  enterShow,
  openStall,
  offer,
  pass,
  sellToGrocer,
  craft,
  claimGoal,
  readFact,
  seenYear,
};

/** @returns {{ state: State, events: GameEvent[] }} */
export function step(/** @type {State} */ state, /** @type {Action} */ action) {
  const type = action?.type;
  const refuse = (/** @type {string} */ why) => ({
    state,
    events: [{ type: "rejected", action: typeof type === "string" ? type : null, why }],
  });
  if (typeof type !== "string" || !Object.hasOwn(ACTIONS, type)) return refuse("unknown-action");
  if (!state.keeper.made && type !== "createKeeper") return refuse("no-keeper");
  const next = clone(state);
  /** @type {GameEvent[]} */
  const events = [];
  const why = ACTIONS[type](next, action, events);
  if (why) return refuse(why);
  track(next, events);
  return { state: next, events };
}
