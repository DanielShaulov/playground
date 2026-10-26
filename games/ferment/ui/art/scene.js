// @ts-check
/**
 * The shop around the jars: the window behind the counter and the light it
 * throws across the shop, both following the time of day.
 *
 * - `sceneHour(s)` turns the clock into an hour of the day: dawn before the
 *   shop opens, OPEN_AT + hour while it is open, night once it has closed.
 * - `windowArt(hour)` draws the window (arched wooden frame, sky, sun or moon
 *   and stars, the rooftops across the street with their windows lit after
 *   dark, linen curtains, a pot of dill on the sill). Pure, for the gallery.
 * - `lightAt(hour)` is the light in the room: a soft beam from the window by
 *   day, golden late on, and a warm lamp pool once it's dark.
 * - `paintScene(root, s)` hangs both on the shop as CSS custom properties
 *   (--window, --light, --light-blend, --wall); ui/style.css draws them. It
 *   only rebuilds when the light (or the decor) has moved on a step, so the
 *   ~10×/s redraw costs nothing. It hangs the shop's decor too (art/decor.js).
 */

import { OPEN_AT } from "../../content/tuning.js";
import { decorLook } from "../../core/index.js";
import { dressJars } from "./jar.js";
import { applyDecor } from "./decor.js";

/** Sky colours by hour of day: [hour, top, horizon]. @type {[number, string, string][]} */
const SKY = [
  [0, "#141c38", "#2c365c"],
  [5, "#25305a", "#6d5a78"],
  [6.5, "#6f86b8", "#f2b58f"],
  [8, "#8fbde3", "#f6dcc0"],
  [10, "#7fbde8", "#d8eef6"],
  [14, "#6cb0e4", "#cfe8f4"],
  [17, "#7fb0da", "#f4dcae"],
  [18.8, "#6f7fb6", "#f3a467"],
  [20, "#3b4678", "#c27768"],
  [21, "#1f2a52", "#47507a"],
  [24, "#141c38", "#2c365c"],
];

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

/** The sky's [top, horizon] colours at an hour of the day. */
export function skyAt(/** @type {number} */ hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (SKY[i + 1][0] <= h && i < SKY.length - 2) i++;
  const [h0, t0, b0] = SKY[i];
  const [h1, t1, b1] = SKY[i + 1];
  const t = (h - h0) / (h1 - h0);
  return [mix(t0, t1, t), mix(b0, b1, t)];
}

/** The hour of the day the shop is at: dawn in the morning, night once closed. */
export function sceneHour(/** @type {import("../../core/types.js").State} */ s) {
  if (s.clock.phase === "morning") return 7;
  if (s.clock.phase === "evening") return 21.5;
  return OPEN_AT + s.clock.hour;
}

/** 0 by day, 1 at full night, between at dawn and dusk. */
const darkness = (/** @type {number} */ h) =>
  h < 5 ? 1 : h < 7 ? (7 - h) / 2 : h < 19 ? 0 : h < 21 ? (h - 19) / 2 : 1;

const n1 = (/** @type {number} */ v) => v.toFixed(1);

/**
 * The window at an hour of the day, as a standalone SVG string (80×112).
 * `decor` picks its curtains and what sits on the sill (content/decor.js
 * ids; missing: the linen curtains and the pot of dill).
 */
