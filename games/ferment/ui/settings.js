// @ts-check
/**
 * The settings sheet, opened from the gear in the shop's top bar: sound,
 * motion, strip style, the intro again, a backup code, start over, credits.
 *
 * Preferences live in createStore("ferment") under "settings", apart from the
 * save (so starting over or loading a code keeps them); sound stays in
 * ui/audio.js under its own "audio" key and this sheet only flips it.
 *
 *   motion  "auto" follows the phone's reduce-motion setting; "calm" and
 *           "full" override it. calmMotion() is what ui/fx.js asks.
 *   strip   "plain" is the colour blend; "marked" gives each band a texture
 *           and notches (ui/strip.js) for colour-blind players.
 *
 * Both are mirrored onto <html data-motion data-strip> so CSS can follow.
 * While the sheet is open the shop clock stands still (main.js frame loop).
 *
 * Wiring: main.js calls mountSettings, renderSettings (in render) and
 * settingsAct (in the tap chain); shop.js puts settingsButton() in the top
 * bar. The onboarding screens register their intro with onReplayIntro(fn);
 * until one does, the sheet has no intro button.
 *
 * Test hook: window.__fermentSettings = { prefs, set(key, value) }.
 */

import { createStore } from "../../../shared/storage.js";
import { saveCode, readCode } from "../core/index.js";
import { isMuted, setMuted } from "./audio.js";
import { patch } from "./dom.js";
import { strip, stripLabels } from "./strip.js";

const store = createStore("ferment");
const DEFAULTS = { motion: "auto", strip: "plain" };
const CHOICES = { motion: ["auto", "calm", "full"], strip: ["plain", "marked"] };

/** @type {{ motion: string, strip: string }} */
const prefs = { ...DEFAULTS };
const saved = store.get("settings", {});
for (const k of Object.keys(DEFAULTS)) if (CHOICES[k].includes(saved?.[k])) prefs[k] = saved[k];

function set(key, value) {
  if (!CHOICES[key]?.includes(value)) return;
  prefs[key] = value;
  store.set("settings", prefs);
  apply();
}

function apply() {
  const html = document.documentElement;
  html.dataset.motion = prefs.motion;
  html.dataset.strip = prefs.strip;
}
apply();

