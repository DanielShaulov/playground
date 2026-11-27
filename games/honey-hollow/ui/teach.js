// @ts-check
/**
 * The teaching layer. There is no tutorial level: the game teaches with
 * keeper's notes (slips of paper pointing at the thing to tap, `app.note`)
 * and a few toasts for good news no screen announces.
 *
 *   import("./teach.js").then((teach) => teach.start(app));   // main.js, once
 *   teach.reset()                                               // show the notes again
 *
 * It hangs off `app.on` and only reads `app.state` and `app.ui`. Three parts:
 *
 *   LESSONS   one entry per note: `when(c)` says whether it is wanted now and
 *             what it points at. The first two days are the "guide" lessons,
 *             in order; every other system has one "system" lesson; wasps and
 *             a swarm are "urgent" (they are happening now).
 *   pump()    picks at most one lesson to show. It runs a moment after
 *             something changed, never on a plain tick of the day.
 *   herald()  turns events nobody announces into one toast each.
 *   the cue   a soft ring that breathes on the very thing a note points at
 *             (teach.css), so the first gesture is shown on the target and
 *             not only described. It is still when motion is off.
 *
 * The rules a note obeys (docs/honey-hollow/screens.md, "Teaching"):
 *   - one at a time, and never while another note or a confirm card is up;
 *   - not until a scene or sheet has finished arriving;
 *   - a few seconds apart, and system notes further apart than that;
 *   - only when its anchor is really on screen and not under something:
 *     otherwise it waits;
 *   - during the flying day only what is about the day itself;
 *   - once each: the spine remembers which ids were shown (per save);
 *   - a note whose moment has passed is put away, so it never points at
 *     something that is no longer there.
 * Tapping anywhere puts a note away and the tap still does its work: that is
 * the spine's doing (ui/layers.js).
 */

import { hook } from "./app.js";
import { dismissNote } from "./layers.js";
import { css } from "./dom.js";
import { createStore } from "../../../shared/storage.js";
import { item, seeds as seedsArt, good as goodArt } from "./art/goods.js";
import { NOTES, HERALD } from "./words/teach.js";

/** Between two notes. */
const GAP = 4000;
/** Between two notes about new systems. */
const SYSTEM_GAP = 9000;
/** After a scene or sheet starts to arrive, and after a note was tapped away. */
const SETTLE = 650;
const AFTER = 900;

/**
 * @typedef {{ anchor: any, text: string, place?: "above" | "below" | "auto", ring?: any }} Spec
 *   anchor: what the slip points at. ring: what to tap, when that is another
 *   thing (the slip points at a customer's wish, the ring is on the jar).
 */
/**
 * @typedef {{
 *   id: string, kind: "urgent" | "guide" | "system", day?: boolean, life?: number,
 *   when: (c: any) => Spec | null | undefined | false | 0 | ""
 * }} Lesson
 *   day: may show while the bees are flying. life: put away by itself after this long.
 */

/** @type {any} */
let app = null;
const store = createStore("honey-hollow");

// ───────────────────────── where things are ─────────────────────────

const $ = (sel) => document.querySelector(sel);
/** A button on the meadow screen, by its `data-act` (the meadow's own markup, ui/meadow/bars.js). */
const act = (name) => `:is(.hm-primary, .hm-acts, .hm-chips, .hm-head) [data-act="${name}"]`;

/**
 * The anchor itself (an element, or a plain rectangle) if it is on screen,
 * inside the viewport and not under anything; else null.
 */
function onScreen(anchor) {
  let a = typeof anchor === "function" ? anchor() : anchor;
  if (typeof a === "string") a = $(a);
  if (!a) return null;
  const node = a instanceof Element ? a : null;
  const r = node ? node.getBoundingClientRect() : a;
  if (!(r.width > 0 && r.height > 0)) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (r.left < -1 || r.top < -1 || r.left + r.width > W + 1 || r.top + r.height > H + 1)
    return null;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit) return null;
  if (node) return node.contains(hit) || hit.contains(node) ? node : null;
  return hit.closest(".hm-stage") ? a : null;
}

