// @ts-check
/**
 * The market stall, in the evening.
 *
 * Your beekeeper stands behind a striped stall; customers step up one at a
 * time and say what they wish for. Below, in the thumb's half, is the shelf:
 * everything you can sell, with what would be this customer's wish marked.
 * Pick a thing and the line over the buttons says what they would pay and
 * how they would take it, before "Offer" commits to it. "Nothing today" lets
 * them go, at no cost.
 *
 * What is on screen is decided from the state on every update (`decide`):
 *
 *   closed   it is not evening
 *   show     Honey Show evening, before the stall opens   (stall-show.js)
 *   fair     Winter Fair day, before the stall opens: a welcome card
 *   serve    a customer at the stall, or their answer to what just happened
 *   crate    the queue is done: the grocer's crate          (stall-crate.js)
 *   bare     nothing on the shelf at all: a kind word and "Close the stall"
 *
 * The stall is opened here (`openStall`) once there is something to sell;
 * "Close the stall" goes to the night card. The core sells a customer as
 * many as they wish for (or as many as there are), so the count is shown,
 * not chosen.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { dayLabel, number } from "../words.js";
import {
  STALL as W,
  FAIR,
  GROCER,
  REGULAR_WORDS,
  wishLine,
  replyLine,
  howMany,
  traitLine,
} from "../words/market.js";
import { pic, iconImg } from "../chrome.js";
import { paintAll, url } from "../paint/sprite.js";
import { villager, keeper } from "../art/people.js";
import { jar } from "../art/jars.js";
import { heart as heartArt, item, seeds as seedsArt, honeycomb, good } from "../art/goods.js";
import { paintStage, stageJobs, productPic, coinTag, starsPic, safe } from "./stall-art.js";
import { mountCrate } from "./stall-crate.js";
import { mountShow } from "./stall-show.js";

const styled = css(new URL("./stall.css", import.meta.url));

/** The art's name for a customer: a regular's id, or a stranger by their seed. */
const faceOf = (c) => c.who ?? `walkin-${c.look}`;