/** True when the shop should keep still: Calm, or the phone asks for less motion. */
export function calmMotion() {
  if (prefs.motion !== "auto") return prefs.motion === "calm";
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @type {(() => void) | null} */
let intro = null;
/** The onboarding screens hand over a way to play the intro again. */
export function onReplayIntro(fn) {
  intro = fn;
}

/** @type {any} */ (window).__fermentSettings = { prefs, set };

/** The top-bar gear: a small inline-styled icon, so "Day 12 · 8:00" still fits on an iPhone SE. */
export function settingsButton() {
  return `<button class="gear" data-act="settings" aria-label="Settings" style="${BUTTON}"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`;
}
const BUTTON =
  "border:0;background:none;color:var(--fg-dim);padding:12px 6px;margin:-8px -6px;line-height:0;-webkit-tap-highlight-color:transparent";

/** The sheet's overlay; render fills it while ui.settings is set. */
export function mountSettings(root) {
  const el = document.createElement("div");
  el.className = "sheet settings";
  el.hidden = true;
  root.appendChild(el);
  return el;
}

/**
 * ui.settings: null when closed, else
 * { view: "main" | "backup" | "credits", confirm?: "restart" | "load",
 *   code?: string (the backup code shown), paste?: string, error?: string, copied?: boolean }
 */
export function renderSettings(el, ui) {
  const st = ui.settings;
  el.hidden = !st;
  if (!st) return patch(el, "");
  patch(el, `<div class="panel">${VIEWS[st.view](ui, st)}</div>`);
}

const esc = (t) =>
  String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function choice(act, label, options, now) {
  return `<div class="set-row"><span>${label}</span><div class="seg" role="group" aria-label="${label}">${options
    .map(
      ([v, text]) =>
        `<button data-act="${act}" data-v="${v}" aria-pressed="${v === now}">${text}</button>`,
    )
    .join("")}</div></div>`;
}

const VIEWS = {
  main(ui, st) {
    if (st.confirm === "restart")
      return `<h2>Start over?</h2>
        <p>A fresh shop on day 1. Day ${ui.s.clock.day}, your jars, coins and recipes are gone for good. Back up your shop first if you might want it again.</p>
        <div class="btns"><button data-act="set-cancel">Keep my shop</button><button class="main warn" data-act="set-restart-yes">Start over</button></div>`;
    return `<h2>Settings</h2>
      ${choice(
        "set-sound",
        "Sound",
        [
          ["on", "On"],
          ["off", "Off"],
        ],
        isMuted() ? "off" : "on",
      )}
      ${choice(
        "set-motion",
        "Motion",
        [
          ["auto", "Like my phone"],
          ["calm", "Calm"],
          ["full", "Full"],
        ],
        prefs.motion,
      )}
      ${choice(
        "set-strip",
        "Flavour strip",
        [
          ["plain", "Colours"],
          ["marked", "Patterns"],
        ],
        prefs.strip,
      )}
      <div class="set-preview">${strip({ win: { lo: 0.42, hi: 0.68 }, f: 0.6, big: true })}${stripLabels}</div>
      <div class="set-list">
        ${intro ? `<button data-act="set-intro">Watch the intro again</button>` : ""}
        <button data-act="set-backup">Back up or move my shop</button>
        <button data-act="set-credits">Credits</button>
        <button class="warn" data-act="set-restart">Start over</button>
      </div>
      <div class="btns"><button class="main" data-act="set-close">Done</button></div>`;
  },

  backup(ui, st) {
    if (st.confirm === "load") {
      const next = readCode(st.paste).state;
      return `<h2>Load this shop?</h2>
        <p>The code holds a shop on day ${next?.clock.day} with 🪙 ${next?.shop.coins}. It takes the place of the shop you have now, on day ${ui.s.clock.day}.</p>
        <div class="btns"><button data-act="set-cancel">Keep mine</button><button class="main" data-act="set-load-yes">Load it</button></div>`;
    }
    return `<h2>Back up your shop</h2>
      <p>This code is your whole shop as it is right now. Keep it somewhere safe, like a note or a message to yourself, and paste it here to carry on, on this phone or another.</p>
      <textarea class="code" readonly rows="3" aria-label="Your shop code">${st.code}</textarea>
      <div class="btns"><button class="main" data-act="set-copy">${st.copied ? "Copied ✓" : "Copy code"}</button></div>
      <h3>Load a shop</h3>
      <textarea class="code paste" rows="3" placeholder="Paste a shop code here" aria-label="Paste a shop code" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(st.paste ?? "")}</textarea>
      ${st.error ? `<p class="set-error" role="alert">${st.error}</p>` : ""}
      <div class="btns"><button data-act="set-back">Back</button><button class="main" data-act="set-load">Load this shop</button></div>`;
  },

  credits() {
    return `<h2>Credits</h2>
      <p><b>The Brine Nook</b>, a little pickle shop. The shop, the jars, the customers and every picture are drawn right here in the game.</p>
      <p>Sounds are made with <a href="https://github.com/KilledByAPixel/ZzFX" target="_blank" rel="noopener">ZzFX</a> by Frank Force, shared under the MIT licence.</p>
      <div class="btns"><button class="main" data-act="set-back">Back</button></div>`;
  },
};

const WHY = {
  empty: "Paste a shop code in the box first.",
  notACode: "That doesn't look like a shop code. A shop code starts with BRINE1.",
  damaged: "Part of that code is missing or changed. Copy the whole code again and paste it in.",
  unplayable: "That shop can't be opened by this version of the game.",
};

/**
 * Handle a tap meant for the sheet. Returns true when it was one.
 * shop.replace(state) swaps in a loaded shop; shop.restart() starts a fresh one.
 */
export function settingsAct(act, t, ui, toast, shop) {
  if (act === "settings") {
    ui.settings = { view: "main" };
    return true;
  }
  const st = ui.settings;
  if (!st || !act?.startsWith("set-")) return false;
  const paste = /** @type {HTMLTextAreaElement | null} */ (
    t.closest(".panel")?.querySelector(".paste")
  );
  switch (act) {
    case "set-close":
      ui.settings = null;
      break;
    case "set-sound":
      setMuted(t.dataset.v === "off");
      break;
    case "set-motion":
      set("motion", t.dataset.v);
      break;
    case "set-strip":
      set("strip", t.dataset.v);
      break;
    case "set-intro":
      ui.settings = null;
      intro?.();
      break;
    case "set-restart":
      st.confirm = "restart";
      break;
    case "set-restart-yes":
      ui.settings = null;
      shop.restart();
      toast("A fresh shop, day 1");
      break;
    case "set-cancel":
      st.confirm = undefined;
      break;
    case "set-backup":
      ui.settings = { view: "backup", code: saveCode(ui.s) };
      break;
    case "set-credits":
      ui.settings = { view: "credits" };
      break;
    case "set-back":
      ui.settings = { view: "main" };
      break;
    case "set-copy":
      copy(st.code ?? "", t.closest(".panel")?.querySelector(".code"));
      st.copied = true;
      break;
    case "set-load": {
      st.paste = paste?.value ?? "";
      const got = readCode(st.paste);
      st.error = got.ok ? undefined : WHY[got.why];
      if (got.ok) st.confirm = "load";
      break;
    }
    case "set-load-yes": {
      const got = readCode(st.paste);
      ui.settings = null;
      if (got.ok) {
        shop.replace(got.state);
        toast(`Welcome back, day ${got.state.clock.day}`);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

/** Copy to the clipboard; where that's refused, select the code so a long-press copies it. */
function copy(text, box) {
  const select = () => {
    if (!box) return;
    box.focus();
    box.select();
    box.setSelectionRange(0, text.length);
  };
  try {
    navigator.clipboard.writeText(text).catch(select);
  } catch {
    select();
  }
}