/** A square of the plot on show, as a rectangle on the page (null when it is not showing). */
function square(plot, x, y, tall = 0) {
  if (app.ui.scene !== "meadow" || app.ui.plot !== plot) return null;
  let r = null;
  try {
    r = hook.squareRect?.(plot, x, y);
  } catch {
    r = null;
  }
  if (!r || !(r.width > 0)) return null;
  // A hive stands taller than its square: point at the top of it.
  const up = r.height * tall;
  const left = r.left ?? r.x;
  const top = r.top ?? r.y;
  return { left, top: top - up, width: r.width, height: r.height + up };
}

// ───────────────────────── what a lesson can ask ─────────────────────────

/** Everything a lesson's `when` reads, worked out once per pump (and lazily). */
function context(s) {
  const core = app.core;
  const ui = app.ui;
  const cal = core.calendarOf(s.clock.day);
  const phase = s.clock.phase;
  const scene = ui.scene;
  const sheet = ui.sheet;
  /** @type {Map<number, string[]>} */
  const flags = new Map();
  /** @type {any} */
  let morrow;
  const c = {
    s,
    core,
    cal,
    doy: cal.doy,
    season: cal.season,
    day: s.clock.day,
    phase,
    morning: phase === "morning",
    evening: phase === "evening",
    flying: phase === "day",
    scene,
    sheet,
    plot: ui.plot,
    /** The meadow with nothing over it and nothing in hand, on a plot that is hers. */
    meadow: scene === "meadow" && !sheet && !ui.mode && !!s.land.plots[ui.plot]?.owned,
    stats: s.progress.stats ?? {},
    coins: s.purse.coins,
    /** The hives on the plot on show. */
    here: s.hives.list.filter((h) => h.plot === ui.plot),
    /** The hive whose sheet is open, if one is. */
    get open() {
      return sheet === "hive" && ui.selected?.kind === "hive"
        ? core.hiveById(s, ui.selected.id)
        : null;
    },
    hive: (h) => square(h.plot, h.x, h.y, 0.45),
    square: (x, y) => square(ui.plot, x, y),
    act,
    /** A chip in the sky. Its button reaches past the top of the screen for the thumb; the chip is what is seen. */
    chip: (name) => `.hm-chips [data-act="${name}"] .hh-chip`,
    /** The first hive on show that the core says wants this kind of looking at. */
    flagged(flag) {
      return c.here.find((h) => {
        if (!flags.has(h.id)) flags.set(h.id, core.attentionOf(s, h) ?? []);
        return flags.get(h.id)?.includes(flag);
      });
    },
    /** The night card's forecast (the core's `tomorrow`). */
    get tomorrow() {
      if (morrow === undefined) morrow = core.tomorrow(s) ?? null;
      return morrow;
    },
  };
  return c;
}

const anyHoney = (s) => Object.values(s.stock.honey ?? {}).some((n) => Number(n) > 0);

// ───────────────────────── the lessons ─────────────────────────

