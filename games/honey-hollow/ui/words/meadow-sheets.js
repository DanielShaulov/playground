// @ts-check
/**
 * Words for the four sheets that open from the meadow, and for the bloom
 * strip they share:
 *
 *   BLOOM   ui/bloom-strip.js        the 28-day strip
 *   HIVE    ui/sheets/hive.js        one hive: stores, jars, care, notes
 *   BED     ui/sheets/bed.js         one flower bed
 *   SEEDS   ui/sheets/seeds.js       the seed tray
 *   SHOP    ui/sheets/hives.js       the hive shop
 *
 * Plain, warm, short, British spelling, no exclamation marks. Flower and
 * honey names come from the content tables; these are the sentences round
 * them. Amounts of honey are always said in jars (ten nectar make one).
 */

import {
  coins,
  jars,
  stars,
  percent,
  seasonName,
  list,
  capital,
  plural,
  number,
  thePlot,
} from "../words.js";

// ───────────────────────── shared pieces ─────────────────────────

/**
 * Nectar units as jars, to one decimal and never rounded up: "1.4 jars",
 * "1 jar", "0.4 jars". A hive with 9.9 units does not hold "1 jar".
 */
export function jarsOf(units) {
  return jars(Math.floor((Number(units) || 0) + 1e-6) / 10);
}

/** The same as a bare number: "1.4". */
export const jarsNumber = (units) => number(Math.floor((Number(units) || 0) + 1e-6) / 10);

/** "summer day 3" from the core's calendarOf(). */
export const dayOf = (cal) => `${seasonName(cal.season).toLowerCase()} day ${cal.dayOfSeason}`;

/** "summer day 1 to day 6", or "summer day 6 to autumn day 2". */
export function daysBetween(from, to) {
  if (from.season === to.season) {
    return from.dayOfSeason === to.dayOfSeason
      ? dayOf(from)
      : `${dayOf(from)} to day ${to.dayOfSeason}`;
  }
  return `${dayOf(from)} to ${dayOf(to)}`;
}

/** "Hive 2": hives are numbered in the order they came to the Hollow. */
export const hiveNumber = (n) => `Hive ${n}`;

/** What a source of stores is called in the middle of a sentence. */
export const SOURCE = {
  syrup: "sugar syrup",
  wild: "hedgerow flowers",
};

/** The same, where room is short (a blend's list of what is in it). */
export const SOURCE_SHORT = {
  syrup: "syrup",
  wild: "hedgerow",
};

/**
 * A honey's tastes, without the trait that only repeats its colour (every
 * honey carries one of light, amber or dark, and its `colour` says it better).
 */
export const tastes = (traits) =>
  (traits ?? []).filter((t) => t !== "light" && t !== "amber" && t !== "dark");

/** "Heather Hill has" or "The Pond Bank and Heather Hill have": plot names opening a sentence. */
const thePlots = (plots, verb) =>
  `${capital(list((plots ?? []).map(thePlot)))} ${plots?.length > 1 ? "have" : verb}`;

/** The coins line in a sheet's footer. */
export const PURSE = {
  have: "You have",
  /** aria-label of the coins chip */
  label: (n) => `You have ${coins(n)}`,
};

// ───────────────────────── the bloom strip ─────────────────────────

export const BLOOM = {
  /** aria-label of the whole strip */
  label: (name, range, today) => `${name} blooms from ${range}. Today is ${today}.`,
  /** under the bed sheet's strip */
  caption: (range) => `Blooms from ${range}`,
  seasons: [0, 1, 2, 3].map((i) => seasonName(i)),
};

// ───────────────────────── the hive sheet ─────────────────────────

/** A verdict in the middle of a sentence: "pure lavender ★★", "a meadow blend". */
export function verdictShort(flowerName, starCount) {
  return flowerName ? `pure ${flowerName.toLowerCase()} ${stars(starCount)}` : "a meadow blend";
}

