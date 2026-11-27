// @ts-check
/**
 * Every sentence the screens say lives here, so the voice stays one voice:
 * plain, warm, short, British spelling, no exclamation marks.
 *
 * Sections, in order. A new screen adds its own section at the end and
 * touches nothing above it.
 *
 *   1. Formatters      coins(3), jars(1), stars(2), dayLabel(cal), list([...]), thePlot(name)
 *   2. Why codes       WHY and say(why): what a refused tap answers
 *   3. The shell       errors, confirm defaults (the loading card's own few
 *                      lines are in index.html and main.js: they must show
 *                      even when no module loads)
 *   4. Title scene
 *   5. Settings sheet
 *   6. (your screen)
 *
 * This file imports nothing: it is safe to load from anywhere.
 */

// ───────────────────────── 1. Formatters ─────────────────────────

/** "1 jar", "3 jars": `plural(n, "jar")`; irregulars: `plural(n, "box", "boxes")`. */
export function plural(n, one, many = `${one}s`) {
  return `${number(n)} ${n === 1 ? one : many}`;
}

/** A count for reading: whole numbers get thousands commas, others one decimal. */
export function number(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v)
    ? v.toLocaleString("en-GB")
    : v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

/** "1 coin", "240 coins". */
export const coins = (n) => plural(n, "coin");

/** "1 jar", "3 jars". */
export const jars = (n) => plural(n, "jar");

/** "★★" for 2; nothing for 0 (a blend has no stars). */
export const stars = (n) => "★".repeat(Math.max(0, Math.min(3, Math.round(Number(n) || 0))));

/** "93%" from 0.93. */
export const percent = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

/** "Spring" for 0 … "Winter" for 3. Also takes the core's lower-case name. */
export function seasonName(i) {
  if (typeof i === "string") return i.charAt(0).toUpperCase() + i.slice(1);
  return SEASONS[(((Math.floor(Number(i)) || 0) % 4) + 4) % 4];
}

/**
 * "Spring · day 3" from the core's `calendarOf(day)`.
 * @param {{ season: number, dayOfSeason: number }} calendar
 */
export function dayLabel(calendar) {
  return `${seasonName(calendar?.season ?? 0)} · day ${calendar?.dayOfSeason ?? 1}`;
}

/** "Year 2" (the almanac, the year page). */
export const yearLabel = (calendar) => `Year ${calendar?.year ?? 1}`;

/** ["a", "b", "c"] → "a, b and c". */
export function list(items) {
  const all = (items ?? []).filter((x) => x !== null && x !== undefined && x !== "").map(String);
  if (all.length <= 1) return all[0] ?? "";
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}

/** First letter up: for a sentence that starts with a flower's name. */
export const capital = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** A plot's name inside a sentence: "the Pond Bank", but "Heather Hill". */
export const thePlot = (name) =>
  /^(Home Meadow|Pond Bank|Old Orchard)$/.test(String(name)) ? `the ${name}` : String(name);

// ───────────────────────── 2. Why codes ─────────────────────────
//
// The core refuses an action with { type: "rejected", why }. app.dispatch
// toasts say(why) unless told to be quiet. The same codes come back from
// canPlant, canPlaceHive and recipesNow().missing. One code can be raised in
// more than one place, so each sentence is true wherever its code is.
//
// Codes a tap can never reach (bad-args, no-plot, off-plot, no-flower,
// no-product, no-recipe, no-fact, bad-look, bad-entry, not-for-sale,
// nothing-to-see, already-read, unknown-action) are left to the fallback.

