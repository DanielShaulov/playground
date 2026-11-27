// @ts-check
/**
 * The Honey Show, on its evening, before the stall opens (scene `stall`).
 *
 * A bench under bunting, with the judge beside it. Below, in the thumb's
 * half, your pure honeys: each one says the ribbon its stars would win and
 * what that ribbon pays, so nothing is a surprise. Tap up to three onto the
 * bench (one of each kind), then "Enter". The judge tastes them one at a
 * time and pins a ribbon under each; a tap anywhere skips to the ribbons.
 * "Not this year" and "On to the stall" hand back to the stall.
 *
 * The rules are the core's (`enterShow`, TUNING.RIBBONS, TUNING.SHOW_ENTRIES).
 * The result is read back from `state.market.show`, so opening the stall
 * again after the judging shows the ribbons, not the bench.
 */

import { app } from "../app.js";
import { el } from "../dom.js";
import { SHOW as W } from "../words/market.js";
import { pic, iconImg } from "../chrome.js";
import { sprite, put, DPR } from "../paint/sprite.js";
import { wash, pencil, resample, rect, roundRect, smooth } from "../paint/wash.js";
import { skyBand } from "../art/sky.js";
import { ground } from "../art/ground.js";
import { keeper } from "../art/people.js";
import { ribbon } from "../art/goods.js";
import { productPic, coinTag, starsPic, safe } from "./stall-art.js";

/** The picture's own units: 2 wide to 1 high. CSS fits it to the phone. */
const PIC_W = 320;
const PIC_H = 160;
const BENCH_W = 250;
const BENCH_H = 74;
const BENCH_X = 12;
const BENCH_Y = PIC_H - BENCH_H - 6;
/** Where the jars stand, and where the judge does. */
const JARS_X = 122;
const JAR_GAP = 60;
const JUDGE_X = 268;
/** The judge: silver hair, a full beard, round glasses and the show's own rosette. */
const JUDGE_LOOK = {
  body: "man",
  skin: "s1",
  hair: "side-part",
  hairColor: "h7",
  overalls: "o4",
  shirt: "t5",
  hat: "rosette",
  beard: "full",
  glasses: "round",
};

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

/** The show bench: a trestle under a cream cloth with a scalloped hem. */
function bench() {
  return sprite(
    "show-bench-1",
    BENCH_W,
    BENCH_H,
    (ctx, w, h, r) => {
      for (const x of [26, 217]) {
        const leg = resample(roundRect(x, 28, 7, 44, 2), 10);
        wash(ctx, leg, "wood", { r, layers: 7, strength: 0.9, soft: 0.06 });
        pencil(ctx, leg, { r, closed: true, alpha: 0.45, width: 0.8, gaps: 0.1 });
      }
      const x0 = 10;
      const x1 = 240;
      const yB = 46;
      wash(ctx, resample(rect(x0, 12, x1 - x0, yB - 12), 10), "cream", {
        r,
        layers: 8,
        strength: 0.95,
        soft: 0.05,
        edge: 0.3,
        charge: { color: "white", n: 2, strength: 0.3 },
      });
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n;
        const b = x0 + ((x1 - x0) * (i + 1)) / n;
        const drop = [
          [a + 0.5, yB - 1],
          [b - 0.5, yB - 1],
          [b - 1, yB + 5],
          [(a + b) / 2, yB + 10],
          [a + 1, yB + 5],
        ];
        wash(ctx, smooth(drop, 4), i % 2 ? "cream" : "butter", {
          r,
          layers: 6,
          strength: 0.92,
          soft: 0.06,
          edge: 0.4,
        });
        pencil(ctx, smooth(drop.slice(1), 4, false), { r, alpha: 0.35, width: 0.7, gaps: 0.12 });
      }
      wash(ctx, resample(rect(x0, 37, x1 - x0, 4), 10), "honey", {
        r,
        layers: 5,
        strength: 0.7,
        soft: 0.1,
      });
      wash(ctx, resample(rect(x0, 14, x1 - x0, 6), 10), "shadow", {
        r,
        layers: 4,
        strength: 0.2,
        soft: 0.5,
        edge: 0,
        glaze: true,
      });
      const top = resample(roundRect(4, 6, 242, 9, 3), 10);
      wash(ctx, top, "linen", { r, layers: 7, strength: 0.95, soft: 0.05 });
      pencil(ctx, top, { r, closed: true, alpha: 0.5, width: 0.9, gaps: 0.1 });
    },
    { ax: 0, ay: 0 },
  );
}

