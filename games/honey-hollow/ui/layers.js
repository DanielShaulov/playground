// @ts-check
/**
 * The page's layers and the small things that live in them: the loading
 * card, toasts, confirm cards and keeper's notes. app.js puts these on `app`;
 * a screen calls app.toast() and friends and never imports this file.
 *
 * Bottom to top inside #hh-app (ui/shell.css lays them out):
 *
 *   .hh-layer-scene   the full scene (one at a time, cross-faded)
 *   .hh-layer-sheet   the bottom sheet and its scrim
 *   .hh-layer-dialog  confirm cards
 *   .hh-layer-note    keeper's notes (never take a tap)
 *   .hh-toasts        toasts (never take a tap); the kit's own container
 *   .hh-layer-fx      coins, hearts, sparkles (never take a tap)
 *   #hh-loading       the loading card, from index.html
 */

import { el, on } from "./dom.js";
import { SHELL } from "./words.js";

/** Screens ask `app.settings.motion`; this file and fx.js ask this. */
export const motion = { calm: false };

function build() {
  let root = document.getElementById("hh-app");
  if (!root) {
    root = el("div.hh-app", { id: "hh-app" });
    document.body.append(root);
  }
  const layer = (classes, attrs) => {
    const node = el(`div.${classes}`, attrs);
    root.append(node);
    return node;
  };
  return {
    root,
    scene: layer("hh-layer.hh-layer-scene"),
    sheet: layer("hh-layer.hh-layer-sheet"),
    dialog: layer("hh-layer.hh-layer-dialog"),
    note: layer("hh-layer.hh-layer-note"),
    toast: layer("hh-toasts", { role: "status", "aria-live": "polite" }),
    fx: layer("hh-layer.hh-layer-fx", { "aria-hidden": "true" }),
  };
}

export const layers = build();

// ───────────────────────── what is on top ─────────────────────────
//
// Sheets and confirm cards are modal: what is under them goes inert (no
// taps, no focus), and the Android back button or Escape closes the top one.

export const modal = { sheet: false, dialogs: 0 };

export function syncModal() {
  layers.scene.inert = modal.sheet || modal.dialogs > 0;
  layers.sheet.inert = modal.dialogs > 0;
}

/** @type {{ close: () => void }[]} */
const backs = [];

// The back button. While anything closable is open the page keeps exactly one
// extra history entry; back takes that entry and we close the top thing (and
// put the entry back if more are open). When the last thing closes some other
// way we take the entry away ourselves with history.back(), and until the
// browser has answered that we push nothing: a push made while a traversal
// is pending lands the page on the wrong entry.
let armed = false;
let disarming = false;

try {
  // A reload while a sheet was open leaves our entry behind. Make it plain.
  if (history.state?.hh) history.replaceState(null, "");
} catch {
  /* no history to speak of */
}

function syncBack() {
  if (disarming) return; // the popstate below calls this again
  try {
    if (backs.length && !armed) {
      history.pushState({ hh: 1 }, "");
      armed = true;
    } else if (!backs.length && armed) {
      disarming = true;
      history.back();
    }
  } catch {
    /* a sandboxed frame without history: Escape and the buttons still work */
    disarming = false;
  }
}

on(window, "popstate", () => {
  armed = false;
  if (disarming) disarming = false;
  else backs.pop()?.close(); // the player pressed back
  syncBack();
});

/**
 * Something closable has opened. Back (and Escape) will call `close`.
 * Returns `release`, to call when it closes any other way.
 * @param {() => void} close
 * @returns {() => void}
 */
export function pushBack(close) {
  const entry = { close };
  backs.push(entry);
  syncBack();
  return () => {
    const i = backs.indexOf(entry);
    if (i < 0) return;
    backs.splice(i, 1);
    syncBack();
  };
}

on(document, "keydown", (e) => {
  if (e.key !== "Escape") return;
  if (dismissNote()) return;
  const top = backs[backs.length - 1];
  if (top) {
    e.preventDefault();
    top.close();
  }
});

// iOS leaves the page nudged up after the keyboard closes; put it back.
on(document, "focusout", () => {
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
});

/** Move focus without scrolling or summoning a ring on touch. */
export function focusQuietly(node) {
  try {
    node?.focus?.({ preventScroll: true });
  } catch {
    /* an element that cannot take focus is fine */
  }
}

