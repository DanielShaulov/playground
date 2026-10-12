// @ts-check
/**
 * The shop screen: top bar, order board, counter, shelf and action buttons,
 * drawn from the game state plus the screen-only `ui` state (selected jar,
 * departing customer, open sheet). Buttons carry data-act for main.js.
 */

import { RECIPES } from "../content/recipes.js";
import { PATIENCE, PREORDER_PATIENCE } from "../content/tuning.js";
import { flavour, isOver, dueFor, onMenu } from "../core/index.js";
import { jarSvg, emptyJarSvg } from "./art/jar.js";
import { faceSvg } from "./art/customer.js";
import { strip, stripLabels } from "./strip.js";
import { word, lower, requestLine, clockText } from "./text.js";
import { sheetHtml } from "./sheets.js";
import { renderBoard, freeFor, portionsHtml, keptFor, whoNote } from "./board.js";
import { patch, setClass, bump } from "./dom.js";

/** Build the screen's fixed skeleton; returns the elements render() fills in. */
export function mountShop(parent) {
  const root = document.createElement("div");
  root.className = "app";
  root.innerHTML = `
  <header class="top">
    <a class="back" href="../../index.html" aria-label="Back to games">‹</a>
    <div class="title" id="title"></div>
    <div class="pill rep" id="rep"></div>
    <div class="pill coins" id="coins"></div>
  </header>
  <div class="board" id="board"></div>
  <section class="counter" id="counter"></section>
  <section class="shelf" id="shelf"></section>
  <footer class="actions" id="actions"></footer>
  <div class="sheet" id="sheet" hidden></div>
  <div class="toasts" id="toasts"></div>`;
  parent.appendChild(root);
  const $ = (id) => root.querySelector("#" + id);
  const els = {
    root,
    title: $("title"),
    rep: $("rep"),
    coins: $("coins"),
    board: $("board"),
    counter: $("counter"),
    shelf: $("shelf"),
    actions: $("actions"),
    sheet: $("sheet"),
    toasts: $("toasts"),
    slots: [],
  };
  for (let r = 0; r < 3; r++) {
    const row = document.createElement("div");
    row.className = "row";
    for (let c = 0; c < 3; c++) {
      const el = document.createElement("div");
      el.className = "slot";
      el.dataset.act = "slot";
      el.dataset.slot = String(els.slots.length);
      els.slots.push(el);
      row.appendChild(el);
    }
    els.shelf.appendChild(row);
  }
  return els;
}

let lastCoins = null;
let lastRep = null;

