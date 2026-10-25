// @ts-check
/**
 * Shop decor: what the shop has bought or won to dress itself, and what is up
 * in each spot. Looks only: nothing here changes how the game plays.
 *
 * state.decor = { owned, on }. The starting piece of each spot (cost 0, no
 * pride) is always owned and is what a spot shows when `on` doesn't name one,
 * so an old save needs nothing filled in.
 *
 * Content: content/decor.js. Actions (evening): `buyDecor { id }` buys a piece
 * and puts it up; `useDecor { id }` puts up a piece already owned. Pride
 * pieces are won, never bought (claimPride in core/progress.js).
 */

import { DECOR, DECOR_IDS, SPOTS } from "../content/decor.js";
import { tierOf } from "./progress.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").DecorSpot} DecorSpot */

/** @returns {import("./types.js").DecorSlice} */
export function freshDecor() {
  return { owned: [], on: {} };
}

/** The piece each spot starts with. @type {Record<string, string>} */
const START = {};
for (const id of DECOR_IDS) {
  const d = DECOR[id];
  if (!d.cost && !d.pride && !START[d.spot]) START[d.spot] = id;
}

/** True when the shop has a piece: a starting piece, or one bought or won. */
export const owns = (/** @type {State} */ s, /** @type {string} */ id) =>
  Object.hasOwn(DECOR, id) && (START[DECOR[id].spot] === id || s.decor.owned.includes(id));

/** The piece up in a spot. */
export function decorOn(/** @type {State} */ s, /** @type {DecorSpot} */ spot) {
  const id = s.decor.on[spot];
  return id && owns(s, id) && DECOR[id].spot === spot ? id : START[spot];
}

/** Every spot's piece, as { spot: id }. */
export function decorLook(/** @type {State} */ s) {
  /** @type {Record<DecorSpot, string>} */
  const look = /** @type {any} */ ({});
  for (const { id } of SPOTS) look[id] = decorOn(s, id);
  return look;
}

/**
 * Every piece as the decor screen lists it: whether it is owned or up, and
 * otherwise what stands in the way (a higher tier, or a pride goal to win).
 * @returns {import("./types.js").DecorOffer[]}
 */
export function decorOffers(/** @type {State} */ s) {
  return DECOR_IDS.map((id) => {
    const d = DECOR[id];
    const owned = owns(s, id);
    return {
      id,
      spot: d.spot,
      name: d.name,
      cost: d.cost,
      tier: d.tier,
      owned,
      on: decorOn(s, d.spot) === id,
      locked: !owned && !d.pride && d.tier > tierOf(s),
      pride: d.pride ?? null,
    };
  });
}

/** Pieces bought or won beyond what the shop started with. */
export const decorCount = (/** @type {State} */ s) => s.decor.owned.length;

/** { type: "buyDecor", id } — buy a piece in the evening and put it up. */
export function buyDecor(s, { id }, events) {
  if (typeof id !== "string" || !Object.hasOwn(DECOR, id)) return "no such decor";
  if (s.clock.phase !== "evening") return "only in the evening";
  const d = DECOR[id];
  if (owns(s, id)) return "already yours";
  if (d.pride) return "won, not sold";
  if (d.tier > tierOf(s)) return "needs a higher tier";
  if (s.shop.coins < d.cost) return "not enough coins";
  s.shop.coins -= d.cost;
  s.decor.owned.push(id);
  s.decor.on[d.spot] = id;
  events.push({ type: "boughtDecor", id, cost: d.cost });
}

/** { type: "useDecor", id } — put up a piece the shop already has. */
export function useDecor(s, { id }, events) {
  if (typeof id !== "string" || !Object.hasOwn(DECOR, id)) return "no such decor";
  if (s.clock.phase !== "evening") return "only in the evening";
  if (!owns(s, id)) return "not yours yet";
  const spot = DECOR[id].spot;
  if (decorOn(s, spot) === id) return "already up";
  s.decor.on[spot] = id;
  events.push({ type: "usedDecor", id });
}
