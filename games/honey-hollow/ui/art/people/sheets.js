// The gallery's pages of people (art-gallery.html?only=people-wardrobe ...).
// Only the gallery loads this file. The first page, every hair style and
// colour, is GALLERY in ../people.js.

import { sprite, put } from "../../paint/sprite.js";
import { rgba } from "../../paint/palette.js";
import { roundRect } from "../../paint/wash.js";
import { keeper, villager, REGULAR_IDS, STANDING, FIGURE_H, BUST_H } from "../people.js";
import { HATS } from "./kit.js";

const WOMAN = { body: "woman", skin: "s3", hair: "long-waves", hairColor: "h3", overalls: "o1" };
const MAN = { body: "man", skin: "s3", hair: "tousled", hairColor: "h2", overalls: "o2" };
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const show = (name, look, pose, mood) => ({ name, make: () => keeper(look, pose, mood) });

export const WARDROBE = [
  ...ids("s", 6).map((skin) => show(`skin ${skin}`, { ...WOMAN, skin, hair: "braid" }, "bust")),
  ...ids("s", 6).map((skin) => show(`skin ${skin}`, { ...MAN, skin, hair: "curly" }, "bust")),
  ...ids("o", 6).map((overalls, i) =>
    show(`overalls ${overalls} · shirt t${i + 1}`, {
      ...(i % 2 ? MAN : WOMAN),
      overalls,
      shirt: `t${i + 1}`,
      hair: i % 2 ? "side-part" : "bob",
    }),
  ),
  ...ids("t", 6).map((shirt, i) =>
    show(`shirt ${shirt} · overalls o${6 - i}`, {
      ...(i % 2 ? WOMAN : MAN),
      shirt,
      overalls: `o${6 - i}`,
      hair: i % 2 ? "bun" : "long-tied",
    }),
  ),
  ...HATS.map((hat) => show(`${hat} · long`, { ...WOMAN, hat })),
  ...HATS.map((hat) => show(`${hat} · short`, { ...MAN, hat })),
  ...HATS.map((hat) =>
    show(`${hat} · curls`, { ...WOMAN, hair: "curls", hairColor: "h1", skin: "s5", hat }, "bust"),
  ),
  ...HATS.map((hat) =>
    show(`${hat} · cropped`, { ...MAN, hair: "cropped", hairColor: "h5", skin: "s1", hat }, "bust"),
  ),
  ...["none", "stubble", "full"].flatMap((beard) =>
    ["none", "round"].map((glasses) =>
      show(
        `beard ${beard} · glasses ${glasses}`,
        { ...MAN, hair: "side-part", beard, glasses },
        "bust",
      ),
    ),
  ),
  show("glasses round", { ...WOMAN, hair: "bun", hairColor: "h6", glasses: "round" }, "bust"),
  show(
    "beard full · silver",
    { ...MAN, hair: "cropped", hairColor: "h7", skin: "s5", beard: "full" },
    "bust",
  ),
];

const POSES = ["stand", "wave", "carry", "smoker", "bust"];
export const POSING = [
  ...POSES.flatMap((pose) =>
    ["calm", "happy", "oops"].map((mood) =>
      show(
        `${pose} · ${mood}`,
        { ...WOMAN, hair: "braid", hairColor: "h4", hat: "straw" },
        pose,
        mood,
      ),
    ),
  ),
  ...POSES.flatMap((pose) =>
    ["calm", "happy", "oops"].map((mood) =>
      show(
        `${pose} · ${mood}`,
        { ...MAN, hair: "curly", hairColor: "h1", skin: "s5", overalls: "o3", shirt: "t6" },
        pose,
        mood,
      ),
    ),
  ),
];

export const VILLAGE = [
  ...REGULAR_IDS.map((id) => ({ name: id, make: () => villager(id, "bust") })),
  ...REGULAR_IDS.map((id) => ({ name: `${id} · stand`, make: () => villager(id, "stand") })),
  ...REGULAR_IDS.map((id, i) => ({
    name: `${id} · ${i % 2 ? "wave" : "carry"} · happy`,
    make: () => villager(id, i % 2 ? "wave" : "carry", "happy"),
  })),
  ...ids("walkin-", 14).map((id) => ({ name: id, make: () => villager(id, "bust") })),
  ...ids("walkin-", 14).map((id) => ({ name: `${id} · stand`, make: () => villager(id, "stand") })),
];

// ---- true sizes: what a phone actually shows, whatever the gallery's zoom

const zoom = Number(new URLSearchParams(globalThis.location?.search ?? "").get("zoom") ?? 1.5);

function strip(key, w, h, tone, draw) {
  return {
    name: key,
    zoom: 1 / zoom,
    make: () =>
      sprite(
        `people-sheet-${key}`,
        w,
        h,
        (ctx) => {
          ctx.fillStyle = rgba(tone);
          ctx.beginPath();
          roundRect(0, 0, w, h, 10).forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.fill();
          draw(ctx);
        },
        { grain: 0, ax: 0, ay: 0 },
      ),
  };
}

const WALKERS = [
  () => keeper({ ...WOMAN, hat: "straw" }),
  () => keeper(MAN),
  () =>
    keeper(
      { ...WOMAN, hair: "curls", hairColor: "h1", skin: "s5", overalls: "o3" },
      "wave",
      "happy",
    ),
  () => keeper({ ...MAN, hair: "cropped", hairColor: "h5", skin: "s1", hat: "veil" }, "smoker"),
  () => keeper({ ...WOMAN, hair: "bun", hairColor: "h6", overalls: "o4", shirt: "t3" }, "carry"),
  () =>
    keeper({
      ...MAN,
      hair: "long-tied",
      hairColor: "h7",
      skin: "s6",
      overalls: "o6",
      beard: "full",
    }),
  () =>
    keeper({
      ...WOMAN,
      hair: "bob",
      hairColor: "h8",
      skin: "s2",
      overalls: "o5",
      hat: "flower-crown",
    }),
  () => villager("posy", "wave", "happy"),
  () => villager("fenwick", "stand"),
  () => villager("hattie", "carry"),
  () => villager("barley", "stand"),
  () => villager("walkin-2", "stand"),
];
const FACES = [
  () => keeper({ ...WOMAN, hat: "straw" }, "bust"),
  () => keeper({ ...MAN, beard: "stubble" }, "bust", "happy"),
  () => villager("marguerite"),
  () => villager("tobias"),
  () => villager("posy"),
  () => villager("linden"),
  () => villager("walkin-10"),
];

export const SIZES = [
  strip("56 px tall, on the meadow", WALKERS.length * 44 + 16, 84, "meadow", (ctx) =>
    WALKERS.forEach((make, i) => put(ctx, make(), 30 + i * 44, 72, 56 / STANDING)),
  ),
  strip("56 px tall, on paper", WALKERS.length * 44 + 16, 84, "paper", (ctx) =>
    WALKERS.forEach((make, i) => put(ctx, make(), 30 + i * 44, 72, 56 / STANDING)),
  ),
  strip("150 px tall, the creator", 4 * 120 + 16, 196, "cream", (ctx) =>
    WALKERS.slice(0, 4).forEach((make, i) => put(ctx, make(), 68 + i * 120, 178, 150 / STANDING)),
  ),
  strip("110 px busts, behind the stall", FACES.length * 100 + 16, 124, "cream", (ctx) =>
    FACES.forEach((make, i) => put(ctx, make(), 58 + i * 100, 118, 110 / BUST_H)),
  ),
];

export { FIGURE_H };
