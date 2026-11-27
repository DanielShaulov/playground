// @ts-check
/**
 * The spine. One object, `app`, that every screen imports:
 *
 *   import { app } from "../app.js";
 *
 * It holds the game state, is the only door to the core (`app.dispatch`),
 * saves, and puts screens up: full scenes (`app.go`) and bottom sheets
 * (`app.sheet`). docs/honey-hollow/screens.md describes each member.
 *
 * A scene or a sheet is a module that exports
 *
 *   mount(root, params) → { update?(state, events, action), unmount?() }
 *
 * and is registered by name in scenes/index.js or sheets/index.js. `mount`
 * builds its DOM into `root` (it may be async); `update` runs after every
 * dispatch while the screen is up; `unmount` stops timers and listeners.
 *
 * Besides real actions, `update` and `app.on` subscribers are called with no
 * events and one of these, so a screen that redraws from `app.state` and
 * `app.ui` in `update` is always right:
 *
 *   { type: "@ui" }        app.setUi() changed app.ui, or a sheet opened/closed
 *   { type: "@replace" }   the whole state was swapped (new game, restore, tests)
 *   { type: "@settings", key, value }
 *
 * This is the only file that imports the core.
 */

import * as core from "../core/index.js";
import { createStore } from "../../../shared/storage.js";
import { SCENES } from "./scenes/index.js";
import { SHEETS } from "./sheets/index.js";
import { el, on, optional } from "./dom.js";
import { say, SHELL } from "./words.js";
import { fx, warmFx } from "./fx.js";
import {
  layers,
  modal,
  motion,
  syncModal,
  pushBack,
  focusQuietly,
  veil,
  toast,
  confirm,
  note,
  dismissNote,
  noteMemory,
} from "./layers.js";

/** @typedef {import("../core/types.js").State} State */
/** @typedef {import("../core/types.js").Action} Action */
/** @typedef {import("../core/types.js").GameEvent} GameEvent */
/** @typedef {(state: State, events: GameEvent[], action: Action) => void} Subscriber */
/** @typedef {{ update?: Subscriber, unmount?: () => void }} Screen */

const store = createStore("honey-hollow");

/** Log a problem and tell the player once, quietly. Never throws. */
let told = false;
export function report(err, where = "") {
  console.error(`[hollow]${where ? ` ${where}:` : ""}`, err);
  flush();
  if (told) return;
  told = true;
  toast(SHELL.wentWrong);
}

function safely(fn, where) {
  try {
    return fn?.();
  } catch (err) {
    report(err, where);
  }
}

// ───────────────────────── settings ─────────────────────────
//
// Kept apart from the save, so a new game or a restored one keeps them.
// `motion` is true when things may move: the player has not asked for
// reduced motion here, and the phone has not asked for it either.

const SPEEDS = ["normal", "fast"];
const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
/** @type {{ sound?: boolean, motion?: boolean, speed?: string, notes?: string[] }} */
const prefs = { ...(store.get("settings", {}) ?? {}) };
if (!Array.isArray(prefs.notes)) prefs.notes = [];

/** @type {{ sound: boolean, motion: boolean, speed: "normal" | "fast" }} */
const settings = { sound: true, motion: true, speed: "normal" };

function applySettings() {
  settings.sound = prefs.sound !== false;
  settings.motion = prefs.motion !== false && !reduce?.matches;
  settings.speed = prefs.speed === "fast" ? "fast" : "normal";
  motion.calm = !settings.motion;
  document.documentElement.dataset.motion = settings.motion ? "full" : "calm";
}
applySettings();
reduce?.addEventListener?.("change", applySettings);

/**
 * @param {"sound" | "motion" | "speed"} key
 * @param {boolean | string} value
 */
function setSetting(key, value) {
  if (key === "speed" ? !SPEEDS.includes(String(value)) : typeof value !== "boolean") return;
  if (key !== "sound" && key !== "motion" && key !== "speed") return;
  /** @type {any} */ (prefs)[key] = value;
  store.set("settings", prefs);
  applySettings();
  notify(app.state, [], { type: "@settings", key, value });
}

