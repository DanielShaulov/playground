// @ts-check
/**
 * The full scenes, by name. `app.go("stall", params)` looks the name up here
 * and loads the module the first time it is asked for.
 *
 * To add a scene, write `ui/scenes/<name>.js` exporting
 *
 *   mount(root, params) → { update?(state, events, action), unmount?() }
 *
 * and point its name at it below: one line. `mount` may be async (the spine
 * shows the loading card if it takes a while; `app.progress(0..1)` moves the
 * bar). `root` is the page, already padded in from the notch and the home
 * bar; `root.dataset.scene` is the name. See ui/app.js for the rest.
 *
 * A name that still points at `todo` shows the placeholder scene. A name
 * that is not here at all toasts "Not built yet" and stays where it was.
 * Try one directly: index.html?scene=<name> (other query values are passed
 * to `mount` as `params`).
 */

const todo = () => import("./placeholder.js");

/** @type {Record<string, () => Promise<any>>} */
export const SCENES = {
  title: () => import("./title.js"),
  intro: () => import("./intro.js"),
  creator: () => import("./creator.js"),
  meadow: () => import("../meadow/index.js"),
  stall: () => import("./stall.js"),
  night: () => import("./night.js"),
  year: () => import("./year.js"),
  placeholder: todo,
};
