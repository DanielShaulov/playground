// @ts-check
/**
 * The hive shop: `app.sheet("hives")`.
 *
 * Four things to buy, each with its picture, what it is for, how many the
 * keeper holds, its price and what the purse would hold afterwards:
 *
 *   a new hive     sets `app.ui.mode = { type: "place", what: "buy" }` and
 *                  closes; the meadow places it and dispatches `buyHive`
 *   a spare hive, sugar syrup, a thyme remedy     `buy { item, n: 1 }`
 *
 * and under them the four hive types, for reference: what each holds and
 * what upgrading to it costs. The footer keeps the purse in view and leads
 * back to the seed tray. Built once; `update` patches.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { hive as hiveArt } from "../art/hives.js";
import { item, seeds as packetArt } from "../art/goods.js";
import { say, number } from "../words.js";
import { SHOP as W, PURSE } from "../words/meadow-sheets.js";

export const title = W.title;

const styled = css(new URL("./hives.css", import.meta.url));

const pic = (sprite, width, alt = "") => {
  const p = img(sprite, width, alt);
  p.className = "hh-pic";
  return p;
};
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const C = app.core;
  root.classList.add("hh-shop");

  /**
   * @typedef {{ box: HTMLElement, pic: HTMLElement, held: HTMLElement, info: HTMLElement, price: HTMLElement,
   *   btn: HTMLElement, rest: string }} Row
   */
  /** @type {Record<string, Row>} */
  const rows = {};

  /** One thing on the shelf. */
  function shelf(id, picture, name, what, onBuy) {
    const holder = el("span.hh-shop__pic", null, picture);
    const held = el("span.hh-sub.hh-shop__held");
    const info = el("span.hh-shop__info");
    const price = el("span");
    const btn = el(
      "button.hh-btn.hh-btn--small",
      {
        type: "button",
        dataset: { buy: id, sound: id === "hive" ? "tap" : "buy" },
        onclick: () => {
          const row = rows[id];
          if (row.rest) app.toast(row.rest, { sound: "nope" });
          else onBuy();
        },
      },
      [W.buy, el("span.hh-coins", null, [pic(item("coin"), 18), price])],
    );
    const box = el("div.hh-row.hh-row--stack.hh-shop__row", { dataset: { item: id } }, [
      holder,
      el("div.hh-row__text", null, [
        el("div.hh-shop__top", null, [el("span.hh-row__title", { text: name }), held]),
        el("div.hh-row__sub", { text: what }),
      ]),
      el("div.hh-row__end.hh-shop__end", null, [info, btn]),
    ]);
    rows[id] = { box, pic: holder, held, info, price, btn, rest: "" };
    return box;
  }

  const ITEMS = ["spare", "syrup", "remedy"];
  /** The kind of hive a purchase gives. */
  const newType = C.newHiveType(app.state);
  const newSub = W.newHiveSub(C.HIVES[newType]?.name ?? "");
  const list = el("div.hh-list", null, [
    shelf("hive", pic(hiveArt(/** @type {any} */ (newType)), 52), W.newHive, newSub, () => {
      app.setUi({ mode: { type: "place", what: "buy" } });
      app.closeSheet();
    }),
    ...ITEMS.map((id) =>
      shelf(id, pic(item(id), 50), C.TUNING.SHOP[id]?.name ?? id, W.for[id] ?? "", () =>
        app.dispatch({ type: "buy", item: id, n: 1 }),
      ),
    ),
  ]);

  // The hive types, smallest first.
  const types = el(
    "div.hh-list.hh-shop__types",
    null,
    C.HIVE_IDS.map((id) => {
      const t = C.HIVES[id];
      return el("div.hh-row", null, [
        el("span.hh-shop__typepic", null, pic(hiveArt(/** @type {any} */ (id)), 40)),
        el("div.hh-row__text", null, [
          el("div.hh-row__title", { text: t.name }),
          el("div.hh-row__sub", { text: `${t.blurb} ${W.typeLine(t.jars, t.limit)}` }),
          // Said in words: a bare price here would read as something to buy.
          el("div.hh-shop__typecost", {
            text: id === newType ? W.typeFirst : t.cost > 0 ? W.typeCost(t.cost) : "",
          }),
        ]),
      ]);
    }),
  );

  root.append(
    list,
    el("section.hh-shop__sec", null, [
      el("h3.hh-heading.hh-shop__h", { text: W.types }),
      el("p.hh-sub", { text: W.typesSub }),
      types,
    ]),
  );

  const purseText = el("span");
  const purse = el("div.hh-shop__purse", null, [
    el("span.hh-sub", { text: PURSE.have }),
    el("span.hh-chip.hh-chip--honey", null, [pic(item("coin"), 20), purseText]),
  ]);
  root.after(
    el("div.hh-sheet__foot.hh-shop__foot", null, [
      purse,
      el("button.hh-btn.hh-btn--secondary", { type: "button", onclick: () => app.sheet("seeds") }, [
        pic(packetArt("clover"), 24),
        W.seeds,
      ]),
    ]),
  );

  function row(id, price, held, rest) {
    const r = rows[id];
    const coinsNow = app.state.purse.coins;
    if (!rest && coinsNow < price) rest = W.why["no-coins"](price - coinsNow);
    r.rest = rest;
    text(r.price, number(price));
    text(r.held, held);
    text(r.info, rest || W.leaves(coinsNow - price));
    r.btn.setAttribute("aria-disabled", rest ? "true" : "false");
  }

  function draw() {
    const state = app.state;
    const shop = C.shopNow(state);
    text(purseText, number(state.purse.coins));
    purse.setAttribute("aria-label", PURSE.label(state.purse.coins));

    // A new hive needs somewhere to stand, and the core knows whether it has.
    // ("no-coins" is row()'s business: it says how many are missing.)
    const can = C.canBuyHive(state);
    row(
      "hive",
      shop.hive.price,
      W.keeping(state.hives.list.length),
      can === true || can === "no-coins" ? "" : (W.why[can] ?? say(can)),
    );
    for (const i of shop.items) {
      if (!rows[i.id]) continue;
      row(i.id, i.price, W.hold(i.have ?? 0), i.open ? "" : (W.why["not-yet"] ?? say("not-yet")));
    }
  }
  draw();

  return {
    update(state, events) {
      for (const e of events ?? []) {
        const ev = /** @type {any} */ (e);
        if (ev.type !== "bought" || !rows[ev.item]) continue;
        app.toast(W.bought[ev.item] ?? "", { icon: item(ev.item), sound: false });
        app.fx("pop", { el: rows[ev.item].pic });
      }
      draw();
    },
  };
}
