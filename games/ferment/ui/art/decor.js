// @ts-check
/**
 * Decor art (content/decor.js): how each piece looks, as pure functions from
 * a piece id to CSS values or SVG strings. The window draws its own curtains
 * and sill piece (scene.js windowArt), and the jars their dressing (jar.js);
 * this file has the rest and the swatches the decor screen shows.
 *
 * - `wallCss(id)`: the shelf's back wall, as { color, image } for CSS.
 * - `woodVars(id)`: the shelf's plank colours (style.css --plank, -hi, -lo, --wood-dark).
 * - `garlandArt(id, lit)`: one repeating tile of what hangs along the top of
 *   the shelf, as { svg, w } (tile width in px); `lit` is after dark, when
 *   lights glow.
 * - `bagArt(id)`: what a customer carries their portion away in ("" for none).
 * - `applyDecor(root, look, night)`: hangs it all on the shop as CSS vars.
 * - `decorSwatch(id)`: a small picture of any piece, for the decor screen.
 */

import { DECOR } from "../../content/decor.js";
import { windowArt } from "./scene.js";
import { jarArt } from "./jar.js";

/** An SVG string as a CSS url(). */
export const cssUrl = (/** @type {string} */ svg) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const tile = (/** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** @type {Record<string, { color: string, image: string }>} */
const WALLS = {
  boards: { color: "#ecd8ba", image: "none" },
  stripes: {
    color: "#e7e6cf",
    image:
      "repeating-linear-gradient(90deg, rgba(126,154,104,.32) 0 10px, transparent 10px 14px, rgba(126,154,104,.14) 14px 16px, transparent 16px 30px)",
  },
  sprig: {
    color: "#f4e6dc",
    image: cssUrl(
      tile(
        40,
        44,
        `<g transform="translate(10 12)"><path d="M0 6 Q2 0 6 -2" stroke="#7d9a62" stroke-width="1.2" fill="none"/><path d="M2 2 q-4 -1 -5 2 q4 1 5 -2z" fill="#93ae78"/><circle cx="6" cy="-3" r="2.6" fill="#d9828a"/><circle cx="6" cy="-3" r="1.1" fill="#b85864"/></g>
        <g transform="translate(30 34) rotate(150)"><path d="M0 6 Q2 0 6 -2" stroke="#7d9a62" stroke-width="1.2" fill="none"/><path d="M2 2 q-4 -1 -5 2 q4 1 5 -2z" fill="#93ae78"/><circle cx="6" cy="-3" r="2.6" fill="#e7a1a4"/><circle cx="6" cy="-3" r="1.1" fill="#c26a74"/></g>`,
      ),
    ),
  },
  tiles: {
    color: "#f3f1ea",
    image: cssUrl(
      tile(
        24,
        24,
        `<rect width="24" height="24" fill="#f3f1ea"/><rect x=".5" y=".5" width="23" height="23" fill="none" stroke="#c9d3dc" stroke-width="1"/>
        <path d="M12 5 L14 10 L19 12 L14 14 L12 19 L10 14 L5 12 L10 10Z" fill="#5f84b3" opacity=".75"/><circle cx="12" cy="12" r="1.6" fill="#f3f1ea"/>
        <path d="M0 0 h3 M0 0 v3 M24 0 h-3 M24 0 v3 M0 24 h3 M0 24 v-3 M24 24 h-3 M24 24 v-3" stroke="#5f84b3" stroke-width="1.4" opacity=".6"/>`,
      ),
    ),
  },
  damask: {
    color: "#3f4a3c",
    image: cssUrl(
      tile(
        36,
        48,
        `<rect width="36" height="48" fill="#3f4a3c"/><g fill="#c9a85a" opacity=".55">
        <path d="M18 6 Q24 14 18 22 Q12 14 18 6Z"/><path d="M18 22 Q28 24 28 32 Q22 30 18 36 Q14 30 8 32 Q8 24 18 22Z"/><circle cx="18" cy="40" r="2"/>
        <path d="M0 30 Q4 34 0 40Z M36 30 Q32 34 36 40Z"/></g>`,
      ),
    ),
  },
  postcards: {
    color: "#ead7b9",
    image: cssUrl(
      tile(
        84,
        76,
        `<g transform="rotate(-6 20 18)"><rect x="6" y="6" width="28" height="20" fill="#fdf6ea" stroke="#d3bf9c"/><rect x="9" y="9" width="22" height="11" fill="#8fbde3"/><path d="M9 20 L16 14 L22 18 L26 15 L31 20Z" fill="#7d9a62"/></g>
        <g transform="rotate(5 62 22)"><rect x="48" y="10" width="28" height="20" fill="#fdf6ea" stroke="#d3bf9c"/><rect x="51" y="13" width="22" height="11" fill="#f2b58f"/><circle cx="62" cy="21" r="4" fill="#ffd36b"/></g>
        <g transform="rotate(3 30 56)"><rect x="16" y="46" width="28" height="20" fill="#fdf6ea" stroke="#d3bf9c"/><rect x="19" y="49" width="22" height="11" fill="#c7764a"/><path d="M22 60 V54 L26 51 L30 54 V60 M33 60 V55 H38 V60" fill="#efe1c6"/></g>
        <g transform="rotate(-4 68 60)"><rect x="56" y="50" width="24" height="18" fill="#fdf6ea" stroke="#d3bf9c"/><path d="M60 54 H76 M60 58 H72 M60 62 H74" stroke="#9a7a58" stroke-width="1"/></g>
        <g fill="#c8463a"><circle cx="20" cy="7" r="1.5"/><circle cx="62" cy="11" r="1.5"/><circle cx="30" cy="47" r="1.5"/><circle cx="68" cy="51" r="1.5"/></g>`,
      ),
    ),
  },
};

/** The back wall behind the jars. */
export const wallCss = (/** @type {string} */ id) => WALLS[id] ?? WALLS.boards;

/** @type {Record<string, { plank: string, hi: string, lo: string, dark: string }>} */
const WOODS = {
  oak: { plank: "#b9875a", hi: "#cf9d6e", lo: "#a5764b", dark: "#8f6440" },
  walnut: { plank: "#7a5236", hi: "#916447", lo: "#644128", dark: "#4d321f" },
  sage: { plank: "#93a982", hi: "#a9bd98", lo: "#7e946e", dark: "#62775a" },
  cream: { plank: "#e6dac4", hi: "#f3ead9", lo: "#d3c4aa", dark: "#b3a184" },
  cherry: { plank: "#9c4a35", hi: "#b8604a", lo: "#843b29", dark: "#c99a3e" },
};

/** The shelf's plank colours. */
export const woodVars = (/** @type {string} */ id) => WOODS[id] ?? WOODS.oak;

/**
 * One tile of the garland along the top of the shelf.
 * @returns {{ svg: string, w: number } | null}
 */
export function garlandArt(/** @type {string} */ id, lit = false) {
  const H = 26;
  const sag = (/** @type {number} */ w) =>
    `<path d="M0 3 Q${w / 2} 13 ${w} 3" stroke="#6b4a2e" stroke-width="1" fill="none"/>`;
  if (id === "bunting") {
    const w = 66;
    const flags = [
      [11, "#c8463a"],
      [33, "#f2b84b"],
      [55, "#7fb069"],
    ];
    return {
      w,
      svg: tile(
        w,
        H,
        sag(w) +
          flags
            .map(([x, c]) => {
              const y = 3 + 10 * (1 - Math.pow((Number(x) - w / 2) / (w / 2), 2));
              return `<path d="M${Number(x) - 7} ${y.toFixed(1)} L${Number(x) + 7} ${y.toFixed(1)} L${x} ${(y + 13).toFixed(1)}Z" fill="${c}"/>`;
            })
            .join(""),
      ),
    };
  }
  if (id === "chillies") {
    const w = 48;
    let body = `<path d="M0 3 H${w}" stroke="#b49a6a" stroke-width="1.6"/>`;
    for (const [x, len, a] of [
      [8, 15, -6],
      [20, 18, 4],
      [33, 14, -3],
      [42, 17, 8],
    ])
      body += `<g transform="translate(${x} 4) rotate(${a})"><path d="M-1 0 h2 v2 h-2z" fill="#6f9a45"/><path d="M-2.4 2 Q-2.6 ${len * 0.7} 0.5 ${len} Q2.6 ${len * 0.6} 2.4 2Z" fill="#c8331f"/><path d="M-1 4 Q-1.2 ${len * 0.5} 0 ${len * 0.75}" stroke="#ee6a4f" stroke-width=".8" fill="none"/></g>`;
    return { w, svg: tile(w, H, body) };
  }
  if (id === "fairy") {
    const w = 60;
    let body = sag(w).replace("#6b4a2e", "#4a5a3c");
    const colours = ["#ffd27a", "#ffb0a0", "#bfe3ff", "#ffd27a", "#d8f0a8"];
    colours.forEach((c, i) => {
      const x = 6 + i * 12;
      const y = 3 + 10 * (1 - Math.pow((x - w / 2) / (w / 2), 2)) + 2;
      if (lit) body += `<circle cx="${x}" cy="${y + 2}" r="6" fill="${c}" opacity=".35"/>`;
      body += `<rect x="${x - 1}" y="${y - 2}" width="2" height="2.4" fill="#4a5a3c"/><ellipse cx="${x}" cy="${y + 2}" rx="2" ry="2.8" fill="${lit ? "#fffbe8" : c}" stroke="${c}" stroke-width=".8"/>`;
    });
    return { w, svg: tile(w, H, body) };
  }
  if (id === "lanterns") {
    const w = 96;
    let body = `<path d="M0 3 H${w}" stroke="#7d5435" stroke-width="1.6"/>`;
    for (const x of [24, 72]) {
      body += `<path d="M${x} 3 V6" stroke="#8a6a2a" stroke-width="1"/>
        ${lit ? `<circle cx="${x}" cy="15" r="11" fill="#ffd27a" opacity=".38"/>` : ""}
        <path d="M${x - 4} 6 H${x + 4} L${x + 5} 8 H${x - 5}Z" fill="#b8892f"/>
        <rect x="${x - 4.5}" y="8" width="9" height="12" rx="1.5" fill="${lit ? "#ffe39a" : "#efe1c6"}" stroke="#b8892f" stroke-width="1.4"/>
        <path d="M${x} 8 V20 M${x - 4.5} 14 H${x + 4.5}" stroke="#b8892f" stroke-width=".8"/>
        <path d="M${x - 5} 20 H${x + 5} L${x + 3} 23 H${x - 3}Z" fill="#b8892f"/>`;
    }
    return { w, svg: tile(w, H, body) };
  }
  return null;
}

/** What a customer carries their portion away in, as an SVG string ("" for in hand). */
export function bagArt(/** @type {string} */ id) {
  const svg = (/** @type {string} */ body) =>
    `<svg class="bag" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  if (id === "paper")
    return svg(`<path d="M8 12 H32 L34 42 H6Z" fill="#c9a26d"/><path d="M8 12 L11 6 H29 L32 12" fill="#b48d58"/>
      <path d="M8 12 L12 15 L16 12 L20 15 L24 12 L28 15 L32 12" stroke="#9c7743" stroke-width="1" fill="none"/>
      <path d="M12 20 V38" stroke="#b48d58" stroke-width=".8"/><circle cx="20" cy="27" r="5" fill="#efe1c6"/><path d="M18 26 q2 -3 4 0 q-2 4 -4 0z" fill="#7fb069"/>`);
  if (id === "striped")
    return svg(`<path d="M14 14 Q14 4 20 4 Q26 4 26 14" stroke="#4a3524" stroke-width="1.8" fill="none"/>
      <rect x="7" y="13" width="26" height="29" rx="1.5" fill="#fdf6ea"/>
      <g fill="#c8463a"><rect x="9" y="13" width="3.5" height="29"/><rect x="16" y="13" width="3.5" height="29"/><rect x="23" y="13" width="3.5" height="29"/><rect x="30" y="13" width="3" height="29"/></g>
      <rect x="7" y="13" width="26" height="29" rx="1.5" fill="none" stroke="#a03a2f" stroke-width="1"/>`);
  if (id === "basket")
    return svg(`<path d="M9 18 Q9 3 20 3 Q31 3 31 18" stroke="#8f6440" stroke-width="2.4" fill="none"/>
      <path d="M5 18 H35 L31 41 H9Z" fill="#c9965c"/>
      <path d="M6 24 H34 M7 30 H33 M8 36 H32" stroke="#a5764b" stroke-width="1.4"/>
      <path d="M12 18 V41 M20 18 V41 M28 18 V41" stroke="#a5764b" stroke-width="1"/>
      <path d="M5 18 Q12 13 20 18 Q28 13 35 18 L33 21 Q20 17 7 21Z" fill="#c8463a"/><path d="M9 18 l2 1 M15 17 l2 1 M23 17 l2 1 M29 18 l2 1" stroke="#fdf6ea" stroke-width="1"/>`);
  if (id === "giftbox")
    return svg(`<rect x="6" y="18" width="28" height="24" rx="1.5" fill="#3f4a3c"/><rect x="4" y="13" width="32" height="7" rx="1.5" fill="#4d5a49"/>
      <rect x="18" y="13" width="4" height="29" fill="#c9a85a"/>
      <path d="M20 13 Q12 3 9 8 Q8 12 20 13 Q32 12 31 8 Q28 3 20 13Z" fill="#d9b864" stroke="#b8892f" stroke-width=".8"/>`);
  return "";
}

let applied = "";

/**
 * Hang the shop's decor on `root` as CSS vars (style.css draws them): the
 * back wall (--paper, --panel), the shelf wood (--plank…), the garland
 * (--garland, --garland-w). Only redraws when the look or the dark changes.
 * @param {HTMLElement} root
 * @param {Record<string, string>} look  spot → piece id (core decorLook)
 * @param {boolean} night
 */
export function applyDecor(root, look, night) {
  const key = `${JSON.stringify(look)}${night}`;
  if (key === applied && root.style.getPropertyValue("--panel")) return;
  applied = key;
  const wall = wallCss(look.wall);
  const wood = woodVars(look.wood);
  const g = garlandArt(look.garland, night);
  const set = (/** @type {string} */ k, /** @type {string} */ v) => root.style.setProperty(k, v);
  set("--panel", wall.color);
  set("--paper", wall.image);
  set("--plank", wood.plank);
  set("--plank-hi", wood.hi);
  set("--plank-lo", wood.lo);
  set("--wood-dark", wood.dark);
  set("--garland", g ? cssUrl(g.svg) : "none");
  set("--garland-w", g ? `${g.w}px` : "0px");
  root.dataset.garland = g ? look.garland : "";
}

/** A small picture of a piece of decor, for the decor screen's swatches. */
export function decorSwatch(/** @type {string} */ id) {
  const d = DECOR[id];
  if (!d) return "";
  if (d.spot === "wall") {
    const w = wallCss(id);
    return `<i class="sw-wall" style="background-color:${w.color};background-image:${w.image.replace(/"/g, "'")}"></i>`;
  }
  if (d.spot === "wood") {
    const w = woodVars(id);
    return `<i class="sw-wood" style="--p:${w.plank};--h:${w.hi};--l:${w.lo};--d:${w.dark}"></i>`;
  }
  if (d.spot === "curtains" || d.spot === "sill") {
    const art = windowArt(11, { [d.spot]: id });
    return `<img class="sw-window" alt="" src="data:image/svg+xml,${encodeURIComponent(art)}">`;
  }
  if (d.spot === "garland") {
    const g = garlandArt(id, true);
    return g
      ? `<i class="sw-garland" style="background-image:${cssUrl(g.svg).replace(/"/g, "'")};background-size:${g.w * 0.8}px auto"></i>`
      : `<i class="sw-none"></i>`;
  }
  if (d.spot === "jars")
    return `<span class="sw-jar">${jarArt(
      { id: 900, recipe: "dill", f: 0.35, over: false, servings: 2, size: 2, adds: [], dress: id },
      `swj${id}`,
    )}</span>`;
  return bagArt(id) || `<i class="sw-none"></i>`;
}
