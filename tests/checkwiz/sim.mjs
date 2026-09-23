/**
 * Plays Checkwiz headlessly, many times, and reports how it went.
 *
 *     node tests/checkwiz/sim.mjs              # 200 seeded runs
 *     RUNS=1000 node tests/checkwiz/sim.mjs
 *     SEED=7 RUNS=1 TRACE=1 node tests/checkwiz/sim.mjs   # one run, move by move
 *
 * This imports the game's own rules module — no browser, no canvas — and
 * spreads the runs over every core, so a few hundred runs take minutes rather
 * than an afternoon. It is the tool for tuning: change a number in rules.js,
 * run this, compare. The browser suite (rules.mjs) is what proves the game
 * people touch actually obeys the rules.
 *
 * The player is policy.mjs. How deep it gets is a floor on what a careful
 * person manages, not a ceiling — but it is the same floor every time, which
 * is what makes two numbers comparable.
 *
 * Chambers that run past the turn cap are listed, not failed. Almost always it
 * is the policy on one or two life refusing every price on offer, which a
 * person would not; but it is also how the pocket bug showed up — a wizard
 * walled in by pieces that could neither strike him nor leave, forever — so
 * read the positions. It exits non-zero only if a run throws.
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { seedRandom, newRun, act, choose, KINDS, chamberName } from "../../games/checkwiz/rules.js";
import { chooseAction, chooseRelic } from "./policy.mjs";

const RUNS = Number(process.env.RUNS ?? 200);
const SEED = Number(process.env.SEED ?? 1);
const TRACE = !!process.env.TRACE;
const DEPTH_CAP = Number(process.env.DEPTH ?? 99);
const TURN_CAP = 200; // per chamber

/** One whole run, as a plain record the main thread can add up. */
function playRun(seed) {
  seedRandom(seed);
  const run = newRun();
  const rec = {
    seed,
    cleared: 0,
    chambers: [],
    lastBlow: null,
    spent: {},
    stall: null,
    relics: [],
  };
  const memory = new Map();
  let turns = 0;
  let taken = 0;

  while (run.phase !== "dead" && run.phase !== "won" && run.chamber <= DEPTH_CAP) {
    if (run.phase === "draft") {
      choose(run, chooseRelic(run));
      turns = 0;
      taken = 0;
      memory.clear();
      continue;
    }
    if (++turns > TURN_CAP) {
      const b = run.board;
      rec.stall =
        `seed ${seed} chamber ${run.chamber} hp ${run.hp} hand [${run.hand}] ` +
        `wizard ${b.wizard.r},${b.wizard.c} :: ${b.pieces.map((p) => `${p.kind}@${p.r},${p.c}`).join(" ")}` +
        ` pillars ${b.pillars.map((x) => `${x.r},${x.c}`).join(" ")}`;
      break;
    }
    const n = run.chamber;
    const move = chooseAction(run, memory);
    const ev = act(run, move);
    const at = run.board.wizard.r * 16 + run.board.wizard.c;
    memory.set(at, (memory.get(at) ?? 0) + 1);
    for (const e of ev) {
      if (e.t === "strike") rec.lastBlow = e.kind;
      if (e.t === "take") taken++;
      if (e.t === "spend") rec.spent[e.kind] = (rec.spent[e.kind] ?? 0) + 1;
    }
    if (TRACE) {
      const what =
        move.type === "wait" ? "wait" : `${move.type}${move.slot ?? ""} ${move.r},${move.c}`;
      console.log(
        `ch${n} t${run.board.turn} ${what.padEnd(12)} hp ${run.hp}/${run.maxHp} hand [${run.hand}]`,
        ev.map((e) => e.t).join(" "),
      );
    }
    if (run.phase !== "play" && run.phase !== "bonus") {
      const clear = ev.find((e) => e.t === "clear");
      rec.chambers.push({
        n,
        died: !clear,
        hurt: run.board.hurt,
        turns,
        taken,
        flawless: !!clear?.flawless,
      });
    }
  }
  rec.cleared = run.chamber - 1;
  rec.won = run.phase === "won";
  rec.relics = Object.keys(run.relics);
  if (TRACE) console.log(`run seed ${seed}: cleared ${rec.cleared}, relics ${rec.relics}`);
  return rec;
}

