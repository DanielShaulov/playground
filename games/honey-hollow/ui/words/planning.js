// @ts-check
/**
 * Every sentence of the four planning sheets: the calendar, the map, the
 * goals and the "More" menu (ui/sheets/calendar.js, map.js, goals.js,
 * more.js). Plain objects and small functions; nothing here knows the DOM.
 */

import { coins, plural, list, number, stars, capital } from "../words.js";

/** The weather, by the core's name for it. `fly` is what it means for the bees. */
export const WEATHER_WORDS = {
  sunny: { name: "Sunny", fly: "Good flying" },
  cloudy: { name: "Cloudy", fly: "Fair flying" },
  windy: { name: "Windy", fly: "Slow flying" },
  rain: { name: "Rain", fly: "Hardly any flying" },
  frost: { name: "Frost", fly: "The bees stay in" },
  snow: { name: "Snow", fly: "The bees stay in" },
};

/** A plot's name inside a sentence ("Buy the Pond Bank?"). */
export const PLOT_THE = {
  home: "the Home Meadow",
  pond: "the Pond Bank",
  orchard: "the Old Orchard",
  hill: "Heather Hill",
};

// ───────────────────────── the calendar ─────────────────────────

export const CALENDAR = {
  title: "Calendar",
  /** the sheet's title once it is up: "Calendar · Year 2" */
  titleYear: (year) => `Calendar · ${year}`,

  // the two weather tiles at the top (today's is headed by the date)
  today: "Today",
  tomorrow: "Tomorrow",
  /** under a weather tile's name: "Sunny. Good flying" */
  weather: (name, fly) => `${name}. ${fly}`,

  // the legend above the grid
  legendToday: "Today",
  show: "Honey Show",
  fair: "Winter Fair",
  /** aria-label of the whole grid */
  grid: "The year: when each flower blooms",

  /** the divider above the flowers the keeper does not have yet */
  locked: "Still to find",
  /** aria-label of a row */
  row: (name, range) => `${name}. Blooms from ${range}.`,
  rowLocked: (name, range) => `${name}, not yours yet. Blooms from ${range}.`,

  // the two lines under the grid
  showIn: (n) =>
    n === 0
      ? "The Honey Show is this evening."
      : n === 1
        ? "The Honey Show is tomorrow evening."
        : `The Honey Show is in ${number(n)} days, on the last evening of autumn.`,
  fairIn: (n) =>
    n === 0
      ? "The Winter Fair is this evening."
      : n === 1
        ? "The Winter Fair is tomorrow evening."
        : `The Winter Fair is in ${number(n)} days, on winter day 4.`,
  /** under those: how to use the page */
  tip: "Tap a flower to read about it.",

  // ── the flower card ──

  /** the chip beside the flower's name */
  status: {
    bloom: "In bloom",
    lastDay: "Last day in bloom",
    tomorrow: "Opens tomorrow",
    opensIn: (n) => `Opens in ${number(n)} days`,
    locked: "Not yours yet",
  },
  blooms: (range) => `Blooms from ${range}.`,
  /** where it will grow, by the core's `where` */
  where: {
    any: "Grows on any grass or hill ground.",
    hill: "Grows only on Heather Hill.",
    water: "Grows only beside water, on the Pond Bank.",
    tree: "Grows only on the old apple trees. It cannot be planted.",
  },
  /** how the keeper comes by it */
  seed: (price) => `Seed for 1 bed costs ${coins(price)}.`,
  seedHeld: (price, n) => `Seed for 1 bed costs ${coins(price)}. You have ${plural(n, "seed")}.`,
  seedOnly: (n) => `You have ${plural(n, "seed")}. The seed tray has none yet.`,
  withPlot: (plot) => `Comes with ${PLOT_THE[plot] ?? plot}.`,
  withTier: (tierName) => `The seed tray has it once you are “${tierName}”.`,
  nectar: (n) => `Each bed offers ${number(n)} nectar a day.`,
  nectarTree: (n) => `Each tree offers ${number(n)} nectar a day.`,
  bunch: "Gives 1 bunch a year to pick.",

  /** the honey: "pale gold · floral" */
  honeyLook: (colour, tasteList) => [capital(colour), ...tasteList].join(" · "),
  /** today's price of a jar at ★ and at ★★★ */
  price: (low, high) =>
    low === high ? `Today: ${coins(low)} a jar.` : `Today: ★ ${number(low)}, ★★★ ${coins(high)}.`,
  best: (n) => `Your best so far: ${stars(n)}`,
  notYet: "No jar of it yet.",

  beside: "In bloom at the same time",
  /** one neighbour: "clover for 4 days" */
  besideOne: (name, days, whole) =>
    whole
      ? `${name.toLowerCase()} the whole time`
      : `${name.toLowerCase()} for ${plural(days, "day")}`,
  besideList: (items) => `${capital(list(items))}.`,
  besideNote: "In reach of the same hive they mix into meadow blend.",
  besideNone: "Nothing else of yours blooms with it, so a hive beside it makes pure honey.",

  seeds: "Open the seed tray",
  /** aria-label of the card's close button */
  closeCard: "Put the card away",
};