/** @type {Lesson[]} */
const LESSONS = [
  // ---- happening now
  {
    id: "teach-wasps",
    kind: "urgent",
    day: true,
    when(c) {
      const h = c.scene === "meadow" && !c.sheet && c.here.find((x) => x.raid);
      return h && { anchor: c.hive(h), text: NOTES.wasps };
    },
  },
  {
    id: "teach-swarm",
    kind: "urgent",
    day: true,
    when(c) {
      const sw = c.meadow && c.s.hives.swarms.find((w) => w.plot === c.plot);
      return sw && { anchor: c.square(sw.x, sw.y), text: NOTES.swarm(c.s.hives.spare >= 1) };
    },
  },

  // ---- the first two days
  {
    id: "teach-welcome",
    kind: "guide",
    when: (c) =>
      c.meadow &&
      c.morning &&
      c.day === 1 &&
      !c.stats.days && { anchor: c.act("start"), text: NOTES.welcome, place: "above" },
  },
  {
    id: "teach-reach",
    kind: "guide",
    day: true,
    life: 12000,
    when: (c) =>
      c.meadow &&
      c.flying &&
      c.day <= 2 &&
      !c.stats.jars &&
      c.s.clock.tick >= 6 &&
      c.here[0] && { anchor: c.hive(c.here[0]), text: NOTES.reach },
  },
  {
    id: "teach-honey",
    kind: "guide",
    when(c) {
      if (!c.meadow || c.flying || c.stats.jars) return null;
      const h = c.here.find((x) => c.core.jarsIn(x) >= 1);
      return h && { anchor: c.hive(h), text: NOTES.honey };
    },
  },
  {
    id: "teach-verdict",
    kind: "guide",
    day: true,
    when: (c) =>
      !c.stats.jars &&
      c.open &&
      c.core.jarsIn(c.open) >= 1 && {
        anchor: ".hh-hive__verdict",
        text: NOTES.verdict,
        place: "above",
      },
  },
  {
    id: "teach-take",
    kind: "guide",
    day: true,
    when: (c) =>
      !c.stats.jars &&
      c.open &&
      c.core.jarsIn(c.open) >= 1 && {
        anchor: ".hh-hive__takerow",
        text: NOTES.take,
        place: "above",
      },
  },
  {
    id: "teach-stall",
    kind: "guide",
    when: (c) =>
      c.meadow &&
      c.evening &&
      !c.stats.customers &&
      anyHoney(c.s) && { anchor: c.act("stall"), text: NOTES.toStall, place: "above" },
  },
  {
    id: "teach-wish",
    kind: "guide",
    when: (c) =>
      c.scene === "stall" &&
      !c.sheet &&
      !c.stats.customers &&
      !!c.s.market.queue[c.s.market.at] &&
      !c.s.market.queue[c.s.market.at].bought && {
        anchor: ".st-say__line",
        ring: ".st-shelf .st-item",
        text: NOTES.wish,
        place: "above",
      },
  },
  {
    id: "teach-night",
    kind: "guide",
    when: (c) =>
      c.scene === "night" &&
      !c.sheet &&
      c.evening &&
      c.day <= 3 && { anchor: '[data-teach="tomorrow"] .nt-h', text: NOTES.night, place: "above" },
  },
  {
    id: "teach-goal",
    kind: "guide",
    day: true,
    when: (c) =>
      c.meadow &&
      (!c.flying || c.day === 1) &&
      !c.s.progress.claimed.length && {
        anchor: '.hm-hint[data-kind="ready"]',
        text: NOTES.goal,
        place: "above",
      },
  },
  {
    id: "teach-seeds",
    kind: "guide",
    when(c) {
      if (!c.meadow || !c.morning || c.day < 2 || c.stats.planted || c.season === 3) return null;
      const win = c.core.bloomWindow(c.s, "dandelion");
      return {
        anchor: c.act("seeds"),
        text: NOTES.seeds(win ? win.to - c.doy : -1),
        place: "above",
      };
    },
  },
  {
    id: "teach-strip",
    kind: "guide",
    when: (c) =>
      c.sheet === "seeds" &&
      !c.stats.planted && {
        anchor: ".hh-seeds__row .hh-bloom",
        text: NOTES.strip,
        place: "above",
      },
  },
  {
    id: "teach-second-hive",
    kind: "guide",
    when: (c) =>
      c.meadow &&
      c.morning &&
      c.day >= 2 &&
      c.s.hives.list.length === 1 &&
      c.core.canBuyHive(c.s) === true && {
        anchor: c.act("hives"),
        text: NOTES.secondHive,
        place: "above",
      },
  },

  // ---- one for each new system, the first time it matters
  {
    id: "teach-queen",
    kind: "system",
    when(c) {
      const h = c.meadow && !c.flying && c.flagged("queen-cells");
      return h && { anchor: c.hive(h), text: NOTES.queen(c.morning) };
    },
  },
  {
    id: "teach-hungry",
    kind: "system",
    when(c) {
      const h = c.meadow && !c.flying && c.flagged("hungry");
      return h && { anchor: c.hive(h), text: NOTES.hungry };
    },
  },
  {
    id: "teach-mites",
    kind: "system",
    when(c) {
      const h = c.meadow && !c.flying && (c.flagged("mites") || c.flagged("mites-bad"));
      return h && { anchor: c.hive(h), text: NOTES.mites };
    },
  },
  {
    id: "teach-full",
    kind: "system",
    when(c) {
      const h = c.meadow && !c.flying && c.stats.jars > 0 && c.flagged("full");
      return h && { anchor: c.hive(h), text: NOTES.full };
    },
  },
  {
    id: "teach-spoil",
    kind: "system",
    when(c) {
      if (!c.meadow || !c.evening || !c.stats.jars) return null;
      const ids = c.tomorrow?.spoils ?? [];
      const h = ids.length && c.here.find((x) => ids.includes(x.id));
      return h && { anchor: c.hive(h), text: NOTES.spoil };
    },
  },
  {
    id: "teach-workshop",
    kind: "system",
    when: (c) =>
      c.meadow &&
      !c.flying &&
      c.season !== 3 &&
      c.core.workshopOpen(c.s) &&
      !Object.keys(c.stats.craftedBy ?? {}).length && {
        anchor: c.act("workshop"),
        text: NOTES.workshop,
        place: "above",
      },
  },
  {
    id: "teach-regular",
    kind: "system",
    when(c) {
      if (c.scene !== "stall" || c.sheet || !c.stats.customers) return null;
      const who = c.s.market.queue[c.s.market.at]?.who;
      const name = who && c.core.REGULARS[who]?.name;
      return (
        name && {
          anchor: ".st-say__hearts",
          text: NOTES.regular(name, c.core.TUNING.HEART_GIFTS[0]),
          place: "above",
        }
      );
    },
  },
  {
    id: "teach-renown",
    kind: "system",
    when: (c) =>
      c.meadow &&
      c.morning &&
      c.day >= 3 &&
      c.s.progress.renown > 0 && { anchor: c.chip("renown"), text: NOTES.renown, place: "below" },
  },
  {
    id: "teach-move",
    kind: "system",
    when: (c) =>
      c.morning &&
      c.day >= 3 &&
      !c.stats.moved &&
      c.open && {
        anchor: '.hh-hive__carebtn[data-care="move"]',
        text: NOTES.move,
        place: "above",
      },
  },
  {
    id: "teach-bunch",
    kind: "system",
    when(c) {
      if (!c.meadow || c.flying || c.stats.picked || !c.core.workshopOpen(c.s)) return null;
      const squares = c.s.land.plots[c.plot]?.squares ?? [];
      const i = squares.findIndex(
        (q) =>
          q?.t === "bed" && c.core.BUNCHES.includes(q.flower) && c.core.stageOf(c.s, q) === "bloom",
      );
      if (i < 0) return null;
      const W = c.core.TUNING.PLOT_W;
      return {
        anchor: c.square(i % W, Math.floor(i / W)),
        text: NOTES.bunch(c.core.FLOWERS[squares[i].flower].name),
      };
    },
  },
  {
    id: "teach-autumn",
    kind: "system",
    when: (c) =>
      c.meadow &&
      c.morning &&
      c.season === 2 &&
      c.here[0] && { anchor: c.hive(c.here[0]), text: NOTES.autumn },
  },
  {
    id: "teach-winter",
    kind: "system",
    when(c) {
      if (!c.meadow || !c.morning || c.season !== 3) return null;
      const open = c.core.workshopOpen(c.s);
      return {
        anchor: c.act(open ? "workshop" : "start"),
        text: NOTES.winter(open),
        place: "above",
      };
    },
  },
  {
    id: "teach-show",
    kind: "system",
    when: (c) =>
      c.meadow &&
      !c.flying &&
      c.doy >= 17 &&
      c.doy <= 20 &&
      !(c.doy === 20 && c.evening) && {
        anchor: c.chip("calendar"),
        text: NOTES.show,
        place: "below",
      },
  },
  {
    id: "teach-fair",
    kind: "system",
    when(c) {
      const T = c.core.TUNING;
      if (!c.meadow || !c.morning || c.season !== 3 || c.doy > T.FAIR_DOY) return null;
      return {
        anchor: c.chip("calendar"),
        text: NOTES.fair((T.FAIR_DOY % 7) + 1, T.FAIR_CUSTOMERS),
        place: "below",
      };
    },
  },
  {
    id: "teach-land",
    kind: "system",
    when(c) {
      if (!c.meadow || !c.morning || c.day < 3) return null;
      const P = c.core.PLOTS;
      const next = c.core.PLOT_IDS.filter((id) => !c.s.land.plots[id]?.owned).sort(
        (a, b) => P[a].price - P[b].price,
      )[0];
      if (!next || P[next].price > c.coins) return null;
      return { anchor: c.act("next"), text: NOTES.land(P[next].name), place: "below" };
    },
  },
];

