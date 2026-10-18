// @ts-check
/**
 * The intro scene: a few pictures with a line each (content/tutorial.js
 * INTRO), shown over everything when a new shop starts (and again when the
 * tips are replayed). Skippable from the first picture. Finishing or
 * skipping it dispatches { type: "tutorial", do: "begin" }, and the first
 * day's notes take over (ui/tutorial.js).
 *
 * The pictures are drawn here from the shop's own art: the sky and window
 * of ui/art/scene.js at dawn, the keeper's jars from ui/art/jar.js.
 * Screen-only state: ui.intro = { beat } while it shows.
 */

import { INTRO, KEEPER } from "../content/tutorial.js";
import { START_GIFT } from "../content/tuning.js";
import { RECIPES } from "../content/recipes.js";
import { skyAt, windowArt, lightAt } from "./art/scene.js";
import { jarSvg, emptyJarSvg } from "./art/jar.js";
import { patch } from "./dom.js";

/** Put a standalone <svg> inside another at x, y, w × h. */
const place = (/** @type {string} */ svg, x, y, w, h) =>
  svg.replace(/^<svg\b/, `<svg x="${x}" y="${y}" width="${w}" height="${h}"`);

/** The keeper's parting jars, as they sit on the shelf on the first morning. */
const giftJars = () =>
  START_GIFT.map(([slot, recipe, f]) =>
    jarSvg({
      id: 700 + slot,
      recipe,
      age: f * RECIPES[recipe].hours,
      servings: 2,
      size: 2,
    }),
  );

