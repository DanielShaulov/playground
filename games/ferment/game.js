/**
 * The Brine Nook — UI for the demo. Rules live in rules.js; this file only
 * draws the state and turns taps into rule calls.
 *
 * DOM + inline SVG rather than canvas: the game is panels, jars and buttons.
 * Each region is re-rendered from state ~10×/s, but `patch` only touches the
 * DOM when a region's HTML actually changed, so taps never land on a node
 * that is being replaced.
 *
 * Test hook: window.__ferment exposes the live state and the rules module.
 */

import * as R from "./rules.js";
import { createStore } from "../../shared/storage.js";

const { RECIPES, flavour, isOver, bandOf } = R;
const store = createStore("ferment");

let s = load();
let selected = null; // shelf slot index
let departing = null; // { customer, mood, line, pay, until }
let sheet = null; // { kind: "brew", slot } | { kind: "evening", summary }

// ---------- persistence ----------

function load() {
  const saved = store.get("save");
  if (saved && saved.v === 1) return saved;
  return R.newGame((Date.now() % 1e9) | 0);
}
function save() {
  store.set("save", s);
}

// ---------- DOM skeleton ----------

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
document.body.appendChild(root);
document.title = "The Brine Nook · Playground";

const $ = (id) => root.querySelector("#" + id);
const els = {
  title: $("title"),
  rep: $("rep"),
  coins: $("coins"),
  board: $("board"),
  counter: $("counter"),
  shelf: $("shelf"),
  actions: $("actions"),
  sheet: $("sheet"),
  toasts: $("toasts"),
};
const slotEls = [];
for (let r = 0; r < 3; r++) {
  const row = document.createElement("div");
  row.className = "row";
  for (let c = 0; c < 3; c++) {
    const el = document.createElement("div");
    el.className = "slot";
    el.dataset.act = "slot";
    el.dataset.slot = String(slotEls.length);
    slotEls.push(el);
    row.appendChild(el);
  }
  els.shelf.appendChild(row);
}

