// @ts-check
/** Words on screen: what customers say, flavour words, the clock. */

import { RECIPES } from "../content/recipes.js";
import { OPEN_AT } from "../content/tuning.js";
import { bandOf } from "../core/index.js";

export const word = (x) => {
  const b = bandOf(x).id;
  return `<b class="w-${b}">${b}</b>`;
};
export const lower = (recipe) => RECIPES[recipe].name.toLowerCase();

export function requestLine(c) {
  const mid = (c.lo + c.hi) / 2;
  if (c.orderId) return `“My pre-order: ${lower(c.recipe)}, ${word(mid)}!”`;
  return [
    `“${RECIPES[c.recipe].name}, nice and ${word(mid)} please.”`,
    `“Got any ${word(mid)} ${lower(c.recipe)}?”`,
    `“A jar of ${lower(c.recipe)}. I like it ${word(mid)}.”`,
  ][c.look % 3];
}

export function clockText(s) {
  if (s.clock.phase === "morning") return "Morning";
  if (s.clock.phase === "evening") return "Evening";
  const t = OPEN_AT + s.clock.hour;
  const h = Math.floor(t);
  const m = Math.floor(((t - h) * 60) / 10) * 10;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** What a customer says on the way out, by how they liked their jar. */
export const LINES = {
  delight: "“Perfect, exactly how I like it!”",
  ok: "“Close enough. Thanks.”",
  meh: "“Hmm. Not really what I asked for.”",
};
