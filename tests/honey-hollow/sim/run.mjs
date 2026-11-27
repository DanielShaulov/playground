// Honey Hollow balance sim: the sensible, lazy, greedy and completionist
// keepers (bots.mjs) each play whole in-game years from several seeds through
// step() only. Prints a report (coins and renown over time, jars by kind, the
// purity mix, when each plot was bought, hives, goals and when they were
// claimed, swarms, mites, how the colonies wintered) and checks the "Balance
// targets" at the bottom of docs/honey-hollow/rules.md.
//
// A missed target is a warning, never a failed build: it prints a GitHub
// `::warning` and the run still exits 0 (pass --strict to exit 1 instead).
// A bot that cannot play, or a keeper with no way left to earn, is a bug in
// the rules and exits 1.
//
//   npm run test:honey-hollow:sim
//   SIM_SEEDS=12 SIM_YEARS=3 npm run test:honey-hollow:sim
//   node tests/honey-hollow/sim/run.mjs --strict
//
// On CI the report also goes to the job summary ($GITHUB_STEP_SUMMARY).
import { appendFileSync } from "node:fs";
import * as C from "../../../games/honey-hollow/core/index.js";
import { makeBot, play, BOT_KINDS } from "./bots.mjs";

const T = C.TUNING;
const YEARS = Number(process.env.SIM_YEARS ?? 3);
const SEEDS = Array.from({ length: Number(process.env.SIM_SEEDS ?? 6) }, (_, i) => i + 1);
const STRICT = process.argv.includes("--strict");
const YEAR = T.YEAR_DAYS;
const SEASON = T.SEASON_DAYS;

/** The targets, as numbers. rules.md says the same in words. */
export const TARGETS = {
  FIRST_JAR_BY: 3,
  SPRING_COINS: [120, 220],
  POND_DAYS: [SEASON + 1, 2 * SEASON],
  ORCHARD_BY: YEAR,
  HILL_DAYS: [YEAR + 1, 2 * YEAR],
  YEAR1_HIVES: [4, 7],
  YEAR1_KINDS: 4,
  FIVE_KINDS_BY: YEAR + SEASON,
  YEAR1_TIER: [2, 3],
  LAZY_PACE: [0.15, 0.5],
  PURITY_EDGE: 1.25,
  /** The completionist claims every goal within this many years, on this share of the seeds. */
  COMPLETE_YEARS: 4,
  COMPLETE_SEEDS: 2 / 3,
};

/** The completionist plays until its target runs out; the others play YEARS. */
const yearsFor = (kind) =>
  kind === "completionist" ? Math.max(YEARS, TARGETS.COMPLETE_YEARS) : YEARS;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const strengthOf = (s) => sum(s.hives.list.map((h) => h.strength));
const dash = (x) => (x === null || x === undefined ? "–" : String(x));
const round = (x, d = 0) =>
  x === null || x === undefined ? "–" : (Math.round(x * 10 ** d) / 10 ** d).toString();