/** A string of little flags across the top of the picture. */
function bunting() {
  const sag = (x) => 5 + 13 * Math.sin((Math.PI * x) / PIC_W);
  return sprite(
    "show-bunting-1",
    PIC_W,
    44,
    (ctx, w, h, r) => {
      const line = [];
      for (let x = 0; x <= PIC_W; x += 16) line.push([x, sag(x)]);
      pencil(ctx, smooth(line, 3, false), { r, alpha: 0.5, width: 0.8, gaps: 0.05 });
      const colours = ["poppy", "butter", "mint", "blush", "sky"];
      for (let i = 0, x = 20; x < PIC_W - 10; x += 28, i++) {
        const y = sag(x) + 0.5;
        const flag = [
          [x - 9, y - 0.5],
          [x + 9, y + 0.5],
          [x + 0.5, y + 17],
        ];
        wash(ctx, resample(flag, 6), colours[i % colours.length], {
          r,
          layers: 6,
          strength: 0.85,
          soft: 0.06,
          edge: 0.4,
        });
        pencil(ctx, resample(flag, 6), { r, closed: true, alpha: 0.35, width: 0.7, gaps: 0.15 });
      }
    },
    { ax: 0, ay: 0 },
  );
}

/**
 * Paint the show: sky, grass, bunting, the judge, the bench and what is on it.
 * @param {HTMLCanvasElement} canvas
 * @param {{ season: string, mood: string, jars: { info: any, medal?: string | null }[], h?: number }} o
 *        `h`: the picture's height in its own units (160 and up). A taller
 *        picture has more sky, a second string of flags, a bigger bench and
 *        jars, and the judge at a good size behind them.
 */
function paintShow(canvas, o) {
  const H = Math.max(PIC_H, Math.round(o.h ?? PIC_H));
  const grow = Math.min(1.3, (H - PIC_H) / 150);
  const kb = 1 + Math.min(grow, 1.25) * 0.16;
  const benchX = BENCH_X - Math.min(grow, 1) * 8;
  const benchY = H - 6 - BENCH_H * kb;
  const w = Math.ceil(PIC_W * DPR);
  const h = Math.ceil(H * DPR);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, PIC_W, H);
  const season = /** @type {any} */ (o.season);
  // One tall sky serves every taller picture: its foot stays on the horizon.
  const skyH = H > PIC_H ? 400 : 120;
  const sky = safe(() => skyBand(season, "evening", PIC_W, skyH));
  if (sky) ctx.drawImage(sky.canvas, 0, H - 40 - skyH, sky.w, sky.h);
  const turf = safe(() => ground("stall", season, PIC_W, 80));
  if (turf) ctx.drawImage(turf.canvas, 0, H - 76, turf.w, turf.h);
  put(ctx, bunting(), 0, 0);
  if (grow > 0.35) put(ctx, bunting(), PIC_W + 14, 24 + grow * 10, 1, { flip: true, alpha: 0.9 });
  const judge = safe(() =>
    keeper(/** @type {any} */ (JUDGE_LOOK), "bust", /** @type {any} */ (o.mood)),
  );
  if (judge) put(ctx, judge, JUDGE_X - grow * 28, benchY + 44 * kb, 0.8 + grow * 0.62);
  put(ctx, bench(), benchX, benchY, kb);
  o.jars.forEach((j, i) => {
    const at = JARS_X - grow * 26 - BENCH_X + (i - (o.jars.length - 1) / 2) * JAR_GAP * 0.95;
    const x = benchX + at * kb;
    put(ctx, productPic(j.info), x, benchY + 13 * kb, 0.85 + grow * 0.3);
    const won = j.medal ? safe(() => ribbon(/** @type {any} */ (j.medal))) : null;
    if (won) put(ctx, won, x, benchY + 32 * kb, 0.56 * kb);
  });
}

