// People: the player's own beekeeper and the villagers who come to the stall.
// The painting lives in ./people/ (figure.js puts a person together from the
// parts beside it); this file is the door the screens come through.
//
//   keeper(look, pose, mood)   the beekeeper, from the look the core stores
//   villager(id, pose, mood)   a regular by id, or "walkin-<n>" for a stranger
//
// Full figures are FIGURE_W x FIGURE_H with the feet on the anchor; a grown-up
// stands STANDING px tall in them, so draw with k = wanted height / STANDING.
// Busts are BUST_W x BUST_H, anchored at the bottom edge.

import { sprite } from "../paint/sprite.js";
import { SKINS, HAIRS, OVERALLS, SHIRTS, HATS, HAIR_STYLES } from "./people/kit.js";
import { STYLE_IDS } from "./people/hair.js";
import { cast, REGULAR_IDS } from "./people/cast.js";
import {
  paintPerson,
  FIGURE_W,
  FIGURE_H,
  GROUND,
  STANDING,
  BUST_W,
  BUST_H,
  POSES,
  MOODS,
} from "./people/figure.js";

export { FIGURE_W, FIGURE_H, STANDING, BUST_W, BUST_H, POSES, MOODS, REGULAR_IDS };

const pick = (table, id, fallback) => table[id] ?? table[fallback];
const oneOf = (list, id, fallback) => (list.includes(id) ? id : fallback);

function render(key, p, pose, mood, scale = 1.5) {
  const at = oneOf(POSES, pose, "stand");
  const feel = oneOf(MOODS, mood, "calm");
  const bust = at === "bust";
  const fine = !bust && scale > 1.5 ? Math.min(3, scale) : 1.5;
  return sprite(
    `${key}|${at}|${feel}${fine === 1.5 ? "" : `|x${fine}`}`,
    bust ? BUST_W : FIGURE_W,
    bust ? BUST_H : FIGURE_H,
    (ctx, w, h) => paintPerson(ctx, w, h, p, at, feel),
    bust ? { ay: 1 } : { ay: GROUND / FIGURE_H, scale: fine },
  );
}

/**
 * The beekeeper.
 * @param {{ body?: string, skin?: string, hair?: string, hairColor?: string,
 *   overalls?: string, shirt?: string, hat?: string, beard?: string,
 *   glasses?: string }} [look]  missing or unknown parts fall back to defaults
 * @param {"stand"|"wave"|"carry"|"smoker"|"bust"} [pose]
 * @param {"calm"|"happy"|"oops"} [mood]
 * @param {number} [scale]  paint scale for a figure shown large (the creator's
 *   preview): 1.5 by default, up to 3. A bust ignores it.
 */
export function keeper(look, pose = "stand", mood = "calm", scale = 1.5) {
  const l = look ?? {};
  const body = l.body === "man" ? "man" : "woman";
  const part = {
    body,
    skin: SKINS[l.skin] ? l.skin : "s3",
    hair: STYLE_IDS.includes(l.hair) ? l.hair : body === "man" ? "tousled" : "long-waves",
    hairColor: HAIRS[l.hairColor] ? l.hairColor : "h3",
    overalls: OVERALLS[l.overalls] ? l.overalls : "o1",
    shirt: SHIRTS[l.shirt] ? l.shirt : "t1",
    hat: oneOf(HATS, l.hat, "none"),
    beard: oneOf(["none", "stubble", "full"], l.beard, "none"),
    glasses: oneOf(["none", "round"], l.glasses, "none"),
  };
  const p = {
    body,
    skin: SKINS[part.skin],
    hair: { style: part.hair, c: HAIRS[part.hairColor] },
    hat: { kind: part.hat },
    beard: part.beard,
    glasses: part.glasses,
    outfit: {
      legs: { kind: "trousers", color: pick(OVERALLS, part.overalls, "o1") },
      // A rounded collar on her shirt, a pointed one on his.
      top: { color: pick(SHIRTS, part.shirt, "t1"), collar: body === "man" ? "shirt" : "peter" },
      over: { kind: "bib" },
    },
  };
  return render(`keeper|${Object.values(part).join("|")}`, p, pose, mood, scale);
}

/**
 * A villager: one of the eight regulars by id ("hattie", "fenwick", "posy",
 * "linden", "marguerite", "tobias", "wren", "barley"), or "walkin-<number>"
 * for a stranger who looks the same every time that number comes up.
 * @param {string} id
 * @param {"stand"|"wave"|"carry"|"smoker"|"bust"} [pose]
 * @param {"calm"|"happy"|"oops"} [mood]
 */
export function villager(id, pose = "bust", mood = "calm") {
  const p = cast(id);
  return render(`villager|${p.seed}`, p, pose, mood);
}

// --------------------------------------------------------------- gallery
// The first page: hair, since hair is what gets looked at hardest. The other
// pages (wardrobe, poses, villagers, true sizes) are in ./people/sheets.js.

const BASE = {
  woman: { body: "woman", skin: "s3", hair: "long-waves", hairColor: "h3", overalls: "o1" },
  man: { body: "man", skin: "s3", hair: "tousled", hairColor: "h2", overalls: "o2" },
};
const STYLES = [...HAIR_STYLES.woman, ...HAIR_STYLES.man];
const COLOURS = Object.keys(HAIRS);
const show = (name, look, pose, mood) => ({ name, make: () => keeper(look, pose, mood) });

export const GALLERY = [
  ...["woman", "man"].flatMap((body) =>
    STYLES.map((hair) => show(`${body} · ${hair}`, { ...BASE[body], hair })),
  ),
  ...["woman", "man"].flatMap((body) =>
    STYLES.map((hair) => show(`${body} · ${hair}`, { ...BASE[body], hair }, "bust")),
  ),
  ...COLOURS.map((hairColor) => show(`long-waves · ${hairColor}`, { ...BASE.woman, hairColor })),
  ...COLOURS.map((hairColor) => show(`tousled · ${hairColor}`, { ...BASE.man, hairColor })),
  ...COLOURS.map((hairColor, i) =>
    show(
      `${STYLES[1 + (i % 4)]} · ${hairColor}`,
      { ...BASE.woman, hair: STYLES[1 + (i % 4)], hairColor },
      "bust",
    ),
  ),
  ...COLOURS.map((hairColor, i) =>
    show(
      `${STYLES[6 + (i % 4)]} · ${hairColor}`,
      { ...BASE.man, hair: STYLES[6 + (i % 4)], hairColor },
      "bust",
    ),
  ),
];