function patch(el, html) {
  if (el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
}
function setClass(el, cls) {
  if (el.className !== cls) el.className = cls;
}

// ---------- drawing helpers ----------

function seeded(n) {
  let x = (n * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** A jar drawn from its state: brine level = servings, cloud/bubbles/lid = flavour. */
function jarSvg(jar, cls = "jar") {
  const r = RECIPES[jar.recipe];
  const over = isOver(jar);
  const q = Math.round(flavour(jar) * 40) / 40;
  const rnd = seeded(jar.id + 7);
  const level = Math.round(30 - 48 * (jar.servings / R.SERVINGS));
  const clip = `jc${jar.id}${cls}`;
  let bits = "";
  for (let i = 0; i < 7; i++) {
    const x = -22 + rnd() * 34;
    const y = level + 6 + rnd() * Math.max(2, 22 - level);
    const w = 10 + rnd() * 4;
    const h = 6 + rnd() * 3;
    const a = -28 + rnd() * 56;
    if (y < 30)
      bits += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${r.bits}" transform="rotate(${a.toFixed(0)} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})"/>`;
  }
  const nBub = over ? 12 : Math.round(q * 11);
  let bubs = "";
  for (let i = 0; i < 12; i++) {
    const x = -19 + rnd() * 38;
    const y = level + 4 + rnd() * Math.max(2, 30 - level);
    const rad = 1.6 + rnd() * 1.6;
    if (i < nBub)
      bubs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  }
  const dome = 2 + q * 14;
  const lid = over
    ? `<g transform="rotate(-26 -20 -36)"><path d="M-24 -32 Q0 -48 24 -32 Z" fill="#a46f45"/><rect x="-24" y="-38" width="48" height="8" rx="2" fill="#8f6440"/></g>
       <g fill="#fff" stroke="#e2683f" stroke-width="1.5"><circle cx="-2" cy="-42" r="3"/><circle cx="7" cy="-50" r="2.5"/><circle cx="1" cy="-57" r="2"/></g>`
    : `<path d="M-24 -38 Q0 ${(-38 - dome).toFixed(1)} 24 -38 Z" fill="#a46f45"/><rect x="-24" y="-40" width="48" height="10" rx="2" fill="#8f6440"/>`;
  return `<svg class="${cls}" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
    <rect x="-26" y="-30" width="52" height="66" rx="12" fill="#fbfbf7" stroke="#bfae96" stroke-width="2.5"/>
    <clipPath id="${clip}"><rect x="-24" y="-28" width="48" height="62" rx="10"/></clipPath>
    <g clip-path="url(#${clip})">
      <rect x="-26" y="${level}" width="52" height="${40 - level}" fill="${r.brine}" opacity=".6"/>
      ${bits}
      <rect x="-26" y="${level}" width="52" height="${40 - level}" fill="#fff" opacity="${(0.04 + q * 0.5).toFixed(2)}"/>
      ${bubs}
    </g>
    <rect x="-17" y="-26" width="6" height="56" rx="3" fill="#fff" opacity=".5"/>
    ${lid}
  </svg>`;
}

const emptyJarSvg = `<svg class="jar" viewBox="-32 -62 64 100" preserveAspectRatio="xMidYMax meet">
  <rect x="-25" y="-38" width="50" height="74" rx="12" fill="none" stroke="#c9b08e" stroke-width="2" stroke-dasharray="5 4"/>
  <text x="0" y="8" text-anchor="middle" font-size="26" fill="#c9b08e">+</text></svg>`;

function strip({ f = null, ghosts = [], win = null, ticks = [], big = false } = {}) {
  let h = "";
  if (win)
    h += `<i class="win" style="left:${(win.lo * 100).toFixed(1)}%;width:${((win.hi - win.lo) * 100).toFixed(1)}%"></i>`;
  for (const g of ghosts) h += `<i class="mark ghost" style="left:${(g * 100).toFixed(1)}%"></i>`;
  for (const t of ticks)
    h += `<i class="tick" style="left:${(t.at * 100).toFixed(1)}%"><span>${t.label}</span></i>`;
  if (f !== null) h += `<i class="mark" style="left:${(f * 100).toFixed(1)}%"></i>`;
  return `<div class="strip${big ? " big" : ""}">${h}</div>`;
}
const stripLabels = `<div class="strip-labels"><span class="crisp">crisp</span><span class="tangy">tangy</span><span class="sour">sour</span><span class="funky">funky</span></div>`;

const SKIN = ["#f2c79b", "#e0ac7e", "#c68a5e", "#9a6440", "#f5d6bf"];
const HAIR = ["#5b3a29", "#2f2420", "#c9a063", "#8a3b22", "#9a9a9a"];
const SHIRT = ["#6aa0c8", "#c8746a", "#7fae55", "#b48ad0", "#e0b04a", "#5c8a86"];

/** A customer whose face shows their mood: content, impatient, delighted, so-so, let down. */
function faceSvg(look, mood) {
  const skin = SKIN[look % 5];
  const hair = HAIR[Math.floor(look / 5) % 5];
  const shirt = SHIRT[Math.floor(look / 25) % 6];
  const style = Math.floor(look / 150) % 3;
  const hairPath = [
    "M14 34 Q40 0 66 34 Q56 20 40 22 Q24 20 14 34",
    "M12 40 Q10 6 40 8 Q70 6 68 40 Q62 22 40 20 Q18 22 12 40",
    "M16 30 Q40 4 64 30 Q52 26 40 18 Q30 26 16 30",
  ][style];
  const mouth = {
    wait: `<path d="M33 50 Q40 55 47 50" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    impatient: `<path d="M33 53 L47 52" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M27 33 L36 36 M53 33 L44 36" stroke="#4a3524" stroke-width="2" stroke-linecap="round"/><path d="M62 26 q4 6 0 8 q-4 -2 0 -8" fill="#7cc2e8"/>`,
    delight: `<path d="M31 48 Q40 62 49 48 Z" fill="#7a3a2a"/><circle cx="26" cy="47" r="4" fill="#f29a8a" opacity=".6"/><circle cx="54" cy="47" r="4" fill="#f29a8a" opacity=".6"/>`,
    ok: `<path d="M33 51 Q40 54 47 51" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    meh: `<path d="M33 55 Q40 49 47 55" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  }[mood];
  const eyes =
    mood === "delight"
      ? `<path d="M29 41 q3 -4 6 0 M45 41 q3 -4 6 0" stroke="#4a3524" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      : `<circle cx="32" cy="40" r="3" fill="#4a3524"/><circle cx="48" cy="40" r="3" fill="#4a3524"/>`;
  return `<svg viewBox="0 0 80 112"><path d="M6 112 Q10 74 40 72 Q70 74 74 112 Z" fill="${shirt}"/><circle cx="40" cy="40" r="26" fill="${skin}"/><path d="${hairPath}" fill="${hair}"/>${eyes}${mouth}</svg>`;
}

const word = (x) => {
  const b = bandOf(x).id;
  return `<b class="w-${b}">${b}</b>`;
};
const lower = (recipe) => RECIPES[recipe].name.toLowerCase();

function requestLine(c) {
  const mid = (c.lo + c.hi) / 2;
  if (c.orderId) return `“My pre-order: ${lower(c.recipe)}, ${word(mid)}!”`;
  return [
    `“${RECIPES[c.recipe].name}, nice and ${word(mid)} please.”`,
    `“Got any ${word(mid)} ${lower(c.recipe)}?”`,
    `“A jar of ${lower(c.recipe)}. I like it ${word(mid)}.”`,
  ][c.look % 3];
}

function clockText() {
  if (s.phase === "morning") return "Morning";
  if (s.phase === "evening") return "Evening";
  const t = R.OPEN_AT + s.clock;
  const h = Math.floor(t);
  const m = Math.floor(((t - h) * 60) / 10) * 10;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// ---------- render ----------

let lastCoins = s.coins;
let lastRep = s.rep;

function render() {
  const c = s.phase === "open" ? s.queue[0] : null;
  const showing = departing && performance.now() < departing.until ? departing : null;
  if (!showing) departing = null;
  const cust = showing ? null : c;
  const sel = selected !== null ? s.shelf[selected] : null;
  if (selected !== null && !sel) selected = null;

  // top bar
  patch(els.title, `🫙 Day ${s.day} · ${clockText()}`);
  patch(els.rep, `♥ ${s.rep}`);
  patch(els.coins, `🪙 ${s.coins}`);
  if (s.coins !== lastCoins) bump(els.coins);
  if (s.rep !== lastRep) bump(els.rep);
  lastCoins = s.coins;
  lastRep = s.rep;

  // order board
  patch(
    els.board,
    s.orders
      .slice()
      .sort((a, b) => a.due - b.due)
      .map((o) => {
        const today = o.due === s.day;
        return `<div class="ticket${today ? " today" : ""}"><div class="who"><span>${RECIPES[o.recipe].name}</span><span class="due">${today ? "Today" : "Day " + o.due}</span></div>${strip({ win: o })}</div>`;
      })
      .join(""),
  );

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
    const matching = s.shelf.filter((j) => j && j.recipe === cust.recipe && !isOver(j));
    const selF =
      sel && sel.recipe === cust.recipe && !isOver(sel)
        ? Math.round(flavour(sel) * 200) / 200
        : null;
    const ghosts = matching.filter((j) => j !== sel).map((j) => Math.round(flavour(j) * 100) / 100);
    const low = cust.patience / (cust.orderId ? R.PATIENCE * 1.5 : R.PATIENCE) < 0.35;
    setClass(els.counter, "counter");
    patch(
      els.counter,
      `<div class="face">${faceSvg(cust.look, low ? "impatient" : "wait")}</div>
       <div class="talk"><div class="say"><small>${cust.name}${cust.orderId ? " · pre-order" : ""}</small>${requestLine(cust)}</div>
       <div>${strip({ win: cust, f: selF, ghosts, big: true })}${stripLabels}</div>
       <div class="patience${low ? " low" : ""}"><b></b></div></div>
       <div class="queue">${"<i></i>".repeat(Math.max(0, s.queue.length - 1))}</div>`,
    );
    const bar = els.counter.querySelector(".patience b");
    const max = cust.orderId ? R.PATIENCE * 1.5 : R.PATIENCE;
    if (bar) bar.style.width = `${Math.max(0, (cust.patience / max) * 100).toFixed(1)}%`;
  } else {
    setClass(els.counter, "counter idle");
    let html;
    if (s.phase === "morning") {
      const due = s.orders.filter((o) => o.due === s.day).length;
      html = `<div><b>Morning, day ${s.day}</b>Tap an empty shelf spot to start a jar, then open the shop.${due ? ` ${due} pre-order${due > 1 ? "s" : ""} collecting today.` : ""}</div>`;
    } else if (s.phase === "evening") {
      html = `<div><b>Closed for the night</b>The jars keep working while you sleep.</div>`;
    } else {
      html = `<div><b>The shop is quiet</b>Someone will be in soon.</div>`;
    }
    patch(els.counter, html);
  }

  // shelf
  s.shelf.forEach((jar, i) => {
    const el = slotEls[i];
    if (!jar) {
      setClass(el, "slot empty" + (cust ? " dim" : ""));
      patch(
        el,
        `${emptyJarSvg}<div class="lbl">Empty<small>${s.phase === "evening" ? "&nbsp;" : "tap to brew"}</small></div>`,
      );
      return;
    }
    const f = Math.round(flavour(jar) * 200) / 200;
    const over = isOver(jar);
    const relevant = cust && jar.recipe === cust.recipe && !over;
    const fits = relevant && f >= cust.lo && f <= cust.hi;
    let cls = "slot";
    if (cust && !relevant) cls += " dim";
    if (fits) cls += " fits";
    if (i === selected) cls += " sel";
    setClass(el, cls);
    const status = over
      ? `<small style="color:#8e5bb0">lid popped</small>`
      : `<small>${word(f)}</small>`;
    patch(
      el,
      `${jarSvg(jar)}${strip({ f, win: relevant ? cust : null })}<div class="lbl">${RECIPES[jar.recipe].name}${status}</div>`,
    );
  });

  // actions
  patch(els.actions, actionsHtml(cust, sel));

  // sheet
  if (sheet) {
    els.sheet.hidden = false;
    patch(els.sheet, sheetHtml());
  } else {
    els.sheet.hidden = true;
  }
}

function actionsHtml(cust, sel) {
  const tip =
    sel && isOver(sel)
      ? `<button class="main warn" data-act="tip">Tip out jar<small>it has gone over</small></button>`
      : "";
  if (s.phase === "morning") {
    return `<button data-act="restart">Start over</button>${tip || `<button class="main" data-act="open">Open shop ▶</button>`}`;
  }
  if (s.phase === "evening") {
    return `<button class="main" data-act="summary">Today's takings</button>`;
  }
  if (!cust) {
    return `<button data-act="close">Close early</button>${tip}`;
  }
  let main = tip;
  if (!main) {
    const name = RECIPES[cust.recipe].name;
    if (sel && sel.recipe === cust.recipe) {
      main = `<button class="main" data-act="serve">Serve ${name}</button>`;
    } else {
      const have = s.shelf.some((j) => j && j.recipe === cust.recipe && !isOver(j));
      main = `<button class="main" disabled>${have ? `Tap a ${lower(cust.recipe)} jar` : `No ${lower(cust.recipe)} on the shelf`}</button>`;
    }
  }
  const pre = cust.orderId
    ? ""
    : `<button data-act="preorder">Pre-order<small>due day ${R.dueDayFor(s, cust)}</small></button>`;
  return `${pre}${main}<button data-act="away">Send away<small>♥ −${cust.orderId ? 2 : 1}</small></button>`;
}

function sheetHtml() {
  if (sheet.kind === "brew") {
    const rows = R.RECIPE_IDS.map((id, i) => {
      const r = RECIPES[id];
      const ticks = [];
      for (let d = 1; d <= 5; d++) {
        const at = R.forecast(id, d * 24);
        if (at >= 1) break;
        ticks.push({ at, label: d + "d" });
      }
      const order = s.orders.find((o) => o.recipe === id);
      const fresh = { id: 900 + i, recipe: id, age: 0, servings: R.SERVINGS };
      return `<button class="recipe" data-act="brew" data-recipe="${id}" ${s.coins < r.cost ? "disabled" : ""}>
        ${jarSvg(fresh, "icon")}
        <div class="info"><div class="name"><span>${r.name}</span><span>🪙 ${r.cost}</span></div>
        ${strip({ ticks, win: order ?? null })}</div></button>`;
    }).join("");
    return `<div class="panel"><h2>Start a jar</h2>
      <p>Dots show where the jar will be after each day. A green box is a pre-order you could time it for.</p>
      ${rows}<div class="btns"><button data-act="cancel">Cancel</button></div></div>`;
  }
  const t = sheet.summary;
  const dr = s.rep - t.repStart;
  return `<div class="panel"><h2>Day ${s.day} closed</h2><p>Jars on the shelf will age overnight.</p>
    <div class="stats">
      <div><b>${t.served}</b>customers served</div>
      <div><b>🪙 ${t.earned}</b>earned, ${t.tips} in tips</div>
      <div><b>${dr >= 0 ? "+" : "−"}${Math.abs(dr)} ♥</b>reputation</div>
      <div><b>${t.preorders}</b>pre-orders taken</div>
      ${t.missed ? `<div><b>${t.missed}</b>pre-orders missed</div>` : ""}
      ${t.left ? `<div><b>${t.left}</b>walked out waiting</div>` : ""}
    </div>
    <div class="btns"><button class="main" data-act="sleep">Sleep → Day ${s.day + 1}</button></div></div>`;
}

function bump(el) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  els.toasts.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

function depart(customer, mood, line, extra = {}) {
  departing = { customer, mood, line, until: performance.now() + 1500, ...extra };
}

// ---------- events and input ----------

function handle(events) {
  for (const e of events) {
    if (e.type === "popped") toast(`A ${lower(e.jar.recipe)} jar popped its lid!`);
    else if (e.type === "arrived" && e.customer.orderId)
      toast(`${e.customer.name} is here to collect`);
    else if (e.type === "left" && e.why === "impatient") {
      toast(`${e.customer.name} got tired of waiting`);
      depart(e.customer, "meh", "“Never mind, I'll go elsewhere.”");
    }
  }
}

const LINES = {
  delight: "“Perfect, exactly how I like it!”",
  ok: "“Close enough. Thanks.”",
  meh: "“Hmm. Not really what I asked for.”",
};

root.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) {
    if (e.target === els.sheet && sheet?.kind === "brew") sheet = null;
    render();
    return;
  }
  const act = t.dataset.act;
  if (act === "slot") {
    const i = Number(t.dataset.slot);
    if (!s.shelf[i]) {
      if (s.phase !== "evening") sheet = { kind: "brew", slot: i };
    } else {
      selected = selected === i ? null : i;
    }
  } else if (act === "brew") {
    const res = R.brew(s, sheet.slot, t.dataset.recipe);
    if (res.ok) sheet = null;
  } else if (act === "cancel") {
    sheet = null;
  } else if (act === "open") {
    R.openShop(s);
    selected = null;
  } else if (act === "serve") {
    const f = flavour(s.shelf[selected]);
    const res = R.serve(s, selected);
    if (res.ok) {
      depart(res.customer, res.mood, LINES[res.mood], { pay: res.pay, f });
      selected = null;
    }
  } else if (act === "preorder") {
    const res = R.preorder(s);
    if (res.ok) depart(res.customer, "ok", `“Lovely. I'll be back on day ${res.order.due}.”`);
  } else if (act === "away") {
    const res = R.sendAway(s);
    if (res.ok) depart(res.customer, "meh", "“Oh well. Another time.”");
  } else if (act === "tip") {
    R.tipOut(s, selected);
    selected = null;
  } else if (act === "close") {
    const res = R.closeShop(s);
    if (res.ok) showSummary();
  } else if (act === "summary") {
    showSummary();
  } else if (act === "sleep") {
    const res = R.sleep(s);
    sheet = null;
    if (res.popped.length)
      toast(`${res.popped.length} jar${res.popped.length > 1 ? "s" : ""} popped overnight`);
  } else if (act === "restart") {
    if (confirm("Start a fresh shop? This day and your jars are lost.")) {
      s = R.newGame((Date.now() % 1e9) | 0);
      selected = null;
    }
  }
  save();
  render();
});

function showSummary() {
  sheet = { kind: "evening", summary: { ...s.today } };
  departing = null;
}

// ---------- loop ----------

let last = performance.now();
let renderT = 0;
let saveT = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (s.phase === "open") {
    const events = R.tick(s, dt / R.HOUR_SECONDS);
    handle(events);
    if (s.phase === "evening") {
      showSummary();
      save();
      render();
    }
  }
  renderT += dt;
  saveT += dt;
  if (renderT >= 0.1) {
    renderT = 0;
    render();
  }
  if (saveT >= 2) {
    saveT = 0;
    save();
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
});
if (s.phase === "evening") showSummary();
render();
requestAnimationFrame(frame);

window.__ferment = {
  get state() {
    return s;
  },
  set state(v) {
    s = v;
    selected = null;
    sheet = s.phase === "evening" ? { kind: "evening", summary: { ...s.today } } : null;
    render();
  },
  R,
};
