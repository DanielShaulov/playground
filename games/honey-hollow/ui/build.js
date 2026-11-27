// @ts-check
/**
 * Which release this copy of the game is, and how to get a fresh one.
 *
 * A phone can end up holding pieces of two releases: a tab it brings back
 * from days ago is rebuilt from whatever it kept, and anything it did not
 * keep is fetched new. Old and new files do not fit together, and a screen
 * that needs both will not load. Three things keep that from the player:
 *
 * 1. Every release gives every file a new address. The deploy
 *    (scripts/stamp-build.mjs) writes ?v=<commit> on the page's stylesheets
 *    and first script, and an import map that adds the same to every module,
 *    so a fresh page can never be answered with an older release's files.
 *    `versioned()` does the same for the stylesheets a screen loads itself.
 * 2. At boot, ui/main.js asks the site which release is out (`stale()`); a
 *    page from an older one leaves for a fresh copy (`refresh()`) before
 *    anything is shown.
 * 3. A screen that still will not load says so, with the reason, and offers
 *    to fetch the game again (ui/app.js). The reason is kept for Settings.
 *
 * A copy that was never stamped (npm start, the tests) has no release:
 * BUILD is "" and none of this does anything.
 */

import { createStore } from "../../../shared/storage.js";

/** This release: the first 12 letters of its commit, or "" for an unstamped copy. */
export const BUILD = new URL(import.meta.url).searchParams.get("v") ?? "";

const PAGE = new URL(location.href);
/**
 * True when this page is itself a fresh copy that `refresh()` asked for. Such
 * a page never leaves again by itself, so two releases that disagree can
 * never send a phone round in circles.
 */
export const arrived = PAGE.searchParams.has("v");
if (arrived) {
  // The mark has done its work; keep the address the player knows.
  PAGE.searchParams.delete("v");
  try {
    history.replaceState(history.state, "", PAGE.href);
  } catch {
    // An address that cannot be tidied still plays.
  }
}

/**
 * The same address, marked with this release.
 * @param {string | URL} href
 */
export function versioned(href) {
  const url = new URL(String(href), location.href);
  if (BUILD && !url.search) url.search = `?v=${BUILD}`;
  return url.href;
}

/**
 * The release the site is serving now, or "" when that cannot be known (no
 * signal, a slow answer, an unstamped site).
 * @param {number} [ms] how long to wait for the answer
 */
export async function latest(ms = 1500) {
  if (navigator.onLine === false) return "";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    const res = await fetch(new URL("../../build.json", PAGE), {
      cache: "no-store",
      signal: stop.signal,
    });
    const sha = res.ok ? (await res.json())?.sha : null;
    return typeof sha === "string" && /^[0-9a-f]{12,}$/.test(sha) ? sha.slice(0, 12) : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** The newer release this page should give way to, or "" when it is the newest (or nobody can say). */
export async function stale(ms = 1500) {
  if (!BUILD) return "";
  const now = await latest(ms);
  return now && now !== BUILD ? now : "";
}

/**
 * Leave for a fresh copy of the game. The page gets an address it has never
 * had, so nothing the phone has kept can answer for it.
 * @param {string} [to] the release to fetch, when it is known
 */
export function refresh(to = "") {
  const url = new URL(PAGE);
  url.searchParams.set("v", to || Date.now().toString(36));
  location.replace(url.href);
}

// ───────────────────────── what went wrong ─────────────────────────

const store = createStore("honey-hollow");
const KEPT = 5;

/**
 * Keep the reason something would not load, for the line in Settings.
 * @param {string} what  what was being fetched: `scene "intro"`, "the painted interface"
 * @param {unknown} err
 */
export function trouble(what, err) {
  const e = /** @type {any} */ (err);
  const why = String(e?.message ?? e ?? "").slice(0, 200);
  const list = troubles();
  list.unshift({ at: new Date().toISOString(), what, why, build: BUILD || "dev" });
  store.set("troubles", list.slice(0, KEPT));
}

/** @returns {{ at: string, what: string, why: string, build: string }[]} newest first */
export function troubles() {
  const list = store.get("troubles", []);
  return Array.isArray(list) ? list.filter((t) => t && typeof t.what === "string") : [];
}