/**
 * @param {HTMLElement} host the stall's page under its top bar
 * @param {{ done: () => void }} o `done` hands back to the stall
 */
export function mountShow(host, o) {
  /** @type {any} */
  const core = app.core;
  const MAX = core.TUNING.SHOW_ENTRIES ?? 3;
  const prizeFor = (stars) => core.TUNING.RIBBONS[stars - 1] ?? core.TUNING.RIBBONS[0];

  /** @type {string[]} the products on the bench, in the order they were put there */
  const picks = [];
  /** @type {"bench" | "none" | "judging" | "results"} */
  let phase = "bench";
  /** How many ribbons the judge has pinned so far. */
  let pinned = 0;
  let mood = "calm";
  let full = false;
  /** @type {string | null} what the last tap did, when it needs saying */
  let said = null;
  let judgingSince = 0;
  let alive = true;
  /** @type {Set<any>} */
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  };
  const stopTimers = () => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };

  // ───────────────────────── the page ─────────────────────────

  const canvas = /** @type {HTMLCanvasElement} */ (el("canvas.sh-pic", { "aria-hidden": "true" }));
  const stage = el("div.sh-stage", null, canvas);
  const sayLine = el("p.sh-say__line");
  const bubble = el(
    "div.hh-bubble.hh-bubble--up.hh-bubble--right.sh-say",
    { "aria-live": "polite", hidden: true },
    el("div.st-say__who", null, el("b", { text: W.judge })),
    sayLine,
  );
  const intro = el("p.hh-sub.sh-intro");
  const talk = el("div.sh-talk", null, intro, bubble);
  const tiles = el("div.sh-list");
  const resultsHead = el("h2.sh-h", { text: W.results, hidden: true });
  const results = el("ul.hh-list.sh-results", { hidden: true });
  const main = el("div.sh-main", null, tiles, resultsHead, results);
  const line = el("p.st-offer__line.sh-line", { "aria-live": "polite" });
  const skipBtn = el("button.hh-btn.hh-btn--secondary", {
    type: "button",
    text: W.skip,
    dataset: { act: "skip" },
    onclick: onSkip,
  });
  const enterBtn = /** @type {HTMLButtonElement} */ (
    el("button.hh-btn.sh-enter", { type: "button", dataset: { act: "enter" }, onclick: enter })
  );
  const onBtn = el("button.hh-btn.sh-on", {
    type: "button",
    text: W.on,
    hidden: true,
    dataset: { act: "on" },
    onclick: () => o.done(),
  });
  const foot = el(
    "div.st-offer.sh-foot",
    null,
    line,
    el("div.st-offer__btns", null, skipBtn, enterBtn, onBtn),
  );
  const root = el(
    "section.sh",
    { onclick: onTap },
    el("h1.hh-banner.hh-banner--honey.sh-title", { text: W.title }),
    stage,
    talk,
    main,
    foot,
  );
  host.append(root);

  // ───────────────────────── the picture ─────────────────────────

  /** On a tall phone the picture takes the height the list leaves (stall.css); null on a short one. */
  const tallPhone = window.matchMedia("(min-height: 641px)");
  function picSize() {
    if (!tallPhone.matches) return null;
    const wide = Math.min(stage.clientWidth || window.innerWidth, 620);
    const units = Math.max(
      PIC_H,
      Math.min(432, Math.floor((320 * stage.clientHeight) / wide / 8) * 8),
    );
    return { w: Math.round(wide), h: Math.round((wide * units) / 320), units };
  }
  const watch =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => alive && paint(app.state))
      : null;
  watch?.observe(stage);

  let paintKey = "";
  function paint(state) {
    const season = core.calendarOf(state.clock.day).seasonName;
    const entries = state.market.show?.entries ?? [];
    const jars =
      phase === "bench" || phase === "none"
        ? picks.map((p) => ({ info: core.productInfo(p), medal: null }))
        : entries.map((e, i) => ({
            info: core.productInfo(e.product),
            medal: i < pinned ? e.medal : null,
          }));
    const size = picSize();
    const key = `${season}|${mood}|${size?.w}|${size?.units}|${jars.map((j) => `${j.info?.id}:${j.medal}`).join(",")}`;
    if (key === paintKey) return;
    paintKey = key;
    if (size) {
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }
    paintShow(canvas, { season, mood, jars: jars.filter((j) => j.info), h: size?.units });
  }

  // ───────────────────────── the bench ─────────────────────────

  /** Pure honeys on the shelf: the best of each kind first, lesser jars of the same kind after. */
  function pures(state) {
    const all = core
      .shelf(state)
      .filter((it) => it.info.pure && it.n > 0)
      .sort(
        (a, b) =>
          b.info.stars - a.info.stars || String(a.info.name).localeCompare(String(b.info.name)),
      );
    const kinds = new Set();
    const first = [];
    const rest = [];
    for (const it of all) {
      if (kinds.has(it.info.flower)) rest.push(it);
      else {
        kinds.add(it.info.flower);
        first.push(it);
      }
    }
    return [...first, ...rest];
  }

  /** @type {Map<string, HTMLElement>} */
  const tileOf = new Map();
  let tilesKey = "";
  function drawTiles(list) {
    const key = list.map((it) => it.product).join("|");
    if (key !== tilesKey) {
      tilesKey = key;
      tileOf.clear();
      tiles.replaceChildren(
        ...list.map((it) => {
          const info = it.info;
          const prize = prizeFor(info.stars);
          const node = el(
            "button.sh-jar",
            {
              type: "button",
              "aria-pressed": "false",
              dataset: { product: it.product, sound: "none" },
              onclick: () => toggle(it.product),
            },
            el(
              "span.sh-jar__pic",
              null,
              pic(productPic(info), 40),
              el("span.sh-jar__tick", null, iconImg("check", 16)),
            ),
            el(
              "span.sh-jar__text",
              null,
              el("span.sh-jar__name", null, info.name, starsPic(info.stars)),
              el("span.sh-jar__sub", { text: W.wouldWin(prize.medal) }),
              el("span.sh-jar__sub", { text: W.prize(prize.coins, prize.renown) }),
            ),
            safe(() => pic(ribbon(prize.medal), 36)),
          );
          tileOf.set(it.product, node);
          return node;
        }),
      );
    }
    for (const [product, node] of tileOf)
      node.setAttribute("aria-pressed", String(picks.includes(product)));
  }

  function toggle(product) {
    if (phase !== "bench") return;
    const at = picks.indexOf(product);
    full = false;
    said = null;
    if (at >= 0) {
      picks.splice(at, 1);
      app.sound("pick");
    } else {
      const kind = core.productInfo(product)?.flower;
      const same = picks.findIndex((p) => core.productInfo(p)?.flower === kind);
      if (same >= 0) {
        picks.splice(same, 1, product);
        said = W.swapped(lower(core.productInfo(product)?.name ?? ""));
      } else if (picks.length >= MAX) {
        full = true;
        app.sound("nope");
        draw(app.state);
        return;
      } else picks.push(product);
      app.sound("place");
    }
    draw(app.state);
  }

  /** Leaving with jars that could win: asked once. */
  async function onSkip() {
    if (phase !== "bench") return;
    if (await app.confirm(W.confirmSkip)) o.done();
  }

  function enter() {
    if (phase !== "bench" || !picks.length) return;
    app.dispatch({ type: "enterShow", honeys: [...picks] });
    if (!app.state.market.show?.entered) return;
    phase = "judging";
    pinned = 0;
    judgingSince = performance.now();
    draw(app.state);
    if (!app.settings.motion) return finish(true);
    taste();
  }

  // ───────────────────────── the judging ─────────────────────────

  const honeyOf = (entry) => lower(core.productInfo(entry.product)?.name ?? "");

  function say(text) {
    sayLine.textContent = text;
    bubble.hidden = false;
    intro.hidden = true;
  }

  /** The judge lifts the next jar, thinks, and pins its ribbon. */
  function taste() {
    const entries = app.state.market.show?.entries ?? [];
    if (pinned >= entries.length) return later(() => finish(true), 700);
    const entry = entries[pinned];
    mood = "calm";
    say(W.tasting[pinned % W.tasting.length]);
    paint(app.state);
    later(() => {
      pinned += 1;
      mood = "happy";
      say((W.verdict[entry.medal] ?? W.verdict.bronze)(honeyOf(entry)));
      app.sound("ribbon");
      draw(app.state);
      later(taste, 1500);
    }, 1100);
  }

  /** A tap anywhere while the judges taste goes straight to the ribbons. */
  function onTap() {
    if (phase === "judging" && performance.now() - judgingSince > 350) finish(true);
  }

  function finish(fresh = false) {
    stopTimers();
    const show = app.state.market.show;
    const entries = show?.entries ?? [];
    pinned = entries.length;
    phase = "results";
    mood = "happy";
    const last = entries[entries.length - 1];
    if (fresh && last) say((W.verdict[last.medal] ?? W.verdict.bronze)(honeyOf(last)));
    draw(app.state);
    if (fresh) {
      const total = entries.reduce((sum, e) => sum + e.coins, 0);
      app.sound("coins");
      app.fx("coins", { from: stage, n: Math.min(9, 2 + Math.ceil(total / 20)) });
    }
  }

  let resultsKey = "";
  function drawResults(entries) {
    const key = entries
      .slice(0, pinned)
      .map((e) => e.product)
      .join("|");
    if (key === resultsKey) return;
    resultsKey = key;
    results.replaceChildren(
      ...entries.slice(0, pinned).map((e) => {
        const info = core.productInfo(e.product);
        return el(
          "li.hh-row.sh-row",
          null,
          safe(() => pic(ribbon(e.medal), 38, W.ribbonAlt(e.medal))),
          el(
            "div.hh-row__text",
            null,
            el("div.hh-row__title", { text: W.wouldWin(e.medal) }),
            el("div.hh-row__sub.sh-row__sub", null, info?.name ?? "", starsPic(e.stars)),
          ),
          el("div.hh-row__end", null, coinTag(e.coins)),
        );
      }),
    );
  }

  // ───────────────────────── what is on screen ─────────────────────────

  function draw(state) {
    const show = state.market.show;
    if (show?.entered && (phase === "bench" || phase === "none")) {
      phase = "results";
      pinned = show.entries.length;
      mood = "happy";
    }
    const judged = phase === "judging" || phase === "results";
    if (!judged) {
      const list = pures(state);
      for (let i = picks.length - 1; i >= 0; i--)
        if (!list.some((it) => it.product === picks[i])) picks.splice(i, 1);
      phase = list.length ? "bench" : "none";
      drawTiles(list);
      intro.textContent = list.length ? W.intro(MAX) : W.none;
      intro.hidden = false;
      bubble.hidden = true;
      let coins = 0;
      let renown = 0;
      for (const p of picks) {
        const prize = prizeFor(core.productInfo(p).stars);
        coins += prize.coins;
        renown += prize.renown;
      }
      line.textContent = !list.length
        ? ""
        : full
          ? W.full(MAX)
          : picks.length
            ? `${W.bench(picks.length)} ${W.total(coins, renown)}`
            : W.benchEmpty;
      if (list.length && !full && said) line.textContent = said;
      line.hidden = !list.length;
      enterBtn.textContent = W.enter(picks.length);
      enterBtn.disabled = !picks.length;
    } else {
      const entries = show?.entries ?? [];
      drawResults(entries);
      if (phase === "results") {
        let coins = 0;
        let renown = 0;
        for (const e of entries) {
          coins += e.coins;
          renown += e.renown;
        }
        line.textContent = W.total(coins, renown);
        if (bubble.hidden) intro.hidden = true;
      } else line.textContent = `${W.judging} ${W.tapToSkip}.`;
      line.hidden = false;
    }
    tiles.hidden = phase !== "bench";
    resultsHead.hidden = !judged || !pinned;
    results.hidden = !judged;
    skipBtn.hidden = phase !== "bench";
    enterBtn.hidden = phase !== "bench";
    onBtn.hidden = phase !== "none" && phase !== "results";
    root.dataset.phase = phase;
    paint(state);
  }

  draw(app.state);

  return {
    update(state) {
      if (alive) draw(state);
    },
    unmount() {
      alive = false;
      watch?.disconnect();
      stopTimers();
      root.remove();
    },
  };
}
