// @ts-check
/**
 * The board of best first months on this phone, like an old arcade's high
 * scores: the keeper's three letters and the coins taken in the first 30
 * days, best BOARD_SIZE kept (content/ending.js). Shops sign it at the end of
 * their first month (ui/ending.js); the settings sheet shows it too.
 *
 * It lives in createStore("ferment") under "scores", apart from the save, so
 * starting over or loading a code keeps it. One row per shop (its seed): a
 * shop signed twice (a backup code from before its month's end, loaded
 * again) keeps its better month. The last initials used come back as the
 * next shop's starting letters ("initials").
 *
 * Row: { name, coins, served, shop (seed), at (ms) }. The house's scores
 * (content/ending.js HOUSE_SCORES) show alongside but are never stored.
 */

import { createStore } from "../../../shared/storage.js";
import { BOARD_SIZE, HOUSE_SCORES } from "../content/ending.js";

const store = createStore("ferment");

/** @typedef {{ name: string, coins: number, served: number, shop: number, at: number }} Score */

const valid = (/** @type {any} */ r) =>
  r &&
  typeof r.name === "string" &&
  /^[A-Z]{3}$/.test(r.name) &&
  Number.isFinite(r.coins) &&
  Number.isFinite(r.shop);

/** The shops this phone has put on the board, best first. */
function signed() {
  const list = store.get("scores", []);
  return Array.isArray(list) ? list.filter(valid) : [];
}

/** The house's scores, as rows with no shop of their own (shop < 0). */
const HOUSE = HOUSE_SCORES.map(([name, coins], i) => ({
  name,
  coins,
  served: 0,
  shop: -1 - i,
  at: 0,
}));

/** @returns {Score[]} the board as it shows: the shops and the house, best first */
export function scores() {
  return [...signed(), ...HOUSE]
    .sort((a, b) => b.coins - a.coins || a.at - b.at)
    .slice(0, BOARD_SIZE);
}

/** Put a shop's month on the board. */
export function addScore(/** @type {Score} */ row) {
  const old = signed().find((r) => r.shop === row.shop);
  const keep = old && old.coins >= row.coins ? old : row;
  const list = [...signed().filter((r) => r.shop !== row.shop), keep]
    .sort((a, b) => b.coins - a.coins || a.at - b.at)
    .slice(0, BOARD_SIZE);
  store.set("scores", list);
  store.set("initials", row.name);
}

/** The letters the last shop signed with, to start the next from. */
export const lastInitials = () => {
  const v = store.get("initials", "");
  return typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : "AAA";
};

const ORD = ["1ST", "2ND", "3RD"];
const place = (/** @type {number} */ i) => ORD[i] ?? `${i + 1}TH`;

/** The board as an arcade table; `mine` (a shop seed) is lit up. */
export function scoreTable(/** @type {Score[]} */ list, /** @type {number | null} */ mine = null) {
  return `<ol class="hiscores">${list
    .map(
      (r, i) =>
        `<li class="${r.shop === mine ? "mine" : ""}"><span class="hs-place">${place(i)}</span><span class="hs-name">${r.name}</span><span class="hs-coins">${r.coins}</span></li>`,
    )
    .join("")}</ol>`;
}
