// @ts-check
/**
 * The beekeeper picker: a live preview of the figure on a patch of meadow, a
 * name field with "Surprise me", and tabs of painted swatches. The creator
 * scene and the wardrobe sheet both use it and lay its four parts out
 * themselves:
 *
 *   const picker = createPicker({ look, name, onChange, onKeyboard });
 *   picker.stage, picker.nameRow, picker.tabs, picker.panel   the parts
 *   picker.look()  picker.name()                              what is chosen
 *   picker.set(look, name)  picker.refresh()  picker.destroy()
 *
 * Painting. A figure takes real time to paint (see `timing`), so a tap never
 * waits for one: the tap only marks the choice, and a small queue paints on
 * the next frame, the preview first, then the swatches of the open tab one
 * or two a frame. The old picture stays until the new one is ready, and a
 * second tap before then simply replaces the job.
 *
 * Memory. The art cache (paint/sprite.js) never lets go by itself, and a
 * figure is about a megabyte on a 3x phone. Everything shown here is copied
 * into the picker's own small canvases, so the cache is only a convenience:
 * `spent` counts what this module has put in it, and past a budget the cache
 * is asked to `drop` the keeper's figures and portraits (the cache also trims
 * itself by age). `releaseArt()` does it at once, for a scene that is leaving.
 */

import { app } from "./app.js";
import { el, on } from "./dom.js";
import { sprite, put, img, drop, cached, DPR } from "./paint/sprite.js";
import { wash, brush, pencil, blob, ellipse, within } from "./paint/wash.js";
import { keeper, STANDING, BUST_W, BUST_H } from "./art/people.js";
import * as kit from "./art/people/kit.js";
import { ground } from "./art/ground.js";
import { bed } from "./art/flowers.js";
import { hive } from "./art/hives.js";
import { bee } from "./art/bee.js";
import { icon } from "./art/icons.js";
import { KEEPER as W } from "./words/keeper.js";

/** @typedef {{ body: string, skin: string, hair: string, hairColor: string, overalls: string, shirt: string, hat: string, beard: string, glasses: string }} Look */
/** @typedef {{ id: string, name: string, owned: boolean, unlock: any }} Piece */

/** @type {Record<string, any>} */
const SKINS = kit.SKINS;
/** @type {Record<string, any>} */
const HAIRS = kit.HAIRS;
/** @type {Record<string, any>} */
const OVERALLS = kit.OVERALLS;
/** @type {Record<string, any>} */
const SHIRTS = kit.SHIRTS;

const TABS = [
  { id: "body", parts: ["body"] },
  { id: "skin", parts: ["skin"] },
  { id: "hair", parts: ["hair"] },
  { id: "hairColor", parts: ["hairColor"] },
  { id: "clothes", parts: ["overalls", "shirt"], layout: "two" },
  { id: "hat", parts: ["hat"] },
  // Glasses first: they are for everyone, and the man's beards then peek in beside them.
  { id: "extras", parts: ["glasses", "beard"], layout: "side" },
];
/** Parts whose swatch is a little portrait; the rest are dabs of colour. */
const PORTRAITS = ["body", "hair", "hat", "beard", "glasses"];
/** The mood the preview and the portraits wear. */
const MOOD = "happy";

/**
 * The style worn on the other body when none was ever chosen there. Each
 * lands on a style that reads plainly as that body at a glance: long or
 * dressed hair on the woman, short on the man.
 */
const TO_MAN = {
  "long-waves": "tousled",
  braid: "side-part",
  bun: "cropped",
  curls: "curly",
  bob: "tousled",
};
const TO_WOMAN = {
  tousled: "long-waves",
  curly: "curls",
  "side-part": "braid",
  "long-tied": "long-waves",
  cropped: "bob",
};

// ───────────────────────── memory and timing ─────────────────────────

const MB = 1024 * 1024;
/** Bytes of canvas this module has put into the art cache since it was last emptied. */
let spent = 0;
/** The last measured paint of each kind, in ms (read by the check script). */
export const timing = { figure: 0, bust: 0, fine: 0, fineScale: 1.5, forgets: 0 };

/**
 * A figure or a bust from the art, timed and counted. `scale` asks people.js
 * for a finer paint of a figure (its fourth argument); until it takes one the
 * argument is ignored and the usual 1.5x paint comes back.
 * @param {Look} look
 * @param {"stand" | "bust"} pose
 * @param {number} [scale]
 */
function paintKeeper(look, pose, scale) {
  const before = cached();
  const t0 = performance.now();
  const s = scale ? /** @type {any} */ (keeper)(look, pose, MOOD, scale) : keeper(look, pose, MOOD);
  if (cached() > before) {
    timing[scale ? "fine" : pose === "bust" ? "bust" : "figure"] = Math.round(
      performance.now() - t0,
    );
    spent += s.canvas.width * s.canvas.height * 4;
  }
  return s;
}