// ───────────────────────── the loading card ─────────────────────────

const card = document.getElementById("hh-loading");
let shown = 0;

export const veil = {
  /** Bring the loading card up (a scene that takes a while to paint). */
  show() {
    if (!card) return;
    card.hidden = false;
    card.classList.remove("is-leaving");
  },
  /** Progress 0..1. Never runs backwards while the card is up. */
  set(p) {
    shown = Math.max(shown, Math.min(1, Number(p) || 0));
    const fill = card?.querySelector(".hh-loading__fill");
    if (fill) /** @type {HTMLElement} */ (fill).style.transform = `scaleX(${shown})`;
  },
  hide() {
    if (!card || card.hidden) return;
    shown = 0;
    if (motion.calm) {
      card.hidden = true;
      return;
    }
    card.classList.add("is-leaving");
    setTimeout(() => {
      if (!card.classList.contains("is-leaving")) return;
      card.hidden = true;
      card.classList.remove("is-leaving");
      veil.set(0);
    }, 260);
  },
};

// ───────────────────────── toasts ─────────────────────────

const TOAST_MS = 2600;
const TOAST_MAX = 2;
/** @type {{ node: HTMLElement, text: string, timer: any, until: number }[]} */
const toasts = [];

/** A painted sprite, an element or a character, as a toast's little picture. */
function iconOf(icon) {
  if (!icon) return null;
  if (icon instanceof Node) return el("span.hh-toast__icon", null, icon);
  if (icon.canvas instanceof HTMLCanvasElement) {
    const pic = el("img", { alt: "", draggable: "false" });
    /** @type {HTMLImageElement} */ (pic).src = icon.canvas.toDataURL("image/png");
    return el("span.hh-toast__icon", null, pic);
  }
  return el("span.hh-toast__icon", { text: String(icon) });
}

/**
 * A short line that comes and goes by itself. At most two are up (one while a
 * sheet is open, so it fits above the sheet); a line that is already showing
 * just stays a little longer, and a line with no room waits its turn.
 *
 * @param {string} text
 * @param {{ icon?: any }} [opts]  icon: a sprite, an element or a character
 */
export function toast(text, opts = {}) {
  const line = String(text ?? "").trim();
  if (!line) return;
  const again = toasts.find((t) => t.text === line);
  if (again) {
    keepToast(again, TOAST_MS);
    return;
  }
  if (waiting.some((w) => w.text === line)) return;
  if (!toastRoom()) {
    if (waiting.length >= TOAST_WAIT) waiting.shift();
    waiting.push({ text: line, icon: opts.icon });
    // Somebody is waiting: the oldest line makes way sooner.
    if (toasts[0]) keepToast(toasts[0], Math.min(toasts[0].until - Date.now(), TOAST_HURRY));
    return;
  }
  showToast(line, opts.icon);
}

/** @type {{ text: string, icon?: any }[]} */
const waiting = [];
const TOAST_WAIT = 4;
const TOAST_HURRY = 1300;

const toastRoom = () => toasts.length < (modal.sheet ? 1 : TOAST_MAX);

function keepToast(t, ms) {
  clearTimeout(t.timer);
  t.until = Date.now() + Math.max(0, ms);
  t.timer = setTimeout(() => dropToast(t), Math.max(0, ms));
}

function showToast(line, icon) {
  const node = el("div.hh-toast", null, iconOf(icon), el("span.hh-toast__text", { text: line }));
  const t = { node, text: line, timer: 0, until: 0 };
  toasts.push(t);
  layers.toast.append(node);
  keepToast(t, waiting.length ? TOAST_HURRY + 500 : TOAST_MS);
}

function dropToast(t, atOnce = false) {
  clearTimeout(t.timer);
  const i = toasts.indexOf(t);
  if (i >= 0) toasts.splice(i, 1);
  if (atOnce || motion.calm) t.node.remove();
  else {
    t.node.classList.add("is-leaving");
    setTimeout(() => t.node.remove(), 220);
  }
  while (waiting.length && toastRoom()) {
    const next = /** @type {{ text: string, icon?: any }} */ (waiting.shift());
    showToast(next.text, next.icon);
  }
}

// ───────────────────────── confirm ─────────────────────────

let confirmCount = 0;

