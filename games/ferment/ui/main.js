// @ts-check
/**
 * The Brine Nook — screen entry point. Owns the live state, turns taps into
 * core actions, turns real time into fixed clock steps, and saves.
 *
 * Every change to the game goes through dispatch(action) → core step(). This
 * file and the other ui/ modules only draw state and react to step() events.
 *
 * DOM + inline SVG rather than canvas: the game is panels, jars and buttons.
 * The screen is redrawn from state ~10×/s, but `patch` only touches the DOM
 * when a region's HTML actually changed, so taps never land on a node that
 * is being replaced.
 *
 * Test hook: window.__ferment = { state (get/set), dispatch(action) → events, core }.
 */

import * as C from "../core/index.js";
import { HOUR_SECONDS } from "../content/tuning.js";
import { createStore } from "../../../shared/storage.js";
import { mountShop, renderShop } from "./shop.js";
import { mountBench, renderBench, benchAct } from "./bench.js";
import { boardAct, boardReact, openPlan } from "./board.js";
import { mountEvening, renderEvening, openEvening, eveningAct, eveningReact } from "./evening.js";
import { audioReact } from "./audio.js";
import { toast } from "./dom.js";
import { fxReact } from "./fx.js";
import { mountSettings, renderSettings, settingsAct, onReplayIntro } from "./settings.js";
import { lower, LINES } from "./text.js";
import { mountTutorial, renderTutorial, tutorialAct, tipsPaused } from "./tutorial.js";
import { mountIntro, renderIntro, introAct } from "./intro.js";

const store = createStore("ferment");
const freshSeed = () => (Date.now() % 1e9) | 0;
/** A new shop starts with the intro and the keeper's notes, unless the page says ?tips=off (the phone flows). */
const tips = new URLSearchParams(location.search).get("tips") !== "off";
const freshGame = () => C.newGame(freshSeed(), { tutorial: tips });

/** Game state plus screen-only state. */
const ui = {
  s: C.loadSave(store.get("save")) ?? freshGame(),
  selected: null, // shelf slot index
  departing: null, // { customer, mood, line, pay, f, until }
  sheet: null, // { kind: "brew" | "tip", slot }
  evening: null, // the evening screen when open (ui/evening.js)
  bench: null, // the brewing bench when open (ui/bench.js)
  settings: null, // the settings sheet when open (ui/settings.js)
  intro: null, // the intro scene's picture while it shows (ui/intro.js)
};

function save() {
  store.set("save", ui.s);
}

const els = mountShop(document.body);
document.title = "The Brine Nook · Playground";
const bench = mountBench(els.root);
const evening = mountEvening(els.root);
const settings = mountSettings(els.root);
const tutorialView = mountTutorial(els.root);
const intro = mountIntro(els.root);
onReplayIntro(() => dispatch({ type: "tutorial", do: "replay" }));
// The evening and the bench cover the whole screen: the shop under them goes unpainted.
const render = () => (
  els.root.classList.toggle("covered", !!(ui.evening || ui.bench)),
  renderShop(els, ui),
  renderEvening(evening, ui),
  renderBench(bench, ui),
  renderSettings(settings, ui),
  renderIntro(intro, ui),
  renderTutorial(tutorialView, ui, dispatch)
);

function depart(customer, mood, line, extra = {}) {
  ui.departing = { customer, mood, line, until: performance.now() + 1500, ...extra };
}

/** Apply one action through the core and react to what happened. */
function dispatch(action) {
  const { state, events } = C.step(ui.s, action);
  ui.s = state;
  for (const e of events) react(e);
  return events;
}

function react(e) {
  fxReact(e, ui);
  boardReact(e, (text) => toast(els.toasts, text));
  eveningReact(e, (text) => toast(els.toasts, text));
  audioReact(e);
  switch (e.type) {
    case "popped":
      toast(els.toasts, `A ${lower(e.jar.recipe)} jar popped its lid!`);
      break;
    case "arrived":
      if (e.customer.orderId) toast(els.toasts, `${e.customer.name} is here to collect`);
      break;
    case "tutorialReplayed":
      ui.intro = null;
      break;
    case "left":
      if (e.why === "impatient") {
        toast(els.toasts, `${e.customer.name} got tired of waiting`);
        depart(e.customer, "meh", "“Never mind, I'll go elsewhere.”");
      } else if (e.why === "sent") {
        depart(e.customer, "meh", "“Oh well. Another time.”");
      }
      break;
    case "served":
      depart(e.customer, e.mood, LINES[e.mood], { pay: e.pay, f: e.f });
      ui.selected = null;
      break;
    case "preordered":
      depart(e.customer, "ok", `“Lovely. I'll be back on day ${e.order.due}.”`);
      // Straight to picking the jar that will serve them.
      openPlan(ui, e.order.id);
      break;
    case "brewed":
      ui.sheet = null;
      break;
    case "tippedOut":
      ui.sheet = null;
      ui.selected = null;
      break;
    case "opened":
      ui.selected = null;
      break;
    case "closed":
      openEvening(ui);
      break;
    case "slept":
      if (e.popped.length)
        toast(
          els.toasts,
          `${e.popped.length} jar${e.popped.length > 1 ? "s" : ""} popped overnight`,
        );
      break;
  }
}