export const HIVE = {
  /** the sheet's title */
  title: (n, type) => `${hiveNumber(n)} · ${type}`,
  /** opened for a hive that is not there */
  gone: "That hive is not here any more.",
  goneTitle: "Hive",

  /** under the row of bees */
  strength: (n, max) => `Strength ${n} of ${max}`,
  strengthFull: (n) => `Strength ${n}, the most this hive allows`,
  /** aria-label of the row of bees */
  beesLabel: (n, max) => `${plural(n, "bee")} filled in, out of ${max}`,
  /** where it stands: the plot's name as it is */
  place: (plot) => plot,

  stores: "Stores",
  /** right of the Stores heading */
  storesOf: (units, capJars) => `${jarsNumber(units)} of ${jars(capJars)}`,
  /** under the meter, from autumn */
  winterMark: (need) => `The mark shows what they need for winter: ${jarsOf(need)}.`,
  /** one entry of the legend under the meter */
  legend: (name, units) => (units < 1 ? `${name}, a trace` : `${name} ${jarsNumber(units)}`),
  /** the legend when the comb is empty */
  empty: "The hive is empty.",

  /** over the verdict */
  bottle: "A jar taken now would be",
  pure: (flowerName, starCount, purity) =>
    `Pure ${flowerName.toLowerCase()} ${stars(starCount)} (${percent(purity)})`,
  /** shares: [{ name, share }] biggest first */
  blend: (shares) =>
    `Meadow blend (${shares.map((s) => `${s.name.toLowerCase()} ${percent(s.share)}`).join(", ")})`,
  nothing: "Nothing to take yet",

  hint: {
    /** the day's nectar would take a star off, or turn it to a blend */
    drop: (tomorrow, to) =>
      `${tomorrow ? "Tomorrow’s" : "Today’s"} nectar would turn it into ${to}. Take jars first to keep it.`,
    /** the day's nectar would add a star, or make it pure */
    rise: (tomorrow, to) => `${tomorrow ? "Tomorrow’s" : "Today’s"} flying should make it ${to}.`,
    /** gap: whole percent points */
    nearStar: (gap, starCount) => `Only ${gap}% short of ${stars(starCount)}.`,
    nearPure: (gap, flowerName) =>
      `${capital(flowerName.toLowerCase())} is only ${gap}% short of a pure honey.`,
    top: "As pure as honey gets.",
  },

  take: {
    fewer: "1 jar fewer",
    more: "1 jar more",
    /** the button */
    button: (n) => (n > 0 ? `Take ${jars(n)}` : "Take jars"),
    /** tapping the button at nought */
    choose: "Choose how many with the plus button first.",
    /** no whole jar in the comb */
    none: (units) =>
      units > 0.5
        ? `Not a full jar yet: ${jarsOf(units)} in the hive.`
        : "No honey in the hive yet.",
    /** autumn and winter */
    leavesWinter: (left, need) =>
      `Leaves ${jarsOf(left)} for the bees. They need ${jarsOf(need)} for winter.`,
    /** spring and summer; coming: nectar still expected today, or 0 */
    leavesTonight: (left, meal, coming) =>
      coming > 0.5
        ? `Leaves ${jarsOf(left)}. They eat ${jarsNumber(meal)} tonight, and today’s flying should bring about ${jarsNumber(coming)} more.`
        : `Leaves ${jarsOf(left)} for the bees. They eat ${jarsNumber(meal)} tonight.`,
    /** the toast after taking jars; what: "lavender honey ★★" or "meadow blend" */
    got: (n, what, wax) =>
      wax > 0 ? `${jars(n)} of ${what}, and ${number(wax)} beeswax.` : `${jars(n)} of ${what}.`,
    honey: (honeyName, starCount) => `${honeyName.toLowerCase()} ${stars(starCount)}`.trim(),
  },

  care: "Care",
  /** each care row: its name, what it does, and why it may be resting */
  wasps: {
    title: "See off the wasps",
    sub: "Narrow the door so the guards can hold it.",
    done: "The door is narrowed. The guards can hold it now.",
  },
  feed: {
    title: "Feed sugar syrup",
    sub: (have) => `1 portion is a jar’s worth of stores. You have ${number(have)}.`,
    done: "A portion of sugar syrup, gladly taken.",
    why: {
      "no-syrup": "You have no sugar syrup. The hive shop sells it.",
      "not-yet": "You have no sugar syrup, and the hive shop has none until summer.",
      "hive-full": "No room for a portion. The hive is nearly full.",
    },
  },
  dust: {
    title: "Dust with sugar",
    sub: "Free, once a day. Mites lose their grip in the sugar and fall off.",
    end: "free",
    done: "Dusted. The bees are busy cleaning themselves.",
    why: {
      "already-dusted": "Dusted today. Once a day is enough.",
      "no-mites": "No mites here to dust off.",
    },
  },
  remedy: {
    title: "Give thyme remedy",
    sub: (have) => `Clears most of the mites at once. You have ${number(have)}.`,
    done: "The thyme remedy is in. The mites will not like it.",
    why: {
      "no-remedy": "You have none. Buy one at the hive shop, or make one from a thyme bunch.",
      "no-mites": "No mites here to treat.",
    },
  },
  upgrade: {
    title: (type) => `Upgrade to a ${type.toLowerCase()}`,
    sub: (jarCount, limit) =>
      `Holds ${jars(jarCount)}, and the colony can grow to strength ${limit}.`,
    done: (type) => `A ${type.toLowerCase()}. The bees have moved in.`,
    why: { "no-coins": (short) => `You need ${coins(short)} more.` },
    confirm: (type, cost, left) => ({
      title: `Upgrade to a ${type.toLowerCase()}?`,
      text: `It costs ${coins(cost)} and leaves you ${coins(left)}. The colony and its stores move in as they are.`,
      yes: "Upgrade",
      no: "Not now",
    }),
  },
  split: {
    title: "Split the colony",
    sub: "Half the bees and half the stores go into a spare hive. You choose where it stands.",
    why: {
      "not-morning": "A job for the morning.",
      "too-weak": "This colony is too small to split yet.",
      "no-spare": "It needs a spare hive. The hive shop has them.",
      "plot-full": "No room for another hive. Each of your plots has its 4.",
      "square-taken": "No free square for another hive.",
    },
  },
  move: {
    title: "Move the hive",
    sub: "Choose a new square. It flies at half strength for the rest of today.",
    why: {
      "not-morning": "A job for the morning.",
      "plot-full": "There is no free square to move it to.",
      "square-taken": "There is no free square to move it to.",
    },
  },

  /** the card for a colony that has outgrown its hive: what is happening, and the ways out */
  swarm: {
    /** as strong as the hive allows, in swarm season */
    riskTitle: "Running out of room",
    risk: "They are as strong as this hive allows. Tonight they start queen cells, and then half the colony can fly off. Give them room first.",
    /** queen cells are started */
    cellsTitle: "Queen cells",
    /** as things stand they leave tonight */
    cellsTonight:
      "They have outgrown this hive. Half the colony flies off tonight unless you give them room.",
    /** jars were taken today */
    cellsTaken:
      "You took jars today, so they stay home tonight. The queen cells stay until you give them room.",
    /** less than a jar in the hive */
    cellsBare:
      "With less than a jar in the hive they stay home tonight. The queen cells stay until you give them room.",
    /** the two buttons */
    upgrade: (cost) => `Upgrade for ${coins(cost)}`,
    split: "Split the colony",
    /** the split button when there is no spare hive: it opens the hive shop */
    spare: "Buy a spare hive to split",
    /** under the buttons: why one of them is resting */
    noCoins: (short) => `The upgrade needs ${coins(short)} more.`,
    splitWhy: {
      "not-morning": "Splitting is a job for the morning.",
      "too-weak": "This colony is too small to split.",
      "plot-full": "There is no room for a second hive. Each of your plots has its 4.",
      "square-taken": "There is no free square for a second hive.",
    },
    /** under the buttons while they would leave tonight */
    stopgap: "Or take jars today, and they stay home for 1 night.",
  },

  /** the slip of notes: one line for each thing that wants attention */
  notes: {
    wasps: "Wasps are at the door. See them off before they carry stores away.",
    /** nectar that came home today to a full hive */
    spilt: (units) => `The hive was full, so ${jarsOf(units)} of today’s nectar was lost.`,
    /** stores the wasps carried off today; still: they are at the door now */
    raided: (units, still) =>
      still
        ? `Wasps have carried off ${jarsOf(units)} of stores so far today.`
        : `Wasps carried off ${jarsOf(units)} of stores today. They pick on small colonies.`,
    hungry:
      "They went hungry last night and lost strength. Feed sugar syrup, or leave them more honey.",
    /** flying: true while today's nectar is still to come */
    low: (flying) =>
      flying
        ? "Not enough stores for tonight’s supper yet. If today’s flying does not cover it, feed sugar syrup."
        : "Not enough stores for tonight’s supper. Feed sugar syrup, or they go hungry.",
    "winter-short": (have, need) =>
      `Short for winter: ${jarsOf(have)} in the hive and they need ${jarsOf(need)}. Leave the honey in, or feed sugar syrup.`,
    mites: "Mites spotted. Dust with sugar each day, or give a thyme remedy.",
    "mites-bad": "The mites are harming the colony. A thyme remedy knocks them right back.",
    full: "Full to the lid. More nectar is lost until you take some jars.",
    moved: "Moved today: half strength while the foragers learn the way home.",
  },

  flying: {
    /** headings, by time of day */
    morning: "Today’s flying",
    day: "Out flying now",
    evening: "Tomorrow’s flying",
    winter: "Winter: the bees stay in and keep each other warm.",
    nothing: "Nothing is in bloom within reach.",
    grounded: "Hardly any flying in this weather.",
    /** "About 1.4 jars to bring home, on a fine day." */
    line: (units, weather) => `About ${jarsOf(units)} to bring home, ${weather}.`,
    weather: {
      sunny: "on a sunny day",
      cloudy: "under cloud",
      windy: "in the wind",
      rain: "between showers",
    },
    soFar: (units) => `${capital(jarsOf(units))} home so far.`,
    /** the hive will fill before the day is out */
    spill: (units) => `Only ${jarsOf(units)} of it will fit. The hive is nearly full.`,
    /** one chip: "Clover 70%" */
    chip: (name, share) => `${name} ${percent(share)}`,
    /** what the stores would be after that day's flying */
    after: (what) => `With that in the hive it would be ${what}.`,
  },
};