/** Play a one-shot CSS animation again. */
function restart(node, name) {
  node.classList.remove("is-in", "is-glad");
  void node.offsetWidth;
  node.classList.add(name);
}

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  /** @type {any} */
  const core = app.core;
  root.classList.add("hh-page", "st");
  app.ambience("stall");

  const local = {
    /** @type {string | null} the product picked on the shelf */
    selected: null,
    /** @type {number | null} how many of it, once the stepper has been touched */
    qty: null,
    /** @type {any} what the last customer answered, until "Next" */
    reaction: null,
    showDone: typeof mountShow !== "function",
    fairSeen: false,
    opening: false,
    alive: true,
  };
  /** Phones tall enough for a taller picture (the same line stall.css draws). */
  const tallPhone = window.matchMedia("(min-height: 641px)");
  /** @type {Set<any>} */
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (local.alive) fn();
    }, ms);
    timers.add(id);
  };

  // ───────────────────────── the page ─────────────────────────

  const dayChip = el("span.hh-chip.st-day");
  const waitFaces = el("span.st-wait__faces");
  const waitText = el("span.st-wait__text");
  const waitChip = el("div.st-wait", { hidden: true }, waitText, waitFaces);
  const purse = el("span.hh-num");
  const coinsChip = el(
    "span.hh-chip.hh-chip--honey",
    { dataset: { fx: "coins" } },
    pic(item("coin"), 20, W.coinsAlt),
    purse,
  );
  const top = el("header.st-top", null, dayChip, coinsChip);

  const canvas = /** @type {HTMLCanvasElement} */ (
    el("canvas.st-pic__scene", { "aria-hidden": "true" })
  );
  const face = /** @type {HTMLImageElement} */ (el("img.st-pic__face", { alt: "", hidden: true }));
  const snow = el("div.st-snow", { hidden: true, "aria-hidden": "true" });
  const picEl = el("div.st-pic", null, canvas, snow, waitChip, face);
  const stageEl = el("div.st-stage", null, picEl);
  const who = el("div.st-say__who");
  const line = el("p.st-say__line");
  const bubble = el(
    "div.hh-bubble.hh-bubble--up.hh-bubble--right.st-say",
    { "aria-live": "polite" },
    who,
    line,
  );
  const sayRow = el("div.st-sayrow", { hidden: true }, bubble);
  const panel = el("div.st-panel");
  const body = el("div.st-body", null, stageEl, sayRow, panel);
  const alt = el("div.st-alt", { hidden: true });
  const over = el("div.st-over.hh-fade", { hidden: true });
  root.append(top, body, alt, over);

  // ───────────────────────── the top bar ─────────────────────────

  let dayKey = "";
  function drawTop(state) {
    const cal = core.calendarOf(state.clock.day);
    const key = `${cal.day}|${state.market.fair}`;
    if (key !== dayKey) {
      dayKey = key;
      dayChip.replaceChildren(
        iconImg(cal.seasonName, 22),
        state.market.fair ? W.fairDay : dayLabel(cal),
      );
    }
    purse.textContent = number(state.purse.coins);
  }

  /** Busts painted so far: the queue's faces are painted a few at a time. */
  const painted = new Set();
  let painting = false;
  async function warmFaces() {
    if (painting) return;
    const todo = [...new Set(/** @type {string[]} */ (app.state.market.queue.map(faceOf)))].filter(
      (id) => !painted.has(id),
    );
    if (!todo.length) return;
    painting = true;
    await paintAll(
      todo.map((id) => () => {
        villager(id, "bust", "calm");
        painted.add(id);
      }),
    );
    painting = false;
    if (local.alive) sync();
  }

  let waitKey = "";
  /** @param {any[] | null} rest who is still in the queue, or null when nobody is being served */
  function drawWaiting(rest) {
    const ids = (rest ?? []).map(faceOf).filter((id) => painted.has(id));
    const fair = app.state.market.fair;
    const key = rest ? `${rest.length}|${fair}|${ids.join(",")}` : "";
    if (key === waitKey) return;
    waitKey = key;
    waitFaces.replaceChildren(
      ...ids.slice(0, 4).map((id) => pic(villager(id, "bust", "calm"), 26)),
    );
    waitText.textContent = rest ? (fair ? FAIR.waiting : W.waiting)(rest.length) : "";
    waitChip.hidden = !rest;
  }

  // ───────────────────────── the picture and the bubble ─────────────────────────

  /**
   * How big the picture is on this phone. A short phone gets the plain 8 to 5
   * picture, a quarter of its height; a tall one gets a taller picture, with
   * more sky and a bigger stall, so the shelf can stay by the thumb without
   * an empty middle.
   */
  function stageSize() {
    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    // On a tall phone stall.css hands the stage all the height the shelf
    // leaves; the picture is painted to fill it.
    const high = tallPhone.matches ? Math.max(0.26 * vh, stageEl.clientHeight) : 0.26 * vh;
    const wide = Math.min(vw, high * 1.6, 620);
    const most = tallPhone.matches ? 384 : 200;
    const units = Math.max(200, Math.min(most, Math.floor((320 * high) / wide / 8) * 8));
    return { w: Math.round(wide), h: Math.round((wide * units) / 320), units };
  }

  /** Snow over the Winter Fair: a few flakes, each on its own slow fall. */
  function letItSnow(on) {
    if (on && !snow.childElementCount)
      for (let i = 0; i < 18; i++)
        snow.append(
          el("i", {
            style: {
              left: `${(i * 37 + 11) % 100}%`,
              animationDelay: `${-((i * 1.7) % 9)}s`,
              animationDuration: `${7 + (i % 5) * 1.3}s`,
              width: `${3 + (i % 3)}px`,
              height: `${3 + (i % 3)}px`,
            },
          }),
        );
    snow.hidden = !on;
  }

  let sceneKey = "";
  let lastMood = "calm";
  function drawScene(mood = "calm") {
    lastMood = mood;
    const s = app.state;
    const season = core.calendarOf(s.clock.day).seasonName;
    /** @type {any} */
    const k = s.keeper;
    const size = stageSize();
    const key =
      [season, mood, s.market.fair, size.w, size.units, k.body, k.skin, k.hair, k.hairColor].join(
        "|",
      ) + [k.overalls, k.shirt, k.hat, k.beard, k.glasses].join("|");
    if (key === sceneKey) return;
    sceneKey = key;
    picEl.style.width = `${size.w}px`;
    picEl.style.height = `${size.h}px`;
    face.style.width = `${37 + (size.units - 200) * 0.085}%`;
    paintStage(canvas, {
      season,
      look: k,
      mood,
      fair: s.market.fair,
      sign: W.sign,
      h: size.units,
    });
    letItSnow(!!s.market.fair);
  }
  const onResize = () => local.alive && drawScene(lastMood);
  window.addEventListener("resize", onResize);
  // The shelf grows and shrinks from customer to customer, and the stage with it.
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  watch?.observe(stageEl);

  let faceKey = "";
  function showFace(id, mood = "calm", enter = false) {
    if (!id) {
      face.hidden = true;
      faceKey = "";
      return;
    }
    const key = `${id}|${mood}`;
    if (key !== faceKey) {
      faceKey = key;
      face.src = url(villager(id, "bust", /** @type {any} */ (mood)));
      painted.add(id);
    }
    face.hidden = false;
    if (enter) restart(face, "is-in");
  }

  /** The core's name for a wished kind ("honey:lavender", "good:candle"), if it has one. */
  function wishName(value) {
    const [kind, id] = String(value ?? "").split(":");
    if (kind === "honey") return core.HONEYS[id]?.name;
    if (kind === "good") return core.GOODS[id]?.name;
    return undefined;
  }

  let whoKey = "";
  /** Fill the bubble: `key` says who is speaking, so their name is built once. */
  function say(key, whoNodes, text) {
    if (key !== whoKey) {
      whoKey = key;
      who.replaceChildren(...whoNodes());
    }
    if (line.textContent !== text) line.textContent = text;
    sayRow.hidden = false;
  }
  function hush() {
    sayRow.hidden = true;
    whoKey = "";
  }

  function closeOver() {
    over.hidden = true;
    over.replaceChildren();
  }
  const closeStall = () => app.go("night");

  // ───────────────────────── which view ─────────────────────────

  /** @type {null | { name: string, update: (state: any, events: any[], action: any) => void, dispose?: () => void }} */
  let view = null;
  function use(name, make) {
    if (view?.name === name) return view;
    view?.dispose?.();
    panel.replaceChildren();
    view = { name, ...make() };
    return view;
  }

  /** @type {null | { update?: Function, unmount?: Function }} */
  let showView = null;
  function leaveShow() {
    local.showDone = true;
    showView?.unmount?.();
    showView = null;
    alt.hidden = true;
    alt.replaceChildren();
    body.hidden = false;
    sync();
  }

  function decide(state) {
    const m = state.market;
    if (state.clock.phase !== "evening") return "closed";
    if (local.reaction) return "serve";
    if (m.show && !m.open && !local.showDone) return "show";
    if (!core.shelf(state).length) return "bare";
    if (!m.open) return m.fair && !local.fairSeen ? "fair" : "open";
    return m.at < m.queue.length ? "serve" : "crate";
  }

  /** Turn what just happened into what the customer answers. */
  function absorb(state, events) {
    for (const e of events) {
      if (e.type === "sold" || e.type === "passed") {
        const c = state.market.queue.find((q) => q.id === e.customer);
        if (!c) continue;
        const mood = e.type === "sold" ? e.mood : "passed";
        local.reaction = {
          c,
          sold: e.type === "sold" ? e : null,
          mood,
          reply: replyLine({ id: c.id, who: c.who, mood }),
          heart: null,
          fact: null,
          fresh: true,
        };
        local.selected = null;
        local.qty = null;
      } else if (e.type === "heart" && local.reaction) local.reaction.heart = e;
      else if (e.type === "factUnlocked" && local.reaction) local.reaction.fact = e.fact;
      else if (e.type === "renownUp") {
        app.toast(W.tierUp(e.name), { icon: safe(() => item("star")), sound: "tier" });
      }
    }
  }

  function sync(events = [], action = { type: "@ui" }) {
    if (!local.alive) return;
    if (action?.type === "@replace") {
      Object.assign(local, { selected: null, qty: null, reaction: null, fairSeen: false });
      local.showDone = typeof mountShow !== "function";
      closeOver();
    }
    absorb(app.state, events);
    let name = decide(app.state);
    if (name === "open") {
      if (!local.opening) {
        local.opening = true;
        app.dispatch({ type: "openStall" }, { quiet: true });
        local.opening = false;
      }
      name = decide(app.state);
      if (name === "open") name = "bare";
    }
    render(name, app.state, events, action);
  }

  function render(name, state, events, action) {
    drawTop(state);
    if (name === "show") {
      body.hidden = true;
      alt.hidden = false;
      drawWaiting(null);
      if (!showView) showView = mountShow(alt, { done: leaveShow });
      showView?.update?.(state, events, action);
      return;
    }
    if (showView) {
      showView.unmount?.();
      showView = null;
      alt.replaceChildren();
    }
    alt.hidden = true;
    body.hidden = false;
    const make = {
      closed: makeClosed,
      bare: makeBare,
      fair: makeFair,
      serve: makeServe,
      crate: makeCrate,
    }[name];
    use(name, make ?? makeBare).update(state, events, action);
  }

  // ───────────────────────── serving a customer ─────────────────────────

  function makeServe() {
    const legend = el("span.st-shelfhead__legend");
    const shelfTitle = el("span.st-shelfhead__title", { text: W.shelf });
    const head = el("div.st-shelfhead", null, shelfTitle, legend);
    const grid = el("div.st-shelf", { role: "group", "aria-label": W.shelf });
    // How many: shown only when this customer would take more than 1.
    const qtyValue = el("span.hh-stepper__value");
    const qtyLess = /** @type {HTMLButtonElement} */ (
      el(
        "button.hh-iconbtn",
        {
          type: "button",
          "aria-label": GROCER.fewer,
          dataset: { act: "fewer" },
          onclick: () => stepQty(-1),
        },
        iconImg("minus", 22),
      )
    );
    const qtyMore = /** @type {HTMLButtonElement} */ (
      el(
        "button.hh-iconbtn",
        {
          type: "button",
          "aria-label": GROCER.more,
          dataset: { act: "more" },
          onclick: () => stepQty(1),
        },
        iconImg("plus", 22),
      )
    );
    const qty = el("div.hh-stepper.st-qty", { hidden: true }, qtyLess, qtyValue, qtyMore);
    const offerLine = el("div.st-offer__line", { "aria-live": "polite" }, qty);
    const passBtn = el(
      "button.hh-btn.hh-btn--secondary",
      { type: "button", dataset: { sound: "none", act: "pass" }, onclick: onPass },
      W.nothing,
    );
    const offerBtn = /** @type {HTMLButtonElement} */ (
      el("button.hh-btn.st-offer__go", {
        type: "button",
        dataset: { sound: "none", act: "offer" },
        onclick: onOffer,
      })
    );
    const nextBtn = el("button.hh-btn", {
      type: "button",
      hidden: true,
      dataset: { act: "next" },
      onclick: onNext,
    });
    const bar = el(
      "div.st-offer",
      null,
      offerLine,
      el("div.st-offer__btns", null, passBtn, offerBtn, nextBtn),
    );
    panel.append(head, grid, bar);

    /** @type {Map<string, any>} */
    const tiles = new Map();
    let shown = -1;
    let lineKey = "";
    let goKey = "";
    let legendKey = "";

    /** How many of the picked thing this customer may have, and how many are chosen. */
    function count(state, c) {
      const it = core.shelf(state).find((i) => i.product === local.selected);
      if (!it || !c) return { it: null, most: 0, n: 0 };
      const most = Math.min(c.wish.qty, it.n);
      return { it, most, n: Math.max(1, Math.min(most, local.qty ?? most)) };
    }
    function stepQty(by) {
      const s = app.state;
      const { most, n } = count(s, s.market.queue[s.market.at]);
      if (local.reaction || !most) return;
      local.qty = Math.max(1, Math.min(most, n + by));
      sync();
    }
    function onOffer() {
      const s = app.state;
      const c = s.market.queue[s.market.at];
      if (local.reaction || !c || !local.selected) return;
      const { n } = count(s, c);
      if (!n) return;
      app.dispatch({ type: "offer", product: local.selected, customer: c.id, n });
    }
    function onPass() {
      const s = app.state;
      const c = s.market.queue[s.market.at];
      if (local.reaction || !c) return;
      app.dispatch({ type: "pass", customer: c.id });
    }
    function onNext() {
      local.reaction = null;
      local.selected = null;
      local.qty = null;
      sync();
    }
    function pick(product) {
      if (local.reaction) return;
      local.selected = local.selected === product ? null : product;
      local.qty = null;
      sync();
    }

    function makeTile(it) {
      const info = it.info;
      const count = el("span.st-item__count");
      const traits = traitLine(info.traits);
      const price = el("span.hh-num");
      const wish = el("span.st-item__wish", { hidden: true }, pic(heartArt(true), 20));
      const node = el(
        "button.st-item",
        {
          type: "button",
          "aria-pressed": "false",
          dataset: { product: it.product },
          onclick: () => pick(it.product),
        },
        el(
          "span.st-item__left",
          null,
          el("span.st-item__pic", null, pic(productPic(info), 36), count),
          el("span.hh-coins.st-item__price", null, pic(item("coin"), 15), price),
        ),
        el(
          "span.st-item__text",
          null,
          el("span.st-item__name", null, info.name, " ", starsPic(info.stars, 12)),
          el("span.st-item__meta", null, traits || null),
        ),
        wish,
      );
      return { node, count, price, wish };
    }

    /** One tile per product, kept from update to update; what they wished for comes first. */
    function syncTiles(items, c) {
      const fits = (it) => core.satisfies(c.wish, it.product);
      const order = [...items].sort((a, b) => Number(fits(b)) - Number(fits(a)));
      const seen = new Set();
      let matches = 0;
      order.forEach((it, i) => {
        let t = tiles.get(it.product);
        if (!t) tiles.set(it.product, (t = makeTile(it)));
        const wish = fits(it);
        if (wish) matches++;
        // The price on the tile is what this customer pays for 1: less when it is not their wish.
        const each = core.quote(app.state, it.product, 1, wish ? "delighted" : "fine");
        t.count.textContent = W.count(it.n);
        t.price.textContent = number(each);
        t.wish.hidden = !wish;
        t.node.classList.toggle("is-wish", wish);
        t.node.setAttribute("aria-pressed", String(local.selected === it.product));
        t.node.setAttribute(
          "aria-label",
          W.tileLabel(it.info.name, it.info.stars, it.n, each, wish),
        );
        if (grid.children[i] !== t.node) grid.insertBefore(t.node, grid.children[i] ?? null);
        seen.add(it.product);
      });
      for (const [product, t] of tiles) {
        if (seen.has(product)) continue;
        t.node.remove();
        tiles.delete(product);
      }
      return matches;
    }

    function setLine(key, make) {
      if (key === lineKey) return;
      lineKey = key;
      offerLine.replaceChildren(qty, ...[make()].flat().filter(Boolean));
    }

    function update(state) {
      const m = state.market;
      const rx = local.reaction;
      const c = rx ? rx.c : m.queue[m.at];
      if (!c) return;
      const items = core.shelf(state);
      if (local.selected && !items.some((i) => i.product === local.selected)) local.selected = null;
      const regular = c.who ? core.REGULARS[c.who] : null;
      const short = c.who ? (REGULAR_WORDS[c.who]?.short ?? regular.name) : null;

      // The stage.
      const entering = shown !== c.id;
      shown = c.id;
      const glad = rx?.mood === "delighted";
      drawScene(glad ? "happy" : "calm");
      showFace(faceOf(c), glad ? "happy" : "calm", entering && !rx);
      const hearts = c.who ? (state.regulars.hearts[c.who] ?? 0) : 0;
      say(
        `${c.id}|${hearts}`,
        () => {
          if (!regular) return [el("b", { text: W.visitor })];
          const next = core.TUNING.HEART_GIFTS.find((n) => n > hearts);
          return [
            el("span", null, el("b", { text: regular.name }), `, ${regular.role}`),
            el(
              "span.st-say__hearts",
              null,
              pic(heartArt(hearts > 0), 16, W.heartsAlt),
              W.hearts(hearts, next),
            ),
          ];
        },
        rx
          ? rx.reply
          : wishLine({
              id: c.id,
              who: c.who,
              type: c.wish.type,
              value: c.wish.value,
              qty: c.wish.qty,
              name: wishName(c.wish.value),
              fair: m.fair,
            }),
      );
      drawWaiting(m.queue.slice(m.at + (rx ? 0 : 1)));
      warmFaces();

      // The shelf.
      shelfTitle.textContent = m.fair ? FAIR.shelf : W.shelf;
      const matches = syncTiles(items, c);
      grid.classList.toggle("is-resting", !!rx);
      const lk = rx ? "" : matches ? "some" : "none";
      if (lk !== legendKey) {
        legendKey = lk;
        legend.replaceChildren(
          ...(lk === "some"
            ? [pic(heartArt(true), 16), W.legend]
            : lk === "none"
              ? [W.noMatch]
              : []),
        );
      }

      // The line and the buttons.
      passBtn.hidden = offerBtn.hidden = !!rx;
      nextBtn.hidden = !rx;
      if (rx) {
        const more = m.at < m.queue.length;
        qty.hidden = true;
        nextBtn.textContent = !items.length ? W.carryOn : more ? W.next : W.toCrate;
        nextBtn.dataset.act = !items.length ? "carry-on" : more ? "next" : "crate";
        const sold = rx.sold;
        setLine(`rx|${c.id}`, () => {
          if (!sold) return el("span", { text: W.passed });
          const info = core.productInfo(sold.product);
          return [
            el(
              "span",
              null,
              el("b", { text: W.sold(howMany(info, sold.n), sold.coins) }),
              rx.heart && short ? ` ${W.heartFrom(short)}` : null,
            ),
            sold.renown
              ? el(
                  "span.hh-chip.hh-chip--leaf",
                  null,
                  safe(() => pic(item("star"), 18)),
                  W.renown(sold.renown),
                )
              : null,
          ];
        });
        if (rx.fresh) {
          rx.fresh = false;
          bar.classList.add("is-settling");
          later(() => bar.classList.remove("is-settling"), 420);
          if (sold) {
            app.sound(glad ? "delighted" : "fine");
            for (let i = 0; i < Math.min(sold.n, 4); i++) app.sound("jar", { delay: 0.07 * i });
            app.sound("coins", { delay: 0.15 });
            app.fx("coins", { from: face, n: Math.min(9, 2 + Math.ceil(sold.coins / 12)) });
            later(() => app.sound("coin"), 720);
            if (glad) restart(face, "is-glad");
            if (rx.heart) {
              later(() => {
                app.sound("heart");
                app.fx("hearts", { at: face, n: 1 });
              }, 380);
              if (rx.heart.gift) later(() => showGift(rx), app.settings.motion ? 1100 : 0);
            }
          } else app.sound("pass");
        }
        return;
      }
      const it = items.find((i) => i.product === local.selected);
      offerBtn.disabled = !it;
      if (!it) {
        qty.hidden = true;
        setLine(`hint|${c.id}`, () => el("span", { text: W.pickHint }));
        if (goKey !== "none") {
          goKey = "none";
          offerBtn.replaceChildren(W.offer);
        }
        return;
      }
      const { most, n } = count(state, c);
      const happy = core.satisfies(c.wish, it.product);
      // Exactly what the core will pay for this offer.
      const pay = core.quote(state, it.product, n, happy ? "delighted" : "fine");
      const stepping = most > 1;
      qty.hidden = !stepping;
      qtyValue.textContent = number(n);
      qtyLess.disabled = n <= 1;
      qtyMore.disabled = n >= most;
      setLine(`pick|${c.id}|${it.product}|${n}|${happy}|${stepping}`, () =>
        el(
          "span",
          null,
          el("b", {
            text: `${W.picked(howMany(it.info, n), most < c.wish.qty ? c.wish.qty : 0)} `,
          }),
          el("span", {
            class: happy ? "hh-good" : "",
            text: happy ? W.wouldDelight(short) : W.wouldDo(short),
          }),
        ),
      );
      const gk = `${it.product}|${pay}`;
      if (gk !== goKey) {
        goKey = gk;
        offerBtn.replaceChildren(W.offer, coinTag(pay, 20));
      }
    }

    return { update };
  }

  // ───────────────────────── a regular's gift ─────────────────────────

  function rewardParts(reward) {
    /** @type {[Node | null, string][]} */
    const out = [];
    if (reward.coins) out.push([pic(item("coin"), 30), W.gift.coins(reward.coins)]);
    for (const [flower, n] of Object.entries(reward.seeds ?? {})) {
      const s = safe(() => seedsArt(flower));
      out.push([s && pic(s, 40), W.gift.seeds(n, core.FLOWERS[flower]?.name ?? flower)]);
    }
    for (const [id, n] of Object.entries(reward.items ?? {})) {
      const s = safe(() => item(id));
      out.push([s && pic(s, 40), W.gift[id]?.(n) ?? String(id)]);
    }
    if (reward.wardrobe) {
      const name =
        core.WARDROBE.hat?.find((h) => h.id === reward.wardrobe)?.name ?? String(reward.wardrobe);
      const s = safe(() => keeper({ ...app.state.keeper, hat: reward.wardrobe }, "bust", "happy"));
      out.push([s && pic(s, 72), W.gift.wardrobe(name)]);
    }
    return out;
  }

  function showGift(rx) {
    const e = rx.heart;
    if (!e?.gift || local.reaction !== rx) return;
    const words = REGULAR_WORDS[e.regular];
    const name = words?.short ?? core.REGULARS[e.regular]?.name ?? "";
    const story = words?.gifts?.[e.gift.n - 1];
    over.replaceChildren(
      el(
        "div.hh-card.hh-card--tint.st-moment.hh-pop",
        { role: "dialog", "aria-label": W.gift.title(name) },
        pic(villager(e.regular, "bust", "happy"), 104),
        el("h2.hh-heading", { text: W.gift.title(name) }),
        el("p.hh-sub", { text: W.gift.hearts(e.hearts) }),
        story ? el("p.hh-text", { text: `“${story}”` }) : null,
        el(
          "div.st-moment__gifts",
          null,
          rewardParts(e.gift.reward).map(([picture, text]) =>
            el("div.st-moment__gift", null, picture, el("span", { text })),
          ),
        ),
        rx.fact ? el("p.hh-sub", { text: W.gift.fact }) : null,
        el("button.hh-btn.hh-btn--block", { type: "button", onclick: closeOver }, W.gift.thanks),
      ),
    );
    over.hidden = false;
    app.sound("claim");
  }

  // ───────────────────────── the other views ─────────────────────────

  function makeCrate() {
    return mountCrate(panel, {
      face: showFace,
      say,
      scene: drawScene,
      close: closeStall,
      faceEl: face,
    });
  }

  /** A picture, a kind word and one button. */
  function message(picture, button, onclick, words, act) {
    const title = el("h2.hh-heading");
    const text = el("p.hh-text");
    panel.append(
      el(
        "div.st-msg",
        null,
        picture,
        title,
        text,
        el("button.hh-btn.hh-btn--block", { type: "button", dataset: { act }, onclick }, button),
      ),
    );
    return {
      update(state) {
        const w = words(state);
        title.textContent = w.title;
        text.textContent = w.text;
        drawScene("calm");
        showFace(null);
        hush();
        drawWaiting(null);
      },
    };
  }

  function makeBare() {
    const comb = safe(() => honeycomb());
    return message(
      comb && pic(comb, 72),
      W.close,
      closeStall,
      (state) =>
        state.market.queue.some((c) => c.bought?.n > 0) || state.purse.today.earned > 0
          ? W.soldOut
          : W.bare,
      "close",
    );
  }

  function makeClosed() {
    return message(
      iconImg("stall", 56),
      W.closed.back,
      () => app.go("meadow"),
      () => W.closed,
      "meadow",
    );
  }

  /** Winter Fair day, before the stall opens: a welcome, then the queue. */
  function makeFair() {
    return {
      update() {
        drawScene("calm");
        showFace(null);
        hush();
        drawWaiting(null);
        if (!over.hidden) return;
        const T = core.TUNING;
        const pics = [() => good("candle"), () => jar("heather", 3), () => good("basket")]
          .map(safe)
          .filter(Boolean);
        over.replaceChildren(
          el(
            "div.hh-card.hh-card--tint.st-moment.hh-pop",
            { role: "dialog", "aria-label": FAIR.title },
            el("div.hh-banner.hh-banner--honey", { text: FAIR.title }),
            el(
              "div.st-moment__pics",
              null,
              pics.map((s) => pic(s, 52)),
            ),
            el("p.hh-text", { text: FAIR.intro(T.FAIR_CUSTOMERS, T.FAIR_PAY) }),
            el(
              "button.hh-btn.hh-btn--block",
              {
                type: "button",
                dataset: { act: "open" },
                onclick: () => {
                  local.fairSeen = true;
                  closeOver();
                  sync();
                },
              },
              FAIR.open,
            ),
          ),
        );
        over.hidden = false;
      },
    };
  }

  // ───────────────────────── up ─────────────────────────

  const first = core.calendarOf(app.state.clock.day);
  await paintAll(
    stageJobs({ season: first.seasonName, look: app.state.keeper, sign: W.sign }),
    (p) => app.progress(p),
  );
  sync();

  return {
    update: (state, events, action) => sync(events ?? [], action),
    unmount() {
      local.alive = false;
      window.removeEventListener("resize", onResize);
      watch?.disconnect();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      view?.dispose?.();
      showView?.unmount?.();
    },
  };
}
