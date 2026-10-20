// Ferment balance sim: the careful, careless and idle bots (bots.mjs) each
// play DAYS in-game days from several seeds through step() only. Prints a
// report (coins, reputation, orders kept and missed, goals, upgrades, by day)
// and checks the bands below.
//
// The bands are a soft check (Hadash, 12 Oct 2026): a broken band or a bot
// that can't play is reported, never a failed build, so every PR still
// gets a playtest build. Each problem prints a GitHub `::warning`, which
// shows on the PR's checks; pass --strict to exit 1 instead.
//
//   npm run test:ferment:sim            report + bands
//   SIM_SEEDS=20 npm run test:ferment:sim
//   node tests/ferment/sim/run.mjs --strict
//
// On CI the report also goes to the job summary ($GITHUB_STEP_SUMMARY).
import { appendFileSync } from "node:fs";
import * as C from "../../../games/ferment/core/index.js";
import { RECIPES } from "../../../games/ferment/content/recipes.js";
import { TIERS } from "../../../games/ferment/content/goals.js";
import { BOTS } from "./bots.mjs";

const DAYS = 30;
/** Days the careful bot plays after the idle bot's 30, to show the shop can recover. */
const RECOVER_DAYS = 10;
/**
 * Bots play the player's real start (the old keeper's two parting jars, day 1's
 * scripted customers), not the fuller test shelf the goldens use.
 * SIM_START=shelf plays that one instead.
 */
const START = { tutorial: process.env.SIM_START !== "shelf" };
const SEEDS = Array.from({ length: Number(process.env.SIM_SEEDS ?? 8) }, (_, i) => i + 1);

/**
 * The bands CI holds the game to. Each is checked on every seed.
 * - careful takes in at least CAREFUL_X times what careless does (takings,
 *   not coins at the end, since careful spends thousands on upgrades);
 * - careful reaches each tier inside its TIER_DAYS window: not before the
 *   first day (too easy), not after the second (too hard);
 * - careful buys its last upgrade no sooner than LAST_UPGRADE (coins have
 *   something to go on for most of the month);
 * - careful misses at most MISS_SHARE of the orders it takes;
 * - nobody soft-locks: every morning the shelf has a jar to sell or the
 *   coins for the cheapest jar, and after 30 idle days the careful bot
 *   is back above its starting reputation and coins within RECOVER_DAYS.
 */
export const BANDS = {
  CAREFUL_X: 2,
  TIER_DAYS: { 1: [2, 6], 2: [4, 10], 3: [6, 15], 4: [10, 22], 5: [15, 30] },
  LAST_UPGRADE: 20,
  MISS_SHARE: 0.1,
};

const CHEAPEST = Math.min(
  ...Object.values(RECIPES)
    .filter((r) => !r.base && !r.tier)
    .map((r) => r.cost),
);

/** Play `bot` from `start` until `days` more days have been slept through, logging each day. */
function play(bot, start, days) {
  let s = start;
  const last = s.clock.day + days - 1;
  const log = [];
  let day = blankDay(s);
  let softLocked = null;
  for (let guard = 0; s.clock.day <= last; guard++) {
    if (guard > 400000) throw new Error(`${bot} bot stuck on day ${s.clock.day}`);
    if (s.clock.phase === "morning" && day.checked !== s.clock.day) {
      day.checked = s.clock.day;
      const canSell = s.shelf.slots.some((j) => j && !C.isOver(j));
      if (!canSell && s.shop.coins < CHEAPEST) softLocked ??= s.clock.day;
    }
    const action = BOTS[bot](s);
    const r = C.step(s, action);
    if (r.events[0]?.type === "rejected")
      throw new Error(
        `${bot} bot action rejected on day ${s.clock.day}: ${JSON.stringify(r.events[0])}`,
      );
    for (const e of r.events) {
      if (e.type === "served" && e.customer.orderId) day.kept++;
      else if (e.type === "delivered" && e.done) day.kept++;
      else if (e.type === "upgraded") day.upgrades.push(e.id);
      else if (e.type === "claimedGoal") day.goals++;
      else if (e.type === "accepted") day.bulk++;
      else if (e.type === "closed") {
        day.missed = e.today.missed;
        day.earned = e.today.earned;
        day.served = e.today.served;
      }
    }
    s = r.state;
    if (action.type === "sleep") {
      Object.assign(day, { coins: s.shop.coins, rep: s.shop.rep, tier: s.progress.tier });
      log.push(day);
      day = blankDay(s);
    }
  }
  return { state: s, log, softLocked };
}