// ───────────────────────── the map ─────────────────────────

export const MAP = {
  title: "Map of the Hollow",
  /** the line at the top */
  purse: (n) => `You have ${coins(n)}. Tap a plot of yours to walk there.`,
  purseAll: "All 4 plots are yours. Tap a plot to walk there.",

  here: "You are here",
  yours: "Yours",
  go: "Go there",
  stay: "Back to it",
  /** what stands on a plot of yours */
  counts: (hives, beds, blooming) =>
    [
      hives > 0 ? plural(hives, "hive") : beds > 0 ? "No hives" : "No hives yet",
      beds > 0 ? plural(beds, "bed") : "",
      blooming > 0 ? `${number(blooming)} in bloom` : "",
    ]
      .filter(Boolean)
      .join(" · "),

  /** what grows on this plot and nowhere else */
  onlyHere: (names) => `Only here: ${list(names.map((n) => n.toLowerCase()))}.`,
  /** one more thing worth knowing before buying, by plot */
  perk: {
    pond: "Hives near the water fly better in summer.",
    orchard: "The trees are already grown. Nothing to plant.",
    hill: "Windy days slow the bees more up here.",
  },

  buy: (price) => `Buy for ${number(price)}`,
  left: (n) => `You would have ${coins(n)} left.`,
  short: (n) => `You need ${coins(n)} more.`,
  /** under a plot that is not yours: its price */
  price: (n) => coins(n),
  /** the footer, over the button: "Pond Bank · 150 coins" */
  footName: (name, price) => `${name} · ${coins(price)}`,
  confirm: (plot, price, left) => ({
    title: `Buy ${PLOT_THE[plot] ?? "this plot"}?`,
    text: `It costs ${coins(price)}. You will have ${coins(left)} left.`,
    yes: "Buy it",
    no: "Not yet",
  }),
  bought: (plot) => `${capital(PLOT_THE[plot] ?? "It")} is yours.`,
  /** alt text of a thumbnail */
  picture: (name) => `${name} as it looks today`,
};

// ───────────────────────── goals ─────────────────────────

/**
 * Where to tap for a goal, by what it measures (content/goals.js `measure`).
 * `sheet` names a sheet the card can open for the player, with its button's words.
 * @type {Record<string, { text: string, sheet?: string, open?: string }>}
 */