/** Forget which keeper's notes were shown, so each shows once more. */
function forgetNotes() {
  prefs.notes = [];
  store.set("settings", prefs);
}

noteMemory.has = (id) => prefs.notes.includes(id);
noteMemory.add = (id) => {
  if (prefs.notes.includes(id)) return;
  prefs.notes.push(id);
  store.set("settings", prefs);
};

// ───────────────────────── saving ─────────────────────────
//
// At most once a second while playing, and at once when the page is hidden
// or left, which is the last moment a phone promises.

const SAVE_EVERY_MS = 1000;
let dirty = false;
let lastSave = -SAVE_EVERY_MS;
/** @type {any} */
let saveTimer = 0;

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, Math.max(0, SAVE_EVERY_MS - (performance.now() - lastSave)));
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!dirty || !app.state) return;
  dirty = false;
  lastSave = performance.now();
  store.set("save", app.state);
}

on(window, "pagehide", flush);
on(document, "visibilitychange", () => {
  if (document.hidden) flush();
});

const freshSeed = () => ((Date.now() % 2147483647) ^ Math.floor(Math.random() * 2147483647)) >>> 0;

/** A playable state from whatever a store or a code held, or null. */
function revive(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    // A copy, so loadSave can never hand back (or scribble on) the caller's object.
    return core.loadSave(JSON.parse(JSON.stringify(raw))) ?? null;
  } catch (err) {
    console.error("[hollow] loadSave threw:", err);
    return null;
  }
}

/** The first plot the keeper owns: where the meadow opens. */
function homePlot(state) {
  const plots = state?.land?.plots ?? {};
  return Object.keys(plots).find((id) => plots[id]?.owned) ?? Object.keys(plots)[0] ?? "home";
}

/** Swap the whole state. Nothing is drawn here; callers decide what shows next. */
function adopt(state) {
  app.state = state;
  Object.assign(app.ui, { plot: homePlot(state), mode: null, selected: null });
  dirty = true;
  flush();
}

/**
 * Read the save from the store (boot). A save that will not open is moved
 * to "save-broken" and a new game starts, so nothing is lost and nothing
 * crashes. Returns what happened.
 */
function load() {
  const raw = store.get("save");
  const state = revive(raw);
  const broken = raw !== null && !state;
  if (broken) store.set("save-broken", raw);
  adopt(state ?? core.newGame(freshSeed()));
  notify(app.state, [], { type: "@replace" });
  return { found: !!state, broken };
}

/** A fresh game in place of this one. Notes show again; settings stay. */
function newGame() {
  prefs.notes = [];
  store.set("settings", prefs);
  adopt(core.newGame(freshSeed()));
  notify(app.state, [], { type: "@replace" });
}

/** Wipe the game and go back to the title. */
function reset() {
  newGame();
  return go("title");
}

// A backup code is the save as JSON, in URL-safe base64, behind a short tag.
const CODE_TAG = "HH1.";

