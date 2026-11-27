// @ts-check
/**
 * The hive sheet: `app.sheet("hive", { hive: id })`.
 *
 * Top to bottom: the hive's picture and its strength as a row of bees; a
 * slip of notes when something wants attention; the stores meter (one bar,
 * a segment for each source in its honey's colour, the hive's capacity as
 * its length, the winter need as a tick from autumn); what a jar taken now
 * would be; what the next flight brings, by flower; the care rows. The
 * footer stays put: how many jars to take, what that leaves the bees, and
 * the one button.
 *
 * Everything is read through the core's helpers. Whether a care action
 * would be accepted is `core.careOf`'s answer, so a resting row always
 * gives the core's own reason.
 *
 * A colony that has outgrown its hive gets a card of its own under the
 * picture: what is happening, and the ways out (upgrade, split) one tap
 * away. The meadow plays the sounds of what happens to a hive (jars taken,
 * an upgrade), so the buttons and toasts here stay quiet for those.
 *
 * Move and Split hand over to the meadow: they set
 * `app.ui.mode = { type: "place", what, hive }` and close the sheet.
 *
 * The DOM is built once. `update` patches words, widths and attributes, so
 * a button is never rebuilt under a thumb.
 */

import { app } from "../app.js";
import { el, css } from "../dom.js";
import { img } from "../paint/sprite.js";
import { hive as hiveArt } from "../art/hives.js";
import { jar, HONEY_COLOR } from "../art/jars.js";
import { bee } from "../art/bee.js";
import { wasp } from "../art/creatures.js";
import { bed as bedArt, PAINTED } from "../art/flowers.js";
import { icon } from "../art/icons.js";
import { item } from "../art/goods.js";
import { say, capital, number } from "../words.js";
import { HIVE as W, SOURCE, SOURCE_SHORT, verdictShort } from "../words/meadow-sheets.js";

const styled = css(new URL("./hive.css", import.meta.url));

/** Syrup is not honey: a plain grey in the meter. */
const SYRUP_COLOR = "#cdc8be";

