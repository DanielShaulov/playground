// @ts-check
/**
 * Make your beekeeper. Two steps on one page:
 *
 *   the look     a live preview above; the name, the tabs and the swatches
 *                under the thumb (all of it is ui/keeper-picker.js)
 *   a talent     the four talents as rows with a picture; pick one, "Begin"
 *
 * "Begin" dispatches createKeeper and goes to the meadow. "Back" returns to
 * the look, which is never thrown away. Opened when a beekeeper already
 * exists, the scene edits that one instead: no talent step, "Done" sends
 * setLook with what changed.
 *
 * While the name is being typed the keyboard covers the lower half of the
 * page, so the page shrinks to what can still be seen (the picker tells us
 * how much through visualViewport) and the swatches step aside.
 */

import { app } from "../app.js";
import { el, css, wait } from "../dom.js";
import { say } from "../words.js";
import { sprite, put, img } from "../paint/sprite.js";
import { bed } from "../art/flowers.js";
import { hive } from "../art/hives.js";
import { bee } from "../art/bee.js";
import { jar } from "../art/jars.js";
import { good, item } from "../art/goods.js";
import { icon } from "../art/icons.js";
import { createPicker, lookOf, lookChange, releaseArt } from "../keeper-picker.js";
import { KEEPER as W } from "../words/keeper.js";

const styled = Promise.all([
  css(new URL("../keeper-picker.css", import.meta.url)),
  css(new URL("./creator.css", import.meta.url)),
]);

const PIC = 72;
/** Where toasts sit while this scene is up: over the heading, clear of the face. */
const TOAST_TOP = "4px";

/** A talent's picture, put together from what it touches. */
function talentArt(/** @type {string} */ id) {
  return sprite(
    `keeper-talent-${id}`,
    PIC,
    PIC,
    (ctx) => {
      if (id === "green-thumb") {
        put(ctx, bed("lavender", "bloom", 0), 28, 68, 0.72);
        put(ctx, bed("clover", "bloom", 1), 53, 70, 0.55);
      } else if (id === "selling") {
        put(ctx, jar("lavender", 2), 28, 67, 1.2);
        put(ctx, item("coin"), 55, 52, 1.1);
      } else if (id === "whisperer") {
        put(ctx, hive("skep"), 30, 69, 0.68);
        put(ctx, bee(0), 56, 18, 1.5);
        put(ctx, bee(1), 61, 40, 1.25, { flip: true });
      } else {
        put(ctx, good("candle"), 26, 67, 1.15);
        put(ctx, good("soap-lavender"), 53, 69, 0.85);
      }
    },
    { ax: 0.5, ay: 0.5, grain: 0 },
  );
}