function exportSave() {
  const bytes = new TextEncoder().encode(JSON.stringify(app.state));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return CODE_TAG + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The state inside a backup code (or pasted JSON), or null. Changes nothing. */
function readSave(text) {
  try {
    let body = String(text ?? "").replace(/\s+/g, "");
    if (!body) return null;
    if (body.startsWith(CODE_TAG)) {
      const b64 = body.slice(CODE_TAG.length).replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
      body = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } else if (!body.startsWith("{")) return null;
    return revive(JSON.parse(body));
  } catch {
    return null;
  }
}

/** Replace the game with the one in `text`. False (and nothing changes) if it will not open. */
function importSave(text) {
  const state = readSave(text);
  if (!state) return false;
  adopt(state);
  notify(app.state, [], { type: "@replace" });
  go("title");
  return true;
}

/** Tests: swap the state and draw the current scene afresh from it. */
function replaceState(raw) {
  const state = revive(raw);
  if (!state) throw new Error("__hollow.state: core.loadSave refused that state");
  adopt(state);
  closeSheet();
  if (scene) go(scene.name, scene.params, { instant: true });
  notify(app.state, [], { type: "@replace" });
}

// ───────────────────────── dispatch ─────────────────────────

/** @type {Set<Subscriber>} */
const subscribers = new Set();
/** @type {[State, GameEvent[], Action][]} */
const rounds = [];
let notifying = false;

/**
 * Tell every screen and subscriber what happened. A dispatch made from
 * inside a subscriber has already been applied (so it returns its events),
 * but its round waits here until the one in progress is done: everyone sees
 * every change, in order. One subscriber throwing stops nobody else.
 */
function notify(state, events, action) {
  rounds.push([state, events, action]);
  if (notifying) return;
  notifying = true;
  try {
    for (let n = 0; rounds.length; n++) {
      if (n > 500) {
        rounds.length = 0;
        throw new Error("a subscriber dispatches on every dispatch: stopped after 500 rounds");
      }
      const [s, ev, a] = rounds.shift();
      const hearers = [
        scene?.handle.update && (() => scene.handle.update(s, ev, a)),
        sheet?.handle.update && (() => sheet.handle.update(s, ev, a)),
        ...[...subscribers].map((fn) => () => fn(s, ev, a)),
      ];
      for (const hear of hearers) {
        if (!hear) continue;
        try {
          hear();
        } catch (err) {
          report(err, "a subscriber threw");
        }
      }
    }
  } catch (err) {
    report(err, "dispatch");
  } finally {
    notifying = false;
  }
}

/**
 * Put an action through the core. Returns the events. A refused action
 * comes back as [{ type: "rejected", action, why }] and is toasted, unless
 * `quiet` is set and the caller answers it itself.
 *
 * @param {Action} action
 * @param {{ quiet?: boolean }} [opts]
 * @returns {GameEvent[]}
 */
function dispatch(action, opts = {}) {
  let result;
  try {
    result = core.step(app.state, action);
  } catch (err) {
    report(err, `core.step(${action?.type})`);
    return [{ type: "rejected", action, why: "error" }];
  }
  const events = result?.events ?? [];
  if (result?.state && result.state !== app.state) {
    app.state = result.state;
    scheduleSave();
  }
  if (!opts.quiet) {
    for (const e of events) if (e.type === "rejected") app.toast(say(e.why), { sound: "nope" });
  }
  notify(app.state, events, action);
  return events;
}

/** Change `app.ui` and let every screen redraw. */
function setUi(patch) {
  Object.assign(app.ui, patch);
  notify(app.state, [], { type: "@ui" });
}

// ───────────────────────── scenes and sheets ─────────────────────────

/** @type {Map<string, any>} */
const modules = new Map();

/** The module for a registered name, or null with a toast: never a throw. */
async function loadScreen(registry, kind, name) {
  try {
    if (!Object.hasOwn(registry, name)) throw new Error("it is not in the registry");
    const mod = await registry[name]();
    if (typeof mod?.mount !== "function") throw new Error("its module exports no mount()");
    modules.set(`${kind}:${name}`, mod);
    return mod;
  } catch (err) {
    console.warn(`[hollow] ${kind} "${name}" could not be shown: ${err?.message ?? err}`);
    toast(SHELL.notBuilt(name));
    return null;
  }
}

/** @type {null | { name: string, params: any, root: HTMLElement, handle: Screen }} */
let scene = null;
let sceneTurn = 0;

/**
 * Switch the full scene. Resolves true once it is up; false if the name is
 * not built, its mount threw, or another go() overtook this one.
 *
 * @param {string} name
 * @param {Record<string, any>} [params]
 * @param {{ instant?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function go(name, params = {}, opts = {}) {
  const turn = ++sceneTurn;
  const mod = modules.get(`scene:${name}`) ?? (await loadScreen(SCENES, "scene", name));
  if (!mod || turn !== sceneTurn) return false;

  const root = el("section.hh-scene.is-mounting", { dataset: { scene: name } });
  layers.scene.append(root);
  const slow = setTimeout(veil.show, 200);
  /** @type {Screen} */
  let handle;
  try {
    const made = mod.mount(root, params);
    handle = (made instanceof Promise ? await made : made) ?? {};
  } catch (err) {
    clearTimeout(slow);
    root.remove();
    if (turn === sceneTurn) veil.hide();
    report(err, `scene "${name}" mount`);
    return false;
  }
  clearTimeout(slow);
  if (turn !== sceneTurn) {
    safely(() => handle.unmount?.(), `scene "${name}" unmount`);
    root.remove();
    return false;
  }

  const old = scene;
  scene = { name, params, root, handle };
  app.ui.scene = name;
  closeSheet();
  dismissNote();
  root.classList.remove("is-mounting");
  veil.hide();
  if (old) {
    safely(() => old.handle.unmount?.(), `scene "${old.name}" unmount`);
    old.root.inert = true;
    if (motion.calm || opts.instant) old.root.remove();
    else {
      root.classList.add("is-entering");
      setTimeout(() => {
        old.root.remove();
        root.classList.remove("is-entering");
      }, 240);
    }
  }
  // Subscribers (the teaching notes) hear that the scene changed.
  notify(app.state, [], { type: "@ui" });
  return true;
}

