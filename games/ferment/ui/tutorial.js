// @ts-check
/**
 * The first days' notes on screen: the old keeper's note, pinned beside
 * whatever it is about, with a soft ring around that thing.
 *
 * The rules of when a note opens, moves on and goes are in core/tutorial.js;
 * the words in content/tutorial.js. This file only:
 * - finds the element a beat points at (POINTS), on the screen in front;
 * - places the note above or below it and rings it (redrawn with the shop);
 * - dispatches { type: "tutorial", do: "next" } for "Got it", and for beats
 *   that move on by a screen-only step (UI_STEPS: the brew sheet opening, a
 *   jar picked, the market tab, the bench, an order's planner);
 * - pauses the shop clock while a note is up (tipsPaused), so a note never
 *   costs a customer's patience.
 * A beat whose element has gone (the brew sheet was cancelled, the jar was
 * put down) shows the beat before it again until the player gets back.
 */

import { RECIPES } from "../content/recipes.js";
import { TIERS } from "../content/goals.js";
import { KEEPER, MOMENTS } from "../content/tutorial.js";
import { START_GIFT } from "../content/tuning.js";
import { tipNow } from "../core/index.js";
import { patch, setClass } from "./dom.js";

/**
 * Beat point → the elements it means, inside the screen in front (`top`).
 * @type {Record<string, (top: HTMLElement, tip: any) => Element[]>}
 */
const POINTS = {
  gift: (top) =>
    START_GIFT.map(([slot]) => top.querySelector(`.slot[data-slot="${slot}"]:not(.empty)`)).filter(
      (x) => !!x,
    ),
  empty: (top) => some(top, "#shelf .slot.empty"),
  sheet: (top) => some(top, "#sheet:not([hidden]) .panel"),
  brewed: (top, tip) => some(top, `.slot[data-slot="${tip.slot}"]`),
  open: (top) => some(top, '#actions [data-act="open"]'),
  counter: (top) => some(top, "#counter .talk"),
  fits: (top) => {
    const fit = top.querySelectorAll("#shelf .slot.fits");
    return fit.length ? [...fit] : [...top.querySelectorAll("#shelf .slot:not(.dim):not(.empty)")];
  },
  serve: (top) => some(top, '#actions [data-act="serve"]'),
  coins: (top) => some(top, "#coins"),
  preorder: (top) => some(top, '#actions [data-act="preorder"], #actions [data-act="serve"]'),
  board: (top) => some(top, "#board"),
  ticket: (top, tip) => some(top, `#board [data-act="order"][data-order="${tip.order}"]`),
  "plan-go": (top) =>
    some(
      top,
      '.sheet.plan:not([hidden]) [data-act="board-hold"], .sheet.plan:not([hidden]) [data-act="board-start"]',
    ),
  kept: (top, tip) => some(top, `#shelf .slot[data-slot="${tip.slot}"]`),
  "tab-market": (top) => some(top, '.tab[data-tab="market"]'),
  market: (top) => some(top, ".corner.c-market"),
  bench: (top) => some(top, '.actions [data-act="bench"]'),
  "bench-try": (top) => {
    const ready = some(top, '[data-act="bench-try"]:not([disabled])');
    return ready.length ? ready : some(top, ".card.mix");
  },
  "bench-card": (top) => some(top, ".card.rcard"),
  title: (top) => some(top, '#title, [data-r="title"], .top .title'),
};

const some = (/** @type {HTMLElement} */ top, /** @type {string} */ sel) => {
  const el = top.querySelector(sel);
  return el ? [el] : [];
};

/** Screen-only steps a beat waits for: true once the player has made them. */
const UI_STEPS = {
  sheet: (ui) => ui.sheet?.kind === "brew",
  select: (ui) => {
    const c = ui.s.customers.queue[0];
    const j = ui.selected !== null ? ui.s.shelf.slots[ui.selected] : null;
    return !!c && !!j && j.recipe === c.recipe;
  },
  market: (ui) => ui.evening?.tab === "market",
  bench: (ui) => !!ui.bench,
  plan: (ui, tip) => ui.plan?.orderId === tip.order,
};

/** The intro scene or a note is up: the shop clock waits. */
export function tipsPaused(ui) {
  return (ui.s.tutorial.on && ui.s.tutorial.intro) || !!tipNow(ui.s);
}

export function mountTutorial(parent) {
  const layer = document.createElement("div");
  layer.className = "tips";
  layer.innerHTML = `<div class="tip-ring" hidden></div><div class="tip-note" hidden></div>`;
  parent.appendChild(layer);
  return {
    layer,
    ring: /** @type {HTMLElement} */ (layer.firstElementChild),
    note: /** @type {HTMLElement} */ (layer.lastElementChild),
  };
}