/**
 * Ask a yes-or-no question on a small paper card. Resolves true for yes;
 * false for no, a tap outside, Escape or the back button.
 *
 * `detail` is small print under the text: the reason a thing failed, in the
 * machine's own words, for a screenshot.
 *
 * @param {{ title?: string, text?: string, detail?: string, yes?: string, no?: string, danger?: boolean }} q
 * @returns {Promise<boolean>}
 */
export function confirm(q = {}) {
  return new Promise((resolve) => {
    const id = `hh-confirm-${++confirmCount}`;
    const before = document.activeElement;
    let open = true;
    const done = (answer) => {
      if (!open) return;
      open = false;
      release();
      modal.dialogs--;
      syncModal();
      const gone = () => wrap.remove();
      if (motion.calm) gone();
      else {
        wrap.inert = true;
        wrap.classList.add("is-leaving");
        scrim.classList.add("is-leaving");
        setTimeout(gone, 170);
      }
      if (before instanceof HTMLElement && before.isConnected) focusQuietly(before);
      resolve(answer);
    };
    const no = el(
      "button.hh-btn.hh-btn--secondary",
      { type: "button", onclick: () => done(false) },
      [q.no ?? SHELL.no],
    );
    const yes = el(
      `button.hh-btn${q.danger ? ".hh-btn--danger" : ""}`,
      { type: "button", onclick: () => done(true) },
      [q.yes ?? SHELL.yes],
    );
    const paper = el(
      "div.hh-card.hh-confirm",
      {
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": q.title ? `${id}-t` : null,
        "aria-describedby": q.text ? `${id}-d` : null,
        tabindex: "-1",
      },
      q.title && el("h2.hh-confirm__title", { id: `${id}-t`, text: q.title }),
      q.text && el("p.hh-confirm__text", { id: `${id}-d`, text: q.text }),
      q.detail && el("p.hh-confirm__detail", { text: q.detail }),
      el("div.hh-confirm__actions", null, no, yes),
    );
    const scrim = el("div.hh-scrim", { onclick: () => done(false) });
    const wrap = el("div.hh-dialog", null, [scrim, paper]);
    layers.dialog.append(wrap);
    // A card that has only just come up takes no taps for a moment, so a
    // double tap cannot answer it by accident: "asks twice" must mean twice.
    wrap.classList.add("is-settling");
    setTimeout(() => wrap.classList.remove("is-settling"), 350);
    modal.dialogs++;
    syncModal();
    const release = pushBack(() => done(false));
    focusQuietly(paper);
  });
}

// ───────────────────────── keeper's notes ─────────────────────────

/** Which notes this save has shown. app.js swaps in the stored memory. */
export const noteMemory = {
  /** @type {(id: string) => boolean} */ has: () => false,
  /** @type {(id: string) => void} */ add: () => {},
};

