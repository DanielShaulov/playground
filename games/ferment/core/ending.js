// @ts-check
/**
 * The end of the first month (content/ending.js): once day ENDING_DAY is
 * over, the next morning shows a short scene and a credit roll, once. The
 * shop is not finished by it: the player carries on from that morning.
 *
 * state.ending = { seen, name }: the scene has been watched; the three
 * letters the keeper signed the shop's book with ("" until then).
 *
 * Action { type: "ending", do }, only while the scene is due (endingDue):
 *   sign  { name }: three letters A-Z, once. Event: signed { name, onTime }.
 *   seen  the scene is over. Event: endingSeen { day }.
 * onTime: the scene came on the morning of day 31, so the takings are the
 * first month's exactly (the board of best months only takes those).
 * Watching it again from the settings is screen-only (ui/ending.js).
 */

import { ENDING_DAY } from "../content/ending.js";
import { TIERS } from "../content/goals.js";
import { menu } from "./bench.js";

/** @typedef {import("./types.js").State} State */

export const freshEnding = () => ({ seen: false, name: "" });

/** The scene is waiting: the first month is over, it's morning, and it hasn't been seen. */
export const endingDue = (/** @type {State} */ s) =>
  !s.ending.seen && s.clock.phase === "morning" && s.clock.day > ENDING_DAY;

/** @type {import("./types.js").Handler} */
export function ending(s, action, events) {
  if (!endingDue(s)) return "not due";
  if (action.do === "sign") {
    if (s.ending.name) return "already signed";
    if (typeof action.name !== "string" || !/^[A-Z]{3}$/.test(action.name)) return "not a name";
    s.ending.name = action.name;
    events.push({ type: "signed", name: action.name, onTime: onTime(s) });
    return;
  }
  if (action.do !== "seen") return "unknown ending step";
  s.ending.seen = true;
  events.push({ type: "endingSeen", day: s.clock.day });
}

/** The month's end came on day 31's morning: the takings are exactly the first month's. */
export const onTime = (/** @type {State} */ s) => s.clock.day === ENDING_DAY + 1;

/**
 * The shop's story so far, for the scene and the credits.
 * regulars: ids of the regulars won, most visits first.
 */
export function monthOf(/** @type {State} */ s) {
  const st = s.progress.stats;
  const regulars = Object.entries(s.regulars.met)
    .filter(([, m]) => !m.pending)
    .sort(([, a], [, b]) => b.visits - a.visits || a.since - b.since)
    .map(([id]) => id);
  return {
    days: Math.min(s.clock.day - 1, ENDING_DAY),
    served: st.served,
    earned: st.earned,
    delight: st.delight,
    bestDay: st.bestDay,
    orders: st.orders,
    tier: TIERS[s.progress.tier]?.name ?? TIERS[0].name,
    regulars,
    recipes: menu(s).length,
    found: s.bench.known.length,
  };
}
