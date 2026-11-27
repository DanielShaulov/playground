// @ts-check
/**
 * The "More" menu: `app.sheet("more")`. The complete list of places: big
 * rows with a painted icon each (Calendar, Map, Goals, Bee book, Workshop,
 * Wardrobe, Settings), a line under each name saying what is going on there,
 * and a badge where something is waiting (a reward to claim, a page not yet
 * read, things that could be made). At the top, the day in one line: the
 * keeper's face, the day and season, the weather, coins and renown.
 *
 * Built once; `update` patches the words and the badges.
 */

import { app } from "../app.js";
import { el, css, frame } from "../dom.js";
import { img } from "../paint/sprite.js";
import { icon } from "../art/icons.js";
import { item, seeds } from "../art/goods.js";
import { hive as hiveArt } from "../art/hives.js";
import { weather as weatherArt } from "../art/sky.js";
import { keeper as keeperArt } from "../art/people.js";
import { dayLabel, yearLabel, number } from "../words.js";
import { MORE as W, WEATHER_WORDS } from "../words/planning.js";

const styled = css(new URL("./more.css", import.meta.url));

export const title = W.title;

/** The rows, in order: the sheet each opens and its icon. */
const ROWS = [
  { id: "calendar", art: () => icon("calendar") },
  { id: "map", art: () => icon("map") },
  { id: "goals", art: () => icon("goals") },
  { id: "book", art: () => icon("book") },
  { id: "workshop", art: () => icon("workshop") },
  { id: "seeds", art: () => seeds("clover") },
  { id: "hives", art: () => hiveArt("skep") },
  { id: "wardrobe", art: () => icon("wardrobe") },
  { id: "settings", art: () => icon("settings") },
];