/** Brine Lane at first light: the shop with its sign, awning and empty window. */
function street() {
  const [top, low] = skyAt(6.6);
  const [a, b] = giftJars();
  return `<svg viewBox="0 0 320 240" class="intro-art" aria-hidden="true">
  <defs><linearGradient id="in-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient>
  <linearGradient id="in-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b4e5c"/><stop offset="1" stop-color="#2e3040"/></linearGradient>
  <radialGradient id="in-lamp"><stop offset="0" stop-color="#ffd58a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd58a" stop-opacity="0"/></radialGradient></defs>
  <rect width="320" height="240" fill="url(#in-sky)"/>
  <circle cx="34" cy="96" r="16" fill="#ffe3b0" opacity=".55"/><circle cx="34" cy="96" r="8" fill="#fff1d2"/>
  <path d="M0 120 V70 L18 58 L36 70 V62 H58 V120 Z" fill="#a9927e"/>
  <path d="M262 120 V60 H282 V50 L300 40 L320 52 V120 Z" fill="#a9927e"/>
  <rect x="0" y="92" width="52" height="128" fill="#cdb497"/><rect x="268" y="84" width="52" height="136" fill="#c4a98c"/>
  <rect x="10" y="108" width="14" height="18" fill="#8d7560"/><rect x="284" y="104" width="14" height="18" fill="#8d7560"/>
  <path d="M46 46 L160 18 L274 46 Z" fill="#8f6440"/><rect x="50" y="44" width="220" height="176" fill="#ead7b8"/>
  <rect x="50" y="44" width="220" height="5" fill="#d8c19c"/>
  <rect x="130" y="56" width="60" height="28" rx="2" fill="#5b5f70"/><path d="M160 56 V84" stroke="#ead7b8" stroke-width="3"/>
  <rect x="126" y="84" width="68" height="7" rx="2" fill="#a65c34"/>
  <g fill="#e3c75a"><circle cx="134" cy="83" r="2.5"/><circle cx="146" cy="82" r="2.5"/><circle cx="174" cy="83" r="2.5"/><circle cx="186" cy="82" r="2.5"/></g>
  <g fill="#6f9a45"><circle cx="140" cy="84" r="2.4"/><circle cx="160" cy="83" r="2.6"/><circle cx="180" cy="84" r="2.4"/></g>
  <rect x="74" y="98" width="172" height="26" rx="3" fill="#3f5a3a"/><rect x="77" y="101" width="166" height="20" rx="2" fill="none" stroke="#d9c48f" stroke-width="1"/>
  <text x="160" y="116.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="14" font-style="italic" fill="#f3e6c4" letter-spacing=".5">The Brine Nook</text>
  <path d="M62 128 H258 V138 ${Array.from({ length: 14 }, (_, i) => `Q${251 - i * 14} 146 ${244 - i * 14} 138`).join(" ")} Z" fill="#f1e6cc"/>
  ${Array.from({ length: 7 }, (_, i) => `<path d="M${62 + i * 28} 128 H${76 + i * 28} V138 Q${69 + i * 28} 146 ${62 + i * 28} 138 Z" fill="#6f8f5a"/>`).join("")}
  <rect x="74" y="150" width="112" height="62" fill="url(#in-glass)" stroke="#7d5435" stroke-width="4"/>
  <path d="M80 172 H180 M80 192 H180" stroke="#6d6458" stroke-width="2"/>
  ${place(a, 84, 156, 15, 17)}${place(b, 100, 156, 15, 17)}
  <path d="M82 206 L104 154 M98 206 L118 156" stroke="#fff" stroke-width="3" opacity=".08"/>
  <rect x="198" y="146" width="48" height="74" fill="#7d5435"/><rect x="204" y="152" width="36" height="28" fill="#4b4e5c"/>
  <rect x="204" y="186" width="36" height="28" fill="none" stroke="#6a4529" stroke-width="2"/><circle cx="238" cy="194" r="2" fill="#e0b44a"/>
  <path d="M214 156 L222 150 L230 156" stroke="#d8c7a8" stroke-width="1" fill="none"/>
  <rect x="210" y="156" width="24" height="12" rx="1.5" fill="#f3e6c4"/><text x="222" y="165" text-anchor="middle" font-family="Georgia, serif" font-size="6.5" fill="#4a3524">Closed</text>
  <rect x="0" y="218" width="320" height="22" fill="#9c8b7a"/>
  <g stroke="#867565" stroke-width="1">${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 21 + (i % 2) * 6} 222 h14 M${i * 21 + 9} 231 h14"/>`).join("")}</g>
  <rect x="284" y="150" width="4" height="70" fill="#3d3a3a"/><path d="M276 150 h20 l-3 -14 h-14 Z" fill="#3d3a3a"/>
  <circle cx="286" cy="144" r="18" fill="url(#in-lamp)"/><rect x="281" y="138" width="10" height="9" fill="#ffd58a"/>
</svg>`;
}

/** The keeper's note on the counter: a key, a letter and the two jars. */
function letter() {
  const [a, b] = giftJars();
  return `<svg viewBox="0 0 320 240" class="intro-art" aria-hidden="true">
  <rect width="320" height="240" fill="#b9875a"/>
  <g stroke="#a5764b" stroke-width="2">${[40, 92, 146, 198].map((y) => `<path d="M0 ${y} H320"/>`).join("")}</g>
  <g stroke="#cf9d6e" stroke-width="1" opacity=".5">${[18, 64, 120, 172, 224].map((y) => `<path d="M${(y * 7) % 80} ${y} q60 -4 120 0"/>`).join("")}</g>
  <ellipse cx="236" cy="196" rx="70" ry="10" fill="#7a5233" opacity=".35"/>
  <g transform="rotate(-5 120 120)">
    <rect x="34" y="44" width="170" height="150" rx="3" fill="#f8efdc" stroke="#e1cfae"/>
    <path d="M34 84 H204" stroke="#efe2c7"/>
    <text font-family="Georgia, 'Times New Roman', serif" font-style="italic" fill="#4a3524" font-size="13">
      <tspan x="48" y="72">My dear,</tspan>
      <tspan x="48" y="104">Two jars on the shelf,</tspan>
      <tspan x="48" y="122">ripe and ready.</tspan>
      <tspan x="48" y="146">The rest is yours.</tspan>
      <tspan x="130" y="178">— ${KEEPER.name.split(" ")[0]}</tspan>
    </text>
  </g>
  <g transform="rotate(24 92 210)">
    <circle cx="70" cy="210" r="11" fill="none" stroke="#d6a744" stroke-width="5"/>
    <path d="M81 210 H122 M112 210 V219 M119 210 V217" stroke="#d6a744" stroke-width="5" stroke-linecap="round"/>
  </g>
  ${place(a, 196, 116, 56, 82)}${place(b, 244, 116, 56, 82)}