function blankDay(s) {
  return {
    day: s.clock.day,
    checked: 0,
    coins: 0,
    rep: 0,
    tier: 0,
    earned: 0,
    served: 0,
    kept: 0,
    missed: 0,
    bulk: 0,
    goals: 0,
    upgrades: [],
  };
}

const sum = (log, k) => log.reduce((a, d) => a + d[k], 0);
const firstDay = (log, pred) => log.find(pred)?.day ?? null;
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

/** One seed: all three bots, plus the careful bot taking over the idle shop. */
function runSeed(seed) {
  const out = {};
  for (const bot of ["careful", "careless", "idle"])
    out[bot] = play(bot, C.newGame(seed, START), DAYS);
  out.recover = play("careful", out.idle.state, RECOVER_DAYS);
  return out;
}

function summary(r) {
  const { log, state } = r;
  return {
    coins: state.shop.coins,
    rep: state.shop.rep,
    tier: state.progress.tier,
    ...Object.fromEntries(
      TIERS.slice(1).map((_, i) => [`tier${i + 1}`, firstDay(log, (d) => d.tier >= i + 1)]),
    ),
    earned: sum(log, "earned"),
    served: sum(log, "served"),
    kept: sum(log, "kept"),
    missed: sum(log, "missed"),
    goals: state.progress.goal,
    lastUpgrade: log.findLast((d) => d.upgrades.length)?.day ?? null,
    upgrades: log.flatMap((d) => d.upgrades.map((id) => `${id} (day ${d.day})`)),
    recipes: C.menu(state).length,
  };
}

// ---- run -------------------------------------------------------------------

const STRICT = process.argv.includes("--strict");

/** Report a problem: a warning annotation on CI, exit 1 only with --strict. */
function warn(/** @type {string[]} */ problems) {
  for (const p of problems) console.log(`::warning title=Ferment balance::${p}`);
  if (STRICT) process.exit(1);
}

let runs;
try {
  runs = SEEDS.map((seed) => ({ seed, ...runSeed(seed) }));
} catch (e) {
  const why = `The balance sim couldn't play: ${e instanceof Error ? e.message : e}`;
  console.log(why);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, why + "\n");
  warn([why]);
  process.exit(0);
}
const lines = [];
const say = (t = "") => lines.push(t);
const dash = (x) => (x === null ? "—" : String(x));

say(`# Ferment balance sim: ${DAYS} days, seeds ${SEEDS[0]}–${SEEDS.at(-1)}`);
say();
say(
  `| Bot | Took in (median) | Coins at end (median, low–high) | Reputation | Tier ${TIERS.slice(1)
    .map((_, i) => i + 1)
    .join(" / ")} on day (median) | Served | Orders kept / missed | Goals claimed |`,
);
say("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const bot of ["careful", "careless", "idle"]) {
  const ss = runs.map((r) => summary(r[bot]));
  const m = (k) => median(ss.map((x) => x[k]));
  const tierDay = (k) => {
    const got = ss.map((x) => x[k]).filter((x) => x !== null);
    return got.length === ss.length
      ? String(median(got))
      : got.length
        ? `${median(got)} (${got.length}/${ss.length})`
        : "—";
  };
  const coins = ss.map((x) => x.coins);
  say(
    `| ${bot} | ${m("earned")} | ${m("coins")} (${Math.min(...coins)}–${Math.max(...coins)}) | ${m("rep")} | ${TIERS.slice(
      1,
    )
      .map((_, i) => tierDay(`tier${i + 1}`))
      .join(" / ")} | ${m("served")} | ${m("kept")} / ${m("missed")} | ${m("goals")} |`,
  );
}
const rec = runs.map((r) => summary(r.recover));
say();
say(
  `After ${DAYS} idle days the careful bot takes over for ${RECOVER_DAYS} days: coins ${median(rec.map((x) => x.coins))} (median), reputation ${median(rec.map((x) => x.rep))}.`,
);