/** @param {any} s @param {number} width */
const pic = (s, width, alt = "", cls = "hh-pic") => {
  const p = img(s, width, alt);
  p.className = cls;
  return p;
};
/** A row's picture, 38 px tall; the goals icon if its painter fails. */
const rowPic = (/** @type {() => any} */ make) => {
  let s;
  try {
    s = make();
  } catch {
    s = icon("goals");
  }
  return pic(s, (38 * s.w) / s.h);
};
/** @param {Element} node @param {string} s */
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
/** @param {HTMLElement} node @param {any} on */
const show = (node, on) => {
  if (node.hidden === !!on) node.hidden = !on;
};

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const C = app.core;
  root.classList.add("hh-more");
  let alive = true;

  // ---------- the day in one line ----------

  const face = el("span.hh-more__face", { hidden: true });
  const whose = el("div.hh-more__whose");
  const day = el("div.hh-more__date");
  const sub = el("div.hh-row__sub");
  const wx = el("span.hh-more__wx");
  const coinsText = el("span");
  const renownText = el("span");
  const coinsChip = el("span.hh-chip.hh-chip--honey", null, [
    pic(item("coin"), 20, "", "hh-icon"),
    coinsText,
  ]);
  const renownChip = el("span.hh-chip", null, [pic(item("star"), 20, "", "hh-icon"), renownText]);
  const summary = el("div.hh-more__day", null, [
    face,
    el("div.hh-more__daywords", null, [whose, day, sub]),
    el("div.hh-more__side", null, [wx, el("div.hh-more__chips", null, [coinsChip, renownChip])]),
  ]);
  let wxKind = "";
  let faceKey = "";

  // ---------- the rows ----------

  /** @type {Record<string, { sub: HTMLElement, badge: HTMLElement }>} */
  const rows = {};
  const list = el(
    "ul.hh-list.hh-more__list",
    null,
    ROWS.map((row) => {
      const subEl = el("span.hh-row__sub");
      const badge = el("span.hh-badge", { hidden: true });
      rows[row.id] = { sub: subEl, badge };
      return el(
        "li",
        null,
        el(
          "button.hh-row.hh-more__row",
          { type: "button", dataset: { go: row.id }, onclick: () => app.sheet(row.id) },
          [
            el("span.hh-more__pic", null, rowPic(row.art)),
            el("span.hh-row__text", null, [
              el("span.hh-row__title", { text: W.rows[row.id] }),
              subEl,
            ]),
            el("span.hh-row__end", null, [
              badge,
              el("span.hh-more__go", { "aria-hidden": "true", text: "›" }),
            ]),
          ],
        ),
      );
    }),
  );

  root.append(summary, list);

  function setBadge(id, n) {
    const badge = rows[id].badge;
    show(badge, n > 0);
    if (n > 0) {
      text(badge, n > 9 ? "9+" : String(n));
      badge.setAttribute("aria-label", W.badge(n));
    }
  }

  /** The keeper's face, painted after the sheet is up so opening never waits for it. */
  async function paintFace(key, look) {
    await frame();
    if (!alive || key !== faceKey) return;
    try {
      face.replaceChildren(pic(keeperArt(look, "bust", "happy"), 60));
      show(face, true);
    } catch (err) {
      console.error("[hollow] more: keeper bust:", err);
    }
  }

  function draw() {
    const state = app.state;
    const cal = C.calendarOf(state.clock.day);
    const keeper = state.keeper;

    // The day.
    const name = keeper?.made ? String(keeper.name ?? "") : "";
    text(whose, name ? W.whose(name) : "");
    show(whose, !!name);
    text(day, dayLabel(cal));
    const weather = state.weather.today;
    text(sub, W.summary(yearLabel(cal), WEATHER_WORDS[weather]?.name ?? ""));
    if (wxKind !== weather) {
      wxKind = weather;
      try {
        wx.replaceChildren(pic(weatherArt(/** @type {any} */ (weather)), 40));
      } catch {
        wx.replaceChildren();
      }
    }
    text(coinsText, number(state.purse.coins));
    coinsChip.setAttribute("aria-label", W.coinsLabel(state.purse.coins));
    text(renownText, number(state.progress.renown));
    renownChip.setAttribute("aria-label", W.renownLabel(state.progress.renown));
    const key = keeper?.made ? JSON.stringify(keeper) : "";
    if (key !== faceKey) {
      faceKey = key;
      if (key) paintFace(key, keeper);
      else show(face, false);
    }

    // Calendar: what of the keeper's is in bloom today (beds, and the orchard's trees).
    const growing = new Set();
    for (const id of C.PLOT_IDS) {
      const plot = state.land.plots[id];
      if (!plot?.owned) continue;
      for (const sq of plot.squares)
        if (sq && sq.t === "bed") growing.add(/** @type {any} */ (sq).flower);
    }
    if (C.whereGrows(state, "apple").some((id) => state.land.plots[id]?.owned))
      growing.add("apple");
    const blooming = C.flowersKnown(state).filter(
      (f) => growing.has(f) && C.inBloom(state, f, state.clock.day),
    );
    text(
      rows.calendar.sub,
      cal.season === 3
        ? W.calendarWinter
        : blooming.length > 1
          ? W.calendarMany(blooming.length)
          : blooming.length
            ? W.calendarBloom(C.FLOWERS[blooming[0]].name)
            : W.calendarQuiet,
    );

    // Map.
    text(
      rows.map.sub,
      W.map(C.PLOT_IDS.filter((id) => state.land.plots[id]?.owned).length, C.PLOT_IDS.length),
    );

    // Goals.
    const goals = C.goalsNow(state);
    const ready = goals.filter((g) => g.ready).length;
    text(
      rows.goals.sub,
      ready ? W.goalsReady(ready) : goals.length ? W.goalsOpen(goals.length) : W.goalsNone,
    );
    setBadge("goals", ready);

    // Bee book.
    const unread = state.book.unread.length;
    text(
      rows.book.sub,
      unread ? W.bookNew(unread) : W.book(state.book.facts.length, C.FACTS.length),
    );
    setBadge("book", unread);

    // Workshop.
    let can = 0;
    let line = W.workshopIdle;
    const making = C.canCraftNow(state);
    if (making === "workshop-closed") line = W.workshopClosed;
    else if (making === "not-now") line = W.workshopBusy;
    else if (making !== true) line = W.workshopDone;
    else {
      can = C.recipesNow(state).filter((r) => r.canMake).length;
      if (can) line = W.workshopCan(can);
    }
    text(rows.workshop.sub, line);
    setBadge("workshop", can);

    // Seed tray and hive shop.
    const shop = C.shopNow(state);
    text(rows.seeds.sub, W.seedsLine(shop.seeds.filter((x) => x.inShop).length));
    text(rows.hives.sub, W.hivesLine(shop.hive.price));

    text(rows.wardrobe.sub, W.wardrobe);
    text(rows.settings.sub, W.settings);
  }

  draw();

  return {
    update() {
      draw();
    },
    unmount() {
      alive = false;
    },
  };
}
