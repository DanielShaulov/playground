// @ts-check
/**
 * Every sentence of the night card (ui/scenes/night.js) and of the year
 * page (ui/scenes/year.js). Plain objects and small functions; the screens
 * hand in names and numbers from the core.
 */

import { coins, jars, plural, list, capital, number, stars, seasonName } from "../words.js";

// ───────────────────────── the night card ─────────────────────────

/** How a hive is doing, said after "Hive 2" (the core's attention flags). */
const FLAG = {
  wasps: "has wasps at its door",
  "queen-cells": "has queen cells and may swarm",
  "swarm-risk": "has outgrown its hive and may start queen cells tonight",
  hungry: "went hungry last night",
  low: "is short of stores for tonight",
  "winter-short": "has less than it needs for winter",
  "mites-bad": "is badly troubled by mites",
  mites: "has mites",
  full: "is nearly full",
};

export const NIGHT = {
  /** The card's heading; the day goes under it. */
  title: "The day’s diary",

  /** What each hive brought in. */
  hivesHead: "From the hives",
  /** Beside that heading: what the numbers are. */
  hivesUnit: "jars’ worth of nectar",
  hive: (n) => `Hive ${number(n)}`,
  /** A source that is not one of your beds. */
  wild: "hedgerow",
  /** After a hive's flowers when it was too full to keep everything. */
  wasted: "full, some lost",
  nothing: "nothing today",
  more: (n) => `${plural(n, "more hive")}`,
  /** The same row once it is open: tap to fold the list again. */
  fewer: "Show fewer",
  total: "Altogether",
  /** Winter: nobody flew. */
  stayedIn: "The bees stayed in the warm today, close round their queen.",

  /** The day in four numbers. A label goes under each. */
  jarsTaken: (n) => (n === 1 ? "jar taken" : "jars taken"),
  coinsIn: "coins in",
  coinsOut: "coins out",
  hearts: (n) => (n === 1 ? "heart won" : "hearts won"),

  tomorrowHead: "Tomorrow",
  /** Tomorrow's weather: its name, then what it means for the bees. */
  weather: {
    sunny: ["Sunny", "Good flying."],
    cloudy: ["Cloudy", "Fair flying."],
    windy: ["Windy", "Slow flying."],
    rain: ["Rain", "Hardly any flying."],
    snow: ["Snow", "The bees stay in."],
    frost: ["Frost", "The bees stay in."],
  },
  newSeason: (season) => `The first day of ${String(seasonName(season)).toLowerCase()}.`,
  newYear: "The first day of spring, and of a new year.",
  starts: (flowers) =>
    `${capital(list(flowers))} ${flowers.length > 1 ? "come" : "comes"} into bloom.`,
  lastDay: (flowers) => `The last day in bloom for ${list(flowers)}.`,
  ended: (flowers) =>
    `${capital(list(flowers))} ${flowers.length > 1 ? "have" : "has"} finished blooming.`,
  /** A pure honey that tomorrow's nectar would change. Tap opens the hive. */
  spoil: (n, honey, starsN, jarsN, then) =>
    `Hive ${number(n)} holds ${jars(jarsN)} of pure ${honey} ${stars(starsN)}. Tomorrow’s nectar would make it ${then}. Take the jars tonight to keep it.`,
  blend: "meadow blend",
  spoilMore: (n) => `The same goes for ${plural(n, "more hive")}.`,
  /** A swarm still hanging in the meadow at bedtime. Tap goes back to the meadow. */
  swarm: (n) =>
    n === 1
      ? "A swarm is still hanging in the meadow. Catch it before you sleep, or it will be gone by morning."
      : `${capital(plural(n, "swarm"))} are still hanging in the meadow. Catch them before you sleep, or they will be gone by morning.`,
  /** A hive that wants looking at. Tap opens the hive. */
  attention: (n, flags) => {
    const parts = flags.map((f) => FLAG[f]).filter(Boolean);
    return parts.length ? `Hive ${number(n)} ${list(parts)}.` : "";
  },
  /** After four such lines. */
  attentionMore: (n) =>
    `${capital(plural(n, "more hive"))} ${n === 1 ? "wants" : "want"} a look too.`,
  show: "Tomorrow evening is the Honey Show. Keep a jar of each pure honey to enter.",
  fair: (pays) =>
    `Tomorrow is the Winter Fair. Gifts, candles and your finest honey will fetch ${pays}.`,
  quiet: "Nothing else to plan for.",

  /** A bee fact found today. Tap opens the bee book at it. */
  fact: "A new page in your bee book",
  factMore: (n) => `and ${plural(n, "more new page")}`,

  sleep: "Sleep",
  /** The small button beside "Sleep": back to the meadow, to make things or take honey first. */
  back: "Not yet",
  backAlt: "Back to the meadow",

  /** Opened when it is not evening. */
  early: {
    title: "Not bedtime yet",
    text: "The day is still going. The diary fills in once the stall is shut.",
    back: "Back to the meadow",
  },

  /** The moment a season turns: its name on a ribbon, a line, one button. */
  seasons: {
    spring: "The first dandelions are out and the bees are stirring.",
    summer: "Long warm days, and the whole meadow hums.",
    autumn: "The light turns gold. Time to think of winter stores.",
    winter: "The bees draw close together and keep each other warm.",
  },
  newYearLine: "A whole year in the Hollow. The bees are stirring again.",
  morning: "Good morning",
};