// ───────────────────────── the bed sheet ─────────────────────────

export const BED = {
  /** opened on a square with no bed */
  goneTitle: "Empty ground",
  gone: "Nothing is planted here.",
  plantHere: "Choose a seed",
  /** a dandelion nobody planted */
  wild: "Growing wild.",

  /** the stage in words; from/to are "summer day 1" */
  stage: {
    seed: () => "Planted today. It settles in overnight.",
    leaf: (from) => `In leaf. It blooms from ${from}.`,
    bud: () => "In bud. It opens tomorrow.",
    bloom: (to, last) => (last ? "In bloom, and today is its last day." : `In bloom until ${to}.`),
    faded: (from) => `Over for this year. It blooms again from ${from}.`,
    dormant: (from) => `Asleep for the winter. It blooms from ${from}.`,
  },

  /** after the stage, while it is not in bloom: how long until it is */
  wait: (days) =>
    days <= 0 ? "" : days === 1 ? "That is tomorrow." : `That is in ${number(days)} days.`,
  /** the flowers that share its days; them: [{ name, days }] */
  together: (them) =>
    `In bloom with ${list(them.map((t) => `${t.name.toLowerCase()} (${plural(t.days, "day")})`))}. 2 flowers in a hive’s reach make a blend.`,

  nectar: (n) => `${number(n)} nectar a day while it blooms. 10 nectar fill a jar.`,
  /** what picking today costs the hives that reach it */
  pickCost: (units) => `Today that is ${number(units)} nectar your hives go without.`,
  /** a bunch was cut today */
  pickedToday: "A bunch was picked today, so it gives no nectar until tomorrow.",

  hives: "Hives that reach it",
  noHive: "No hive reaches this bed yet. A hive within 2 squares would.",
  near: "close by",
  far: "at the edge of its reach",
  /** units: nectar the hive is due from this bed on its next flight */
  takes: (units, tomorrow) => `${number(units)} nectar ${tomorrow ? "tomorrow" : "today"}`,
  /** aria-label of a hive row */
  openHive: (name) => `Open ${name}`,

  honey: "Its honey",
  /** "Pale gold, floral. About 14 coins a jar today." */
  honeyLine: (colour, traits, price) =>
    `${capital(colour)}${tastes(traits).length ? `, ${list(tastes(traits))}` : ""}. About ${coins(price)} a jar today.`,

  pick: "Pick a bunch",
  /** what bunches are for, under the buttons */
  pickSub: {
    lavender:
      "For a lavender candle or lavender soap. The bed gives no nectar the day it is picked.",
    mint: "For mint soap. The bed gives no nectar the day it is picked.",
    thyme: "For thyme soap or a thyme remedy. The bed gives no nectar the day it is picked.",
    other: "For the workshop. The bed gives no nectar the day it is picked.",
  },
  held: (n) => `You have ${plural(n, "bunch", "bunches")}.`,
  pickWhy: {
    "not-morning": "Bunches are picked in the morning.",
    "not-blooming": "It can be picked once it is in bloom.",
    "already-picked": "It has given its bunch for this year.",
  },
  picked: (flowerName) => `A bunch of ${flowerName.toLowerCase()} for the workshop.`,

  dig: "Dig up",
  /** units: nectar the hives are due from it on their next flight, or 0 */
  confirmDig: (flowerName, units = 0, tomorrow = false) => ({
    title: `Dig up the ${flowerName.toLowerCase()}?`,
    text:
      units > 0
        ? `The bed will be gone for good, and its seed with it. Your hives are due ${number(units)} nectar from it ${tomorrow ? "tomorrow" : "today"}.`
        : "The bed will be gone for good, and its seed with it.",
    yes: "Dig it up",
    no: "Leave it",
  }),
  dug: "Dug up. The square is free again.",
};

