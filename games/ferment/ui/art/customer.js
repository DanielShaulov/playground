// @ts-check
/**
 * Customer art: one pure function from a look and a mood to inline SVG.
 *
 * A look is a handful of named parts (skin, hair, clothes, glasses, hat, one
 * extra). Walk-ins pass a number and every part is picked from it, so the
 * same number always draws the same person. Regulars can pass a look object
 * that fixes the parts that make them recognisable (an apron, a headscarf)
 * and leaves the rest to `seed`. `portraitLook` fills a look in; `faceSvg`
 * draws it and touches nothing else, which is what the art gallery uses.
 *
 * Moods are drawn to read at counter size (52 px wide on a small phone):
 * the brows, eyes and mouth all change, with one extra mark each.
 * - wait: relaxed, a small smile;
 * - impatient: brows down, mouth pressed flat, eyes to the side, a sweat drop;
 * - delight: eyes closed in a grin, open smile, blush, two sparkles;
 * - ok: a closed, pleased smile;
 * - meh: worried brows, heavy lids, a downturned mouth.
 */

/** @typedef {"wait" | "impatient" | "delight" | "ok" | "meh"} Mood */

export const MOODS = /** @type {Mood[]} */ (["wait", "impatient", "delight", "ok", "meh"]);

export const SKINS = ["#f6d7bf", "#eec19a", "#d9a27a", "#b97f57", "#8d5a3b", "#6b4129"];
export const HAIR_COLOURS = [
  "#2a2220", // black
  "#4a3020", // dark brown
  "#77502f", // brown
  "#9a4a2a", // auburn
  "#d4a85a", // blonde
  "#a8a29a", // grey
  "#e8e3da", // white
];
export const TOP_COLOURS = [
  "#5f7f99",
  "#a45c4f",
  "#6f8a57",
  "#8a6a9a",
  "#c79a45",
  "#4f7a74",
  "#7a5a48",
  "#3f4f6a",
];

export const HAIRS = /** @type {const} */ ([
  "crop",
  "sidepart",
  "swept",
  "curly",
  "bald",
  "bob",
  "long",
  "bun",
  "ponytail",
  "braid",
]);
export const BEARDS = /** @type {const} */ (["none", "stubble", "moustache", "full"]);
export const GLASSES = /** @type {const} */ (["none", "round", "square"]);
export const HATS = /** @type {const} */ (["none", "beanie", "cap", "flatcap", "headscarf"]);
export const TOPS = /** @type {const} */ ([
  "sweater",
  "collar",
  "cardigan",
  "apron",
  "jacket",
  "turtleneck",
]);
export const EXTRAS = /** @type {const} */ (["none", "earrings", "scarf", "freckles", "necklace"]);

/**
 * @typedef {{
 *   seed: number, skin: number, hair: typeof HAIRS[number], hairColor: number,
 *   beard: typeof BEARDS[number], glasses: typeof GLASSES[number],
 *   hat: typeof HATS[number], top: typeof TOPS[number], topColor: number,
 *   extra: typeof EXTRAS[number], age: 0 | 1 | 2
 * }} Look
 *   skin, hairColor and topColor index SKINS, HAIR_COLOURS and TOP_COLOURS;
 *   age 0 is young, 2 is old (lines at the eyes, and grey hair by default).
 */

