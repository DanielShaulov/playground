// @ts-check
/**
 * Jar art: one pure function from a jar's state to inline SVG. Everything the
 * rules know about a jar shows on the glass, so a player can read it:
 *
 * - brine level = servings left, against a notch per portion the jar holds;
 * - flavour (crisp → funky) = the brine clouding over, more bubbles, a foam
 *   ring at the surface, a pale sediment settling, the bits dulling, and the
 *   lid doming higher and higher;
 * - gone over = the lid popped off and foam spilling down the side;
 * - add-ins from the bench (`jar.adds`, ingredient ids) float in the brine;
 *   a discovered recipe draws its base recipe's bits in its own colours.
 *
 * Everything decorative is placed by the jar's id, so a jar looks the same
 * every time it is drawn. `jarLook` reads a jar; `jarArt` draws a look and
 * touches nothing else, which is what the art gallery uses.
 */

import { RECIPES } from "../../content/recipes.js";
import { SERVINGS } from "../../content/tuning.js";
import { flavour, isOver } from "../../core/index.js";

/**
 * @typedef {{
 *   id: number, recipe: string, f: number, over: boolean,
 *   servings: number, size: number, adds: string[]
 * }} JarLook
 *   f is flavour 0 (crisp) → 1 (funky); servings counts down from size, the
 *   portions the jar was started with.
 */