// ───────────────────────── the seed tray ─────────────────────────

export const SEEDS = {
  title: "Seed tray",
  /** the line at the top: with a square chosen, and without */
  leadHere: "Choose a seed for this square.",
  leadBrush: "Choose a seed, then tap squares to plant it.",

  /** in place of a price when a packet is already yours */
  free: "free",
  held: (n) => `You have ${plural(n, "seed")}.`,
  leaves: (n) => `Leaves you ${coins(n)}.`,
  short: (n) => `You need ${coins(n)} more.`,
  /** "Honey: pale gold, floral." */
  honey: (colour, traits) =>
    `Honey: ${colour}${tastes(traits).length ? `, ${list(tastes(traits))}` : ""}.`,
  /** aria-label of a seed row */
  row: (name, price) => `${name}, ${price > 0 ? coins(price) : "free"}`,

  /** where the choosy ones grow, when none of those plots is yours yet; plots: their names */
  where: {
    hill: (plots) => `Grows only on hill ground. ${thePlots(plots, "has")} some.`,
    water: (plots) => `Grows only beside water. ${thePlots(plots, "has")} some.`,
  },
  /** after "This square is not hill ground." when the plot showing has none */
  elsewhere: (plots) => `It grows on ${list(plots.map(thePlot))}.`,
  /** it cannot grow on the plot showing, but you own one where it can; choosy: it needs hill or water */
  goThere: (plot, choosy) =>
    choosy
      ? `Grows on ${thePlot(plot)}. Tap to plant it there.`
      : `No free square on this plot. Tap to plant it on ${thePlot(plot)}.`,
  /** the square the tray was opened for cannot take it */
  notHere: {
    "needs-hill": "This square is not hill ground.",
    "needs-water": "This square is not beside water.",
    "square-taken": "Something already stands on this square.",
    "bad-ground": "Nothing can be planted on this square.",
  },
  noRoom: "There is no free square for it on this plot.",

  locked: "Not in the tray yet",
  unlockTier: (name, renown) => `Comes when you are “${name}”, at ${number(renown)} renown.`,
  unlockPlot: (plot) => `Comes with ${thePlot(plot)}.`,
  unlockLater: "Comes later.",

  planted: (flowerName) => `${flowerName} planted. It settles in overnight.`,
  /** the footer button that opens the hive shop */
  hives: "Hives",
};

