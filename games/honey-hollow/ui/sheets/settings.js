// @ts-check
/**
 * The settings sheet: sound, reduced motion, day speed, a backup code (copy
 * one out, paste one in), start again, credits and the build.
 *
 * Preferences go through app.setSetting and live apart from the save, so
 * starting again or restoring a game keeps them. Everything that replaces
 * the game asks first (start again asks twice) and a pasted code is opened
 * by the core before anything is touched.
 */

import { app } from "../app.js";
import { el, css, optional } from "../dom.js";
import { BUILD, latest, troubles } from "../build.js";
import { SETTINGS as W, dayLabel } from "../words.js";

export const title = W.title;

const styled = css(new URL("./settings.css", import.meta.url));

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const kit = await optional(new URL("../chrome.js", import.meta.url));
  const icon = (name) => {
    try {
      return kit?.iconImg?.(name, 28) ?? el("span.hh-set__noicon");
    } catch {
      return el("span.hh-set__noicon");
    }
  };
  const phoneAsksCalm = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---------- preferences ----------

  /** A row with a switch at its end. */
  const toggle = (key, label, hint, pictureOf, isOn, flip, locked = false) => {
    const picture = el("span.hh-set__icon");
    const knob = el(
      "button.hh-switch",
      {
        type: "button",
        role: "switch",
        "aria-label": label,
        "aria-disabled": locked ? "true" : null,
        dataset: { set: key },
        onclick: () => {
          if (locked) return;
          flip(!isOn());
          paint();
        },
      },
      el("span.hh-switch__knob"),
    );
    const paint = () => {
      knob.setAttribute("aria-checked", String(isOn()));
      picture.replaceChildren(icon(pictureOf()));
    };
    paint();
    return {
      paint,
      row: el("li.hh-row", null, [
        picture,
        el("div.hh-row__text", null, [
          el("div.hh-row__title", { text: label }),
          el("div.hh-row__sub", { text: hint }),
        ]),
        el("div.hh-row__end", null, knob),
      ]),
    };
  };

  const sound = toggle(
    "sound",
    W.sound,
    W.soundHint,
    () => (app.settings.sound ? "sound-on" : "sound-off"),
    () => app.settings.sound,
    (on) => app.setSetting("sound", on),
  );
  const calm = toggle(
    "motion",
    W.calm,
    phoneAsksCalm ? W.calmPhone : W.calmHint,
    () => "pause",
    () => !app.settings.motion,
    (on) => app.setSetting("motion", !on),
    phoneAsksCalm,
  );

  const speeds = [
    ["normal", W.speedNormal, "play"],
    ["fast", W.speedFast, "fast"],
  ].map(([value, label]) =>
    el(
      "button.hh-btn.hh-btn--small",
      {
        type: "button",
        dataset: { set: "speed", value },
        onclick: () => {
          app.setSetting("speed", value);
          paintSpeed();
        },
      },
      label,
    ),
  );
  const paintSpeed = () => {
    for (const b of speeds) {
      const on = b.dataset.value === app.settings.speed;
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("hh-btn--secondary", !on);
    }
  };
  paintSpeed();

  const prefs = el("ul.hh-list", null, [
    sound.row,
    calm.row,
    el("li.hh-row.hh-set__speed", null, [
      el("span.hh-set__icon", null, icon("fast")),
      el("div.hh-row__text", null, [
        el("div.hh-row__title", { text: W.speed }),
        el("div.hh-row__sub", { text: W.speedHint }),
      ]),
      el("div.hh-row__end.hh-set__seg", { role: "group", "aria-label": W.speed }, speeds),
    ]),
  ]);

  // ---------- the keeper's notes ----------

  const notesAgain = async () => {
    app.forgetNotes();
    const teach = await import("../teach.js").catch(() => null);
    teach?.reset?.();
    app.toast(W.notesDone);
  };
  prefs.append(
    el("li.hh-row", null, [
      el("span.hh-set__icon", null, icon("book")),
      el("div.hh-row__text", null, [
        el("div.hh-row__title", { text: W.notes }),
        el("div.hh-row__sub", { text: W.notesHint }),
      ]),
      el(
        "div.hh-row__end",
        null,
        el(
          "button.hh-btn.hh-btn--small.hh-btn--secondary",
          { type: "button", dataset: { act: "notes" }, onclick: notesAgain },
          W.notesGo,
        ),
      ),
    ]),
  );

  // ---------- the saved game ----------

  const codeOut = /** @type {HTMLTextAreaElement} */ (
    el("textarea.hh-set__code", {
      readonly: true,
      rows: "4",
      "aria-label": W.backupLabel,
      spellcheck: "false",
      onfocus: () => codeOut.select(),
    })
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeOut.value);
      app.toast(W.copied);
    } catch {
      // No clipboard permission: select it, so "Copy" is one press away.
      codeOut.focus();
      codeOut.select();
      let done = false;
      try {
        done = document.execCommand("copy");
      } catch {
        /* nothing more to try */
      }
      app.toast(done ? W.copied : W.copyFailed);
    }
  };
  const backupPanel = el("div.hh-set__panel", { hidden: true, dataset: { panel: "backup" } }, [
    el("p.hh-sub", { text: W.backupHint }),
    codeOut,
    el("button.hh-btn.hh-btn--small", { type: "button", dataset: { act: "copy" }, onclick: copy }, [
      W.copy,
    ]),
  ]);

  const codeIn = /** @type {HTMLTextAreaElement} */ (
    el("textarea.hh-set__code", {
      rows: "4",
      "aria-label": W.restoreLabel,
      placeholder: W.restoreLabel,
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
    })
  );
  const restore = async () => {
    const text = codeIn.value.trim();
    if (!text) return app.toast(W.restoreEmpty, { sound: "nope" });
    const found = app.readSave(text);
    if (!found) return app.toast(W.restoreBad, { sound: "nope" });
    const who = found.keeper?.made ? found.keeper.name : "";
    const when = dayLabel(app.core.calendarOf(found.clock.day));
    if (!(await app.confirm({ ...W.confirmRestore(who, when), danger: true }))) return;
    if (app.importSave(text)) app.toast(W.restored);
    else app.toast(W.restoreBad, { sound: "nope" });
  };
  const restorePanel = el("div.hh-set__panel", { hidden: true, dataset: { panel: "restore" } }, [
    el("p.hh-sub", { text: W.restoreHint }),
    codeIn,
    el(
      "button.hh-btn.hh-btn--small",
      { type: "button", dataset: { act: "restore-go" }, onclick: restore },
      W.restoreGo,
    ),
  ]);

  /** Open one panel (and shut the other); tapping its button again shuts it. */
  const show = (panel) => {
    const open = panel.hidden;
    backupPanel.hidden = true;
    restorePanel.hidden = true;
    panel.hidden = !open;
    if (!open) return;
    if (panel === backupPanel) codeOut.value = app.exportSave();
    panel.scrollIntoView({ block: "nearest", behavior: app.settings.motion ? "smooth" : "auto" });
  };

  const restart = async () => {
    if (!(await app.confirm({ ...W.confirmRestart1, danger: true }))) return;
    if (!(await app.confirm({ ...W.confirmRestart2, danger: true }))) return;
    await app.reset();
    app.toast(W.restarted);
  };

  const saves = el("div.hh-set__saves", null, [
    el(
      "button.hh-btn.hh-btn--secondary.hh-btn--block",
      { type: "button", dataset: { act: "backup" }, onclick: () => show(backupPanel) },
      W.backup,
    ),
    backupPanel,
    el(
      "button.hh-btn.hh-btn--secondary.hh-btn--block",
      { type: "button", dataset: { act: "restore" }, onclick: () => show(restorePanel) },
      W.restore,
    ),
    restorePanel,
    el(
      "button.hh-btn.hh-btn--danger.hh-btn--block",
      { type: "button", dataset: { act: "restart" }, onclick: restart },
      W.restart,
    ),
    el("p.hh-sub.hh-set__hint", { text: W.restartHint }),
  ]);

  // ---------- credits ----------

  // Which release this page is made of (not merely which one the site has
  // now: a phone can hold an older one), and the last thing that would not
  // load, in the machine's own words. Both are for a screenshot when
  // something is wrong.
  const build = el("p.hh-sub.hh-set__build", { text: BUILD ? W.build(BUILD.slice(0, 7)) : "" });
  latest(4000).then((now) => {
    if (!now || !build.isConnected) return;
    build.textContent =
      BUILD && now !== BUILD
        ? W.buildBehind(BUILD.slice(0, 7), now.slice(0, 7))
        : W.build(now.slice(0, 7));
  });
  const [last] = troubles();
  const trouble = last
    ? el("p.hh-sub.hh-set__build.hh-set__trouble", {
        text: W.trouble(last.what, last.why, last.build.slice(0, 7), new Date(last.at)),
      })
    : null;

  root.append(
    el("div.hh-set", null, [
      prefs,
      el("hr.hh-sprig"),
      el("h3.hh-heading", { text: W.saves }),
      saves,
      el("hr.hh-rule"),
      el("h3.hh-heading", { text: W.credits }),
      el(
        "div.hh-set__credits",
        null,
        W.creditLines.map((line) => el("p.hh-sub", { text: line })),
      ),
      build,
      trouble,
    ]),
  );

  return {
    update(_state, _events, action) {
      if (action?.type !== "@settings") return;
      sound.paint();
      calm.paint();
      paintSpeed();
    },
  };
}