/** A tiny xorshift generator for decoration only (never for rules). */
function seeded(n) {
  let x = (n * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const n1 = (/** @type {number} */ v) => v.toFixed(1);

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

// Glass geometry, in viewBox units. The jar sits on y = 36; the space above
// the lid is for doming and the popped lid.
const GLASS = "#c2b29b";
const LID = "#9a6a43";
const LID_DARK = "#7d5435";
const FULL = -19; // brine surface when the jar is full
const EMPTY = 31; // and when it has nothing left to sell
const levelAt = (/** @type {number} */ servings, /** @type {number} */ size) =>
  EMPTY + (FULL - EMPTY) * Math.max(0, Math.min(1, servings / size));
const BODY =
  "M-19 -31 H19 V-27.5 Q26 -26 26 -18 V25 Q26 36 15 36 H-15 Q-26 36 -26 25 V-18 Q-26 -26 -19 -27.5 Z";
const INSIDE =
  "M-17 -29 H17 V-25.8 Q24 -24.5 24 -17 V24.5 Q24 34 14 34 H-14 Q-24 34 -24 24.5 V-17 Q-24 -24.5 -17 -25.8 Z";

/**
 * The recipe's own bits, one piece at (x, y) turned by a degrees.
 * @type {Record<string, (x: number, y: number, a: number, c: string, rnd: () => number) => string>}
 */
const BITS = {
  // Cucumber spears: pale flesh with a dark skin along one edge and a row of seeds.
  dill: (x, y, a, c, rnd) => {
    const w = 16 + rnd() * 5;
    return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})">
      <rect x="${n1(-w / 2)}" y="-3.2" width="${n1(w)}" height="6.4" rx="2.6" fill="${mix(c, "#e2ebb4", 0.6)}"/>
      <path d="M${n1(-w / 2 + 1.5)} -2.6 H${n1(w / 2 - 1.5)}" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
      <g fill="#f7f4de">${[-0.3, -0.1, 0.1, 0.3].map((t) => `<ellipse cx="${n1(t * w * 0.85)}" cy="1" rx="1" ry=".55"/>`).join("")}</g></g>`;
  },
  // Chillies: a curved pod with a green stalk.
  hotsauce: (x, y, a, c) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})">
      <path d="M-7 -1.5 Q0 -4.5 7 -1 Q9 0 7.5 1.5 Q0 3.5 -7 2 Z" fill="${c}"/>
      <path d="M-7 0.2 Q-9.5 -1 -10.5 -3" stroke="#5e7d3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M-4 -1.6 Q1 -3 5 -1" stroke="#fff" stroke-width=".8" fill="none" opacity=".45"/></g>`,
  // Napa cabbage: a frilly pale leaf with a red-dusted rib.
  kimchi: (x, y, a, c, rnd) => {
    const s = 0.85 + rnd() * 0.35;
    return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)}) scale(${s.toFixed(2)})">
      <path d="M-8 2 Q-9 -4 -4 -5 Q-2 -7 1 -5 Q4 -7 6 -4 Q10 -3 8 2 Q4 5 0 3.5 Q-4 5 -8 2 Z" fill="#f4e6c8"/>
      <path d="M-8 2 Q-9 -4 -4 -5 Q-2 -7 1 -5 Q4 -7 6 -4 Q10 -3 8 2 Q4 5 0 3.5 Q-4 5 -8 2 Z" fill="${c}" opacity=".55"/>
      <path d="M-6 1.5 Q0 -1 7 0.5" stroke="#fff4e6" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
  },
  // Sauerkraut: fine wavy shreds.
  kraut: (x, y, a, c, rnd) => {
    let p = "";
    for (let i = 0; i < 3; i++) {
      const dy = (i - 1) * 2.2 + rnd();
      const w = 7 + rnd() * 4;
      p += `<path d="M${n1(-w)} ${n1(dy)} q${n1(w / 2)} -2.2 ${n1(w)} 0 t${n1(w)} 0" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    }
    return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})">${p}</g>`;
  },
  // Beet slices: deep discs with paler growth rings.
  beets: (x, y, a, c, rnd) => {
    const r = 4.5 + rnd() * 2;
    return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})">
      <ellipse rx="${n1(r)}" ry="${n1(r * 0.8)}" fill="${c}"/>
      <ellipse rx="${n1(r * 0.62)}" ry="${n1(r * 0.5)}" fill="none" stroke="${mix(c, "#f3c3d2", 0.45)}" stroke-width=".8"/>
      <ellipse rx="${n1(r * 0.28)}" ry="${n1(r * 0.22)}" fill="none" stroke="${mix(c, "#f3c3d2", 0.45)}" stroke-width=".7"/></g>`;
  },
  // Lemon quarters: a yellow rind round a pale wedge with segment lines.
  lemons: (x, y, a, c) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})">
      <path d="M-7 2.5 A7 7 0 0 1 7 2.5 Z" fill="${c}"/>
      <path d="M-5.6 2.5 A5.6 5.6 0 0 1 5.6 2.5 Z" fill="#fbf1bf"/>
      <path d="M0 2.5 L-3.6 -1.8 M0 2.5 L0 -3 M0 2.5 L3.6 -1.8" stroke="${mix(c, "#fbf1bf", 0.5)}" stroke-width=".7"/></g>`,
  // Kombucha: a floating mother, a soft pale disc, with stray strands below.
  kombucha: (x, y, a, c, rnd) => {
    const w = 8 + rnd() * 4;
    return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${(a / 4).toFixed(0)})">
      <ellipse rx="${n1(w)}" ry="2.2" fill="${mix(c, "#f2e2c4", 0.55)}" opacity=".9"/>
      <path d="M${n1(-w / 2)} 2 q1 3 -0.5 5 M${n1(w / 3)} 2 q-1 2.5 0.5 4.5" stroke="${c}" stroke-width=".8" fill="none" opacity=".7"/></g>`;
  },
};

/** A plain chunk, for a recipe that has no drawing of its own yet. */
const chunk = (x, y, a, c, rnd) =>
  `<rect x="${n1(x - 5)}" y="${n1(y - 3)}" width="${n1(10 + rnd() * 4)}" height="${n1(6 + rnd() * 3)}" rx="3" fill="${c}" transform="rotate(${a.toFixed(0)} ${n1(x)} ${n1(y)})"/>`;

/**
 * Bench add-ins, keyed by ingredient id. Each draws a couple of small pieces.
 * An id with no drawing gets a neutral speck, so new ingredients never break.
 * @type {Record<string, (x: number, y: number, a: number, rnd: () => number) => string>}
 */
const ADDINS = {
  chili: (x, y, a) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})"><circle r="3" fill="#c8372a"/><circle r="1.6" fill="#f1c27a"/><circle r=".5" cx=".6" fill="#c8372a"/></g>`,
  garlic: (x, y, a) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})"><path d="M-3.5 2 Q-4 -3 0 -4.5 Q3 -3 3.5 2 Q0 3.2 -3.5 2 Z" fill="#fbf6ea" stroke="#d9cdb3" stroke-width=".7"/><path d="M0 -4.5 V-5.8" stroke="#c9b48c" stroke-width=".8"/></g>`,
  pear: (x, y, a) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})"><path d="M-6 2 Q-5 -4 0 -4 Q6 -4 6 2 Z" fill="#efe3a6"/><path d="M-6 2 Q-5 -4 0 -4 Q6 -4 6 2" stroke="#b6b45a" stroke-width="1" fill="none"/></g>`,
  // Honey: an amber cloud that hasn't quite mixed in, and a drop.
  honey: (x, y, a) =>
    `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${a.toFixed(0)})"><path d="M-7 1 Q-6 -3.5 -1 -2.5 Q3 -4.5 6.5 -1 Q8 2.5 3 2.5 Q-2 4 -7 1 Z" fill="#e3a43a" opacity=".5"/><circle cx="1" cy="-.5" r="1.8" fill="#d48f22" opacity=".9"/></g>`,
  // Salt dissolves: a few crystals still sitting on the bottom.
  salt: (x) =>
    [0, 1, 2, 3, 4]
      .map((i) => {
        const cx = x + i * 3.4 - 6.8,
          cy = 30.6 - (i % 2) * 1.2;
        return `<rect x="${n1(cx - 1.2)}" y="${n1(cy - 1.2)}" width="2.4" height="2.4" fill="#fff" stroke="#a89c86" stroke-width=".5" transform="rotate(45 ${n1(cx)} ${n1(cy)})"/>`;
      })
      .join(""),
};
const speck = (x, y) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.8" fill="#8a7a62" opacity=".7"/>`;

