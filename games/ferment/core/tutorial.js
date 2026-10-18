// @ts-check
/**
 * Onboarding: the intro scene's place in the game, and the first days'
 * moments (content/tutorial.js), one at a time.
 *
 * state.tutorial = { on, intro, now, done, tries }:
 *   on     tips are running (false in a game started without them, or skipped)
 *   intro  the intro scene is still to be seen (ui/intro.js shows it)
 *   now    the moment showing: { id, beat, who?, name?, slot? }, or null
 *   done   moments finished; tries: moment id → times it passed unfinished
 *   script how many of day 1's scripted customers have walked in
 *
 * Day 1's first walk-ins are scripted (content/tutorial.js SCRIPT), each
 * set up from the shelf as it stands so it shows one basic case: a jar
 * that fits now, a pre-order that a jar already on the shelf will suit,
 * and a pre-order only a new jar can. Past them, and in any game with the
 * notes off, nothing here changes the game: notes only read it.
 * learn() runs after every accepted
 * action (step.js): it moves the open moment on when one of its beat's
 * events happened, drops it when the moment has passed (it comes back
 * later, MAX_TRIES at most), and otherwise opens the first moment whose
 * time has come.
 *
 * Action { type: "tutorial", do }:
 *   begin   the intro scene is over (seen or skipped); the tips start
 *   next    the open beat is read, or its screen-only step happened (`id` must match)
 *   skip    no more tips
 *   replay  everything again from the intro (the settings screen offers it)
 * Events: tip { id } when a moment opens, tipDone { id } when it finishes.
 */

import { MOMENTS, MOMENT_IDS, MAX_TRIES, SCRIPT } from "../content/tutorial.js";
import { RECIPES } from "../content/recipes.js";
import { PATIENCE, WINDOW } from "../content/tuning.js";
import { clamp, nextId } from "./util.js";
import { flavour, forecast, isOver } from "./jars.js";
import { dueFor, freePortions } from "./orders.js";
import { menu } from "./bench.js";

/** @typedef {import("./types.js").State} State */
/** @typedef {import("./types.js").TutorialSlice} TutorialSlice */

/** @returns {TutorialSlice} */
export function freshTutorial(on = false) {
  return { on, intro: on, now: null, done: [], tries: {}, script: 0 };
}

/** @typedef {import("./types.js").Jar} Jar */

/** Where a jar on the shelf will be `dt` hours from now. */
const fAfter = (/** @type {Jar} */ j, /** @type {number} */ dt) =>
  isOver(j) ? 1 : forecast(j.recipe, j.age + dt, j.adds ?? [], j.pace ?? 1);

/** Hours from now until an order's pickup. */
const hoursTo = (/** @type {State} */ s, /** @type {{ due: number, arriveAt: number }} */ d) =>
  (d.due - s.clock.day) * 24 + d.arriveAt - s.clock.hour;

const windowAt = (/** @type {number} */ mid) => ({
  lo: clamp(mid - WINDOW / 2, 0, 1),
  hi: clamp(mid + WINDOW / 2, 0, 1),
});
const inside = (/** @type {number} */ f, /** @type {{ lo: number, hi: number }} */ w) =>
  f >= w.lo && f <= w.hi;

/**
 * The wish of a scripted customer, from the shelf as it stands, or null when
 * the shelf can't show their case.
 *   serve  a jar on the shelf, just as it is now
 *   keep   riper than any jar now, but the one started last will be just right by pickup
 *   fresh  no jar on the shelf will suit by pickup; a new one started now will
 * @returns {{ recipe: string, lo: number, hi: number } | null}
 */
