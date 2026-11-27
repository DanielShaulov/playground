// @ts-check
/**
 * The night card: the day's diary on a page of butter paper, over the
 * meadow at night.
 *
 *   From the hives   what each hive brought home today (winter: they stayed in)
 *   The day          jars taken, coins in and out, hearts won
 *   Tomorrow         the weather, what starts or stops blooming, a warning
 *                    for every hive whose pure honey tomorrow's nectar would
 *                    change (tap: its sheet), hives that want looking at, the
 *                    Show or the Fair, and a new page of the bee book
 *
 * Then one big "Sleep". A season that turns overnight gets its own small
 * moment; after the last night of winter the year page comes first.
 *
 * Everything is read from the core's helpers (`tomorrow`, `forecast`,
 * `verdictOf`, `attentionOf` through `tomorrow`). One thing the state does
 * not hold is how many jars were taken today, so "Sleep" notes the running
 * total in the store ("diary") and the next night subtracts it; when there
 * is no note for today the line is left out rather than guessed.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { dayLabel, number, seasonName } from "../words.js";
import { NIGHT as W } from "../words/night.js";
import { FAIR } from "../words/market.js";
import { pic, iconImg } from "../chrome.js";
import { sprite, put, DPR } from "../paint/sprite.js";
import { wash, ellipse, rect, smooth, resample } from "../paint/wash.js";
import { skyBand, moon, weather as weatherArt } from "../art/sky.js";
import { ground } from "../art/ground.js";
import { hive as hiveArt } from "../art/hives.js";
import { bed } from "../art/flowers.js";
import { tree } from "../art/scenery.js";
import { jar } from "../art/jars.js";
import { item, heart as heartArt } from "../art/goods.js";
import { safe } from "./stall-art.js";

const styled = css(new URL("./night.css", import.meta.url));

/** The backdrop's own units; CSS fits it to the phone's width. */
const BACK_W = 430;
const BACK_H = 480;

