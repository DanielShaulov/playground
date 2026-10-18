// @ts-check
/**
 * Onboarding words and order. Data only; the rules that start, advance and
 * drop each moment are in core/tutorial.js, the intro scene's pictures in
 * ui/intro.js.
 *
 * The first days teach by showing: one MOMENT at a time, each opened by
 * something happening in the shop, as a short note from the old keeper
 * pinned beside the thing it is about. A moment is a few BEATS:
 *
 *   text    the note. {name} is the customer the moment is about, {tier}
 *           and {opens} the tier just reached and what it brings.
 *   point   what the note points at (ui/tutorial.js turns it into an element).
 *   on      event types that move to the next beat (the player did the thing).
 *   ui      a screen-only thing that moves on (ui/tutorial.js watches for it
 *           and dispatches { type: "tutorial", do: "next" }).
 *   Neither: the note has a "Got it" button.
 *
 * Copy reads as the keeper's notes in the shop, never as notes about the rules.
 */

export const KEEPER = { name: "Agnes Pell", sign: "A.P." };

/** The intro scene: a few pictures, each with a line. `art` picks the picture. */
export const INTRO = [
  {
    art: "street",
    text: "For forty years Agnes Pell kept the little pickle shop on Brine Lane. This spring she hung up her apron.",
  },
  {
    art: "letter",
    text: "She left you the key, a note, and two jars still on the shelf. “Ripe and ready,” the note says. “The rest is yours.”",
  },
  {
    art: "inside",
    text: "The shelves are bare, the brine is fresh, and the street is waking up.",
    last: "Open the door",
  },
];

/**
 * @typedef {{ text: string, point: string, on?: string[], ui?: string }} Beat
 * @typedef {{ beats: Beat[] }} Moment
 */

/** @type {Record<string, Moment>} */
export const MOMENTS = {
  gift: {
    beats: [
      {
        text: "These two are ripe, and folk will want them. Sell them while your own jars come on.",
        point: "gift",
      },
    ],
  },
  brew: {
    beats: [
      { text: "An empty spot earns nothing. Tap it to start a jar.", point: "empty", ui: "sheet" },
      {
        text: "Pick one. A quick jar sells sooner; a slow one keeps longer.",
        point: "sheet",
        on: ["brewed"],
      },
      {
        text: "It starts crisp and goes funky. Watch the marker under it creep along.",
        point: "brewed",
      },
      { text: "Turn the sign when you're ready.", point: "open", on: ["opened"] },
    ],
  },
  serve: {
    beats: [
      { text: "{name} knows what they like. The pale box on the strip is it.", point: "counter" },
      {
        text: "Tap a jar whose marker sits inside the box.",
        point: "fits",
        ui: "select",
      },
      { text: "That one. Hand it over.", point: "serve", on: ["served"] },
      { text: "The nearer the middle of the box, the bigger the tip.", point: "coins" },
    ],
  },
  keep: {
    beats: [
      { text: "{name} likes it riper than anything on the shelf today.", point: "counter" },
      {
        text: "Take a pre-order, and they'll come back for it.",
        point: "preorder",
        on: ["preordered"],
      },
      {
        text: "Their order is up on the board. Tap it to choose their jar.",
        point: "ticket",
        ui: "plan",
      },
      {
        text: "The jar you started this morning will be just right by then, so no need for another. Keep a portion back for them.",
        point: "plan-go",
        on: ["held"],
      },
      { text: "Their face on the jar means that portion is spoken for.", point: "kept" },
    ],
  },
  fresh: {
    beats: [
      { text: "Nothing on the shelf will suit {name} by the time they're back.", point: "counter" },
      {
        text: "Take the pre-order all the same. A new jar can be ready for them.",
        point: "preorder",
        on: ["preordered"],
      },
      { text: "Tap their order on the board.", point: "ticket", ui: "plan" },
      {
        text: "Start a new jar for them. Started now, it will be at its best when they come.",
        point: "plan-go",
        on: ["startedForOrder"],
      },
      { text: "That one's theirs. It ripens while you work.", point: "kept" },
    ],
  },
  regular: {
    beats: [
      {
        text: "{name} has been in before. Treat them well and they'll come back on a rhythm.",
        point: "counter",
      },
      {
        text: "Serve them now, or take a pre-order and time a jar for the day they name.",
        point: "preorder",
        on: ["served", "preordered"],
      },
      { text: "Their next visit is up on the board. Plan a jar for it.", point: "board" },
    ],
  },
  market: {
    beats: [
      { text: "The market's out in the evenings. Have a look.", point: "tab-market", ui: "market" },
      {
        text: "Add-ins change how a jar ripens: quicker, slower, sweeter. Prices move a little each day.",
        point: "market",
      },
    ],
  },
  bench: {
    beats: [
      {
        text: "Try an add-in at the bench before you trust a whole jar to it.",
        point: "bench",
        ui: "bench",
      },
      {
        text: "Drop something from the pantry into the mix, then try it. The time-lapse shows what it does.",
        point: "bench-try",
        on: ["experimented"],
      },
      {
        text: "Some mixes turn into new recipes. Customers drop hints.",
        point: "bench-card",
      },
    ],
  },
  tier: {
    beats: [
      {
        text: "Word's getting round: the shop is {tier} now. {opens}",
        point: "title",
      },
    ],
  },
};

/**
 * Day 1's first walk-ins, in order: each shows one basic case (core/tutorial.js
 * sets their wish from the shelf). `as` names the moment their visit opens.
 */
export const SCRIPT = [
  { as: "serve", name: "Marta", look: 412 },
  { as: "keep", name: "Oskar", look: 87 },
  { as: "fresh", name: "Bea", look: 655 },
];

/** Moments in the order they are tried when nothing is showing. */
export const MOMENT_IDS = Object.keys(MOMENTS);

/** A moment dropped this many times (the moment passed before it was done) stops coming back. */
export const MAX_TRIES = 3;