function wishFor(/** @type {State} */ s, /** @type {string} */ as) {
  const jars = /** @type {Jar[]} */ (s.shelf.slots.filter((j) => j && !isOver(j)));
  const free = jars.filter((j) => freePortions(s, j) >= 1);
  if (as === "serve") {
    // The oldest jar: the keeper's, ripe today. A little ahead of it, so it fits while they wait.
    const j = [...free].sort((a, b) => fAfter(b, 0) - fAfter(a, 0))[0];
    if (!j) return null;
    return { recipe: j.recipe, ...windowAt(fAfter(j, PATIENCE / 3)) };
  }
  if (as === "keep") {
    // The youngest jar, a day or two on (the pickup time settles in a few rounds),
    // wanting it riper than any jar of its kind is now.
    const j = [...free].sort((a, b) => a.age - b.age)[0];
    if (!j) return null;
    const due = (/** @type {number} */ mid) => dueFor(s, { recipe: j.recipe, ...windowAt(mid) });
    for (const days of [1, 2]) {
      let mid = fAfter(j, 24 * days);
      for (let k = 0; k < 4; k++) mid = fAfter(j, hoursTo(s, due(mid)));
      const w = windowAt(mid);
      if (mid >= 0.95 || !inside(fAfter(j, hoursTo(s, due(mid))), w)) continue;
      if (jars.some((x) => x.recipe === j.recipe && inside(fAfter(x, 0), w))) continue;
      return { recipe: j.recipe, ...w };
    }
    return null;
  }
  if (as === "fresh") {
    // Of the wishes no shelf jar will meet, the one a jar started now meets most squarely.
    if (!s.shelf.slots.some((j) => !j)) return null;
    let best = null;
    let miss = Infinity;
    for (const recipe of menu(s).filter((id) => !RECIPES[id].base)) {
      if (RECIPES[recipe].cost > s.shop.coins) continue;
      const [a, b] = RECIPES[recipe].sweet;
      for (const mid of [(a + b) / 2, b, a]) {
        const w = windowAt(mid);
        const dt = hoursTo(s, dueFor(s, { recipe, ...w }));
        const off = Math.abs(forecast(recipe, dt) - mid);
        if (off >= miss || !inside(forecast(recipe, dt), w)) continue;
        const mine = jars.filter((j) => j.recipe === recipe);
        if (mine.some((j) => inside(fAfter(j, dt), w) || inside(fAfter(j, 0), w))) continue;
        ((best = { recipe, ...w }), (miss = off));
      }
    }
    return best;
  }
  return null;
}

/**
 * The next of day 1's scripted customers, or null (a random walk-in comes
 * instead). Called by walkIns (customers.js) before it makes a walk-in; a
 * case the shelf can't show is passed over.
 * @returns {import("./types.js").Customer | null}
 */
export function scriptedWalkIn(/** @type {State} */ s) {
  const t = s.tutorial;
  if (!t.on || s.clock.day !== 1) return null;
  while (t.script < SCRIPT.length) {
    const who = SCRIPT[t.script++];
    const wish = wishFor(s, who.as);
    if (wish)
      return {
        id: nextId(s),
        name: who.name,
        look: who.look,
        ...wish,
        patience: PATIENCE,
        script: who.as,
      };
  }
  return null;
}

/** Can the customer at the counter be served from some jar on the shelf? */
function servable(/** @type {State} */ s) {
  const c = s.customers.queue[0];
  return s.shelf.slots.some(
    (j) => j && j.recipe === c.recipe && !isOver(j) && freePortions(s, j, c.orderId) >= 1,
  );
}

const front = (/** @type {State} */ s) =>
  s.clock.phase === "open" ? (s.customers.queue[0] ?? null) : null;

/**
 * When each moment opens (`when`), how long it stays open (`keep`, given
 * the beat it is on), and `jump`: the beat to skip to (or "done") when the
 * player got ahead of the notes. A moment with no customer of its own keeps
 * while the phase it belongs to lasts.
 * @typedef {NonNullable<TutorialSlice["now"]>} Now
 * @typedef {import("./types.js").GameEvent} GameEvent
 * @type {Record<string, {
 *   when: (s: State) => boolean,
 *   keep: (s: State, now: Now) => boolean,
 *   jump?: (now: Now, events: GameEvent[]) => number | "done" | null
 * }>}
 */
const RULES = {
  gift: {
    when: (s) => s.clock.day === 1 && s.clock.phase === "morning",
    keep: (s) => s.clock.phase === "morning",
  },
  brew: {
    when: (s) =>
      s.clock.phase === "morning" &&
      s.shelf.slots.some((j) => !j) &&
      Object.values(RECIPES).some((r) => !r.base && !r.tier && r.cost <= s.shop.coins),
    keep: (s) => s.clock.phase === "morning",
    jump: (now, events) =>
      now.beat >= 2 && events.some((e) => e.type === "opened") ? "done" : null,
  },
  serve: {
    when: (s) => {
      const c = front(s);
      return !!c && !c.orderId && !c.regular && (!c.script || c.script === "serve") && servable(s);
    },
    keep: (s, now) => now.beat >= 3 || front(s)?.id === now.who,
    jump: (now, events) =>
      events.some((e) => e.type === "served" && e.customer.id === now.who) ? 3 : null,
  },
  keep: {
    when: (s) => front(s)?.script === "keep",
    keep: (s, now) => now.beat >= 2 || front(s)?.id === now.who,
    jump: (now, events) => jumpTo(now, events, "held"),
  },
  fresh: {
    when: (s) => front(s)?.script === "fresh",
    keep: (s, now) => now.beat >= 2 || front(s)?.id === now.who,
    jump: (now, events) => jumpTo(now, events, "startedForOrder"),
  },
  regular: {
    when: (s) => {
      const c = front(s);
      return !!c && !!c.regular && !c.orderId;
    },
    keep: (s, now) => now.beat >= 2 || front(s)?.id === now.who,
    jump: (now, events) =>
      events.some(
        (e) => (e.type === "served" || e.type === "preordered") && e.customer.id === now.who,
      )
        ? 2
        : null,
  },
  market: {
    when: (s) => s.clock.phase === "evening",
    keep: (s) => s.clock.phase === "evening",
  },
  bench: {
    when: (s) => s.clock.phase === "evening" && s.clock.day >= 2,
    keep: (s) => s.clock.phase === "evening",
  },
  tier: {
    when: (s) => s.progress.tier >= 1,
    keep: () => true,
  },
};