/** A canvas `w` × `h` CSS px, cleared, with a context that draws in CSS px. */
function fit(canvas, w, h) {
  canvas.width = Math.ceil(w * DPR);
  canvas.height = Math.ceil(h * DPR);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Numbers that look scattered and are the same on every phone. */
function scatter(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** What a new season looks like: its tree, what is in the beds, the hive. */
const SEASON_PICTURE = {
  spring: {
    tree: "bloom",
    beds: [
      ["dandelion", "bloom"],
      ["clover", "bud"],
      ["dandelion", "bloom"],
    ],
  },
  summer: {
    tree: "leaf",
    beds: [
      ["lavender", "bloom"],
      ["sunflower", "bloom"],
      ["clover", "bloom"],
    ],
  },
  autumn: {
    tree: "fruit",
    beds: [
      ["heather", "bloom"],
      ["sunflower", "faded"],
      ["ivy", "bud"],
    ],
  },
  winter: {
    tree: "dormant",
    beds: [
      ["lavender", "dormant"],
      ["clover", "dormant"],
      ["ivy", "faded"],
    ],
  },
};

/** How tall the sky is painted, and where the hills and the meadow begin under it. */
const SKY_H = 250;
const HILLS_Y = 92;
const HILLS_H = 150;
const LAND_Y = 166;

/** The night sky: deep blue overhead, paler towards the hills, thin clouds and the stars. */
function nightSky(season) {
  const cold = season === "winter";
  return sprite(
    `night-sky-3-${cold ? "cold" : "mild"}`,
    BACK_W,
    SKY_H,
    (ctx, w, h, r) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      const stops = cold
        ? ["#243068", "#41599f", "#8ea6d6", "#cfdcf0"]
        : ["#272c6c", "#4a56a6", "#8b90d1", "#cdbbe2"];
      [0, 0.42, 0.78, 1].forEach((at, i) => g.addColorStop(at, stops[i]));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Thin clouds, wet into wet.
      for (const [cx, cy, rx, ry] of [
        [86, 78, 120, 13],
        [318, 128, 150, 15],
        [190, 34, 96, 9],
      ])
        wash(ctx, ellipse(cx, cy, rx, ry, 18), cold ? "#a3b7e0" : "#9291d4", {
          r,
          layers: 6,
          strength: 0.24,
          soft: 0.6,
          edge: 0,
        });
      // The stars: most of them small, a few with a glint.
      for (let i = 0; i < 96; i++) {
        const x = r.range(0, w);
        const y = r.range(0, h * 0.7);
        const size = r.range(0.4, 1.35);
        ctx.globalAlpha = r.range(0.4, 1) * (1 - y / (h * 0.86));
        ctx.fillStyle = i % 5 ? "#fff6d8" : "#e3eaff";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (size > 1.12) {
          ctx.fillRect(x - size * 2.6, y - 0.25, size * 5.2, 0.5);
          ctx.fillRect(x - 0.25, y - size * 2.6, 0.5, size * 5.2);
        }
      }
      ctx.globalAlpha = 1;
    },
    { ax: 0, ay: 0, grain: 0.8 },
  );
}

/** Two ranges of hills in the moonlight, and the cottage with one window still lit. */
function nightHills(season) {
  const cold = season === "winter";
  return sprite(
    `night-hills-3-${season}`,
    BACK_W,
    HILLS_H,
    (ctx, w, h, r) => {
      const ridge = (y0, amp, phase) => {
        const pts = [[-12, h + 12]];
        for (let x = -12; x <= w + 12; x += 18)
          pts.push([
            x,
            y0 + amp * Math.sin(x / 74 + phase) + amp * 0.4 * Math.sin(x / 29 + phase * 2),
          ]);
        pts.push([w + 12, h + 12]);
        return pts;
      };
      wash(ctx, ridge(44, 13, 0.7), cold ? "#b6c5e8" : "#8590cf", {
        r,
        layers: 9,
        strength: 0.94,
        soft: 0.1,
        edge: 0.2,
      });
      wash(ctx, ridge(76, 11, 2.5), cold ? "#9bafdc" : "#6170b6", {
        r,
        layers: 9,
        strength: 0.96,
        soft: 0.08,
        edge: 0.25,
      });
      // Trees along the nearer ridge, round and dark.
      for (const [x, y, rx] of [
        [168, 66, 9],
        [186, 70, 7],
        [300, 76, 10],
        [392, 70, 8],
        [20, 74, 9],
      ])
        wash(ctx, ellipse(x, y, rx, rx * 1.3, 10), cold ? "#7384bd" : "#46528f", {
          r,
          layers: 6,
          strength: 0.9,
          soft: 0.18,
          edge: 0.2,
        });
      // The cottage.
      const cx = 92;
      const cy = 80;
      const wall = cold ? "#4b5591" : "#3d427e";
      wash(ctx, resample(rect(cx + 8, cy - 40, 5, 12), 4), wall, {
        r,
        layers: 5,
        strength: 0.95,
        soft: 0.05,
      });
      wash(ctx, resample(rect(cx - 17, cy - 21, 34, 23), 6), wall, {
        r,
        layers: 8,
        strength: 0.96,
        soft: 0.05,
        edge: 0.3,
      });
      wash(
        ctx,
        resample(
          [
            [cx - 23, cy - 19],
            [cx, cy - 38],
            [cx + 23, cy - 19],
          ],
          6,
        ),
        cold ? "#d3ddf2" : "#2f3269",
        { r, layers: 8, strength: 0.96, soft: 0.06, edge: 0.3 },
      );
      wash(
        ctx,
        smooth(
          [
            [cx + 9, cy - 42],
            [cx + 15, cy - 52],
            [cx + 11, cy - 62],
            [cx + 20, cy - 72],
            [cx + 25, cy - 62],
            [cx + 19, cy - 52],
            [cx + 14, cy - 42],
          ],
          4,
        ),
        "#b4bde6",
        { r, layers: 4, strength: 0.3, soft: 0.5, edge: 0 },
      );
      // One window still lit, and the light it throws.
      const wx = cx - 5;
      const wy = cy - 10;
      const glow = ctx.createRadialGradient(wx, wy, 0, wx, wy, 34);
      glow.addColorStop(0, "rgba(255, 214, 130, 0.8)");
      glow.addColorStop(0.4, "rgba(255, 200, 120, 0.28)");
      glow.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = glow;
      ctx.fillRect(wx - 36, wy - 36, 72, 72);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffe6a3";
      ctx.fillRect(wx - 4.5, wy - 4.5, 9, 9);
      ctx.fillStyle = wall;
      ctx.fillRect(wx - 0.5, wy - 4.5, 1, 9);
      ctx.fillRect(wx - 4.5, wy - 0.5, 9, 1);
      ctx.fillStyle = "#2f3269";
      ctx.fillRect(cx + 5, cy - 12, 6, 13);
    },
    { ax: 0, ay: 0, grain: 0.8 },
  );
}

/** Where the hives stand in the picture, the far ones first: x, y and size. */
const HIVE_SPOTS = [
  [262, 206, 0.5],
  [330, 210, 0.5],
  [394, 206, 0.5],
  [196, 208, 0.5],
  [228, 242, 0.6],
  [300, 246, 0.6],
  [372, 242, 0.6],
  [156, 248, 0.6],
  [262, 284, 0.68],
  [344, 286, 0.68],
];
/** Flags that will not wait for tomorrow: these lines are marked. */
const URGENT = ["wasps", "queen-cells", "low", "hungry", "mites-bad"];
const TREE_AT_NIGHT = { spring: "bloom", summer: "leaf", autumn: "fruit", winter: "dormant" };

/** @param {HTMLElement} root */
export async function mount(root) {
  await styled;
  /** @type {any} */
  const core = app.core;
  root.classList.add("nt");
  app.ambience("night");

  const local = { busy: false, alive: true, key: "", allHives: false };

  const back = /** @type {HTMLCanvasElement} */ (el("canvas.nt-sky", { "aria-hidden": "true" }));
  const dayChip = el("span.hh-chip");
  const top = el("header.nt-top", null, dayChip);
  const title = el("h1.hh-title", { text: W.title });
  const body = el("div.nt-card__body");
  const card = el(
    "article.hh-card.hh-card--tint.nt-card",
    null,
    el("header.nt-card__head", null, title),
    body,
  );
  const backBtn = el(
    "button.hh-btn.hh-btn--secondary",
    {
      type: "button",
      dataset: { act: "back" },
      onclick: () => (app.state.clock.phase === "evening" ? app.go("meadow") : leave()),
    },
    W.back,
  );
  const sleepBtn = el(
    "button.hh-btn.nt-sleep",
    { type: "button", dataset: { sound: "none", act: "sleep" }, onclick: onSleep },
    iconImg("sleep", 26),
    W.sleep,
  );
  const foot = el("footer.nt-foot", null, backBtn, sleepBtn);
  const turn = el("div.nt-season.hh-page.hh-fade", { hidden: true });
  root.append(back, top, card, foot, turn);

  // ───────────────────────── the meadow at night ─────────────────────────

  /** A few of the beds you planted, as they stand tonight, for the sleeping meadow. */
  function bedsTonight(state) {
    const seen = new Map();
    for (const plot of Object.values(state.land.plots)) {
      if (!plot.owned) continue;
      for (const sq of plot.squares) {
        if (!sq || sq.t !== "bed") continue;
        const n = seen.get(sq.flower)?.n ?? 0;
        if (n < 3)
          seen.set(sq.flower, { n: n + 1, stage: safe(() => core.stageOf(state, sq)) ?? "leaf" });
      }
    }
    const out = [];
    for (const [flower, { n, stage }] of seen)
      for (let i = 0; i < n; i++) out.push([flower, stage]);
    return out.slice(0, 15);
  }

  let backKey = "";
  function paintBackdrop(season, state) {
    const types = state.hives.list.slice(0, HIVE_SPOTS.length).map((h) => h.type);
    const beds = bedsTonight(state);
    const key = `${season}|${types.join(",")}|${beds.join(";")}`;
    if (key === backKey) return;
    backKey = key;
    const cold = season === "winter";

    // The meadow, the tree, the hives and the beds on a sheet of their own,
    // so the moonlight can be laid over just them.
    const land = document.createElement("canvas");
    const lc = fit(land, BACK_W, BACK_H);
    const turf = safe(() => ground("night", season, BACK_W + 40, BACK_H - LAND_Y + 20));
    if (turf) lc.drawImage(turf.canvas, -20, LAND_Y, turf.w, turf.h);
    const rnd = scatter(5);
    /** @type {{ y: number, draw: () => void }[]} */
    const things = [];
    const stand = (make, x, y, k) =>
      things.push({
        y,
        draw: () => {
          const s = safe(make);
          if (s) put(lc, s, x, y, k);
        },
      });
    stand(() => tree(/** @type {any} */ (TREE_AT_NIGHT[season] ?? "leaf"), 0), 58, 292, 0.92);
    types.forEach((type, i) => stand(() => hiveArt(type), ...HIVE_SPOTS[i]));
    beds.forEach(([flower, stage], i) => {
      const row = Math.floor(i / 5);
      const x = 46 + (i % 5) * 86 + (row % 2) * 40 + rnd() * 26;
      const y = 326 + row * 56 + rnd() * 18;
      stand(() => bed(flower, stage, i % 2), Math.min(x, BACK_W - 30), y, 0.72 + row * 0.1);
    });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
    // Moonlight: everything goes blue, then a pool of light where the moon falls.
    const kept = document.createElement("canvas");
    kept.width = land.width;
    kept.height = land.height;
    kept.getContext("2d")?.drawImage(land, 0, 0);
    lc.globalCompositeOperation = "multiply";
    lc.fillStyle = cold ? "#aebdf0" : "#8698e4";
    lc.fillRect(0, 0, BACK_W, BACK_H);
    lc.globalCompositeOperation = "screen";
    const pool = lc.createRadialGradient(300, 262, 10, 300, 262, 300);
    pool.addColorStop(0, "rgba(176, 200, 255, 0.36)");
    pool.addColorStop(1, "rgba(176, 200, 255, 0)");
    lc.fillStyle = pool;
    lc.fillRect(0, 0, BACK_W, BACK_H);
    lc.globalCompositeOperation = "destination-in";
    lc.drawImage(kept, 0, 0, BACK_W, BACK_H);
    lc.globalCompositeOperation = "source-over";

    const ctx = fit(back, BACK_W, BACK_H);
    put(ctx, nightSky(season), 0, 0);
    const mx = 352;
    const my = 56;
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 96);
    halo.addColorStop(0, "rgba(255, 250, 226, 0.5)");
    halo.addColorStop(0.3, "rgba(224, 232, 255, 0.22)");
    halo.addColorStop(1, "rgba(224, 232, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 100, my - 100, 200, 200);
    const m = safe(() => moon());
    if (m) ctx.drawImage(m.canvas, mx - m.w, my - m.h, m.w * 2, m.h * 2);
    put(ctx, nightHills(season), 0, HILLS_Y);
    ctx.drawImage(land, 0, 0, BACK_W, BACK_H);
    // Fireflies over the warm months.
    if (season === "summer" || season === "spring") {
      const fly = scatter(23);
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < (season === "summer" ? 16 : 7); i++) {
        const x = 20 + fly() * (BACK_W - 40);
        const y = 214 + fly() * 230;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
        glow.addColorStop(0, "rgba(255, 240, 150, 0.95)");
        glow.addColorStop(0.3, "rgba(255, 230, 140, 0.4)");
        glow.addColorStop(1, "rgba(255, 230, 140, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 8, y - 8, 16, 16);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // The page under the picture carries on in the colour of the moonlit
    // grass: one pixel of it, read through a canvas made for reading.
    try {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      const pc = probe.getContext("2d", { willReadFrequently: true });
      pc.drawImage(back, Math.floor(6 * DPR), Math.floor((BACK_H - 8) * DPR), 1, 1, 0, 0, 1, 1);
      const d = pc.getImageData(0, 0, 1, 1).data;
      if (d[3] > 200) root.style.backgroundColor = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    } catch {
      /* the fallback colour in night.css will do */
    }
  }

  // ───────────────────────── the diary ─────────────────────────

  const head = (text, note) =>
    el("h2.nt-h", null, el("span", { text }), note ? el("small", { text: note }) : null);

  /** A picture and a line. With `onclick` it is a button that opens something. */
  function line(picture, children, onclick, warning = false) {
    return el(
      onclick ? "button.nt-line" : "div.nt-line",
      onclick ? { type: "button", onclick, class: warning ? "is-warning" : "" } : null,
      picture ?? el("span"),
      el("span", null, children),
    );
  }

  const flowerName = (id) => core.FLOWERS[id]?.name ?? String(id);
  const lower = (s) => String(s).toLowerCase();
  const worth = (units) => number(Math.round((units / core.TUNING.NECTAR_PER_JAR) * 10) / 10);

  function hiveRow(h, n) {
    const from = Object.entries(h.today.by ?? {})
      .filter(([, units]) => units > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => (id === "wild" ? W.wild : lower(flowerName(id))));
    const s = safe(() => hiveArt(h.type));
    const notes = [from.length ? from.join(", ") : W.nothing];
    if (h.today.lost > 0.5) notes.push(W.wasted);
    return el(
      "div.nt-hive",
      null,
      s ? pic(s, 22) : el("span"),
      el("span.nt-hive__name", { text: W.hive(n) }),
      el("span.nt-hive__from", { text: notes.join(" · ") }),
      el("span.nt-hive__amt.hh-num", { text: worth(h.today.got) }),
    );
  }

  function hivesSection(state, winter) {
    const sec = el("section.nt-sec", null, head(W.hivesHead, winter ? null : W.hivesUnit));
    if (winter) {
      sec.append(el("p.hh-sub", { text: W.stayedIn }));
      return sec;
    }
    const rows = state.hives.list
      .map((h, i) => ({ h, n: i + 1 }))
      .sort((a, b) => b.h.today.got - a.h.today.got);
    const many = rows.length > 4;
    const shown = many && !local.allHives ? rows.slice(0, 3) : rows;
    for (const { h, n } of shown) sec.append(hiveRow(h, n));
    const rest = rows.slice(shown.length);
    const sum = (list) => list.reduce((t, r) => t + r.h.today.got, 0);
    // With many hives the best three show, and one row opens the rest.
    if (many)
      sec.append(
        el(
          "button.nt-hive.nt-hive--more",
          {
            type: "button",
            "aria-expanded": String(local.allHives),
            onclick: () => {
              local.allHives = !local.allHives;
              local.key = "";
              draw(app.state);
            },
          },
          iconImg(local.allHives ? "minus" : "plus", 18),
          el("span.nt-hive__name", { text: local.allHives ? W.fewer : W.more(rest.length) }),
          el("span"),
          local.allHives ? el("span") : el("span.nt-hive__amt.hh-num", { text: worth(sum(rest)) }),
        ),
      );
    if (rows.length > 1)
      sec.append(
        el(
          "div.nt-hive.nt-hive--sum",
          null,
          el("span"),
          el("span.nt-hive__name", { text: W.total }),
          el("span"),
          el("span.nt-hive__amt.hh-num", { text: worth(sum(rows)) }),
        ),
      );
    return sec;
  }

  function statsRow(state) {
    const stat = (picture, n, label) =>
      el(
        "div.nt-stat",
        null,
        el("span.nt-stat__n", null, picture, n),
        el("span.nt-stat__label", { text: label }),
      );
    const day = state.progress.today ?? {};
    const taken = day.jars ?? 0;
    const hearts = day.hearts ?? 0;
    const { earned, spent } = state.purse.today;
    const coin = () => pic(item("coin"), 18);
    if (!taken && !earned && !spent && !hearts) return null;
    return el(
      "div.nt-stats",
      null,
      taken ? stat(pic(jar("blend", 0), 22), number(taken), W.jarsTaken(taken)) : null,
      stat(coin(), `+${number(earned)}`, W.coinsIn),
      spent ? stat(coin(), `−${number(spent)}`, W.coinsOut) : null,
      hearts ? stat(pic(heartArt(true), 18), number(hearts), W.hearts(hearts)) : null,
    );
  }

  /** Hives whose pure honey tomorrow's nectar would change (the core says which), and into what. */
  function spoils(state, ids) {
    const out = [];
    for (const id of ids ?? []) {
      const i = state.hives.list.findIndex((h) => h.id === id);
      const h = state.hives.list[i];
      if (!h) continue;
      const then = safe(() => core.forecast(state, id))?.verdict;
      if (!then) continue;
      out.push({ n: i + 1, id, now: core.verdictOf(h.stores), jars: core.jarsIn(h), then });
    }
    return out;
  }

  const honeyName = (flower) => lower(core.HONEYS[flower]?.name ?? flowerName(flower));
  const stars = (n) => "★".repeat(n);

  function tomorrowSection(state, t, spoiling) {
    const today = core.calendarOf(state.clock.day);
    const next = core.calendarOf(state.clock.day + 1);
    const sec = el("section.nt-sec", { dataset: { teach: "tomorrow" } }, head(W.tomorrowHead));
    const words = W.weather[t.weather] ?? [String(t.weather), ""];
    const sun = safe(() => weatherArt(t.weather));
    sec.append(line(sun && pic(sun, 34), [el("b", { text: `${words[0]}. ` }), words[1]]));
    if (next.season !== today.season)
      sec.append(
        line(
          iconImg(next.seasonName, 28),
          next.doy === 0 ? W.newYear : W.newSeason(next.seasonName),
        ),
      );
    const flowerLine = (flowers, stage, say) => {
      if (!flowers.length) return;
      const s = safe(() => bed(flowers[0], stage));
      sec.append(line(s && pic(s, 30), say(flowers.map((f) => lower(flowerName(f))))));
    };
    flowerLine(t.starts, "bloom", W.starts);
    flowerLine(t.lastDay, "bloom", W.lastDay);
    flowerLine(t.ended, "faded", W.ended);
    for (const sp of spoiling.slice(0, 2)) {
      const then = sp.then.stars ? `${honeyName(sp.then.flower)} ${stars(sp.then.stars)}` : W.blend;
      sec.append(
        line(
          pic(jar(sp.now.flower, sp.now.stars), 28),
          W.spoil(sp.n, honeyName(sp.now.flower), sp.now.stars, sp.jars, then),
          () => app.sheet("hive", { hive: sp.id }),
          true,
        ),
      );
    }
    if (spoiling.length > 2) sec.append(line(null, W.spoilMore(spoiling.length - 2)));
    // A swarm nobody caught is gone by morning (the core's nightHives).
    const hanging = (state.hives.swarms ?? []).filter((w) => w.day <= state.clock.day).length;
    if (hanging)
      sec.append(line(iconImg("meadow", 28), W.swarm(hanging), () => app.go("meadow"), true));
    // The hives that want a look, the pressing ones first.
    const wanting = t.hives
      .map((h) => ({ ...h, urgent: h.flags.some((f) => URGENT.includes(f)) }))
      .sort((a, b) => Number(b.urgent) - Number(a.urgent));
    let told = 0;
    for (const h of wanting) {
      const n = state.hives.list.findIndex((x) => x.id === h.id) + 1;
      const text = W.attention(n, h.flags);
      if (!text) continue;
      if (told >= 4) continue;
      told += 1;
      const type = state.hives.list[n - 1]?.type;
      const s = safe(() => hiveArt(type));
      sec.append(line(s && pic(s, 26), text, () => app.sheet("hive", { hive: h.id }), h.urgent));
    }
    if (wanting.length > told && told)
      sec.append(line(null, W.attentionMore(wanting.length - told)));
    if (t.show) sec.append(line(iconImg("stall", 28), W.show));
    if (t.fair) sec.append(line(iconImg("stall", 28), W.fair(FAIR.pays(core.TUNING.FAIR_PAY))));
    return sec;
  }

  function factLine(state) {
    const unread = state.book.unread ?? [];
    if (!unread.length) return null;
    const id = unread[unread.length - 1];
    const fact = core.FACTS.find((f) => f.id === id);
    return el(
      "section.nt-sec",
      null,
      line(
        iconImg("book", 30),
        [
          el("b", { text: W.fact }),
          el("br"),
          fact?.title ?? "",
          unread.length > 1 ? ` (${W.factMore(unread.length - 1)})` : "",
        ],
        () => app.sheet("book", { fact: id }),
      ),
    );
  }

  function draw(state) {
    if (local.busy || !local.alive) return;
    const cal = core.calendarOf(state.clock.day);
    paintBackdrop(cal.seasonName, state);
    const evening = state.clock.phase === "evening";
    const t = evening ? core.tomorrow(state) : null;
    const spoiling = t ? spoils(state, t.spoils) : [];
    const key = JSON.stringify([
      state.clock,
      evening,
      state.hives.list.map((h) => [
        h.id,
        h.type,
        h.today,
        h.strength,
        h.mites,
        h.hungry,
        h.swarmCells,
      ]),
      state.purse.today,
      state.progress.today,
      state.hives.swarms,
      local.allHives,
      state.book.unread,
      state.weather,
      spoiling.map((s) => [s.id, s.jars, s.then.product]),
    ]);
    if (key === local.key) return;
    local.key = key;
    dayChip.replaceChildren(iconImg(cal.seasonName, 22), dayLabel(cal));
    card.classList.toggle("is-small", !evening);
    sleepBtn.hidden = !evening;
    backBtn.textContent = evening ? W.back : W.early.back;
    backBtn.setAttribute("aria-label", evening ? W.backAlt : W.early.back);
    const keep = body.scrollTop;
    if (!evening) {
      title.textContent = W.early.title;
      body.replaceChildren(el("p.hh-text", { text: W.early.text }));
      return;
    }
    title.textContent = W.title;
    body.replaceChildren(
      ...[
        hivesSection(state, cal.season === 3),
        statsRow(state),
        el("div.hh-sprig", { role: "separator" }),
        tomorrowSection(state, t, spoiling),
        factLine(state),
      ].filter(Boolean),
    );
    body.scrollTop = keep;
  }

  // ───────────────────────── sleep ─────────────────────────

  /** Morning: the year page if a year has just ended, else the meadow. */
  function leave() {
    return app.go(core.yearDue(app.state) ? "year" : "meadow");
  }

  function onSleep() {
    if (local.busy) return;
    local.busy = true;
    const events = app.dispatch({ type: "sleep" });
    if (events.some((e) => e.type === "rejected")) {
      local.busy = false;
      return;
    }
    app.sound("sleep");
    root.classList.add("is-asleep");
    const turned = events.find((e) => e.type === "seasonChanged");
    setTimeout(
      () => {
        if (!local.alive) return;
        if (turned)
          showSeason(
            turned.season,
            events.some((e) => e.type === "yearEnded"),
          );
        else leave();
      },
      app.settings.motion ? 380 : 0,
    );
  }

  /** A season has turned overnight: its picture, its name, a line, and on. */
  function showSeason(season, newYear) {
    const look = SEASON_PICTURE[season] ?? SEASON_PICTURE.spring;
    const w = 320;
    const h = 190;
    const canvas = /** @type {HTMLCanvasElement} */ (
      el("canvas.nt-season__pic", { "aria-hidden": "true" })
    );
    const ctx = fit(canvas, w, h);
    const sky = safe(() => skyBand(season, "morning", w, 140));
    if (sky) ctx.drawImage(sky.canvas, 0, 0, sky.w, sky.h);
    const turf = safe(() => ground("turn", season, w, 104));
    if (turf) ctx.drawImage(turf.canvas, 0, h - 100, turf.w, turf.h);
    const stand = (make, x, y, k) => {
      const s = safe(make);
      if (s) put(ctx, s, x, y, k);
    };
    stand(() => tree(look.tree, 0), 58, 158, 0.82);
    stand(
      () => hiveArt(/** @type {any} */ (app.state.hives.list[0]?.type ?? "skep")),
      262,
      150,
      0.84,
    );
    look.beds.forEach(([flower, stage], i) =>
      stand(
        () => bed(flower, stage, i % 2),
        124 + i * 46 + (i === 2 ? 52 : 0),
        170 + (i % 2) * 8,
        0.8,
      ),
    );
    turn.replaceChildren(
      canvas,
      el("div.hh-banner.hh-banner--honey", { text: seasonName(season) }),
      el("p.hh-text", { text: newYear ? W.newYearLine : (W.seasons[season] ?? "") }),
      el(
        "button.hh-btn",
        { type: "button", dataset: { act: "morning" }, onclick: leave },
        W.morning,
      ),
    );
    turn.hidden = false;
    app.sound("season");
    app.ambience("morning");
  }

  draw(app.state);

  return {
    update: (state) => draw(state),
    unmount() {
      local.alive = false;
    },
  };
}