</svg>`;
}

/** Inside at dawn: the window, the light, the bare shelves and the two jars. */
function inside() {
  const l = lightAt(7);
  const [a, b] = giftJars();
  const plank = (y) =>
    `<rect x="120" y="${y}" width="190" height="8" rx="2" fill="#b9875a"/><rect x="120" y="${y + 8}" width="190" height="3" fill="#8f6440"/>`;
  const empties = (y, from) =>
    [0, 1, 2]
      .slice(from)
      .map((k) => place(emptyJarSvg, 128 + k * 62, y - 50, 44, 50))
      .join("");
  return `<svg viewBox="0 0 320 240" class="intro-art" aria-hidden="true">
  <defs><linearGradient id="in-beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2cf" stop-opacity=".55"/><stop offset="1" stop-color="#fff2cf" stop-opacity="0"/></linearGradient></defs>
  <rect width="320" height="240" fill="${l.wall}"/>
  <rect x="112" y="18" width="206" height="200" rx="4" fill="#ecd8ba"/>
  ${place(windowArt(7), 14, 26, 88, 124)}
  ${plank(74)}${plank(136)}${plank(198)}
  ${place(a, 128, 24, 44, 50)}${place(b, 190, 24, 44, 50)}${empties(74, 2)}
  ${empties(136, 0)}${empties(198, 0)}
  <path d="M60 30 L150 30 L320 240 L160 240 Z" fill="url(#in-beam)"/>
  <rect x="0" y="206" width="112" height="34" fill="#a5764b"/><rect x="0" y="202" width="112" height="6" fill="#cf9d6e"/>
</svg>`;
}

const ART = { street, letter, inside };

export function mountIntro(parent) {
  const el = document.createElement("div");
  el.className = "intro";
  el.hidden = true;
  parent.appendChild(el);
  return { el };
}

export function renderIntro(view, ui) {
  const t = ui.s.tutorial;
  const show = t.on && t.intro;
  view.el.hidden = !show;
  if (!show) {
    ui.intro = null;
    return;
  }
  ui.intro ??= { beat: 0 };
  const i = Math.min(ui.intro.beat, INTRO.length - 1);
  const b = INTRO[i];
  patch(
    view.el,
    `<div class="intro-card" data-beat="${i}">
      <div class="intro-pic">${ART[b.art]()}</div>
      <p class="intro-text">${b.text}</p>
      <div class="intro-dots">${INTRO.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <div class="intro-btns">
      ${b.last ? "" : `<button class="intro-skip" data-act="intro-skip">Skip</button>`}
      <button class="main" data-act="intro-next">${b.last ?? "Next"}</button>
    </div>`,
  );
}

/**
 * Handle the intro's buttons. Returns false for anything else.
 * @param {string} act
 * @param {any} ui
 * @param {(action: any) => any} dispatch
 */
export function introAct(act, ui, dispatch) {
  if (act === "intro-next") {
    const beat = ui.intro?.beat ?? 0;
    if (beat + 1 < INTRO.length) ui.intro = { beat: beat + 1 };
    else dispatch({ type: "tutorial", do: "begin" });
    return true;
  }
  if (act === "intro-skip") {
    dispatch({ type: "tutorial", do: "begin" });
    return true;
  }
  return false;
}