/**
 * A pre-order moment the player got ahead of: past the pre-order once it is
 * booked, to the last note once its jar is set (`done`: held or started).
 */
function jumpTo(
  /** @type {Now} */ now,
  /** @type {GameEvent[]} */ events,
  /** @type {string} */ done,
) {
  if (now.order !== undefined && events.some((e) => e.type === done && e.order.id === now.order))
    return 4;
  if (events.some((e) => e.type === "preordered" && e.customer.id === now.who)) return 2;
  return null;
}

/** Open the first moment whose time has come, if none is open. */
function openNext(/** @type {State} */ s, events) {
  const t = s.tutorial;
  if (!t.on || t.intro || t.now) return;
  for (const id of MOMENT_IDS) {
    if (t.done.includes(id) || !RULES[id].when(s)) continue;
    /** @type {TutorialSlice["now"]} */
    const now = { id, beat: 0 };
    const c = front(s);
    if (c && ["serve", "regular", "keep", "fresh"].includes(id))
      ((now.who = c.id), (now.name = c.name));
    t.now = now;
    events.push({ type: "tip", id });
    return;
  }
}

/** Move the open moment to its next beat, finishing it after the last. */
function advance(/** @type {State} */ s, events) {
  const t = s.tutorial;
  const now = /** @type {NonNullable<TutorialSlice["now"]>} */ (t.now);
  if (now.beat + 1 < MOMENTS[now.id].beats.length) {
    now.beat++;
    return;
  }
  t.done.push(now.id);
  t.now = null;
  events.push({ type: "tipDone", id: now.id });
}

/**
 * Runs after every accepted action (step.js), with that action's events.
 * @param {State} _before
 * @param {State} s
 * @param {import("./types.js").GameEvent[]} events
 */
export function learn(_before, s, events) {
  const t = s.tutorial;
  if (!t.on || t.intro) return;
  if (t.now) {
    const now = t.now;
    const beat = MOMENTS[now.id].beats[now.beat];
    for (const e of events) {
      if (e.type === "brewed" || e.type === "held") now.slot = e.slot;
      if (e.type === "preordered" && e.customer.id === now.who) now.order = e.order.id;
    }
    const to = RULES[now.id].jump?.(now, events) ?? null;
    if (beat.on && events.some((e) => beat.on?.includes(e.type))) {
      advance(s, events);
    } else if (to === "done") {
      now.beat = MOMENTS[now.id].beats.length - 1;
      advance(s, events);
    } else if (to !== null && to > now.beat) {
      now.beat = to;
    } else if (!RULES[now.id].keep(s, now)) {
      t.tries[now.id] = (t.tries[now.id] ?? 0) + 1;
      if (t.tries[now.id] >= MAX_TRIES) t.done.push(now.id);
      t.now = null;
    }
  }
  openNext(s, events);
}

/** { type: "tutorial", do: "begin" | "next" | "skip" | "replay", id? } */
export function tutorial(s, action, events) {
  const t = s.tutorial;
  const what = action.do;
  if (what === "replay") {
    s.tutorial = freshTutorial(true);
    events.push({ type: "tutorialReplayed" });
    return;
  }
  if (what === "skip") {
    if (!t.on) return "tips are off";
    t.on = false;
    t.intro = false;
    t.now = null;
    events.push({ type: "tutorialSkipped" });
    return;
  }
  if (what === "begin") {
    if (!t.intro) return "no intro to finish";
    t.intro = false;
    return; // learn() opens the first moment
  }
  if (what === "next") {
    if (!t.now) return "no tip showing";
    if (action.id !== t.now.id) return "a different tip is showing";
    if (MOMENTS[t.now.id].beats[t.now.beat].on) return "waiting for the shop";
    advance(s, events);
    return;
  }
  return "no such tutorial step";
}

/** The note showing now, for the screen: the moment, its beat and that beat's words. */
export function tipNow(/** @type {State} */ s) {
  const t = s.tutorial;
  if (!t.on || t.intro || !t.now) return null;
  const beat = MOMENTS[t.now.id].beats[t.now.beat];
  return { ...t.now, ...beat, info: !beat.on && !beat.ui };
}
