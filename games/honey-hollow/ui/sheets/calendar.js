// @ts-check
/**
 * The calendar: `app.sheet("calendar", { flower? })`. The planning tool.
 *
 * The year as 28 columns in four painted season bands. One row per flower:
 * the ones the keeper has first, then (faint, with a lock) the ones still to
 * find. A row is the flower's picture, its bloom window as a painted bar in
 * the flower's own colour (the core's `bloomWindow`, so the keeper's talent
 * counts) and its name beside the bar, on whichever side has the room.
 * Today is a pin through every row; the Honey Show and the Winter Fair are
 * dotted lines with their pictures above.
 *
 * Tapping a row opens a card under it: when and where the flower grows, its
 * nectar, its honey (jar, tastes, today's price by stars) and what flowers
 * beside it. While a card is open its window is lit down the whole grid, so
 * the overlaps can be seen as well as read. `params.flower` opens that card.
 *
 * Built once; `update` patches. The rows are rebuilt only when the list of
 * flowers the keeper knows (or a bloom window) changes.
 */

import { app } from "../app.js";
import { el, css, frame } from "../dom.js";
import { sprite, url, img } from "../paint/sprite.js";
import { wash, pencil, roundRect, resample } from "../paint/wash.js";
import { bed as bedArt, PAINTED } from "../art/flowers.js";
import { tree as treeArt } from "../art/scenery.js";
import { jar } from "../art/jars.js";
import { ribbon, good } from "../art/goods.js";
import { icon } from "../art/icons.js";
import { weather as weatherArt } from "../art/sky.js";
import { FLOWER_COLOR, bloomRange } from "../bloom-strip.js";
import { dayLabel, yearLabel, seasonName } from "../words.js";
import { tastes } from "../words/meadow-sheets.js";
import { CALENDAR as W, WEATHER_WORDS } from "../words/planning.js";

const styled = css(new URL("./calendar.css", import.meta.url));

export const title = W.title;

/** Painted px per day in the bar and band sprites; the page stretches them to fit. */
const COL = 10;
const SEASON_WASH = ["meadow", "butter", "apricot", "sky"];
const SEASON_ICON = ["spring", "summer", "autumn", "winter"];

/** @param {any} s @param {number} width */
const pic = (s, width, alt = "") => {
  const p = img(s, width, alt);
  p.className = "hh-pic";
  return p;
};
/** A picture by its height. @param {any} s @param {number} height */
const tall = (s, height, alt = "") => pic(s, (height * s.w) / s.h, alt);
/** @param {string} name @param {number} size */
const iconImg = (name, size) => {
  const p = img(icon(name), size);
  p.className = "hh-icon";
  return p;
};
/** @param {Element} node @param {string} s */
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
/** @param {HTMLElement} node @param {any} on */
const show = (node, on) => {
  if (node.hidden === !!on) node.hidden = !on;
};

/** The four season bands, with a pencil line between days. Painted once, stretched to the grid. */
function bandsArt(days, season) {
  const h = 200;
  return sprite(
    `cal-bands-${days}-${season}`,
    days * COL,
    h,
    (ctx, w, hh, r) => {
      const n = Math.round(days / season);
      for (let s = 0; s < n; s++) {
        // Taller than the picture, so only the ragged sides of each band show.
        const band = resample(
          roundRect(s * season * COL + 1.5, -14, season * COL - 3, hh + 28, 6),
          8,
        );
        wash(ctx, band, SEASON_WASH[s % 4], {
          r,
          layers: 9,
          strength: 0.46,
          soft: 0.08,
          edge: 0.22,
          charge: { color: "white", n: 4, strength: 0.22 },
        });
      }
      for (let d = 1; d < days; d++) {
        if (d % season === 0) continue;
        const line = [];
        for (let y = 0; y <= hh; y += 25) line.push([d * COL, y]);
        pencil(ctx, line, { r, alpha: 0.13, width: 0.6, passes: 1, wobble: 0.25, gaps: 0 });
      }
    },
    { ax: 0, ay: 0, grain: 0.7 },
  );
}

