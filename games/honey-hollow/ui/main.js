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
 * Test hook: window.__hollow = { app, state (get/set), dispatch, core,
 * squareRect (the meadow fills it in), ready }.
 */

const card = document.getElementById("hh-loading");
const fill = /** @type {HTMLElement | null} */ (card?.querySelector(".hh-loading__fill"));
const progress = (p) => {
  if (fill) fill.style.transform = `scaleX(${p})`;
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

async function boot() {
  progress(0.08);
  await lettering();
  progress(0.2);
  await breathe();

  // The painted interface. ui/chrome.js is the kit's; without it (or if a
  // phone cannot paint it) base.css falls back to flat colour.
  const kit = await import("./chrome.js").catch(() => null);
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
  // The keeper's notes. The game plays without them, so a failure here is only logged.
  import("./teach.js").then((teach) => teach.start(app)).catch((err) => report(err, "teach"));
  // Keep every screen for a day without signal (ui/offline.js).
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
  again.addEventListener("click", () => location.reload());
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

boot().catch(fail);
