// @ts-check
/**
 * The bloom strip: the 28 days of the year as one row in four season bands,
 * a flower's bloom window painted over them in the flower's colour, and a
 * pin on today. The bed sheet shows a full one, the seed tray a compact one
 * in every row, the calendar one for each flower.
 *
 *   import { bloomStrip, refreshBloomStrip, bloomStripReady } from "../bloom-strip.js";
 *
 *   await bloomStripReady;                    // its stylesheet, once (optional)
 *   const strip = bloomStrip(state, "lavender");                    // full
 *   const small = bloomStrip(state, "lavender", { compact: true }); // no season names
 *   refreshBloomStrip(strip, state);          // a day passed: move the pin
 *
 * `bloomStrip(state, flower, { compact }) → HTMLElement`. The element is as
 * wide as its container (give it a width, or let a block parent do so); the
 * full one is 34 px tall with the season names under it, the compact one
 * 14 px. It reads the window from the core (`bloomWindow`, with the keeper's
 * talent applied) and today from `calendarOf(state.clock.day)`. It is a
 * picture (role="img") with a sentence for a label; it takes no taps.
 *
 * `FLOWER_COLOR` is the palette name each flower's window is painted in.
 *
 * The bar is painted by the watercolour engine at the width it is shown at
 * (measured once it is laid out, and again if that width changes), so the
 * washes and pencil keep their true weight on every phone; one painting per
 * flower, window and width is kept. The pin is a DOM node, so moving it
 * costs nothing.
 */

import { app } from "./app.js";
import { el, css } from "./dom.js";
import { sprite, url } from "./paint/sprite.js";
import { wash, pencil, roundRect, resample } from "./paint/wash.js";
import { BLOOM, dayOf, daysBetween } from "./words/meadow-sheets.js";

/** Resolves when the strip's stylesheet has applied. */
export const bloomStripReady = css(new URL("./bloom-strip.css", import.meta.url));

/** Palette names (ui/paint/palette.js): the colour of the flower, not of its honey. */
export const FLOWER_COLOR = {
  dandelion: "dandelion",
  apple: "rose",
  clover: "clover",
  borage: "borage",
  lavender: "lavender",
  thyme: "heather",
  mint: "mint",
  sunflower: "sunflower",
  buckwheat: "terracotta",
  heather: "plum",
  ivy: "pine",
};

/** The four bands, spring first. */
const SEASON_COLOR = ["meadow", "butter", "apricot", "sky"];

const DAYS = 28;
const SEASON = 7;
/** The width painted where the shown width cannot be measured: ten px a day. */
const BASE_W = 280;

/** The painted bar for a flower's window, `W` px wide. */
function bar(flower, from, to, compact, W = BASE_W) {
  const h = compact ? 14 : 18;
  const DAY = W / DAYS;
  return sprite(
    `bloom-strip-${flower}-${from}-${to}-${compact ? "c" : "f"}-${W}`,
    W,
    h,
    (ctx, w, hh, r) => {
      for (let s = 0; s < 4; s++) {
        const band = resample(
          roundRect(s * SEASON * DAY + 1.5, 2.5, SEASON * DAY - 3, hh - 5, 5),
          6,
        );
        wash(ctx, band, SEASON_COLOR[s], { r, layers: 7, strength: 0.5, soft: 0.07, edge: 0.25 });
      }
      // A pencil tick between days, so a window can be counted.
      for (let d = 1; d < DAYS; d++) {
        if (d % SEASON === 0) continue;
        const x = d * DAY;
        pencil(
          ctx,
          [
            [x, hh - 5.5],
            [x, hh - 3],
          ],
          { r, alpha: 0.28, width: 0.7, passes: 1, wobble: 0.2, gaps: 0 },
        );
      }
      if (from === null || to === null || to < from) return;
      const shape = resample(
        roundRect(from * DAY + 1, 1, (to - from + 1) * DAY - 2, hh - 2, 5.5),
        5,
      );
      wash(ctx, shape, FLOWER_COLOR[flower] ?? "honey", {
        r,
        layers: 12,
        strength: 0.9,
        soft: 0.07,
        charge: { color: "white", n: 2, strength: 0.16 },
      });
      pencil(ctx, shape, { r, closed: true, alpha: 0.42, width: 0.8, gaps: 0.1 });
    },
    { ax: 0, ay: 0, grain: 0.7 },
  );
}

