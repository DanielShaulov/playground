// Shared helpers for the Honey Hollow core tests. No tests in here.
//
// Tests set up a position by editing a copy of a real state (edit()), then
// change it only through step() (ok() / no()), and read it through the core's
// own helpers. ok() freezes the state it passes in, so every test also proves
// that step() never writes to its input.
import assert from "node:assert/strict";
import * as C from "../../../games/honey-hollow/core/index.js";

export { C };
export const T = C.TUNING;
export const W = T.PLOT_W;
export const DAY = T.TICKS_PER_DAY;

export const LOOK = {
  name: "Tess",
  body: "woman",
  skin: "s2",
  hair: "braid",
  hairColor: "h3",
  overalls: "o1",
  shirt: "t1",
  hat: "straw",
};

export function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** step() that must be accepted. Returns { state, events }. */
export function ok(state, action) {
  const r = C.step(deepFreeze(state), action);
  if (r.events[0]?.type === "rejected")
    assert.fail(
      `${JSON.stringify(action)} was refused: ${r.events[0].why} (day ${state.clock.day}, ${state.clock.phase})`,
    );
  assert.notEqual(r.state, state, "an accepted action returns a new state");
  return r;
}

/** step() that must be refused with `why`, handing back the very same state object. */
export function no(state, action, why) {
  const r = C.step(deepFreeze(state), action);
  assert.equal(
    r.events[0]?.type,
    "rejected",
    `${JSON.stringify(action)} should be refused (${why})`,
  );
  assert.equal(r.events[0].why, why);
  assert.equal(r.events.length, 1);
  assert.equal(r.state, state, "a refused action returns the same state object");
  return r;
}