/** @type {Record<string, string>} */
export const WHY = {
  // time of day
  "not-morning": "That is a job for the morning.",
  "not-day": "That waits until the bees are out.",
  "not-evening": "That waits for the evening.",
  "not-now": "Making waits until the bees are home.",
  "not-yet": "The hive shop has that from summer.",

  // coins
  "no-coins": "You need more coins for that.",

  // land and planting
  "not-owned": "That plot is not yours yet.",
  owned: "That plot is already yours.",
  "bad-ground": "Nothing can stand there. Try grass.",
  "square-taken": "That square is taken. Try a free one.",
  "needs-hill": "That grows only on Heather Hill.",
  "needs-water": "Water mint grows only beside water.",
  "flower-locked": "Those seeds are not in the tray yet.",
  "not-plantable": "Apple blossom grows only on the old trees.",
  "no-bed": "There is no bed there.",
  "not-blooming": "Wait until it is in bloom.",
  "already-picked": "This bed gave its bunch for this year.",

  // hives
  "plot-full": "A plot holds 4 hives. Try another plot.",
  "no-hive": "There is no hive there.",
  "no-spare": "That needs a spare hive from the hive shop.",
  "no-jars": "The hive does not hold that much yet.",
  "no-syrup": "No sugar syrup left. The hive shop has more.",
  "no-remedy": "No thyme remedy. Buy one or make one.",
  "hive-full": "That hive is full. Take some jars first.",
  "already-dusted": "Dusted today. Once a day is enough.",
  "no-mites": "No mites here. Nothing to treat.",
  "same-square": "It already stands there.",
  "top-hive": "That hive is as tall as hives get.",
  "too-weak": "That colony is too small to split yet.",
  "no-swarm": "The swarm has gone.",
  "no-raid": "No wasps at that hive.",

  // the stall and the show
  "no-stock": "You have none of that left.",
  "stall-open": "The stall is already open.",
  "stall-closed": "The stall is not open now.",
  "no-customer": "Nobody is waiting at the stall.",
  "not-your-turn": "It is not their turn yet.",
  "no-show": "The Honey Show is not this evening.",
  "show-done": "Your honey is already on the show bench.",
  "not-pure": "Only pure honey can go in the show.",
  "same-honey": "The show takes 1 jar of each kind.",

  // the workshop
  "workshop-closed": "The workshop opens with your first beeswax.",
  "no-crafts-left": "Enough making for today. More tomorrow.",
  "recipe-locked": "You have not learnt that recipe yet.",
  "no-wax": "That needs more beeswax.",
  "no-bunch": "That needs a bunch of the right flower.",
  "no-honey": "That needs a jar of the right honey.",
  "no-candle": "That needs a candle. Make one first.",
  "no-soap": "That needs a bar of soap. Make one first.",

  // goals
  "goal-not-ready": "That goal is not met yet.",

  // the beekeeper
  "no-keeper": "Make your beekeeper first.",
  "already-made": "Your beekeeper is already made.",
  "bad-name": "Your beekeeper needs a name.",
  "bad-talent": "Choose a talent first.",
  "not-in-wardrobe": "That is not in your wardrobe yet.",
};

/** What to say when the core gives a code this file has no sentence for. */
export const WHY_FALLBACK = "That cannot be done right now.";

/**
 * The sentence for a rejection. Takes the code or the whole rejected event.
 * @param {string | { why?: string } | null | undefined} why
 */
export function say(why) {
  const code = typeof why === "string" ? why : why?.why;
  return (code && Object.hasOwn(WHY, code) && WHY[code]) || WHY_FALLBACK;
}

// ───────────────────────── 3. The shell ─────────────────────────