/** @type {null | { wrap: HTMLElement, offs: (() => void)[], timers: any[] }} */
let noteUp = null;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A rectangle for an anchor: an element, a selector, a rect or a point. */
function rectOf(anchor) {
  let a = anchor;
  if (typeof a === "string") a = document.querySelector(a);
  if (a instanceof Element) {
    if (!a.isConnected) return null;
    a = a.getBoundingClientRect();
  }
  if (!a || typeof a !== "object") return null;
  const left = a.left ?? a.x;
  const top = a.top ?? a.y;
  if (typeof left !== "number" || typeof top !== "number") return null;
  const width = a.width ?? a.w ?? 0;
  const height = a.height ?? a.h ?? 0;
  if (a instanceof DOMRect && !width && !height) return null;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/**
 * Show a keeper's note: a slip of paper pointing at something. It never
 * blocks: the next tap anywhere puts it away and still does what it was
 * going to do. Each id shows once per save unless `again` is set.
 *
 * @param {string} id
 * @param {{
 *   text: string,
 *   anchor?: Element | string | { x: number, y: number } | { left: number, top: number, width: number, height: number },
 *   place?: "above" | "below" | "auto",
 *   again?: boolean,
 * }} opts
 * @returns {boolean} whether it was shown
 */
export function note(id, opts) {
  const { text, anchor, place = "auto", again = false } = opts ?? /** @type {any} */ ({});
  if (!id || !text) return false;
  if (!again && noteMemory.has(id)) return false;
  dismissNote();
  noteMemory.add(id);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "hh-note-arrow");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  svg.append(path);
  const slip = el("div.hh-note", { role: "note", dataset: { note: id } }, [
    el("p.hh-note__text", { text }),
  ]);
  const pos = el("div.hh-note-pos", null, slip);
  const wrap = el("div.hh-note-wrap", null, svg, pos);
  layers.note.append(wrap);

  const lay = () => {
    const W = layers.note.clientWidth;
    const H = layers.note.clientHeight;
    const pad = 6;
    const n = pos.getBoundingClientRect();
    const a = rectOf(anchor);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!a) {
      pos.style.left = `${Math.round((W - n.width) / 2)}px`;
      pos.style.top = `${Math.round(H * 0.36 - n.height / 2)}px`;
      path.setAttribute("d", "");
      return;
    }
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    // The arrow's room. The slip keeps a margin above itself for its tape,
    // so it needs less when it sits below the thing.
    const gapAbove = 44;
    const gapBelow = 30;
    const roomAbove = a.top - gapAbove - n.height - pad;
    const roomBelow = H - a.bottom - gapBelow - n.height - pad;
    let above = place === "above" || (place !== "below" && ay > H / 2);
    if (above && roomAbove < 0 && roomBelow > roomAbove) above = false;
    else if (!above && roomBelow < 0 && roomAbove > roomBelow) above = true;
    const left = clamp(ax - n.width / 2, pad, Math.max(pad, W - n.width - pad));
    const top = clamp(
      above ? a.top - gapAbove - n.height : a.bottom + gapBelow,
      pad,
      Math.max(pad, H - n.height - pad),
    );
    pos.style.left = `${Math.round(left)}px`;
    pos.style.top = `${Math.round(top)}px`;

    // A loose pencil arrow from the slip's edge to just short of the thing.
    // It leaves the slip a little to one side: off-centre looks hand-drawn,
    // and the top edge has a piece of tape in the middle.
    const s = slip.getBoundingClientRect();
    const mid = s.left + s.width / 2;
    const lean = ax < mid ? 1 : -1;
    let sx = clamp(ax + lean * 24, s.left + 16, s.right - 16);
    if (!above && Math.abs(sx - mid) < 42) sx = clamp(mid - lean * 42, s.left + 12, s.right - 12);
    const sy = above ? s.bottom + 4 : s.top - 4;
    const ex = clamp(ax, 8, W - 8);
    const ey = above ? a.top - 7 : a.bottom + 7;
    const far = above ? ey - sy : sy - ey;
    if (far < 14) {
      path.setAttribute("d", "");
      return;
    }
    const bow = Math.sign(sx - ex || lean) * Math.min(16, far * 0.35);
    const cx = (sx + ex) / 2 + bow;
    const cy = (sy + ey) / 2;
    const len = Math.hypot(ex - cx, ey - cy) || 1;
    const ux = (ex - cx) / len;
    const uy = (ey - cy) / len;
    const f = (v) => v.toFixed(1);
    const barb = (turn) => {
      const c = Math.cos(turn);
      const d = Math.sin(turn);
      return `${f(ex - (ux * c - uy * d) * 11)} ${f(ey - (ux * d + uy * c) * 11)}`;
    };
    path.setAttribute(
      "d",
      `M${f(sx)} ${f(sy)} Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)} M${barb(0.5)} L${f(ex)} ${f(ey)} L${barb(-0.58)}`,
    );
  };

  lay();
  const up = { wrap, offs: [], timers: [] };
  noteUp = up;
  // Lay it out again once whatever it points at has finished sliding in, and
  // only then show it; after that a tap anywhere puts it away.
  up.timers.push(
    setTimeout(() => {
      lay();
      wrap.classList.add("is-up");
    }, 260),
    setTimeout(() => {
      if (noteUp !== up) return;
      up.offs.push(on(document, "pointerdown", () => dismissNote(), true));
    }, 650),
  );
  up.offs.push(on(window, "resize", lay));
  return true;
}

/** Put the note away. True if there was one. */
export function dismissNote() {
  const up = noteUp;
  if (!up) return false;
  noteUp = null;
  for (const off of up.offs) off();
  for (const t of up.timers) clearTimeout(t);
  if (motion.calm || !up.wrap.classList.contains("is-up")) up.wrap.remove();
  else {
    up.wrap.classList.remove("is-up");
    setTimeout(() => up.wrap.remove(), 200);
  }
  return true;
}
