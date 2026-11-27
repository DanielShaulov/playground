// The village. Eight regulars, each with a fixed look you can tell across the
// stall, and any number of walk-ins dressed from the same wardrobe by a seed.
// Everyone here becomes the same kind of "person" figure.js paints.

import { rng } from "../../paint/rng.js";
import { darken } from "../../paint/palette.js";
import { SKINS, HAIRS, cloth as C } from "./kit.js";

const white = C("white", "cloud");
const cream = C("cream", "creamDeep");
const denim = C("denim", "denimDeep");
const tweed = C("tweed", "tweedDeep");
const brown = C("wood", "bark");
const poppy = C("poppy", "berry");

/** id → what to paint. Skin and hair are looked up when the person is made. */
const REGULARS = {
  // Hattie Crumb, the baker: round and warm, a bun, an apron, flour on her.
  hattie: {
    body: "woman",
    shape: "round",
    skin: "s2",
    hair: { style: "bun", color: "h4" },
    outfit: {
      legs: { kind: "skirt", color: C("peach", "terracotta"), hem: -13, flare: 5 },
      top: {
        color: { ...C("peach", "terracotta"), pattern: "dots", mark: "white" },
        collar: "peter",
        collarColor: "white",
      },
      over: { kind: "apron", color: white, flour: true },
    },
    face: { flour: true, ruddy: true },
  },
  // Old Mr Fenwick, who kept bees here for fifty years.
  fenwick: {
    body: "man",
    shape: "thin",
    skin: "s1",
    hair: { style: "cropped", color: "h7" },
    hat: { kind: "cap" },
    beard: "moustache",
    outfit: {
      legs: { kind: "trousers", color: C("soil", "bark") },
      top: {
        color: C("moss", "pine"),
        insert: { color: white, depth: 14 },
        collar: "shirt",
        sleeves: 0.92,
        hem: 2,
        ribbed: true,
        buttonColor: "wood",
      },
      neck: { kind: "tie", color: C("berry", "berryDeep") },
    },
    face: { old: true, bushy: true, browColor: "hairSilverDeep" },
    tilt: -0.04,
  },
  // Posy, eight years old.
  posy: {
    body: "child",
    skin: "s5",
    hair: { style: "bunches", color: "h1", ribbon: "poppy" },
    outfit: {
      legs: { kind: "skirt", color: C("mustard", "mustardDeep"), hem: -12, flare: 4 },
      top: { color: { ...white, pattern: "stripes", mark: "poppy" }, collar: "round" },
      over: { kind: "bib" },
      boots: poppy,
    },
    face: { grin: true, wideEyed: true },
    tilt: 0.06,
  },
  // Dr Linden: tidy, round glasses, a waistcoat and a silk scarf.
  linden: {
    body: "woman",
    skin: "s4",
    hair: { style: "bob", color: "h1" },
    glasses: "round",
    outfit: {
      legs: { kind: "trousers", color: C("dusk", "lavenderDeep") },
      top: { color: white, collar: "shirt", sleeves: 0.92 },
      over: { kind: "waistcoat", color: C("sageDeep", "pine"), chain: true },
      neck: { kind: "scarf", color: C("lilac", "lavender") },
    },
  },
  // Marguerite of the tea room: silver hair up, pearls.
  marguerite: {
    body: "woman",
    shape: "thin",
    skin: "s6",
    hair: { style: "bun", color: "h7" },
    outfit: {
      legs: { kind: "skirt", color: C("heather", "plum"), hem: -9, flare: 4 },
      top: { color: C("heather", "plum"), sleeves: 0.92, collar: "none", scoop: 4.6 },
      neck: { kind: "pearls", brooch: "rose" },
    },
    face: { old: true, earrings: "white" },
    tilt: -0.02,
  },
  // Tobias Reed, angler: beard, a hat with flies in the band, a waxed jacket.
  tobias: {
    body: "man",
    skin: "s3",
    hair: { style: "tousled", color: "h3" },
    hat: { kind: "fishing" },
    beard: "full",
    outfit: {
      legs: { kind: "trousers", color: C("soil", "bark") },
      top: {
        color: C("waxed", "waxedDeep"),
        insert: { color: cream, depth: 13 },
        collar: "shirt",
        collarColor: "bark",
        sleeves: 0.92,
        hem: 4,
        flare: 1,
        pockets: true,
        buttonColor: "gold",
      },
      boots: C("moss", "pine"),
    },
  },
  // Wren, painter: a beret, a spotted smock, a brush behind her ear.
  wren: {
    body: "woman",
    skin: "s1",
    hair: { style: "curls", color: "h5" },
    hat: { kind: "beret" },
    outfit: {
      legs: { kind: "trousers", color: denim },
      top: {
        color: C("linen", "creamDeep"),
        sleeves: 0.9,
        hem: 6,
        flare: 3,
        collar: "peter",
        collarColor: "sky",
        spots: true,
      },
    },
    face: { freckles: true, brush: "borage" },
    tilt: 0.05,
  },
  // Farmer Barley: big, ruddy, straw hat, checked shirt and braces.
  barley: {
    body: "man",
    shape: "big",
    skin: "s2",
    hair: { style: "tousled", color: "h6" },
    hat: { kind: "straw", band: brown },
    outfit: {
      legs: { kind: "trousers", color: C("denimDeep", darken("denimDeep", 0.35)) },
      top: { color: { ...cream, pattern: "checks", mark: "poppy" }, collar: "shirt" },
      over: { kind: "braces", color: brown },
    },
    face: { ruddy: true, chew: true },
  },
};