export function windowArt(
  /** @type {number} */ hour,
  /** @type {{ curtains?: string, sill?: string }} */ decor = {},
) {
  const h = ((hour % 24) + 24) % 24;
  const [top, low] = skyAt(h);
  const dark = darkness(h);

  // Sun: up from the left at 6, down to the right at 20, on a low arc.
  let sky = "";
  if (h > 5.5 && h < 20.5) {
    const t = (h - 6) / 14;
    const x = 14 + t * 52;
    const y = 74 - Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 54;
    const warm = Math.min(1, Math.abs(t - 0.5) * 2.2);
    const core = mix("#fff6d8", "#ffb35a", warm * warm);
    sky += `<circle cx="${n1(x)}" cy="${n1(y)}" r="13" fill="${core}" opacity=".28"/>
      <circle cx="${n1(x)}" cy="${n1(y)}" r="7" fill="${core}"/>`;
  }
  // Clouds drift across the day.
  if (dark < 0.8) {
    const cx = 10 + ((h * 7) % 70);
    const a = (0.85 * (1 - dark)).toFixed(2);
    sky += `<g fill="#fffaf0" opacity="${a}"><ellipse cx="${n1(cx)}" cy="34" rx="11" ry="3.6"/><ellipse cx="${n1(cx + 5)}" cy="31" rx="6" ry="3.6"/>
      <ellipse cx="${n1(((cx + 38) % 80) + 2)}" cy="52" rx="8" ry="2.6"/></g>`;
  }
  // Moon and stars after dark.
  if (dark > 0) {
    const a = dark.toFixed(2);
    sky += `<g opacity="${a}"><circle cx="56" cy="30" r="6.5" fill="#f6eecd"/><circle cx="59.5" cy="27.5" r="5.6" fill="${top}"/>
      <g fill="#fff8e0"><circle cx="20" cy="24" r=".9"/><circle cx="32" cy="40" r=".7"/><circle cx="66" cy="50" r=".8"/><circle cx="44" cy="20" r=".6"/><circle cx="14" cy="48" r=".7"/></g></g>`;
  }
  // The rooftops across the street, darker at night, windows lit after dark.
  const roof = mix("#b49c86", "#2a2440", dark * 0.9);
  const roof2 = mix("#c9b39c", "#3a3352", dark * 0.9);
  const lit =
    dark > 0.3
      ? `<g fill="#ffd27a" opacity="${n1(dark)}"><rect x="15" y="80" width="4" height="5"/><rect x="50" y="76" width="4" height="5"/><rect x="62" y="84" width="4" height="5"/></g>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 112">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient>
  <clipPath id="p"><path d="M8 40 Q8 8 40 8 Q72 8 72 40 V96 H8 Z"/></clipPath></defs>
  <path d="M2 40 Q2 2 40 2 Q78 2 78 40 V100 H2 Z" fill="#9a6a43"/>
  <g clip-path="url(#p)"><rect width="80" height="112" fill="url(#s)"/>${sky}
    <path d="M0 96 V78 L10 70 L20 78 V74 H40 V68 L50 62 L60 68 V76 L72 70 L80 76 V96 Z" fill="${roof2}"/>
    <path d="M0 96 V86 H12 V80 L22 74 L32 80 V88 H46 V82 H58 V88 H80 V96 Z" fill="${roof}"/>${lit}
    <path d="M40 8 V96 M8 52 H72" stroke="#7d5435" stroke-width="3.2"/>
    <path d="M12 44 Q14 20 34 13" stroke="#fff" stroke-width="2" fill="none" opacity="${n1(0.35 - dark * 0.25)}" stroke-linecap="round"/></g>
  <path d="M8 40 Q8 8 40 8 Q72 8 72 40 V96 H8 Z" fill="none" stroke="#7d5435" stroke-width="1.5"/>
  ${curtainsArt(decor.curtains)}
  <rect x="0" y="96" width="80" height="8" rx="2" fill="#b9875a"/><rect x="2" y="104" width="76" height="3" fill="#8f6440"/>
  ${sillArt(decor.sill)}
</svg>`;
}

/** Curtain fabrics: [fill (or pattern), edge, tie-back, pattern defs]. */
const CURTAINS = {
  linen: ["#efe1c6", "#d3bf9c", "#c9895a", ""],
  gingham: [
    "url(#cf)",
    "#b8463c",
    "#7d5435",
    `<pattern id="cf" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fbf3e6"/><rect width="2" height="4" fill="#d9534a" opacity=".5"/><rect width="4" height="2" fill="#d9534a" opacity=".5"/></pattern>`,
  ],
  lace: [
    "url(#cf)",
    "#e0d6c4",
    "#c9b28a",
    `<pattern id="cf" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fdfaf3"/><circle cx="2.5" cy="2.5" r="1.3" fill="none" stroke="#e3d8c4" stroke-width=".6"/></pattern>`,
  ],
  velvet: [
    "url(#cf)",
    "#4a2240",
    "#c9a85a",
    `<linearGradient id="cf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e2f4e"/><stop offset=".5" stop-color="#8a4a72"/><stop offset="1" stop-color="#5e2f4e"/></linearGradient>`,
  ],
  roses: [
    "url(#cf)",
    "#d8b9a8",
    "#c26a74",
    `<pattern id="cf" width="8" height="9" patternUnits="userSpaceOnUse"><rect width="8" height="9" fill="#fbf1e6"/><circle cx="3" cy="3" r="1.6" fill="#d9828a"/><circle cx="4.4" cy="3.8" r=".8" fill="#7d9a62"/><circle cx="7" cy="7.5" r="1.2" fill="#e7a1a4"/></pattern>`,
  ],
};

