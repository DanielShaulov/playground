// @ts-check
/**
 * Words for the bee book (ui/sheets/book.js).
 *
 * The facts themselves (title, text, sources) live in content/facts.js and
 * were checked against their sources: nothing here rewrites them. This file
 * holds the book's own words: the chapters, the counts, and the hint a page
 * shows before it is found.
 */

import { number } from "../words.js";

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

export const BOOK = {
  /** The sheet's title row; with the beekeeper's name once there is one. */
  title: "The bee book",
  titleOf: (name) => (name ? `${name}’s bee book` : "The bee book"),

  /** Top of the sheet, beside the honeycomb: how much of the book is filled in. */
  found: (n, total) => `${number(n)} of ${number(total)} pages found`,
  /** The slip of paper at the top while the book is empty. */
  empty: "No pages yet. Each opens at a first: your first day, your first jar, your first swarm.",
  /** The slip of paper at the top once every page is found. */
  complete: "Every page is found. The whole book is yours.",

  /** Under a chapter's name. */
  topicCount: (n, total) => `${number(n)} of ${number(total)} found`,
  topicDone: (total) => `All ${number(total)} found`,
  /** Above the closed pages of a chapter. */
  stillToFind: (n) => `Still to find · ${number(n)}`,
  /** A chapter with nothing found in it yet, above its closed pages. */
  topicEmpty: "Nothing found in this chapter yet.",

  /** The mark on a page that has not been opened yet. */
  fresh: "New",
  /** The button under a page's text that unfolds its sources. */
  sources: "Sources",
  /** Before a closed page's hint: "Opens at your first swarm". */
  opens: (hint) => `Opens ${hint}`,

  /** Read aloud for the row of chapter buttons, and for each one. */
  chapters: "Chapters",
  tabLabel: (name, n, total, fresh) =>
    `${name}: ${number(n)} of ${number(total)} found${fresh ? `, ${number(fresh)} new` : ""}`,
  /** Read aloud for a page's button: its title, and whether it is new. */
  pageLabel: (title, fresh) => (fresh ? `${title} (new)` : title),
  /** Read aloud for a closed page. */
  closedLabel: "A page not found yet.",
};

/**
 * The chapters, by the `topic` of a fact. `name` heads the chapter, `tab` is
 * the short word under its picture at the bottom of the sheet, `line` sits
 * under the name.
 * @type {Record<string, { name: string, tab: string, line: string }>}
 */
export const TOPICS = {
  colony: {
    name: "The colony",
    tab: "Colony",
    line: "Who lives in a hive, and how they run it.",
  },
  honey: {
    name: "Honey",
    tab: "Honey",
    line: "From a sip of nectar to a jar on the shelf.",
  },
  flowers: {
    name: "Flowers",
    tab: "Flowers",
    line: "What the bees visit, and what they give back.",
  },
  seasons: {
    name: "The seasons",
    tab: "Seasons",
    line: "A colony’s year, from the first warm day to the snow.",
  },
  wax: {
    name: "Beeswax",
    tab: "Wax",
    line: "The comb, and what can be made of it.",
  },
  keeping: {
    name: "Keeping bees",
    tab: "Keeping",
    line: "The beekeeper’s side of things.",
  },
};

/** The order of the chapters. A topic not listed here goes after these. */
export const TOPIC_ORDER = ["colony", "honey", "flowers", "seasons", "wax", "keeping"];

/**
 * When a page opens, by the trigger key of its fact (core/book.js `TRIGGERS`).
 * Each reads after "Opens": "Opens at your first swarm". The families
 * `honey-<flower>`, `renown-<tier>` and `gift-<regular>-<n>` are below.
 * @type {Record<string, string>}
 */
export const HINT = {
  "first-day": "when you first send the bees out",
  "first-harvest": "with your first jar of honey",
  "first-pure": "with your first pure honey",
  "first-blend": "with your first jar of meadow blend",
  "first-three-star": "with your first ★★★ honey",
  "first-sale": "with your first sale",
  "first-rain": "on your first rainy day",
  "first-move": "when you first move a hive",
  "first-wax": "with your first beeswax",
  "first-candle": "when you make your first candle",
  "first-soap": "when you make your first soap",
  "first-balm": "when you make your first lip balm",
  "first-bunch": "when you pick your first bunch",
  "first-queen-cells": "when a hive first builds queen cells",
  "first-swarm": "at your first swarm",
  "first-catch": "when you first catch a swarm",
  "first-split": "when you first split a colony",
  "first-mites": "when mites are first spotted",
  "first-remedy": "when you first give a hive thyme remedy",
  "first-wasps": "when wasps first come raiding",
  "first-feed": "when you first feed a hive sugar syrup",
  "first-hungry": "the first time a hive goes hungry",
  "first-upgrade": "when you first upgrade a hive",
  "second-hive": "with your second hive",
  "strength-max": "when a colony is as strong as its hive allows",
  "season-summer": "on the first day of summer",
  "season-autumn": "on the first day of autumn",
  "season-winter": "on the first day of winter",
  "second-spring": "in your second spring",
  "plot-pond": "when the Pond Bank is yours",
  "plot-orchard": "when the Old Orchard is yours",
  "plot-hill": "when Heather Hill is yours",
  "first-ribbon": "with your first ribbon at the Honey Show",
};

/** `honey-<flower>`: takes the honey's name ("Lavender honey"). */
export const HINT_HONEY = (honeyName) => `with your first jar of pure ${lower(honeyName)}`;
/** `renown-<tier>`: takes the tier's name ("Known at the market"). */
export const HINT_RENOWN = (tierName) => `when you are “${tierName}”`;
/** `gift-<regular>-<n>`: takes the villager's name and the hearts the gift comes at. */
export const HINT_GIFT = (who, hearts) =>
  hearts ? `when ${who} has ${number(hearts)} hearts for you` : `as a gift from ${who}`;
/** A key this file has no words for (a trigger added to the core later). */
export const HINT_FALLBACK = "as you keep bees";

/**
 * The hint for a trigger key. `look` gives the names the families need, from
 * the core's tables: `honey(flowerId)`, `tier(n)`, `regular(id)` → a name,
 * and `hearts(n)` → the hearts a regular's nth gift comes at.
 *
 * @param {string} trigger
 * @param {{ honey?: (id: string) => string | undefined, tier?: (n: number) => string | undefined,
 *   regular?: (id: string) => string | undefined, hearts?: (n: number) => number | undefined }} [look]
 */
export function hintFor(trigger, look = {}) {
  const key = String(trigger ?? "");
  if (Object.hasOwn(HINT, key)) return HINT[key];
  let m = /^honey-(.+)$/.exec(key);
  if (m) {
    const name = look.honey?.(m[1]);
    if (name) return HINT_HONEY(name);
  }
  m = /^renown-(\d+)$/.exec(key);
  if (m) {
    const name = look.tier?.(Number(m[1]));
    if (name) return HINT_RENOWN(name);
  }
  m = /^gift-(.+)-(\d+)$/.exec(key);
  if (m) {
    const who = look.regular?.(m[1]);
    if (who) return HINT_GIFT(who, look.hearts?.(Number(m[2])));
  }
  return HINT_FALLBACK;
}
