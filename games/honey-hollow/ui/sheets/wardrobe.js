// @ts-check
/**
 * The wardrobe: the beekeeper picker again (ui/keeper-picker.js), for a
 * change of look later on. No talent, and the name may be left alone.
 *
 * Nothing changes until the button is pressed: "Wear this" sends setLook
 * with only what differs and closes the sheet; with nothing changed the same
 * button reads "Keep this look" and just closes. Hats and pieces still to be
 * earned rest in their row, and say how they are earned when tapped.
 *
 * The button stands beside the preview with the name, not in a footer: on a
 * small phone a footer would take the room the figure needs to be seen.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { createPicker, lookOf, lookChange } from "../keeper-picker.js";
import { KEEPER as W } from "../words/keeper.js";

export const title = W.wardrobeTitle;

const styled = Promise.all([
  css(new URL("../keeper-picker.css", import.meta.url)),
  css(new URL("./wardrobe.css", import.meta.url)),
]);

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  root.classList.add("wardrobe");
  let closing = false;

  const picker = createPicker({
    look: lookOf(app.state),
    name: app.state.keeper?.name ?? "",
    placeholder: app.state.keeper?.name || W.defaultName,
    // The meadow is alive under the sheet: let its own pieces be for longer.
    budget: 48,
    onChange: () => renderButton(),
  });
  const change = () => lookChange(app.state, picker.look(), picker.name());

  const wear = el("button.hh-btn.hh-btn--small.wardrobe__wear", {
    type: "button",
    dataset: { act: "wear" },
    onclick: commit,
  });
  root.append(
    el("div.wardrobe__top", null, [
      picker.stage,
      el("div.wardrobe__side", null, [picker.nameRow, wear]),
    ]),
    picker.tabs,
    picker.panel,
  );

  function renderButton() {
    const text = Object.keys(change()).length ? W.wear : W.keep;
    if (wear.textContent !== text) wear.textContent = text;
  }

  function commit() {
    if (closing) return;
    const look = change();
    if (Object.keys(look).length) {
      const events = app.dispatch({ type: "setLook", look });
      if (!events.some((e) => e.type === "lookSet")) return;
      app.toast(W.worn);
    }
    closing = true;
    app.closeSheet();
  }

  renderButton();
  // The sheet has its size only once it is up: lay the open row out then.
  requestAnimationFrame(() => picker.settle());

  return {
    update(state, events, action) {
      if (closing) return;
      if (action?.type === "@replace") picker.set(lookOf(state), state.keeper?.name ?? "");
      else picker.refresh();
      renderButton();
    },
    unmount() {
      picker.destroy();
    },
  };
}