// ───────────────────────── choosing one ─────────────────────────

/** Lessons shown, or found to have been shown before, since the state was last swapped. */
const done = new Set();
/** After `reset()`: lessons to show once more whatever the spine remembers. */
let forced = new Set(/** @type {string[]} */ (store.get("teach", {})?.again ?? []));

/** @type {{ lesson: Lesson, at: number } | null} the note of ours that is up */
let mine = null;
let shownAt = -1e9;
let systemAt = -1e9;
let goneAt = -1e9;
let settledAt = 0;
let where = "";
let timer = 0;
let wakeAt = Infinity;

/** For the browser checks: the last note shown and the rectangle it pointed at. */
let last = /** @type {{ id: string, rect: any, ring: any } | null} */ (null);
const rectOf = (a) => {
  const r = a instanceof Element ? a.getBoundingClientRect() : a;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

// ───────────────────────── the cue on the target ─────────────────────────

/** @type {HTMLElement | null} */
let cue = null;
let cueWasUp = false;
/** @type {MutationObserver | null} */
let watch = null;

/** Ring the thing the note `id` points at, until that note goes. */
function showCue(id, rect) {
  hideCue();
  const layer = $(".hh-layer-note");
  if (!layer) return;
  const pad = 5;
  cue = document.createElement("div");
  cue.className = "hh-teach-cue";
  cue.dataset.cue = id;
  cue.setAttribute("aria-hidden", "true");
  // Never past the edge of the screen, even at the widest of its breath.
  const edge = 4;
  const x0 = Math.max(edge, rect.left - pad);
  const y0 = Math.max(edge, rect.top - pad);
  const x1 = Math.min(window.innerWidth - edge, rect.left + rect.width + pad);
  const y1 = Math.min(window.innerHeight - edge, rect.top + rect.height + pad);
  cue.style.left = `${Math.round(x0)}px`;
  cue.style.top = `${Math.round(y0)}px`;
  cue.style.width = `${Math.round(x1 - x0)}px`;
  cue.style.height = `${Math.round(y1 - y0)}px`;
  layer.append(cue);
  cueWasUp = false;
  // The spine puts a note away on the next tap; the ring must go in the same breath.
  watch ??= new MutationObserver(checkCue);
  watch.observe(layer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}

function checkCue() {
  if (!cue) return;
  const slip = $(`.hh-layer-note .hh-note[data-note="${cue.dataset.cue}"]`);
  const up = !!slip?.closest(".hh-note-wrap.is-up");
  if (up) cueWasUp = true;
  else if (!slip || cueWasUp) hideCue();
}

function hideCue() {
  watch?.disconnect();
  cue?.remove();
  cue = null;
}

const noteUp = () => /** @type {HTMLElement | null} */ ($(".hh-layer-note .hh-note"));

function wanted(lesson, c) {
  try {
    if (c.flying && !lesson.day) return null;
    return lesson.when(c) || null;
  } catch (err) {
    // A lesson that cannot read a state is a lesson skipped, never a broken game.
    done.add(lesson.id);
    console.error("[hollow] teach:", lesson.id, err);
    return null;
  }
}

/** Run `pump` no later than `ms` from now. */
function wake(ms) {
  const at = performance.now() + ms;
  if (timer && at >= wakeAt) return;
  clearTimeout(timer);
  wakeAt = at;
  timer = window.setTimeout(pump, Math.max(0, ms));
}

function pump() {
  timer = 0;
  wakeAt = Infinity;
  const s = app.state;
  if (!s?.keeper?.made || document.hidden) return;
  const now = performance.now();
  const c = context(s);

  const up = noteUp();
  if (up) {
    // Ours, and its moment has passed: put it away. Anyone else's: wait.
    if (mine && up.dataset.note === mine.lesson.id) {
      const spec = wanted(mine.lesson, c);
      const old = mine.lesson.life && now - mine.at > mine.lesson.life;
      if (old || !spec || !onScreen(spec.anchor)) {
        dismissNote();
        mine = null;
        goneAt = now;
      }
    }
    return wake(600);
  }
  if (mine) {
    mine = null;
    goneAt = now;
  }
  if ($(".hh-dialog")) return wake(800);
  const rest = Math.max(SETTLE - (now - settledAt), AFTER - (now - goneAt));
  if (rest > 0) return wake(rest + 20);

  let waiting = false;
  for (const lesson of LESSONS) {
    if (done.has(lesson.id)) continue;
    const spec = wanted(lesson, c);
    if (!spec) continue;
    const anchor = onScreen(spec.anchor);
    if (!anchor) {
      waiting = true;
      continue;
    }
    const gap =
      lesson.kind === "urgent"
        ? 0
        : Math.max(
            GAP - (now - shownAt),
            lesson.kind === "system" ? SYSTEM_GAP - (now - systemAt) : 0,
          );
    if (gap > 0) return wake(gap + 20);
    const again = forced.has(lesson.id);
    const shown = app.note(lesson.id, {
      text: spec.text,
      anchor,
      place: spec.place ?? "auto",
      again,
    });
    done.add(lesson.id);
    if (!shown) continue;
    if (again) {
      forced.delete(lesson.id);
      store.set("teach", { again: [...forced] });
    }
    mine = { lesson, at: now };
    const ring = spec.ring ? onScreen(spec.ring) : null;
    last = { id: lesson.id, rect: rectOf(anchor), ring: rectOf(ring ?? anchor) };
    showCue(lesson.id, last.ring);
    shownAt = now;
    if (lesson.kind === "system") systemAt = now;
    return wake(600);
  }
  if (waiting) wake(900);
}

// ───────────────────────── the herald ─────────────────────────

const safe = (fn) => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

/** The meadow's hint line is where a met goal is claimed; is it in sight? */
const hintInSight = () => !!onScreen(".hm-hint");

/**
 * Good news no screen says. The stall toasts a new renown tier itself; the
 * goals sheet and the stall's gift card name their own rewards; the meadow's
 * hint line and the dot on More say a goal is met; the Book badge and the
 * night card say there is a new page. What is left:
 *   - a goal met while that hint line is out of sight;
 *   - a tier reached anywhere but the stall;
 *   - seeds, recipes and clothes that came with a tier or a plot.
 */
function herald(events) {
  /** What another screen is naming already: a goal's reward, a regular's gift. */
  const given = new Set();
  let slept = false;
  for (const e of events) {
    const r = e.type === "goalClaimed" ? e.reward : e.type === "heart" ? e.gift?.reward : null;
    if (r?.recipe) given.add(`recipe:${r.recipe}`);
    if (r?.wardrobe) given.add(`wardrobe:${r.wardrobe}`);
    if (e.type === "slept") slept = true;
  }
  /** @type {Record<string, string[]>} */
  const fresh = { flower: [], recipe: [], wardrobe: [] };
  /** @type {string[]} */
  const goals = [];
  let tier = null;
  for (const e of events) {
    if (e.type === "unlocked") {
      if (!given.has(`${e.what}:${e.id}`)) fresh[e.what]?.push(e.id);
    } else if (e.type === "renownUp") tier = e;
    else if (e.type === "goalReady") goals.push(e.goal);
  }
  const core = app.core;
  const atStall = app.ui.scene === "stall";

  if (tier && !atStall) {
    const name = tier.name ?? core.TIERS?.[tier.tier]?.name;
    if (name) app.toast(HERALD.tier(name), { icon: safe(() => item("star")), sound: "tier" });
  }

  if (fresh.flower.length || fresh.recipe.length || fresh.wardrobe.length) {
    const worn = Object.values(core.WARDROBE ?? {}).flat();
    const text = HERALD.unlocked({
      flowers: fresh.flower.map((id) => core.FLOWERS[id]?.name ?? id),
      recipes: fresh.recipe.map((id) => core.RECIPES[id]?.name ?? id),
      wardrobe: fresh.wardrobe.map(
        (id) => /** @type {any} */ (worn.find((w) => w?.id === id))?.name ?? id,
      ),
    });
    const icon = safe(() =>
      fresh.flower.length
        ? seedsArt(fresh.flower[0])
        : fresh.recipe.length
          ? goodArt(String(core.RECIPES[fresh.recipe[0]].makes).replace("soap-*", "soap-lavender"))
          : item("star"),
    );
    // After the tier's own toast (the stall's or ours), not on top of it.
    later(tier ? 1500 : 500, () => app.toast(text, { icon }));
  }

  // A goal met in the goals sheet shows there; one met by sleeping is on the
  // hint line the moment the morning comes.
  if (goals.length && !slept && app.ui.sheet !== "goals" && !hintInSight()) {
    later(900, () => {
      if (hintInSight()) return;
      const open = core.goalsNow(app.state).filter((g) => g.ready && goals.includes(g.goal.id));
      if (!open.length) return;
      app.toast(
        HERALD.goal(
          open.map((g) => g.goal.name),
          app.ui.scene !== "meadow",
        ),
        { icon: safe(() => item("star")) },
      );
    });
  }
}

let epoch = 0;
/** Later, unless the game was swapped for another in the meantime. */
function later(ms, fn) {
  const was = epoch;
  setTimeout(() => {
    if (was === epoch) safe(fn);
  }, ms);
}

// ───────────────────────── wiring ─────────────────────────

/** After every dispatch and every change to `app.ui`. A plain tick costs one comparison. */
function hear(state, events, action) {
  const type = action?.type;
  if (type === "tick" && !events.length) return;
  if (type === "@replace") {
    done.clear();
    epoch++;
  }
  if (cue) checkCue();
  if (events.length && state?.keeper?.made) safe(() => herald(events));
  moved();
  wake(type === "tick" ? 120 : 250);
}

/** Has the scene, the sheet or what is in hand changed? Then let it arrive first. */
function moved() {
  const ui = app.ui;
  const key = `${ui.scene}|${ui.sheet}|${ui.mode?.type ?? ""}`;
  if (key === where) return false;
  where = key;
  settledAt = performance.now();
  return true;
}

/**
 * Show every note once more (for a "Show the keeper's notes again" control).
 * They come back one at a time, each when its moment next comes round.
 */
export function reset() {
  forced = new Set(LESSONS.map((l) => l.id));
  store.set("teach", { again: [...forced] });
  done.clear();
  shownAt = systemAt = -1e9;
  if (app) wake(400);
}

/** The ids of every note, in the order they are considered. */
export const ids = () => LESSONS.map((l) => l.id);

let started = false;
/**
 * Begin teaching. Call once, after the app is up; calling again does nothing.
 * @param {any} theApp ui/app.js's `app`
 */
export function start(theApp) {
  if (started || !theApp) return;
  started = true;
  app = theApp;
  app.on(hear);
  css(new URL("./teach.css", import.meta.url));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake(500);
  });
  // A change of scene tells no subscriber, so glance at it twice a second.
  setInterval(() => {
    if (!document.hidden && moved()) wake(SETTLE);
  }, 500);
  // A ring measured for one shape of screen is wrong for the next.
  window.addEventListener("resize", hideCue);
  /** @type {any} */ (hook).teach = {
    reset,
    ids,
    /** The last note shown: { id, rect }. */
    get last() {
      return last;
    },
    /** For checks: why a lesson is or is not showing. */
    why(id) {
      const lesson = LESSONS.find((l) => l.id === id);
      const spec = lesson && wanted(lesson, context(app.state));
      return {
        known: !!lesson,
        done: done.has(id),
        wanted: !!spec,
        onScreen: !!(spec && onScreen(spec.anchor)),
      };
    },
    /** For checks: consider this one lesson only, at once (until the state is next swapped). */
    only(id) {
      done.clear();
      for (const l of LESSONS) if (l.id !== id) done.add(l.id);
      shownAt = systemAt = goneAt = -1e9;
      wake(0);
    },
  };
  hear(app.state, [], { type: "@ui" });
}
