// @ts-check
/**
 * The end of the first month: a few pictures with a line each (content/
 * ending.js SCENE), then a credit roll, over everything on the morning after
 * day 30 (core/ending.js endingDue). "Keep the shop open" at the end of the
 * roll dispatches { type: "ending", do: "seen" } and the shop carries on.
 * Skippable from the first picture, straight to the roll.
 *
 * The pictures reuse the shop's own art: Brine Lane from the intro at dusk,
 * with the player's jars in the window; Agnes's letter naming the regular who
 * came most; the month's book with the shop's numbers. The roll shows the
 * regulars' faces. It scrolls itself (calm motion: the player scrolls), and
 * a thumb on it holds it for a moment.
 *
 * Between the pictures and the roll, the keeper signs the shop's book with
 * three letters picked on arcade-style wheels, then sees this phone's board
 * of best first months (ui/scores.js) with their shop lit up.
 *
 * Screen-only state: ui.ending = { beat, letters, replay? } while it shows.
 * beat: a picture (0..SCENE.length-1), the book (SIGN_BEAT) or the roll.
 * letters: the initials being picked. replay is watching it again from the
 * settings; that only closes the screen.
 */

import {
  SCENE,
  LETTER,
  NO_REGULAR,
  CREDITS,
  THANKS,
  CARRY_ON,
  SIGN,
  LETTERS,
} from "../content/ending.js";
import { REGULARS } from "../content/regulars.js";
import { endingDue, monthOf, onTime } from "../core/index.js";
import { scores, addScore, lastInitials, scoreTable } from "./scores.js";
import { street } from "./intro.js";
import { jarSvg } from "./art/jar.js";
import { faceSvg } from "./art/customer.js";
import { calmMotion } from "./settings.js";
import { patch } from "./dom.js";

/** @typedef {import("../core/types.js").State} State */
/** @typedef {ReturnType<typeof monthOf>} Month */

const esc = (/** @type {string} */ t) =>
  String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** A line with the month's {words} filled in. */
const fill = (/** @type {string} */ text, /** @type {Record<string, any>} */ m) =>
  text.replace(/\{(\w+)\}/g, (_, k) => esc(String(m[k] ?? "")));

/** Brine Lane at dusk, the lamps lit and the window full of the player's own jars. */
function dusk(/** @type {State} */ s) {
  const jars = s.shelf.slots.filter(Boolean).map((j) => jarSvg(/** @type {any} */ (j)));
  return street({ hour: 19.7, jars, sign: "Open", lit: true, ids: "end" });
}

/** Agnes's letter on the counter, with its envelope and stamp. */
function letter(/** @type {State} */ s, /** @type {Month} */ m) {
  const fav = m.regulars[0];
  const lines = fav
    ? LETTER.lines.map((l) => fill(l, { regular: REGULARS[fav].name }))
    : NO_REGULAR.map(esc);
  return `<svg viewBox="0 0 320 240" class="intro-art" aria-hidden="true">
  <rect width="320" height="240" fill="#b9875a"/>
  <g stroke="#a5764b" stroke-width="2">${[40, 92, 146, 198].map((y) => `<path d="M0 ${y} H320"/>`).join("")}</g>
  <g transform="rotate(8 250 120)">
    <rect x="196" y="62" width="112" height="76" rx="3" fill="#efe0c2" stroke="#d6c29e"/>
    <path d="M196 62 L252 104 L308 62" fill="none" stroke="#d6c29e" stroke-width="1.5"/>
    <rect x="276" y="68" width="24" height="28" fill="#c95b4a"/><rect x="279" y="71" width="18" height="22" fill="#f6e7c8"/>
    <path d="M283 76 h10 v14 h-10 Z" fill="#9db96a"/><rect x="282" y="74" width="12" height="3" fill="#a65c34"/>
  </g>
  <ellipse cx="128" cy="222" rx="96" ry="8" fill="#7a5233" opacity=".35"/>
  <g transform="rotate(-4 120 128)">
    <rect x="32" y="30" width="180" height="190" rx="3" fill="#f8efdc" stroke="#e1cfae"/>
    <text font-family="Georgia, 'Times New Roman', serif" font-style="italic" fill="#4a3524" font-size="13">
      <tspan x="48" y="60">${esc(LETTER.hello)}</tspan>
      ${lines.map((l, i) => `<tspan x="48" y="${88 + i * 20}">${l}</tspan>`).join("")}
      <tspan x="130" y="204">${esc(LETTER.sign)}</tspan>
    </text>
  </g>
</svg>`;
}

