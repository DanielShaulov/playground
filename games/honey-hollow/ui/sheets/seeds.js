// @ts-check
/**
 * The seed tray: `app.sheet("seeds", { plot?, x?, y? })`.
 *
 * A row for every seed the shop sells or the keeper holds: the packet, the
 * name, the price, a compact bloom strip, a line about the honey, and what
 * the purse would hold afterwards. Seeds not in the shop yet come last, with
 * what brings them. A seed that cannot grow on the plot showing says where
 * it does.
 *
 * Tapping a seed:
 *   - with a square in the params, plants it there at once and closes;
 *   - with none, arms the planting brush for the meadow
 *     (`app.ui.mode = { type: "plant", flower }`) and closes. If the flower
 *     only grows on another plot the keeper owns, the meadow is turned to
 *     that plot as well (`app.ui.plot`).
 *
 * The footer keeps the purse in view and leads to the hive shop.
 * Rows are built once per flower; `update` patches them.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { seeds as packetArt, item, SEED_FLOWERS } from "../art/goods.js";
import { hive as hiveArt } from "../art/hives.js";
import { icon } from "../art/icons.js";
import { say, number } from "../words.js";
import { SEEDS as W, PURSE } from "../words/meadow-sheets.js";
import { bloomStrip, refreshBloomStrip, bloomStripReady } from "../bloom-strip.js";

export const title = W.title;

const styled = css(new URL("./seeds.css", import.meta.url));

const pic = (sprite, width, alt = "") => {
  const p = img(sprite, width, alt);
  p.className = "hh-pic";
  return p;
};
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
const show = (node, on) => {
  if (node.hidden === !!on) node.hidden = !on;
};

/**
 * @param {HTMLElement} root
 * @param {{ plot?: string, x?: string | number, y?: string | number }} [params]
 */
