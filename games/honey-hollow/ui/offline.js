// @ts-check
/**
 * Warm-up. The game loads each scene, sheet and stylesheet the first time it
 * is needed, which leaves two holes:
 *
 * - The site's service worker (../../sw.js) keeps a copy of whatever the page
 *   loads, so a player who adds the game to the home screen and first opens
 *   the workshop on a train would find it missing.
 * - A screen first opened an hour into a sitting is fetched then, and if the
 *   site has moved to a new release in that hour it may not fit the files
 *   the sitting began with (ui/build.js).
 *
 * So a few seconds after boot, when the phone has nothing better to do, this
 * asks for every scene and every sheet once; and when a service worker is in
 * charge of the page (the launcher registers it), for every stylesheet too.
 * Never when the phone asks to save data.
 *
 * tests/honey-hollow/core/offline.test.mjs checks that STYLES names every
 * stylesheet under ui/.
 */

import { versioned } from "./build.js";
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
    if (nav.connection?.saveData || navigator.onLine === false) return;
    await new Promise((ok) => setTimeout(ok, 4000));
    // The screens, whether or not anything keeps them for later: a game whose
    // screens were all fetched in its first seconds cannot find, an hour on,
    // that the site has moved to a release they do not fit.
    for (const load of [...Object.values(SCENES), ...Object.values(SHEETS)]) {
      await idle();
      await load().catch(() => null);
    }
    // The stylesheets only matter to the service worker (the launcher
    // registers it; a phone sent straight to the game has none).
    if (!(await navigator.serviceWorker?.getRegistration())) return;
    for (const path of STYLES) {
      await idle();
      await fetch(versioned(new URL(path, import.meta.url))).catch(() => null);
    }
  } catch {
    // A game that cannot be kept for later still plays now.
  }
}