/** The shop's book, open at the month's last page. */
function ledger(/** @type {State} */ s, /** @type {Month} */ m) {
  const rows = [
    ["Portions sold", m.served],
    ["Coins taken", m.earned],
    ["Customers delighted", m.delight],
    ["Orders handed over", m.orders],
    ["Best day's takings", m.bestDay],
    ["Regulars", m.regulars.length],
    ["Recipes on the menu", m.recipes],
  ];
  return `<svg viewBox="0 0 320 240" class="intro-art" aria-hidden="true">
  <rect width="320" height="240" fill="#6d4a2e"/>
  <path d="M14 18 Q160 6 306 18 V226 Q160 214 14 226 Z" fill="#3f5a3a"/>
  <path d="M22 20 Q90 12 160 22 V222 Q90 212 22 220 Z" fill="#f6ecd6"/>
  <path d="M160 22 Q230 12 298 20 V220 Q230 212 160 222 Z" fill="#f3e6cc"/>
  <path d="M160 22 V222" stroke="#d8c7a8" stroke-width="2"/>
  <g stroke="#e3d3b4" stroke-width="1">${Array.from({ length: 9 }, (_, i) => `<path d="M32 ${62 + i * 18} H150 M170 ${62 + i * 18} H288"/>`).join("")}</g>
  <path d="M138 36 V214" stroke="#e8b7a8" stroke-width="1"/>
  <text font-family="Georgia, 'Times New Roman', serif" fill="#4a3524">
    <tspan x="34" y="48" font-size="12" font-style="italic">Days 1 to ${m.days}</tspan>
    ${rows
      .slice(0, 4)
      .map(
        ([k, v], i) =>
          `<tspan x="34" y="${76 + i * 36}" font-size="10">${k}</tspan><tspan x="134" y="${92 + i * 36}" font-size="14" text-anchor="end" font-style="italic">${v}</tspan>`,
      )
      .join("")}
    ${rows
      .slice(4)
      .map(
        ([k, v], i) =>
          `<tspan x="172" y="${76 + i * 36}" font-size="10">${k}</tspan><tspan x="284" y="${92 + i * 36}" font-size="14" text-anchor="end" font-style="italic">${v}</tspan>`,
      )
      .join("")}
    <tspan x="228" y="196" font-size="11" font-style="italic" text-anchor="middle">${esc(m.tier)}</tspan>
  </text>
  <g transform="translate(236 40) rotate(-80)">
    <path d="M0 0 V34" stroke="#6f8f5a" stroke-width="1.5"/>
    ${[4, 10, 16, 22, 28].map((y) => `<path d="M0 ${y} l-8 -6 M0 ${y} l8 -6" stroke="#7fa063" stroke-width="1.2"/>`).join("")}
  </g>
</svg>`;
}

const ART = { dusk, letter, ledger };

/** The credit roll: the cast, the regulars' faces, the makers, the thanks. */
function roll(/** @type {State} */ s, /** @type {Month} */ m) {
  const rows = CREDITS.map((c) => {
    if (c.regulars) {
      const faces = m.regulars
        .map(
          (id) =>
            `<figure class="end-face">${faceSvg(REGULARS[id].look, "delight")}<figcaption>${esc(REGULARS[id].name)}</figcaption></figure>`,
        )
        .join("");
      return `<section><h3>${esc(c.role)}</h3>${faces ? `<div class="end-faces">${faces}</div>` : ""}<p class="end-crowd">${esc(c.crowd ?? "")}</p></section>`;
    }
    const names = c.keeper && s.ending.name ? [s.ending.name] : (c.names ?? []);
    return `<section><h3>${esc(c.role)}</h3>${names.map((n) => `<p>${esc(n)}</p>`).join("")}</section>`;
  }).join("");
  return `<div class="end-roll"><div class="end-roll-in">
    <h2 class="end-title">The Brine Nook</h2>
    ${rows}
    <p class="end-thanks">${esc(THANKS)}</p>
  </div></div>`;
}

export function mountEnding(parent) {
  const el = document.createElement("div");
  el.className = "ending";
  el.hidden = true;
  parent.appendChild(el);
  // A thumb on the roll holds it for a moment, and it carries on from where the thumb left it.
  const view = { el, held: 0, pos: 0, last: 0, raf: 0 };
  const hold = (/** @type {Event} */ e) =>
    /** @type {HTMLElement} */ (e.target).closest?.(".end-roll") && (view.held = performance.now());
  el.addEventListener("touchstart", hold, { passive: true });
  el.addEventListener("wheel", hold, { passive: true });
  el.addEventListener("pointerdown", hold);
  return view;
}

/** Scroll the roll on by itself, a little each frame, while it shows. */
function rollOn(view) {
  if (view.raf) return;
  view.last = performance.now();
  view.pos = 0;
  const tick = (now) => {
    const box = /** @type {HTMLElement | null} */ (view.el.querySelector(".end-roll"));
    if (!box || view.el.hidden) {
      view.raf = 0;
      return;
    }
    const dt = Math.min(0.1, (now - view.last) / 1000);
    view.last = now;
    // The player moved it: carry on from there.
    if (Math.abs(box.scrollTop - Math.round(view.pos)) > 2) view.pos = box.scrollTop;
    if (!calmMotion() && now - view.held > 1500) {
      view.pos = Math.min(view.pos + 34 * dt, box.scrollHeight - box.clientHeight);
      box.scrollTop = Math.round(view.pos);
    }
    view.raf = requestAnimationFrame(tick);
  };
  view.raf = requestAnimationFrame(tick);
}