/** Play one keeper for its years, keeping the numbers the report needs. */
function runGame(kind, seed) {
  const log = {
    kind,
    seed,
    days: [], // one row per day slept
    firstJar: null,
    plots: {},
    afford: {},
    goals: {},
    jars: {},
    stars: [0, 0, 0, 0],
    honeyCoins: 0,
    honeySold: 0,
    goodsCoins: 0,
    in: 0,
    winterHungry: {},
    lostStrength: 0,
    events: {},
    first: {}, // the day each kind of event first happened
  };
  const end = play(
    makeBot(kind, seed),
    C.newGame(seed),
    yearsFor(kind) * YEAR + 1,
    (s, action, r) => {
      const day = s.clock.day;
      log.in +=
        r.state.purse.coins -
        s.purse.coins +
        (r.state.purse.today.spent - (action.type === "sleep" ? 0 : s.purse.today.spent));
      for (const e of r.events) {
        log.events[e.type] = (log.events[e.type] ?? 0) + 1;
        log.first[e.type] ??= day;
        if (e.type === "harvested") {
          log.firstJar ??= day;
          log.jars[e.flower ?? "blend"] = (log.jars[e.flower ?? "blend"] ?? 0) + e.jars;
          log.stars[e.stars] += e.jars;
        } else if (e.type === "sold" || e.type === "soldToGrocer") {
          if (e.product.startsWith("honey:")) {
            log.honeyCoins += e.coins;
            log.honeySold += e.n;
          } else log.goodsCoins += e.coins;
        } else if (e.type === "plotBought") log.plots[e.plot] = day;
        else if (e.type === "goalClaimed") log.goals[e.goal] = day;
        else if (e.type === "hungry") {
          if (e.winter) {
            const y = C.calendarOf(day).year;
            log.winterHungry[y] = (log.winterHungry[y] ?? 0) + 1;
          }
          log.lostStrength += e.lost;
        }
      }
      // The first morning each plot could have been paid for, bought or not.
      for (const p of C.PLOT_IDS)
        if (C.PLOTS[p].price > 0 && r.state.purse.coins >= C.PLOTS[p].price) log.afford[p] ??= day;
      if (action.type === "sleep") {
        const n = r.state;
        log.days.push({
          day,
          coins: n.purse.coins,
          in: log.in,
          earned: n.progress.stats.earned,
          renown: n.progress.renown,
          tier: n.progress.tier,
          hives: n.hives.list.length,
          strength: strengthOf(n),
          jars: n.progress.stats.jars,
          kinds: C.MEASURES.kinds(n),
          kinds3: C.MEASURES.kinds3(n),
          goals: n.progress.claimed.length,
        });
      }
    },
  );
  log.state = end.state;
  return log;
}

/** The row for the day that was slept through (1-based). */
const at = (log, day) => log.days[day - 1];

// ---- no dead ends -----------------------------------------------------------

/**
 * Whatever state a keeper is in, there must be a way to earn. Take the worst
 * a player could do with the end of each game (dig up every bed, empty the
 * purse and the shelf) and check that a keeper who only starts days, takes
 * jars and sells to the grocer still has coins coming in within two years.
 */
function deadEnd(state) {
  let s = structuredClone(state);
  for (const p of C.PLOT_IDS)
    s.land.plots[p].squares = s.land.plots[p].squares.map((sq) =>
      sq && sq.t === "bed" ? null : sq,
    );
  s.purse.coins = 0;
  s.stock = { ...s.stock, honey: {}, goods: {}, seeds: {}, wax: 0, syrup: 0, remedy: 0 };
  for (const h of s.hives.list) h.stores = {};
  let earned = 0;
  const until = s.clock.day + 2 * YEAR;
  for (let guard = 0; s.clock.day < until; guard++) {
    if (guard > 100000) return true;
    let a;
    const due = C.yearDue(s);
    const full = s.hives.list.find((h) => C.jarsIn(h) > 1);
    if (due) a = { type: "seenYear", year: due.year };
    else if (s.clock.phase === "morning")
      a = full
        ? { type: "harvest", hive: full.id, jars: C.jarsIn(full) - 1 }
        : { type: "startDay" };
    else if (s.clock.phase === "day") a = { type: "tick", n: T.TICKS_PER_DAY };
    else {
      const it = C.shelf(s)[0];
      a = it ? { type: "sellToGrocer", product: it.product, n: it.n } : { type: "sleep" };
    }
    const r = C.step(s, a);
    if (r.events[0]?.type === "rejected")
      throw new Error(`dead-end probe: ${JSON.stringify(a)} rejected: ${r.events[0].why}`);
    for (const e of r.events) if (e.type === "soldToGrocer") earned += e.coins;
    s = r.state;
  }
  return earned <= 0;
}

// ---- run --------------------------------------------------------------------

function fail(why) {
  console.log(why);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, why + "\n");
  console.log(`::error title=Honey Hollow sim::${why.split("\n")[0]}`);
  process.exit(1);
}

const started = performance.now();
const runs = {};
try {
  for (const kind of BOT_KINDS) runs[kind] = SEEDS.map((seed) => runGame(kind, seed));
} catch (e) {
  fail(`The balance sim could not play: ${e instanceof Error ? e.stack : e}`);
}
for (const kind of BOT_KINDS)
  for (const g of runs[kind])
    if (deadEnd(g.state))
      fail(
        `Dead end: the ${kind} keeper, seed ${g.seed}, stripped bare, earned nothing in two years.`,
      );

