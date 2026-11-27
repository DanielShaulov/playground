// @ts-check
/**
 * Words for the workshop (ui/sheets/workshop.js). The names and blurbs of
 * the goods and the recipes come from content/goods.js; this file holds the
 * bench's own words.
 */

import { list, number, coins, thePlot } from "../words.js";

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

export const WORKSHOP = {
  /** The sheet's title row. */
  title: "The workshop",

  /** Top of the sheet, beside the beekeeper: how many things can still be made today. */
  crafts: (n) =>
    n <= 0 ? "Enough made today" : n === 1 ? "Make 1 more today" : `Make ${number(n)} more today`,
  /** The quiet line under it. One of these at a time. */
  sub: {
    normal: "Open in the morning and the evening.",
    winter: "Winter days are long indoors. Time to make more.",
    none: "Enough making for today. More tomorrow.",
    out: "The bees are out. Making waits until they are home.",
    closed: "The workshop opens with your first beeswax.",
  },

  /** The slip of paper at the top before the workshop has opened. */
  closedNote:
    "The workshop opens with your first beeswax. It comes with the jars you take from a hive.",
  /** The slip of paper at the top while the bees are flying. */
  outNote: "The bees are out, so making waits. Come back this evening or tomorrow morning.",

  /** What you hold: three tiles under the bench. `from` says where each comes from. */
  hold: {
    wax: { name: "Beeswax", from: "with the jars you take" },
    bunches: { name: "Bunches", from: "picked from beds in bloom" },
    honey: { name: "Honey", from: "jars on your shelf" },
  },
  /** Read aloud for a tile: "Beeswax: 4, comes with the jars you take". */
  holdLabel: (name, n, from) => `${name}: ${number(n)}, ${from}`,

  /** A recipe card. Between "Worth" and "today" sit a coin and the price. */
  worth: ["Worth", "today"],
  worthLabel: (n) => `Worth ${coins(n)} today`,
  /** The thyme remedy, in place of a price. */
  notSold: "Not for sale. It treats a hive with mites.",
  /** Beside "Make one": how many of the thing you hold. */
  held: (n) => `You have ${number(n)}`,
  make: "Make 1",

  /** What a recipe needs: the name of each ingredient. */
  need: {
    wax: "Beeswax",
    bunchOf: (flowerName) => `${flowerName} bunch`,
    bunchAny: "A bunch",
    honeyAny: "A jar of honey",
    honeyPure: "A jar of pure honey",
    candle: "A candle",
    soap: "A bar of soap",
  },
  /** After an ingredient's name when it takes more than one: "Beeswax ×2". */
  times: (n) => `×${number(n)}`,
  /** Beside each ingredient: what you hold of it. */
  have: (n) => `have ${number(n)}`,
  haveLabel: (n, enough) => `you have ${number(n)}, ${enough ? "enough" : "not enough"}`,

  /** Above the row of pictures to choose from. */
  pick: { bunch: "Which bunch?", honey: "Which honey?" },
  /** Under the bunches to choose from: what the chosen one makes. "Water mint, for mint soap." */
  bunchMakes: (flowerName, soapName) => `${flowerName}, for ${lower(soapName)}.`,
  /** Under "Which honey?": the chosen jar and what it is worth. "Clover honey ★★, worth 12 today." */
  usingHoney: (honeyName, starsText, worth) =>
    `${honeyName}${starsText ? ` ${starsText}` : ""}, worth ${coins(worth)} today.`,
  /** In place of the pictures when there is nothing to choose from. */
  none: {
    bunch: "No bunches picked yet.",
    honey: "No honey on your shelf.",
    honeyPure: "No pure honey on your shelf.",
    /** Under "A candle" and "A bar of soap" on the gift basket, where the one it would take is named. */
    candle: "none made yet",
    soap: "none made yet",
  },
  /** Read aloud for a picture you can choose: "Clover honey ★★, 3". */
  optionLabel: (name, n) => `${name}, ${number(n)}`,
  /** A meadow blend, where a honey's flower would be named. */
  blend: "Meadow blend",

  /** Under "Make one" when it cannot be made: exactly what is missing. */
  missing: {
    wax: (n) => `${number(n)} more beeswax`,
    bunchOf: (flowerName) => `a ${lower(flowerName)} bunch`,
    bunchAny: "a bunch of flowers",
    honeyAny: "a jar of honey",
    honeyPure: "a jar of pure honey",
    candle: "a candle",
    soap: "a bar of soap",
  },
  needs: (parts) => `Needs ${list(parts)}.`,
  /** Under "Make one" when everything is there but the bench is not free. */
  rest: {
    closed: "Waits for your first beeswax.",
    noCrafts: "Enough making for today.",
    out: "Waits until the bees are home.",
  },

  /** The toast when something is made: "Made: beeswax candle." */
  made: (name) => `Made: ${lower(name)}.`,
  /** The link under a card when making it opened a page of the bee book. */
  newFact: (title) => `A new page in your bee book: ${title}`,

  /** Recipes not learnt yet, under the cards. */
  locked: {
    heading: "Still to learn",
    tier: (tierName) => `Learnt when you are “${tierName}”.`,
    goal: (goalName) => `Learnt from the goal “${goalName}”.`,
    plot: (plotName) => `Learnt when ${thePlot(plotName)} is yours.`,
    other: "Learnt later on.",
  },

  /** The last lines of the sheet: where the makings come from. Takes the flowers that give bunches. */
  whereHeading: "Where it all comes from",
  whereWax: "Beeswax comes with the jars you take from a hive.",
  whereBunches: (flowerNames) =>
    `Bunches are picked in the morning from beds of ${list(flowerNames.map(lower))} in bloom.`,
};