/** A sprite's own canvas as a picture in the page. */
function shown(s, size, cls) {
  const c = s.canvas;
  c.className = `hh-pic ${cls}`;
  c.style.setProperty("--pic", `${size}px`);
  c.setAttribute("aria-hidden", "true");
  return c;
}

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  root.classList.add("hh-page", "creator");
  document.documentElement.style.setProperty("--hh-toast-top", TOAST_TOP);
  const core = app.core;
  let editing = !!app.state.keeper?.made;
  let talent = "";
  let leaving = false;

  const picker = createPicker({
    look: lookOf(app.state),
    name: editing ? app.state.keeper.name : W.defaultName,
    onChange: () => renderTalentTitle(),
    onKeyboard({ open, height, top }) {
      if (open) {
        root.style.setProperty("--creator-vv-h", `${Math.round(height)}px`);
        root.style.setProperty("--creator-vv-top", `${Math.round(top)}px`);
      }
      root.classList.toggle("is-typing", open);
    },
  });
  /** The name the beekeeper will get: what is typed, or the kind default. */
  const nameNow = () => picker.name() || (editing ? app.state.keeper.name : W.defaultName);

  // ── step one: the look ──

  const title = el("h1.hh-heading.creator__title");
  const nextBtn = el("button.hh-btn.hh-btn--block", {
    type: "button",
    onclick: () => (editing ? done() : show("talent")),
  });
  const lookStep = el("div.creator__step.creator__look", null, [
    el("header.creator__head", null, title),
    picker.stage,
    picker.nameRow,
    el("div.creator__lower", null, [
      picker.tabs,
      picker.panel,
      el("div.creator__foot", null, nextBtn),
    ]),
  ]);

  // ── step two: the talent ──

  const who = /** @type {HTMLCanvasElement} */ (
    el("canvas.creator__who-pic", { "aria-hidden": "true" })
  );
  const talentTitle = el("h1.hh-heading.creator__title");
  /** @type {Record<string, HTMLElement>} */
  const talentRows = {};
  /** @type {any} */
  const talents = core.TALENTS;
  const list = el("div.creator__talents", { role: "radiogroup", "aria-label": W.talentSub });
  for (const id of core.TALENT_IDS ?? Object.keys(talents)) {
    const check = img(icon("check"), 26, W.chosen);
    check.className = "hh-icon creator__check";
    const row = el(
      "button.hh-row.creator__talent",
      {
        type: "button",
        role: "radio",
        "aria-checked": "false",
        dataset: { talent: id },
        onclick: () => pick(id),
      },
      [
        shown(talentArt(id), 60, "creator__talent-pic"),
        el("span.hh-row__text", null, [
          el("span.hh-row__title.creator__talent-name", null, [talents[id].name]),
          el("span.hh-row__sub.creator__talent-blurb", { text: talents[id].blurb }),
        ]),
        el("span.hh-row__end", null, check),
      ],
    );
    talentRows[id] = row;
    list.append(row);
  }
  const beginBtn = el(
    "button.hh-btn",
    { type: "button", "aria-disabled": "true", onclick: begin },
    W.begin,
  );
  const talentStep = el("div.creator__step.creator__pick", { hidden: true }, [
    el("header.creator__who", null, [
      who,
      el("div.creator__who-text", null, [talentTitle, el("p.hh-sub", { text: W.talentSub })]),
    ]),
    el("div.creator__list", null, list),
    el("div.creator__foot", null, [
      el(
        "button.hh-btn.hh-btn--secondary.creator__back",
        { type: "button", onclick: () => show("look") },
        W.back,
      ),
      beginBtn,
    ]),
  ]);

  root.append(lookStep, talentStep);

  function renderTalentTitle() {
    const text = W.talentTitle(nameNow());
    if (talentTitle.textContent !== text) talentTitle.textContent = text;
  }

  function render() {
    title.textContent = editing ? W.editTitle : W.title;
    nextBtn.textContent = editing ? W.done : W.toTalent;
    // Handles for tests, which need not know the words.
    nextBtn.dataset.act = editing ? "done" : "next";
    beginBtn.dataset.act = "begin";
    renderTalentTitle();
    for (const [id, row] of Object.entries(talentRows))
      row.setAttribute("aria-checked", id === talent ? "true" : "false");
    beginBtn.setAttribute("aria-disabled", talent ? "false" : "true");
  }

  /** @param {"look" | "talent"} step */
  function show(step) {
    const toTalent = step === "talent" && !editing;
    picker.input.blur();
    lookStep.hidden = toTalent;
    talentStep.hidden = !toTalent;
    if (toTalent) picker.portrait(who);
    else picker.settle();
    render();
  }

  function pick(id) {
    talent = id;
    render();
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    // Everything painted while choosing is let go before the meadow paints.
    releaseArt();
    app.go("meadow").then((went) => {
      if (!went) leaving = false;
    });
  }

  function begin() {
    if (leaving) return;
    if (!talent) {
      app.toast(say("bad-talent"), { sound: "nope" });
      return;
    }
    const events = app.dispatch({
      type: "createKeeper",
      keeper: { name: nameNow(), ...picker.look(), talent },
    });
    if (events.some((e) => e.type === "keeperMade")) leave();
  }

  /** Editing a beekeeper who already exists. */
  function done() {
    if (leaving) return;
    const change = lookChange(app.state, picker.look(), picker.name());
    if (Object.keys(change).length) {
      const events = app.dispatch({ type: "setLook", look: change });
      if (!events.some((e) => e.type === "lookSet")) return;
    }
    leave();
  }

  render();
  // The first figure is up before the page is: no flash of an empty meadow.
  await Promise.race([picker.ready, wait(1500)]);

  return {
    update(state, events, action) {
      if (leaving) return;
      if (action?.type === "@replace") {
        editing = !!state.keeper?.made;
        talent = "";
        picker.set(lookOf(state), editing ? state.keeper.name : W.defaultName);
        show("look");
      } else picker.refresh();
    },
    unmount() {
      const page = document.documentElement.style;
      if (page.getPropertyValue("--hh-toast-top") === TOAST_TOP)
        page.removeProperty("--hh-toast-top");
      picker.destroy();
    },
  };
}
