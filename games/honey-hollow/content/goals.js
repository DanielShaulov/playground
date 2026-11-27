// @ts-check
/**
 * Renown tiers and the goal list.
 *
 * Up to three goals are open at a time: the first three unclaimed goals, in
 * this order, whose conditions to be shown are met right now.
 *
 *   measure, arg, need   the goal is met when MEASURES[measure](state, arg) >= need
 *                        (core/progress.js lists the measures)
 *   reward               { coins, renown, seeds: { flower: n }, items: { syrup | spare | remedy: n },
 *                          recipe, wardrobe }
 *   season               [first, last] day of the year it is shown in
 *   after                a goal that must be claimed first
 *   fromDay              the first day it is shown on
 *   tier                 the renown tier it needs
 *   plot                 a plot that must be owned
 *
 * The first five are the tutorial. Text is plain and short; `text` says what
 * to do, never why it is good for you.
 */

/**
 * @typedef {{
 *   coins?: number, renown?: number, seeds?: Record<string, number>,
 *   items?: Record<string, number>, recipe?: string, wardrobe?: string
 * }} Reward
 * @typedef {{
 *   id: string, name: string, text: string, measure: string, arg?: string, need: number,
 *   reward: Reward, season?: [number, number], after?: string, fromDay?: number, tier?: number, plot?: string
 * }} Goal
 * @typedef {{ tier: number, name: string, renown: number, blurb: string }} Tier
 */

/** @type {Tier[]} */
export const TIERS = [
  { tier: 0, name: "New in the Hollow", renown: 0, blurb: "Clover and lavender in the seed tray." },
  {
    tier: 1,
    name: "Known at the market",
    renown: 10,
    blurb: "Borage and sunflower seeds, and 1 more customer each evening.",
  },
  {
    tier: 2,
    name: "The village’s beekeeper",
    renown: 30,
    blurb: "Buckwheat and ivy seeds. Lip balm and wax wraps in the workshop.",
  },
  { tier: 3, name: "Talk of the valley", renown: 70, blurb: "Gift baskets in the workshop." },
  { tier: 4, name: "Pride of the county", renown: 140, blurb: "A golden veil for your wardrobe." },
];

