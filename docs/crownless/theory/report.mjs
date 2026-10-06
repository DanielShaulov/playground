/**
 * Asks the battle model the questions DESIGN.md §5 needs answered, and prints
 * the tables that went into it.
 *
 *     node docs/crownless/theory/report.mjs            # everything
 *     node docs/crownless/theory/report.mjs worth      # one section:
 *          worth | matrix | armies | scale | mods | length | perf
 *
 * Read every number as "what the plain AI gets". A player who flanks, holds a
 * charge on braced spears or pulls archers back will do better; the point is
 * that the same floor is applied to everything, so two numbers compare.
 */
import { fight, TROOPS } from "./battle.mjs";

const SEEDS = [1, 2, 3];
const only = process.argv[2];
const want = (name) => !only || only === name;

const pad = (v, n) => String(v).padStart(n);
const padr = (v, n) => String(v).padEnd(n);

/** Fraction of seeds side 0 wins. */
function winRate(a, b) {
  let w = 0;
  for (const seed of SEEDS) if (fight([a, b], seed).winner === 0) w++;
  return w / SEEDS.length;
}

const types = Object.keys(TROOPS);
const PANEL = ["militia", "spearman", "archer", "horseman"];
const Wm = {}; // worth vs militia alone
const W = {}; // panel worth: geometric mean over PANEL, in militia
const vs = {}; // per-reference breakdown

/** Smallest squad of `type` that beats 30 of `ref`, as ref-equivalents. */
function worthVs(type, ref) {
  let lo = 1;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (winRate([{ type, n: mid }], [{ type: ref, n: 30 }]) > 0.5) hi = mid;
    else lo = mid + 1;
  }
  return 30 / lo;
}

if (want("worth") || want("matrix") || want("armies")) {
  // Militia beat 30 militia at 33, so normalise: militia are worth exactly 1.
  const norm = worthVs("militia", "militia");
  for (const r of PANEL) Wm[r] = worthVs(r, "militia") / norm;
  for (const t of types) {
    vs[t] = {};
    let logSum = 0;
    for (const r of PANEL) {
      vs[t][r] = (worthVs(t, r) / norm) * Wm[r];
      logSum += Math.log(vs[t][r]);
    }
    W[t] = Math.exp(logSum / PANEL.length);
  }
}

if (want("worth")) {
  console.log("\n## Worth — militia-equivalents per soldier\n");
  console.log("Each column: the smallest squad that beats 30 of that troop, converted to");
  console.log("militia. 'worth' is the geometric mean across the panel — what the troop");
  console.log("is worth against an army you have not seen yet.\n");
  console.log(
    `${padr("troop", 12)} tier role    ${PANEL.map((r) => pad(r.slice(0, 7), 8)).join("")}   worth`,
  );
  for (const t of types) {
    console.log(
      `${padr(t, 12)} ${pad(TROOPS[t].tier, 3)}  ${padr(TROOPS[t].role, 7)}${PANEL.map((r) => pad(vs[t][r].toFixed(2), 8)).join("")}  ${pad(W[t].toFixed(2), 6)}`,
    );
  }
}

if (want("matrix")) {
  const BUDGET = 40; // militia-equivalents per side
  // The eleven core troops; the elites and beasts are in the worth table.
  const roster = [
    "militia",
    "footman",
    "manatarms",
    "spearman",
    "pikeman",
    "archer",
    "longbow",
    "crossbow",
    "horseman",
    "knight",
    "horsearcher",
  ];
  console.log(`\n## Counter matrix — ${BUDGET} militia-worth a side\n`);
  console.log("Row attacks column. Cell = % of the row's men still alive if the row");
  console.log("wins, negative = % of the column's men alive when the column wins.\n");
  console.log(padr("", 12) + roster.map((t) => pad(t.slice(0, 6), 7)).join(""));
  for (const a of roster) {
    let line = padr(a, 12);
    for (const c of roster) {
      const na = Math.max(1, Math.round(BUDGET / W[a]));
      const nc = Math.max(1, Math.round(BUDGET / W[c]));
      const r = fight([[{ type: a, n: na }], [{ type: c, n: nc }]], 1);
      const cell =
        r.winner === 0
          ? `${Math.round((r.sides[0].alive / na) * 100)}`
          : r.winner === 1
            ? `-${Math.round((r.sides[1].alive / nc) * 100)}`
            : "=";
      line += pad(cell, 7);
    }
    console.log(line);
  }
}

// Armies at equal worth, by share of the budget.
const ARMIES = {
  balanced: { footman: 0.35, spearman: 0.15, archer: 0.3, horseman: 0.2 },
  shieldwall: { manatarms: 0.45, footman: 0.2, crossbow: 0.35 },
  knights: { knight: 0.6, militia: 0.25, bowman: 0.15 },
  horde: { levy: 0.5, militia: 0.4, bowman: 0.1 },
  steppe: { horsearcher: 0.65, horseman: 0.35 },
  yeomen: { longbow: 0.55, pikeman: 0.3, militia: 0.15 },
};

function build(name, budget) {
  return Object.entries(ARMIES[name]).map(([type, share]) => ({
    type,
    n: Math.max(1, Math.round((budget * share) / W[type])),
  }));
}

