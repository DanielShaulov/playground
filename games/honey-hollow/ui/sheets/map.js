// @ts-check
/**
 * The map: `app.sheet("map")`. The Hollow's four plots as a two-by-two quilt
 * of painted portraits: each is the plot's real ground (ui/art/ground.js)
 * with its trees, rocks, beds and hives standing on it as they are today.
 *
 * A plot of yours: tap it to walk there (`app.setUi({ plot })`, and the
 * sheet closes). A plot that is not yours yet: tap it and the card below
 * tells you what is special about it, while the footer, which never scrolls
 * away, says what it costs and what you would have left, over "Buy" (which
 * asks once, because it is the biggest thing coins are spent on). A plot you
 * cannot afford yet rests, and says how much more it takes. The card opens
 * on the cheapest plot still for sale.
 *
 * The portraits are painted after the sheet is up, one plot at a time and at
 * the size they are shown, so opening the map never waits for them; each is
 * repainted only when what stands on its plot, the season or its size changes.
 *
 * For tests: tiles are `[data-act="plot"][data-plot]`, the footer's buttons
 * `[data-act="buy-plot"]` and `[data-act="walk"]`.
 */

import { app } from "../app.js";
import { el, css, frame } from "../dom.js";
import { put, img, paintAll, DPR } from "../paint/sprite.js";
import { ground } from "../art/ground.js";
import { bed as bedArt } from "../art/flowers.js";
import { tree as treeArt, rock as rockArt } from "../art/scenery.js";
import { hive as hiveArt } from "../art/hives.js";
import { item } from "../art/goods.js";
import { icon } from "../art/icons.js";
import { say, number } from "../words.js";
import { MAP as W } from "../words/planning.js";

const styled = css(new URL("./map.css", import.meta.url));

export const title = W.title;

// A portrait: the ground, square, with a tenth of its height above it for the
// tops of trees. The meadow's own proportions (ui/meadow/layout.js).
const N = 6;
const PAD = 0.036;
const ROOM = 0.1;
const FEET = 0.86;
const SEASONS = ["spring", "summer", "autumn", "winter"];

