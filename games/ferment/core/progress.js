// @ts-check
/**
 * Progression: shop upgrades, reputation tiers and the endless goals ladder.
 *
 * state.progress keeps what the shop has bought (`upgrades`, `crocks`), the
 * highest reputation tier it has reached (`tier`, never lost), the open rung
 * of the goals ladder (`goal`) and the lifetime `stats` the goals read.
 *
 * Content: content/upgrades.js (what can be bought), content/goals.js (tiers,
 * goals). Actions: `upgrade` (evening) and `claimGoal`.
 */

import { UPGRADES, UPGRADE_IDS } from "../content/upgrades.js";
import { GOALS, GOAL_TEXT, MORE, TIERS } from "../content/goals.js";
import { SERVINGS, SLOTS } from "../content/tuning.js";
import { menu } from "./bench.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Goal} Goal */
/** @typedef {import("./types.js").GoalKind} GoalKind */

/** @returns {import("./types.js").ProgressSlice} */
export function freshProgress() {
  return {
    upgrades: {},
    crocks: {},
    tier: 0,
    goal: 0,
    stats: { served: 0, earned: 0, delight: 0, bestDay: 0, orders: 0 },
  };
}

/** The highest reputation tier the shop has reached (index into TIERS). */
export const tierOf = (/** @type {State} */ s) => s.progress.tier;

/** Levels bought of a shelf or jars upgrade. */
const levelOf = (/** @type {State} */ s, /** @type {string} */ id) => s.progress.upgrades[id] ?? 0;

/** Shelf spots the shop has: SLOTS plus what shelf upgrades added. */
export function slotCount(/** @type {State} */ s) {
  let n = SLOTS;
  for (const id of UPGRADE_IDS)
    if (UPGRADES[id].kind === "shelf") n += levelOf(s, id) * (UPGRADES[id].slots ?? 0);
  return n;
}

/** Portions a jar started now holds: SERVINGS plus one per jars upgrade level. */
export function jarSize(/** @type {State} */ s) {
  let n = SERVINGS;
  for (const id of UPGRADE_IDS) if (UPGRADES[id].kind === "jars") n += levelOf(s, id);
  return n;
}

/** The crock fitted to a shelf spot: its upgrade id (null for a plain crock) and pace. */
export function crockAt(/** @type {State} */ s, /** @type {number} */ slot) {
  const id = s.progress.crocks[slot] ?? null;
  return { id, pace: id ? (UPGRADES[id].pace ?? 1) : 1 };
}

/** Upgrades bought so far, counting each level and each fitted crock. */
const upgradesBought = (/** @type {State} */ s) =>
  Object.values(s.progress.upgrades).reduce((a, b) => a + b, 0) +
  Object.keys(s.progress.crocks).length;

/** Every upgrade as the evening screen lists it. */
export function upgradeOffers(/** @type {State} */ s) {
  return UPGRADE_IDS.map((id) => {
    const u = UPGRADES[id];
    const crock = u.kind === "crock";
    const level = crock
      ? Object.values(s.progress.crocks).filter((c) => c === id).length
      : levelOf(s, id);
    const at = crock ? 0 : level;
    const next = at < u.levels.length ? { ...u.levels[at], level: at + 1 } : null;
    /** @type {import("./types.js").UpgradeOffer} */
    const offer = {
      id,
      name: u.name,
      kind: u.kind,
      text: u.text,
      level,
      next,
      locked: !!next && next.tier > tierOf(s),
    };
    if (u.pace !== undefined) offer.pace = u.pace;
    return offer;
  });
}

/** Rung `i` of the endless ladder: GOALS first, then MORE round after round. */
export function goalAt(/** @type {number} */ i) {
  if (i < GOALS.length) return GOALS[i];
  const j = i - GOALS.length;
  const m = MORE[j % MORE.length];
  const k = Math.floor(j / MORE.length) + 1;
  /** @type {Goal} */
  const goal = { kind: m.kind, n: m.n + k * m.step, reward: { coins: m.coins + k * m.more } };
  return goal;
}

/** How a goal reads on screen. */
export const goalText = (/** @type {Goal} */ goal) =>
  GOAL_TEXT[goal.kind].replace("{n}", String(goal.n));

/** Where the shop stands on a goal's measure. */
export function measure(/** @type {State} */ s, /** @type {GoalKind} */ kind) {
  if (kind === "recipes") return menu(s).length;
  if (kind === "regulars") return Object.values(s.regulars.met).filter((m) => !m.pending).length;
  if (kind === "rep") return s.shop.rep;
  if (kind === "upgrades") return upgradesBought(s);
  return s.progress.stats[kind];
}

/** The open rung of the ladder, how far along it is, and whether it can be claimed. */
export function goalNow(/** @type {State} */ s) {
  const i = s.progress.goal;
  const goal = goalAt(i);
  const have = measure(s, goal.kind);
  /** @type {import("./types.js").GoalNow} */
  const now = { i, goal, text: goalText(goal), have, ready: have >= goal.n };
  return now;
}

/**
 * { type: "upgrade", id, slot? } — buy the next level of an upgrade in the
 * evening; a crock needs the shelf `slot` to fit it to.
 */
export function upgrade(_s, _action, _events) {
  return "not open yet";
}

/** { type: "claimGoal" } — take the reward for the open goal once it is met. */
export function claimGoal(_s, _action, _events) {
  return "not open yet";
}