export function renderShop(els, ui) {
  const s = ui.s;
  const queue = s.customers.queue;
  const c = s.clock.phase === "open" ? queue[0] : null;
  const showing = ui.departing && performance.now() < ui.departing.until ? ui.departing : null;
  if (!showing) ui.departing = null;
  const cust = showing ? null : c;
  const sel = ui.selected !== null ? s.shelf.slots[ui.selected] : null;
  if (ui.selected !== null && !sel) ui.selected = null;

  // top bar
  patch(els.title, `🫙 Day ${s.clock.day} · ${clockText(s)}`);
  patch(els.rep, `♥ ${s.shop.rep}`);
  patch(els.coins, `🪙 ${s.shop.coins}`);
  if (lastCoins !== null && s.shop.coins !== lastCoins) bump(els.coins);
  if (lastRep !== null && s.shop.rep !== lastRep) bump(els.rep);
  lastCoins = s.shop.coins;
  lastRep = s.shop.rep;

  // order board
  renderBoard(els.board, ui);

  // counter
  if (showing) {
    setClass(els.counter, "counter");
    patch(
      els.counter,
      `<div class="face">${faceSvg(showing.customer.look, showing.mood)}</div>
       <div class="talk"><div class="say"><small>${showing.customer.name}</small>${showing.line}</div>
       ${showing.f !== undefined ? `<div>${strip({ win: showing.customer, f: showing.f, big: true })}${stripLabels}</div>` : ""}</div>
       ${showing.pay ? `<div class="float">+${showing.pay} 🪙</div>` : ""}`,
    );
  } else if (cust) {
    const matching = s.shelf.slots.filter(
      (j) => j && j.recipe === cust.recipe && !isOver(j) && freeFor(s, j, cust),
    );
    const selF =
      sel && sel.recipe === cust.recipe && !isOver(sel) && freeFor(s, sel, cust)
        ? Math.round(flavour(sel) * 200) / 200
        : null;
    const ghosts = matching
      .filter((j) => j.id !== sel?.id)
      .map((j) => Math.round(flavour(j) * 100) / 100);
    const max = cust.orderId ? PATIENCE * PREORDER_PATIENCE : PATIENCE;
    const low = cust.patience / max < 0.35;
    setClass(els.counter, "counter");
    patch(
      els.counter,
      `<div class="face">${faceSvg(cust.look, low ? "impatient" : "wait")}</div>
       <div class="talk"><div class="say"><small>${cust.name}${whoNote(cust)}</small>${requestLine(cust)}</div>
       <div>${strip({ win: cust, f: selF, ghosts, big: true })}${stripLabels}</div>
       <div class="patience${low ? " low" : ""}"><b></b></div></div>
       <div class="queue">${"<i></i>".repeat(Math.max(0, queue.length - 1))}</div>`,
    );
    const bar = els.counter.querySelector(".patience b");
    if (bar) bar.style.width = `${Math.max(0, (cust.patience / max) * 100).toFixed(1)}%`;
  } else {
    setClass(els.counter, "counter idle");
    let html;
    if (s.clock.phase === "morning") {
      const due = s.orders.list.filter((o) => o.due === s.clock.day).length;
      html = `<div><b>Morning, day ${s.clock.day}</b>Tap an empty shelf spot to start a jar, then open the shop.${due ? ` ${due} order${due > 1 ? "s" : ""} to collect today.` : ""}</div>`;
    } else if (s.clock.phase === "evening") {
      html = `<div><b>Closed for the night</b>The jars keep working while you sleep.</div>`;
    } else {
      html = `<div><b>The shop is quiet</b>Someone will be in soon.</div>`;
    }
    patch(els.counter, html);
  }

  // shelf
  s.shelf.slots.forEach((jar, i) => {
    const el = els.slots[i];
    if (!jar) {
      setClass(el, "slot empty" + (cust ? " dim" : ""));
      patch(
        el,
        `${emptyJarSvg}<div class="lbl">Empty<small>${s.clock.phase === "evening" ? "&nbsp;" : "tap to brew"}</small></div>`,
      );
      return;
    }
    const f = Math.round(flavour(jar) * 200) / 200;
    const over = isOver(jar);
    const kept = keptFor(s, jar);
    const relevant = cust && jar.recipe === cust.recipe && !over && freeFor(s, jar, cust);
    const fits = relevant && f >= cust.lo && f <= cust.hi;
    let cls = "slot";
    if (cust && !relevant) cls += " dim";
    if (fits) cls += " fits";
    if (i === ui.selected) cls += " sel";
    if (kept && !freeFor(s, jar, null)) cls += " held";
    setClass(el, cls);
    const status = over
      ? `<small style="color:#8e5bb0">lid popped</small>`
      : kept && !freeFor(s, jar, null)
        ? `<small>for ${kept}</small>`
        : `<small>${word(f)}</small>`;
    patch(
      el,
      `${jarSvg(jar)}${strip({ f, win: relevant ? cust : null })}<div class="lbl"><span>${RECIPES[jar.recipe].name}${portionsHtml(s, jar)}</span>${status}</div>`,
    );
  });

  // actions
  patch(els.actions, actionsHtml(s, cust, sel));

  // sheet
  if (ui.sheet) {
    els.sheet.hidden = false;
    patch(els.sheet, sheetHtml(s, ui.sheet));
  } else {
    els.sheet.hidden = true;
  }
}

function actionsHtml(s, cust, sel) {
  const tip =
    sel && isOver(sel)
      ? `<button class="main warn" data-act="tip">Tip out jar<small>it has gone over</small></button>`
      : "";
  if (s.clock.phase === "morning") {
    return `<button data-act="restart">Start over</button>${tip || `<button class="main" data-act="open">Open shop ▶</button>`}`;
  }
  if (s.clock.phase === "evening") {
    return `<button class="main" data-act="summary">Today's takings</button>`;
  }
  if (!cust) {
    return `<button data-act="close">Close early</button>${tip}`;
  }
  let main = tip;
  if (!main) {
    const name = RECIPES[cust.recipe].name;
    const keptSel =
      sel && sel.recipe === cust.recipe && !freeFor(s, sel, cust) ? keptFor(s, sel) : "";
    if (keptSel) {
      main = `<button class="main hold" data-act="board-release">For ${keptSel}<small>tap to sell it anyway</small></button>`;
    } else if (sel && sel.recipe === cust.recipe) {
      main = `<button class="main" data-act="serve">Serve ${name}</button>`;
    } else {
      const have = s.shelf.slots.some(
        (j) => j && j.recipe === cust.recipe && !isOver(j) && freeFor(s, j, cust),
      );
      main = `<button class="main" disabled>${have ? `Tap a ${lower(cust.recipe)} jar` : `No ${lower(cust.recipe)} on the shelf`}</button>`;
    }
  }
  const pre =
    cust.orderId || !onMenu(s, cust.recipe)
      ? ""
      : `<button data-act="preorder">Pre-order<small>due day ${dueFor(s, cust).due}</small></button>`;
  return `${pre}${main}<button data-act="away">Send away<small>♥ −${cust.orderId ? 2 : 1}</small></button>`;
}
