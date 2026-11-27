// @ts-check
/**
 * The two things you can have "in hand" on the meadow: a planting brush
 * (tap squares to plant, until Done) and a hive to place (tap a square to
 * stand a ghost there and read what it would bring in, then put it down or
 * cancel). The mode itself lives in `app.ui.mode`, set by the sheets; the
 * ghost's square is this module's own.
 *
 * Every number on the card is the core's `forecast`: the same code that
 * makes and delivers the day's plan, so the card says exactly what putting
 * the hive there will bring.
 */

import { app } from "../app.js";
import { el, clear } from "../dom.js";
import { pic } from "../chrome.js";
import { bed } from "../art/flowers.js";
import { seeds } from "../art/goods.js";
import { say } from "../words.js";
import { MEADOW } from "../words/meadow.js";

const N = 6;

/**
 * @param {{ root: HTMLElement, foot: HTMLElement, core: any, scene: any }} o
 */
export function createModes({ root, foot, core, scene }) {
  // ---- the brush strip, where the action bar was
  const brushPic = el("span.hm-brush__pic");
  const brushName = el("b.hm-brush__name");
  const brushLine = el("span.hm-brush__line");
  const brush = el(
    "div.hm-brush.hh-card.hh-card--tint",
    { hidden: true },
    brushPic,
    el("div.hm-brush__text", null, brushName, brushLine),
    el(
      "button.hh-btn.hh-btn--small",
      { type: "button", dataset: { act: "done" } },
      MEADOW.brush.done,
    ),
  );
  foot.append(brush);

  // ---- the placement card, over the hint and the bar
  const head = el("b.hm-place__head");
  const mix = el("span.hm-place__mix");
  const note = el("span.hm-place__note");
  const putBtn = /** @type {HTMLButtonElement} */ (
    el(
      "button.hh-btn.hh-btn--leaf.hm-grow",
      { type: "button", dataset: { act: "put", sound: "none" } },
      MEADOW.place.put,
    )
  );
  const place = el(
    "div.hm-place.hh-card",
    { hidden: true },
    el("div.hm-place__text", null, head, mix, note),
    el(
      "div.hm-place__row",
      null,
      el(
        "button.hh-btn.hh-btn--secondary.hh-btn--small",
        { type: "button", dataset: { act: "cancel" } },
        MEADOW.place.cancel,
      ),
      putBtn,
    ),
  );
  root.append(place);

  /** @type {{ plot: string, x: number, y: number } | null} */
  let ghost = null;
  let brushKey = "";
  let placeKey = "";
  /** @type {any} */
  let bestFor = null;
  let bestKey = "";
  /** @type {number[]} */
  let bestList = [];

  const jarsOf = (units) => (Number(units) || 0) / core.TUNING.NECTAR_PER_JAR;
  const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

  function seedPic(flower) {
    try {
      return pic(seeds(flower), 36);
    } catch {
      try {
        return pic(/** @type {any} */ (bed)(flower, "bloom", 0), 36);
      } catch {
        return null;
      }
    }
  }

  /** What the hive in hand looks like. */
  function ghostType(state, mode) {
    const h = mode?.what === "move" ? core.hiveById(state, mode.hive) : null;
    return h?.type ?? core.newHiveType(state);
  }

  /** The core's forecast for the hive in hand, standing at `at`. */
  function forecastAt(state, mode, at) {
    if (mode.what === "move") return core.forecast(state, mode.hive, at);
    if (mode.what === "split") return core.forecast(state, null, at, { split: mode.hive });
    if (mode.what === "catch") return core.forecast(state, null, at, { swarm: mode.swarm });
    return core.forecast(state, null, at);
  }

  /**
   * The squares of `plot` where the hive in hand would bring in most
   * (y * 6 + x, best first, at most three). Worked out once per state.
   */
  function best(state, plot) {
    const mode = app.ui.mode;
    if (mode?.type !== "place") return null;
    const key = `${plot}|${mode.what}|${mode.hive ?? mode.swarm ?? ""}`;
    if (bestFor === state && bestKey === key) return bestList;
    bestFor = state;
    bestKey = key;
    bestList = [];
    const moving = mode.what === "move" ? mode.hive : 0;
    /** @type {{ i: number, total: number }[]} */
    const found = [];
    try {
      for (let i = 0; i < N * N; i++) {
        const at = { plot, x: i % N, y: (i / N) | 0 };
        if (core.canPlaceHive(state, plot, at.x, at.y, moving) !== true) continue;
        const f = forecastAt(state, mode, at);
        found.push({ i, total: Number((f.settled ?? f).total) || 0 });
      }
    } catch (err) {
      console.warn("[meadow] no forecast", err);
    }
    // Only worth pointing out when some squares really are better than others.
    found.sort((a, b) => b.total - a.total);
    const top = found[0]?.total ?? 0;
    const low = found[found.length - 1]?.total ?? 0;
    if (top > 0.001 && top - low > 0.02 * top)
      bestList = found
        .filter((f) => f.total >= top * 0.97)
        .slice(0, 3)
        .map((f) => f.i);
    return bestList;
  }

  /** The lines of the card for a ghost at `at`. */
  function read(state, mode, at) {
    const f = forecastAt(state, mode, at);
    const P = MEADOW.place;
    const today = f.day === state.clock.day;
    const whole = f.settled ?? f;
    // While the bees are out, only what is still to come today will arrive.
    const during = today && state.clock.phase === "day";
    const coming = during ? f.left : f.total;
    if (!(whole.total > 0.001))
      return { head: P.nothing(today), mix: f.weather === "rain" ? P.rain : "", note: "", today };
    const headLine = during
      ? P.rest(jarsOf(coming), jarsOf(whole.total))
      : f.moved && f.settled
        ? P.headMoved(today, jarsOf(f.total), jarsOf(f.settled.total))
        : P.head(today, jarsOf(f.total));
    const parts = Object.entries(f.by ?? {})
      .map(([id, units]) => ({
        name: core.FLOWERS[id]?.name ?? id,
        share: Number(units) / f.total,
      }))
      .concat(f.wild > 0 ? [{ name: P.wild, share: f.wild / f.total }] : [])
      .filter((p) => p.share >= 0.005)
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);
    const v = f.verdict ?? {};
    const product = core.productInfo?.(v.product)?.name;
    const verdict = v.flower
      ? P.pure(product ?? core.HONEYS?.[v.flower]?.name ?? v.flower, v.stars)
      : product
        ? lower(product)
        : P.blend;
    let extra = "";
    const other = (f.others ?? []).find(
      (o) => Math.abs(o.total - o.was) > 0.05 * core.TUNING.NECTAR_PER_JAR,
    );
    if (f.moved) extra = P.half;
    else if (other)
      extra = P.other(core.hiveNumber(state, other.id), jarsOf(other.was), jarsOf(other.total));
    else if (f.weather === "rain") extra = P.rain;
    else if (f.stored !== undefined && f.stored < f.total - 0.05 * core.TUNING.NECTAR_PER_JAR)
      extra = P.full;
    return {
      head: headLine,
      mix: parts.length ? P.line(P.mix(parts), verdict) : "",
      note: extra,
      today,
    };
  }

  /**
   * Show what is in hand. Called with every view of the game.
   * @param {any} state
   * @param {string} plot the plot on show
   */
  function update(state, plot) {
    const mode = app.ui.mode;
    const planting = mode?.type === "plant";
    const placing = mode?.type === "place";
    root.classList.toggle("is-brush", planting);
    root.classList.toggle("is-place", placing);
    brush.hidden = !planting;
    place.hidden = !placing;
    if (!placing || (ghost && ghost.plot !== plot)) ghost = null;

    if (planting) {
      const row = (core.shopNow(state)?.seeds ?? []).find((s) => s.flower === mode.flower);
      const have = row?.have ?? state.stock?.seeds?.[mode.flower] ?? 0;
      const key = `${mode.flower}|${have}`;
      if (key !== brushKey) {
        if (!brushKey.startsWith(`${mode.flower}|`)) {
          clear(brushPic);
          const p = seedPic(mode.flower);
          if (p) brushPic.append(p);
        }
        brushKey = key;
        brushName.textContent = row?.name ?? core.FLOWERS[mode.flower]?.name ?? mode.flower;
        brushLine.textContent =
          have > 0 ? MEADOW.brush.inHand(have) : MEADOW.brush.each(row?.price ?? 0);
      }
    } else brushKey = "";

    if (placing) {
      const c = state.clock;
      const key = ghost
        ? `${mode.what}|${ghost.x},${ghost.y}|${c.day}|${c.phase}|${c.tick}`
        : `${mode.what}|`;
      if (key !== placeKey) {
        placeKey = key;
        putBtn.disabled = !ghost;
        if (!ghost) {
          head.textContent = MEADOW.place.title[mode.what] ?? MEADOW.place.title.buy;
          mix.textContent = MEADOW.place.prompt[mode.what] ?? MEADOW.place.prompt.buy;
          note.textContent = "";
          delete place.dataset.forecast;
        } else {
          let lines = { head: "", mix: "", note: "", today: true };
          try {
            lines = read(state, mode, ghost);
          } catch (err) {
            console.warn("[meadow] no forecast", err);
          }
          head.textContent = lines.head;
          mix.textContent = lines.mix;
          note.textContent = lines.note;
          place.dataset.forecast = lines.today ? "today" : "tomorrow";
        }
        mix.hidden = !mix.textContent;
        note.hidden = !note.textContent;
      }
    } else {
      placeKey = "";
      delete place.dataset.forecast;
    }
  }

  /** A tap on square (x, y) while a hive is in hand. */
  function tryPlace(state, plot, x, y) {
    const mode = app.ui.mode;
    if (mode?.type !== "place") return;
    const ok = core.canPlaceHive(state, plot, x, y, mode.what === "move" ? mode.hive : 0);
    if (ok !== true) {
      scene.flash(x, y, "no");
      app.toast(say(ok), { sound: "nope" });
      return;
    }
    ghost = { plot, x, y };
    app.sound("pop");
  }

  /** "Put it here". True if the hive went down. */
  function put() {
    const mode = app.ui.mode;
    if (mode?.type !== "place" || !ghost) return false;
    const at = { plot: ghost.plot, x: ghost.x, y: ghost.y };
    const action =
      mode.what === "move"
        ? { type: "moveHive", hive: mode.hive, ...at }
        : mode.what === "split"
          ? { type: "split", hive: mode.hive, ...at }
          : mode.what === "catch"
            ? { type: "catchSwarm", swarm: mode.swarm, ...at }
            : { type: "buyHive", ...at };
    const events = app.dispatch(action);
    if (!events || events.some((e) => e.type === "rejected")) return false;
    ghost = null;
    app.sound("place");
    scene.pop(at.x, at.y);
    scene.sparkle(at.x, at.y, 5);
    scene.walkTo(at.x, at.y);
    app.setUi({ mode: null, selected: null });
    return true;
  }

  return {
    update,
    tryPlace,
    put,
    ghostType,
    best,
    get ghost() {
      return ghost;
    },
    drop() {
      ghost = null;
    },
  };
}