/**
 * Let go of the figures and portraits tried on, once this module has put
 * more than `budget` megabytes of them in the art cache. Only the keeper's
 * own pieces go: the meadow under the wardrobe keeps everything it painted.
 */
function trim(budget) {
  if (spent <= budget * MB) return;
  drop("keeper|");
  spent = 0;
  timing.forgets++;
}

/** For a scene on its way out: let go of what the picker painted. */
export function releaseArt() {
  trim(4);
}

// ───────────────────────── small paintings ─────────────────────────

const DAB = 56;

/** A dab of one colour: skin, hair or cloth. */
function dab(/** @type {string} */ kind, /** @type {string} */ id) {
  return sprite(
    `keeper-dab-${kind}-${id}`,
    DAB,
    DAB,
    (ctx, w, h, r) => {
      const c = w / 2;
      if (kind === "skin") {
        const t = SKINS[id] ?? SKINS.s3;
        const shape = blob(r, c, c + 1, 20, 0.08, 11);
        wash(ctx, shape, t.base, {
          r,
          strength: 0.93,
          soft: 0.12,
          layers: 10,
          charge: { color: t.shade, n: 2, strength: 0.28 },
        });
        wash(ctx, ellipse(c + 7, c + 7, 6, 4.4, 8), t.cheek, {
          r,
          strength: 0.36,
          soft: 0.4,
          layers: 5,
          edge: 0,
        });
        pencil(ctx, shape, { r, closed: true, alpha: 0.4, gaps: 0.14 });
      } else if (kind === "hairColor") {
        const t = HAIRS[id] ?? HAIRS.h3;
        const shape = blob(r, c, c + 1, 20, 0.14, 10, 0.92);
        wash(ctx, shape, t.base, {
          r,
          strength: 0.94,
          soft: 0.14,
          layers: 10,
          charge: { color: t.dark, n: 3, strength: 0.4 },
        });
        // A few strands, so it reads as hair and not as cloth.
        within(ctx, shape, () => {
          for (const [x, lean, tone] of [
            [-9, 5, t.dark],
            [-2, 7, t.light],
            [6, 6, t.light],
            [12, 3, t.dark],
          ]) {
            brush(
              ctx,
              [
                [c + Number(x), c - 17],
                [c + Number(x) + Number(lean), c - 2],
                [c + Number(x) - 1, c + 18],
              ],
              String(tone),
              { r, width: 2.2, strength: 0.55 },
            );
          }
        });
        pencil(ctx, shape, { r, closed: true, alpha: 0.42, gaps: 0.14 });
      } else {
        const t = (kind === "overalls" ? OVERALLS[id] : SHIRTS[id]) ?? OVERALLS.o1;
        const shape = blob(r, c, c + 1, 20, 0.07, 11);
        wash(ctx, shape, t.base, {
          r,
          strength: 0.93,
          soft: 0.1,
          layers: 10,
          charge: { color: t.dark, n: 2, strength: 0.34 },
        });
        if (t.pattern === "stripes")
          within(ctx, shape, () => {
            for (let x = -18; x <= 18; x += 7.2)
              brush(
                ctx,
                [
                  [c + x, c - 22],
                  [c + x + 1.5, c],
                  [c + x, c + 23],
                ],
                t.mark,
                { r, width: 2.3, strength: 0.7 },
              );
          });
        pencil(ctx, shape, { r, closed: true, alpha: 0.5, gaps: 0.12 });
      }
    },
    { ax: 0.5, ay: 0.5 },
  );
}