export const REGULAR_IDS = Object.keys(REGULARS);

const WARM = [
  C("dustyRose", "dustyRoseDeep"),
  C("mustard", "mustardDeep"),
  C("terracotta", "chestnut"),
  C("peach", "terracotta"),
  C("berry", "berryDeep"),
  poppy,
  C("clover", "berry"),
];
const COOL = [
  denim,
  C("sage", "sageDeep"),
  C("lavender", "lavenderDeep"),
  C("pond", "water"),
  C("dusk", "lavenderDeep"),
  C("moss", "pine"),
  C("heather", "plum"),
  C("mintPale", "mintDeep"),
];
const PALE = [
  white,
  cream,
  C("butter", "butterDeep"),
  C("sky", "skyDeep"),
  C("blush", "blushDeep"),
  C("linen", "creamDeep"),
];
const EARTH = [tweed, C("soil", "bark"), brown, C("waxed", "waxedDeep"), C("stone", "tweedDeep")];
const BOOTS = [C("boot", "bootDeep"), C("boot", "bootDeep"), C("moss", "pine"), C("umber", "coal")];

const HAIR = {
  woman: ["long-waves", "braid", "bun", "curls", "bob", "bob", "bun", "curly", "cropped"],
  man: ["tousled", "curly", "side-part", "long-tied", "cropped", "cropped", "side-part"],
  child: ["bunches", "bob", "tousled", "curly", "braid", "curls"],
};
const HAIR_COLOURS = ["h1", "h1", "h2", "h2", "h3", "h3", "h4", "h5", "h6", "h6"];

function dress(r, body, old) {
  const colour = r.pick([...WARM, ...COOL]);
  const pale = r.pick(PALE);
  const patterned = (c, marks) =>
    r.chance(0.4)
      ? { ...c, pattern: r.pick(marks), mark: r.pick(["poppy", "denimDeep", "moss"]) }
      : c;
  const trousers = {
    kind: "trousers",
    color: r.pick([...EARTH, denim, C("dusk", "lavenderDeep")]),
  };
  const skirt = (c) => ({ kind: "skirt", color: c, hem: r.pick([-17, -14, -11]), flare: 5 });
  const knit = { sleeves: 0.92, hem: 2, ribbed: true };
  if (body === "child")
    return r.pick([
      () => ({
        legs: r.chance(0.5)
          ? { ...skirt(colour), hem: -12, flare: 4 }
          : { kind: "trousers", color: colour },
        top: { color: patterned(pale, ["stripes"]), collar: "round" },
        over: { kind: "bib" },
      }),
      () => ({ legs: trousers, top: { color: colour, collar: "round", ...knit } }),
    ])();
  if (body === "woman")
    return r.pick([
      () => ({
        legs: skirt(colour),
        top: {
          color: r.chance(0.35) ? { ...colour, pattern: "dots", mark: "white" } : colour,
          collar: "peter",
          collarColor: "white",
          sleeves: r.pick([0.42, 0.92]),
        },
        over: r.chance(0.3)
          ? { kind: "shawl", color: r.pick([...PALE, ...WARM]) }
          : r.chance(0.2)
            ? { kind: "apron", color: white }
            : undefined,
      }),
      () => ({
        legs: skirt(r.pick([...EARTH, ...COOL])),
        top: { color: colour, insert: { color: pale }, buttonColor: "wood", ...knit },
      }),
      () => ({ legs: trousers, top: { color: colour, collar: "round", ...knit } }),
      () => ({
        legs: trousers,
        top: { color: patterned(pale, ["stripes", "dots"]), collar: "peter", sleeves: 0.42 },
        over: r.chance(0.4) ? { kind: "shawl", color: colour } : undefined,
      }),
    ])();
  return r.pick([
    () => ({ legs: trousers, top: { color: colour, collar: "round", ...knit } }),
    () => ({
      legs: trousers,
      top: {
        color: patterned(pale, ["checks", "stripes"]),
        collar: "shirt",
        sleeves: r.pick([0.42, 0.92]),
      },
      over: { kind: "braces", color: r.pick([brown, poppy, C("moss", "pine")]) },
    }),
    () => ({
      legs: trousers,
      top: {
        color: colour,
        insert: { color: pale },
        collar: "shirt",
        buttonColor: "wood",
        ...knit,
      },
      neck: old && r.chance(0.5) ? { kind: "bowtie", color: r.pick(WARM) } : undefined,
    }),
    () => ({
      legs: trousers,
      top: {
        color: r.pick(EARTH),
        insert: { color: r.pick([...PALE, ...WARM]) },
        collar: "shirt",
        sleeves: 0.92,
        hem: 4,
        flare: 1,
        pockets: true,
      },
    }),
    () => ({
      legs: trousers,
      top: { color: pale, collar: "shirt", sleeves: 0.92 },
      over: { kind: "waistcoat", color: r.pick([...COOL, ...EARTH, ...WARM]) },
    }),
  ])();
}

