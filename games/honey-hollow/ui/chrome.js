// @ts-check
// Dresses the DOM in painted paper. The pieces are painted once by
// ui/art/chrome.js; this turns each into a data URL and hands it to
// ui/base.css as a custom property on :root:
//
//   --hh-paper          the paper tile the page, sheets and tab bar are cut from
//   --hh-img-<piece>    url(...) of any piece
//   --hh-bi-<piece>     a whole border-image value for a piece that stretches
//                       (corners fixed, middle repeated)
//
// Call installChrome() once at boot, before the first screen is shown (or
// hand chromeJobs() to paintAll() to spread the painting over a few frames).

import { url, img } from "./paint/sprite.js";
import { PIECE_NAMES, piece, paperTile } from "./art/chrome.js";
import { icon } from "./art/icons.js";

const pct = (n, of) => `${+((n / of) * 100).toFixed(3)}%`;
const px = (list) => list.map((n) => `${n}px`).join(" ");

// border-image for a nine-slice: the caps are shown at their painted size,
// the paint that hangs outside the element (shadow, torn edge) is the outset,
// and the middle repeats a whole number of times instead of stretching.
function borderImage(p, src) {
  if (p.slice === "half") return `${src} 50% fill / 50% / ${px(p.out)} stretch`;
  const [t, r, b, l] = p.slice;
  const cut = [pct(t, p.h), pct(r, p.w), pct(b, p.h), pct(l, p.w)].join(" ");
  return `${src} ${cut} fill / ${px(p.slice)} / ${px(p.out)} ${p.stretch ? "stretch" : "round"}`;
}

/**
 * The same work as installChrome(), one piece at a time, for paintAll() in
 * ui/paint/sprite.js: a loading screen can then move while the interface is
 * painted. The last job hands everything to the stylesheet.
 * @param {Document} [doc]
 * @returns {(() => void)[]}
 */
export function chromeJobs(doc = document) {
  /** @type {string[]} */
  const vars = [];
  /** @type {(() => void)[]} */
  const jobs = [() => vars.push(`--hh-paper:url("${url(paperTile())}")`)];
  for (const name of PIECE_NAMES)
    jobs.push(() => {
      const p = piece(name);
      const src = `url("${url(p.sprite)}")`;
      vars.push(`--hh-img-${name}:${src}`);
      if (p.slice) vars.push(`--hh-bi-${name}:${borderImage(p, src)}`);
    });
  jobs.push(() => {
    let style = doc.getElementById("hh-chrome");
    if (!style) {
      style = doc.createElement("style");
      style.id = "hh-chrome";
      doc.head.append(style);
    }
    style.textContent = `:root{${vars.join(";")}}`;
    doc.documentElement.classList.add("hh-painted");
  });
  return jobs;
}

/**
 * Paint the interface and give it to the stylesheet, all at once. Safe to
 * call again (after a change of device pixel ratio, say). Returns the
 * milliseconds spent.
 * @param {Document} [doc]
 */
export function installChrome(doc = document) {
  const t0 = performance.now();
  for (const job of chromeJobs(doc)) job();
  return performance.now() - t0;
}

/** Resolves when Mali is ready to draw text with (never rejects). */
export function fontsReady(doc = document) {
  return Promise.all([doc.fonts.load('400 16px "Mali"'), doc.fonts.load('700 16px "Mali"')]).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * A painted sprite as an <img> for the DOM.
 * @param {import("./paint/sprite.js").Sprite} sprite
 * @param {number} [size] CSS px wide (default: as painted)
 * @param {string} [alt]  leave empty when the picture only decorates a label
 */
export function pic(sprite, size, alt = "") {
  const el = img(sprite, size ?? sprite.w, alt);
  el.className = "hh-pic";
  return el;
}

/** An interface icon as an <img class="hh-icon">, `size` px square. */
export function iconImg(name, size = 28, alt = "") {
  const el = img(icon(name), size, alt);
  el.className = "hh-icon";
  return el;
}