const lines = [];
const say = (t = "") => lines.push(t);
const med = (kind, f) => median(runs[kind].map(f));
const range = (kind, f) => {
  const v = runs[kind].map(f).filter((x) => x !== null && x !== undefined);
  return v.length ? `${round(median(v))} (${round(Math.min(...v))}–${round(Math.max(...v))})` : "–";
};
const count = (g, type) => g.events[type] ?? 0;

say(`# Honey Hollow balance sim: ${YEARS} years, seeds ${SEEDS[0]}–${SEEDS.at(-1)}`);
say();
say(
  `Median over seeds, with the lowest and highest in brackets. The completionist plays ${yearsFor("completionist")} years; the tables stop at ${YEARS}.`,
);
say();
say("## Over time");
say();
const marks = [];
for (let y = 0; y < YEARS; y++) for (let q = 1; q <= 4; q++) marks.push(y * YEAR + q * SEASON);
say(
  `| End of | ${marks.map((d) => `Y${Math.ceil(d / YEAR)} ${T.SEASONS[(((d / SEASON - 1) % 4) + 4) % 4].slice(0, 3)}`).join(" | ")} |`,
);
say(`| --- | ${marks.map(() => "---").join(" | ")} |`);
for (const kind of BOT_KINDS) {
  say(
    `| ${kind}: coins in | ${marks.map((d) => round(med(kind, (g) => at(g, d).in))).join(" | ")} |`,
  );
  say(
    `| ${kind}: renown (tier) | ${marks.map((d) => `${round(med(kind, (g) => at(g, d).renown))} (${round(med(kind, (g) => at(g, d).tier))})`).join(" | ")} |`,
  );
  say(
    `| ${kind}: hives / strength | ${marks.map((d) => `${round(med(kind, (g) => at(g, d).hives))} / ${round(med(kind, (g) => at(g, d).strength))}`).join(" | ")} |`,
  );
  say(
    `| ${kind}: jars | ${marks.map((d) => round(med(kind, (g) => at(g, d).jars))).join(" | ")} |`,
  );
}

say();
say("## Each keeper");
say();
say(`| | ${BOT_KINDS.join(" | ")} |`);
say(`| --- | ${BOT_KINDS.map(() => "---").join(" | ")} |`);
const row = (name, f) => say(`| ${name} | ${BOT_KINDS.map((k) => range(k, f)).join(" | ")} |`);
row("First jar, day", (g) => g.firstJar);
row("Coins in by end of spring", (g) => at(g, SEASON).in);
row("Coins in, year 1", (g) => at(g, YEAR).in);
row(`Coins in, ${YEARS} years`, (g) => at(g, YEARS * YEAR).in);
row("Pond Bank bought, day", (g) => g.plots.pond ?? null);
row("Old Orchard bought, day", (g) => g.plots.orchard ?? null);
row("Heather Hill bought, day", (g) => g.plots.hill ?? null);
row("Hives, end of year 1", (g) => at(g, YEAR).hives);
row("Kinds of pure honey, year 1", (g) => at(g, YEAR).kinds);
row(`Kinds at three stars, ${YEARS} years`, (g) => at(g, YEARS * YEAR).kinds3);
row("Tier, end of year 1", (g) => at(g, YEAR).tier);
row(`Tier, end of year ${YEARS}`, (g) => at(g, YEARS * YEAR).tier);
row(`Jars, ${YEARS} years`, (g) => at(g, YEARS * YEAR).jars);
row("Coins per jar of honey sold", (g) =>
  g.honeySold ? Math.round((g.honeyCoins / g.honeySold) * 10) / 10 : null,
);
row("Share of coins from the workshop, %", (g) =>
  Math.round((100 * g.goodsCoins) / Math.max(1, g.goodsCoins + g.honeyCoins)),
);
row(`Goals claimed, ${YEARS} years`, (g) => at(g, YEARS * YEAR).goals);
row("Hungry nights, first winter", (g) => g.winterHungry[1] ?? 0);
say(
  `| Strength into winter → out of it → by summer | ${BOT_KINDS.map((k) => `${round(med(k, (g) => at(g, 3 * SEASON).strength))} → ${round(med(k, (g) => at(g, YEAR).strength))} → ${round(med(k, (g) => at(g, YEAR + SEASON).strength))}`).join(" | ")} |`,
);
row("Queen cells first seen, day", (g) => g.first.queenCells ?? null);
row("Swarms that left", (g) => count(g, "swarmed"));
row("Swarms caught", (g) => count(g, "swarmCaught"));
row("Swarms lost", (g) => count(g, "swarmLost"));
row("Strength lost to mites", (g) => count(g, "mitesHarmed"));