/** @returns {JarLook} */
export function jarLook(/** @type {import("../../core/types.js").Jar} */ jar) {
  return {
    id: jar.id,
    recipe: jar.recipe,
    f: flavour(jar),
    over: isOver(jar),
    servings: jar.servings,
    size: jar.size ?? SERVINGS,
    adds: jar.adds ?? [],
  };
}

/** Draw one jar look as an inline SVG string. */
export function jarArt(/** @type {JarLook} */ look, cls = "jar") {
  const r = RECIPES[look.recipe] ?? { brine: "#e6dcc0", bits: "#b49a6a", base: undefined };
  const f = Math.round(Math.max(0, Math.min(1, look.f)) * 40) / 40;
  const over = look.over;
  const rnd = seeded(look.id + 7);
  const size = look.size ?? SERVINGS;
  const level = levelAt(look.servings, size);
  const depth = EMPTY + 3 - level; // how much brine there is to draw in
  const uid = `j${look.id}${cls}`;

  // Bits: fewer as the jar is sold down, settling to the bottom. They dull and
  // soften towards olive-brown as the jar ferments.
  const bitColour = mix(r.bits, "#8c7a4e", f * 0.45);
  const draw = BITS[look.recipe] ?? BITS[r.base] ?? chunk;
  const nBits = Math.max(1, Math.round(2 + 6 * (look.servings / size)));
  let bits = "";
  for (let i = 0; i < nBits; i++) {
    const x = -15 + rnd() * 30;
    const y = 31 - rnd() * Math.max(3, depth - 9) - (i % 3) * 1.5;
    bits += draw(x, Math.max(level + 5, y), -35 + rnd() * 70, bitColour, rnd);
  }
  let adds = "";
  look.adds.slice(0, 6).forEach((id) => {
    const art = ADDINS[id];
    const bottom = id === "salt";
    for (let i = 0; i < (bottom ? 1 : 2); i++) {
      const x = -16 + rnd() * 32;
      const y = Math.max(level + 4, 31 - rnd() * Math.max(3, depth - 7));
      const piece = art ? art(x, y, rnd() * 360, rnd) : speck(x, y);
      // Drawn a size up, so a pinch of something reads among the recipe's own
      // bits; crystals on the bottom stay small.
      adds += bottom
        ? piece
        : `<g transform="translate(${n1(x)} ${n1(y)}) scale(1.35) translate(${n1(-x)} ${n1(-y)})">${piece}</g>`;
    }
  });

  // Clouding: a milky veil over the bits, thicker as it ferments, plus a pale
  // sediment once it is past tangy.
  const cloud = (0.05 + Math.pow(f, 1.25) * 0.62).toFixed(2);
  const lees = f > 0.45 ? Math.min(1, (f - 0.45) / 0.45) : 0;

  // Bubbles: a few from the start, many when funky, and a foam ring at the top.
  const nBub = over ? 16 : Math.round(1 + f * 12);
  let bubs = "";
  for (let i = 0; i < 16; i++) {
    const x = -20 + rnd() * 40;
    const y = level + 3 + Math.pow(rnd(), 1.6) * Math.max(2, depth - 6);
    const rad = 0.9 + rnd() * 1.7;
    if (i < nBub)
      bubs += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(rad)}" fill="#fff" fill-opacity=".25" stroke="#fff" stroke-width="1.1"/>`;
  }
  let foam = "";
  if (over || f > 0.55) {
    const n = over ? 11 : Math.round((f - 0.55) * 22);
    for (let i = 0; i < n; i++)
      foam += `<circle cx="${n1(-22 + (44 * (i + 0.5)) / n + (rnd() - 0.5) * 2)}" cy="${n1(level + 0.8 + rnd() * 1.4)}" r="${n1(1 + rnd() * 1)}"/>`;
    foam = `<g fill="#fffdf5" stroke="#efe6d2" stroke-width=".5">${foam}</g>`;
  }

  // Serving notches on the glass, one per serving, so the level reads at a glance.
  let notches = "";
  for (let k = 1; k <= size; k++) {
    const y = levelAt(k, size);
    notches += `<path d="M20.5 ${n1(y)} H24" stroke="${GLASS}" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  // Lid: a wooden cap whose top domes with the gas inside; strain marks just
  // before it goes, then popped off with foam running down the glass.
  const dome = 1.5 + Math.pow(f, 1.5) * 11;
  let lid;
  if (over) {
    lid = `<g transform="translate(-5 -9) rotate(-22 -20 -38)">
        <path d="M-20 -38 Q0 -52 20 -38 Z" fill="${LID}"/>
        <rect x="-21" y="-39" width="42" height="7.5" rx="2" fill="${LID_DARK}"/></g>
      <path d="M-19 -31 Q-21 -36 -15 -36 Q-12 -40 -7 -37 Q-3 -41 2 -37 Q7 -40 11 -36 Q17 -37 18 -32 Q21 -30 19 -27
               Q23 -24 22.5 -18 Q24 -14 22 -11 Q21 -15 20 -23 Q8 -28 -19 -28 Z" fill="#fffdf5" stroke="#e8dcc4" stroke-width=".8"/>
      <g fill="#fffdf5" stroke="#e2683f" stroke-width="1.1"><circle cx="-3" cy="-43" r="2.4"/><circle cx="5" cy="-49" r="1.8"/><circle cx="0" cy="-55" r="1.4"/></g>`;
  } else {
    const strain =
      f > 0.82
        ? `<g stroke="#d9663e" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="${n1(Math.min(1, (f - 0.82) / 0.12))}">
            <path d="M-27 ${n1(-42 - dome * 0.4)} l-3 -2.5 M27 ${n1(-42 - dome * 0.4)} l3 -2.5 M-25 ${n1(-36 - dome * 0.2)} l-3.5 0 M25 ${n1(-36 - dome * 0.2)} l3.5 0"/></g>`
        : "";
    lid = `<path d="M-20 -38 Q0 ${n1(-38 - dome * 2)} 20 -38 Z" fill="${LID}"/>
      <path d="M-14 -39.5 Q0 ${n1(-39 - dome * 1.6)} 14 -39.5" stroke="#b98a5f" stroke-width="1" fill="none" opacity=".7"/>
      <rect x="-21" y="-39" width="42" height="8.5" rx="2" fill="${LID_DARK}"/>
      <path d="M-20 -34.5 H20" stroke="${LID}" stroke-width="1"/>${strain}`;
  }

  return `<svg class="${cls}" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
    <defs><clipPath id="${uid}"><path d="${INSIDE}"/></clipPath>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".55" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#6b5a43" stop-opacity=".1"/></linearGradient></defs>
    <ellipse cx="0" cy="36.5" rx="24" ry="1.8" fill="#5a4330" opacity=".14"/>
    <path d="${BODY}" fill="#fcfbf6"/>
    <g clip-path="url(#${uid})">
      <rect x="-26" y="${n1(level)}" width="52" height="${n1(40 - level)}" fill="${r.brine}" opacity=".62"/>
      ${bits}${adds}
      <rect x="-26" y="${n1(level)}" width="52" height="${n1(40 - level)}" fill="#f8f4e8" opacity="${cloud}"/>
      ${lees ? `<path d="M-26 ${n1(31 - lees * 3)} Q0 ${n1(28 - lees * 4)} 26 ${n1(31 - lees * 3)} V36 H-26 Z" fill="#efe6cc" opacity="${n1(0.5 + lees * 0.4)}"/>` : ""}
      ${bubs}
      <path d="M-26 ${n1(level)} H26" stroke="#fff" stroke-width="1.2" opacity=".75"/>
      ${foam}
      <rect x="-26" y="-30" width="52" height="70" fill="url(#${uid}g)"/>
    </g>
    <path d="${BODY}" fill="none" stroke="${GLASS}" stroke-width="2.2" stroke-linejoin="round"/>
    ${notches}
    <rect x="-19" y="-20" width="4.5" height="46" rx="2.25" fill="#fff" opacity=".6"/>
    <rect x="16" y="-21" width="2" height="9" rx="1" fill="#fff" opacity=".55"/>
    ${lid}
  </svg>`;
}

/** The jar on a shelf: `cls` names the svg's class (and keeps clip ids unique). */
export function jarSvg(/** @type {import("../../core/types.js").Jar} */ jar, cls = "jar") {
  return jarArt(jarLook(jar), cls);
}

export const emptyJarSvg = `<svg class="jar" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
  <path d="${BODY}" fill="none" stroke="#cdb796" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
  <rect x="-21" y="-39" width="42" height="8.5" rx="2" fill="none" stroke="#cdb796" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M0 -2 V14 M-8 6 H8" stroke="#c9b08e" stroke-width="2.6" stroke-linecap="round"/></svg>`;
