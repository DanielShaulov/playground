// @ts-check
/**
 * The grocer's crate: what is left when the queue has gone.
 *
 * One row per thing on the shelf with a stepper, and the grocer's price for
 * one beside what the stall asks, so the lower price is plain. The button
 * under the list says what the chosen things would fetch before it sells
 * them. "Sell all" asks first. "Close the stall" is always there: selling
 * nothing is fine.
 *
 * Totals are worked out by asking the core to sell to a copy of the state
 * (`step` never touches its input), because jars of one honey at different
 * stars lower each other's price.
 */

import { app } from "../app.js";
import { el } from "../dom.js";
import { number } from "../words.js";
import { GROCER as W, FAIR } from "../words/market.js";
import { pic, iconImg } from "../chrome.js";
import { item } from "../art/goods.js";
import { productPic, coinTag, starsPic } from "./stall-art.js";

/** The grocer is a stranger who always looks the same. */
const GROCER_FACE = "walkin-grocer";

/**
 * @param {HTMLElement} panel the thumb's half of the stall
 * @param {{ face: Function, say: Function, scene: Function, close: () => void, faceEl: HTMLElement }} stage
 */
export function mountCrate(panel, stage) {
  /** @type {any} */
  const core = app.core;
  /** @type {Map<string, number>} what is in the crate */
  const picks = new Map();
  /** @type {Map<string, any>} */
  const rows = new Map();
  let said = app.state.market.fair
    ? FAIR.grocer(app.state.progress.today?.stall ?? 0)
    : W.hello[app.state.clock.day % W.hello.length];
  let sales = 0;

  const allBtn = el("button.hh-btn.hh-btn--small.hh-btn--secondary", {
    type: "button",
    dataset: { act: "sell-all" },
    onclick: sellAll,
  });
  const head = el(
    "div.st-shelfhead",
    null,
    el("span.st-shelfhead__title", null, iconImg("grocer", 22), W.crate),
    allBtn,
  );
  const list = el("ul.hh-list.st-crate");
  const sellBtn = /** @type {HTMLButtonElement} */ (
    el("button.hh-btn", {
      type: "button",
      dataset: { sound: "none", act: "sell" },
      onclick: sellPicked,
    })
  );
  const closeBtn = el(
    "button.hh-btn.hh-btn--secondary",
    { type: "button", dataset: { act: "close" }, onclick: () => stage.close() },
    W.close,
  );
  const bar = el("div.st-offer", null, el("div.st-offer__btns", null, closeBtn, sellBtn));
  panel.append(head, el("div.st-crate__scroll", null, list), bar);

  /** What the grocer would pay for these: the core's own quote for the whole basket. */
  const totalFor = (state, wanted) => core.grocerQuote(state, Object.fromEntries(wanted));

  function sell(wanted) {
    const todo = [...wanted].filter(([, n]) => n >= 1);
    picks.clear();
    for (const [product, n] of todo) app.dispatch({ type: "sellToGrocer", product, n });
  }
  function sellPicked() {
    sell(picks);
  }
  async function sellAll() {
    const all = core.shelf(app.state).map((it) => [it.product, it.n]);
    const count = all.reduce((sum, [, n]) => sum + n, 0);
    if (!count) return;
    const yes = await app.confirm(W.confirmAll(count, totalFor(app.state, all)));
    if (yes) sell(core.shelf(app.state).map((it) => [it.product, it.n]));
  }

  function change(product, by) {
    const it = core.shelf(app.state).find((i) => i.product === product);
    const now = picks.get(product) ?? 0;
    const next = Math.max(0, Math.min(it?.n ?? 0, now + by));
    if (next === now) return false;
    if (next) picks.set(product, next);
    else picks.delete(product);
    draw(app.state);
    return true;
  }

  /** A stepper button that repeats while it is held. */
  function stepButton(product, by, label, icon) {
    /** @type {any} */
    let hold = 0;
    let held = false;
    const stop = () => {
      clearTimeout(hold);
      clearInterval(hold);
      hold = 0;
    };
    return el(
      "button.hh-iconbtn",
      {
        type: "button",
        "aria-label": label,
        onpointerdown: () => {
          stop();
          held = false;
          hold = setTimeout(() => {
            held = true;
            hold = setInterval(() => {
              if (!change(product, by)) stop();
            }, 90);
          }, 380);
        },
        onpointerup: stop,
        onpointerleave: stop,
        onpointercancel: stop,
        onclick: () => {
          stop();
          if (!held) change(product, by);
          held = false;
        },
      },
      iconImg(icon, 22),
    );
  }

  function makeRow(it) {
    const info = it.info;
    const have = el("span.hh-num");
    const each = el("span.hh-num");
    const stall = el("span.hh-num");
    const stallTag = el("s.st-crate__was", null, stall);
    const value = el("output.hh-stepper__value", { text: "0" });
    const minus = /** @type {HTMLButtonElement} */ (stepButton(it.product, -1, W.fewer, "minus"));
    const plus = /** @type {HTMLButtonElement} */ (stepButton(it.product, 1, W.more, "plus"));
    const node = el(
      "li.hh-row",
      { dataset: { product: it.product } },
      pic(productPic(info), 38),
      el(
        "div.hh-row__text",
        null,
        el("div.hh-row__title.st-crate__name", null, info.name, starsPic(info.stars)),
        el(
          "div.hh-row__sub.st-crate__sub",
          null,
          have,
          el("span.hh-coins", null, pic(item("coin"), 15), each),
          W.pays,
          stallTag,
        ),
      ),
      el("div.hh-row__end", null, el("div.hh-stepper", null, minus, value, plus)),
    );
    return { node, have, each, stall, stallTag, value, minus, plus };
  }

  let allKey = "";
  let sellKey = "";

  function draw(state) {
    const items = core.shelf(state);
    const seen = new Set();
    items.forEach((it, i) => {
      let row = rows.get(it.product);
      if (!row) rows.set(it.product, (row = makeRow(it)));
      const n = Math.min(picks.get(it.product) ?? 0, it.n);
      if (n) picks.set(it.product, n);
      else picks.delete(it.product);
      row.have.textContent = W.have(it.n);
      row.each.textContent = number(core.quote(state, it.product, 1, "grocer"));
      row.stall.textContent = number(it.price);
      row.stallTag.setAttribute("aria-label", W.stallAlt(it.price));
      row.value.textContent = number(n);
      row.minus.disabled = n <= 0;
      row.plus.disabled = n >= it.n;
      if (list.children[i] !== row.node) list.insertBefore(row.node, list.children[i] ?? null);
      seen.add(it.product);
    });
    for (const [product, row] of rows) {
      if (seen.has(product)) continue;
      row.node.remove();
      rows.delete(product);
      picks.delete(product);
    }

    const all = items.map((it) => [it.product, it.n]);
    const allTotal = totalFor(state, all);
    const ak = `${all.join(";")}|${allTotal}`;
    if (ak !== allKey) {
      allKey = ak;
      allBtn.replaceChildren(W.sellAll, coinTag(allTotal, 16));
    }
    const count = [...picks.values()].reduce((a, b) => a + b, 0);
    const total = count ? totalFor(state, picks) : 0;
    const sk = `${count}|${total}`;
    sellBtn.disabled = !count;
    if (sk !== sellKey) {
      sellKey = sk;
      sellBtn.replaceChildren(...(count ? [W.sell(count), coinTag(total, 20)] : [W.sellNone]));
    }
  }

  return {
    update(state, events = []) {
      let earned = 0;
      for (const e of events) if (e.type === "soldToGrocer") earned += e.coins;
      if (earned) {
        said = W.thanks[sales++ % W.thanks.length];
        app.sound("jar");
        app.sound("coins", { delay: 0.15 });
        app.fx("coins", { from: stage.faceEl, n: Math.min(9, 2 + Math.ceil(earned / 15)) });
        setTimeout(() => app.sound("coin"), 720);
      }
      stage.scene("calm");
      stage.face(GROCER_FACE, earned ? "happy" : "calm", !sales && !earned && rows.size === 0);
      stage.say(`grocer`, () => [el("b", { text: W.name })], said);
      draw(state);
    },
  };
}