/** @type {Goal[]} */
export const GOALS = [
  {
    id: "first-flight",
    name: "Let them fly",
    text: "Start the day and watch the bees work the dandelions.",
    measure: "days",
    need: 1,
    reward: { coins: 5 },
  },
  {
    id: "first-jar",
    name: "The first jar",
    text: "Take a jar of honey from the hive.",
    measure: "jars",
    need: 1,
    reward: { coins: 5 },
  },
  {
    id: "first-sale",
    name: "Open the stall",
    text: "Sell a jar to a customer in the evening.",
    measure: "customers",
    need: 1,
    reward: { seeds: { clover: 4 } },
  },
  {
    id: "first-beds",
    name: "Something for summer",
    text: "Plant 3 beds where your bees can reach them.",
    measure: "planted",
    need: 3,
    reward: { coins: 10 },
  },
  {
    id: "delight-3",
    name: "Exactly what they wanted",
    text: "Delight 3 customers by offering what they wished for.",
    measure: "delighted",
    need: 3,
    reward: { coins: 10, renown: 1 },
  },
  {
    id: "two-honeys",
    name: "One flower at a time",
    text: "Take jars of 2 kinds of pure honey.",
    measure: "kinds",
    need: 2,
    reward: { seeds: { lavender: 3 } },
  },
  {
    id: "ten-jars",
    name: "A shelf of gold",
    text: "Take 10 jars of honey in all.",
    measure: "jars",
    need: 10,
    reward: { coins: 15 },
  },
  {
    id: "second-hive",
    name: "A second colony",
    text: "Have 2 hives.",
    measure: "hives",
    need: 2,
    reward: { coins: 15 },
  },
  {
    id: "first-candle",
    name: "By candlelight",
    text: "Make a beeswax candle in the workshop.",
    measure: "craftedOf",
    arg: "candle",
    need: 1,
    reward: { recipe: "lavender-candle" },
  },
  {
    id: "move-hive",
    name: "Follow the flowers",
    text: "In the morning, move a hive to a better square.",
    measure: "moved",
    need: 1,
    reward: { coins: 10 },
  },
  {
    id: "first-bunch",
    name: "A bunch for the workshop",
    text: "Pick a bunch from a bed of lavender, water mint or wild thyme in bloom.",
    measure: "picked",
    need: 1,
    season: [7, 15],
    reward: { recipe: "soap" },
  },
  {
    id: "first-soap",
    name: "Clean hands",
    text: "Make a bar of flower soap.",
    measure: "craftedOf",
    arg: "soap",
    need: 1,
    after: "first-bunch",
    reward: { coins: 15 },
  },
  {
    id: "box-hive",
    name: "Room to grow",
    text: "Upgrade a hive to a box hive.",
    measure: "upgraded",
    need: 1,
    reward: { items: { spare: 1 } },
  },
  {
    id: "queen-cells",
    name: "One becomes two",
    text: "Split a strong colony into a spare hive, or catch a swarm in one.",
    measure: "increase",
    need: 1,
    after: "box-hive",
    fromDay: 8,
    reward: { coins: 20, renown: 2 },
  },
  {
    id: "pond",
    name: "Down by the water",
    text: "Buy the Pond Bank.",
    measure: "plot",
    arg: "pond",
    need: 1,
    reward: { seeds: { mint: 4 } },
  },
  {
    id: "mites",
    name: "A dusting of sugar",
    text: "Dust a hive that has mites with sugar.",
    measure: "dusted",
    need: 1,
    fromDay: 10,
    reward: { items: { remedy: 1 } },
  },
  {
    id: "mint-honey",
    name: "Cool and fresh",
    text: "Take a jar of pure water mint honey.",
    measure: "jarsOf",
    arg: "mint",
    need: 1,
    plot: "pond",
    reward: { coins: 20 },
  },
  {
    id: "wasps",
    name: "Mind the door",
    text: "See off the wasps before they get into a hive.",
    measure: "fended",
    need: 1,
    season: [11, 20],
    reward: { coins: 15 },
  },
  {
    id: "familiar-face",
    name: "A familiar face",
    text: "Earn 3 hearts with a regular.",
    measure: "maxHearts",
    need: 3,
    reward: { coins: 15 },
  },
  {
    id: "five-kinds",
    name: "Five on the shelf",
    text: "Take jars of 5 kinds of pure honey.",
    measure: "kinds",
    need: 5,
    reward: { coins: 25, renown: 3 },
  },
  {
    id: "orchard",
    name: "The Old Orchard",
    text: "Buy the Old Orchard.",
    measure: "plot",
    arg: "orchard",
    need: 1,
    reward: { coins: 20 },
  },
  {
    id: "ribbon",
    name: "The Honey Show",
    text: "Win a ribbon at the Honey Show on the last evening of autumn.",
    measure: "ribbons",
    need: 1,
    season: [14, 20],
    reward: { coins: 20 },
  },
  {
    id: "winter-ready",
    name: "Tucked in",
    text: "Bring every colony through a winter without a hungry night.",
    measure: "goodWinters",
    need: 1,
    fromDay: 15,
    reward: { wardrobe: "knit", coins: 30 },
  },
  {
    id: "winter-fair",
    name: "The Winter Fair",
    text: "Sell 3 things at the Winter Fair.",
    measure: "fairSold",
    need: 3,
    season: [21, 24],
    reward: { coins: 30 },
  },
  {
    id: "lip-balm",
    name: "Soft as wax",
    text: "Make a tin of honey lip balm.",
    measure: "craftedOf",
    arg: "balm",
    need: 1,
    tier: 2,
    reward: { coins: 20 },
  },
  {
    id: "apple-honey",
    name: "Blossom time",
    text: "Take a jar of pure apple blossom honey.",
    measure: "jarsOf",
    arg: "apple",
    need: 1,
    plot: "orchard",
    reward: { coins: 30 },
  },
  {
    id: "five-hives",
    name: "A proper apiary",
    text: "Have 5 hives.",
    measure: "hives",
    need: 5,
    reward: { coins: 40 },
  },
  {
    id: "three-best",
    name: "Three of the best",
    text: "Take jars of 3 kinds of honey at ★★★.",
    measure: "kinds3",
    need: 3,
    reward: { coins: 20, renown: 4 },
  },
  {
    id: "hill",
    name: "Up on the hill",
    text: "Buy Heather Hill.",
    measure: "plot",
    arg: "hill",
    need: 1,
    reward: { seeds: { heather: 4, thyme: 3 } },
  },
  {
    id: "heather-honey",
    name: "Purple gold",
    text: "Take a jar of pure heather honey.",
    measure: "jarsOf",
    arg: "heather",
    need: 1,
    plot: "hill",
    reward: { coins: 40 },
  },
  {
    id: "gift-basket",
    name: "Tied with a bow",
    text: "Make a gift basket.",
    measure: "craftedOf",
    arg: "basket",
    need: 1,
    tier: 3,
    reward: { coins: 40 },
  },
  {
    id: "book-12",
    name: "A good read",
    text: "Find 12 pages of the bee book.",
    measure: "facts",
    need: 12,
    reward: { coins: 30 },
  },
  {
    id: "gold-ribbon",
    name: "Best in show",
    text: "Win a gold ribbon at the Honey Show.",
    measure: "gold",
    need: 1,
    season: [14, 20],
    reward: { coins: 60, renown: 5 },
  },
  {
    id: "tall-stack",
    name: "Storeys high",
    text: "Upgrade a hive all the way to a tall stack.",
    measure: "bestHive",
    need: 3,
    reward: { coins: 60 },
  },
  {
    id: "friends",
    name: "Friends all round",
    text: "Earn 3 hearts with each of the 8 regulars.",
    measure: "friends",
    need: 8,
    reward: { coins: 80 },
  },
  {
    id: "best-friend",
    name: "An old friend",
    text: "Earn 12 hearts with a regular.",
    measure: "maxHearts",
    need: 12,
    reward: { coins: 100 },
  },
  {
    id: "all-honeys",
    name: "The whole Hollow in jars",
    text: "Take a jar of all 11 kinds of pure honey.",
    measure: "kinds",
    need: 11,
    reward: { coins: 100, renown: 10 },
  },
  {
    id: "book-30",
    name: "Well read",
    text: "Find 30 pages of the bee book.",
    measure: "facts",
    need: 30,
    reward: { coins: 60 },
  },
  {
    id: "all-stars",
    name: "Eleven times three",
    text: "Take a ★★★ jar of each of the 11 honeys.",
    measure: "kinds3",
    need: 11,
    reward: { coins: 200, renown: 20 },
  },
];

export const GOAL_IDS = GOALS.map((g) => g.id);