/** What the note says, with the shop's own names filled in. */
function words(s, tip, text) {
  const tier = s.progress.tier;
  const opens = Object.values(RECIPES)
    .filter((r) => !r.base && r.tier === tier)
    .map((r) => r.name);
  const join =
    opens.length > 1
      ? `${opens.slice(0, -1).join(", ")} and ${opens.at(-1)} join the menu.`
      : opens.length
        ? `${opens[0]} joins the menu.`
        : "";
  return text
    .replace("{name}", tip.name ?? "This one")
    .replace("{tier}", TIERS[tier].name.toLowerCase())
    .replace("{opens}", join)
    .trim();
}

/** The screen in front: the bench, else the evening, else the shop. */
function front(view, ui) {
  const root = view.layer.parentElement;
  if (ui.bench) return root.querySelector(".bench");
  if (ui.evening) return root.querySelector(".evening");
  return root;
}

/** The beat last scrolled to, so a player scrolling away isn't pulled back. */
let scrolled = "";

const visible = (/** @type {Element} */ el) => {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.top < window.innerHeight &&
    !el.closest("[hidden]")
  );
};

/**
 * @param {{ layer: HTMLElement, ring: HTMLElement, note: HTMLElement }} view
 * @param {any} ui
 * @param {(action: any) => any} dispatch
 */
export function renderTutorial(view, ui, dispatch) {
  let tip = tipNow(ui.s);
  if (tip?.ui && UI_STEPS[tip.ui]?.(ui, tip)) {
    dispatch({ type: "tutorial", do: "next", id: tip.id });
    tip = tipNow(ui.s);
  }
  if (!tip) {
    view.note.hidden = true;
    view.ring.hidden = true;
    return;
  }
  const top = front(view, ui);
  let beat = { ...tip };
  const found = top ? (POINTS[beat.point]?.(top, tip) ?? []) : [];
  let els = found.filter(visible);
  const key = `${tip.id}.${tip.beat}`;
  if (!els.length && found.length && scrolled !== key) {
    // There, but scrolled out of sight (a tall sheet on a small phone): bring it in once.
    scrolled = key;
    found[0].scrollIntoView({ block: "nearest" });
    els = found.filter(visible);
  }
  const prev = MOMENTS[tip.id].beats[tip.beat - 1];
  if (!els.length && prev?.ui && top) {
    // The thing this beat is about has gone; go back to the step that brings it.
    beat = { ...tip, ...prev, info: false };
    els = POINTS[beat.point]?.(top, tip).filter(visible) ?? [];
  }

  const text = words(ui.s, tip, beat.text);
  patch(
    view.note,
    `<p>${text}</p><div class="tip-foot"><span class="sign">${KEEPER.sign}</span>
      <button class="tip-skip" data-act="tip-skip">No more notes</button>
      ${beat.info ? `<button class="tip-ok" data-act="tip-next">Got it</button>` : ""}</div><i class="tip-arrow"></i>`,
  );
  view.note.hidden = false;

  // Ring the target and pin the note above or below it.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const noteW = Math.min(320, vw - 24);
  view.note.style.width = `${noteW}px`;
  const noteH = view.note.offsetHeight;
  if (!els.length) {
    view.ring.hidden = true;
    setClass(view.note, "tip-note free");
    view.note.style.left = `${(vw - noteW) / 2}px`;
    view.note.style.top = `${Math.max(56, vh * 0.3)}px`;
    return;
  }
  const rs = els.map((el) => el.getBoundingClientRect());
  const box = {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
  view.ring.hidden = false;
  // The ring hugs the target, kept on screen (a full-width panel gets a ring just inside the edges).
  const pad = 4;
  const rl = Math.max(3, box.left - pad);
  const rr = Math.min(vw - 3, box.right + pad);
  const rt = Math.max(3, box.top - pad);
  const rb = Math.min(vh - 3, box.bottom + pad);
  Object.assign(view.ring.style, {
    left: `${rl}px`,
    top: `${rt}px`,
    width: `${rr - rl}px`,
    height: `${rb - rt}px`,
  });
  const gap = 14;
  const roomBelow = vh - box.bottom - gap;
  const below = roomBelow >= noteH || roomBelow > box.top - gap;
  let y = below ? box.bottom + gap : box.top - gap - noteH;
  y = Math.max(8, Math.min(vh - noteH - 8, y));
  const cx = (box.left + box.right) / 2;
  const x = Math.max(12, Math.min(vw - noteW - 12, cx - noteW / 2));
  setClass(view.note, `tip-note ${below ? "below" : "above"}`);
  view.note.style.left = `${x}px`;
  view.note.style.top = `${y}px`;
  /** @type {HTMLElement} */ (view.note.querySelector(".tip-arrow")).style.left =
    `${Math.max(16, Math.min(noteW - 16, cx - x))}px`;
}

/**
 * Handle a note's buttons. Returns false for anything else.
 * @param {string} act
 * @param {any} ui
 * @param {(action: any) => any} dispatch
 */
export function tutorialAct(act, ui, dispatch) {
  if (act === "tip-next") {
    const tip = tipNow(ui.s);
    if (tip) dispatch({ type: "tutorial", do: "next", id: tip.id });
    return true;
  }
  if (act === "tip-skip") {
    dispatch({ type: "tutorial", do: "skip" });
    return true;
  }
  return false;
}