export async function mount(root, params) {
  await Promise.all([styled, bloomStripReady]);
  const C = app.core;
  /** The square the tray was opened for, if any. */
  const here =
    params && params.x !== undefined && params.y !== undefined
      ? { plot: String(params.plot ?? app.ui.plot), x: Number(params.x), y: Number(params.y) }
      : null;
  root.classList.add("hh-seeds");

  /** True when `flower` can go somewhere on `plot`, else the reason most squares give. */
  const grows = (state, plot, flower) => {
    let why = "square-taken";
    for (let y = 0; y < C.TUNING.PLOT_H; y++) {
      for (let x = 0; x < C.TUNING.PLOT_W; x++) {
        const ok = C.canPlant(state, plot, x, y, flower);
        if (ok === true) return true;
        if (ok === "needs-hill" || ok === "needs-water" || ok === "not-owned") why = ok;
      }
    }
    return why;
  };

  const lead = el("p.hh-sub.hh-seeds__lead", { text: here ? W.leadHere : W.leadBrush });
  const listEl = el("div.hh-list.hh-seeds__list");
  root.append(lead, listEl);

  const purseText = el("span");
  const purse = el("div.hh-seeds__purse", null, [
    el("span.hh-sub", { text: PURSE.have }),
    el("span.hh-chip.hh-chip--honey", null, [pic(item("coin"), 20), purseText]),
  ]);
  root.after(
    el("div.hh-sheet__foot.hh-seeds__foot", null, [
      purse,
      el("button.hh-btn.hh-btn--secondary", { type: "button", onclick: () => app.sheet("hives") }, [
        pic(hiveArt("skep"), 24),
        W.hives,
      ]),
    ]),
  );

  /**
   * @typedef {{ btn: HTMLElement, coin: HTMLElement, price: HTMLElement, lock: HTMLElement,
   *   status: HTMLElement, strip: HTMLElement, rest: string, go: string | null }} Row
   */
  /** @type {Map<string, Row>} */
  const rows = new Map();
  let order = "";

  function choose(flower) {
    const row = rows.get(flower);
    if (!row) return;
    if (row.rest) {
      app.toast(row.rest, { sound: "nope" });
      return;
    }
    if (here) {
      const events = app.dispatch({ type: "plant", ...here, flower });
      if (!events.some((e) => e.type === "planted")) return;
      // The meadow plays the sound of planting.
      app.toast(W.planted(C.FLOWERS[flower].name), { icon: packetArt(flower), sound: false });
      app.closeSheet();
      return;
    }
    const mode = { type: "plant", flower };
    app.setUi(row.go ? { plot: row.go, mode } : { mode });
    app.closeSheet();
  }

  /** @returns {Row} */
  function makeRow(flower) {
    const f = C.FLOWERS[flower];
    const honey = C.HONEYS[flower];
    const coin = pic(item("coin"), 18);
    const price = el("span");
    const lock = img(icon("lock"), 24);
    lock.className = "hh-icon";
    lock.hidden = true;
    const status = el("div.hh-seeds__status");
    const strip = bloomStrip(app.state, flower, { compact: true });
    const btn = el(
      "button.hh-row.hh-seeds__row",
      { type: "button", dataset: { flower, sound: "tap" }, onclick: () => choose(flower) },
      [
        el(
          "span.hh-seeds__packet",
          null,
          SEED_FLOWERS.includes(flower) && pic(packetArt(flower), 50),
        ),
        el("div.hh-row__text", null, [
          el("div.hh-seeds__top", null, [
            el("span.hh-row__title", { text: f.name }),
            el("span.hh-coins.hh-seeds__price", null, [coin, price, lock]),
          ]),
          strip,
          el("div.hh-row__sub", { text: W.honey(honey.colour, honey.traits) }),
          status,
        ]),
      ],
    );
    return { btn, coin, price, lock, status, strip, rest: "", go: null };
  }

  function draw() {
    const state = app.state;
    const coinsNow = state.purse.coins;
    const shop = C.shopNow(state);
    const onSale = new Map(shop.seeds.map((s) => [s.flower, s]));
    const all = C.FLOWER_IDS.filter((id) => C.FLOWERS[id].seed !== null);
    const ids = [...all.filter((id) => onSale.has(id)), ...all.filter((id) => !onSale.has(id))];
    for (const id of ids) if (!rows.has(id)) rows.set(id, makeRow(id));
    const key = ids.join(",");
    if (key !== order) {
      // The same nodes in a new order (a seed has come into the shop).
      order = key;
      listEl.replaceChildren(...ids.map((id) => /** @type {Row} */ (rows.get(id)).btn));
    }
    text(purseText, number(coinsNow));
    purse.setAttribute("aria-label", PURSE.label(coinsNow));

    for (const id of ids) {
      const row = /** @type {Row} */ (rows.get(id));
      const f = C.FLOWERS[id];
      const s = onSale.get(id);
      refreshBloomStrip(row.strip, state);
      let rest = "";
      let note = "";
      row.go = null;

      if (!s) {
        const u = f.unlock ?? {};
        rest =
          u.tier !== undefined && C.TIERS[u.tier]
            ? W.unlockTier(C.TIERS[u.tier].name, C.TIERS[u.tier].renown)
            : u.plot && C.PLOTS[u.plot]
              ? W.unlockPlot(C.PLOTS[u.plot].name)
              : W.unlockLater;
        show(row.coin, false);
        show(row.lock, true);
        text(row.price, "");
        row.btn.setAttribute("aria-label", `${f.name}. ${W.locked}. ${rest}`);
      } else {
        const free = s.have > 0;
        show(row.lock, false);
        show(row.coin, !free);
        text(row.price, free ? W.free : number(s.price));
        row.btn.setAttribute("aria-label", W.row(f.name, free ? 0 : s.price));

        // The plots whose ground suits it, whether or not they are the keeper's yet.
        const suits = C.whereGrows(state, id);
        const suitNames = suits.map((p) => C.PLOTS[p].name);
        if (here) {
          const ok = C.canPlant(state, here.plot, here.x, here.y, id);
          if (ok !== true) {
            rest = W.notHere[ok] ?? say(ok);
            if ((ok === "needs-hill" || ok === "needs-water") && !suits.includes(here.plot))
              rest += ` ${W.elsewhere(suitNames)}`;
          }
        } else if (grows(state, app.ui.plot, id) !== true) {
          const other = suits.find(
            (p) => p !== app.ui.plot && state.land.plots[p].owned && grows(state, p, id) === true,
          );
          if (other) {
            row.go = other;
            note = W.goThere(C.PLOTS[other].name, !!W.where[f.where]);
          } else if (W.where[f.where] && !suits.some((p) => state.land.plots[p].owned))
            rest = W.where[f.where](suitNames);
          else rest = W.noRoom;
        }
        if (!rest && !free && coinsNow < s.price) rest = W.short(s.price - coinsNow);
        if (!rest && !note) note = free ? W.held(s.have) : W.leaves(coinsNow - s.price);
      }

      row.rest = rest;
      text(row.status, rest || note);
      row.status.classList.toggle("is-why", !!rest);
      row.btn.classList.toggle("is-locked", !s);
      row.btn.setAttribute("aria-disabled", rest ? "true" : "false");
    }
  }
  draw();

  return { update: draw };
}