// ───────────────────────── the hive shop ─────────────────────────

export const SHOP = {
  title: "Hive shop",
  buy: "Buy",

  newHive: "A new hive",
  /** type: the kind of hive a purchase gives, "Straw skep" */
  newHiveSub: (type) =>
    `A ${String(type).toLowerCase() || "hive"} with a small colony. You pay when you put it down.`,
  keeping: (n) => `You have ${number(n)}.`,

  /** what each thing on the shelf is for */
  for: {
    spare: "An empty hive, for catching a swarm or splitting a strong colony.",
    syrup: "1 portion is a jar’s worth of stores for a hive that is short.",
    remedy: "Knocks a hive’s mites right back.",
  },
  hold: (n) => `You have ${number(n)}.`,
  leaves: (n) => `Leaves you ${coins(n)}.`,
  why: {
    "no-coins": (short) => `You need ${coins(short)} more.`,
    "not-yet": "From the first day of summer.",
    "plot-full": "Each of your plots has its 4 hives. A new plot has room.",
    "square-taken": "There is no free square for a hive. Dig up a bed to make room.",
  },
  bought: {
    spare: "A spare hive, ready in the shed.",
    syrup: "A portion of sugar syrup for the cupboard.",
    remedy: "A thyme remedy for the cupboard.",
  },

  types: "Kinds of hive",
  typesSub: "To upgrade a hive, tap it on the meadow.",
  typeLine: (jarCount, limit) => `Holds ${jars(jarCount)}. Colony up to strength ${limit}.`,
  /** the last line of a row: the kind a new hive is, and what upgrading to the others costs */
  typeFirst: "A new hive is one of these.",
  typeCost: (cost) => `Upgrade to it for ${coins(cost)}.`,
  seeds: "Seeds",
};
