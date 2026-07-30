/**
 * The bits of chrome every game needs: a top bar with a back link and some
 * stat readouts, a play area, and a full-screen overlay for start/game-over.
 *
 * Building this from JS keeps each game's index.html down to a script tag.
 */

import { createStage } from "./engine.js";

/**
 * @param {{title: string, stats?: string[]}} options
 *   `stats` names the HUD readouts, e.g. ['Score', 'Best'].
 * @returns {{stage, overlay, setStat: (name: string, value: any) => void, root: HTMLElement}}
 */
export function createShell({ title, stats = [] } = {}) {
  document.title = title ? `${title} · Playground` : "Playground";

  const root = document.createElement("div");
  root.className = "app";

  const hud = document.createElement("div");
  hud.className = "hud";
  hud.innerHTML = `<a class="back" href="../../index.html" aria-label="Back to games">‹</a>`;

  const spacer = document.createElement("div");
  spacer.className = "spacer";
  hud.appendChild(spacer);

  const statEls = new Map();
  for (const name of stats) {
    const el = document.createElement("div");
    el.className = "hud-stat";
    el.innerHTML = `${name} <b>0</b>`;
    hud.appendChild(el);
    statEls.set(name, el.querySelector("b"));
  }

  const stageEl = document.createElement("div");
  stageEl.className = "stage";

  const overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  overlayEl.hidden = true;
  stageEl.appendChild(overlayEl);

  root.append(hud, stageEl);
  document.body.appendChild(root);

  // Stage must be created after the container is in the document, so it can
  // measure a real size.
  const stage = createStage(stageEl);
  // Keep the overlay above the canvas the stage just appended.
  stageEl.appendChild(overlayEl);

  return {
    root,
    stage,

    setStat(name, value) {
      const el = statEls.get(name);
      if (el) el.textContent = value;
    },

    overlay: {
      /**
       * @param {{heading?: string, score?: string|number, body?: string,
       *          button?: string, onButton?: () => void}} content
       */
      show({ heading, score, body, button, onButton } = {}) {
        overlayEl.replaceChildren();

        if (heading) {
          const h = document.createElement("h1");
          h.textContent = heading;
          overlayEl.appendChild(h);
        }
        if (score !== undefined) {
          const s = document.createElement("div");
          s.className = "big-score";
          s.textContent = score;
          overlayEl.appendChild(s);
        }
        if (body) {
          const p = document.createElement("p");
          p.textContent = body;
          overlayEl.appendChild(p);
        }
        if (button) {
          const b = document.createElement("button");
          b.className = "btn";
          b.textContent = button;
          b.addEventListener("click", () => onButton?.());
          overlayEl.appendChild(b);
        }

        overlayEl.hidden = false;
      },

      hide() {
        overlayEl.hidden = true;
      },

      get visible() {
        return !overlayEl.hidden;
      },
    },
  };
}
