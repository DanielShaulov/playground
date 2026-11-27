// @ts-check
/**
 * Words for the intro cards, the "make your beekeeper" scene and the
 * wardrobe sheet. Plain, warm, short; British spelling; no exclamation marks.
 * The names of looks, hats and talents come from the core's own tables.
 */

// ───────────────────────── the intro ─────────────────────────

export const INTRO = {
  /** The three picture-book pages: the line under the picture, and what the picture shows. */
  pages: [
    {
      text: "A letter came in spring. A meadow in Honey Hollow is yours now, a little wild and very quiet.",
      alt: "A spring meadow under an old apple tree in blossom, dotted with dandelions.",
    },
    {
      text: "By the apple tree stands an old straw hive, called a skep. The bees are still in it, busy as ever.",
      alt: "An old straw beehive in the grass, with bees coming and going.",
    },
    {
      text: "Plant flowers for them and sell their honey at the village stall. There is no hurry here.",
      alt: "Rows of lavender and sunflowers, a hive, and a little market stall with jars of honey on its counter.",
    },
  ],
  /** Painted on the board of the stall in the third picture. */
  sign: "Honey",
  /** The big button: on the first two pages, then on the last. */
  next: "Turn the page",
  last: "Make my beekeeper",
  /** The last page's button when a beekeeper exists already. */
  lastMade: "To the meadow",
  skip: "Skip",
  /** Read out for the row of dots. */
  page: (n, of) => `Page ${n} of ${of}`,
};

// ───────────────────────── the picker (creator and wardrobe) ─────────────────────────

export const KEEPER = {
  /** Scene heading, first step. */
  title: "Make your beekeeper",
  /** The same scene opened when a beekeeper exists already. */
  editTitle: "Your beekeeper",

  /** Under each tab's little picture. Short: seven share the width of a small phone. */
  tabs: {
    body: "Body",
    skin: "Skin",
    hair: "Hair",
    hairColor: "Colour",
    clothes: "Clothes",
    hat: "Hat",
    extras: "Extras",
  },
  /** What a screen reader hears for each tab, where the short word is not enough. */
  tabNames: { hairColor: "Hair colour", extras: "Beard and glasses" },
  /** The label at the start of each row's caption ("Hair · Long waves"). */
  parts: {
    body: "Body",
    skin: "Skin",
    hair: "Hair",
    hairColor: "Hair colour",
    overalls: "Overalls",
    shirt: "Shirt",
    hat: "Hat",
    beard: "Beard",
    glasses: "Glasses",
  },
  /** Caption: part, then the chosen thing's name. */
  caption: (part, name) => `${part} · ${name}`,

  /** The name field. */
  nameLabel: "Name",
  /** What the beekeeper is called if the field is left as it is, or emptied. */
  defaultName: "Robin",
  surprise: "Surprise me",
  /** Read out for the preview picture. */
  preview: (name) => (name ? `${name}, your beekeeper` : "Your beekeeper"),

  /** On a swatch that is not yours yet: who or what it comes from, in a word or two. */
  earnShort: { goal: "A goal", tier: "Renown", ribbon: "Honey Show", unknown: "Not yet" },
  /** Toast when a swatch that is not yours yet is tapped: "Flower crown: a gift from Posy…". */
  restingToast: (name, how) => `${name}: ${how}.`,
  /** How a piece that is not yours yet is earned (the second half of that toast). */
  earn: {
    tier: (name) => `yours once you are “${name}”`,
    goal: (name) => `the reward for “${name}”`,
    gift: (who) => `a gift from ${who}, when you are friends`,
    ribbon: "yours with your first Honey Show ribbon",
    unknown: "not yours yet",
  },
  /** Read out for a piece that is not yours yet. */
  resting: (name, how) => `${name}: ${how}`,

  // ── the creator's buttons ──
  toTalent: "Next: a talent",
  /** Editing an existing beekeeper from the creator scene. */
  done: "Done",

  // ── the talent step ──
  talentTitle: (name) => `What is ${name} good at?`,
  talentSub: "Choose a talent. It stays with you for good.",
  back: "Back",
  begin: "Begin",
  /** Read out for a chosen talent. */
  chosen: "Chosen",

  // ── the wardrobe sheet ──
  wardrobeTitle: "Wardrobe",
  /** The sheet's button when something has been changed, and when nothing has. */
  wear: "Wear this",
  keep: "Keep this look",
  /** Toast after a change of look. */
  worn: "Looking good.",
};
