// Positions for the flows, made by letting the balance sim's "sensible" bot
// play a real game through core.step() in Node. Nothing here is hand-built:
// each position is a state the game itself reached, taken just before the
// bot's next action, so a flow can seed it through `__hollow.state` instead
// of playing forty days to get there.
import * as C from "../../../games/honey-hollow/core/index.js";
import { makeBot, keeperFor } from "../sim/bots.mjs";

export { C, keeperFor };
const cal = (s) => C.calendarOf(s.clock.day);
const clone = (s) => JSON.parse(JSON.stringify(s));
const pure = (s) => C.shelf(s).filter((i) => i.info.pure);
const morningOf = (season) => (s, a) =>
  a.type === "startDay" && cal(s).season === season && cal(s).dayOfSeason >= 3;

/** name → (state, the bot's next action) → is this the position? First hit wins. */
const WANT = {
  // Mornings, one for each season, a few days in so the season has settled.
  spring: morningOf(0),
  summer: morningOf(1),
  autumn: morningOf(2),
  winter: morningOf(3),
  // A summer morning with two hives and beds: the meadow flow's starting point.
  meadow: (s, a) =>
    a.type === "startDay" &&
    cal(s).season === 1 &&
    s.hives.list.length >= 2 &&
    !s.land.plots.pond.owned &&
    s.hives.list.filter((h) => h.plot === "home").length < 4,
  // A goal met and not claimed, a bee book page not read, the bees not out.
  news: (s, a) =>
    a.type === "claimGoal" &&
    s.book.unread.length > 0 &&
    s.clock.phase !== "day" &&
    s.clock.day >= 8 &&
    s.hives.list.length >= 2,
  // A summer morning of fair weather: the bees will fly.
  flying: (s, a) => morningOf(1)(s, a) && ["sunny", "cloudy"].includes(s.weather.today),
  // Honey Show evening with pure honey to enter.
  show: (s, a) =>
    a.type === "enterShow" && !!s.market.show && !s.market.show.entered && pure(s).length >= 1,
  // The Winter Fair, before the stall opens.
  fair: (s, a) => a.type === "openStall" && s.market.fair && C.shelf(s).length >= 1,
  // The last night of the year.
  lastNight: (s, a) => a.type === "sleep" && cal(s).doy === 27,
  // The first morning of year 2, the year page not yet seen.
  newYear: (s) => s.clock.day === 29 && s.clock.phase === "morning" && !!C.yearDue(s),
};

/** One game of `seed`, stopped at each position in WANT. Throws if the game never reaches one. */
function play(seed) {
  const out = /** @type {Record<string, any>} */ ({});
  const bot = makeBot("sensible", seed);
  let s = C.newGame(seed);
  const left = new Set(Object.keys(WANT));
  for (let guard = 0; left.size && s.clock.day <= 30 && guard < 200000; guard++) {
    const a = bot(s);
    if (s.keeper.made)
      for (const name of [...left])
        if (WANT[name](s, a)) {
          out[name] = s;
          left.delete(name);
        }
    const r = C.step(s, a);
    if (r.events[0]?.type === "rejected")
      throw new Error(`the bot was refused: ${JSON.stringify(a)} ${r.events[0].why}`);
    s = r.state;
  }
  if (left.size) throw new Error(`seed ${seed} never reaches: ${[...left].join(", ")}`);
  return out;
}

/** @type {Record<string, any> | null} */
let made = null;

/**
 * Every position in WANT, from the first seed whose game reaches them all
 * (played once, then remembered). The rules are still being tuned: when one
 * seed's game stops passing through a position, the next seed's may.
 */
export function positions() {
  let why = null;
  for (let seed = 1; !made && seed <= 8; seed++) {
    try {
      made = play(seed);
    } catch (e) {
      why = e;
    }
  }
  if (!made) throw why;
  return clone(made);
}

/** A beekeeper made, the morning of day 1, nothing else done. */
export function dayOne(seed = 7, name = "Sari") {
  return C.step(C.newGame(seed), { type: "createKeeper", keeper: keeperFor(seed, name) }).state;
}

if (process.argv[1] === new URL(import.meta.url).pathname)
  for (const [k, s] of Object.entries(positions()))
    console.log(
      k.padEnd(10),
      "seed",
      s.meta.seed,
      "day",
      String(s.clock.day).padStart(2),
      s.clock.phase,
      s.weather.today,
      "coins",
      s.purse.coins,
      "hives",
      s.hives.list.length,
      "shelf",
      C.shelf(s).length,
    );
