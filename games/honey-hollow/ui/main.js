// @ts-check
/**
 * Honey Hollow: boot. The loading card is already on the page (index.html);
 * behind it this waits for the lettering, paints the interface, builds the
 * app, loads the save and shows the first scene.
 *
 *   index.html                    the title
 *   index.html?scene=stall        straight to a scene
 *   index.html?sheet=settings     the title with a sheet open
 *   index.html?scene=meadow&sheet=hive&hive=2
 *                                 anything else in the query is handed to
 *                                 both `mount`s as `params` (all strings)
 *
 * Nothing is imported statically: if any module is missing or broken, the
 * player gets a card that says so and a way to try again, not a blank page.
 * That is also why this file's few sentences are not in words.js.
 *
 * A page from an older release than the site is serving leaves for a fresh
 * copy before anything is shown (ui/build.js says why and how).
 *
 * Test hook: window.__hollow = { app, state (get/set), dispatch, core,
 * squareRect (the meadow fills it in), ready }.
 */

const card = document.getElementById("hh-loading");
const fill = /** @type {HTMLElement | null} */ (card?.querySelector(".hh-loading__fill"));
const progress = (p) => {
  if (fill) fill.style.transform = `scaleX(${p})`;
};
/** Change the loading card's one line. */
const say = (text) => {
  const line = card?.querySelector(".hh-loading__line");
  if (line) line.textContent = text;
};
/** Let the card repaint before a long job. */
const breathe = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));

/** Mali, for the DOM and for lettering on canvas. A font that never arrives must not hold the game up. */
function lettering() {
  const faces = Promise.all([
    document.fonts.load('400 16px "Mali"'),
    document.fonts.load('700 16px "Mali"'),
  ]).then(() => document.fonts.ready);
  return Promise.race([faces, new Promise((ok) => setTimeout(ok, 2500))]).catch(() => {});
}

/** Said once when the game has to start without its painted interface. */
const PLAIN =
  "The painted buttons did not arrive, so the game is in plain colours. Settings says why.";
/** Never settles: for the moment between asking for a fresh page and getting it. */
const leaving = () => new Promise(() => {});
/** ui/build.js, once it is in. @type {typeof import("./build.js") | null} */
let build = null;

/**
 * A file did not arrive, or does not fit the others: fetch the game again,
 * once. False when that has been tried already (this page is the fresh copy)
 * or there is no signal to try with; the caller then makes do.
 */
async function again(what, err) {
  console.warn(`[hollow] ${what} did not load:`, err);
  if (!build) return false;
  build.trouble(what, err);
  if (build.arrived || navigator.onLine === false) return false;
  say("Fetching Honey Hollow again…");
  build.refresh(await build.latest());
  return true;
}

async function boot() {
  progress(0.08);
  const made = (build = await import("./build.js"));
  const [, newer] = await Promise.all([lettering(), made.arrived ? "" : made.stale()]);
  if (newer) {
    // This page is from an older release, and its files would not fit the
    // ones the site serves now.
    say("Fetching the newest Honey Hollow…");
    made.refresh(newer);
    return leaving();
  }
  progress(0.2);
  await breathe();

  // The painted interface. ui/chrome.js is the kit's; if a phone cannot
  // paint it, base.css falls back to flat colour.
  /** @type {any} */
  let kit = null;
  try {
    kit = await import("./chrome.js");
  } catch (err) {
    // Not a phone that cannot paint: a file that did not arrive, or one that
    // does not fit the others. A fresh copy that still cannot have it plays
    // in flat colour and says why in Settings.
    if (await again("the painted interface", err)) return leaving();
  }
  try {
    kit?.installChrome();
  } catch (err) {
    console.warn("[hollow] the interface could not be painted; using flat colour.", err);
  }
  progress(0.4);
  await breathe();

  const { app, start, hook, report } = await import("./app.js");
  /** @type {any} */ (window).__hollow = hook;

  // After boot nothing should take the game down: log it, save, say so once.
  window.addEventListener("error", (e) => {
    if (/ResizeObserver loop/.test(e.message ?? "")) return;
    report(e.error ?? e.message, "uncaught");
  });
  window.addEventListener("unhandledrejection", (e) => report(e.reason, "unhandled rejection"));

  app.progress(0.5);
  const { scene, sheet, ...params } = Object.fromEntries(new URLSearchParams(location.search));
  await start({ scene, sheet, params, kit });
  if (!kit) app.toast(PLAIN, { sound: false });
  // The keeper's notes. The game plays without them, so a failure here is only logged.
  import("./teach.js").then((teach) => teach.start(app)).catch((err) => report(err, "teach"));
  // Fetch every screen now, so they are all from this release and are still
  // here on a day without signal (ui/offline.js).
  import("./offline.js").then((offline) => offline.warmOffline()).catch(() => {});
}

function fail(err) {
  console.error("[hollow] could not start:", err);
  if (!card) return;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  const again = make("button", "hh-btn hh-loading__again", "Try again");
  again.setAttribute("type", "button");
  again.addEventListener("click", () => {
    // A new address for the page, so nothing the phone has kept can answer for it.
    const url = new URL(location.href);
    url.searchParams.set("v", Date.now().toString(36));
    location.replace(url.href);
  });
  const box = make("div", "hh-loading__card", "");
  box.append(
    make("h1", "hh-loading__name hh-loading__name--small", "The paints have run"),
    make(
      "p",
      "hh-loading__line",
      "Honey Hollow could not start. Your saved game has not been touched.",
    ),
    again,
    make("pre", "hh-loading__error", String(err?.stack ?? err?.message ?? err)),
  );
  card.hidden = false;
  card.classList.remove("is-leaving");
  card.setAttribute("role", "alert");
  card.replaceChildren(box);
}

// Anything that stops the game from starting gets one fresh copy before the card.
boot().catch(async (err) => {
  if (!(await again("the game", err).catch(() => false))) fail(err);
});
