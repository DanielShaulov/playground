// @ts-check
/**
 * The meadow: the screen the game is played on. This module is the scene's
 * entry and its hands: it builds the page (./bars.js), runs the canvas
 * (./scene.js) and what is in hand (./modes.js), turns taps into actions,
 * runs the day's clock, and answers what happens out here with a small
 * motion and a sound. It keeps nothing of the game: every view is worked out
 * again from `app.state` and `app.ui`, and every rule is the core's.
 */

import { app, hook } from "../app.js";
import { css, on } from "../dom.js";
import { dayLabel, say } from "../words.js";
import { MEADOW } from "../words/meadow.js";
import { createBars } from "./bars.js";
import { createScene } from "./scene.js";
import { createModes } from "./modes.js";

const rejected = (events) => !events || events.some((e) => e.type === "rejected");

/** The light over the meadow: red, green, blue and how much, by hour and weather. */
const LIGHT = {
  none: [255, 255, 255, 0],
  evening: [66, 78, 164, 0.27],
  rain: [78, 100, 140, 0.22],
  snow: [150, 172, 204, 0.1],
  frost: [168, 200, 236, 0.1],
  cloudy: [104, 118, 142, 0.11],
  morning: [255, 188, 108, 0.14],
  late: [255, 164, 72, 0.17],
};

// Only the newest meadow runs the clock (a save swapped in mounts the next
// one before this one is taken down), and each morning is greeted once.
let newest = 0;
let wokeOn = 0;
let rainOn = 0;