/** A stable 0..1 value per (seed, part), so parts vary independently. */
function roll(/** @type {number} */ seed, /** @type {number} */ part) {
  let x = (Math.imul(seed + 1, 2654435761) ^ Math.imul(part + 1, 40503)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Pick from a list, or from weighted [value, weight] pairs. */
function choose(/** @type {number} */ r, /** @type {readonly any[]} */ list) {
  if (!Array.isArray(list[0])) return list[Math.floor(r * list.length)];
  const total = list.reduce((t, [, w]) => t + w, 0);
  let at = r * total;
  for (const [v, w] of list) if ((at -= w) < 0) return v;
  return list[list.length - 1][0];
}

/**
 * Fill in a look. A number is a walk-in's look; an object keeps every part it
 * names and picks the rest from its `seed` (0 when missing).
 * @param {number | Partial<Look>} look
 * @returns {Look}
 */
export function portraitLook(look) {
  const fixed = typeof look === "number" ? { seed: look } : look;
  const seed = fixed.seed ?? 0;
  const r = (/** @type {number} */ part) => roll(seed, part);
  const age =
    fixed.age ??
    choose(r(1), [
      [0, 4],
      [1, 4],
      [2, 2],
    ]);
  const hair =
    fixed.hair ??
    choose(r(2), [
      ["crop", 3],
      ["sidepart", 3],
      ["swept", 2],
      ["curly", 3],
      ["bald", age === 0 ? 0.3 : 1.5],
      ["bob", 3],
      ["long", 3],
      ["bun", 2],
      ["ponytail", 2],
      ["braid", 1.5],
    ]);
  const short = ["crop", "sidepart", "swept", "curly", "bald"].includes(hair);
  const hairColor =
    fixed.hairColor ??
    (age === 2
      ? choose(r(3), [
          [5, 3],
          [6, 2],
          [1, 1],
        ])
      : choose(r(3), [
          [0, 3],
          [1, 4],
          [2, 3],
          [3, 1.5],
          [4, 1.5],
          [5, age === 1 ? 0.8 : 0],
        ]));
  return {
    seed,
    age,
    hair,
    hairColor,
    skin: fixed.skin ?? Math.floor(r(4) * SKINS.length),
    beard:
      fixed.beard ??
      (short && age > 0
        ? choose(r(5), [
            ["none", 5],
            ["stubble", 1.5],
            ["moustache", 1],
            ["full", 2],
          ])
        : short
          ? choose(r(5), [
              ["none", 6],
              ["stubble", 1.5],
            ])
          : "none"),
    glasses:
      fixed.glasses ??
      choose(r(6), [
        ["none", 8 - age * 1.5],
        ["round", 1.2],
        ["square", 1.2],
      ]),
    hat:
      fixed.hat ??
      choose(r(7), [
        ["none", 12],
        ["beanie", 1.2],
        ["cap", 1],
        ["flatcap", age > 0 ? 1 : 0.2],
        ["headscarf", 0.8],
      ]),
    top:
      fixed.top ??
      choose(r(8), [
        ["sweater", 3],
        ["collar", 3],
        ["cardigan", 2],
        ["apron", 0.6],
        ["jacket", 2],
        ["turtleneck", 1.5],
      ]),
    topColor: fixed.topColor ?? Math.floor(r(9) * TOP_COLOURS.length),
    extra:
      fixed.extra ??
      choose(r(10), [
        ["none", 8],
        ["earrings", short ? 0.6 : 2],
        ["scarf", 1.2],
        ["freckles", 1.2],
        ["necklace", 1],
      ]),
  };
}

/** Mix two #rrggbb colours; t = 0 gives a, 1 gives b. */
function mix(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const sh of [16, 8, 0]) {
    const ca = (pa >> sh) & 255,
      cb = (pb >> sh) & 255;
    out |= Math.round(ca + (cb - ca) * t) << sh;
  }
  return "#" + out.toString(16).padStart(6, "0");
}

const INK = "#3a2a20";
const LINEN = "#efe6d6";

// Geometry in viewBox units (80 × 112). The head is an ellipse centred at
// (40, 42), 21 wide and 24 tall each way; the shoulders fill the bottom.
const BODY = "M4 112 Q6 82 24 75 Q32 72 40 72 Q48 72 56 75 Q74 82 76 112 Z";

/** Hair drawn behind the head (falls to the shoulders or sits up top). */
function hairBack(/** @type {Look} */ l, /** @type {string} */ c) {
  switch (l.hair) {
    case "bob":
      return `<path d="M15 66 Q8 16 40 14 Q72 16 65 66 Q58 70 52 64 L28 64 Q22 70 15 66 Z" fill="${c}"/>`;
    case "long":
      return `<path d="M14 92 Q4 14 40 13 Q76 14 66 92 Q58 96 54 88 L54 60 L26 60 L26 88 Q22 96 14 92 Z" fill="${c}"/>`;
    case "bun":
      return `<circle cx="40" cy="13" r="9" fill="${c}"/><path d="M33 13 Q40 9 47 13" stroke="${mix(c, "#000", 0.25)}" stroke-width="1.4" fill="none"/>`;
    case "ponytail":
      return `<path d="M56 24 Q72 30 70 56 Q69 70 62 76 Q66 60 60 44 Q58 34 54 30 Z" fill="${c}"/>`;
    case "braid": {
      let s = "";
      for (let i = 0; i < 5; i++)
        s += `<ellipse cx="${(58 + i * 1.2).toFixed(1)}" cy="${60 + i * 7}" rx="4.6" ry="4.4" fill="${c}" stroke="${mix(c, "#000", 0.25)}" stroke-width="1"/>`;
      return `<path d="M56 30 Q64 40 60 58 L56 58 Z" fill="${c}"/>${s}<path d="M60 94 l2 5 M62 94 l-1 5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
    }
    default:
      return "";
  }
}

/** Hair drawn over the top of the head. */
function hairFront(/** @type {Look} */ l, /** @type {string} */ c) {
  switch (l.hair) {
    case "crop":
      return `<path d="M19 40 Q17 15 40 15 Q63 15 61 40 Q59 27 50 25 Q40 27 30 25 Q21 27 19 40 Z" fill="${c}"/>`;
    case "sidepart":
      return `<path d="M18 42 Q14 13 42 13 Q66 14 62 42 Q61 28 54 24 Q42 30 26 27 Q20 31 18 42 Z" fill="${c}"/><path d="M30 17 Q38 22 54 24" stroke="${mix(c, "#ffffff", 0.25)}" stroke-width="1.2" fill="none"/>`;
    case "swept":
      return `<path d="M19 40 Q14 9 46 9 Q66 11 61 38 Q59 24 48 22 Q30 21 19 40 Z" fill="${c}"/>`;
    case "curly": {
      let s = "";
      const pts = [
        [20, 36],
        [19, 28],
        [23, 21],
        [29, 16],
        [36, 14],
        [44, 14],
        [51, 16],
        [57, 21],
        [61, 28],
        [60, 36],
        [28, 24],
        [36, 21],
        [44, 21],
        [52, 24],
      ];
      for (const [x, y] of pts) s += `<circle cx="${x}" cy="${y}" r="5.4" fill="${c}"/>`;
      return s;
    }
    case "bald":
      return `<path d="M19 46 Q18 36 21 32 Q23 38 23 46 Z M61 46 Q62 36 59 32 Q57 38 57 46 Z" fill="${c}"/>`;
    case "bob":
    case "long":
      return `<path d="M18 46 Q16 15 40 15 Q64 15 62 46 Q60 32 52 29 Q46 31 40 26 Q30 31 22 32 Q19 38 18 46 Z" fill="${c}"/>`;
    case "bun":
    case "ponytail":
    case "braid":
      return `<path d="M19 40 Q18 15 40 15 Q62 15 61 40 Q58 26 40 24 Q24 25 19 40 Z" fill="${c}"/><path d="M28 20 Q40 16 52 20" stroke="${mix(c, "#ffffff", 0.2)}" stroke-width="1.1" fill="none"/>`;
  }
}

/** The top, from the shoulders up to the neck. */
function top(/** @type {Look} */ l, /** @type {string} */ skin) {
  const c = TOP_COLOURS[l.topColor];
  const dark = mix(c, "#000", 0.28);
  const neck = `<path d="M33 60 L33 74 Q40 79 47 74 L47 60 Z" fill="${mix(skin, "#000", 0.12)}"/>`;
  switch (l.top) {
    case "sweater":
      return `<path d="${BODY}" fill="${c}"/>${neck}<path d="M31 74 Q40 82 49 74" stroke="${dark}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    case "collar":
      return `<path d="${BODY}" fill="${c}"/>${neck}<path d="M32 73 L40 84 L48 73 L46 72 L40 79 L34 72 Z" fill="${LINEN}"/><path d="M40 84 L40 112" stroke="${dark}" stroke-width="1"/><circle cx="40" cy="92" r="1.1" fill="${dark}"/><circle cx="40" cy="102" r="1.1" fill="${dark}"/>`;
    case "cardigan":
      return `<path d="${BODY}" fill="${c}"/>${neck}<path d="M32 73 Q40 79 48 73 L45 112 L35 112 Z" fill="${LINEN}"/><path d="M34 73 L37 112 M46 73 L43 112" stroke="${dark}" stroke-width="2"/><circle cx="38.5" cy="90" r="1.3" fill="${dark}"/><circle cx="38.8" cy="101" r="1.3" fill="${dark}"/>`;
    case "apron":
      // The shirt underneath is linen; the apron is the coloured part.
      return `<path d="${BODY}" fill="${LINEN}"/>${neck}<path d="M33 74 Q40 79 47 74" stroke="${mix(LINEN, "#000", 0.15)}" stroke-width="2" fill="none"/><path d="M30 76 L28 86 M50 76 L52 86" stroke="${c}" stroke-width="2.6"/><path d="M27 86 L53 86 L55 112 L25 112 Z" fill="${c}"/><path d="M33 94 L47 94 L47 102 L33 102 Z" fill="none" stroke="${dark}" stroke-width="1.2"/>`;
    case "jacket":
      return `<path d="${BODY}" fill="${c}"/>${neck}<path d="M33 73 L40 92 L47 73 Z" fill="${LINEN}"/><path d="M31 73 L40 96 L35 82 L33 86 Z M49 73 L40 96 L45 82 L47 86 Z" fill="${dark}"/><path d="M40 96 L40 112" stroke="${dark}" stroke-width="1.2"/>`;
    case "turtleneck":
      return `<path d="${BODY}" fill="${c}"/><path d="M32 60 L32 77 Q40 82 48 77 L48 60 Z" fill="${mix(skin, "#000", 0.12)}"/><path d="M31 66 Q40 71 49 66 L49 77 Q40 82 31 77 Z" fill="${dark}"/><path d="M32 70 Q40 74 48 70" stroke="${c}" stroke-width="1" fill="none"/>`;
  }
}

function hat(/** @type {Look} */ l, /** @type {string} */ hairC) {
  const c = TOP_COLOURS[(l.topColor + 3) % TOP_COLOURS.length];
  const dark = mix(c, "#000", 0.25);
  switch (l.hat) {
    case "beanie":
      return `<path d="M17 34 Q16 6 40 6 Q64 6 63 34 Z" fill="${c}"/><path d="M16 28 L64 28 L64 37 Q40 33 16 37 Z" fill="${dark}"/><path d="M26 12 L26 28 M33 8 L33 28 M40 7 L40 28 M47 8 L47 28 M54 12 L54 28" stroke="${dark}" stroke-width="1" opacity=".5"/>`;
    case "cap":
      return `<path d="M18 30 Q18 9 40 9 Q62 9 62 30 Z" fill="${c}"/><path d="M14 30 Q40 25 66 30 Q60 35 40 33 Q20 35 14 30 Z" fill="${dark}"/><circle cx="40" cy="10" r="1.6" fill="${dark}"/>`;
    case "flatcap":
      return `<path d="M17 31 Q14 12 42 12 Q66 13 64 26 Q66 30 62 31 Z" fill="${c}"/><path d="M15 31 Q40 25 68 28 Q66 34 40 34 Q22 35 15 31 Z" fill="${dark}"/><path d="M24 18 Q40 14 58 18" stroke="${dark}" stroke-width="1" fill="none" opacity=".6"/>`;
    case "headscarf":
      return `<path d="M15 46 Q12 10 40 10 Q68 10 65 46 Q62 30 52 26 Q40 30 28 26 Q18 30 15 46 Z" fill="${c}"/><path d="M28 26 Q40 30 52 26" stroke="${dark}" stroke-width="1.4" fill="none"/><path d="M60 22 Q70 20 72 28 Q68 30 66 27 Q70 36 64 40 Q63 32 60 30 Z" fill="${c}" stroke="${dark}" stroke-width="1"/><circle cx="62" cy="25" r="3" fill="${dark}"/><circle cx="30" cy="17" r="1.2" fill="${LINEN}" opacity=".7"/><circle cx="44" cy="15" r="1.2" fill="${LINEN}" opacity=".7"/><circle cx="54" cy="20" r="1.2" fill="${LINEN}" opacity=".7"/><circle cx="37" cy="22" r="1.2" fill="${LINEN}" opacity=".7"/>`;
    default:
      return "";
  }
}

function beard(/** @type {Look} */ l, /** @type {string} */ c) {
  switch (l.beard) {
    case "stubble":
      return `<path d="M21 50 Q24 66 40 67 Q56 66 59 50 Q55 60 40 61 Q25 60 21 50 Z" fill="${c}" opacity=".35"/>`;
    case "moustache":
      return `<path d="M31 55 Q35 50 40 53 Q45 50 49 55 Q45 54 40 56 Q35 54 31 55 Z" fill="${c}"/>`;
    case "full":
      // A window of skin round the mouth, so every mood still reads.
      return `<path d="M19 44 Q19 68 40 70 Q61 68 61 44 Q58 54 52 56 Q46 52 40 54 Q34 52 28 56 Q22 54 19 44 Z M31 59 Q31 53 40 53.5 Q49 53 49 59 Q49 65.5 40 65.5 Q31 65.5 31 59 Z" fill="${c}" fill-rule="evenodd"/>`;
    default:
      return "";
  }
}

function glasses(/** @type {Look} */ l) {
  // A brown frame, clear of the eyes, so the eyes stay the darkest mark.
  const f = "#7a5236";
  const s = `stroke="${f}" stroke-width="1.7" fill="none"`;
  switch (l.glasses) {
    case "round":
      return `<circle cx="32" cy="44.5" r="6.8" ${s}/><circle cx="48" cy="44.5" r="6.8" ${s}/><path d="M38.8 44 Q40 42.5 41.2 44 M25.2 43.5 L20 41 M54.8 43.5 L60 41" stroke="${f}" stroke-width="1.6" fill="none"/>`;
    case "square":
      return `<rect x="24.5" y="39" width="14" height="11" rx="2.5" ${s}/><rect x="41.5" y="39" width="14" height="11" rx="2.5" ${s}/><path d="M38.5 43 L41.5 43 M24.5 42 L20 40 M55.5 42 L60 40" stroke="${f}" stroke-width="1.6" fill="none"/>`;
    default:
      return "";
  }
}

/** Extras worn on the head (drawn with the face). */
function extraHead(/** @type {Look} */ l, /** @type {string} */ skin) {
  switch (l.extra) {
    case "earrings":
      return `<circle cx="19" cy="52" r="2" fill="#d9b44a"/><circle cx="61" cy="52" r="2" fill="#d9b44a"/>`;
    case "freckles": {
      const f = mix(skin, "#6a3a1a", 0.45);
      return [
        [27, 50],
        [30, 52],
        [25, 53],
        [53, 50],
        [50, 52],
        [55, 53],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${f}"/>`)
        .join("");
    }
    default:
      return "";
  }
}

/** Extras worn on the body (drawn over the top). */
function extraBody(/** @type {Look} */ l) {
  const c = TOP_COLOURS[(l.topColor + 5) % TOP_COLOURS.length];
  switch (l.extra) {
    case "scarf":
      return `<path d="M29 70 Q40 78 51 70 L53 77 Q40 86 27 77 Z" fill="${c}"/><path d="M44 80 L50 80 L52 100 L45 100 Z" fill="${c}"/><path d="M45 96 L52 96" stroke="${mix(c, "#000", 0.25)}" stroke-width="1.2"/>`;
    case "necklace":
      return `<path d="M34 74 Q40 84 46 74" stroke="#d9b44a" stroke-width="1.1" fill="none"/><circle cx="40" cy="81" r="1.8" fill="#d9b44a"/>`;
    default:
      return "";
  }
}

/** Eyes, brows and mouth for a mood, plus that mood's extra mark. */
function face(/** @type {Mood} */ mood, /** @type {Look} */ l) {
  const brow = mix(HAIR_COLOURS[l.hairColor], INK, l.hairColor >= 4 ? 0.45 : 0.1);
  const line = (/** @type {string} */ d, w = 2.6) =>
    `<path d="${d}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Brows sit higher over glasses, so the frame never hides them.
  const up = l.glasses === "none" ? 0 : -3.5;
  const brows = (/** @type {string} */ d) =>
    `<path d="${d}" transform="translate(0 ${up})" stroke="${brow}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const dots = (dx = 0) =>
    `<circle cx="${32 + dx}" cy="44" r="3" fill="${INK}"/><circle cx="${48 + dx}" cy="44" r="3" fill="${INK}"/>`;
  const blush = (o = 0.45) =>
    `<ellipse cx="26" cy="52" rx="4.2" ry="2.6" fill="#e8846e" opacity="${o}"/><ellipse cx="54" cy="52" rx="4.2" ry="2.6" fill="#e8846e" opacity="${o}"/>`;
  switch (mood) {
    case "wait":
      return (
        brows("M27 37 Q32 35 36 37 M44 37 Q48 35 53 37") + dots() + line("M35 57 Q40 60 45 57")
      );
    case "impatient":
      return (
        brows("M27 35 L36 39 M53 35 L44 39") +
        dots(2) +
        line("M34 59 L46 57") +
        `<path d="M64 26 Q67 32 64 34 Q61 32 64 26 Z" fill="#7cc2e8" stroke="#4f97bd" stroke-width=".8"/>`
      );
    case "delight":
      return (
        brows("M26 34 Q31 31 36 33 M44 33 Q49 31 54 34") +
        line("M28 45 Q32 40 36 45 M44 45 Q48 40 52 45") +
        `<path d="M33 55 Q40 54 47 55 Q46 64 40 64 Q34 64 33 55 Z" fill="#7a3a2a"/><path d="M35 55.5 Q40 55 45 55.5 L44.5 57 Q40 57.5 35.5 57 Z" fill="#fff"/>` +
        blush(0.6) +
        `<path d="M10 22 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z M68 12 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#e0b04a"/>`
      );
    case "ok":
      return (
        brows("M27 36 Q32 34 36 36 M44 36 Q48 34 53 36") +
        line("M29 45 Q32 42 35 45 M45 45 Q48 42 51 45", 2.4) +
        line("M34 56 Q40 61 46 56") +
        blush(0.3)
      );
    case "meh":
      return (
        brows("M27 38 Q31 36 36 35 M44 35 Q49 36 53 38") +
        dots() +
        `<path d="M28 42 L36 42 M44 42 L52 42" stroke="${mix(SKINS[l.skin], "#000", 0.25)}" stroke-width="2.4" stroke-linecap="round"/>` +
        line("M34 60 Q37 57 40 58 Q43 57 46 60")
      );
  }
}

/**
 * Draw a customer. `look` is a walk-in's number or a (partial) Look.
 * @param {number | Partial<Look>} look
 * @param {Mood} mood
 */
export function faceSvg(look, mood) {
  const l = portraitLook(look);
  const skin = SKINS[l.skin];
  const hairC = HAIR_COLOURS[l.hairColor];
  const shade = mix(skin, "#000", 0.12);
  const lines =
    l.age === 2
      ? `<path d="M22 44 l-3 -1.5 M22 47 l-3 1 M58 44 l3 -1.5 M58 47 l3 1 M33 27 Q40 25 47 27" stroke="${mix(skin, "#000", 0.25)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
      : l.age === 1
        ? `<path d="M22 46 l-2.5 -0.6 M58 46 l2.5 -0.6" stroke="${mix(skin, "#000", 0.2)}" stroke-width="1" stroke-linecap="round"/>`
        : "";
  // Hair under a headscarf or beanie is tucked away; long hair still shows.
  const tucked = l.hat === "headscarf" || l.hat === "beanie";
  const back = l.hat === "headscarf" ? "" : hairBack(l, hairC);
  const front = tucked ? "" : hairFront(l, hairC);
  const tilt = mood === "impatient" ? -4 : mood === "delight" ? 4 : mood === "meh" ? -2 : 0;
  const head =
    `<g transform="rotate(${tilt} 40 70)">` +
    back +
    `<circle cx="19.5" cy="45" r="4.5" fill="${shade}"/><circle cx="60.5" cy="45" r="4.5" fill="${shade}"/>` +
    `<ellipse cx="40" cy="42" rx="21" ry="24" fill="${skin}"/>` +
    lines +
    `<path d="M40 46 Q38 51 40.5 52" stroke="${mix(skin, "#000", 0.22)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    front +
    beard(l, hairC) +
    extraHead(l, skin) +
    face(mood, l) +
    glasses(l) +
    hat(l, hairC) +
    `</g>`;
  return `<svg viewBox="0 0 80 112" class="portrait" data-mood="${mood}">${top(l, skin)}${extraBody(l)}${head}</svg>`;
}
