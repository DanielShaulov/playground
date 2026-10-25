// @ts-check
/**
 * The end of the first month: a short scene and a credit roll on the morning
 * after day ENDING_DAY, seen once (core/ending.js), then the shop carries on.
 * Data only; the pictures are drawn in ui/ending.js.
 *
 * SCENE beats, like the intro's (content/tutorial.js INTRO): `art` picks the
 * picture, `text` is the line under it. {served}, {earned} and {tier} are
 * the month's numbers and the shop's tier name. The credit roll comes last.
 *
 * LETTER is Agnes's note on the second picture: {regular} is the regular who
 * came most often; with no regulars yet, NO_REGULAR takes its place.
 *
 * CREDITS roll top to bottom. A row with `regulars` lists the regulars the
 * shop has won, with their faces; `crowd` is the line under them. `keeper`
 * shows the initials the player signed with, once they have.
 */

import { KEEPER } from "./tutorial.js";

/** The last day of the first month. The scene shows on the morning after it. */
export const ENDING_DAY = 30;

export const SCENE = [
  {
    art: "dusk",
    text: "Thirty days on Brine Lane. The shelves Agnes left bare are full, and the lamps come on over a window of your own jars.",
  },
  {
    art: "letter",
    text: "In the morning post, a letter in a hand you know.",
  },
  {
    art: "ledger",
    text: "{served} portions sold and {earned} coins taken. The street calls the shop “{tier}” now.",
  },
];

/** Agnes's letter, line by line. */
export const LETTER = {
  hello: "My dear,",
  lines: ["They tell me", "{regular}", "won't buy pickles", "anywhere else.", "I knew you'd do."],
  sign: `— ${KEEPER.name.split(" ")[0]}`,
};
export const NO_REGULAR = [
  "They tell me",
  "the lane is busier",
  "than it's been",
  "in years.",
  "I knew you'd do.",
];

export const CREDITS = [
  { role: "Keeper of the Brine Nook", names: ["You"], keeper: true },
  { role: "The keeper before you", names: [KEEPER.name] },
  { role: "Regulars", regulars: true, crowd: "and everyone who stopped at the window" },
  { role: "Dreamed up and played every day by", names: ["Hadash"] },
  { role: "Written and drawn by", names: ["Claude"] },
  { role: "Sounds", names: ["ZzFX by Frank Force"] },
];

/**
 * After the pictures, the keeper signs the shop's book with three letters,
 * like an old arcade, and the month goes on this phone's board of best first
 * months (ui/scores.js), ranked by coins taken in the first 30 days. A shop
 * that was already past day 30 when the scene came signs too, but its
 * takings run past the month, so it stays off the board (LATE).
 */
export const SIGN = {
  title: "Sign the shop's book",
  text: "Three letters, for the board of best first months on this phone.",
  button: "Sign",
  board: "Best first months",
  late: "This shop was past day 30 when the book came, so it can't go on the board.",
};
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * The board never starts empty: like an arcade's, it comes with the house's
 * own scores to beat. Agnes's forty years at the top, then the street.
 */
export const HOUSE_SCORES = [
  ["AGP", 8000],
  ["BRM", 5000],
  ["MEI", 3500],
  ["OKA", 2000],
  ["KNJ", 1000],
];
/** How many shops the board keeps. */
export const BOARD_SIZE = 10;

/** The roll's last words, and the button that goes back to the shop. */
export const THANKS = "Thank you for keeping the shop.";
export const CARRY_ON = "Keep the shop open";