export const SHELL = {
  name: "Honey Hollow",
  wentWrong: "Something went wrong. Your game is saved.",
  /** A screen's files did not arrive, or did not fit (ui/app.js, ui/build.js). */
  noSignal: "No signal, and this page is not on your phone yet. Your game is saved.",
  pageLost: {
    title: "That page did not open",
    text: "Honey Hollow could not fetch it. Fetching the game again usually mends this. Your game is saved.",
    yes: "Fetch it again",
    no: "Not now",
  },
  pageMoved: {
    title: "A newer Honey Hollow is out",
    text: "That page belongs to it, so the game has to be fetched again. Your game is saved.",
    yes: "Fetch it",
    no: "Not now",
  },
  fetching: "Fetching Honey Hollow again…",
  /** Small print: which screen and the machine's own reason. */
  pageDetail: (what, why) => `${what}: ${why}`,
  /**
   * Only for a phone still running an older release's ui/app.js beside this
   * file: that release called this when a screen failed to load. Every screen
   * is built; nothing in this release says these words.
   */
  notBuilt: () => "That page did not open. Close the game and open it again.",
  saveBroken: "Your saved game would not open, so here is a fresh one. The old one is kept.",
  yes: "Yes",
  no: "No",
  close: "Close",
  ok: "All right",
};

// ───────────────────────── 4. Title scene ─────────────────────────

export const TITLE = {
  tagline: "A little meadow, a few hives, and all the time in the world.",
  resume: "Continue",
  /** Under "Continue": whose game it is and where it stopped. */
  resumeNote: (name, when) => (name ? `${name} · ${when}` : when),
  fresh: "New game",
  settings: "Settings",
  credit: "An idea from Sari",
  confirmNew: {
    title: "Start a new game?",
    text: "Your meadow, your hives and your honey will be gone for good.",
    yes: "Start again",
    no: "Keep mine",
  },
};

// ───────────────────────── 5. Settings sheet ─────────────────────────

export const SETTINGS = {
  title: "Settings",
  sound: "Sound",
  soundHint: "Bees, birds and small chimes.",
  calm: "Reduced motion",
  calmHint: "Stops the flying coins and the swaying.",
  calmPhone: "Your phone asks for less motion, so this stays on.",
  speed: "Day speed",
  speedHint: "How fast a day passes once you start it.",
  speedNormal: "Normal",
  speedFast: "Fast",
  on: "On",
  off: "Off",
  notes: "Keeper’s notes",
  notesHint: "Short notes that explain things. Each shows once.",
  notesGo: "Show them again",
  notesDone: "The notes will come round once more.",

  saves: "Your saved game",
  backup: "Back up my game",
  backupHint: "Your game as a code. Copy it and keep it somewhere safe.",
  backupLabel: "Backup code",
  copy: "Copy",
  copied: "Copied.",
  copyFailed: "That did not copy. Press and hold the code to copy it.",
  restore: "Restore a game",
  restoreHint: "Paste a backup code here to carry on from it.",
  restoreLabel: "Paste a backup code",
  restoreGo: "Restore",
  restoreEmpty: "Paste a backup code first.",
  restoreBad: "That code does not open. Check that all of it was copied.",
  restored: "Welcome back.",
  confirmRestore: (who, when) => ({
    title: "Restore this game?",
    text: `${who ? `${who}’s game` : "A new game"}, ${when}. It replaces the game you are playing now.`,
    yes: "Restore it",
    no: "Keep mine",
  }),

  restart: "Start again",
  restartHint: "Wipes this game and begins a new one.",
  confirmRestart1: {
    title: "Start again?",
    text: "Your meadow, your hives and your honey will be gone for good.",
    yes: "Start again",
    no: "Keep mine",
  },
  confirmRestart2: {
    title: "Are you sure?",
    text: "There is no way back once it is gone. Only a backup code can keep it.",
    yes: "Yes, wipe it",
    no: "Keep mine",
  },
  restarted: "A fresh start.",

  credits: "Credits",
  creditLines: [
    "Honey Hollow, an idea from Sari.",
    "Painted, written and built by Claude.",
    "Lettering in Mali by Cadson Demak, under the SIL Open Font Licence.",
  ],
  build: (id) => `Build ${id}`,
  /** This phone holds an older release than the site is serving. */
  buildBehind: (id, now) => `Build ${id}. The site has ${now}.`,
  /** The last thing that would not load, small, under the build. */
  trouble: (what, why, id, when) =>
    `Last trouble, ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}, build ${id}: ${what}: ${why}`,
};