say();
say("## Jars by kind and purity (all seeds together)");
say();
const kindsSeen = [...C.FLOWER_IDS, "blend"];
say(`| | ${kindsSeen.join(" | ")} | blend / ★ / ★★ / ★★★ |`);
say(`| --- | ${kindsSeen.map(() => "---").join(" | ")} | --- |`);
for (const kind of BOT_KINDS) {
  const tot = (k) => sum(runs[kind].map((g) => g.jars[k] ?? 0));
  const stars = [0, 1, 2, 3].map((i) => sum(runs[kind].map((g) => g.stars[i])));
  const all = Math.max(1, sum(stars));
  say(
    `| ${kind} | ${kindsSeen.map(tot).join(" | ")} | ${stars.map((n) => `${Math.round((100 * n) / all)}%`).join(" / ")} |`,
  );
}

for (const kind of ["sensible", "completionist"]) {
  say();
  say(
    `## Goals: the day each was claimed (${kind}, median over ${yearsFor(kind)} years; how many of ${SEEDS.length} seeds)`,
  );
  say();
  const goalRows = C.GOALS.map((g) => {
    const days = runs[kind].map((r) => r.goals[g.id]).filter((d) => d !== undefined);
    return `${g.id} ${days.length ? `day ${round(median(days))}` : "never"}${days.length && days.length < SEEDS.length ? ` (${days.length}/${SEEDS.length})` : ""}`;
  });
  say(goalRows.join(" · "));
}

say();
say(`## What happened (events per game, ${BOT_KINDS.join(" / ")})`);
say();
const types = [
  "grew",
  "hungry",
  "queenCells",
  "swarmed",
  "swarmCaught",
  "swarmLost",
  "split",
  "mitesSpotted",
  "mitesHarmed",
  "waspsCame",
  "waspsRaided",
  "hiveMoved",
  "hiveUpgraded",
  "crafted",
  "passed",
  "sold",
  "soldToGrocer",
  "heart",
  "factUnlocked",
];
say(
  types
    .map((t) => `${t} ${BOT_KINDS.map((k) => round(med(k, (g) => count(g, t)))).join("/")}`)
    .join(" · "),
);

// ---- targets ----------------------------------------------------------------