/** @param {HTMLElement} root */
export async function mount(root) {
  await css(new URL("./meadow.css", import.meta.url));
  const me = ++newest;
  const core = /** @type {any} */ (app.core);
  /** @type {string[]} */
  const plots = core.PLOT_IDS;
  root.classList.add("hh-page", "hm");

  const bars = createBars(root);
  const scene = createScene({ stage: bars.stage, bg: bars.bg, fg: bars.fg, core });
  const modes = createModes({ root, foot: bars.foot, core, scene });

  let dead = false;
  let painting = 0; // plots being painted just now
  let shown = ""; // the plot the canvas is showing
  let wanted = ""; // the plot and season asked for
  let sawSheet = false;
  let ambience = "";
  let calm = app.settings.motion === false;
  /** @type {(() => void)[]} */
  const offs = [];

  const ui = () => /** @type {any} */ (app.ui);
  const plotId = () => (plots.includes(ui().plot) ? ui().plot : plots[0]);

  // ---------------------------------------------------------------- the view

  // The open goals, worked out once for each state.
  /** @type {any} */
  let goalsFor = null;
  /** @type {any[]} */
  let goalsList = [];
  const goalsOf = (s) => {
    if (goalsFor !== s) {
      goalsFor = s;
      goalsList = core.goalsNow(s) ?? [];
    }
    return goalsList;
  };

  const hint = { kind: "", text: "", icon: "", plot: "" };
  function setHint(kind, text, icon = "", plot = "") {
    hint.kind = kind;
    hint.text = text;
    hint.icon = icon;
    hint.plot = plot;
  }

  function readHint(s, id, owned) {
    const mode = ui().mode;
    if (mode?.type === "plant") {
      const row = (core.shopNow(s)?.seeds ?? []).find((r) => r.flower === mode.flower);
      const name = row?.name ?? core.FLOWERS[mode.flower]?.name ?? mode.flower;
      return setHint(
        "brush",
        row?.have > 0
          ? MEADOW.hint.brushInHand(name, row.have)
          : MEADOW.hint.brush(name, row?.price ?? 0),
        "plant",
      );
    }
    if (mode?.type === "place") return setHint("place", MEADOW.hint.place);
    // Trouble on the plot in front of you comes before trouble elsewhere.
    const raids = s.hives.list.filter((h) => h.raid);
    const raided = raids.find((h) => h.plot === id) ?? raids[0];
    if (raided) {
      const away = raided.plot !== id;
      return setHint(
        "wasps",
        MEADOW.hint.wasps(core.hiveNumber(s, raided.id), away ? core.PLOTS[raided.plot].name : ""),
        "",
        raided.plot,
      );
    }
    const sw = s.hives.swarms.find((w) => w.plot === id) ?? s.hives.swarms[0];
    if (sw)
      return setHint(
        "swarm",
        MEADOW.hint.swarm(sw.plot !== id ? core.PLOTS[sw.plot].name : ""),
        "",
        sw.plot,
      );
    if (!owned)
      return setHint("forsale", MEADOW.hint.forSale(core.PLOTS[id].name, core.PLOTS[id].price));
    const sel = ui().selected;
    if (sel?.kind === "hive") {
      const h = core.hiveById(s, sel.id);
      if (h)
        return setHint(
          "hive",
          MEADOW.hint.hive(core.hiveNumber(s, h.id), core.HIVES[h.type]?.name ?? h.type),
        );
    }
    const goals = goalsOf(s);
    const ready = goals.find((g) => g.ready);
    if (ready) return setHint("ready", MEADOW.hint.ready(ready.goal.name), "goals");
    const open = goals.find((g) => !g.ready);
    if (open)
      return setHint(
        "next",
        MEADOW.hint.next(open.goal.text ?? open.goal.name, open.have, open.need),
        "goals",
      );
    return setHint("idle", MEADOW.hint.idle);
  }

  function lightOf(s, owned) {
    const w = s.weather.today;
    const phase = s.clock.phase;
    if (!owned) return LIGHT.none;
    if (phase === "evening") return LIGHT.evening;
    if (w === "rain" || w === "snow" || w === "frost" || w === "cloudy") return LIGHT[w];
    if (phase === "morning") return LIGHT.morning;
    if (s.clock.tick > 190) return LIGHT.late;
    return LIGHT.none;
  }

  /** "Only here: …" for a plot: the flowers that could stand nowhere else. */
  function onlyHere(s, id) {
    const names = [];
    for (const f of core.FLOWER_IDS) {
      const where = core.whereGrows(s, f) ?? [];
      if (where.length === 1 && where[0] === id) names.push(core.FLOWERS[f].name);
    }
    return names.length ? MEADOW.buy.onlyHere(names) : "";
  }

  /** @type {Record<string, any>} */
  const vm = { goalReady: false };
  const view = {
    selected: null,
    mode: null,
    ghost: /** @type {any} */ (null),
    ghostType: "",
    motion: true,
    best: /** @type {number[] | null} */ (null),
    tending: 0,
  };

  /** @param {boolean} [quick] only what a tick of the clock can change */
  function render(quick = false) {
    const s = /** @type {any} */ (app.state);
    if (!s || dead) return;
    const id = plotId();
    const cal = core.calendarOf(s.clock.day);
    const owned = !!s.land.plots[id]?.owned;
    const P = core.PLOTS[id];
    const fast = app.settings.speed === "fast";
    const still = app.settings.motion === false;
    if (still !== calm) {
      calm = still;
      rest();
      run();
    }

    if (!quick) {
      readHint(s, id, owned);
      vm.goalReady = goalsOf(s).some((g) => g.ready);
      const unread = s.book?.unread;
      vm.unread = Array.isArray(unread) ? unread.length : Number(unread) || 0;
      vm.only = owned ? "" : onlyHere(s, id);
      modes.update(s, id);
    }
    vm.season = cal.season;
    vm.dayWide = dayLabel(cal);
    vm.dayShort = MEADOW.dayShort(cal);
    vm.today = s.weather.today;
    vm.tomorrow = s.weather.tomorrow;
    vm.coins = s.purse.coins;
    vm.renown = s.progress.renown;
    vm.phase = s.clock.phase;
    vm.plotName = P.name;
    vm.plotIndex = plots.indexOf(id);
    vm.plots = plots.length;
    vm.owned = owned;
    vm.price = P.price;
    vm.short = Math.max(0, P.price - s.purse.coins);
    vm.blurb = P.blurb ?? "";
    vm.primary = cal.season === 3 && s.clock.phase === "morning" ? "winter" : s.clock.phase;
    vm.fast = fast;
    // Until a first day has been started, the button that starts it breathes.
    vm.cue = s.clock.phase === "morning" && !s.progress?.stats?.days && !ui().mode;
    vm.hint = hint.text;
    vm.hintKind = hint.kind;
    vm.hintIcon = hint.icon;
    bars.update(vm);

    if (shown) {
      const mode = ui().mode;
      view.selected = ui().selected;
      view.mode = mode;
      view.ghost = modes.ghost;
      view.ghostType = modes.ghostType(s, mode);
      view.motion = !still;
      view.best = shown === id && !modes.ghost ? modes.best(s, id) : null;
      view.tending = ui().sheet === "hive" && ui().selected?.kind === "hive" ? ui().selected.id : 0;
      scene.setPace(fast ? 2 : 1);
      const L = lightOf(s, owned);
      scene.setLight(L[0], L[1], L[2], L[3]);
      scene.sync(s, view);
    }

    const sound = cal.season === 3 ? "winter" : s.weather.today === "rain" ? "rain" : s.clock.phase;
    if (sound !== ambience) {
      ambience = sound;
      app.ambience(sound);
    }
  }

  /** Paint the plot asked for (if it is not the one on show) and swap it in. */
  async function ensure() {
    const s = /** @type {any} */ (app.state);
    const id = plotId();
    const key = `${id}|${core.calendarOf(s.clock.day).season}`;
    if (key === wanted) return;
    wanted = key;
    const first = !shown;
    const timer = first ? 0 : setTimeout(() => bars.veil(true), 160);
    let ticket;
    painting++;
    try {
      ticket = await scene.prepare(
        s,
        id,
        first ? (p) => /** @type {any} */ (app).progress?.(p) : undefined,
      );
    } finally {
      painting--;
      clearTimeout(timer);
    }
    if (dead || wanted !== key) return;
    bars.veil(false);
    scene.show(ticket);
    shown = id;
    render();
  }

  /** The sounds of the morning itself: waking, and rain if it is raining. */
  function greet() {
    const s = /** @type {any} */ (app.state);
    const day = s.clock.day;
    if (s.clock.phase === "morning" && day > 1 && wokeOn !== day) {
      wokeOn = day;
      app.sound("wake");
    }
    if (s.weather.today === "rain" && rainOn !== day) {
      rainOn = day;
      setTimeout(() => !dead && app.sound("rain"), 700);
    }
  }

  // ---------------------------------------------------------------- what happens out here

  function react(e, s) {
    const hiveHere = (id) => {
      const h = core.hiveById(s, id);
      return h && h.plot === shown ? h : null;
    };
    switch (e.type) {
      case "dayStarted":
        acc = 0;
        scene.dawn();
        if (e.flying !== false || core.calendarOf(s.clock.day).season !== 3) app.sound("dayStart");
        scene.mood("wave", "happy", 1.8);
        break;
      case "dayEnded":
        app.sound("dusk");
        break;
      case "planted":
        app.sound("plant");
        if (e.plot === shown) {
          scene.pop(e.x, e.y);
          scene.burst(e.x, e.y, "chestnut", 5);
          scene.walkTo(e.x, e.y);
        }
        break;
      case "dug":
        app.sound("dig");
        if (e.plot === shown) scene.burst(e.x, e.y, "chestnut", 9);
        break;
      case "picked":
        app.sound("pick");
        if (e.plot === shown) {
          scene.burst(e.x, e.y, "blush", 6);
          scene.sparkle(e.x, e.y, 3);
        }
        break;
      case "hiveUpgraded": {
        app.sound("pop");
        const h = hiveHere(e.hive);
        if (h) {
          scene.pop(h.x, h.y);
          scene.sparkle(h.x, h.y, 6);
        }
        break;
      }
      case "harvested": {
        app.sound("harvest");
        const h = hiveHere(e.hive);
        if (h) {
          scene.lift(h.x, h.y, e.flower, e.stars);
          scene.mood("carry", "happy", 2.4);
        }
        break;
      }
      case "waspsCame": {
        app.sound("wasps");
        const h = hiveHere(e.hive);
        if (h) {
          scene.shake(h.x, h.y);
          scene.mood("stand", "oops", 2.2);
        }
        break;
      }
      case "waspsFended": {
        app.sound("fend");
        const h = hiveHere(e.hive);
        if (h) {
          scene.flee(h.x, h.y);
          scene.sparkle(h.x, h.y, 3);
          scene.mood("smoker", "calm", 1.6);
        }
        break;
      }
      case "waspsRaided": {
        const h = hiveHere(e.hive);
        if (h) {
          scene.shake(h.x, h.y);
          scene.burst(h.x, h.y, "honey", 7);
        }
        app.toast(MEADOW.raided(core.hiveNumber(s, e.hive)), { sound: "nope" });
        break;
      }
      case "swarmed":
        app.sound("swarm");
        if (e.swarm?.plot === shown) scene.pop(e.swarm.x, e.swarm.y);
        break;
      case "swarmCaught":
        scene.mood("carry", "happy", 2);
        break;
      case "swarmLost":
        app.toast(MEADOW.swarmLost);
        break;
      case "grew": {
        const h = hiveHere(e.hive);
        if (h) scene.sparkle(h.x, h.y, 3);
        break;
      }
      case "queenCells":
      case "hungry": {
        const h = hiveHere(e.hive);
        if (h) scene.shake(h.x, h.y);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- taps

  function select(selected) {
    sawSheet = false;
    app.setUi({ selected });
  }

  /** Take the swarm in hand, if the core says it can be caught. */
  function catchSwarm(sw) {
    const s = /** @type {any} */ (app.state);
    const ok = core.canCatchSwarm(s, sw.id);
    if (ok === true) {
      app.sound("tap");
      app.setUi({ mode: { type: "place", what: "catch", swarm: sw.id }, selected: null });
    } else app.toast(ok === "no-spare" ? MEADOW.swarmNeedsSpare : say(ok), { sound: "nope" });
  }

  /** A tap on square (x, y) of the plot on show. */
  function tap(x, y) {
    const s = /** @type {any} */ (app.state);
    const id = shown;
    if (!id || id !== plotId() || !s.land.plots[id]?.owned) return;
    const mode = ui().mode;
    const sq = core.squareAt(s, id, x, y);
    const h = sq?.t === "hive" ? core.hiveById(s, sq.id) : null;

    // Wasps first, whatever is in hand.
    if (h?.raid) {
      scene.walkTo(x, y);
      app.dispatch({ type: "fendWasps", hive: h.id });
      return;
    }
    if (mode?.type === "place") {
      modes.tryPlace(s, id, x, y);
      render();
      return;
    }
    if (mode?.type === "plant") {
      if (rejected(app.dispatch({ type: "plant", plot: id, x, y, flower: mode.flower })))
        scene.flash(x, y, "no");
      return;
    }

    scene.walkTo(x, y);
    const sw = s.hives.swarms.find((w) => w.plot === id && w.x === x && w.y === y);
    if (sw) return catchSwarm(sw);
    if (h) {
      select({ kind: "hive", id: h.id });
      app.sheet("hive", { hive: h.id });
      return;
    }
    if (sq?.t === "bed") {
      select({ kind: "square", plot: id, x, y });
      app.sheet("bed", { plot: id, x, y });
      return;
    }
    const t = core.terrainAt(id, x, y);
    if (t === "tree" || t === "water" || t === "rock") {
      if (ui().selected) app.setUi({ selected: null });
      app.toast(MEADOW.terrain[t]);
      return;
    }
    select({ kind: "square", plot: id, x, y });
    app.sheet("seeds", { plot: id, x, y });
  }

  function turn(dir) {
    const i = plots.indexOf(plotId());
    app.setUi({ plot: plots[(i + dir + plots.length) % plots.length], selected: null });
  }

  async function buyPlot() {
    const s = /** @type {any} */ (app.state);
    const id = plotId();
    const P = core.PLOTS[id];
    if (s.land.plots[id]?.owned) return;
    const ok = core.canBuyPlot(s, id);
    if (ok !== true) {
      app.toast(
        ok === "no-coins" ? MEADOW.buy.short(Math.max(1, P.price - s.purse.coins)) : say(ok),
        { sound: "nope" },
      );
      return;
    }
    app.sound("tap");
    const yes = await app.confirm(MEADOW.buy.confirm(P.name, P.price));
    if (!yes || dead) return;
    if (rejected(app.dispatch({ type: "buyPlot", plot: id }))) return;
    app.sound("buy");
    app.toast(MEADOW.buy.done(P.name));
  }

  function startDay() {
    const s = /** @type {any} */ (app.state);
    const winter = core.calendarOf(s.clock.day).season === 3;
    if (rejected(app.dispatch({ type: "startDay" }))) return;
    if (winter) app.go("stall");
  }

  /** The hint line is in the thumb's reach: tapping it does what it says. */
  function hintTap() {
    const s = /** @type {any} */ (app.state);
    const k = hint.kind;
    if (k === "brush" || k === "place") return;
    if (k === "wasps" || k === "swarm") {
      if (hint.plot && hint.plot !== plotId()) {
        app.setUi({ plot: hint.plot, selected: null });
        return;
      }
      if (k === "wasps") {
        const h = s.hives.list.find((x) => x.raid && x.plot === plotId());
        if (h) {
          scene.walkTo(h.x, h.y);
          app.dispatch({ type: "fendWasps", hive: h.id });
        }
      } else {
        const sw = s.hives.swarms.find((w) => w.plot === plotId());
        if (sw && !ui().mode) {
          scene.walkTo(sw.x, sw.y);
          catchSwarm(sw);
        }
      }
      return;
    }
    if (k === "forsale") {
      buyPlot();
      return;
    }
    if (k === "hive" && ui().selected?.kind === "hive") {
      app.sheet("hive", { hive: ui().selected.id });
      return;
    }
    app.sheet("goals");
  }

  function act(name) {
    const s = /** @type {any} */ (app.state);
    switch (name) {
      case "calendar":
        return app.sheet("calendar");
      case "weather":
        return app.toast(
          `${MEADOW.weatherToday[s.weather.today] ?? ""} ${MEADOW.weatherTomorrow[s.weather.tomorrow] ?? ""}`.trim(),
        );
      case "renown":
        return app.sheet("goals");
      case "prev":
        return turn(-1);
      case "next":
        return turn(1);
      case "seeds":
      case "hives":
      case "workshop":
      case "book":
      case "more":
        return app.sheet(name);
      case "start":
        return startDay();
      case "stall":
        return app.go("stall");
      case "skip":
        return app.go("night");
      case "speed-normal":
        return app.setSetting("speed", "normal");
      case "speed-fast":
        return app.setSetting("speed", "fast");
      case "done":
        return app.setUi({ mode: null });
      case "cancel":
        modes.drop();
        return app.setUi({ mode: null });
      case "put":
        return modes.put();
      case "buy":
        return buyPlot();
      case "hint":
        return hintTap();
    }
  }

  offs.push(
    on(root, "click", (e) => {
      const b = /** @type {HTMLElement | null} */ (
        /** @type {Element} */ (e.target).closest?.("[data-act]")
      );
      if (!b || /** @type {any} */ (b).disabled) return;
      act(b.dataset.act);
    }),
  );

  // A tap is a click on the canvas; a sideways drag across it turns the page.
  // While the thumb is down, the square under it is ringed.
  let swipedAt = -1e9;
  let sx = 0;
  let sy = 0;
  let st = 0;
  let tracking = false;
  let onCanvas = false;
  let movedAt = 0;
  const down = (e) => {
    sx = e.clientX;
    sy = e.clientY;
    st = performance.now();
    tracking = true;
    onCanvas = e.currentTarget === bars.stage && e.target === bars.fg;
    if (onCanvas) scene.hover(sx, sy);
  };
  const move = (e) => {
    if (!tracking || !onCanvas) return;
    const now = performance.now();
    if (now - movedAt < 50) return;
    movedAt = now;
    // Once the thumb is plainly dragging sideways it is turning the page, not choosing a square.
    if (Math.abs(e.clientX - sx) > 30) scene.hover();
    else scene.hover(e.clientX, e.clientY);
  };
  const up = (e) => {
    if (!tracking) return;
    tracking = false;
    if (onCanvas) setTimeout(() => !tracking && scene.hover(), 140);
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 44 || Math.abs(dx) < 1.6 * Math.abs(dy) || performance.now() - st > 700)
      return;
    swipedAt = performance.now();
    app.sound("tap");
    turn(dx < 0 ? 1 : -1);
  };
  for (const node of [bars.stage, bars.head]) {
    offs.push(on(node, "pointerdown", down), on(node, "pointerup", up));
    offs.push(
      on(node, "pointercancel", () => {
        tracking = false;
        scene.hover();
      }),
    );
  }
  offs.push(on(bars.stage, "pointermove", move));
  offs.push(
    on(bars.fg, "click", (e) => {
      if (performance.now() - swipedAt < 350) return;
      const q = scene.squareAt(e.clientX, e.clientY);
      if (q) tap(q.x, q.y);
    }),
  );

  // ---------------------------------------------------------------- the clock and the frame

  let raf = 0;
  let timer = 0;
  let running = false;
  let lastT = 0;
  let acc = 0;
  let broken = false;
  let fps = 0;
  let ms = 0;
  let frames = 0;
  let spent = 0;
  let span = 0;
  let owed = 0;
  let gap = 0.0105;
  let drawn = 0;
  let drawFps = 0;
  let slowFor = 0;
  let soft = false;

  function step(now) {
    const dt = Math.min(calm ? 0.3 : 0.1, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    const s = /** @type {any} */ (app.state);
    if (!s || broken) return;
    if (me === newest && s.clock.phase === "day" && !ui().paused && ui().mode?.type !== "place") {
      acc += dt * core.TUNING.TICK_RATES[app.settings.speed === "fast" ? 1 : 0];
      if (acc >= 1) {
        const n = Math.floor(acc);
        acc -= n;
        app.dispatch({ type: "tick", n }, { quiet: true });
      }
    }
    // The picture is drawn at most sixty times a second, and half as often
    // on a device that cannot keep up; the clock above never waits for it.
    // With motion off nothing moves, so it is drawn only when it has changed.
    owed += dt;
    const t0 = performance.now();
    if (owed >= gap) {
      try {
        scene.frame(owed > 0.3 ? 0.3 : owed);
      } catch (err) {
        broken = true;
        console.error("[meadow] the picture stopped", err);
      }
      owed = 0;
      drawn++;
    }
    const c = /** @type {any} */ (app.state).clock;
    bars.frame(
      c.phase === "day"
        ? (c.tick + acc) / core.TUNING.TICKS_PER_DAY
        : c.phase === "evening"
          ? 1
          : 0,
      c.phase === "evening",
    );
    spent += performance.now() - t0;
    frames++;
    span += dt;
    if (span >= 0.5) {
      fps = frames / span;
      drawFps = drawn / span;
      ms = spent / Math.max(1, drawn);
      // Too slow for two seconds: first draw half as often, then, if that
      // is not enough, draw a little less finely.
      const slow = !calm && !painting && (gap < 0.02 ? fps < 42 : !soft && fps < 24);
      slowFor = slow ? slowFor + span : 0;
      if (slowFor >= 2) {
        slowFor = 0;
        if (gap < 0.02) gap = 0.03;
        else {
          soft = true;
          scene.soften();
        }
      }
      frames = spent = span = drawn = 0;
    }
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    step(now);
  }
  /** Sixty frames a second while things move; a slow beat (the clock and the sun) when they do not. */
  function run() {
    if (running || dead || document.hidden) return;
    running = true;
    lastT = performance.now();
    if (calm) timer = Number(setInterval(() => step(performance.now()), 100));
    else raf = requestAnimationFrame(loop);
  }
  function rest() {
    running = false;
    cancelAnimationFrame(raf);
    clearInterval(timer);
  }
  offs.push(on(document, "visibilitychange", () => (document.hidden ? rest() : run())));

  // ---------------------------------------------------------------- for the tests

  const tests = /** @type {any} */ (hook);
  const squareRect = (plot, x, y) =>
    plot === shown && plot === plotId() ? scene.squareRect(x, y) : null;
  tests.squareRect = squareRect;
  const probe = (tests.meadow = {
    beeCount: () => scene.beeCount(),
    beesOut: () => scene.beesOut(),
    fps: () => fps,
    drawFps: () => drawFps,
    frameMs: () => ms,
    draws: () => scene.draws(),
    plot: () => shown,
    where: () => scene.beesAt(),
    /** The square a point of the page belongs to, as a tap would take it. */
    squareAt: (x, y) => scene.squareAt(x, y),
  });

  const failed = (err) => console.error("[meadow] could not paint the plot", err);
  render();
  await ensure().catch(failed);
  greet();
  run();

  return {
    update(state, events, action) {
      if (dead) return;
      if (events) for (const e of events) react(e, state);
      if (ui().sheet) sawSheet = true;
      else if (sawSheet) {
        sawSheet = false;
        if (ui().selected?.kind === "square") {
          app.setUi({ selected: null });
          return;
        }
      }
      render(action?.type === "tick" && !(events && events.length));
      if (action?.type === "startDay" || action?.type === "@replace") greet();
      ensure().catch(failed);
    },
    unmount() {
      dead = true;
      rest();
      for (const off of offs) off();
      scene.destroy();
      bars.destroy();
      // A newer meadow may already have taken these over.
      if (tests.squareRect === squareRect) tests.squareRect = null;
      if (tests.meadow === probe) tests.meadow = null;
    },
  };
}