/** @param {any} s @param {number} width */
const pic = (s, width, alt = "", cls = "hh-pic") => {
  const p = img(s, width, alt);
  p.className = cls;
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

/** A bed's sprite; a flower or stage the painters do not know falls back. */
function bedSprite(flower, stage, variant) {
  try {
    return bedArt(flower, stage, variant);
  } catch {
    return bedArt("clover", "leaf", 0);
  }
}

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const C = app.core;
  root.classList.add("hh-map");
  let alive = true;

  /** The plot the card and the footer are about. @type {string | null} */
  let focus = null;
  /** A plot bought while the sheet is open: the card stays on it until another is tapped. */
  let bought = "";
  /** For a moment after a purchase the footer's buttons take no tap (the second tap of a double tap). */
  let settleUntil = 0;

  const owned = (/** @type {string} */ id) => !!app.state.land.plots[id]?.owned;
  const priceOf = (/** @type {string} */ id) =>
    C.shopNow(app.state).plots.find((p) => p.plot === id)?.price ?? C.PLOTS[id].price;

  /** Why a plot cannot be bought right now, in words; "" when it can. */
  function resting(id) {
    const can = C.canBuyPlot(app.state, id);
    if (can === true) return "";
    if (can === "no-coins") return W.short(priceOf(id) - app.state.purse.coins);
    return say(can);
  }

  // ---------- the portraits ----------

  /** @type {Record<string, { node: HTMLElement, thumb: HTMLElement, canvas: HTMLCanvasElement, tag: HTMLElement, lock: HTMLElement, sig: string }>} */
  const tiles = {};

  /** The width a plot's portrait is shown at, in CSS px: what it is painted at. */
  const sizeOf = (/** @type {string} */ id) =>
    Math.max(96, Math.min(240, Math.round(tiles[id].thumb.clientWidth) || 160));

  /** Everything standing on a plot, back row first, each with the sprite it needs. */
  function standing(state, id) {
    const season = C.calendarOf(state.clock.day).season;
    const ts = C.treeStageOf(state);
    /** @type {{ x: number, y: number, key: string, make: () => any }[]} */
    const out = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const t = C.terrainAt(id, x, y);
        if (t === "tree") out.push({ x, y, key: `T${ts}`, make: () => treeArt(ts, (x + y) % 2) });
        else if (t === "rock")
          out.push({ x, y, key: "R", make: () => rockArt((x * 2 + y) % 3, season === 3) });
        const sq = /** @type {any} */ (C.squareAt(state, id, x, y));
        if (sq?.t === "bed") {
          const st = C.stageOf(state, sq);
          out.push({
            x,
            y,
            key: `${sq.flower}.${st}`,
            make: () => bedSprite(sq.flower, st, (x * 7 + y * 13) % 2),
          });
        } else if (sq?.t === "hive") {
          const type = C.hiveById(state, sq.id)?.type ?? "skep";
          out.push({ x, y, key: `H${type}`, make: () => hiveArt(/** @type {any} */ (type)) });
        }
      }
    const size = sizeOf(id);
    return {
      season,
      size,
      items: out,
      sig: `${size}|${season}|${out.map((i) => `${i.x}${i.y}${i.key}`).join(",")}`,
    };
  }

  const queue = new Set();
  let pumping = false;

  /** Paint the portraits that are waiting, one plot at a time, without freezing the sheet. */
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (alive && queue.size) {
        const id = queue.values().next().value;
        queue.delete(id);
        await frame();
        if (!alive) return;
        const { season, size, items, sig } = standing(app.state, id);
        if (sig === tiles[id].sig) continue; // asked for twice while it was being painted
        const terrain = C.PLOTS[id].terrain;
        const pad = size * PAD;
        const room = Math.round(size * ROOM);
        const land = () =>
          ground(id, /** @type {any} */ (SEASONS[season]), size, size, terrain, pad);
        await paintAll([land, ...items.map((i) => i.make)]);
        if (!alive) return;
        const tile = tiles[id];
        const canvas = tile.canvas;
        canvas.width = Math.round(size * DPR);
        canvas.height = Math.round((size + room) * DPR);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.drawImage(land().canvas, 0, room, size, size);
        const step = (size - pad * 2) / N;
        for (const it of items)
          put(
            ctx,
            it.make(),
            pad + (it.x + 0.5) * step,
            room + pad + (it.y + FEET) * step,
            step / 64,
          );
        tile.sig = sig;
        tile.node.classList.add("is-painted");
      }
    } catch (err) {
      console.error("[hollow] map portrait:", err);
    } finally {
      pumping = false;
    }
  }

  // ---------- the quilt ----------

  const coinsText = el("span");
  const lead = el("p.hh-sub.hh-map__lead");
  const purse = el("div.hh-map__purse", null, [
    lead,
    el("span.hh-chip.hh-chip--honey", null, [pic(item("coin"), 20, "", "hh-icon"), coinsText]),
  ]);

  const quilt = el(
    "div.hh-map__quilt",
    null,
    C.PLOT_IDS.map((id) => {
      const info = C.PLOTS[id];
      const canvas = /** @type {HTMLCanvasElement} */ (
        el("canvas.hh-map__canvas", { "aria-hidden": "true" })
      );
      const tag = el("span.hh-map__tag");
      const lock = el("span.hh-map__lock", { hidden: true }, pic(icon("lock"), 22, "", "hh-icon"));
      const thumb = el("span.hh-map__thumb", null, [canvas, lock]);
      const node = el(
        "button.hh-map__tile",
        {
          type: "button",
          dataset: { act: "plot", plot: id },
          onclick: () => {
            if (owned(id)) return go(id);
            focus = id;
            bought = "";
            draw();
            panel.scrollIntoView({
              block: "nearest",
              behavior: app.settings.motion ? "smooth" : "auto",
            });
          },
        },
        [thumb, el("span.hh-map__name", { text: info.name }), tag],
      );
      tiles[id] = { node, thumb, canvas, tag, lock, sig: "" };
      return node;
    }),
  );

  // ---------- the card about one plot ----------

  const pName = el("h3.hh-heading.hh-map__pname");
  const pChipText = el("span");
  const pCoin = pic(item("coin"), 20, "", "hh-icon");
  const pChip = el("span.hh-chip", null, [pCoin, pChipText]);
  const pBlurb = el("p.hh-map__blurb");
  const pFacts = el("p.hh-sub.hh-map__facts");
  const panel = el("div.hh-card.hh-map__panel", { hidden: true }, [
    el("div.hh-map__phead", null, [pName, pChip]),
    pBlurb,
    pFacts,
  ]);

  root.append(purse, quilt, panel);

  // ---------- the footer: the price, what is left, and the button, always in view ----------

  const fName = el("b");
  const fMoney = el("span");
  const buyText = el("span");
  const buyBtn = el(
    "button.hh-btn.hh-btn--block",
    { type: "button", dataset: { act: "buy-plot" }, onclick: () => focus && buy(focus) },
    [pic(item("coin"), 22, "", "hh-icon"), buyText],
  );
  const goBtn = el(
    "button.hh-btn.hh-btn--block.hh-btn--leaf",
    {
      type: "button",
      dataset: { act: "walk" },
      onclick: () => {
        if (focus && performance.now() >= settleUntil) go(focus);
      },
    },
    W.go,
  );
  const foot = el("div.hh-sheet__foot.hh-map__foot", { hidden: true }, [
    el("p.hh-map__money", null, [fName, fMoney]),
    buyBtn,
    goBtn,
  ]);
  root.after(foot);

  // ---------- doing ----------

  function go(id) {
    if (!app.state.land.plots[id]?.owned) return;
    app.setUi({ plot: id, selected: null });
    app.closeSheet();
  }

  async function buy(id) {
    if (performance.now() < settleUntil) return;
    const why = resting(id);
    if (why) {
      app.toast(why, { sound: "nope" });
      return;
    }
    const price = priceOf(id);
    const yes = await app.confirm(W.confirm(id, price, app.state.purse.coins - price));
    if (!yes || !alive) return;
    const events = app.dispatch({ type: "buyPlot", plot: id });
    if (!events.some((e) => e.type === "plotBought")) return;
    bought = id;
    focus = id;
    settleUntil = performance.now() + 600;
    app.sound("buy");
    app.toast(W.bought(id), { sound: false });
    app.fx("pop", { el: tiles[id].node });
    app.fx("sparkle", { at: tiles[id].node, n: 9 });
    draw();
  }

  function draw() {
    const state = app.state;
    const coins = state.purse.coins;
    const forSale = C.PLOT_IDS.filter((id) => !state.land.plots[id]?.owned);

    text(coinsText, number(coins));
    text(lead, forSale.length ? W.purse(coins) : W.purseAll);

    // The card stays on a plot just bought; otherwise it is about one still for sale.
    if (focus && state.land.plots[focus]?.owned && focus !== bought) focus = null;
    if (!focus) focus = forSale[0] ?? null;

    for (const id of C.PLOT_IDS) {
      const tile = tiles[id];
      const plot = state.land.plots[id];
      const mine = !!plot?.owned;
      const here = mine && app.ui.plot === id;
      tile.node.classList.toggle("is-mine", mine);
      tile.node.classList.toggle("is-here", here);
      tile.node.classList.toggle("is-on", focus === id);
      show(tile.lock, !mine);
      const hives = state.hives.list.filter((h) => h.plot === id).length;
      let beds = 0;
      let blooming = 0;
      for (const sq of plot?.squares ?? []) {
        if (!sq || sq.t !== "bed") continue;
        beds += 1;
        if (C.stageOf(state, /** @type {any} */ (sq)) === "bloom") blooming += 1;
      }
      const counts = W.counts(hives, beds, blooming);
      const price = mine ? 0 : priceOf(id);
      text(tile.tag, here ? W.here : mine ? counts : W.price(price));
      tile.node.setAttribute(
        "aria-label",
        mine
          ? `${C.PLOTS[id].name}. ${here ? W.here : W.yours}. ${counts}. ${here ? W.stay : W.go}.`
          : `${C.PLOTS[id].name}. ${W.price(price)}.`,
      );

      if (focus === id) {
        const name = C.PLOTS[id].name;
        text(pName, name);
        text(pBlurb, C.PLOTS[id].blurb);
        text(pChipText, mine ? W.yours : number(price));
        show(pCoin, !mine);
        const chipClass = `hh-chip ${mine ? "hh-chip--leaf" : "hh-chip--honey"}`;
        if (pChip.className !== chipClass) pChip.className = chipClass;
        if (mine) {
          text(pFacts, counts);
          text(fName, W.bought(id));
          text(fMoney, "");
        } else {
          const only = C.FLOWER_IDS.filter((f) => C.FLOWERS[f].unlock.plot === id).map(
            (f) => C.FLOWERS[f].name,
          );
          text(
            pFacts,
            [only.length ? W.onlyHere(only) : "", W.perk[id] ?? ""].filter(Boolean).join(" "),
          );
          const why = resting(id);
          text(fName, W.footName(name, price));
          text(fMoney, why || W.left(coins - price));
          text(buyText, W.buy(price));
          buyBtn.setAttribute("aria-disabled", why ? "true" : "false");
        }
        show(buyBtn, !mine);
        show(goBtn, mine);
      }

      // Repaint a portrait only when what stands on its plot (or its size) has changed.
      if (standing(state, id).sig !== tile.sig) queue.add(id);
    }
    show(panel, !!focus);
    show(foot, !!focus);
    root.classList.toggle("hh-map--nofoot", !focus);
    if (queue.size) pump();
  }

  // The plot on show first: it is the one the eye goes to.
  queue.add(app.ui.plot);
  draw();

  // A portrait is painted at the size it is shown: a change of width repaints it.
  const watch =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (alive) draw();
        })
      : null;
  watch?.observe(quilt);

  return {
    update() {
      draw();
    },
    unmount() {
      alive = false;
      watch?.disconnect();
    },
  };
}