/** @type {null | { name: string, wrap: HTMLElement, panel: HTMLElement, title: HTMLElement, handle: Screen, release: () => void, before: Element | null }} */
let sheet = null;
let sheetTurn = 0;

/** @type {HTMLElement | null} the title of a sheet whose `mount` is running */
let mountingTitle = null;

/**
 * Open a bottom sheet over the scene. One at a time: opening another
 * replaces it. Resolves true once it is up.
 *
 * A sheet module may also export `title` (a string); `app.sheetTitle(text)`
 * changes it while the sheet is up, and from inside `mount` too.
 *
 * @param {string} name
 * @param {Record<string, any>} [params]
 * @returns {Promise<boolean>}
 */
async function openSheet(name, params = {}) {
  const turn = ++sheetTurn;
  const mod = modules.get(`sheet:${name}`) ?? (await loadScreen(SHEETS, "sheet", name));
  if (!mod || turn !== sheetTurn) return false;

  const title = el("h2.hh-sheet__title", { id: "hh-sheet-title", text: mod.title ?? "" });
  const body = el("div.hh-sheet__body", { dataset: { sheet: name } });
  const panel = el(
    "section.hh-sheet",
    { role: "dialog", "aria-modal": "true", "aria-labelledby": "hh-sheet-title", tabindex: "-1" },
    [
      el("div.hh-sheet__handle", { "aria-hidden": "true" }),
      el("header.hh-sheet__head", null, [
        title,
        el(
          "button.hh-iconbtn.hh-iconbtn--bare.hh-sheet__close",
          {
            type: "button",
            "aria-label": SHELL.close,
            dataset: { sound: "none" },
            onclick: () => closeSheet(),
          },
          closeIcon(),
        ),
      ]),
      body,
    ],
  );
  const scrim = el("div.hh-scrim", { onclick: () => closeSheet() });
  const wrap = el("div.hh-sheet-wrap.is-mounting", null, [scrim, panel]);
  swipeDown(panel);

  const before = sheet?.before ?? document.activeElement;
  layers.sheet.append(wrap);
  /** @type {Screen} */
  let handle;
  // While the sheet mounts, `app.sheetTitle()` writes to the one being made.
  mountingTitle = title;
  try {
    const made = mod.mount(body, params);
    handle = (made instanceof Promise ? await made : made) ?? {};
  } catch (err) {
    if (mountingTitle === title) mountingTitle = null;
    wrap.remove();
    report(err, `sheet "${name}" mount`);
    return false;
  }
  if (mountingTitle === title) mountingTitle = null;
  if (turn !== sheetTurn) {
    safely(() => handle.unmount?.(), `sheet "${name}" unmount`);
    wrap.remove();
    return false;
  }

  // Replacing a sheet keeps the one back-button entry (and the scrim does
  // not blink); a first sheet adds the entry.
  const release = sheet ? sheet.release : pushBack(() => closeSheet());
  if (sheet) {
    dropSheet(sheet, true);
    wrap.classList.add("is-swap");
  } else {
    dismissNote();
    app.sound("open");
  }
  sheet = { name, wrap, panel, title, handle, release, before };
  app.ui.sheet = name;
  modal.sheet = true;
  syncModal();
  wrap.classList.remove("is-mounting");
  // For a moment it takes no taps: the second tap of a double tap on the
  // button that opened it must not press whatever slides in under the thumb.
  wrap.classList.add("is-settling");
  setTimeout(() => wrap.classList.remove("is-settling"), 280);
  focusQuietly(panel);
  notify(app.state, [], { type: "@ui" });
  return true;
}