/** A flower's bloom window as one painted bar, `days` long. */
function barArt(flower, days) {
  return sprite(
    `cal-bar-${flower}-${days}`,
    days * COL,
    24,
    (ctx, w, h, r) => {
      const shape = resample(roundRect(1.5, 2.5, w - 3, h - 5, 8), 5);
      wash(ctx, shape, FLOWER_COLOR[flower] ?? "honey", {
        r,
        layers: 12,
        strength: 0.9,
        soft: 0.07,
        charge: { color: "white", n: 2, strength: 0.18 },
      });
      pencil(ctx, shape, { r, closed: true, alpha: 0.45, width: 0.8, gaps: 0.1 });
    },
    { ax: 0, ay: 0, grain: 0.7 },
  );
}

/** The picture that stands for a flower: its bed in bloom, or the apple tree. */
function flowerArt(flower) {
  if (flower === "apple") return treeArt("bloom", 0);
  if (PAINTED.includes(flower)) return bedArt(flower, "bloom", 0);
  return icon("plant");
}

/** A weather picture, or nothing for a kind the painters do not know. */
function weatherPic(kind, size) {
  try {
    return pic(weatherArt(/** @type {any} */ (kind)), size);
  } catch {
    return null;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ flower?: string }} [params]
 */
export async function mount(root, params) {
  await styled;
  const C = app.core;
  const YEAR = C.TUNING.YEAR_DAYS;
  const SEASON = C.TUNING.SEASON_DAYS;
  const pct = (/** @type {number} */ n) => `${+((n / YEAR) * 100).toFixed(3)}%`;
  root.classList.add("hh-cal");

  /** The flower whose card is open. @type {string | null} */
  let sel =
    typeof params?.flower === "string" && Object.hasOwn(C.FLOWERS, params.flower)
      ? params.flower
      : null;

  // ---------- today ----------

  const tile = (/** @type {string} */ label) => {
    const holder = el("span.hh-cal__wxpic");
    const name = el("b", { text: label });
    const line = el("span");
    const node = el("div.hh-cal__wx", null, [
      holder,
      el("span.hh-cal__wxwords", null, [name, line]),
    ]);
    return { node, holder, name, line, kind: "" };
  };
  const wxToday = tile(W.today);
  const wxNext = tile(W.tomorrow);
  const sky = el("div.hh-cal__sky", null, [wxToday.node, wxNext.node]);

  // ---------- the legend and the grid's head ----------

  const legend = el("div.hh-cal__legend", null, [
    el("span.hh-cal__key", null, [el("i.hh-cal__pin"), W.legendToday]),
    el("span.hh-cal__key", null, [pic(ribbon("gold"), 15), W.show]),
    el("span.hh-cal__key", null, [pic(good("basket"), 17), W.fair]),
  ]);

  const showAt = pct(C.TUNING.SHOW_DOY + 0.5);
  const fairAt = pct(C.TUNING.FAIR_DOY + 0.5);
  const head = el("div.hh-cal__head", { "aria-hidden": "true" }, [
    el(
      "div.hh-cal__seasons",
      null,
      [0, 1, 2, 3].map((i) => el("span", null, [iconImg(SEASON_ICON[i], 16), seasonName(i)])),
    ),
    el("div.hh-cal__marks", null, [
      el("span.hh-cal__mark", { style: { left: showAt } }, pic(ribbon("gold"), 16)),
      el("span.hh-cal__mark", { style: { left: fairAt } }, pic(good("basket"), 18)),
    ]),
  ]);

  // ---------- the grid ----------

  const windowEl = el("div.hh-cal__window", { hidden: true });
  const under = el("div.hh-cal__field.hh-cal__field--under", { "aria-hidden": "true" }, [
    el("div.hh-cal__bands", { style: { backgroundImage: `url(${url(bandsArt(YEAR, SEASON))})` } }),
    windowEl,
    el("div.hh-cal__event.hh-cal__event--show", { style: { left: showAt } }),
    el("div.hh-cal__event.hh-cal__event--fair", { style: { left: fairAt } }),
  ]);
  const todayEl = el("div.hh-cal__today");
  const over = el("div.hh-cal__field.hh-cal__field--over", { "aria-hidden": "true" }, todayEl);
  const list = el("div.hh-cal__list");
  const sep = el("div.hh-cal__sep", null, el("span", { text: W.locked }));
  const grid = el("div.hh-cal__rows", { role: "group", "aria-label": W.grid }, [under, list, over]);

  /** @type {Map<string, { btn: HTMLElement, locked: boolean, from: number, to: number }>} */
  const rows = new Map();
  let rowsKey = "";
  /** The flowers the keeper has, in bloom order. @type {string[]} */
  let known = [];

  // ---------- the flower card ----------

  const cardPic = el("span.hh-cal__cardpic");
  const cardName = el("h3.hh-heading.hh-cal__cardname");
  const cardChip = el("span.hh-chip");
  const cardBlurb = el("p.hh-sub.hh-cal__blurb");
  const fWhen = el("li");
  const fWhere = el("li");
  const fGet = el("li");
  const fNectar = el("li");
  const fBunch = el("li", { text: W.bunch });
  const jarBox = el("span.hh-cal__jar");
  const honeyName = el("div.hh-row__title");
  const honeyLook = el("div.hh-row__sub.hh-cal__look");
  const honeyPrice = el("div.hh-row__sub");
  const honeyBest = el("div.hh-row__sub");
  const besidePics = el("div.hh-cal__neighbours", { "aria-hidden": "true" });
  const besideText = el("p.hh-cal__besidetext");
  const besideNote = el("p.hh-sub.hh-cal__besidenote", { text: W.besideNote });
  const seedsBtn = el(
    "button.hh-btn.hh-btn--small.hh-btn--secondary.hh-cal__seeds",
    { type: "button", onclick: () => app.sheet("seeds") },
    W.seeds,
  );
  const card = el("div.hh-card.hh-cal__card", null, [
    el("div.hh-cal__cardhead", null, [
      cardPic,
      el("div.hh-cal__cardtitle", null, [cardName, cardChip]),
      el(
        "button.hh-iconbtn.hh-iconbtn--bare.hh-cal__cardclose",
        {
          type: "button",
          "aria-label": W.closeCard,
          onclick: () => sel && select(sel),
        },
        iconImg("close", 22),
      ),
    ]),
    cardBlurb,
    el("ul.hh-cal__facts", null, [fWhen, fWhere, fGet, fNectar, fBunch]),
    el("div.hh-cal__honey", null, [
      jarBox,
      el("div.hh-cal__honeywords", null, [honeyName, honeyLook, honeyPrice, honeyBest]),
    ]),
    el("h4.hh-heading.hh-cal__h", { text: W.beside }),
    besidePics,
    el("div.hh-cal__besidewords", null, [besideText, besideNote]),
    seedsBtn,
  ]);
  let cardFor = "";
  let besideKey = "";
  let titleNow = "";

  // ---------- under the grid ----------

  const showNote = el("p.hh-sub.hh-cal__note");
  const fairNote = el("p.hh-sub.hh-cal__note");
  const notes = el("div.hh-cal__notes", null, [
    el("div.hh-cal__noteline", null, [pic(ribbon("gold"), 18), showNote]),
    el("div.hh-cal__noteline", null, [pic(good("basket"), 20), fairNote]),
    el("p.hh-sub.hh-cal__tip", { text: W.tip }),
  ]);

  root.append(sky, legend, head, grid, notes);

  // ---------- reading the state ----------

  function makeRow(state, flower, locked) {
    const info = C.FLOWERS[flower];
    const win = C.bloomWindow(state, flower) ?? { from: info.from, to: info.to };
    const days = win.to - win.from + 1;
    const range = bloomRange(state, flower);
    // The name goes on whichever side of the bar has more of the year left.
    const right = YEAR - 1 - win.to >= win.from;
    const btn = el(
      "button.hh-cal__row",
      {
        type: "button",
        class: locked ? "is-locked" : null,
        "aria-expanded": "false",
        "aria-label": locked ? W.rowLocked(info.name, range) : W.row(info.name, range),
        dataset: { flower },
        onclick: () => select(flower),
      },
      [
        el("span.hh-cal__pic", null, [
          tall(flowerArt(flower), 38),
          locked && el("span.hh-cal__lock", null, iconImg("lock", 17)),
        ]),
        el("span.hh-cal__track", null, [
          el("span.hh-cal__bar", {
            style: {
              left: pct(win.from),
              width: pct(days),
              backgroundImage: `url(${url(barArt(flower, days))})`,
            },
          }),
          el("span.hh-cal__name", {
            class: right ? "is-right" : "is-left",
            style: right ? { left: pct(win.to + 1) } : { right: pct(YEAR - win.from) },
            text: info.name,
          }),
        ]),
      ],
    );
    rows.set(flower, { btn, locked, from: win.from, to: win.to });
    return btn;
  }

  /** Put the card under its row (or away), and mark the row. */
  function place() {
    for (const [flower, row] of rows) {
      const on = flower === sel;
      row.btn.classList.toggle("is-on", on);
      row.btn.setAttribute("aria-expanded", on ? "true" : "false");
    }
    const row = sel ? rows.get(sel) : null;
    if (!row) {
      card.remove();
      show(windowEl, false);
      return;
    }
    if (row.btn.nextSibling !== card) row.btn.after(card);
    windowEl.style.left = pct(row.from);
    windowEl.style.width = pct(row.to - row.from + 1);
    show(windowEl, true);
  }

  /** Bring the open card (and its row) into view. */
  async function reveal() {
    await frame();
    const row = sel ? rows.get(sel) : null;
    if (!row || !card.isConnected) return;
    const view = root.getBoundingClientRect();
    const top = row.btn.getBoundingClientRect().top;
    const bottom = card.getBoundingClientRect().bottom;
    let by = 0;
    if (bottom > view.bottom - 8) by = bottom - view.bottom + 8;
    if (top - by < view.top + 4) by = top - view.top - 4;
    if (Math.abs(by) < 2) return;
    root.scrollBy({ top: by, behavior: app.settings.motion ? "smooth" : "auto" });
  }

  function select(flower) {
    sel = sel === flower ? null : flower;
    place();
    draw();
    if (sel) reveal();
  }

  function drawCard(state, cal) {
    const flower = sel;
    if (!flower || !rows.has(flower)) return;
    const info = C.FLOWERS[flower];
    const honey = C.HONEYS[flower];
    const win = C.bloomWindow(state, flower) ?? { from: info.from, to: info.to };
    const mine = known.includes(flower);

    if (cardFor !== flower) {
      cardFor = flower;
      besideKey = "";
      cardPic.replaceChildren(tall(flowerArt(flower), 56, info.name));
      jarBox.replaceChildren(pic(jar(flower, 1), 40));
      text(cardName, info.name);
      text(cardBlurb, info.blurb);
      text(fWhere, W.where[info.where] ?? "");
      show(fWhere, info.where !== "any");
      text(fNectar, info.where === "tree" ? W.nectarTree(info.nectar) : W.nectar(info.nectar));
      show(fBunch, !!info.bunch);
      text(honeyName, honey.name);
      text(honeyLook, W.honeyLook(honey.colour, tastes(honey.traits)));
    }

    // In bloom, or how long until it opens.
    let status = W.status.locked;
    let tone = "";
    if (mine) {
      if (C.inBloom(state, flower, state.clock.day)) {
        status = cal.doy === win.to ? W.status.lastDay : W.status.bloom;
        tone = "leaf";
      } else {
        const until = C.daysUntil(state, win.from);
        status = until === 1 ? W.status.tomorrow : W.status.opensIn(until);
        tone = "sky";
      }
    }
    text(cardChip, status);
    const chipClass = `hh-chip${tone ? ` hh-chip--${tone}` : ""}`;
    if (cardChip.className !== chipClass) cardChip.className = chipClass;

    text(fWhen, W.blooms(bloomRange(state, flower)));

    // How the keeper comes by it.
    const shop = C.shopNow(state).seeds.find((s) => s.flower === flower);
    let get = "";
    if (info.seed === null) get = mine ? "" : W.withPlot(info.unlock.plot ?? "");
    else if (shop?.inShop)
      get = shop.have > 0 ? W.seedHeld(shop.price, shop.have) : W.seed(shop.price);
    else if (shop) get = W.seedOnly(shop.have);
    else if (info.unlock.plot) get = W.withPlot(info.unlock.plot);
    else if (info.unlock.tier !== undefined)
      get = W.withTier(C.TIERS[info.unlock.tier]?.name ?? "");
    text(fGet, get);
    show(fGet, !!get);

    text(
      honeyPrice,
      W.price(C.priceOf(state, `honey:${flower}:1`), C.priceOf(state, `honey:${flower}:3`)),
    );
    const best = state.progress.stats.stars?.[flower] ?? 0;
    text(honeyBest, best > 0 ? W.best(best) : W.notYet);
    show(honeyBest, best > 0);

    // What the keeper has that blooms at the same time.
    const len = win.to - win.from + 1;
    const beside = C.bloomsWith(state, flower).filter((b) => known.includes(b.flower));
    const key = beside.map((b) => `${b.flower}:${b.days}`).join(",");
    if (key !== besideKey) {
      besideKey = key;
      besidePics.replaceChildren(...beside.map((b) => tall(flowerArt(b.flower), 30)));
    }
    show(besidePics, beside.length > 0);
    text(
      besideText,
      beside.length
        ? W.besideList(
            beside.map((b) => W.besideOne(C.FLOWERS[b.flower].name, b.days, b.days >= len)),
          )
        : W.besideNone,
    );
    show(besideNote, beside.length > 0);

    show(seedsBtn, info.seed !== null && C.flowerOpen(state, flower));
  }

  function drawTile(tileOf, kind) {
    if (tileOf.kind !== kind) {
      tileOf.kind = kind;
      const p = weatherPic(kind, 36);
      tileOf.holder.replaceChildren(...(p ? [p] : []));
    }
    const words = WEATHER_WORDS[kind];
    text(tileOf.line, words ? W.weather(words.name, words.fly) : "");
  }

  function draw() {
    const state = app.state;
    const cal = C.calendarOf(state.clock.day);

    const titled = W.titleYear(yearLabel(cal));
    if (titled !== titleNow) {
      titleNow = titled;
      app.sheetTitle(titled);
    }
    text(wxToday.name, dayLabel(cal));
    drawTile(wxToday, state.weather.today);
    drawTile(wxNext, state.weather.tomorrow);

    // The rows: the keeper's flowers, then the ones still to find.
    known = C.flowersKnown(state);
    const locked = C.FLOWER_IDS.filter((f) => !known.includes(f));
    const key = [...known, "|", ...locked]
      .map((f) => {
        const w = f === "|" ? null : C.bloomWindow(state, f);
        return w ? `${f}:${w.from}-${w.to}` : f;
      })
      .join(",");
    if (key !== rowsKey) {
      rowsKey = key;
      rows.clear();
      list.replaceChildren(
        ...known.map((f) => makeRow(state, f, false)),
        ...(locked.length ? [sep] : []),
        ...locked.map((f) => makeRow(state, f, true)),
      );
      place();
    }

    const day = state.clock.day;
    for (const [flower, row] of rows) {
      row.btn.classList.toggle("is-bloom", !row.locked && C.inBloom(state, flower, day));
    }

    todayEl.style.left = pct(cal.doy + 0.5);
    text(showNote, W.showIn(C.daysUntil(state, C.TUNING.SHOW_DOY)));
    text(fairNote, W.fairIn(C.daysUntil(state, C.TUNING.FAIR_DOY)));

    drawCard(state, cal);
  }

  draw();
  if (sel) reveal();

  // The first time, a keeper's note points at the first row: rows are for tapping.
  let alive = true;
  setTimeout(() => {
    // Under the third row (or the last, with fewer): clear of the weather above.
    const first = rows.get(known[Math.min(2, known.length - 1)] ?? "");
    if (alive && !sel && first?.btn.isConnected)
      app.note("calendar-rows", { text: W.tip, anchor: first.btn, place: "below" });
  }, 600);

  return {
    update() {
      draw();
    },
    unmount() {
      alive = false;
    },
  };
}
