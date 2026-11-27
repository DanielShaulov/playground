// @ts-check
/**
 * The bee book. The core raises trigger keys at firsts; content/facts.js maps
 * keys to facts. A key with no fact is remembered and otherwise ignored, so
 * the book works with any number of facts, and a fact written later for a key
 * already raised turns up the next time the save is loaded.
 */

import { FACTS } from "../content/facts.js";
import { FLOWER_IDS } from "../content/flowers.js";
import { REGULAR_IDS } from "../content/regulars.js";
import { TIERS } from "../content/goals.js";
import { HEART_GIFTS } from "../content/tuning.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */

/** Every key the core can raise. docs/honey-hollow/rules.md lists the same keys. */
export const TRIGGERS = [
  "first-day",
  "first-harvest",
  "first-pure",
  "first-blend",
  "first-three-star",
  "first-sale",
  "first-rain",
  "first-move",
  "first-wax",
  "first-candle",
  "first-soap",
  "first-balm",
  "first-bunch",
  "first-queen-cells",
  "first-swarm",
  "first-catch",
  "first-split",
  "first-mites",
  "first-remedy",
  "first-wasps",
  "first-feed",
  "first-hungry",
  "first-upgrade",
  "second-hive",
  "strength-max",
  "season-summer",
  "season-autumn",
  "season-winter",
  "second-spring",
  "plot-pond",
  "plot-orchard",
  "plot-hill",
  "first-ribbon",
  ...FLOWER_IDS.map((id) => `honey-${id}`),
  ...TIERS.slice(1).map((t) => `renown-${t.tier}`),
  ...REGULAR_IDS.flatMap((id) => HEART_GIFTS.map((_, i) => `gift-${id}-${i + 1}`)),
];

/** The keys one event raises. */
function keysOf(/** @type {GameEvent} */ e) {
  switch (e.type) {
    case "dayStarted":
      return e.flying && e.weather === "rain" ? ["first-day", "first-rain"] : ["first-day"];
    case "harvested": {
      const keys = ["first-harvest"];
      if (e.stars > 0) keys.push("first-pure", `honey-${e.flower}`);
      else keys.push("first-blend");
      if (e.stars === 3) keys.push("first-three-star");
      if (e.wax > 0) keys.push("first-wax");
      return keys;
    }
    case "sold":
    case "soldToGrocer":
      return ["first-sale"];
    case "hiveMoved":
      return ["first-move"];
    case "crafted":
      if (e.family === "candle") return ["first-candle"];
      if (e.family === "soap") return ["first-soap"];
      if (e.family === "balm") return ["first-balm"];
      return [];
    case "picked":
      return ["first-bunch"];
    case "queenCells":
      return ["first-queen-cells"];
    case "swarmed":
      return ["first-swarm"];
    case "swarmCaught":
      return e.hives >= 2 ? ["first-catch", "second-hive"] : ["first-catch"];
    case "split":
      return e.hives >= 2 ? ["first-split", "second-hive"] : ["first-split"];
    case "hiveBought":
      return e.hives >= 2 ? ["second-hive"] : [];
    case "mitesSpotted":
      return ["first-mites"];
    case "remedied":
      return ["first-remedy"];
    case "waspsCame":
      return ["first-wasps"];
    case "fed":
      return ["first-feed"];
    case "hungry":
      return ["first-hungry"];
    case "hiveUpgraded":
      return ["first-upgrade"];
    case "grew":
      return e.max ? ["strength-max"] : [];
    case "seasonChanged":
      if (e.season === "spring") return e.year >= 2 ? ["second-spring"] : [];
      return [`season-${e.season}`];
    case "plotBought":
      return [`plot-${e.plot}`];
    case "showJudged":
      return e.entries.length ? ["first-ribbon"] : [];
    case "renownUp":
      return [`renown-${e.tier}`];
    case "heart":
      return e.gift ? [`gift-${e.regular}-${e.gift.n}`] : [];
    default:
      return [];
  }
}

/** Put a key's facts in the book. Returns the fact ids that are new. */
function unlock(/** @type {State} */ s, /** @type {string} */ key) {
  const fresh = [];
  for (const f of FACTS) {
    if (f.trigger !== key || s.book.facts.includes(f.id)) continue;
    s.book.facts.push(f.id);
    s.book.unread.push(f.id);
    fresh.push(f.id);
  }
  return fresh;
}

/** React to an action's events: raise each new key and unlock its facts. */
export function raise(/** @type {State} */ s, /** @type {GameEvent[]} */ events) {
  const n = events.length;
  for (let i = 0; i < n; i++)
    for (const key of keysOf(events[i])) {
      if (s.book.fired.includes(key)) continue;
      s.book.fired.push(key);
      for (const fact of unlock(s, key)) events.push({ type: "factUnlocked", fact, trigger: key });
    }
}

/**
 * On load: facts written since the save was made, for keys it had already
 * raised, go into the book unread; facts that no longer exist drop out.
 */
export function reconcile(/** @type {State} */ s) {
  const known = new Set(FACTS.map((f) => f.id));
  s.book.facts = s.book.facts.filter((id) => known.has(id));
  s.book.unread = s.book.unread.filter((id) => known.has(id) && s.book.facts.includes(id));
  for (const key of s.book.fired) unlock(s, key);
}

/** readFact { fact }: the keeper has read a page. */
export function readFact(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (!s.book.facts.includes(a.fact)) return "no-fact";
  if (!s.book.unread.includes(a.fact)) return "already-read";
  s.book.unread = s.book.unread.filter((id) => id !== a.fact);
  events.push({ type: "factRead", fact: a.fact });
}