/** Take a sheet's screen down and its DOM away (sliding, unless `atOnce`). */
function dropSheet(s, atOnce = false) {
  safely(() => s.handle.unmount?.(), `sheet "${s.name}" unmount`);
  if (atOnce || motion.calm) s.wrap.remove();
  else {
    s.wrap.inert = true;
    for (const part of s.wrap.children) part.classList.add("is-leaving");
    setTimeout(() => s.wrap.remove(), 230);
  }
}

function closeSheet() {
  sheetTurn++;
  const s = sheet;
  if (!s) return;
  sheet = null;
  app.ui.sheet = null;
  modal.sheet = false;
  syncModal();
  dismissNote();
  dropSheet(s);
  app.sound("close");
  s.release();
  if (s.before instanceof HTMLElement && s.before.isConnected) focusQuietly(s.before);
  notify(app.state, [], { type: "@ui" });
}

/** Drag the sheet's top edge (the handle and the title row) down to put it away. */
function swipeDown(panel) {
  let startY = 0;
  let dy = 0;
  let id = -1;
  const onGrip = (target) =>
    !!target?.closest?.(".hh-sheet__handle, .hh-sheet__head") && !target.closest("button");
  on(panel, "pointerdown", (e) => {
    if (!onGrip(e.target)) return;
    id = e.pointerId;
    startY = e.clientY;
    dy = 0;
    panel.setPointerCapture?.(id);
    panel.style.transition = "none"; // follow the thumb exactly
  });
  on(panel, "pointermove", (e) => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - startY);
    if (!motion.calm) panel.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = -1;
    // Let go far enough down and it carries on out from where the thumb left
    // it; otherwise it springs home.
    panel.style.transition = "";
    if (e.type === "pointerup" && dy > 64) closeSheet();
    else panel.style.transform = "";
  };
  on(panel, "pointerup", end);
  on(panel, "pointercancel", end);
  // A quick flick must not leave the browser thinking a fling is under way:
  // it would swallow the next tap to "stop" it. Claiming the touch here means
  // no scroll gesture ever starts from the grip.
  on(
    panel,
    "touchstart",
    (e) => {
      if (onGrip(e.target) && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
}

/** The cross on a sheet's close button: painted if the icons are in, drawn in CSS if not. */
function closeIcon() {
  try {
    const pic = kit?.iconImg?.("close", 28);
    if (pic instanceof Node) return pic;
  } catch {
    /* an icon set without a "close" */
  }
  return el("span.hh-cross", { "aria-hidden": "true" });
}

// ───────────────────────── sound ─────────────────────────
//
// ui/audio.js is another builder's module and may not be there: the game
// plays without it.

/** @type {any} */
let audio = null;

async function loadAudio() {
  const mod = await optional(new URL("./audio.js", import.meta.url));
  if (!mod) return;
  safely(() => mod.initAudio?.(() => app.settings), "initAudio");
  audio = mod;
}

/** ui/chrome.js (painted icons for the sheet's close button), if main.js got it in. @type {any} */
let kit = null;

// Every button gives a soft tick without its screen asking. A button whose
// action has its own sound names it (data-sound="harvest"), or "none".
on(document, "click", (e) => {
  const button = e.target?.closest?.("button, [role='button'], a.hh-btn");
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
  const name = button.dataset.sound ?? "tap";
  if (name !== "none") app.sound(name);
});

// ───────────────────────── the app ─────────────────────────

/** @type {() => void} */
let booted;

export const app = {
  /** The current game state. Never mutate it. @type {State} */
  state: /** @type {any} */ (null),
  /** The core module: rules, read-only helpers, content tables. */
  core,

  dispatch,
  /** Call `fn(state, events, action)` after every dispatch. Returns the function that stops it. */
  on(/** @type {Subscriber} */ fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  off(/** @type {Subscriber} */ fn) {
    subscribers.delete(fn);
  },

  go,
  sheet: openSheet,
  closeSheet,
  /** Set the open sheet's title ("Hive 2 · Box hive"). */
  sheetTitle(text) {
    const title = mountingTitle ?? sheet?.title;
    if (title) title.textContent = String(text ?? "");
  },

  /**
   * A short line that comes and goes. `icon`: a sprite, an element or a
   * character. `sound`: the sound it makes ("toast" unless said; false for none).
   * @param {string} text
   * @param {{ icon?: any, sound?: string | false }} [opts]
   */
  toast(text, opts = {}) {
    toast(text, opts);
    if (opts.sound !== false) app.sound(opts.sound ?? "toast");
  },
  confirm,
  note,
  dismissNote,
  forgetNotes,
  /** Progress 0..1 on the loading card, from an async `mount` that paints for a while. */
  progress: (p) => veil.set(p),

  /** `sound` (boolean), `motion` (false: keep still), `speed` ("normal" | "fast"). Read only. */
  settings,
  setSetting,

  /** Play a named sound, if there is sound. */
  sound(name, opts) {
    safely(() => audio?.sound?.(name, opts), "sound");
  },
  /** Switch the background ambience, if there is sound. */
  ambience(name) {
    safely(() => audio?.ambience?.(name), "ambience");
  },
  /** A little celebration: "coins", "hearts", "sparkle", "pop". See ui/fx.js. */
  fx(name, opts) {
    safely(() => fx(name, opts), "fx");
  },

  /**
   * Scratch state the screens share that is not part of the game. Change it
   * with `app.setUi({ … })` so every screen hears.
   */
  ui: {
    /** Which plot the meadow is showing. */
    plot: "home",
    /** @type {null | { type: string, [key: string]: any }} what the next tap on the meadow does */
    mode: null,
    /** @type {any} a selected square or hive */
    selected: null,
    /** @type {string | null} the scene that is up */
    scene: null,
    /** @type {string | null} the sheet that is open */
    sheet: null,
    /** True while a sheet or a confirm card is open: the meadow's clock waits. */
    get paused() {
      return modal.sheet || modal.dialogs > 0;
    },
  },
  setUi,

  /** Resolves once the first scene is up. @type {Promise<void>} */
  ready: new Promise((ok) => (booted = ok)),

  load,
  newGame,
  reset,
  exportSave,
  readSave,
  importSave,
  /** Write the save now (it is otherwise written at most once a second). */
  save() {
    dirty = true;
    flush();
  },
};

/**
 * Boot, called once by main.js: load the save, bring up sound if there is
 * any, show the first scene (and sheet), then resolve `app.ready`.
 *
 * @param {{ scene?: string, sheet?: string, params?: Record<string, any>, kit?: any }} [first]
 *   kit: the ui/chrome.js module, when it loaded
 */
export async function start(first = {}) {
  kit = first.kit ?? null;
  const { broken } = load();
  loadAudio();
  const shown = await go(first.scene || "title", first.params);
  if (!shown && !(await go("title"))) throw new Error("the title scene could not be shown");
  if (first.sheet) await openSheet(first.sheet, first.params);
  if (broken) toast(SHELL.saveBroken);
  booted();
  // The coin and the heart, painted ahead of the first celebration.
  if (!motion.calm) warmFx();
}

/** The browser test hook (docs/honey-hollow/screens.md, "Test hook"). */
export const hook = {
  app,
  get state() {
    return app.state;
  },
  set state(v) {
    replaceState(v);
  },
  dispatch,
  core,
  /** @type {null | ((plot: string, x: number, y: number) => DOMRect)} the meadow screen fills this in */
  squareRect: null,
  ready: app.ready,
};
