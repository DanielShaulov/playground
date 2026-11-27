// @ts-check
/**
 * The title: the painted name over a little meadow, and the way in.
 *
 *   Continue   only when there is a game with a beekeeper in it → the meadow
 *   New game   asks first if that would wipe a game → the intro
 *   Settings   the settings sheet
 *
 * The picture is put together from whatever art is in (ground, beds, hives,
 * a tree, bees, and your own beekeeper once you have made one); each piece
 * is optional, and with none of them the title is still a title. Nothing
 * here is stored: the canvas is painted once at a fixed size and CSS fits it
 * to the phone.
 */

import { app } from "../app.js";
import { el, css, optional } from "../dom.js";
import { TITLE as W, SHELL, dayLabel } from "../words.js";
import { img, put, paintAll, DPR } from "../paint/sprite.js";

const styled = css(new URL("./title.css", import.meta.url));
const art = (file) => optional(new URL(`../art/${file}`, import.meta.url));

// The picture, in its own units. Everything stands on its feet at (x, y).
const PIC_W = 340;
const PIC_H = 232;
/** @type {[kind: string, name: string, x: number, y: number, scale: number, variant?: number][]} */
const PLAN = [
  ["tree", "leaf", 50, 120, 0.8, 0],
  ["bed", "lavender", 118, 116, 0.78, 0],
  ["bed", "lavender", 160, 110, 0.78, 1],
  ["bed", "sunflower", 258, 114, 0.8, 0],
  ["bed", "sunflower", 300, 124, 0.78, 1],
  ["bed", "clover", 34, 166, 0.84, 0],
  ["bed", "clover", 84, 172, 0.84, 1],
  ["hive", "skep", 146, 172, 0.98],
  ["hive", "box", 208, 164, 0.92],
  ["bed", "borage", 266, 170, 0.84, 0],
  ["bed", "dandelion", 58, 216, 0.9, 0],
  ["bed", "dandelion", 108, 222, 0.9, 1],
  ["front", "clover", 182, 220, 0.9, 0],
  ["bed", "lavender", 246, 222, 0.9, 1],
  ["bed", "lavender", 298, 214, 0.9, 0],
];
/** Where your own beekeeper stands, in front of the hives, once you have one: x, y, scale. */
const KEEPER = [180, 218, 0.8];
/** The bees that wander over the picture: x, y (picture units), size, facing left, seconds per round. */
const BEES = [
  [122, 58, 1.3, false, 9],
  [206, 92, 1.15, true, 11],
  [282, 56, 1.05, false, 8],
  [78, 126, 1.0, true, 12],
];

/**
 * Paint the little meadow. Resolves to the picture (a canvas with a few live
 * bees over it), or null if no art is in.
 * @param {(p: number) => void} onProgress
 * @param {any} look  the beekeeper to stand in it (the state's keeper slice), or null
 */