/** Paint a strip's bar `width` px wide (once per width). */
function paintBar(/** @type {HTMLElement} */ barEl, /** @type {number} */ width) {
  const strip = barEl.parentElement;
  if (!strip) return;
  const W = Math.max(56, Math.round(width / 2) * 2);
  if (barEl.dataset.w === String(W)) return;
  barEl.dataset.w = String(W);
  const { flower, from, to } = strip.dataset;
  const painted = bar(
    flower,
    from === "" ? null : Number(from),
    to === "" ? null : Number(to),
    strip.classList.contains("hh-bloom--compact"),
    W,
  );
  barEl.style.backgroundImage = `url(${url(painted)})`;
}

/** Paints each bar when it is first laid out, and again if its width changes. */
const fit =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((entries) => {
        for (const e of entries) {
          if (e.contentRect.width >= 40)
            paintBar(/** @type {HTMLElement} */ (e.target), e.contentRect.width);
        }
      });

/**
 * @param {import("../core/types.js").State} state
 * @param {string} flower a flower id
 * @param {{ compact?: boolean }} [opts]
 * @returns {HTMLElement}
 */
export function bloomStrip(state, flower, opts = {}) {
  const C = app.core;
  const compact = !!opts.compact;
  const win = C.bloomWindow(state, flower);
  const from = win ? win.from : null;
  const to = win ? win.to : null;

  const pin = el("span.hh-bloom__today", { "aria-hidden": "true" });
  const barEl = el("div.hh-bloom__bar", null, pin);
  const strip = el(
    "div.hh-bloom",
    {
      class: compact ? "hh-bloom--compact" : null,
      role: "img",
      dataset: { flower, from: from ?? "", to: to ?? "" },
    },
    [
      barEl,
      !compact &&
        el(
          "div.hh-bloom__seasons",
          { "aria-hidden": "true" },
          BLOOM.seasons.map((name) => el("span", { text: name })),
        ),
    ],
  );
  if (fit) fit.observe(barEl);
  else paintBar(barEl, BASE_W);
  refreshBloomStrip(strip, state);
  return strip;
}

/**
 * Move the pin to today and bring the label up to date. Cheap; call it from
 * a screen's `update`.
 * @param {HTMLElement} strip an element `bloomStrip` made
 * @param {import("../core/types.js").State} state
 */
export function refreshBloomStrip(strip, state) {
  const C = app.core;
  const cal = C.calendarOf(state.clock.day);
  const key = String(cal.doy);
  if (strip.dataset.today === key) return;
  strip.dataset.today = key;
  const pin = /** @type {HTMLElement | null} */ (strip.querySelector(".hh-bloom__today"));
  if (pin) pin.style.left = `${((cal.doy + 0.5) / DAYS) * 100}%`;
  const { flower, from, to } = strip.dataset;
  const name = C.FLOWERS[flower]?.name ?? "";
  if (from === "" || to === "") {
    strip.setAttribute("aria-label", name);
    return;
  }
  // Day of the year n is day n + 1 of the first year.
  const range = daysBetween(C.calendarOf(Number(from) + 1), C.calendarOf(Number(to) + 1));
  strip.setAttribute("aria-label", BLOOM.label(name, range, dayOf(cal)));
}

/** "summer day 1 to day 6" for a flower, in this keeper's hands; "" if it never blooms. */
export function bloomRange(state, flower) {
  const C = app.core;
  const win = C.bloomWindow(state, flower);
  if (!win) return "";
  return daysBetween(C.calendarOf(win.from + 1), C.calendarOf(win.to + 1));
}
