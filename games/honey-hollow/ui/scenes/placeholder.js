// @ts-check
/**
 * The scene that stands in for one nobody has built yet: scenes/index.js
 * points a name at this file until its real module lands. It says which
 * scene it is standing in for and offers every registered scene and sheet,
 * so the flow can be walked while it is still being built.
 */

import { app } from "../app.js";
import { el } from "../dom.js";
import { PLACEHOLDER as W } from "../words.js";
import { SCENES } from "./index.js";
import { SHEETS } from "../sheets/index.js";

/** @param {HTMLElement} root */
export function mount(root) {
  const name = root.dataset.scene ?? "placeholder";
  const row = (names, tap) =>
    el(
      "div",
      { style: { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" } },
      names.map((n) =>
        el(
          "button.hh-btn.hh-btn--secondary.hh-btn--small",
          { type: "button", onclick: () => tap(n) },
          n,
        ),
      ),
    );
  root.classList.add("hh-page");
  root.append(
    el(
      "div",
      {
        style: {
          flex: "1",
          minHeight: "0",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "10px",
          padding: "16px",
          textAlign: "center",
        },
      },
      [
        el("div.hh-card", null, [
          el("h1.hh-heading", { text: W.title(name) }),
          el("p.hh-sub", { text: W.text }),
        ]),
        el("p.hh-sub", { text: W.scenes }),
        row(Object.keys(SCENES), (n) => app.go(n)),
        el("p.hh-sub", { text: W.sheets }),
        row(Object.keys(SHEETS), (n) => app.sheet(n)),
        el("div", { style: { marginTop: "8px" } }, [
          el("button.hh-btn", { type: "button", onclick: () => app.go("title") }, W.back),
        ]),
      ],
    ),
  );
  return {};
}