export const GOAL_HINTS = {
  days: { text: "Tap “Start the day” under the meadow." },
  jars: { text: "Tap a hive on the meadow, then take a jar." },
  jarsOf: {
    text: "Stand a hive where this is the only flower in reach. Tap the hive to see what a jar would be.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  kinds: {
    text: "A hive with a single flower in reach makes pure honey. Tap a hive to see what a jar would be.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  kinds3: {
    text: "★★★ comes from a hive that reaches a single flower. Empty it before the next flower opens.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  customers: { text: "In the evening, tap “To the stall” and offer a jar." },
  delighted: { text: "At the stall, read the wish and offer something that fits it." },
  planted: {
    text: "Choose a seed, then tap squares near a hive.",
    sheet: "seeds",
    open: "Open the seed tray",
  },
  picked: { text: "In the morning, tap a bed in bloom, then “Pick a bunch”." },
  moved: { text: "In the morning, tap a hive, then “Move the hive”." },
  upgraded: { text: "Tap a hive, then “Upgrade”." },
  increase: {
    text: "Keep a spare hive. Then tap a strong hive and “Split the colony”, or tap a swarm when one hangs nearby.",
    sheet: "hives",
    open: "Open the hive shop",
  },
  dusted: { text: "Tap a hive that shows mites, then “Dust with sugar”." },
  fended: { text: "When wasps come to a hive during the day, tap it at once." },
  fairSold: {
    text: "Go to the stall on winter day 4 with candles, soap and your finest honey.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  ribbons: {
    text: "On autumn day 7, enter your best pure honeys before the stall opens.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  gold: {
    text: "Keep a ★★★ jar for autumn day 7 and enter it before the stall opens.",
    sheet: "calendar",
    open: "Open the calendar",
  },
  goodWinters: {
    text: "From autumn, each hive marks what it needs for winter. Leave that much in.",
  },
  hives: {
    text: "Buy a new hive and stand it among flowers.",
    sheet: "hives",
    open: "Open the hive shop",
  },
  bestHive: { text: "Tap a hive, then “Upgrade”, until it is a tall stack." },
  craftedOf: { text: "Make it in the workshop.", sheet: "workshop", open: "Open the workshop" },
  plot: { text: "Buy it on the map.", sheet: "map", open: "Open the map" },
  maxHearts: { text: "A heart comes each time you give a regular exactly what they wished for." },
  friends: { text: "A heart comes each time you give a regular exactly what they wished for." },
  facts: {
    text: "Pages open at firsts. Try something you have not done yet.",
    sheet: "book",
    open: "Open the bee book",
  },
  renown: { text: "Delight your customers, finish goals and win ribbons." },
};

export const GOALS = {
  title: "Goals",
  /** the line over the open goals */
  lead: "What to do next.",
  /** beside a meter: "1 of 3" */
  progress: (have, need) => `${number(have)} of ${number(need)}`,
  ready: "Goal met",
  claim: "Claim",
  /** aria-label of a claim button */
  claimLabel: (name) => `Claim the reward for “${name}”`,
  reward: "Reward:",

  // the pieces of a reward
  rewardCoins: (n) => coins(n),
  rewardRenown: (n) => `${number(n)} renown`,
  rewardSeeds: (n, name) => `${number(n)} ${name.toLowerCase()} ${n === 1 ? "seed" : "seeds"}`,
  rewardItem: {
    spare: (n) => plural(n, "spare hive"),
    syrup: (n) => `${plural(n, "portion")} of sugar syrup`,
    remedy: (n) => plural(n, "thyme remedy", "thyme remedies"),
  },
  rewardRecipe: (name) => `the recipe for ${name.toLowerCase()}`,
  rewardWardrobe: (name) => `a ${name.toLowerCase()} for your wardrobe`,
  /** the toast after a claim */
  claimed: (rewardText) => `Yours: ${rewardText}.`,

  /** no goal is open, but the list is not finished */
  noneNow: "No new goals today. More come with the seasons.",
  /** every goal is claimed */
  allDone: "Every goal is done. The Hollow is yours to enjoy.",

  // the renown ladder
  renown: "Renown",
  have: (n) => `${number(n)} renown`,
  source: "It grows with every delighted customer, every goal and every ribbon.",
  from: (n) => (n === 0 ? "From the start" : `From ${number(n)} renown`),
  here: "You are here",
  next: (n, name) => `${number(n)} more to “${name}”`,
  top: "The top of the ladder. Nothing left to prove.",
  customers: (n) =>
    `${plural(n, "customer")} ${n === 1 ? "comes" : "come"} to the stall each evening.`,
  /** aria-label of a rung */
  rung: (name, reached) => (reached ? `${name}, reached` : `${name}, still to come`),

  // what is already done
  done: (n) => `Done so far (${number(n)})`,
};

// ───────────────────────── the More menu ─────────────────────────

export const MORE = {
  title: "More",
  /** the summary line: "Summer · day 3", then "Year 1 · Sunny" */
  summary: (year, weatherName) => `${year} · ${weatherName}`,
  /** when the keeper has a name: over the summary */
  whose: (name) => `${name}’s day`,
  coinsLabel: (n) => `You have ${coins(n)}`,
  renownLabel: (n) => `${number(n)} renown`,

  rows: {
    calendar: "Calendar",
    map: "Map",
    goals: "Goals",
    book: "Bee book",
    workshop: "Workshop",
    seeds: "Seed tray",
    hives: "Hive shop",
    wardrobe: "Wardrobe",
    settings: "Settings",
  },

  // the line under each row's name
  // (each fits one line on the narrowest phone: about 26 letters beside a badge)
  calendarBloom: (name) => `${name} in bloom.`,
  calendarMany: (n) => `${number(n)} flowers in bloom.`,
  calendarQuiet: "Nothing in bloom today.",
  calendarWinter: "Asleep until spring.",
  map: (owned, all) =>
    owned >= all
      ? `All ${number(all)} plots are yours.`
      : `${number(owned)} of ${number(all)} plots are yours.`,
  goalsReady: (n) => (n === 1 ? "A reward is waiting." : `${number(n)} rewards are waiting.`),
  goalsOpen: (n) => (n === 1 ? "1 thing to do next." : `${number(n)} things to do next.`),
  goalsNone: "No goals open right now.",
  bookNew: (n) => (n === 1 ? "A new page to read." : `${number(n)} new pages to read.`),
  book: (found, all) => `${number(found)} of ${number(all)} pages found.`,
  workshopCan: (n) => (n === 1 ? "1 thing you could make." : `${number(n)} things you could make.`),
  workshopIdle: "Candles, soap and gifts.",
  workshopDone: "Enough making for today.",
  workshopClosed: "Opens with your first beeswax.",
  workshopBusy: "When the bees are home.",
  seedsLine: (n) => (n === 1 ? "1 kind of seed to plant." : `${number(n)} kinds of seed to plant.`),
  hivesLine: (price) => `A new hive costs ${coins(price)}.`,
  wardrobe: "Hair, clothes and hats.",
  settings: "Sound, motion, saved game.",

  /** aria-label of a badge */
  badge: (n) => `${number(n)} waiting`,
};