if (want("armies")) {
  const BUDGET = 150;
  const names = Object.keys(ARMIES);
  console.log(`\n## Armies — ${BUDGET} militia-worth a side, plain AI both sides\n`);
  for (const n of names) {
    const a = build(n, BUDGET);
    console.log(
      `${padr(n, 11)} ${a.map((s) => `${s.n} ${s.type}`).join(", ")}  (${a.reduce((m, s) => m + s.n, 0)} men)`,
    );
  }
  console.log("\nRow vs column: W/L/D over 3 seeds, then median rounds.\n");
  console.log(padr("", 11) + names.map((n) => pad(n, 12)).join(""));
  const wins = Object.fromEntries(names.map((n) => [n, 0]));
  for (const a of names) {
    let line = padr(a, 11);
    for (const c of names) {
      let w = 0;
      let l = 0;
      let d = 0;
      const rounds = [];
      for (const seed of SEEDS) {
        const r = fight([build(a, BUDGET), build(c, BUDGET)], seed);
        if (r.winner === 0) w++;
        else if (r.winner === 1) l++;
        else d++;
        rounds.push(r.rounds);
      }
      wins[a] += w;
      rounds.sort((x, y) => x - y);
      line += pad(`${w}/${l}/${d} r${rounds[1]}`, 12);
    }
    console.log(line);
  }
  console.log("\nTotal wins (out of " + names.length * SEEDS.length + "):", JSON.stringify(wins));
}

if (want("scale")) {
  console.log("\n## Scale — what doubling buys\n");
  console.log("N attackers vs 30 defenders of the same troop: rounds, and each side's");
  console.log("dead. Lanchester's square law would have 60 lose ~4 men to 30's 30.\n");
  for (const t of ["militia", "archer", "knight"]) {
    for (const n of [30, 45, 60, 90]) {
      const r = fight([[{ type: t, n }], [{ type: t, n: 30 }]], 1);
      console.log(
        `${padr(t, 8)} ${pad(n, 3)} v 30: winner ${r.winner ?? "-"}  rounds ${pad(r.rounds, 2)}  dead ${pad(r.sides[0].dead, 3)} : ${pad(r.sides[1].dead, 3)}`,
      );
    }
  }
}

if (want("mods")) {
  // What a hero is worth: for each army-wide bonus, how much bigger the plain
  // army has to be to break even with it. This is the exchange rate for
  // skills, banners and abilities (DESIGN.md §6).
  console.log("\n## Modifiers — each bonus, as the % more troops it is worth\n");
  const base = { footman: 30, spearman: 14, archer: 20, horseman: 10 };
  const army = (k) => Object.entries(base).map(([type, n]) => ({ type, n: Math.round(n * k) }));
  const MODS = {
    "melee +10%": { melee: 1.1 },
    "melee +30%": { melee: 1.3 },
    "ranged +10%": { ranged: 1.1 },
    "ranged +30%": { ranged: 1.3 },
    "def +1": { def: 1 },
    "def +3": { def: 3 },
    "morale +10": { morale: 10 },
    "morale +25": { morale: 25 },
  };
  const SEEDS9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const [name, mod] of Object.entries(MODS)) {
    // Smallest k at which the plain army (side 1, scaled by k) wins >= half.
    let k = 1;
    for (; k < 2; k += 0.05) {
      let w = 0;
      for (const seed of SEEDS9) {
        const r = fight([army(1), army(k)], seed, { mods: [mod, {}] });
        if (r.winner === 1) w++;
      }
      if (w >= SEEDS9.length / 2) break;
    }
    console.log(`${padr(name, 12)} ≈ +${Math.round((k - 1) * 100)}% troops`);
  }
}

if (want("length")) {
  console.log("\n## Length — rounds per battle across random mid-sized armies\n");
  const roster = types.filter((t) => t !== "troll");
  let seed = 100;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const rounds = [];
  let stale = 0;
  for (let i = 0; i < 200; i++) {
    const army = () =>
      Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({
        type: roster[Math.floor(rand() * roster.length)],
        n: 10 + Math.floor(rand() * 30),
      }));
    const r = fight([army(), army()], i);
    rounds.push(r.rounds);
    if (r.stalemate) stale++;
  }
  rounds.sort((a, b) => a - b);
  const q = (p) => rounds[Math.floor(p * (rounds.length - 1))];
  console.log(
    `200 battles: p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}  max ${q(1)}  stalemates ${stale}`,
  );
}

if (want("perf")) {
  console.log("\n## Perf — auto-resolve cost\n");
  const big = [
    { type: "footman", n: 40 },
    { type: "spearman", n: 30 },
    { type: "archer", n: 30 },
    { type: "crossbow", n: 20 },
    { type: "horseman", n: 20 },
    { type: "knight", n: 15 },
    { type: "manatarms", n: 25 },
    { type: "longbow", n: 20 },
  ];
  const t0 = performance.now();
  let rounds = 0;
  const N = 50;
  for (let i = 0; i < N; i++) rounds += fight([big, big], i).rounds;
  const ms = (performance.now() - t0) / N;
  console.log(
    `8 squads / 200 men a side: ${ms.toFixed(1)} ms per battle (${(rounds / N).toFixed(1)} rounds) on this machine`,
  );
}
