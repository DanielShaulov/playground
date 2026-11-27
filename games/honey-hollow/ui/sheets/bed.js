// @ts-check
/**
 * The bed sheet: `app.sheet("bed", { plot, x, y })`.
 *
 * The bed's picture at the stage it is in, that stage in words, the bloom
 * strip, its nectar, the hives that reach it (each opens its own sheet), the
 * honey it makes, and in the footer "Dig up" (asks first) and, for the three
 * flowers that give one, "Pick a bunch".
 *
 * Opened on a square with no bed it says so and offers the seed tray.
 * Built once; `update` patches.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { bed as bedArt, PAINTED } from "../art/flowers.js";
import { hive as hiveArt } from "../art/hives.js";
import { jar } from "../art/jars.js";
import { bunch as bunchArt } from "../art/goods.js";
import { icon } from "../art/icons.js";
import { say } from "../words.js";
import { BED as W, BLOOM, HIVE, dayOf } from "../words/meadow-sheets.js";
import { bloomStrip, refreshBloomStrip, bloomRange, bloomStripReady } from "../bloom-strip.js";

const styled = css(new URL("./bed.css", import.meta.url));

const pic = (sprite, width, alt = "") => {
  const p = img(sprite, width, alt);
  p.className = "hh-pic";
  return p;
};
const text = (node, s) => {
  if (node.textContent !== s) node.textContent = s;
};
const show = (node, on) => {
  if (node.hidden === !!on) node.hidden = !on;
};

/**
 * @param {HTMLElement} root
 * @param {{ plot?: string, x?: string | number, y?: string | number }} [params]
 */
