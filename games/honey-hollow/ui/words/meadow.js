// @ts-check
/**
 * Every sentence the meadow screen says (ui/meadow/). Same voice as
 * ui/words.js: plain, warm, short, British spelling, no exclamation marks.
 */

import { coins, plural, number, list, stars, seasonName, capital, thePlot } from "../words.js";

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
const unstopped = (s) => String(s).replace(/[.\s]+$/, "");
const tenth = (n) => Math.round((Number(n) || 0) * 10) / 10;

/** "about 1.4 jars", "about 1 jar", "next to nothing". */
function about(jars) {
  const v = tenth(jars);
  if (v <= 0) return "next to nothing";
  return `about ${number(v)} ${v === 1 ? "jar" : "jars"}`;
}

export const MEADOW = {
  // ---- top bar
  /** The day chip on a narrow phone: "Spring 3". */
  dayShort: (cal) => `${seasonName(cal?.season ?? 0)} ${cal?.dayOfSeason ?? 1}`,
  dayChip: "Open the calendar",
  weather: {
    sunny: "sunny",
    cloudy: "cloudy",
    windy: "windy",
    rain: "rain",
    snow: "snow",
    frost: "frost",
  },
  weatherLabel: (today, tomorrow) => `Weather: ${today} today, ${tomorrow} tomorrow`,
  weatherToday: {
    sunny: "Sunny today: good flying.",
    cloudy: "Cloudy today: fair flying.",
    windy: "Windy today: slow flying, slower on Heather Hill.",
    rain: "Rain today: hardly any flying.",
    snow: "Snow today: the bees stay in.",
    frost: "Frost today: the bees stay in.",
  },
  weatherTomorrow: {
    sunny: "Sunny tomorrow.",
    cloudy: "Cloudy tomorrow.",
    windy: "Windy tomorrow.",
    rain: "Rain tomorrow.",
    snow: "Snow tomorrow.",
    frost: "Frost tomorrow.",
  },
  coinsLabel: (n) => coins(n),
  renownLabel: (n) => `Renown: ${number(n)}`,

  // ---- plot header
  prev: "Previous plot",
  next: "Next plot",
  forSale: "for sale",

  // ---- a plot that is not yours yet
  buy: {
    button: "Buy",
    onlyHere: (names) => `Only here: ${lower(list(names))}.`,
    short: (n) => `You need ${coins(n)} more.`,
    confirm: (name, price) => ({
      title: `Buy ${thePlot(name)}?`,
      text: `It costs ${coins(price)} and is yours for good.`,
      yes: "Buy it",
      no: "Not yet",
    }),
    done: (name) => `${capital(thePlot(name))} is yours.`,
  },
  painting: "Painting…",

  // ---- the action bar
  act: { seeds: "Seeds", hives: "Hives", workshop: "Workshop", book: "Book", more: "More" },
  start: "Start the day",
  toStall: "To the stall",
  skipStall: "Skip the stall",
  speedLabel: "Day speed",
  normal: "Normal",
  fast: "Fast",

  // ---- the planting brush
  brush: {
    each: (price) => `${coins(price)} each`,
    inHand: (n) => `${plural(n, "seed")} in hand`,
    done: "Done",
  },

  // ---- placing a hive
  place: {
    title: {
      buy: "A new hive",
      move: "Moving the hive",
      split: "The new colony",
      catch: "The swarm",
    },
    prompt: {
      buy: "Tap a glowing square to see what a hive would make there.",
      move: "Tap a glowing square to see what this hive would make there.",
      split: "Tap a glowing square to see what a small colony would make there.",
      catch: "Tap a glowing square to see what the swarm would make there.",
    },
    put: "Put it here",
    cancel: "Cancel",
    /** "Here today: about 1.4 jars a day." */
    head: (today, jars) => `Here ${today ? "today" : "tomorrow"}: ${about(jars)} a day.`,
    /** A moved hive flies at half strength for a day. */
    headMoved: (today, jars, settled) =>
      `Here ${today ? "today" : "tomorrow"}: ${about(jars)}, then ${about(settled)} a day.`,
    /** Put down while the bees are out: what is still to come today, and a whole day. */
    rest: (jars, full) => `Here for the rest of today: ${about(jars)}. A full day: ${about(full)}.`,
    nothing: (today) => `Here ${today ? "today" : "tomorrow"}: nothing in bloom within reach.`,
    wild: "hedgerow",
    /** [{ name, share }] → "70% clover, 30% dandelion" */
    mix: (parts) => list(parts.map((p) => `${Math.round(p.share * 100)}% ${lower(p.name)}`)),
    pure: (honey, n) => `pure ${lower(honey)} ${stars(n)}`.trim(),
    blend: "meadow blend",
    line: (mix, verdict) => (verdict ? `${mix}: ${verdict}.` : `${mix}.`),
    half: "Half a day’s flying while the bees learn the way home.",
    small: "Worked out for a small colony. A bigger one brings more.",
    other: (n, was, now) => `Hive ${n} would bring in ${about(now)} instead of ${about(was)}.`,
    rain: "Rain keeps most of the bees in.",
    full: "It is nearly full, so some would be lost.",
  },

  // ---- the hint line
  hint: {
    brush: (name, price) => `${name}: tap a square to plant, ${coins(price)} each`,
    brushInHand: (name, n) => `${name}: tap a square to plant. ${plural(n, "seed")} in hand`,
    place: "Tap a glowing square to try the hive there",
    wasps: (n, where) =>
      where
        ? `Wasps at Hive ${n} on ${thePlot(where)}. Tap here to go there.`
        : `Wasps at Hive ${n}. Tap the hive to see them off.`,
    swarm: (where) =>
      where
        ? `A swarm is hanging on ${thePlot(where)}. Tap here to go there.`
        : "A swarm is hanging here. Tap it to catch it.",
    forSale: (name, price) => `${capital(thePlot(name))} is for sale: ${coins(price)}`,
    hive: (n, type) => `Hive ${n} · ${type}. Its reach is lit. Tap it to look inside.`,
    ready: (name) => `Goal met: ${name}. Tap to claim it.`,
    next: (text, have, need) =>
      `Next: ${lower(unstopped(text))}${need > 1 ? ` (${number(have)}/${number(need)})` : ""}`,
    idle: "All quiet in the Hollow.",
  },

  // ---- one line about the ground
  terrain: {
    tree: "An old apple tree. It blossoms in spring, and the bees love it.",
    rock: "A mossy boulder. Nothing grows on it, but it is a fine place to sit.",
    water: "The pond. Hives close by fly better in summer, and water mint grows at its edge.",
  },

  // ---- things that happen out here
  raided: (n) => `The wasps got into Hive ${n} and carried off some stores.`,
  swarmLost: "The swarm has flown off over the hedge.",
  swarmNeedsSpare: "You need a spare hive to catch a swarm. The hive shop has them.",
  catchFirst: "Finish placing the hive first.",
};
