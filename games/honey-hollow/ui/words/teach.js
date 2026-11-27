// @ts-check
/**
 * Every sentence of the teaching layer (ui/teach.js): the keeper's notes that
 * walk a new player through her first two days, the one note each new system
 * gets the first time it matters, and the herald's toasts for good news no
 * screen announces.
 *
 * Same voice as ui/words.js: plain, warm, short, British spelling, no
 * exclamation marks. A note is one or two short sentences on a slip of paper
 * pointing at something: it says what to do and why, and never more.
 * Every rule a note states is in docs/honey-hollow/rules.md.
 */

import { list, number, thePlot } from "../words.js";

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
export const NOTES = {
  // ───────────── the first two days, in the order they come ─────────────

  /** Day 1, morning. Points at "Start the day". */
  welcome: "The bees in this old straw skep are yours now. Start the day to let them fly.",

  /** Day 1, a moment into the flying. Points at the hive. */
  reach: "Bees gather from flowers within 2 squares of the hive. The nearest feed it best.",

  /** The first goal met. Points at the hint line under the meadow. */
  goal: "A goal met. Tap this line to claim the reward and see what to try next.",

  /** The first evening with a jar's worth in the comb. Points at the hive. */
  honey: "A day’s flying has put honey in the comb. Tap the hive to look inside.",

  /** The hive sheet, the first time it has a verdict to show. Points at the verdict. */
  verdict: "Honey from a single kind of flower is pure. The purer it is, the more stars and coins.",

  /** The hive sheet, before the first jar is taken. Points at the stepper and the Take button. */
  take: "Choose how many jars to take. What you leave is the bees’ supper.",

  /** The first evening with a jar on the shelf. Points at "To the stall". */
  toStall: "Your first jar of honey. Customers call in the evening, so take it to the stall.",

  /** The stall, the first customer. Points at what they said; the ring is on the jar that fits. */
  wish: "Each customer has a wish. Offer exactly that and they pay more and tell their friends.",

  /** The first night card. Points at "Tomorrow". */
  night: "Tomorrow’s weather and blooms are always shown here, so you can plan the morning.",

  /**
   * The second morning, nothing planted yet. Points at Seeds.
   * left: days the dandelions still bloom after today (negative: over).
   */
  seeds: (left) =>
    `${
      left > 1
        ? `The dandelions have ${number(left)} more days.`
        : left === 1
          ? "The dandelions fade after tomorrow."
          : left === 0
            ? "Today is the dandelions’ last day."
            : "The dandelions are over."
    } Open Seeds and plant what blooms next, near the hive.`,

  /** The seed tray, before the first planting. Points at the first bloom strip. */
  strip: "Each strip is a year. A bed blooms in the coloured part. The pin is today.",

  /** The first morning a second hive can be afforded. Points at Hives. */
  secondHive:
    "You can afford a second hive. Try a few squares to see what it would bring in on each.",

  // ───────────── one note for each new system ─────────────

  /** The first beeswax. Points at Workshop. */
  workshop: "Beeswax comes with every 2 jars you take. The workshop turns it into candles to sell.",

  /** The first lavender, water mint or wild thyme in bloom. Points at the bed. */
  bunch: (flower) =>
    `Tap this ${lower(flower)} to pick a bunch for the workshop. It gives 1 a year, and no nectar that day.`,

  /** The hive sheet in the morning, once moving is worth knowing. Points at the Move row. */
  move: "Move a hive in the morning. The bees fly at half strength that day, learning the way home.",

  /** A hive nine tenths full. Points at the hive. */
  full: "This hive is nearly full, and nectar that will not fit is lost. Take jars or upgrade the hive.",

  /** The evening before a new flower's nectar would mix into a pure honey. Points at the hive. */
  spoil:
    "Tomorrow another flower’s nectar mixes in here. Take the jars tonight to keep their stars.",

  /** Queen cells. Points at the hive. `morning`: a colony can only be split in the morning. */
  queen: (morning) =>
    morning
      ? "Queen cells. This colony has outgrown its hive. Upgrade it or split it, or half will swarm."
      : "Queen cells. This colony has outgrown its hive. Upgrade it, or half the bees will swarm.",

  /** A swarm hanging on a square. Points at it. `spare`: the keeper holds a spare hive. */
  swarm: (spare) =>
    spare
      ? "A swarm: half a colony, resting here till nightfall. Tap it to give it your spare hive."
      : "A swarm: half a colony, here till nightfall. Buy a spare hive, then tap the swarm to catch it.",

  /** Mites spotted. Points at the hive. */
  mites: "Mites in this hive. Tap it and dust with sugar under Care: free, once a day.",

  /** Wasps at a hive, during the day. Points at the hive. */
  wasps:
    "Wasps are after the honey. Tap the hive now to narrow its door, so the guards can hold it.",

  /** A colony that went hungry last night. Points at the hive. */
  hungry:
    "This colony went hungry last night and grew weaker. Leave it more honey, or feed sugar syrup.",

  /** The first autumn morning. Points at the hive. */
  autumn: "Autumn. The bees winter on their stores, so each hive now shows how much to leave them.",

  /** The first winter morning. Points at Workshop, or at "To the stall" if there is no wax yet. */
  winter: (workshop) =>
    workshop
      ? "Winter. The bees stay in and live on their stores. The workshop lets you make twice as much."
      : "Winter. The bees stay in and live on their stores. The stall still opens every evening.",

  /** The last days of autumn. Points at the day chip (the calendar). */
  show: "The Honey Show is on autumn’s last evening. Keep a jar of each pure honey. Stars win ribbons.",

  /**
   * The first days of winter. Points at the day chip.
   * day: the Fair's day of winter; customers: how many come; half: they pay half as much again.
   */
  fair: (day, customers) =>
    `On winter day ${number(day)} the Winter Fair pays half as much again for gifts and your finest honey.`,

  /** The first morning a plot can be afforded. Points at the arrow to the next plot. */
  land: (name) =>
    `You can afford ${thePlot(name)}: room for more hives, and flowers that grow nowhere else.`,

  /** The first renown. Points at the renown chip. */
  renown:
    "Delighted customers talk. That is renown, and it brings new seeds, recipes and customers.",

  /** The first regular at the stall. Points at their hearts. `gift`: hearts for the first gift. */
  regular: (name, gift) =>
    `${name} is a regular. Delight a regular to fill a heart. At ${number(gift)} hearts they bring a gift.`,
};

export const HERALD = {
  /**
   * A goal became ready while the meadow's hint line was out of sight. One
   * short line, also away at the stall or the night card (it covers the
   * picture there): the meadow's hint line says how to claim it.
   */
  goal: (names, _away) => `${names.length > 1 ? "Goals" : "Goal"} met: ${list(names)}.`,

  /** A renown tier reached anywhere but the stall (which says so itself). */
  tier: (name) => `Word gets round. You are now “${name}”.`,

  /** New seeds, recipes or clothes that came with renown or with a plot. One toast for all of it. */
  unlocked: ({ flowers = [], recipes = [], wardrobe = [] }) =>
    [
      flowers.length ? `New in the seed tray: ${list(flowers.map(lower))}.` : "",
      recipes.length
        ? `${recipes.length > 1 ? "New recipes" : "A new recipe"} in the workshop: ${list(recipes.map(lower))}.`
        : "",
      wardrobe.length ? `New in the wardrobe: ${list(wardrobe.map(lower))}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
};