export async function mount(root, params) {
  await Promise.all([styled, bloomStripReady]);
  const C = app.core;
  const plot = String(params?.plot ?? app.ui.plot);
  const x = Number(params?.x);
  const y = Number(params?.y);
  const bedAt = (state) => {
    const sq = C.squareAt(state, plot, x, y);
    return sq && sq.t === "bed" ? sq : null;
  };

  let titled = "";
  const setTitle = (t) => {
    if (t === titled) return;
    titled = t;
    app.sheetTitle(t);
  };

  const first = bedAt(app.state);
  if (!first) {
    const free =
      !C.squareAt(app.state, plot, x, y) &&
      C.FLOWER_IDS.some((id) => C.canPlant(app.state, plot, x, y, id) === true);
    root.append(
      el("p.hh-text", { text: W.gone }),
      free &&
        el(
          "button.hh-btn.hh-btn--block.hh-bed__plant",
          { type: "button", onclick: () => app.sheet("seeds", { plot, x, y }) },
          W.plantHere,
        ),
    );
    setTitle(W.goneTitle);
    return { update: () => setTitle(W.goneTitle) };
  }

  const flower = first.flower;
  setTitle(C.FLOWERS[flower].name);
  const info = C.FLOWERS[flower];
  const honey = C.HONEYS[flower];
  root.classList.add("hh-bed");

  // ---------- the bed ----------

  const picture = el("div.hh-bed__pic");
  let pictured = "";
  const stage = el("div.hh-bed__stage");
  const blurb = el("div.hh-sub", { text: first.wild ? `${W.wild} ${info.blurb}` : info.blurb });
  const head = el("div.hh-bed__head", null, [
    picture,
    el("div.hh-bed__about", null, [stage, blurb]),
  ]);

  // ---------- when it blooms, what it gives ----------

  const strip = bloomStrip(app.state, flower);
  const caption = el("p.hh-sub.hh-bed__caption", {
    text: BLOOM.caption(bloomRange(app.state, flower)),
  });
  const together = el("p.hh-sub.hh-bed__together", { hidden: true });
  const nectar = el("p.hh-sub.hh-bed__nectar");
  const bloom = el("section.hh-bed__sec", null, [strip, caption, together, nectar]);

  // ---------- the hives that reach it ----------

  const hiveList = el("div.hh-list.hh-bed__hives");
  const noHive = el("p.hh-sub", { text: W.noHive, hidden: true });
  /** @type {Map<number, { btn: HTMLElement, title: HTMLElement, sub: HTMLElement, pic: HTMLElement, type: string }>} */
  const hiveRows = new Map();
  let hiveKey = "";
  const reach = el("section.hh-bed__sec", null, [
    el("h3.hh-heading.hh-bed__h", { text: W.hives }),
    hiveList,
    noHive,
  ]);

  // ---------- its honey ----------

  const honeyLine = el("div.hh-row__sub");
  const honeySec = el("section.hh-bed__sec", null, [
    el("h3.hh-heading.hh-bed__h", { text: W.honey }),
    el("div.hh-bed__honey", null, [
      el("span.hh-bed__jar", null, pic(jar(flower, 1), 44)),
      el("div.hh-bed__honeywords", null, [
        el("div.hh-row__title", { text: honey.name }),
        honeyLine,
      ]),
    ]),
  ]);

  // ---------- bunches ----------

  const canBunch = !!info.bunch;
  const bunchLine = el("p.hh-sub");
  const bunchSec = el("section.hh-bed__sec.hh-bed__bunch", { hidden: !canBunch }, [
    canBunch && el("span.hh-bed__bunchpic", null, pic(bunchArt(/** @type {any} */ (flower)), 40)),
    bunchLine,
  ]);

  root.append(head, bloom, reach, honeySec, bunchSec);

  // ---------- the footer ----------

  let pickRest = "";
  /** What the hives are due from this bed on their next flight: what digging or picking costs. */
  let due = { units: 0, tomorrow: false };
  const pickBtn = el(
    "button.hh-btn",
    {
      type: "button",
      // The meadow plays the sound of a bunch being picked.
      dataset: { act: "pick", sound: "none" },
      hidden: !canBunch,
      onclick: () => {
        if (pickRest) app.toast(pickRest, { sound: "nope" });
        else app.dispatch({ type: "pickBunch", plot, x, y });
      },
    },
    W.pick,
  );
  const digBtn = el(
    "button.hh-btn.hh-btn--secondary",
    {
      type: "button",
      dataset: { act: "dig" },
      onclick: async () => {
        const yes = await app.confirm({
          ...W.confirmDig(info.name, due.units, due.tomorrow),
          danger: true,
        });
        if (!yes) return;
        const events = app.dispatch({ type: "dig", plot, x, y });
        if (!events.some((e) => e.type === "dug")) return;
        // The meadow plays the sound of the spade.
        app.toast(W.dug, { sound: false });
        app.closeSheet();
      },
    },
    [
      (() => {
        const p = img(icon("dig"), 28);
        p.className = "hh-icon";
        return p;
      })(),
      W.dig,
    ],
  );
  root.after(
    el("div.hh-sheet__foot.hh-bed__foot", { class: canBunch ? "has-pick" : null }, [
      digBtn,
      canBunch && pickBtn,
    ]),
  );

  function draw() {
    const state = app.state;
    const bed = bedAt(state);
    if (!bed || bed.flower !== flower) return; // dug up: the sheet is on its way out
    const known = new Set(C.flowersKnown(state));
    const day = state.clock.day;
    const cal = C.calendarOf(day);
    const win = C.bloomWindow(state, flower);
    const stageNow = C.stageOf(state, bed);

    if (pictured !== stageNow) {
      pictured = stageNow;
      if (PAINTED.includes(flower))
        picture.replaceChildren(pic(bedArt(flower, stageNow), 92, info.name));
    }
    const from = win ? dayOf(C.calendarOf(win.from + 1)) : "";
    const to = win ? dayOf(C.calendarOf(win.to + 1)) : "";
    const wait = win ? C.daysUntil(state, win.from) : 0;
    text(
      stage,
      [
        W.stage[stageNow](stageNow === "bloom" ? to : from, !!win && cal.doy === win.to),
        stageNow === "leaf" || stageNow === "faded" || stageNow === "dormant" ? W.wait(wait) : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    // The flowers that share its days: two in one hive's reach make a blend.
    const withThem = C.bloomsWith(state, flower)
      .filter((b) => known.has(b.flower))
      .sort((a, b) => b.days - a.days)
      .slice(0, 3) // the three it shares most days with: the strip shows the rest
      .map((b) => ({ name: C.FLOWERS[b.flower].name, days: b.days }));
    show(together, withThem.length > 0);
    if (withThem.length) text(together, W.together(withThem));

    refreshBloomStrip(strip, state);
    text(
      nectar,
      bed.picked === day ? `${W.nectar(info.nectar)} ${W.pickedToday}` : W.nectar(info.nectar),
    );

    // The hives whose reach covers this square, and what each is due from it.
    const tomorrow = state.clock.phase === "evening";
    const plans = C.forecastPlot(state, plot);
    const near = state.hives.list
      .filter((h) => h.plot === plot)
      .map((h) => ({ h, w: C.reachOf(plot, h.x, h.y).find((s) => s.x === x && s.y === y)?.w ?? 0 }))
      .filter((r) => r.w > 0);
    const key = near.map((r) => r.h.id).join(",");
    if (key !== hiveKey) {
      hiveKey = key;
      hiveRows.clear();
      hiveList.replaceChildren(
        ...near.map(({ h }) => {
          const title = el("div.hh-row__title");
          const sub = el("div.hh-row__sub");
          const holder = el("span.hh-bed__hivepic");
          const btn = el(
            "button.hh-row",
            { type: "button", onclick: () => app.sheet("hive", { hive: h.id }) },
            [
              holder,
              el("div.hh-row__text", null, [title, sub]),
              el("div.hh-row__end.hh-bed__go", { text: "›" }),
            ],
          );
          hiveRows.set(h.id, { btn, title, sub, pic: holder, type: "" });
          return btn;
        }),
      );
    }
    let dueUnits = 0;
    for (const { h, w } of near) {
      const row = hiveRows.get(h.id);
      if (!row) continue;
      if (row.type !== h.type) {
        row.type = h.type;
        row.pic.replaceChildren(pic(hiveArt(/** @type {any} */ (h.type)), 34));
      }
      const name = HIVE.title(C.hiveNumber(state, h.id), C.HIVES[h.type].name);
      text(row.title, name);
      row.btn.setAttribute("aria-label", W.openHive(name));
      const units = plans[h.id]?.beds?.find((b) => b.x === x && b.y === y)?.units ?? 0;
      dueUnits += units;
      text(
        row.sub,
        [w >= 1 ? W.near : W.far, units > 0.05 ? W.takes(units, tomorrow) : ""]
          .filter(Boolean)
          .join(" · "),
      );
    }
    show(hiveList, near.length > 0);
    show(noHive, near.length === 0);
    due = { units: dueUnits > 0.05 ? dueUnits : 0, tomorrow };

    text(honeyLine, W.honeyLine(honey.colour, honey.traits, C.priceOf(state, `honey:${flower}:1`)));

    if (canBunch) {
      const e = C.step(state, { type: "pickBunch", plot, x, y }).events[0];
      const why = e?.type === "rejected" ? String(e.why) : "";
      pickRest = why ? (W.pickWhy[why] ?? say(why)) : "";
      pickBtn.setAttribute("aria-disabled", pickRest ? "true" : "false");
      const held = state.stock.bunches?.[flower] ?? 0;
      text(
        bunchLine,
        [
          pickRest,
          W.pickSub[flower] ?? W.pickSub.other,
          !pickRest && due.units > 0 && !due.tomorrow ? W.pickCost(due.units) : "",
          held > 0 ? W.held(held) : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }
  draw();

  return {
    update(state, events) {
      for (const e of events ?? []) {
        const ev = /** @type {any} */ (e);
        if (ev.type === "picked" && ev.plot === plot && ev.x === x && ev.y === y) {
          app.toast(W.picked(info.name), {
            icon: bunchArt(/** @type {any} */ (flower)),
            sound: false,
          });
          app.fx("pop", { el: picture });
        }
      }
      if (bedAt(app.state)) setTitle(info.name);
      draw();
    },
  };
}
