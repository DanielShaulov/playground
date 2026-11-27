// @ts-check
/**
 * The bottom sheets, by name. `app.sheet("hive", { hive: 2 })` looks the name
 * up here and loads the module the first time it is asked for.
 *
 * To add a sheet, write `ui/sheets/<name>.js` exporting
 *
 *   mount(root, params) → { update?(state, events, action), unmount?() }
 *   title                (optional) the words in the sheet's title row
 *
 * and add its name below: one line. `root` is the sheet's scrolling body
 * (`.hh-sheet__body`); the spine has already built the paper, the handle,
 * the title row and the close button round it, and closes the sheet on the
 * scrim, the cross, a swipe down, Escape and the back button.
 * `app.sheetTitle(text)` changes the title while the sheet is up
 * ("Hive 2 · Box hive"). For buttons that must stay put while the body
 * scrolls, put a `.hh-sheet__foot` after the body: `root.after(foot)`.
 *
 * Every name here is built. If a sheet's files do not arrive, the spine says
 * so and offers to fetch the game again; nothing opens.
 * Try one directly: index.html?sheet=<name> (other query values are passed
 * to `mount` as `params`).
 */

/** @type {Record<string, () => Promise<any>>} */
export const SHEETS = {
  settings: () => import("./settings.js"),
  hive: () => import("./hive.js"),
  bed: () => import("./bed.js"),
  seeds: () => import("./seeds.js"),
  hives: () => import("./hives.js"),
  wardrobe: () => import("./wardrobe.js"),
  calendar: () => import("./calendar.js"),
  map: () => import("./map.js"),
  goals: () => import("./goals.js"),
  more: () => import("./more.js"),
  book: () => import("./book.js"),
  workshop: () => import("./workshop.js"),
};