/** A stranger at the stall, the same every time for the same seed. */
function walkin(seed) {
  const r = rng(`villager/${seed}`);
  const body = r.pick(["woman", "woman", "woman", "man", "man", "man", "child"]);
  const grown = body !== "child";
  const old = grown && r.chance(0.28);
  const shape = grown
    ? r.pick([null, null, null, "round", "thin", body === "man" ? "big" : null])
    : null;
  const skin = r.pick(["s1", "s2", "s3", "s4", "s5", "s6"]);
  // Hair that suits the skin: every colour on the lighter tones, the darks on the deeper.
  const natural =
    skin > "s4" ? HAIR_COLOURS.slice(0, 4) : skin > "s3" ? HAIR_COLOURS.slice(0, 6) : HAIR_COLOURS;
  const hairColor = old && r.chance(0.8) ? "h7" : r.pick(natural);
  const outfit = dress(r, body, old);
  if (!outfit.neck && !outfit.top.insert && r.chance(0.25))
    outfit.neck = { kind: "scarf", color: r.pick([...WARM, ...COOL]) };
  outfit.boots = r.pick(BOOTS);
  outfit.basket = r.chance(0.4);
  const hats =
    body === "man"
      ? [{ kind: "cap" }, { kind: "straw", band: brown }, { kind: "knit", color: r.pick(COOL) }]
      : [
          { kind: "straw", band: r.pick(WARM) },
          { kind: "beret", color: r.pick([...WARM, ...COOL]) },
          { kind: "knit", color: r.pick([...WARM, ...COOL]) },
          { kind: "bow", color: r.pick(WARM) },
        ];
  return {
    body,
    shape,
    skin,
    hair: {
      style: r.pick(HAIR[body]),
      color: hairColor,
      ribbon: r.pick(["rose", "borage", "mustard"]),
    },
    hat: r.chance(0.36) ? r.pick(hats) : { kind: "none" },
    beard:
      body === "man" && r.chance(0.4)
        ? r.pick(old ? ["moustache", "full"] : ["stubble", "full"])
        : "none",
    glasses: r.chance(old ? 0.45 : 0.14) ? "round" : "none",
    outfit,
    face: {
      old,
      freckles: !old && r.chance(0.15),
      ruddy: r.chance(0.15),
      wideEyed: !grown,
      ...(old && hairColor === "h7" ? { browColor: "hairSilverDeep" } : {}),
    },
    tilt: r.range(-0.06, 0.06),
  };
}

/**
 * The person for a villager id: a regular's id, or anything else (by
 * convention "walkin-<n>") for a stranger seeded by it. Never throws.
 */
export function cast(id) {
  const key = String(id ?? "walkin-0");
  const spec = REGULARS[key] ?? walkin(key);
  return {
    seed: key,
    ...spec,
    skin: SKINS[spec.skin] ?? SKINS.s3,
    hair: { ...spec.hair, c: HAIRS[spec.hair.color] ?? HAIRS.h3 },
    hat: spec.hat ?? { kind: "none" },
  };
}