const misses = [];
const check = (okay, text) => {
  if (!okay) misses.push(text);
};
const within = (x, [lo, hi]) => x !== null && x >= lo && x <= hi;
const complete = runs.completionist.filter((g) => {
  const days = C.GOAL_IDS.map((id) => g.goals[id]);
  return days.every((d) => d !== undefined && d <= TARGETS.COMPLETE_YEARS * YEAR);
});
{
  const S = runs.sensible;
  const L = runs.lazy;
  const G = runs.greedy;
  const firstJar = Math.max(...S.map((g) => g.firstJar ?? Infinity));
  check(
    firstJar <= TARGETS.FIRST_JAR_BY,
    `sensible: first jar on day ${firstJar} on some seed, later than day ${TARGETS.FIRST_JAR_BY}`,
  );
  const spring = median(S.map((g) => at(g, SEASON).in));
  check(
    within(spring, TARGETS.SPRING_COINS),
    `sensible: ${spring} coins in by the end of spring (median), not ${TARGETS.SPRING_COINS.join("–")}`,
  );
  const pond = median(S.map((g) => g.afford.pond ?? null));
  check(
    within(pond, [1, TARGETS.POND_DAYS[1]]) && S.every((g) => g.afford.pond),
    `sensible: could first afford the Pond Bank on day ${dash(pond)} (median), not by day ${TARGETS.POND_DAYS[1]}`,
  );
  const orchard = median(S.map((g) => g.afford.orchard ?? null));
  check(
    orchard !== null && orchard <= TARGETS.ORCHARD_BY,
    `sensible: could first afford the Old Orchard on day ${dash(orchard)} (median), not by day ${TARGETS.ORCHARD_BY}`,
  );
  const hill = median(S.map((g) => g.plots.hill ?? null));
  check(
    within(hill, TARGETS.HILL_DAYS),
    `sensible: bought Heather Hill on day ${dash(hill)} (median), not in year 2 (days ${TARGETS.HILL_DAYS.join("–")})`,
  );
  const hives = median(S.map((g) => at(g, YEAR).hives));
  check(
    within(hives, TARGETS.YEAR1_HIVES),
    `sensible: ${hives} hives at the end of year 1 (median), not ${TARGETS.YEAR1_HIVES.join("–")}`,
  );
  const kinds = median(S.map((g) => at(g, YEAR).kinds));
  check(
    kinds >= TARGETS.YEAR1_KINDS,
    `sensible: ${kinds} kinds of pure honey in year 1 (median), fewer than ${TARGETS.YEAR1_KINDS}`,
  );
  const tier = median(S.map((g) => at(g, YEAR).tier));
  check(
    within(tier, TARGETS.YEAR1_TIER),
    `sensible: tier ${tier} at the end of year 1 (median), not ${TARGETS.YEAR1_TIER.join("–")}`,
  );
  const five = median(S.map((g) => g.goals["five-kinds"] ?? null));
  check(
    five !== null && five <= TARGETS.FIVE_KINDS_BY,
    `sensible: had five kinds of honey on day ${dash(five)} (median), not by day ${TARGETS.FIVE_KINDS_BY}`,
  );
  const pace = median(L.map((g) => at(g, YEAR).in)) / median(S.map((g) => at(g, YEAR).in));
  check(
    within(pace, TARGETS.LAZY_PACE),
    `lazy: took in ${round(pace * 100)}% of what sensible did in year 1, not ${TARGETS.LAZY_PACE.map((x) => x * 100).join("–")}%`,
  );
  for (let y = 2; y <= YEARS; y++) {
    const now = median(L.map((g) => at(g, y * YEAR).in - at(g, (y - 1) * YEAR).in));
    const was = median(
      L.map((g) => at(g, (y - 1) * YEAR).in - (y > 2 ? at(g, (y - 2) * YEAR).in : 0)),
    );
    check(
      now > was,
      `lazy: is not growing (year ${y} brought in ${now} coins, year ${y - 1} brought in ${was})`,
    );
  }
  const before = median(G.map((g) => at(g, 3 * SEASON).strength));
  const after = median(G.map((g) => at(g, YEAR).strength));
  const summer = median(G.map((g) => at(g, YEAR + SEASON).strength));
  check(after < before, `greedy: came out of winter no weaker (strength ${before} → ${after})`);
  check(
    after < median(S.map((g) => at(g, YEAR).strength)),
    "greedy: came out of winter no weaker than the sensible keeper",
  );
  check(
    summer >= before,
    `greedy: had not recovered by summer (strength ${before} into winter, ${after} out of it, ${summer} by summer)`,
  );
  const perJar = (list) =>
    median(list.map((g) => (g.honeySold ? g.honeyCoins / g.honeySold : null)));
  const edge = perJar(S) / perJar(L);
  check(
    edge >= TARGETS.PURITY_EDGE,
    `purity: sensible earns ${round(edge * 100 - 100)}% more per jar than lazy, under ${TARGETS.PURITY_EDGE * 100 - 100}%`,
  );

  // Living hives: everybody meets them.
  const cells = S.filter((g) => (g.first.queenCells ?? Infinity) <= YEAR).length;
  check(
    cells === S.length,
    `swarms: the sensible keeper met queen cells in year 1 on only ${cells} of ${S.length} seeds`,
  );
  check(
    median(S.map((g) => count(g, "split"))) >= 1,
    "swarms: the sensible keeper never split a colony",
  );
  check(
    median(L.map((g) => count(g, "swarmLost"))) >= 1,
    "swarms: the lazy keeper never lost a swarm",
  );
  check(
    median(L.map((g) => count(g, "swarmCaught"))) >= 1,
    "swarms: the lazy keeper never caught a swarm",
  );
  check(
    median(L.map((g) => count(g, "mitesHarmed"))) >= 1,
    "mites: the lazy keeper's neglected mites never cost a colony any strength",
  );
  check(
    median(S.map((g) => count(g, "mitesHarmed"))) === 0,
    "mites: the sensible keeper, who dusts, lost strength to mites all the same",
  );

  // Every goal can be reached, and every honey made at three stars.
  const need = Math.ceil(TARGETS.COMPLETE_SEEDS * SEEDS.length);
  check(
    complete.length >= need,
    `goals: the completionist claimed every goal within ${TARGETS.COMPLETE_YEARS} years on ${complete.length} of ${SEEDS.length} seeds, fewer than ${need}`,
  );
  for (const g of C.GOALS) {
    const n = runs.completionist.filter((r) => r.goals[g.id] !== undefined).length;
    check(n > 0, `goals: nobody who tried ever claimed "${g.id}"`);
  }
  for (const f of C.FLOWER_IDS) {
    const n = runs.completionist.filter((r) => (r.state.progress.stats.stars[f] ?? 0) >= 3).length;
    check(
      n >= need,
      `honey: ${f} honey reached three stars on ${n} of ${SEEDS.length} seeds for the completionist, fewer than ${need}`,
    );
  }
}