/** Swap in a whole other shop (a loaded code, a fresh start), dropping any open screen. */
function replace(s) {
  ui.s = s;
  ui.selected = null;
  ui.departing = null;
  ui.bench = null;
  ui.sheet = null;
  ui.evening = null;
  if (ui.s.clock.phase === "evening") openEvening(ui);
  save();
  render();
}
const restart = () => replace(freshGame());

// ---------- input ----------

els.root.addEventListener("click", (e) => {
  const t = /** @type {HTMLElement | null} */ (
    /** @type {HTMLElement} */ (e.target).closest("[data-act]")
  );
  if (!t) {
    if (e.target === els.sheet && ui.sheet) ui.sheet = null;
    if (e.target === settings) ui.settings = null;
    render();
    return;
  }
  const act = t.dataset.act;
  const s = ui.s;
  if (settingsAct(act, t, ui, (text) => toast(els.toasts, text), { replace, restart })) {
    // handled by the settings sheet
  } else if (introAct(act, ui, dispatch) || tutorialAct(act, ui, dispatch)) {
    // handled by the intro scene or the keeper's notes
  } else if (benchAct(act, t, ui, dispatch, (text) => toast(els.toasts, text))) {
    // handled by the bench
  } else if (boardAct(act, t, ui, dispatch, (text) => toast(els.toasts, text))) {
    // handled by the board
  } else if (eveningAct(act, t, ui, dispatch, (text) => toast(els.toasts, text))) {
    // handled by the evening
  } else if (act === "slot") {
    const i = Number(t.dataset.slot);
    if (!s.shelf.slots[i]) {
      ui.sheet = { kind: "brew", slot: i };
    } else {
      ui.selected = ui.selected === i ? null : i;
    }
  } else if (act === "brew") {
    dispatch({ type: "brew", slot: ui.sheet.slot, recipe: t.dataset.recipe });
  } else if (act === "cancel") {
    ui.sheet = null;
  } else if (act === "open") {
    dispatch({ type: "open" });
  } else if (act === "serve") {
    dispatch({ type: "serve", slot: ui.selected });
  } else if (act === "preorder") {
    dispatch({ type: "preorder" });
  } else if (act === "away") {
    dispatch({ type: "sendAway" });
  } else if (act === "tip-ask") {
    ui.sheet = { kind: "tip", slot: ui.selected };
  } else if (act === "tip") {
    dispatch({ type: "tipOut", slot: ui.sheet?.kind === "tip" ? ui.sheet.slot : ui.selected });
  } else if (act === "close") {
    dispatch({ type: "close" });
  } else if (act === "restart") {
    if (confirm("Start a fresh shop? This day and your jars are lost.")) restart();
  }
  save();
  render();
});

// ---------- loop ----------
// Real time becomes whole fixed steps; the remainder carries to the next frame.

let last = performance.now();
let pending = 0; // in-game hours not yet stepped
let renderT = 0;
let saveT = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  // Settings, the planner, the keeper's notes and the tip-out confirm pause the shop, so nothing moves under the thumb.
  const paused = ui.settings || ui.plan || ui.sheet?.kind === "tip" || tipsPaused(ui);
  if (ui.s.clock.phase === "open" && !paused) {
    pending += dt / HOUR_SECONDS;
    const n = Math.floor(pending * C.STEPS_PER_HOUR);
    if (n > 0) {
      pending -= n / C.STEPS_PER_HOUR;
      const events = dispatch({ type: "tick", n });
      if (events.some((e) => e.type === "closed")) {
        save();
        render();
      }
    }
  } else {
    pending = 0;
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
if (ui.s.clock.phase === "evening") openEvening(ui);
render();
requestAnimationFrame(frame);

/** @type {any} */ (window).__ferment = {
  get state() {
    return ui.s;
  },
  set state(v) {
    replace(C.loadSave(v) ?? freshGame());
  },
  dispatch(action) {
    const events = dispatch(action);
    save();
    render();
    return events;
  },
  core: C,
};