/** Several accepted actions in a row. Returns the last state and every event. */
export function run(state, ...actions) {
  const events = [];
  for (const a of actions) {
    const r = ok(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** A copy of `state` for a test to arrange: fn(copy) may write anywhere. */
export function edit(state, fn) {
  const s = structuredClone(state);
  fn(s);
  return s;
}

/** A new game with the keeper made. */
export function fresh(seed = 1, talent = "selling") {
  return ok(C.newGame(seed), { type: "createKeeper", keeper: { ...LOOK, talent } }).state;
}

export const hive = (s, id = s.hives.list[0].id) => C.hiveById(s, id);
export const of = (events, type) => events.filter((e) => e.type === type);
export const one = (events, type) => {
  const list = of(events, type);
  assert.equal(
    list.length,
    1,
    `expected one ${type} event, saw ${list.length} in ${events.map((e) => e.type).join(",")}`,
  );
  return list[0];
};

// ---- arranging a position (inside edit()) -----------------------------------

export const sq = (s, plot, x, y) => s.land.plots[plot].squares[y * W + x];

/** Put a bed on a square, as if planted long ago. */
export function bed(s, plot, x, y, flower, planted = 0) {
  s.land.plots[plot].owned = true;
  s.land.plots[plot].squares[y * W + x] = { t: "bed", flower, planted, picked: 0 };
}

/** Clear every bed from a plot (hives stay). */
export function clearBeds(s, plot = "home") {
  const squares = s.land.plots[plot].squares;
  for (let i = 0; i < squares.length; i++) if (squares[i]?.t === "bed") squares[i] = null;
}

/** Stand another hive on a square. `over` sets any hive field. Returns the hive. */
export function addHive(s, plot, x, y, over = {}) {
  const h = {
    ...structuredClone(s.hives.list[0]),
    stores: {},
    mites: 0,
    sick: 0,
    grow: 0,
    swarmCells: false,
    moved: 0,
    from: null,
    dusted: 0,
    hungry: false,
    raid: null,
    harvested: 0,
    swarmYear: 0,
    today: { got: 0, lost: 0, by: {}, raided: 0 },
    type: "skep",
    strength: T.NEW_HIVE_STRENGTH,
    ...over,
    id: s.meta.nextId++,
    plot,
    x,
    y,
  };
  s.land.plots[plot].owned = true;
  s.land.plots[plot].squares[y * W + x] = { t: "hive", id: h.id };
  s.hives.list.push(h);
  return h;
}

/** Move the calendar to the morning of `day` without playing the days between. */
export function setDay(s, day, weather = "sunny") {
  s.clock = { day, phase: "morning", tick: 0 };
  s.weather = { today: weather, tomorrow: weather };
  s.plan = { day: 0, hives: {}, wasps: null };
}

/** The first day, on or after `from`, that falls on day-of-year `doy` (0–27). */
export const dayOn = (doy, year = 1) => (year - 1) * T.YEAR_DAYS + doy + 1;

// ---- playing ----------------------------------------------------------------

/** From the morning: fly the whole day. Ends in the evening. */
export function flyDay(state) {
  let r = ok(state, { type: "startDay" });
  const events = [...r.events];
  while (r.state.clock.phase === "day") {
    for (const h of r.state.hives.list)
      if (h.raid) r = keep(events, ok(r.state, { type: "fendWasps", hive: h.id }));
    r = keep(events, ok(r.state, { type: "tick", n: DAY }));
  }
  return { state: r.state, events };
}
const keep = (events, r) => {
  events.push(...r.events);
  return r;
};

/** From the morning or evening: to the next morning, doing nothing else. */
export function nextMorning(state) {
  const events = [];
  let s = state;
  if (s.clock.phase !== "evening") s = keep(events, flyDay(s)).state;
  const due = C.yearDue(s);
  if (due) s = keep(events, ok(s, { type: "seenYear", year: due.year })).state;
  s = keep(events, ok(s, { type: "sleep" })).state;
  return { state: s, events };
}

/** Idle days until the morning of `day`. */
export function idleTo(state, day) {
  const events = [];
  let s = state;
  while (s.clock.day < day) s = keep(events, nextMorning(s)).state;
  return { state: s, events };
}

// ---- positions several test files want ---------------------------------------

/** The same state with sunshine today and tomorrow, so a test's numbers do not hang on the weather drawn. */
export const sunny = (state) =>
  edit(state, (s) => (s.weather = { today: "sunny", tomorrow: "sunny" }));

/** The morning of a summer day in swarm season: the first colony as strong as its skep allows, honey in the comb. */
export const crowded = (doy = 8, over = {}) =>
  edit(fresh(), (s) => {
    setDay(s, dayOn(doy));
    Object.assign(hive(s), { strength: 4, stores: { clover: 30 }, ...over });
  });

/** A day already started on which wasps are coming for the first (weak) hive: found by trying seeds. */
export function waspDay() {
  for (let seed = 1; seed < 200; seed++) {
    const morning = edit(fresh(seed), (s) => {
      setDay(s, dayOn(12));
      clearBeds(s);
      Object.assign(hive(s), { strength: 2, stores: { clover: 20 } });
    });
    const day = ok(morning, { type: "startDay" }).state;
    if (day.plan.wasps) return day;
  }
  throw new Error("no seed sent wasps");
}

/**
 * An evening with the stall open and exactly these customers waiting, each
 * given as { type, value?, qty?, who? }, and `stock` on the shelf
 * ({ "clover:1": 3 } is honey, { candle: 2 } a good).
 */
export function atStall(state, wishes, stock = {}) {
  const evening = state.clock.phase === "evening" ? state : flyDay(state).state;
  return edit(evening, (s) => {
    s.market.open = true;
    s.market.at = 0;
    s.market.queue = wishes.map((w, i) => ({
      id: 9000 + i,
      who: w.who ?? null,
      look: 1,
      wish: { type: w.type, ...(w.value === undefined ? {} : { value: w.value }), qty: w.qty ?? 1 },
      bought: null,
    }));
    for (const [k, n] of Object.entries(stock))
      (k.includes(":") ? s.stock.honey : s.stock.goods)[k] = n;
  });
}

/** What step() itself says to a dry run: true, or the `why` it refuses with. */
export function dry(s, action) {
  const e = C.step(s, action).events[0];
  return e?.type === "rejected" ? e.why : true;
}

/** A square to try a hive on: one that would take it, else one on a full plot, else a taken one. */
function trySquare(s, moving = 0) {
  let full = null;
  let taken = null;
  const me = C.hiveById(s, moving);
  for (const plot of C.PLOT_IDS)
    for (let i = 0; i < W * T.PLOT_H; i++) {
      const at = { plot, x: i % W, y: Math.floor(i / W) };
      const okay = C.canPlaceHive(s, plot, at.x, at.y, moving);
      if (okay === true) return at;
      if (okay === "plot-full") full ??= at;
      if (okay === "square-taken" && !(me && me.plot === plot && me.x === at.x && me.y === at.y))
        taken ??= at;
    }
  return full ?? taken;
}

/** careOf(), worked out the long way: a dry run of step() for each kind of care. */
export function careByStep(s, id) {
  return {
    harvest: dry(s, { type: "harvest", hive: id, jars: 1 }),
    feed: dry(s, { type: "feed", hive: id, n: 1 }),
    dust: dry(s, { type: "dust", hive: id }),
    remedy: dry(s, { type: "remedy", hive: id }),
    upgrade: dry(s, { type: "upgradeHive", hive: id }),
    split: dry(s, { type: "split", hive: id, ...trySquare(s) }),
    move: dry(s, { type: "moveHive", hive: id, ...trySquare(s, id) }),
    fendWasps: dry(s, { type: "fendWasps", hive: id }),
  };
}

/** What step() says to buying a hive, and to catching a swarm, on the likeliest square. */
export const buyByStep = (s) => dry(s, { type: "buyHive", ...trySquare(s) });
export const catchByStep = (s, swarm) => dry(s, { type: "catchSwarm", swarm, ...trySquare(s) });

/**
 * Play `bot` (state → action) from a new game until `days` days are done.
 * Every action must be accepted. Returns the last state, every event and the
 * action list (which, with the seed, replays the whole game).
 */
export function playOut(bot, seed, days) {
  let state = C.newGame(seed);
  const events = [];
  const actions = [];
  while (state.clock.day <= days) {
    const action = bot(state);
    const r = C.step(state, action);
    if (r.events[0]?.type === "rejected")
      assert.fail(
        `the bot's ${JSON.stringify(action)} was refused: ${r.events[0].why} (day ${state.clock.day})`,
      );
    actions.push(action);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events, actions };
}

/** A small seeded random source for the tests themselves (never the game's). */
export function rngOf(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.below = (n) => Math.floor(next() * n);
  next.pick = (list) => list[next.below(list.length)];
  return next;
}

// ---- what must always be true ------------------------------------------------

const EPS = 1e-6;

/** Throws unless `s` is a state the game could show: the invariants the fuzzer holds every step. */
export function invariants(s) {
  // Nothing is NaN, infinite or undefined anywhere.
  (function walk(v, path) {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${path} is ${v}`);
    else if (v === undefined) assert.fail(`${path} is undefined`);
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  })(s, "state");

  assert.ok(Number.isInteger(s.purse.coins) && s.purse.coins >= 0, `coins ${s.purse.coins}`);
  for (const key of ["honey", "bunches", "goods", "seeds"])
    for (const [k, n] of Object.entries(s.stock[key]))
      assert.ok(Number.isInteger(n) && n >= 0, `stock.${key}.${k} = ${n}`);
  for (const key of ["wax", "waxBits", "remedy", "syrup"])
    assert.ok(
      Number.isInteger(s.stock[key]) && s.stock[key] >= 0,
      `stock.${key} = ${s.stock[key]}`,
    );
  assert.ok(Number.isInteger(s.hives.spare) && s.hives.spare >= 0, `spare hives ${s.hives.spare}`);

  assert.ok(["morning", "day", "evening"].includes(s.clock.phase));
  assert.ok(Number.isInteger(s.clock.day) && s.clock.day >= 1);
  assert.ok(Number.isInteger(s.clock.tick) && s.clock.tick >= 0 && s.clock.tick <= DAY);
  if (s.clock.phase === "day") assert.ok(s.clock.tick < DAY, "a finished day is the evening");

  // Land: a square holds one thing, hives and squares agree, nothing on land not owned.
  const seen = new Set();
  assert.ok(s.land.plots.home.owned);
  for (const plot of C.PLOT_IDS) {
    const p = s.land.plots[plot];
    assert.equal(p.squares.length, W * T.PLOT_H);
    let hives = 0;
    p.squares.forEach((q, i) => {
      if (!q) return;
      const x = i % W;
      const y = Math.floor(i / W);
      assert.ok(p.owned, `something on ${plot}, which is not owned`);
      const ground = C.terrainAt(plot, x, y);
      if (q.t === "hive") {
        hives++;
        const h = C.hiveById(s, q.id);
        assert.ok(
          h && h.plot === plot && h.x === x && h.y === y,
          `square ${plot} ${x},${y} names hive ${q.id}, which is not there`,
        );
        assert.ok(!seen.has(q.id), `hive ${q.id} stands on two squares`);
        seen.add(q.id);
        assert.ok(ground === "grass" || ground === "hill", `hive on ${ground}`);
      } else {
        assert.equal(q.t, "bed");
        assert.ok(Object.hasOwn(C.FLOWERS, q.flower), `bed of ${q.flower}`);
        assert.ok(ground === "grass" || ground === "hill", `bed on ${ground}`);
      }
    });
    assert.ok(hives <= T.HIVES_PER_PLOT, `${hives} hives on ${plot}`);
  }
  assert.ok(s.hives.list.length >= 1, "there is always a hive");
  assert.equal(seen.size, s.hives.list.length, "every hive stands on its own square");

  for (const h of s.hives.list) {
    assert.ok(
      Number.isInteger(h.strength) && h.strength >= 1 && h.strength <= C.limitOf(h),
      `hive ${h.id} (${h.type}) strength ${h.strength}`,
    );
    let total = 0;
    for (const [k, v] of Object.entries(h.stores)) {
      assert.ok(v >= 0, `hive ${h.id} stores.${k} = ${v}`);
      total += v;
    }
    assert.ok(total <= C.capacityOf(h) + EPS, `hive ${h.id} holds ${total} of ${C.capacityOf(h)}`);
    assert.ok(h.mites >= 0 && h.mites <= 100, `hive ${h.id} mites ${h.mites}`);
    assert.ok(
      h.today.got >= -EPS && h.today.lost >= -EPS && h.today.raided >= 0,
      `hive ${h.id} today ${JSON.stringify(h.today)}`,
    );
    assert.ok(
      Number.isInteger(h.swarmYear) &&
        h.swarmYear >= 0 &&
        h.swarmYear <= C.calendarOf(s.clock.day).year,
      `hive ${h.id} swarmYear ${h.swarmYear}`,
    );
    assert.ok(
      Number.isInteger(h.harvested) && h.harvested >= 0 && h.harvested <= s.clock.day,
      `hive ${h.id} harvested ${h.harvested}`,
    );
    assert.ok(
      !h.raid || s.clock.phase === "day",
      `hive ${h.id} has wasps at the door in the ${s.clock.phase}`,
    );
  }
  for (const [k, n] of Object.entries(s.progress.today))
    assert.ok(Number.isInteger(n) && n >= 0, `progress.today.${k} = ${n}`);
  for (const sw of s.hives.swarms) assert.ok(sw.strength >= 1 && s.land.plots[sw.plot].owned);

  assert.ok(s.market.at >= 0 && s.market.at <= s.market.queue.length);
  for (const g of Object.values(s.market.glut)) assert.ok(g >= 0);
  assert.ok(s.progress.renown >= 0);
  assert.equal(
    s.progress.tier,
    C.TIERS.filter((t) => s.progress.renown >= t.renown).length - 1,
    "tier follows renown",
  );
  assert.equal(
    new Set(s.progress.claimed).size,
    s.progress.claimed.length,
    "a goal is claimed once",
  );
  assert.equal(new Set(s.book.facts).size, s.book.facts.length, "a fact is found once");
  for (const id of s.book.unread) assert.ok(s.book.facts.includes(id));
  if (s.keeper.made) assert.ok(Object.hasOwn(C.TALENTS, s.keeper.talent));
}

/** The state survives a save: through JSON and back through loadSave unchanged. */
export function roundTrips(s) {
  const json = JSON.stringify(s);
  assert.deepEqual(JSON.parse(json), s, "the state is plain JSON");
  assert.deepEqual(C.loadSave(JSON.parse(json)), s, "loadSave gives back what was saved");
}