async function paintPicture(onProgress, look) {
  const [flowers, hives, scenery, grounds, bees, people] = await Promise.all(
    ["flowers.js", "hives.js", "scenery.js", "ground.js", "bee.js", "people.js"].map(art),
  );
  const you = look && people?.keeper ? look : null;
  /** @type {{ s: any, x: number, y: number, k: number, o?: any }[]} */
  const pieces = [];
  /** One job per sprite, so the loading bar moves and no frame is held long. */
  const jobs = [];
  const add = (make, x, y, k, o) =>
    jobs.push(() => {
      try {
        const s = make();
        if (s?.canvas) pieces.push({ s, x, y, k, o });
      } catch {
        /* a piece that is not painted yet is simply left out */
      }
    });

  for (const [kind, name, x, y, k, v = 0] of PLAN) {
    // The front bed makes way for the beekeeper.
    if (kind === "front" && you) add(() => people.keeper(you, "wave", "happy"), ...KEEPER);
    else if ((kind === "bed" || kind === "front") && flowers?.bed) {
      if (flowers.PAINTED && !flowers.PAINTED.includes(name)) continue;
      add(() => flowers.bed(name, "bloom", v), x, y, k);
    } else if (kind === "hive" && hives?.hive) add(() => hives.hive(name), x, y, k);
    else if (kind === "tree" && scenery?.tree) add(() => scenery.tree(name, v), x, y, k);
  }
  /** @type {any} the grass everything stands on */
  let turf = null;
  if (grounds?.ground) {
    jobs.push(() => {
      try {
        turf = grounds.ground("title", "summer", PIC_W, 178);
      } catch {
        /* no grass: the beds stand on the paper */
      }
    });
  }
  /** @type {any[]} the bee's two wing positions */
  const wings = [];
  if (bees?.bee) {
    jobs.push(() => {
      try {
        wings.push(bees.bee(0), bees.bee(1));
      } catch {
        wings.length = 0;
      }
    });
  }
  if (!jobs.length) return null;
  await paintAll(jobs, onProgress);
  if (!pieces.length) return null;
  pieces.sort((a, b) => a.y - b.y); // back to front

  const canvas = /** @type {HTMLCanvasElement} */ (
    el("canvas.hh-title__canvas", { "aria-hidden": "true" })
  );
  canvas.width = Math.ceil(PIC_W * DPR);
  canvas.height = Math.ceil(PIC_H * DPR);
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);
  if (turf?.canvas) put(ctx, turf, 0, 54);
  for (const p of pieces) put(ctx, p.s, p.x, p.y, p.k, p.o);

  // The bees are not in the painting: each is two small pictures, one per
  // wing position, flickering, on a slow round of its own (title.css). With
  // reduced motion they simply hang where they are.
  const picture = el("div.hh-title__picture", null, canvas);
  if (wings.length === 2 && wings.every((s) => s?.canvas)) {
    BEES.forEach(([x, y, k, flip, secs], i) => {
      const w = wings[0].w * Number(k);
      picture.append(
        el(
          "span.hh-title__bee",
          {
            "aria-hidden": "true",
            style: {
              left: `${((Number(x) - w / 2) / PIC_W) * 100}%`,
              top: `${(Number(y) / PIC_H) * 100}%`,
              width: `${(w / PIC_W) * 100}%`,
              animationDuration: `${secs}s`,
              animationDelay: `${-i * 2.3}s`,
              animationName: i % 2 ? "hh-title-roam-b" : "hh-title-roam-a",
            },
          },
          el(
            "span.hh-title__wings",
            { style: flip ? { transform: "scaleX(-1)" } : null },
            wings.map((s) => img(s, s.w)),
          ),
        ),
      );
    });
  }
  return picture;
}

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  const [chrome, kit, picture] = await Promise.all([
    art("chrome.js"),
    optional(new URL("../chrome.js", import.meta.url)),
    paintPicture(
      (p) => app.progress(0.5 + p * 0.45),
      app.state?.keeper?.made ? app.state.keeper : null,
    ).catch(() => null),
  ]);

  let name = el("h1.hh-title__name", { text: SHELL.name });
  try {
    const lettered = chrome?.logo?.();
    if (lettered?.canvas) {
      const pic = img(lettered, lettered.w, SHELL.name);
      pic.className = "hh-title__logo";
      name = el("h1.hh-title__name", null, pic);
    }
  } catch {
    /* the words in Mali will do */
  }

  const menu = el("div.hh-title__menu");
  const draw = () => {
    const s = app.state;
    const playing = !!s?.keeper?.made;
    const begin = async () => {
      if (playing && !(await app.confirm({ ...W.confirmNew, danger: true }))) return;
      app.newGame();
      app.go("intro");
    };
    menu.replaceChildren();
    if (playing) {
      menu.append(
        el(
          "button.hh-btn.hh-btn--block",
          { type: "button", dataset: { act: "continue" }, onclick: () => app.go("meadow") },
          W.resume,
        ),
        el("p.hh-title__where", {
          text: W.resumeNote(s.keeper.name, dayLabel(app.core.calendarOf(s.clock.day))),
        }),
      );
    }
    menu.append(
      el(
        `button.hh-btn.hh-btn--block${playing ? ".hh-btn--secondary" : ""}`,
        { type: "button", dataset: { act: "new" }, onclick: begin },
        W.fresh,
      ),
      el(
        "button.hh-btn.hh-btn--quiet.hh-btn--small.hh-title__settings",
        { type: "button", dataset: { act: "settings" }, onclick: () => app.sheet("settings") },
        [safeIcon(kit, "settings"), W.settings],
      ),
    );
  };
  draw();

  root.classList.add("hh-page");
  root.append(
    el("div.hh-title", null, [
      el("div.hh-title__art", null, [
        name,
        picture,
        el("p.hh-title__tagline", { text: W.tagline }),
      ]),
      menu,
      el("p.hh-title__credit", { text: W.credit }),
    ]),
  );
  app.ambience("morning");

  return {
    update(_state, _events, action) {
      if (action?.type === "@replace") draw();
    },
  };
}

/** A painted icon for a button, or nothing if the icons are not in. */
function safeIcon(kit, name) {
  try {
    return kit?.iconImg?.(name, 24) ?? null;
  } catch {
    return null;
  }
}