/** The little pictures on the tabs that are not a dab or a kit icon. */
function tabArt(/** @type {string} */ name) {
  return sprite(
    `keeper-tab-${name}`,
    28,
    28,
    (ctx, w, h, r) => {
      const fill = (pts, color, o) =>
        wash(ctx, pts, color, {
          r,
          layers: 7,
          strength: 0.93,
          soft: 0.05,
          rounds: 1,
          detail: 1,
          ...o,
        });
      const ring = (pts, o) =>
        pencil(ctx, pts, { r, closed: true, alpha: 0.7, width: 1, gaps: 0.06, ...o });
      if (name === "body") {
        // Two people, side by side.
        for (const [x, cloth, hair] of [
          [9, "dustyRose", "hairChestnut"],
          [19.5, "denim", "hairEspresso"],
        ]) {
          const cx = Number(x);
          const shoulders = ellipse(cx, 26, 7.2, 7.6, 10);
          fill(shoulders, String(cloth));
          ring(shoulders);
          fill(ellipse(cx, 9.6, 5.6, 5.4, 10), String(hair));
          const head = ellipse(cx, 11.6, 4.5, 4.9, 10);
          fill(head, "skin3");
          ring(head, { alpha: 0.55 });
        }
      } else if (name === "hair") {
        const mass = blob(r, 14, 13.5, 11.2, 0.12, 10);
        fill(mass, "hairChestnut", { charge: { color: "hairChestnutDeep", n: 2, strength: 0.4 } });
        ring(mass);
        const face = ellipse(14, 16.4, 5.6, 6.2, 10);
        fill(face, "skin3");
        fill(ellipse(11.6, 10.2, 6.4, 3.4, 8, -0.35), "hairChestnut");
        brush(
          ctx,
          [
            [6, 9],
            [9, 16],
            [7.4, 23],
          ],
          "hairChestnutLight",
          { r, width: 1.6, strength: 0.6 },
        );
      } else {
        // Extras: a pair of round glasses.
        for (const x of [8.2, 19.8]) {
          const lens = ellipse(x, 14.4, 5, 5, 12);
          fill(lens, "sky", { strength: 0.5 });
          pencil(ctx, lens, { r, closed: true, alpha: 0.9, width: 1.5, gaps: 0 });
        }
        pencil(
          ctx,
          [
            [12.8, 13.4],
            [14, 12.6],
            [15.2, 13.4],
          ],
          { r, alpha: 0.9, width: 1.4, gaps: 0 },
        );
      }
    },
    { ax: 0.5, ay: 0.5 },
  );
}

// ───────────────────────── the paint queue ─────────────────────────

/**
 * Jobs by key; a newer job with a key replaces the older one. Runs on the
 * frame after it is asked, for at most ~10 ms a frame (one job at least), the
 * job called "figure" always first.
 * @param {(busy: boolean) => void} tell
 */
function createQueue(tell) {
  /** @type {Map<string, () => void>} */
  const jobs = new Map();
  let raf = 0;
  /** @type {any} */
  let timer = 0;
  let dead = false;
  const pump = () => {
    if (raf || timer || dead) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      timer = setTimeout(run, 0);
    });
  };
  function run() {
    timer = 0;
    if (dead) return;
    const t0 = performance.now();
    do {
      const key = jobs.has("figure") ? "figure" : jobs.keys().next().value;
      if (key === undefined) break;
      const job = jobs.get(key);
      jobs.delete(key);
      try {
        job?.();
      } catch (err) {
        console.error("[hollow] keeper picker could not paint:", err);
      }
    } while (performance.now() - t0 < 10);
    if (jobs.size) pump();
    else tell(false);
  }
  return {
    add(/** @type {string} */ key, /** @type {() => void} */ job) {
      if (dead) return;
      jobs.delete(key);
      jobs.set(key, job);
      tell(true);
      pump();
    },
    stop() {
      dead = true;
      jobs.clear();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    },
  };
}

// ───────────────────────── looks ─────────────────────────

/** The look to start from: the state's keeper where its parts are real ones. */
export function lookOf(state) {
  const core = app.core;
  /** @type {any} */
  const look = { ...core.DEFAULT_LOOK };
  for (const part of core.LOOK_PARTS) {
    const id = state?.keeper?.[part];
    if (typeof id === "string" && core.owns(state, part, id)) look[part] = id;
  }
  return /** @type {Look} */ (look);
}

/**
 * What `setLook` should be sent to turn the state's keeper into `look` called
 * `name`: only the parts that differ. An empty name is left as it was.
 * @returns {Record<string, string>}
 */
export function lookChange(state, look, name) {
  /** @type {Record<string, string>} */
  const change = {};
  for (const part of app.core.LOOK_PARTS)
    if (look[part] !== state.keeper?.[part]) change[part] = look[part];
  if (name && name !== state.keeper?.name) change.name = name;
  return change;
}

/** A name as the core will keep it. */
export const tidyName = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** The word or two a resting swatch wears: who or what it comes from. */
function earnShort(unlock) {
  /** @type {any} */
  const regulars = app.core.REGULARS;
  if (unlock?.gift) return regulars?.[unlock.gift[0]]?.name ?? W.earnShort.unknown;
  if (unlock?.goal) return W.earnShort.goal;
  if (typeof unlock?.tier === "number") return W.earnShort.tier;
  if (unlock?.ribbon) return W.earnShort.ribbon;
  return W.earnShort.unknown;
}