say();
say("## The completionist");
say();
say(
  `Every goal claimed within ${TARGETS.COMPLETE_YEARS} years: ${complete.length} of ${SEEDS.length} seeds.`,
);
say();
for (const g of runs.completionist) {
  const missing = C.GOAL_IDS.filter((id) => g.goals[id] === undefined);
  const last = Math.max(0, ...Object.values(g.goals));
  say(
    `- seed ${g.seed} (${g.state.keeper.talent}): ${Object.keys(g.goals).length} of ${C.GOALS.length} goals, the last on day ${last}${missing.length ? `; missing ${missing.join(", ")}` : ""}`,
  );
}

say();
say("## Balance targets");
say();
say(
  `- A sensible keeper has a first jar by day ${TARGETS.FIRST_JAR_BY} and ${TARGETS.SPRING_COINS.join("–")} coins in by the end of spring.`,
);
say(
  `- They can afford the Pond Bank during the first summer, the Old Orchard by the first winter, and buy Heather Hill in the second year.`,
);
say(
  `- They end year 1 with ${TARGETS.YEAR1_HIVES.join("–")} hives, at least ${TARGETS.YEAR1_KINDS} kinds of honey and tier ${TARGETS.YEAR1_TIER.join("–")}, and have five kinds by the end of the second spring.`,
);
say(
  `- A lazy keeper takes in ${TARGETS.LAZY_PACE.map((x) => x * 100).join("–")}% of what the sensible keeper does in year 1, and more every year than the year before.`,
);
say("- A greedy keeper comes out of winter weaker, and has recovered by summer.");
say(
  `- Purity matters: the sensible keeper earns at least ${TARGETS.PURITY_EDGE * 100 - 100}% more per jar than the lazy one.`,
);
say(
  "- Everybody meets the living hives: the sensible keeper sees queen cells in year 1 and splits a colony; the lazy keeper loses a swarm, catches a swarm, and loses strength to mites it left alone; the sensible keeper, who dusts, loses none.",
);
say(
  `- Every goal can be reached and every honey made at three stars: the completionist claims all ${C.GOALS.length} goals within ${TARGETS.COMPLETE_YEARS} years on at least ${Math.ceil(TARGETS.COMPLETE_SEEDS * SEEDS.length)} of ${SEEDS.length} seeds.`,
);
say("- Nobody reaches a dead end: stripped of every bed, coin and jar, each keeper earns again.");
say();
say(
  misses.length
    ? `**${misses.length} target(s) missed:**\n\n${misses.map((m) => `- ${m}`).join("\n")}`
    : "All targets hold.",
);
say();
say(`_${Math.round(performance.now() - started)} ms._`);

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
for (const m of misses) console.log(`::warning title=Honey Hollow balance::${m}`);
if (misses.length && STRICT) process.exit(1);
