// @ts-check
/**
 * Offline warm-up. The site's service worker (../../sw.js) keeps a copy of
 * whatever the page loads, and the game loads each scene, sheet and
 * stylesheet the first time it is needed. So a player who adds the game to
 * the home screen and first opens the workshop on a train would find it
 * missing. A few seconds after boot, when the phone has nothing better to
 * do, this asks for every scene, every sheet and every stylesheet once, so
 * the worker has them all.
 *
 * It only runs when a service worker is in charge of the page (the launcher
 * registers it), never under tests or on a first visit straight to the game,
 * and never when the phone asks to save data.
 *
 * tests/honey-hollow/core/offline.test.mjs checks that STYLES names every
 * stylesheet under ui/.
 */

import { SCENES } from "./scenes/index.js";
import { SHEETS } from "./sheets/index.js";

/** Every stylesheet a screen loads for itself, from this folder. */
export const STYLES = [
  "./bloom-strip.css",
  "./keeper-picker.css",
  "./teach.css",
  "./meadow/meadow.css",
  "./scenes/creator.css",
  "./scenes/intro.css",
  "./scenes/night.css",
  "./scenes/stall.css",
  "./scenes/title.css",
  "./scenes/year.css",
  "./sheets/bed.css",
  "./sheets/book.css",
  "./sheets/calendar.css",
  "./sheets/goals.css",
  "./sheets/hive.css",
  "./sheets/hives.css",
  "./sheets/map.css",
  "./sheets/more.css",
  "./sheets/seeds.css",
  "./sheets/settings.css",
  "./sheets/wardrobe.css",
  "./sheets/workshop.css",
];

const idle = () =>
  new Promise((ok) => {
    const w = /** @type {any} */ (window);
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(ok, { timeout: 2000 });
    else setTimeout(ok, 300);
  });

let warmed = false;

/** Ask for everything once, a piece at a time. Never throws. */
export async function warmOffline() {
  if (warmed) return;
  warmed = true;
  try {
    const nav = /** @type {any} */ (navigator);
    if (!("serviceWorker" in navigator) || nav.connection?.saveData) return;
    await navigator.serviceWorker.ready; // never settles when no worker is registered
    if (!navigator.onLine) return;
    await new Promise((ok) => setTimeout(ok, 4000));
    for (const load of [...Object.values(SCENES), ...Object.values(SHEETS)]) {
      await idle();
      await load().catch(() => null);
    }
    for (const path of STYLES) {
      await idle();
      await fetch(new URL(path, import.meta.url)).catch(() => null);
    }
  } catch {
    // A game that cannot be kept for later still plays now.
  }
}