const seeds = Array.from({ length: RUNS }, (_, i) => SEED * 100003 + i);

if (!isMainThread) {
  parentPort.postMessage(workerData.map(playRun));
} else {
  const lanes = TRACE ? 1 : Math.min(availableParallelism(), RUNS);
  let records;
  if (lanes === 1) {
    records = seeds.map(playRun);
  } else {
    const slices = Array.from({ length: lanes }, (_, i) => seeds.filter((_, j) => j % lanes === i));
    const parts = await Promise.all(
      slices.map(
        (slice) =>
          new Promise((resolve, reject) => {
            const w = new Worker(new URL(import.meta.url), { workerData: slice });
            w.once("message", resolve);
            w.once("error", reject);
          }),
      ),
    );
    records = parts.flat();
  }
  report(records);
}

function report(records) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "—");
  const avg = (a, b) => (b ? (a / b).toFixed(1) : "—");
  const cleared = records.map((r) => r.cleared).sort((a, b) => a - b);
  const mean = cleared.reduce((a, b) => a + b, 0) / cleared.length;

  console.log(
    `\n${records.length} runs · chambers cleared: mean ${mean.toFixed(2)}, ` +
      `median ${cleared[Math.floor(cleared.length / 2)]}, best ${cleared.at(-1)}`,
  );
  const hist = new Map();
  for (const c of cleared) hist.set(c, (hist.get(c) ?? 0) + 1);
  console.log("cleared  " + [...hist].map(([k, v]) => `${k}:${v}`).join("  "));
  const wins = records.filter((r) => r.won).length;
  console.log(`won      ${wins} of ${records.length} (${pct(wins, records.length)})`);

  const rows = new Map();
  for (const r of records) {
    for (const c of r.chambers) {
      const row = rows.get(c.n) ?? { n: 0, died: 0, hurt: 0, turns: 0, taken: 0, flawless: 0 };
      row.n++;
      row.died += c.died;
      row.hurt += c.hurt;
      row.turns += c.turns;
      row.taken += c.taken;
      row.flawless += c.flawless;
      rows.set(c.n, row);
    }
  }
  console.log("\nchamber              played  died  hurt/ch  turns  taken  flawless");
  for (const [n, r] of [...rows].sort((a, b) => a[0] - b[0])) {
    console.log(
      `${String(n).padStart(2)} ${chamberName(n).padEnd(18)} ${String(r.n).padStart(6)}  ` +
        `${pct(r.died, r.n).padStart(4)}  ${avg(r.hurt, r.n).padStart(7)}  ` +
        `${avg(r.turns, r.n).padStart(5)}  ${avg(r.taken, r.n).padStart(5)}  ` +
        `${pct(r.flawless, r.n - r.died).padStart(8)}`,
    );
  }

  const tally = (pairs) =>
    [...pairs]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  ");
  const blows = new Map();
  for (const r of records) {
    if (r.chambers.at(-1)?.died) {
      const name = KINDS[r.lastBlow]?.name ?? "?";
      blows.set(name, (blows.get(name) ?? 0) + 1);
    }
  }
  const spent = new Map();
  for (const r of records) {
    for (const [k, v] of Object.entries(r.spent)) {
      spent.set(KINDS[k].soul, (spent.get(KINDS[k].soul) ?? 0) + v);
    }
  }
  console.log(`\nlast blow by   ${tally(blows)}`);
  console.log(`souls spent    ${tally(spent)}`);

  const stalls = records.filter((r) => r.stall);
  if (stalls.length) {
    console.log(`\n${stalls.length} runs stopped at the ${TURN_CAP}-turn cap of one chamber:`);
    for (const r of stalls.slice(0, 5)) console.log(`  ${r.stall}`);
  }
}