const SIGN_BEAT = SCENE.length;
const ROLL_BEAT = SCENE.length + 1;

/** The shop's book: three letter wheels to sign with, then the board. */
function book(/** @type {State} */ s, /** @type {any} */ st) {
  if (!s.ending.name) {
    const wheels = [...st.letters]
      .map(
        (c, i) => `<div class="wheel">
          <button data-act="end-up" data-i="${i}" aria-label="Letter ${i + 1} up">▲</button>
          <b class="wheel-letter" data-i="${i}">${c}</b>
          <button data-act="end-down" data-i="${i}" aria-label="Letter ${i + 1} down">▼</button>
        </div>`,
      )
      .join("");
    return `<div class="end-book">
        <h2>${SIGN.title}</h2>
        <p>${SIGN.text}</p>
        <div class="wheels">${wheels}</div>
      </div>
      <div class="intro-btns"><button class="main" data-act="end-sign">${SIGN.button}</button></div>`;
  }
  return `<div class="end-book">
      <h2>${SIGN.board}</h2>
      ${scoreTable(scores(), s.meta.seed)}
      ${onTime(s) || st.replay ? "" : `<p class="hiscore-late">${SIGN.late}</p>`}
    </div>
    <div class="intro-btns"><button class="main" data-act="end-next">Next</button></div>`;
}

export function renderEnding(view, ui) {
  const s = ui.s;
  const show = endingDue(s) || !!ui.ending?.replay;
  view.el.hidden = !show;
  if (!show) {
    ui.ending = null;
    patch(view.el, "");
    return;
  }
  ui.ending ??= { beat: 0, letters: lastInitials() };
  const m = monthOf(s);
  const i = Math.min(ui.ending.beat, ROLL_BEAT);
  if (i === ROLL_BEAT) {
    patch(
      view.el,
      `${roll(s, m)}
      <div class="intro-btns"><button class="main" data-act="end-done">${esc(CARRY_ON)}</button></div>`,
    );
    rollOn(view);
    return;
  }
  if (i === SIGN_BEAT) {
    patch(view.el, book(s, ui.ending));
    return;
  }
  const b = SCENE[i];
  patch(
    view.el,
    `<div class="intro-card" data-beat="${i}">
      <div class="intro-pic">${ART[b.art](s, m)}</div>
      <p class="intro-text">${fill(b.text, m)}</p>
      <div class="intro-dots">${SCENE.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <div class="intro-btns">
      <button class="intro-skip" data-act="end-skip">Skip</button>
      <button class="main" data-act="end-next">Next</button>
    </div>`,
  );
}

/** The next beat: a replay of a shop that never signed passes the book by. */
const after = (ui, beat) =>
  beat === SIGN_BEAT && ui.ending.replay && !ui.s.ending.name ? ROLL_BEAT : beat;

/**
 * Handle the ending's buttons. Returns false for anything else.
 * @param {string} act
 * @param {HTMLElement} t
 * @param {any} ui
 * @param {(action: any) => any} dispatch
 */
export function endingAct(act, t, ui, dispatch) {
  if (!ui.ending) return false;
  if (act === "end-next") {
    ui.ending = { ...ui.ending, beat: after(ui, ui.ending.beat + 1) };
    return true;
  }
  if (act === "end-skip") {
    // Past the pictures, but the book still wants signing.
    ui.ending = { ...ui.ending, beat: after(ui, SIGN_BEAT) };
    return true;
  }
  if (act === "end-up" || act === "end-down") {
    const k = Number(t.dataset.i);
    const letters = [...ui.ending.letters];
    const at = LETTERS.indexOf(letters[k]);
    letters[k] = LETTERS[(at + (act === "end-up" ? -1 : 1) + LETTERS.length) % LETTERS.length];
    ui.ending = { ...ui.ending, letters: letters.join("") };
    return true;
  }
  if (act === "end-sign") {
    const s = ui.s;
    const name = ui.ending.letters;
    const events = dispatch({ type: "ending", do: "sign", name });
    if (events[0]?.type === "signed" && events[0].onTime)
      addScore({
        name,
        coins: s.progress.stats.earned,
        served: s.progress.stats.served,
        shop: s.meta.seed,
        at: Date.now(),
      });
    return true;
  }
  if (act === "end-done") {
    if (endingDue(ui.s)) dispatch({ type: "ending", do: "seen" });
    ui.ending = null;
    return true;
  }
  return false;
}

/** Watch it all again (the settings sheet). */
export function replayEnding(ui) {
  ui.ending = { beat: 0, letters: lastInitials(), replay: true };
}