/** How a piece that is not owned yet is earned, in words. */
function earnText(unlock) {
  const core = app.core;
  /** @type {any} */
  const goals = core.GOALS;
  /** @type {any} */
  const regulars = core.REGULARS;
  /** @type {any} */
  const tiers = core.TIERS;
  if (unlock?.gift) {
    const who = regulars?.[unlock.gift[0]]?.name;
    return who ? W.earn.gift(who) : W.earn.unknown;
  }
  if (unlock?.goal) {
    const goal = Array.isArray(goals)
      ? goals.find((g) => g.id === unlock.goal)
      : goals?.[unlock.goal];
    return goal?.name ? W.earn.goal(goal.name) : W.earn.unknown;
  }
  if (typeof unlock?.tier === "number") {
    const tier = Array.isArray(tiers)
      ? tiers.find((t) => t.tier === unlock.tier)
      : tiers?.[unlock.tier];
    return tier?.name ? W.earn.tier(tier.name) : W.earn.unknown;
  }
  if (unlock?.ribbon) return W.earn.ribbon;
  return W.earn.unknown;
}

// ───────────────────────── the picker ─────────────────────────

/**
 * @param {{
 *   look: Look,
 *   name?: string,
 *   placeholder?: string,
 *   budget?: number,
 *   onChange?: () => void,
 *   onKeyboard?: (kb: { open: boolean, height: number, top: number }) => void,
 * }} opts
 *   budget: megabytes of art this picker may leave in the cache before it is emptied
 */