const pic = (sprite, width, alt = "") => {
  const p = img(sprite, width, alt);
  p.className = "hh-pic";
  return p;
};
const ico = (name, size = 28) => {
  const p = img(icon(name), size);
  p.className = "hh-icon";
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
 * @param {{ hive?: string | number }} [params]
 */
export async function mount(root, params) {
  await styled;
  const C = app.core;
  const id = Number(params?.hive);
  const NECTAR = C.TUNING.NECTAR_PER_JAR;
  /** Every source a hive can hold, in the order the year brings them. */
  const SOURCES = [...C.FLOWER_IDS, "wild", "syrup"];
  const nameOf = (k) => C.FLOWERS[k]?.name ?? capital(SOURCE[k] ?? k);
  const colourOf = (k) => (k === "syrup" ? SYRUP_COLOR : (HONEY_COLOR[k] ?? HONEY_COLOR.blend));

  let titled = "";
  const setTitle = (t) => {
    if (t === titled) return;
    titled = t;
    app.sheetTitle(t);
  };

  if (!C.hiveById(app.state, id)) {
    root.append(el("p.hh-text", { text: W.gone }));
    setTitle(W.goneTitle);
    return { update: () => setTitle(W.goneTitle) };
  }
  root.classList.add("hh-hive");
  const retitle = () => {
    const h = C.hiveById(app.state, id);
    if (h) setTitle(W.title(C.hiveNumber(app.state, id), C.HIVES[h.type].name));
  };
  retitle();

  // ---------- the hive and its bees ----------

  const picture = el("div.hh-hive__pic");
  let pictured = "";
  const bees = el("div.hh-hive__bees", { role: "img" });
  const strength = el("div.hh-hive__strength");
  const place = el("div.hh-sub");
  const head = el("div.hh-hive__head", null, [
    picture,
    el("div.hh-hive__about", null, [bees, strength, place]),
  ]);

  // ---------- a colony that has outgrown its hive ----------

  const swarmTitle = el("h3.hh-heading.hh-hive__h");
  const swarmText = el("p");
  const upLabel = el("span");
  const swarmUp = el(
    "button.hh-btn.hh-btn--small",
    { type: "button", dataset: { act: "swarm-upgrade" }, onclick: () => way("upgrade") },
    [ico("upgrade", 22), upLabel],
  );
  const splitLabel = el("span");
  const swarmSplit = el(
    "button.hh-btn.hh-btn--small",
    { type: "button", dataset: { act: "swarm-split" }, onclick: () => way("split") },
    [ico("split", 22), splitLabel],
  );
  const swarmMore = el("p.hh-sub", { hidden: true });
  const swarm = el("section.hh-note.hh-hive__swarm", { hidden: true }, [
    swarmTitle,
    swarmText,
    el("div.hh-hive__ways", null, [swarmUp, swarmSplit]),
    swarmMore,
  ]);
  /** The split needs a spare hive first: its button leads to the hive shop. */
  let wantsSpare = false;

  // ---------- notes ----------

  const notes = el("ul.hh-note.hh-hive__notes", { hidden: true });
  let noted = "";

  // ---------- stores ----------

  const storesCount = el("span.hh-sub.hh-num");
  const fill = el("div.hh-stores__fill");
  const meter = el("div.hh-meter.hh-stores", { role: "img", style: "--hh-value: 0" }, fill);
  const legend = el("div.hh-stores__legend");
  const emptyLine = el("span", { text: W.empty, hidden: true });
  legend.append(emptyLine);
  /** @type {Record<string, { seg: HTMLElement, key: HTMLElement, label: HTMLElement }>} */
  const parts = {};
  for (const k of SOURCES) {
    const seg = el("span.hh-stores__seg", { style: { backgroundColor: colourOf(k) } });
    const label = el("span");
    const key = el("span.hh-stores__key", { hidden: true }, [
      el("i.hh-stores__dot", { style: { backgroundColor: colourOf(k) } }),
      label,
    ]);
    fill.append(seg);
    legend.append(key);
    parts[k] = { seg, key, label };
  }
  const winterLine = el("p.hh-sub.hh-hive__winter", { hidden: true });

  // ---------- what it would bottle as ----------

  const jarBox = el("div.hh-hive__jar");
  let jarred = "";
  const verdict = el("div.hh-hive__verdict-text");
  const hint = el("div.hh-sub.hh-hive__hint", { hidden: true });

  const stores = el("section.hh-hive__sec", null, [
    el("div.hh-hive__sechead", null, [
      el("h3.hh-heading.hh-hive__h", { text: W.stores }),
      storesCount,
    ]),
    meter,
    legend,
    winterLine,
    el("div.hh-hive__verdict", null, [
      jarBox,
      el("div.hh-hive__verdict-words", null, [el("div.hh-sub", { text: W.bottle }), verdict, hint]),
    ]),
  ]);

  // ---------- the next flight ----------

  const flyHead = el("h3.hh-heading.hh-hive__h");
  const flyLine = el("p.hh-sub");
  const flyChips = el("div.hh-hive__chips");
  let chipped = "";
  const flyAfter = el("p.hh-sub", { hidden: true });
  const flying = el("section.hh-hive__sec", null, [flyHead, flyLine, flyChips, flyAfter]);

  // ---------- care ----------

  const CARE = ["wasps", "feed", "dust", "remedy", "upgrade", "move", "split"];
  const carePic = {
    wasps: () => pic(wasp(0), 30),
    feed: () => ico("feed"),
    dust: () => ico("dust"),
    remedy: () => pic(item("remedy"), 30),
    upgrade: () => ico("upgrade"),
    split: () => ico("split"),
    move: () => ico("move"),
  };
  /** @type {Record<string, { btn: HTMLElement, title: HTMLElement, sub: HTMLElement, end: HTMLElement, rest: string }>} */
  const rows = {};
  const careList = el("div.hh-list.hh-hive__care");
  for (const kind of CARE) {
    const title = el("div.hh-row__title");
    const sub = el("div.hh-row__sub");
    const end = el("span");
    const btn = el(
      "button.hh-row.hh-hive__carebtn",
      {
        type: "button",
        dataset: { care: kind, act: `care-${kind}`, sound: kind === "wasps" ? "fend" : "tap" },
        hidden: true,
        onclick: () => act(kind),
      },
      [
        el("span.hh-hive__careico", null, carePic[kind]()),
        el("div.hh-row__text", null, [title, sub]),
        el("div.hh-row__end", null, [kind === "upgrade" && pic(item("coin"), 18), end]),
      ],
    );
    rows[kind] = { btn, title, sub, end, rest: "" };
    careList.append(btn);
  }
  const care = el("section.hh-hive__sec", null, [
    el("h3.hh-heading.hh-hive__h", { text: W.care }),
    careList,
  ]);

  root.append(head, swarm, stores, notes, care, flying);

  // ---------- the footer: take jars ----------

  let take = 0;
  /** What the footer needs between full draws (the stepper redraws only itself). */
  let seen = { total: 0, whole: 0, need: 0, meal: 0, late: false, coming: 0, cant: "" };
  let takeRest = "";

  const leaves = el("p.hh-sub.hh-hive__leaves");
  const minus = el(
    "button.hh-iconbtn",
    { type: "button", "aria-label": W.take.fewer, dataset: { act: "take-fewer" } },
    ico("minus"),
  );
  const value = el("span.hh-stepper__value", { "aria-live": "polite" });
  const plus = el(
    "button.hh-iconbtn",
    { type: "button", "aria-label": W.take.more, dataset: { act: "take-more" } },
    ico("plus"),
  );
  const takeLabel = el("span");
  const takeBtn = el(
    "button.hh-btn.hh-hive__take",
    {
      type: "button",
      // The meadow plays the sound of jars being taken.
      dataset: { act: "take", sound: "none" },
      onclick: () => {
        if (takeRest) app.toast(takeRest, { sound: "nope" });
        else app.dispatch({ type: "harvest", hive: id, jars: take });
      },
    },
    [ico("harvest"), takeLabel],
  );
  const foot = el("div.hh-sheet__foot.hh-hive__foot", null, [
    leaves,
    el("div.hh-hive__takerow", null, [el("div.hh-stepper", null, [minus, value, plus]), takeBtn]),
  ]);
  root.after(foot);

  function drawTake() {
    const { total, whole, need, meal, late, coming, cant } = seen;
    take = Math.max(0, Math.min(take, whole));
    text(value, String(take));
    /** @type {HTMLButtonElement} */ (minus).disabled = take <= 0;
    /** @type {HTMLButtonElement} */ (plus).disabled = take >= whole;
    text(takeLabel, W.take.button(take));
    takeRest = whole <= 0 ? W.take.none(total) : cant ? say(cant) : take > 0 ? "" : W.take.choose;
    takeBtn.setAttribute("aria-disabled", takeRest ? "true" : "false");

    const left = Math.max(0, total - take * NECTAR);
    let line;
    let short = false;
    if (whole <= 0) line = W.take.none(total);
    else if (late) {
      line = W.take.leavesWinter(left, need);
      short = take > 0 && left + 1e-6 < need;
    } else {
      line = W.take.leavesTonight(left, meal, coming);
      short = take > 0 && left + coming + 1e-6 < meal;
    }
    text(leaves, line);
    leaves.classList.toggle("hh-bad", short);
  }

  // A press steps once; a held press keeps stepping.
  /** @type {(() => void)[]} */
  const stops = [];
  const step = (delta) => {
    const next = Math.max(0, Math.min(take + delta, seen.whole));
    if (next === take) return false;
    take = next;
    drawTake();
    return true;
  };
  for (const [btn, delta] of /** @type {[HTMLElement, number][]} */ ([
    [minus, -1],
    [plus, 1],
  ])) {
    /** @type {any} */
    let wait = 0;
    /** @type {any} */
    let loop = 0;
    let repeated = false;
    const stop = () => {
      clearTimeout(wait);
      clearInterval(loop);
      wait = loop = 0;
    };
    btn.addEventListener("pointerdown", () => {
      stop();
      repeated = false;
      wait = setTimeout(() => {
        loop = setInterval(() => {
          repeated = true;
          if (!step(delta)) stop();
        }, 110);
      }, 380);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"])
      btn.addEventListener(type, stop);
    btn.addEventListener("click", () => {
      if (repeated) repeated = false;
      else step(delta);
    });
    stops.push(stop);
  }

  // ---------- care: what a tap does ----------

  /** A way out on the swarm card: the same action as its care row, one tap away. */
  function way(kind) {
    if (kind === "split" && wantsSpare) app.sheet("hives");
    else act(kind);
  }

  function act(kind) {
    const row = rows[kind];
    if (row.rest) {
      app.toast(row.rest, { sound: "nope" });
      return;
    }
    const h = C.hiveById(app.state, id);
    if (!h) return;
    switch (kind) {
      case "wasps":
        app.dispatch({ type: "fendWasps", hive: id });
        break;
      case "feed":
        app.dispatch({ type: "feed", hive: id });
        break;
      case "dust":
        app.dispatch({ type: "dust", hive: id });
        break;
      case "remedy":
        app.dispatch({ type: "remedy", hive: id });
        break;
      case "upgrade": {
        const up = C.upgradeOf(h);
        if (!up) return;
        app
          .confirm(W.upgrade.confirm(up.name, up.cost, app.state.purse.coins - up.cost))
          .then((yes) => yes && app.dispatch({ type: "upgradeHive", hive: id }));
        break;
      }
      case "split":
      case "move":
        app.setUi({ mode: { type: "place", what: kind, hive: id } });
        app.closeSheet();
        break;
    }
  }

  // ---------- drawing ----------

  /** "Pure lavender ★★ (93%)" or "Meadow blend (clover 55%, lavender 45%)". */
  function verdictWords(h, v, total) {
    if (!v.product) return W.nothing;
    if (v.flower) return W.pure(C.FLOWERS[v.flower].name, v.stars, v.purity);
    const shares = Object.entries(h.stores)
      .map(([k, u]) => ({ name: C.FLOWERS[k]?.name ?? SOURCE_SHORT[k] ?? k, share: u / total }))
      .filter((s) => s.share >= 0.1)
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);
    return W.blend(shares);
  }

  /** One plain line when the jar is close to changing: a star nearer, or about to be spoilt. */
  function hintWords(h, v, f, tomorrow) {
    if (!v.product) return "";
    const STARS = C.TUNING.STARS;
    const rank = (x) => (x?.flower ? x.stars : 0);
    // The forecast's verdict is the stores after what is still to come.
    const after = f && f.left > 0.05 ? f.verdict : null;
    const afterWords = after
      ? verdictShort(after.flower ? C.FLOWERS[after.flower].name : "", after.stars)
      : "";
    if (after?.product && C.spoils(app.state, id)) return W.hint.drop(tomorrow, afterWords);
    if (v.stars >= STARS.length) return W.hint.top;
    const gap = STARS[v.stars].at - v.purity;
    if (gap <= 0.05) {
      const points = Math.max(1, Math.ceil(gap * 100 - 1e-6));
      if (v.flower) return W.hint.nearStar(points, v.stars + 1);
      let top = "";
      for (const k in h.stores) {
        if (Object.hasOwn(C.FLOWERS, k) && (!top || h.stores[k] > h.stores[top])) top = k;
      }
      if (top) return W.hint.nearPure(points, C.FLOWERS[top].name);
    }
    if (after?.product && rank(after) > rank(v)) return W.hint.rise(tomorrow, afterWords);
    return "";
  }

  function careRow(kind, on, title = "", sub = "", rest = "", end = "") {
    const row = rows[kind];
    row.rest = rest;
    show(row.btn, on);
    if (!on) return;
    text(row.title, title);
    text(row.sub, rest || sub);
    text(row.end, end);
    row.btn.setAttribute("aria-disabled", rest ? "true" : "false");
  }

  function draw() {
    const state = app.state;
    const h = C.hiveById(state, id);
    if (!h) return;
    const day = state.clock.day;
    const phase = state.clock.phase;
    const cal = C.calendarOf(day);
    const type = C.HIVES[h.type];
    const total = C.totalOf(h.stores);
    const cap = C.capacityOf(h);
    const limit = C.limitOf(h);
    const whole = C.jarsIn(h);
    const flags = C.attentionOf(state, h);
    const has = (flag) => flags.includes(flag);
    const v = C.verdictOf(h.stores);
    const f = C.forecast(state, id);
    const need = C.winterNeed(state, h);
    const meal = C.mealOf(h, day);
    const late = cal.season >= 2; // autumn and winter: the winter need matters now
    const tomorrow = !!f && f.day !== day;
    const flyingNow = phase === "day" && !tomorrow;
    const coming = f && !tomorrow ? f.left : 0;
    const can = C.careOf(state, id);

    // the hive and its bees
    if (pictured !== h.type) {
      picture.replaceChildren(pic(hiveArt(/** @type {any} */ (h.type)), 84, type.name));
      picture.dataset.type = h.type;
      pictured = h.type;
    }
    while (bees.children.length < limit)
      bees.append(el("span.hh-hive__place", null, pic(bee(0), 21)));
    while (bees.children.length > limit) bees.lastElementChild?.remove();
    [...bees.children].forEach((b, i) => b.classList.toggle("is-on", i < h.strength));
    bees.setAttribute("aria-label", W.beesLabel(h.strength, limit));
    text(
      strength,
      h.strength >= limit ? W.strengthFull(h.strength) : W.strength(h.strength, limit),
    );
    text(place, W.place(C.PLOTS[h.plot].name));

    // notes
    // "low" in the morning is every hive's ordinary state when the day's
    // flying will cover supper: it is only worth a note when it will not.
    const short = has("low") && total + coming + 1e-6 < meal;
    const lines = [];
    for (const flag of flags) {
      if (flag === "queen-cells" || flag === "swarm-risk") continue; // the card above says it
      if (flag === "winter-short") lines.push(W.notes[flag](total, need));
      else if (flag === "low") {
        if (short) lines.push(W.notes.low(coming > 0.05));
      } else if (typeof W.notes[flag] === "string") lines.push(W.notes[flag]);
    }
    if ((h.today?.raided ?? 0) >= 1) lines.push(W.notes.raided(h.today.raided, !!h.raid));
    if ((h.today?.lost ?? 0) >= 1 && !has("full")) lines.push(W.notes.spilt(h.today.lost));
    if (h.moved === day) lines.push(W.notes.moved);
    const noteKey = lines.join("\n");
    if (noteKey !== noted) {
      noted = noteKey;
      notes.replaceChildren(...lines.map((line) => el("li", { text: line })));
    }
    show(notes, lines.length > 0);

    // stores
    text(storesCount, W.storesOf(total, type.jars));
    meter.setAttribute("aria-label", `${W.stores}: ${W.storesOf(total, type.jars)}`);
    meter.classList.toggle("hh-meter--mark", late);
    if (late) meter.style.setProperty("--hh-mark", String(Math.min(1, need / cap)));
    for (const k of SOURCES) {
      const u = h.stores[k] ?? 0;
      const part = parts[k];
      part.seg.style.width = `${Math.min(100, (u / cap) * 100)}%`;
      show(part.key, u > 0.05);
      if (u > 0.05) text(part.label, W.legend(nameOf(k), u));
    }
    show(emptyLine, total <= 0.05);
    show(winterLine, late);
    if (late) text(winterLine, W.winterMark(need));

    // what it would bottle as
    const jarKey = v.product ?? "none";
    if (jarKey !== jarred) {
      jarred = jarKey;
      jarBox.replaceChildren(pic(jar(v.flower ?? "blend", /** @type {any} */ (v.stars)), 50));
      jarBox.classList.toggle("is-empty", !v.product);
    }
    text(verdict, verdictWords(h, v, total));
    const hinted = hintWords(h, v, f, tomorrow);
    show(hint, !!hinted);
    text(hint, hinted);

    // the next flight
    show(flying, !!f);
    if (f) {
      text(flyHead, tomorrow ? W.flying.evening : flyingNow ? W.flying.day : W.flying.morning);
      let line;
      let after = "";
      /** @type {{ k: string, share: number }[]} */
      let by = [];
      if (C.calendarOf(f.day).season === 3) line = W.flying.winter;
      else if (f.total < 0.05) line = W.flying.nothing;
      else {
        line = W.flying.line(f.total, W.flying.weather[f.weather] ?? W.flying.weather.cloudy);
        if (flyingNow) line += ` ${W.flying.soFar(f.got)}`;
        if (f.stored + 0.5 < f.total) line += ` ${W.flying.spill(f.stored)}`;
        by = Object.entries(f.by)
          .map(([k, u]) => ({ k, share: u / f.total }))
          .filter((s) => s.share >= 0.01)
          .sort((a, b) => b.share - a.share);
        if (f.left > 0.05 && f.verdict?.product) {
          after = W.flying.after(
            verdictShort(f.verdict.flower ? C.FLOWERS[f.verdict.flower].name : "", f.verdict.stars),
          );
        }
      }
      text(flyLine, line);
      const chipKey = by.map((s) => `${s.k}:${Math.round(s.share * 100)}`).join(",");
      if (chipKey !== chipped) {
        chipped = chipKey;
        flyChips.replaceChildren(
          ...by.map((s) =>
            el("span.hh-chip", null, [
              PAINTED.includes(s.k)
                ? pic(bedArt(s.k, "bloom"), 22)
                : el("i.hh-stores__dot", { style: { backgroundColor: colourOf(s.k) } }),
              W.flying.chip(nameOf(s.k), s.share),
            ]),
          ),
        );
      }
      show(flyChips, by.length > 0);
      show(flyAfter, !!after);
      text(flyAfter, after);
    }

    // care: only what applies, each with its price or its reason for resting
    /** The core's answer as a reason for resting: "" when the action can go ahead. */
    const why = (table, code) => (code === true || !code ? "" : (table[code] ?? say(code)));
    const coinsNow = state.purse.coins;
    const mitey = has("mites") || has("mites-bad");

    careRow("wasps", !!h.raid, W.wasps.title, W.wasps.sub, why({}, can.fendWasps));

    const syrup = state.stock.syrup ?? 0;
    const wantsFeed = syrup > 0 || has("hungry") || short || has("winter-short");
    let feedWhy = can.feed;
    if (feedWhy === "no-syrup" && !C.shopNow(state).items.find((i) => i.id === "syrup")?.open) {
      feedWhy = "not-yet";
    }
    careRow(
      "feed",
      wantsFeed,
      W.feed.title,
      W.feed.sub(syrup),
      why(W.feed.why, feedWhy),
      `×${number(syrup)}`,
    );

    const wantsDust = mitey || h.dusted === day;
    careRow("dust", wantsDust, W.dust.title, W.dust.sub, why(W.dust.why, can.dust), W.dust.end);

    const remedies = state.stock.remedy ?? 0;
    careRow(
      "remedy",
      mitey,
      W.remedy.title,
      W.remedy.sub(remedies),
      why(W.remedy.why, can.remedy),
      `×${number(remedies)}`,
    );

    const up = C.upgradeOf(h);
    if (up) {
      careRow(
        "upgrade",
        true,
        W.upgrade.title(up.name),
        W.upgrade.sub(up.jars, up.limit),
        can.upgrade === "no-coins"
          ? W.upgrade.why["no-coins"](up.cost - coinsNow)
          : why({}, can.upgrade),
        number(up.cost),
      );
    } else careRow("upgrade", false, "", "", why({}, can.upgrade));

    careRow("move", true, W.move.title, W.move.sub, why(W.move.why, can.move));
    careRow("split", true, W.split.title, W.split.sub, why(W.split.why, can.split));

    // A colony that has outgrown its hive: what is happening, and the ways out.
    const cells = has("queen-cells");
    const crowded = cells || has("swarm-risk");
    show(swarm, crowded);
    if (crowded) {
      const S = W.swarm;
      const kept = h.harvested === day;
      const leaving = cells && !kept && total + 1e-6 >= NECTAR;
      text(swarmTitle, cells ? S.cellsTitle : S.riskTitle);
      text(
        swarmText,
        !cells ? S.risk : leaving ? S.cellsTonight : kept ? S.cellsTaken : S.cellsBare,
      );
      /** @type {string[]} */
      const more = [];
      show(swarmUp, !!up);
      if (up) {
        text(upLabel, S.upgrade(up.cost));
        swarmUp.setAttribute("aria-disabled", rows.upgrade.rest ? "true" : "false");
        if (can.upgrade === "no-coins") more.push(S.noCoins(up.cost - coinsNow));
        else if (rows.upgrade.rest) more.push(rows.upgrade.rest);
      }
      wantsSpare = can.split === "no-spare";
      text(splitLabel, wantsSpare ? S.spare : S.split);
      const splitRest = wantsSpare ? "" : why(S.splitWhy, can.split);
      swarmSplit.setAttribute("aria-disabled", splitRest ? "true" : "false");
      if (splitRest) more.push(splitRest);
      if (leaving && whole > 0) more.push(S.stopgap);
      text(swarmMore, more.join(" "));
      show(swarmMore, more.length > 0);
    } else wantsSpare = false;

    seen = {
      total,
      whole,
      need,
      meal,
      late,
      coming,
      cant: why({}, can.harvest) ? String(can.harvest) : "",
    };
    drawTake();
    return { total, whole, need, late };
  }

  // Open on a sensible number: everything in spring and summer, and from
  // autumn only what the bees can spare.
  const first = draw();
  if (first) {
    const keep = first.late ? first.need : 0;
    take = Math.max(0, Math.min(first.whole, Math.floor((first.total - keep + 1e-6) / NECTAR)));
    drawTake();
  }

  /** The small happy moment after taking jars. */
  function celebrate(e) {
    const what = e.flower
      ? W.take.honey(C.HONEYS[e.flower].name, e.stars)
      : C.HONEYS.blend.name.toLowerCase();
    app.toast(W.take.got(e.jars, what, e.wax), {
      icon: jar(e.flower ?? "blend", e.stars),
      sound: false, // the meadow plays it
    });
    // Round the jar's picture if it is in view, else round the button under the thumb.
    const box = jarBox.getBoundingClientRect();
    const view = root.getBoundingClientRect();
    const seenJar = box.top >= view.top && box.bottom <= view.bottom;
    app.fx("sparkle", { at: seenJar ? jarBox : takeBtn, n: 7 });
    app.fx("pop", { el: jarBox });
  }

  return {
    update(state, events) {
      let taken = null;
      for (const e of events ?? []) {
        if (/** @type {any} */ (e).hive !== id) continue;
        const ev = /** @type {any} */ (e);
        if (ev.type === "harvested") {
          take = 0; // a second tap must never take more by accident
          taken = ev;
        } else if (ev.type === "fed") app.toast(W.feed.done);
        else if (ev.type === "dusted") app.toast(W.dust.done);
        else if (ev.type === "remedied") app.toast(W.remedy.done);
        else if (ev.type === "waspsFended") app.toast(W.wasps.done);
        else if (ev.type === "hiveUpgraded") {
          app.toast(W.upgrade.done(C.HIVES[ev.hiveType].name), { sound: false });
          app.fx("pop", { el: picture });
        }
      }
      if (!C.hiveById(app.state, id)) return;
      retitle();
      draw();
      if (taken) celebrate(taken); // after the redraw, so the sparkle lands where the jar now is
    },
    unmount() {
      for (const stop of stops) stop();
    },
  };
}
