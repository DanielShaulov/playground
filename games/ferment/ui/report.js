// @ts-check
/**
 * Bug reports by email. Settings → Report a problem: the player writes a line,
 * the game adds everything needed to see the bug, and their mail app opens
 * with it all filled in, to REPORT_TO with a "[Ferment report]" subject.
 * A scheduled Claude task reads that mailbox, replays each report and opens
 * a fix PR. scripts/ferment-report.mjs turns a report back into saves.
 *
 * What a report carries (see prepareReport):
 *   start + actions  the shop when the current day began (or when this trail
 *                    started) and every action dispatched since, ticks
 *                    merged. The core is deterministic, so replaying the
 *                    actions on start gives back `now` exactly.
 *   now              the live shop
 *   taps, errors     the last screen taps (data-act + its data) and any
 *                    uncaught errors, for bugs that live in the screens
 *   build, device    build.json's sha (written by scripts/build-pages.sh),
 *                    page, screen size, browser, home-screen app or tab
 *
 * The trail is kept in createStore("ferment") under "trail" and written with
 * every save, so it survives the phone closing the app.
 *
 * Wiring: main.js calls resumeTrail at load, noteAction in dispatch,
 * saveTrail in save, startTrail on replace, noteTap in the tap handler and
 * onFirstError for a toast. ui/settings.js shows the report view.
 *
 * Test hook: window.__fermentReport = { trail, taps, errors, open(url), lastMail }.
 * A flow sets open to catch the mailto: link instead of leaving the page.
 */

import { createStore } from "../../../shared/storage.js";
import { MAX_TICK_STEPS } from "../core/clock.js";
import { encodeReport } from "./report-code.js";

/** @typedef {import("../core/types.js").State} State */
/** @typedef {import("../core/types.js").Action} Action */

export const REPORT_TO = "daniel.shaulov+ferment@gmail.com";
const SUBJECT = "[Ferment report]";
/** Past this many actions the trail starts again from the shop as it is (a day is far fewer). */
const MAX_ACTIONS = 800;
const MAX_TAPS = 40;
const MAX_ERRORS = 8;

const store = createStore("ferment");

/** @type {{ start: State, actions: Action[], restarted?: boolean } | null} */
let trail = null;
/** @type {{ act: string, data: Record<string, string>, day: number, hour: number }[]} */
const taps = [];
/** @type {{ msg: string, where?: string, stack?: string, at: string }[]} */
const errors = [];
/** @type {(() => void) | null} */
let firstError = null;

const hook = {
  get trail() {
    return trail;
  },
  taps,
  errors,
  /** How the mail app is opened; a test swaps this out. */
  open: (/** @type {string} */ url) => {
    location.href = url;
  },
  lastMail: "",
};
/** @type {any} */ (window).__fermentReport = hook;

/** A fresh trail from this shop (a new day, a loaded code, a new game). */
export function startTrail(/** @type {State} */ state, restarted = false) {
  trail = { start: structuredClone(state), actions: [] };
  if (restarted) trail.restarted = true;
}

/** At load: carry on the stored trail when there is a stored save it led to, else start one. */
export function resumeTrail(/** @type {State} */ state, /** @type {boolean} */ hadSave) {
  const kept = hadSave ? store.get("trail", null) : null;
  if (kept?.start && Array.isArray(kept.actions)) trail = kept;
  else startTrail(state);
}

export function saveTrail() {
  if (trail) store.set("trail", trail);
}

/** Every dispatched action, after step() ran it. A night's sleep starts the next day's trail. */
export function noteAction(
  /** @type {Action} */ action,
  /** @type {{ type: string }[]} */ events,
  /** @type {State} */ state,
) {
  if (!trail) return startTrail(state);
  const last = trail.actions.at(-1);
  if (action.type === "tick" && last?.type === "tick" && last.n + action.n <= MAX_TICK_STEPS)
    last.n += action.n;
  else trail.actions.push(structuredClone(action));
  if (events.some((e) => e.type === "slept")) startTrail(state);
  else if (trail.actions.length > MAX_ACTIONS) startTrail(state, true);
}

/** A tap on anything with a data-act, kept for bugs in the screens. */
export function noteTap(/** @type {HTMLElement} */ t, /** @type {State} */ state) {
  const { act = "", ...data } = t.dataset;
  taps.push({ act, data, day: state.clock.day, hour: state.clock.hour });
  if (taps.length > MAX_TAPS) taps.shift();
}

/** fn runs once, the first time something throws that nothing caught. */
export function onFirstError(/** @type {() => void} */ fn) {
  firstError = fn;
}

function noteError(/** @type {{ msg: string, where?: string, stack?: string }} */ e) {
  errors.push({ ...e, stack: e.stack?.slice(0, 1200), at: new Date().toISOString() });
  if (errors.length > MAX_ERRORS) errors.shift();
  const fn = firstError;
  firstError = null;
  try {
    fn?.();
  } catch {
    /* a toast is never worth a second error */
  }
}
addEventListener("error", (e) =>
  noteError({
    msg: e.message,
    where: `${e.filename}:${e.lineno}:${e.colno}`,
    stack: e.error?.stack,
  }),
);
addEventListener("unhandledrejection", (e) =>
  noteError({ msg: String(e.reason?.message ?? e.reason), stack: e.reason?.stack }),
);

/** build.json next to the site root: the deployed commit, or "dev" from the repo copy. */
async function build() {
  try {
    const res = await fetch(new URL("../../build.json", location.href), { cache: "no-store" });
    return res.ok ? await res.json() : { sha: "unknown" };
  } catch {
    return { sha: "offline" };
  }
}

/**
 * The report code for this shop, ready before the player taps Send (so the
 * mail app opens straight from the tap). settings = the sheet's preferences.
 * @returns {Promise<{ code: string, sha: string }>}
 */
export async function prepareReport(/** @type {State} */ state, /** @type {object} */ settings) {
  const b = await build();
  const code = await encodeReport({
    v: 1,
    when: new Date().toISOString(),
    build: b,
    page: location.pathname + location.search,
    device: {
      ua: navigator.userAgent,
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio,
      app:
        matchMedia("(display-mode: standalone)").matches ||
        /** @type {any} */ (navigator).standalone === true,
    },
    settings,
    start: trail?.start ?? null,
    actions: trail?.actions ?? [],
    restarted: !!trail?.restarted,
    now: state,
    taps,
    errors,
  });
  return { code, sha: String(b.sha ?? "unknown").slice(0, 7) };
}

/** The whole email as text: what a player copies when no mail app opened. */
function letter(/** @type {string} */ note, /** @type {{ code: string, sha: string }} */ r, day) {
  const said = note.trim() || "(no description)";
  const subject = `${SUBJECT} ${said.replace(/\s+/g, " ").slice(0, 60)}`;
  const body = `${said}\n\n-- Added by the game. Please leave everything below as it is. --\nDay ${day} · build ${r.sha}\n\n${r.code}\n`;
  return { subject, body };
}

/** Open the player's mail app with the report filled in. */
export function sendReport(
  /** @type {string} */ note,
  /** @type {{ code: string, sha: string }} */ r,
  day,
) {
  const { subject, body } = letter(note, r, day);
  const url = `mailto:${REPORT_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}`;
  hook.lastMail = url;
  hook.open(url);
}

/** The same email as plain text, for the clipboard. */
export function reportText(
  /** @type {string} */ note,
  /** @type {{ code: string, sha: string }} */ r,
  day,
) {
  const { subject, body } = letter(note, r, day);
  return `To: ${REPORT_TO}\nSubject: ${subject}\n\n${body}`;
}