function curtainsArt(/** @type {string | undefined} */ id) {
  const [fill, edge, tie, defs] = CURTAINS[id ?? "linen"] ?? CURTAINS.linen;
  return `${defs ? `<defs>${defs}</defs>` : ""}
  <path d="M3 10 Q10 30 6 60 Q4 76 10 82 Q14 78 13 64 Q12 40 19 14 Q14 6 3 10 Z" fill="${fill}" stroke="${edge}" stroke-width="1"/>
  <path d="M77 10 Q70 30 74 60 Q76 76 70 82 Q66 78 67 64 Q68 40 61 14 Q66 6 77 10 Z" fill="${fill}" stroke="${edge}" stroke-width="1"/>
  <path d="M6 62 Q10 64 14 62 M74 62 Q70 64 66 62" stroke="${tie}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}

const POT = `<path d="M52 96 L54 86 H66 L68 96 Z" fill="#c7764a"/><rect x="53" y="84" width="14" height="3" rx="1" fill="#a65c34"/>`;

/** What sits on the sill, right of the customer. */
function sillArt(/** @type {string | undefined} */ id) {
  if (id === "geranium")
    return `${POT}<g fill="#6f9a45"><circle cx="55" cy="80" r="4"/><circle cx="65" cy="79" r="4.4"/><circle cx="60" cy="82" r="3.6"/></g>
  <g fill="#d6453a"><circle cx="56" cy="72" r="2.4"/><circle cx="59" cy="70" r="2.4"/><circle cx="57.5" cy="68" r="2"/><circle cx="64" cy="70" r="2.4"/><circle cx="66.5" cy="72" r="2"/><circle cx="65" cy="67.5" r="2"/></g>
  <g fill="#f08a7a"><circle cx="57.6" cy="70.4" r=".9"/><circle cx="65.2" cy="70" r=".9"/></g>`;
  if (id === "herbs")
    return [
      [48, "#6f9a45", "M0 0 Q-3 -8 -5 -11 M0 0 Q1 -9 4 -12 M0 0 V-12"],
      [60, "#4f7f3a", "M0 0 Q-4 -5 -6 -6 M0 0 Q4 -5 6 -6 M0 0 Q-2 -9 -3 -10 M0 0 Q2 -9 3 -10"],
      [72, "#88a85c", "M0 0 Q-2 -6 -4 -9 M0 0 Q3 -6 5 -8 M0 0 V-10"],
    ]
      .map(
        ([x, c, d]) =>
          `<path d="M${Number(x) - 4.5} 96 L${Number(x) - 3.5} 89 H${Number(x) + 3.5} L${Number(x) + 4.5} 96Z" fill="#c7764a"/><rect x="${Number(x) - 4.5}" y="88" width="9" height="2.2" rx=".8" fill="#a65c34"/>
    <g transform="translate(${x} 88)" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="${d}"/></g>`,
      )
      .join("");
  if (id === "lemon")
    return `${POT}<path d="M60 84 V70" stroke="#7d5435" stroke-width="1.6"/>
  <g fill="#5e8f4c"><circle cx="60" cy="64" r="8"/><circle cx="54" cy="68" r="5"/><circle cx="66" cy="68" r="5"/></g>
  <g fill="#6f9a45"><circle cx="58" cy="61" r="3"/><circle cx="64" cy="65" r="2.6"/></g>
  <g fill="#f4d13d" stroke="#d9ac24" stroke-width=".5"><ellipse cx="55" cy="69" rx="2" ry="2.5"/><ellipse cx="63" cy="62" rx="2" ry="2.5"/><ellipse cx="66" cy="70" rx="2" ry="2.5"/></g>`;
  if (id === "cat")
    return `<path d="M70 92 Q78 90 74 84 Q72 82 70 85" stroke="#c97a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="60" cy="90" rx="13" ry="6.5" fill="#e0944e"/><path d="M50 88 Q56 84 64 86" stroke="#c97a3a" stroke-width="1.4" fill="none"/>
  <path d="M60 92 Q66 90 70 92" stroke="#c97a3a" stroke-width="1.2" fill="none"/>
  <circle cx="49" cy="88" r="6" fill="#e0944e"/><path d="M44 85 L45 79 L49 83Z M50 83 L54 79 L54.5 85Z" fill="#e0944e"/><path d="M45.5 83 L46 81 L47.5 83Z" fill="#f2b8a0"/>
  <path d="M45.5 88 q1.5 1.2 3 0 M50 88 q1.5 1.2 3 0" stroke="#5a3a24" stroke-width=".8" fill="none" stroke-linecap="round"/>
  <circle cx="49.3" cy="90.5" r=".7" fill="#c86a6a"/><ellipse cx="57" cy="95" rx="5" ry="1.6" fill="#e0944e"/>`;
  return `${POT}
  <g stroke="#6f9a45" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M60 84 Q59 74 55 68 M60 84 Q61 72 66 66 M60 84 V70"/></g>
  <g fill="#e3c75a"><circle cx="55" cy="68" r="1.6"/><circle cx="66" cy="66" r="1.6"/><circle cx="60" cy="69.5" r="1.4"/></g>`;
}

/**
 * The light in the shop at an hour: a CSS background (layered gradients) and
 * the blend it is laid on with, plus the wall's tone.
 * @returns {{ light: string, blend: string, wall: string }}
 */
export function lightAt(/** @type {number} */ hour) {
  const h = ((hour % 24) + 24) % 24;
  const dark = darkness(h);
  if (dark >= 0.999) {
    // Night: the window is dark; a lamp over the counter pools warm light.
    return {
      light:
        "radial-gradient(120% 70% at 50% 18%, rgba(255,196,112,.5), rgba(255,196,112,.1) 50%, rgba(40,48,90,.42) 100%)",
      blend: "soft-light",
      wall: "#efdfc6",
    };
  }
  // Day: a beam slanting in from the window at the upper left, steeper at
  // noon, longer and more golden towards dawn and dusk.
  const t = Math.max(0, Math.min(1, (h - 6) / 14));
  const angle = 108 + t * 50;
  const gold = Math.min(1, Math.abs(t - 0.5) * 2.2);
  const c = mix("#fff4d6", "#ffb35a", gold * gold);
  const r = parseInt(c.slice(1, 3), 16),
    g = parseInt(c.slice(3, 5), 16),
    b = parseInt(c.slice(5, 7), 16);
  const a = (0.55 + gold * 0.2) * (1 - dark);
  const rgba = (/** @type {number} */ k) => `rgba(${r},${g},${b},${(a * k).toFixed(3)})`;
  const dusk =
    dark > 0
      ? `, linear-gradient(rgba(40,48,90,${(dark * 0.34).toFixed(3)}), rgba(40,48,90,${(dark * 0.34).toFixed(3)}))`
      : "";
  return {
    light: `linear-gradient(${angle.toFixed(0)}deg, transparent 8%, ${rgba(1)} 16%, ${rgba(0.8)} 34%, transparent 46%, ${rgba(0.5)} 54%, transparent 64%)${dusk}`,
    blend: "soft-light",
    wall: mix("#f6ead8", "#f3dfc0", gold * 0.6),
  };
}

let painted = "";

/**
 * Hang the window and the light for the shop's hour on `root` as CSS vars,
 * with the shop's decor (core decorLook): its curtains and sill piece in the
 * window, its jar dressing on every jar, and the rest through applyDecor.
 */
export function paintScene(/** @type {HTMLElement} */ root, /** @type {any} */ s) {
  const hour = Math.round(sceneHour(s) * 4) / 4;
  const look = decorLook(s);
  dressJars(look.jars);
  applyDecor(root, look, darkness(hour) >= 0.999);
  const key = `${hour}${look.curtains}${look.sill}`;
  if (key === painted && root.style.getPropertyValue("--window")) return;
  painted = key;
  const l = lightAt(hour);
  root.style.setProperty(
    "--window",
    `url("data:image/svg+xml,${encodeURIComponent(windowArt(hour, look))}")`,
  );
  root.style.setProperty("--light", l.light);
  root.style.setProperty("--light-blend", l.blend);
  root.style.setProperty("--wall", l.wall);
  root.dataset.light = darkness(hour) >= 0.999 ? "night" : darkness(hour) > 0 ? "dusk" : "day";
}