// ───────────────────────── the year page ─────────────────────────

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

export const YEAR = {
  /** The ribbon at the top. The first year has the title the whole game leads up to. */
  title: (year) => (year === 1 ? "A year in Honey Hollow" : `Year ${number(year)} in Honey Hollow`),
  /** Under it: whose almanac this is. */
  by: (name, year) =>
    `${name ? `${name}’s` : "Your"} ${ORDINALS[year] ?? `${number(year)}th`} year, kept in the almanac.`,
  /** The page shown when no year has ended yet. */
  soFar: "The year so far",
  soFarBy: (name) => `${name ? `${name}’s` : "Your"} almanac is still being written.`,

  jars: (n) => (n === 1 ? "jar of honey" : "jars of honey"),
  kinds: (n) => (n === 1 ? "kind of pure honey" : "kinds of pure honey"),
  noKinds: "No pure honey this year. It comes from a hive that reaches a single flower.",
  earned: "coins earned",

  ribbonsHead: "Ribbons",
  ribbon: (medal, honey) => `${capital(medal)}, ${honey}`,
  noRibbons: "None this year. The Honey Show comes round every autumn.",
  bookHead: "The bee book",
  facts: (n, all) => `${number(n)} of ${number(all)} pages found`,
  friendsHead: "Friends",
  friends: (n) =>
    n
      ? `${plural(n, "friend")} in the village, and counting.`
      : "The village is getting to know you.",
  heartsAlt: (name, n) => `${name}: ${plural(n, "heart")}`,
  /** One quiet line: the size of the place. */
  place: (hives, plots, tier) => `${plural(hives, "hive")} · ${plural(plots, "plot")} · ${tier}`,

  /** The credits. The first line is the one that matters most. */
  idea: "An idea from Sari",
  credits: [
    "Painted, written and built by Claude.",
    "Lettering in Mali by Cadson Demak, under the SIL Open Font Licence.",
    "Every page of the bee book is true, and lists its sources.",
  ],
  /** The game does not end. */
  goesOn:
    "The story does not end here. Spring is back, the bees are waking, and the meadow is yours for as long as you like.",
  goesOnLater: "Another spring in the Hollow. Stay as long as you like.",

  next: "Turn the page",
  carryOn: "Carry on",
  back: "Back to the meadow",
  pageOf: (n, all) => `Page ${number(n)} of ${number(all)}`,
  coins,
};
