// @ts-check
/**
 * The beekeeper: the look chosen on the first screen, the one talent, and the
 * wardrobe of things earned since.
 */

import { WARDROBE, LOOK_PARTS, HAIR_TWINS } from "../content/wardrobe.js";
import { TALENTS } from "../content/talents.js";
import { NAME_MAX, HEART_GIFTS } from "../content/tuning.js";
import { isObj } from "./util.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").Action} Action */
/** @typedef {import("./types.js").GameEvent} GameEvent */
/** @typedef {import("../content/wardrobe.js").WardrobeItem} WardrobeItem */

const NO_TALENT = /** @type {import("../content/talents.js").Talent} */ (
  Object.freeze({ id: "", name: "", blurb: "" })
);

/** The keeper's talent row, or an empty one before the keeper is made. */
export function talentOf(/** @type {State} */ state) {
  const id = state.keeper.talent;
  return Object.hasOwn(TALENTS, id) ? TALENTS[id] : NO_TALENT;
}

/** Every item of one part of the look. Hair is one list: any style on either body. */
function itemsOf(/** @type {string} */ part) {
  if (part === "hair") return [...WARDROBE.hair.woman, ...WARDROBE.hair.man];
  return /** @type {WardrobeItem[]} */ (WARDROBE[part] ?? []);
}

/** Whether the keeper may wear `id` as `part` ("hat", "shirt", ...). */
export function owns(
  /** @type {State} */ state,
  /** @type {string} */ part,
  /** @type {any} */ id,
) {
  const item = itemsOf(part).find((i) => i.id === id);
  if (!item) return false;
  return !!item.unlock.start || state.wardrobe.owned.includes(item.id);
}

/**
 * The same hair on the other body: the style `hair` itself when `body` has
 * it, else its twin there (long waves and long-and-tied, the braid and the
 * side part, the bun and the crop, the two heads of curls, the bob and the
 * tousle). Hair nobody has heard of becomes the body's first style.
 */
export function hairFor(/** @type {string} */ body, /** @type {string} */ hair) {
  const mine = /** @type {Record<string, WardrobeItem[]>} */ (WARDROBE.hair)[body];
  if (!mine) return hair;
  if (mine.some((i) => i.id === hair)) return hair;
  const twin = HAIR_TWINS[hair] ?? Object.keys(HAIR_TWINS).find((k) => HAIR_TWINS[k] === hair);
  return twin && mine.some((i) => i.id === twin) ? twin : mine[0].id;
}

/**
 * How a piece is earned, as data: the content's own `unlock` row with
 * `type` and `id` added. type "start" (owned from the first screen, id null),
 * "goal" (id: the goal whose reward it is), "tier" (id: the renown tier),
 * "regular" (id: the regular; `n`: which of their gifts, 1 to 3; `hearts`:
 * the hearts that brings it) or "show" (the first ribbon at the Honey Show,
 * id null).
 */
function earnOf(/** @type {import("../content/wardrobe.js").Unlock} */ u) {
  if (u.start) return { ...u, type: "start", id: null };
  if (u.goal) return { ...u, type: "goal", id: u.goal };
  if (typeof u.tier === "number") return { ...u, type: "tier", id: u.tier };
  if (u.gift)
    return {
      ...u,
      type: "regular",
      id: u.gift[0],
      n: u.gift[1],
      hearts: HEART_GIFTS[u.gift[1] - 1],
    };
  if (u.ribbon) return { ...u, type: "show", id: null };
  return { ...u, type: "unknown", id: null };
}

/**
 * The wardrobe as the screen shows it: each part with its items as
 * { id, name, owned, unlock }, where `unlock` says how the piece is earned
 * (see earnOf: { type, id, ... } beside the content's own keys). Hair comes
 * as the creator's two lists.
 */
export function wardrobeNow(/** @type {State} */ state) {
  const row = (/** @type {string} */ part) => (/** @type {WardrobeItem} */ i) => ({
    id: i.id,
    name: i.name,
    owned: owns(state, part, i.id),
    unlock: earnOf(i.unlock),
  });
  /** @type {Record<string, any>} */
  const out = {};
  for (const part of LOOK_PARTS)
    out[part] =
      part === "hair"
        ? { woman: WARDROBE.hair.woman.map(row(part)), man: WARDROBE.hair.man.map(row(part)) }
        : itemsOf(part).map(row(part));
  return out;
}

/** A name as it will be kept, or null when it will not do. */
function cleanName(/** @type {any} */ name) {
  if (typeof name !== "string") return null;
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 1 || n.length > NAME_MAX) return null;
  // No control characters: the name is drawn on screen and written into saves.
  for (let i = 0; i < n.length; i++)
    if (n.charCodeAt(i) < 32 || n.charCodeAt(i) === 127) return null;
  return n;
}

/** createKeeper { keeper: { name, body, skin, hair, hairColor, overalls, shirt, hat, beard?, glasses?, talent } } */
export function createKeeper(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  if (s.keeper.made) return "already-made";
  const k = a.keeper;
  if (!isObj(k)) return "bad-look";
  const name = cleanName(k.name);
  if (!name) return "bad-name";
  /** @type {Record<string, string>} */
  const look = {};
  for (const part of LOOK_PARTS) {
    const id = k[part] ?? (part === "beard" || part === "glasses" ? "none" : undefined);
    if (!owns(s, part, id)) return "bad-look";
    look[part] = id;
  }
  if (typeof k.talent !== "string" || !Object.hasOwn(TALENTS, k.talent)) return "bad-talent";
  Object.assign(s.keeper, look, { made: true, name, talent: k.talent });
  events.push({ type: "keeperMade", keeper: { ...s.keeper } });
}

/** setLook { look }: any of the look's parts, and the name. The talent is for keeps. */
export function setLook(
  /** @type {State} */ s,
  /** @type {Action} */ a,
  /** @type {GameEvent[]} */ events,
) {
  const k = a.look;
  if (!isObj(k)) return "bad-look";
  /** @type {Record<string, string>} */
  const change = {};
  for (const key of Object.keys(k)) {
    if (key === "name") {
      const name = cleanName(k.name);
      if (!name) return "bad-name";
      change.name = name;
    } else if (LOOK_PARTS.includes(key)) {
      if (!itemsOf(key).some((i) => i.id === k[key])) return "bad-look";
      if (!owns(s, key, k[key])) return "not-in-wardrobe";
      change[key] = k[key];
    } else return "bad-look";
  }
  if (!Object.keys(change).length) return "bad-look";
  Object.assign(s.keeper, change);
  events.push({ type: "lookSet", keeper: { ...s.keeper } });
}

/** Put an earned item in the wardrobe. Returns false when it was already there. */
export function addToWardrobe(/** @type {State} */ s, /** @type {string} */ id) {
  if (s.wardrobe.owned.includes(id)) return false;
  s.wardrobe.owned.push(id);
  return true;
}