say();
say(`## Careful bot, seed ${SEEDS[0]}, day by day`);
say();
say("| Day | Coins | Rep | Tier | Took in | Served | Orders kept | Missed | Goals | Upgrades |");
say("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const d of runs[0].careful.log)
  say(
    `| ${d.day} | ${d.coins} | ${d.rep} | ${d.tier} | ${d.earned} | ${d.served} | ${d.kept} | ${d.missed} | ${d.goals || ""} | ${d.upgrades.join(", ")} |`,
  );
say();
say(
  `Careful upgrades, seed ${SEEDS[0]}: ${summary(runs[0].careful).upgrades.join(", ") || "none"}.`,
);

// ---- bands -----------------------------------------------------------------

const fails = [];
for (const r of runs) {
  const c = summary(r.careful),
    l = summary(r.careless),
    i = summary(r.idle),
    v = summary(r.recover);
  const at = `seed ${r.seed}`;
  if (c.earned < BANDS.CAREFUL_X * l.earned)
    fails.push(
      `${at}: careful took in ${c.earned} coins, under ${BANDS.CAREFUL_X}× careless (${l.earned})`,
    );
  for (const [tier, [lo, hi]] of Object.entries(BANDS.TIER_DAYS)) {
    const day = c[`tier${tier}`];
    if (day === null || day < lo || day > hi)
      fails.push(`${at}: careful reached tier ${tier} on day ${dash(day)}, not days ${lo}–${hi}`);
  }
  if (c.lastUpgrade !== null && c.lastUpgrade < BANDS.LAST_UPGRADE)
    fails.push(`${at}: careful had bought every upgrade it wants by day ${c.lastUpgrade}`);
  const taken = c.kept + c.missed;
  if (taken && c.missed / taken > BANDS.MISS_SHARE)
    fails.push(`${at}: careful missed ${c.missed} of ${taken} orders`);
  for (const bot of ["careful", "careless", "idle"])
    if (r[bot].softLocked) fails.push(`${at}: ${bot} soft-locked on day ${r[bot].softLocked}`);
  if (r.recover.softLocked) fails.push(`${at}: careful soft-locked taking over the idle shop`);
  if (v.coins <= i.coins || v.rep <= i.rep)
    fails.push(
      `${at}: careful didn't recover the idle shop (coins ${i.coins}→${v.coins}, rep ${i.rep}→${v.rep})`,
    );
}

say();
say("## Bands");
say();
say(`- Careful takes in at least ${BANDS.CAREFUL_X}× what careless does, every seed.`);
for (const [tier, [lo, hi]] of Object.entries(BANDS.TIER_DAYS))
  say(`- Careful reaches tier ${tier} between day ${lo} and day ${hi}, every seed.`);
say(`- Careful's last upgrade comes on day ${BANDS.LAST_UPGRADE} or later.`);
say(`- Careful misses at most ${BANDS.MISS_SHARE * 100}% of the orders it takes.`);
say("- Nobody soft-locks, and the careful bot can bring an idle shop back.");
say();
say(
  fails.length
    ? `**${fails.length} band(s) failed:**\n\n${fails.map((f) => `- ${f}`).join("\n")}`
    : "All bands hold.",
);

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
if (fails.length) warn(fails);