export function createPicker(opts) {
  const core = app.core;
  const budget = opts.budget ?? 24;
  /** @type {Look} */
  let look = { ...opts.look };
  /** The last style worn on each body, and the man's beard, so switching back loses nothing. */
  /** @type {{ hair: Record<string, string | null>, beard: string }} */
  const memory = { hair: { woman: null, man: null }, beard: "none" };
  const remember = () => {
    memory.hair[look.body] = look.hair;
    if (look.body === "man") memory.beard = look.beard;
  };
  remember();
  /** @type {Record<string, any>} */
  let wardrobe = core.wardrobeNow(app.state);
  let tab = TABS[0].id;
  let dead = false;

  // ── the preview ──

  const canvas = /** @type {HTMLCanvasElement} */ (el("canvas.keeper-stage__pic"));
  const stage = el(
    "div.keeper-stage",
    { role: "img", "aria-label": W.preview(""), dataset: { painting: "1" } },
    canvas,
  );
  const queue = createQueue((busy) => {
    stage.dataset.painting = busy ? "1" : "0";
  });
  /** What stands round the beekeeper; painted once, in the first job. */
  /** @type {null | { patch: any, hive: any, beds: any[], bee: any }} */
  let scenery = null;
  /** @type {any} the figure on show */
  let figure = null;

  const PATCH_W = 240;
  const PATCH_H = 84;
  /** Room above the feet, in figure heights (a tall hat), and how much of the patch lies below them. */
  const HEAD = 1.18;
  const UNDER = 0.42;
  /** The usual figure is painted at 1.5x: drawn taller than this it goes soft. */
  const SOFT = 250;
  /** The finest paint ever asked for, and how far past its own size a paint may be drawn. */
  const FINEST = 2.5;
  const STRETCH = 1.36;
  /** The finest paint people.js has given so far (1.5 until it offers more). */
  let fine = 1.5;
  /** @type {any} */
  let sharpTimer = 0;

  /**
   * How tall the figure stands on a stage w x h, and the paint scale that
   * would keep it crisp there. The figure takes all the room it is given, up
   * to what the finest paint on offer can fill without going soft.
   */
  function measure(w, h) {
    const wide = Math.min(w - 8, ((h - 6) / 1.5) * 2.3);
    const room = Math.min((h - 4 - PATCH_H * (wide / PATCH_W) * UNDER) / HEAD, w / 0.72);
    const limit = fine > 1.5 ? fine * STANDING * STRETCH : SOFT;
    const wish = Math.min(room, FINEST * STANDING * STRETCH) / (STANDING * STRETCH);
    return {
      stand: Math.max(40, Math.min(room, limit)),
      want: Math.max(1.5, Math.min(FINEST, Math.ceil(wish * 2) / 2)),
    };
  }

  function drawStage() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * DPR);
    const ph = Math.round(h * DPR);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { stand } = measure(w, h);
    const k = stand / STANDING;
    const patchW = Math.min(w - 8, stand * 2.3);
    const q = patchW / PATCH_W;
    const patchH = PATCH_H * q;
    // On a tall phone there is room to spare: stand a little above the bottom.
    const spare = Math.max(0, h - 4 - stand * HEAD - patchH * UNDER);
    const feet = h - 2 - patchH * UNDER - spare * 0.42;
    const cx = w / 2;
    const side = patchW * 0.36;
    // Beside a figure that fills a narrow stage there is no room for the hive and the beds.
    const roomy = patchW >= stand * 1.2;
    if (scenery)
      ctx.drawImage(scenery.patch.canvas, cx - patchW / 2, feet - patchH * 0.58, patchW, patchH);
    if (scenery && roomy) {
      put(ctx, scenery.hive, cx - side, feet - patchH * 0.06, q * 0.66);
      put(ctx, scenery.beds[0], cx + side, feet - patchH * 0.1, q * 0.6);
      put(ctx, scenery.beds[1], cx + side * 0.62, feet + patchH * 0.2, q * 0.5);
      put(ctx, scenery.bee, cx - side * 0.62, feet - patchH * 0.74, q * 1.1, { flip: true });
      put(ctx, scenery.bee, cx - side * 1.1, feet - patchH * 1.0, q * 0.9);
    }
    if (figure) put(ctx, figure, cx, feet, k);
    // One clump in front of the feet, so the figure stands in the grass, not on it.
    if (scenery && roomy)
      put(ctx, scenery.beds[2], cx - side * 0.56, feet + patchH * 0.26, q * 0.5);
  }

  let firstFigure = () => {};
  /** Resolves when the first figure is on show. @type {Promise<void>} */
  const ready = new Promise((ok) => (firstFigure = ok));

  /**
   * Swap the figure on show for a finer paint of the same look, when the
   * stage is big enough to want one, and note how fine a paint came back.
   */
  function sharpen() {
    const { want } = measure(stage.clientWidth, stage.clientHeight);
    if (want <= 1.5) return;
    const s = paintKeeper(look, "stand", want);
    const got = s.canvas.width / (s.w * DPR);
    fine = got > 1.6 ? got : 1.5;
    timing.fineScale = fine;
    figure = s;
  }

  function paintFigure() {
    clearTimeout(sharpTimer);
    queue.add("figure", () => {
      trim(budget);
      if (!scenery) {
        scenery = {
          patch: ground("keeper", "spring", PATCH_W, PATCH_H),
          hive: hive("skep"),
          beds: [
            bed("lavender", "bloom", 0),
            bed("dandelion", "bloom", 1),
            bed("clover", "bloom", 0),
          ],
          bee: bee(0),
        };
      }
      const first = !figure;
      figure = paintKeeper(look, "stand");
      // The first time, find out at once how fine a paint is on offer, so the
      // figure does not change size after it has been shown.
      if (first) sharpen();
      drawStage();
      if (app.settings.motion) {
        canvas.classList.remove("is-fresh");
        void canvas.offsetWidth;
        canvas.classList.add("is-fresh");
      }
      firstFigure();
      // The quick paint answers the tap; once the taps pause, the fine one follows.
      if (!first && fine > 1.5)
        sharpTimer = setTimeout(() => {
          queue.add("sharp", () => {
            sharpen();
            drawStage();
          });
        }, 280);
    });
  }

  const resized =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => drawStage()) : null;
  resized?.observe(stage);

  // ── the name ──

  const input = /** @type {HTMLInputElement} */ (
    el("input.keeper-name__input", {
      type: "text",
      maxlength: core.TUNING?.NAME_MAX ?? 14,
      value: opts.name ?? "",
      placeholder: opts.placeholder ?? W.defaultName,
      "aria-label": W.nameLabel,
      autocomplete: "off",
      autocapitalize: "words",
      autocorrect: "off",
      spellcheck: "false",
      enterkeyhint: "done",
    })
  );
  const surpriseBtn = el(
    "button.hh-btn.hh-btn--small.hh-btn--secondary.keeper-name__surprise",
    { type: "button", onclick: () => surprise() },
    W.surprise,
  );
  const nameRow = el("div.keeper-name", null, [
    el("label.keeper-name__field", null, [
      el("span.keeper-name__label", { text: W.nameLabel }),
      input,
    ]),
    surpriseBtn,
  ]);
  const name = () => tidyName(input.value);
  const say = () => stage.setAttribute("aria-label", W.preview(name()));
  say();

  // The keyboard. It covers the lower part of the page without resizing it,
  // so the host is told how much is left to see and lays itself out again.
  const vv = window.visualViewport;
  let typing = false;
  const offs = [];
  function keyboard() {
    if (!opts.onKeyboard) return;
    const full = document.documentElement.clientHeight;
    const height = vv?.height ?? full;
    const open = typing && full - height > 90;
    opts.onKeyboard({ open, height, top: vv?.offsetTop ?? 0 });
  }
  offs.push(
    on(input, "focus", () => {
      typing = true;
      // The whole name is selected, so the first key replaces the one on offer.
      try {
        input.select();
      } catch {
        /* nothing to select */
      }
      keyboard();
    }),
    on(input, "blur", () => {
      typing = false;
      input.value = name();
      keyboard();
      // iOS can leave the page nudged up after the keyboard goes.
      window.scrollTo(0, 0);
      opts.onChange?.();
    }),
    on(input, "input", () => {
      say();
      opts.onChange?.();
    }),
    on(input, "keydown", (e) => {
      if (e.key === "Enter") input.blur();
    }),
  );
  if (vv) offs.push(on(vv, "resize", keyboard), on(vv, "scroll", keyboard));

  // ── the tabs ──

  /** @type {Record<string, { button: HTMLElement, pic: HTMLCanvasElement, shows: string }>} */
  const tabEls = {};
  const tabs = el("div.keeper-tabs", { role: "tablist" });
  for (const t of TABS) {
    const pic = /** @type {HTMLCanvasElement} */ (
      el("canvas.hh-icon.keeper-tabs__pic", { "aria-hidden": "true" })
    );
    pic.width = pic.height = Math.round(28 * DPR);
    const button = el(
      "button.hh-tab.keeper-tabs__tab",
      {
        type: "button",
        role: "tab",
        "aria-label": W.tabNames[t.id] ?? W.tabs[t.id],
        dataset: { tab: t.id },
        onclick: () => showTab(t.id),
      },
      [pic, el("span", { text: W.tabs[t.id] })],
    );
    tabEls[t.id] = { button, pic, shows: "" };
    tabs.append(button);
  }

  /** The picture a tab wears now: three follow the look, the rest never change. */
  function tabPicture(id) {
    if (id === "skin") return dab("skin", look.skin);
    if (id === "hairColor") return dab("hairColor", look.hairColor);
    if (id === "clothes") return dab("overalls", look.overalls);
    if (id === "hat") return icon("wardrobe");
    return tabArt(id);
  }
  function drawTabs() {
    for (const t of TABS) {
      const te = tabEls[t.id];
      const s = tabPicture(t.id);
      if (te.shows === s.key) continue;
      const ctx = te.pic.getContext("2d");
      if (!ctx) continue;
      ctx.clearRect(0, 0, te.pic.width, te.pic.height);
      ctx.drawImage(s.canvas, 0, 0, te.pic.width, te.pic.height);
      te.shows = s.key;
    }
  }

  // ── the swatches ──

  /**
   * @typedef {{ piece: Piece, button: HTMLElement, pic: HTMLCanvasElement, lock: HTMLElement | null, shows: string }} Swatch
   * @typedef {{ part: string, block: HTMLElement, value: HTMLElement, row: HTMLElement, items: Map<string, Swatch>, order: string }} Row
   */
  /** @type {Record<string, Row>} */
  const rows = {};
  /** @type {Record<string, HTMLElement>} */
  const panes = {};
  const panel = el("div.keeper-panel");

  /** A part's pieces, in the order shown. Hair: this body's styles first, then the other's. */
  function piecesOf(part) {
    if (part !== "hair") return /** @type {Piece[]} */ (wardrobe[part] ?? []);
    const other = look.body === "man" ? "woman" : "man";
    return /** @type {Piece[]} */ ([
      ...(wardrobe.hair?.[look.body] ?? []),
      ...(wardrobe.hair?.[other] ?? []),
    ]);
  }
  const ownList = (body) => /** @type {Piece[]} */ (wardrobe.hair?.[body] ?? []).map((p) => p.id);

  /** The look a portrait swatch shows: this look with one thing changed. */
  function portraitLook(part, id) {
    /** @type {Look} */
    const l = { ...look, [part]: id };
    if (part === "body") {
      // The two bodies must be told apart at a glance: no hat over the hair,
      // and a style of that body's own (its first, if it would wear the other's).
      const mine = ownList(id);
      const hair = hairFor(id);
      l.hair = mine.includes(hair) ? hair : (mine[0] ?? hair);
      l.beard = id !== "man" ? "none" : look.body === "man" ? look.beard : memory.beard;
      l.hat = "none";
    }
    // A hat would hide what the swatch is there to show.
    if (part === "hair" || part === "beard" || part === "glasses") l.hat = "none";
    return l;
  }

  function buildPane(t) {
    const pane = el("div.keeper-pane", {
      class: t.layout ? `keeper-pane--${t.layout}` : "",
      role: "tabpanel",
      hidden: true,
      dataset: { tab: t.id },
    });
    for (const part of t.parts) {
      const value = el("span.keeper-caption__value");
      const row = el("div.keeper-row", { role: "group", "aria-label": W.parts[part] });
      const block = el("div.keeper-block", { dataset: { part } }, [
        el("p.keeper-caption", null, [el("b", { text: W.parts[part] }), " · ", value]),
        row,
      ]);
      rows[part] = { part, block, value, row, items: new Map(), order: "" };
      pane.append(block);
    }
    panes[t.id] = pane;
    panel.append(pane);
  }

  /** Make the buttons a row lacks and put them in order. Existing buttons are kept. */
  function fillRow(/** @type {Row} */ r) {
    const pieces = piecesOf(r.part);
    const portrait = PORTRAITS.includes(r.part);
    for (const piece of pieces) {
      let sw = r.items.get(piece.id);
      if (!sw) {
        const pic = /** @type {HTMLCanvasElement} */ (el("canvas", { "aria-hidden": "true" }));
        pic.width = Math.round((portrait ? 88 : DAB) * DPR);
        pic.height = Math.round((portrait ? 96 : DAB) * DPR);
        const button = el(
          "button.keeper-swatch",
          {
            type: "button",
            class: portrait ? "keeper-swatch--portrait" : "keeper-swatch--dab",
            dataset: { id: piece.id },
            onclick: () => choose(r.part, piece.id),
          },
          pic,
        );
        sw = { piece, button, pic, lock: null, shows: "" };
        r.items.set(piece.id, sw);
      }
      sw.piece = piece;
    }
    const order = pieces.map((p) => p.id).join(",");
    if (order !== r.order) {
      r.order = order;
      for (const piece of pieces)
        r.row.append(/** @type {Swatch} */ (r.items.get(piece.id)).button);
    }
  }

  /** Selection, resting pieces and the caption of one row. Cheap; no painting. */
  function renderRow(/** @type {Row} */ r) {
    fillRow(r);
    let chosen = "";
    for (const sw of r.items.values()) {
      const on_ = look[r.part] === sw.piece.id;
      const resting = !sw.piece.owned;
      if (on_) chosen = sw.piece.name;
      sw.button.setAttribute("aria-pressed", on_ ? "true" : "false");
      sw.button.classList.toggle("is-resting", resting);
      sw.button.setAttribute(
        "aria-label",
        resting ? W.resting(sw.piece.name, earnText(sw.piece.unlock)) : sw.piece.name,
      );
      if (resting && !sw.lock) {
        const lock = img(icon("lock"), 16);
        lock.className = "hh-icon";
        sw.lock = el("span.keeper-swatch__lock", null, [
          lock,
          el("span", { text: earnShort(sw.piece.unlock) }),
        ]);
        sw.button.append(sw.lock);
      } else if (!resting && sw.lock) {
        sw.lock.remove();
        sw.lock = null;
      }
    }
    if (r.value.textContent !== chosen) r.value.textContent = chosen;
    // A beard is the man's; the woman's Extras tab is glasses alone.
    if (r.part === "beard") r.block.hidden = look.body !== "man";
  }

  /** Queue the swatches of the open tab whose picture is out of date. */
  function paintTab() {
    const t = TABS.find((x) => x.id === tab);
    if (!t) return;
    for (const part of t.parts) {
      const r = rows[part];
      if (!r || r.block.hidden) continue;
      const portrait = PORTRAITS.includes(part);
      for (const sw of r.items.values()) {
        const id = sw.piece.id;
        const wanted = portrait ? Object.values(portraitLook(part, id)).join("|") : id;
        if (sw.shows === wanted) continue;
        queue.add(`sw:${part}:${id}`, () => {
          const ctx = sw.pic.getContext("2d");
          if (!ctx) return;
          // Worked out again here: the look may have moved on since this was asked.
          const l = portrait ? portraitLook(part, id) : null;
          const s = l ? paintKeeper(l, "bust") : dab(part, id);
          const cw = sw.pic.width;
          const ch = sw.pic.height;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cw, ch);
          if (l) {
            // The bust fills the swatch from the bottom up, cropped a little at the sides.
            const k = ch / DPR / BUST_H;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.drawImage(s.canvas, (cw / DPR - BUST_W * k) / 2, 0, BUST_W * k, BUST_H * k);
          } else ctx.drawImage(s.canvas, 0, 0, cw, ch);
          sw.shows = l ? Object.values(l).join("|") : id;
        });
      }
    }
  }

  function showTab(id, scroll = true) {
    tab = id;
    for (const t of TABS) {
      const on_ = t.id === id;
      tabEls[t.id].button.classList.toggle("is-on", on_);
      tabEls[t.id].button.setAttribute("aria-selected", on_ ? "true" : "false");
      panes[t.id].hidden = !on_;
      if (!on_) continue;
      for (const part of t.parts) {
        const r = rows[part];
        renderRow(r);
        if (!scroll) continue;
        // Bring the chosen one into the middle of its row.
        const chosen = r.items.get(look[part]);
        if (chosen)
          r.row.scrollLeft =
            chosen.button.offsetLeft - (r.row.clientWidth - chosen.button.offsetWidth) / 2;
      }
    }
    paintTab();
  }

  // ── choosing ──

  /** The style the other body would wear: the one worn on it last, else the nearest. */
  function hairFor(body) {
    if (body === look.body) return look.hair;
    const mine = ownList(body);
    return (
      memory.hair[body] ??
      (mine.includes(look.hair)
        ? look.hair
        : ((body === "man" ? TO_MAN : TO_WOMAN)[look.hair] ?? mine[0] ?? look.hair))
    );
  }

  function choose(part, id) {
    const r = rows[part];
    const sw = r?.items.get(id);
    if (!sw) return;
    if (!sw.piece.owned) {
      // Not yours yet: say how it is earned. Nothing changes.
      app.toast(W.restingToast(sw.piece.name, earnText(sw.piece.unlock)), { icon: icon("lock") });
      return;
    }
    if (look[part] === id) return renderRow(r);
    if (part === "body") {
      remember();
      look = { ...look, body: id, hair: hairFor(id), beard: id === "man" ? memory.beard : "none" };
    } else look = { ...look, [part]: id };
    remember();
    changed();
  }

  /** The look changed: mark it everywhere at once, paint on the next frame. */
  function changed() {
    for (const r of Object.values(rows)) renderRow(r);
    drawTabs();
    paintTab();
    paintFigure();
    opts.onChange?.();
  }

  const DULL = ["o6t1", "o6t2", "o3t2", "o4t4"];
  function surprise() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const mine = (part) =>
      /** @type {Piece[]} */ (
        part === "hair" ? (wardrobe.hair?.[look.body] ?? []) : (wardrobe[part] ?? [])
      )
        .filter((p) => p.owned)
        .map((p) => p.id);
    // Natural colours come up more often than silver and lilac; a hat about half the time.
    const colours = mine("hairColor").flatMap((id) =>
      id === "h7" || id === "h8" ? [id] : [id, id],
    );
    const hats = mine("hat").flatMap((id) =>
      id === "none" || id === "straw" ? [id, id, id] : [id],
    );
    const beards = mine("beard").filter((id) => id !== "none");
    /** @type {Look} */
    let next = look;
    for (let tries = 0; tries < 12; tries++) {
      next = {
        ...look,
        skin: pick(mine("skin")) ?? look.skin,
        hair: pick(mine("hair")) ?? look.hair,
        hairColor: pick(colours) ?? look.hairColor,
        overalls: pick(mine("overalls")) ?? look.overalls,
        shirt: pick(mine("shirt")) ?? look.shirt,
        hat: pick(hats) ?? look.hat,
        glasses: Math.random() < 0.22 && mine("glasses").includes("round") ? "round" : "none",
        beard: look.body === "man" && beards.length && Math.random() < 0.4 ? pick(beards) : "none",
      };
      const same = Object.keys(next).filter((key) => next[key] === look[key]).length;
      if (!DULL.includes(next.overalls + next.shirt) && same < 7) break;
    }
    look = next;
    remember();
    changed();
    showTab(tab);
  }

  // ── first show ──

  for (const t of TABS) buildPane(t);
  for (const r of Object.values(rows)) renderRow(r);
  drawTabs();
  showTab(tab, false);
  paintFigure();

  return {
    stage,
    nameRow,
    tabs,
    panel,
    input,
    ready,
    /** @returns {Look} */
    look: () => ({ ...look }),
    name,
    /** Start again from another look (a new game, a restored one). */
    set(/** @type {Look} */ next, /** @type {string} */ called) {
      const same = Object.keys(next).every((key) => next[key] === look[key]);
      if (input.value !== called && document.activeElement !== input) input.value = called;
      say();
      wardrobe = core.wardrobeNow(app.state);
      if (same) return this.refresh();
      look = { ...next };
      memory.hair = { woman: null, man: null };
      memory.beard = "none";
      remember();
      changed();
    },
    /** What is owned may have changed: mark the rows again. */
    refresh() {
      if (dead) return;
      wardrobe = core.wardrobeNow(app.state);
      for (const r of Object.values(rows)) renderRow(r);
      paintTab();
    },
    /** Paint this look's portrait into a canvas of the host's, on a later frame. */
    portrait(/** @type {HTMLCanvasElement} */ target) {
      queue.add("portrait", () => {
        const ctx = target.getContext("2d");
        if (!ctx) return;
        const s = paintKeeper(look, "bust");
        target.width = Math.round(BUST_W * DPR);
        target.height = Math.round(BUST_H * DPR);
        ctx.drawImage(s.canvas, 0, 0, target.width, target.height);
      });
    },
    /** Lay the open tab out again (the host has just been given its size). */
    settle() {
      showTab(tab);
      drawStage();
    },
    destroy() {
      dead = true;
      clearTimeout(sharpTimer);
      queue.stop();
      resized?.disconnect();
      for (const off of offs) off();
    },
  };
}
