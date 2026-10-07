/**
 * Asks the battle rules the questions docs/crownless/battle.md §10 needs
 * answered, and prints the tables that go into it. The successor of the
 * theory model's report: same questions, asked of games/crownless/rules/.
 *
 *     npm run test:crownless:sim                 # everything (about a minute)
 *     npm run test:crownless:sim -- worth        # one or more sections:
 *       parity worth cultures matrix armies gold formations scale mods
 *       hero abilities mixed length perf
 *
 * Read every number as "what the plain AI gets". A player who flanks, holds a
 * charge on braced spears or pulls archers back does better; the point is
 * that the same floor is applied to everything, so two numbers compare.
 *
 * `parity` is a check, not a report: the rules in model mode (no AI split,
 * no heroes) must still reproduce the theory model's published tables. It
 * exits non-zero if they don't.
 */
import {
  createBattle,
  playRound,
  summarize,
  ABILITIES,
} from "../../games/crownless/rules/battle.js";
import {
  DOCTRINES,
  skirmish,
  skirmishHero,
  bannerSquad,
  armySquads,
  buildArmy,
  odds,
} from "../../games/crownless/rules/battle-setup.js";
import {
  troop,
  CULTURES,
  cultureRoster,
  GENERIC_TYPES,
  WORTH,
} from "../../games/crownless/rules/data/troops.js";

const SEEDS = [1, 2, 3];
const SEEDS9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const args = process.argv.slice(2);
const want = (name) => !args.length || args.includes(name);
let failed = 0;

const pad = (v, n) => String(v).padStart(n);
const padr = (v, n) => String(v).padEnd(n);

/**
 * One battle, plain AI both sides. `model` runs the rules as the theory model
 * had them; `heroes` and `mods` are per side.
 */
function fight(
  sides,
  seed,
  { model = false, mods = [{}, {}], heroes = [null, null], place = false, bannerless = false } = {},
) {
  const b = createBattle({
    seed,
    sides: sides.map((squads, i) => ({
      squads: heroes[i] && !bannerless ? [...squads, bannerSquad(heroes[i])] : squads,
      mods: mods[i],
      hero: heroes[i],
      place,
    })),
    opts: { model },
  });
  while (!b.over) playRound(b, { record: false });
  return summarize(b);
}

/** Fraction of seeds side 0 wins. */
function winRate(a, c, opts) {
  let w = 0;
  for (const seed of SEEDS) if (fight([a, c], seed, opts).winner === 0) w++;
  return w / SEEDS.length;
}

const PANEL = ["militia", "spearman", "archer", "horseman"];

/** Smallest squad of `units` (scaled) that beats 30 of `ref`, as ref-equivalents. */
function worthVs(make, ref, opts) {
  let lo = 1;
  let hi = 400;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (winRate([make(mid)], [{ type: ref, n: 30 }], opts) > 0.5) hi = mid;
    else lo = mid + 1;
  }
  return 30 / lo;
}

/** Worth against the panel: per reference, and the geometric mean. */
function measure(types, opts = {}) {
  const single = (t) => (n) => ({ type: t, n });
  const norm = worthVs(single("militia"), "militia", opts);
  const Wm = {};
  for (const r of PANEL) Wm[r] = worthVs(single(r), "militia", opts) / norm;
  const vs = {};
  const W = {};
  for (const [name, make] of types) {
    vs[name] = {};
    let logSum = 0;
    for (const r of PANEL) {
      vs[name][r] = (worthVs(make, r, opts) / norm) * Wm[r];
      logSum += Math.log(vs[name][r]);
    }
    W[name] = Math.exp(logSum / PANEL.length);
  }
  return { vs, W };
}

const worthRow = (name, t, vs, W) =>
  `${padr(name, 14)} ${pad(t.tier, 3)}  ${padr(t.role, 7)}${PANEL.map((r) => pad(vs[name][r].toFixed(2), 8)).join("")}  ${pad(W[name].toFixed(2), 6)}`;
const worthHead = () =>
  `${padr("troop", 14)} tier role    ${PANEL.map((r) => pad(r.slice(0, 7), 8)).join("")}   worth`;

// ---------------------------------------------------------------------------
// Parity with the theory model
// ---------------------------------------------------------------------------

/** The model's published tables (battle.md §10.1–2, as first written). */
// prettier-ignore
const MODEL_WORTH = {
  levy: 0.53, militia: 0.93, footman: 1.29, manatarms: 1.82, spearman: 1.39, pikeman: 1.65,
  bowman: 1.07, archer: 1.55, longbow: 2.35, crossbow: 2.05, horseman: 2.39, knight: 3.86,
  horsearcher: 2.06, squire: 1.57, bannerknight: 5.59, warden: 3.09, hearthguard: 2.42,
  keshig: 2.9, wolf: 0.83, troll: 35.98,
};
const ROSTER = [
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
// Row attacks column; a cell is the row's men alive (row won), negative the
// column's (column won), "=" both broke. Kept verbatim from battle.md.
const MODEL_MATRIX_TEXT = `
             militi footma manata spearm pikema archer longbo crossb horsem knight horsea
militia           =     60      =     63     63    -69      =      =    -65      =      =
footman         -60      =      =      =     55      =      =    -60    -65     74     58
manatarms       -60    -58      =     64      =     68     59      =    -59     73     59
spearman        -63      =    -64      =      =    -77    -65    -75     76      =     62
pikeman         -70    -65    -55    -59      =    -96    -88    -90     75     96      =
archer           69      =      =     73     96      =    -65    -70    -65    -80     81
longbow          65      =      =     65     88     65      =    -70    -65    -70     71
crossbow          =     60      =     65     90     70     65      =    -76    -70     90
horseman         65     65     65    -76    -79     76     76     76      =      =     88
knight           70    -71    -68    -72    -92     80     70     80      =    -60     90
horsearcher     -51    -55    -59    -59     58    -81    -71    -85     79    -50     42
`;
const MODEL_MATRIX = MODEL_MATRIX_TEXT.trim()
  .split("\n")
  .slice(1)
  .map((line) =>
    line
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((c) => (c === "=" ? "=" : c.startsWith("-") ? "-" : "+"))
      .join(""),
  );

function counterMatrix(W, opts) {
  const BUDGET = 40;
  const rows = [];
  for (const a of ROSTER) {
    const cells = [];
    for (const c of ROSTER) {
      const na = Math.max(1, Math.round(BUDGET / W[a]));
      const nc = Math.max(1, Math.round(BUDGET / W[c]));
      const r = fight([[{ type: a, n: na }], [{ type: c, n: nc }]], 1, opts);
      cells.push(
        r.winner === 0
          ? `${Math.round((r.sides[0].alive / na) * 100)}`
          : r.winner === 1
            ? `-${Math.round((r.sides[1].alive / nc) * 100)}`
            : "=",
      );
    }
    rows.push(cells);
  }
  return rows;
}

const printMatrix = (rows) => {
  console.log(padr("", 12) + ROSTER.map((t) => pad(t.slice(0, 6), 7)).join(""));
  rows.forEach((cells, i) =>
    console.log(padr(ROSTER[i], 12) + cells.map((c) => pad(c, 7)).join("")),
  );
};

if (want("parity")) {
  console.log("\n## Parity — the rules in model mode against the model's tables\n");
  const types = GENERIC_TYPES.map((t) => [t, (n) => ({ type: t, n })]);
  const { W } = measure(types, { model: true });
  let bad = 0;
  for (const t of GENERIC_TYPES) {
    const off = W[t] / MODEL_WORTH[t] - 1;
    if (Math.abs(off) > 0.1) {
      bad++;
      console.log(`FAIL  worth of ${t}: ${W[t].toFixed(2)}, model ${MODEL_WORTH[t]}`);
    }
  }
  console.log(
    `worth: ${GENERIC_TYPES.length - bad}/${GENERIC_TYPES.length} within 10% of the model`,
  );
  // The counter matrix sizes squads by the model's own worth, so a cell
  // compares the same two squads the model fought.
  const rows = counterMatrix(MODEL_WORTH, { model: true });
  let cellsBad = 0;
  rows.forEach((cells, i) =>
    cells.forEach((c, j) => {
      const sign = c === "=" ? "=" : c.startsWith("-") ? "-" : "+";
      if (sign !== MODEL_MATRIX[i][j]) {
        cellsBad++;
        console.log(`FAIL  ${ROSTER[i]} v ${ROSTER[j]}: ${c}, model ${MODEL_MATRIX[i][j]}`);
      }
    }),
  );
  console.log(`counters: ${121 - cellsBad}/121 cells with the model's winner`);
  if (bad || cellsBad) failed++;
}

// ---------------------------------------------------------------------------
// Worth
// ---------------------------------------------------------------------------

let W = { ...WORTH };

if (want("worth") || want("matrix") || want("armies") || want("gold")) {
  const types = GENERIC_TYPES.map((t) => [t, (n) => ({ type: t, n })]);
  const m = measure(types);
  W = { ...W, ...m.W };
  if (want("worth")) {
    console.log("\n## Worth — militia-equivalents per soldier (battle.md §10.1)\n");
    console.log(worthHead());
    for (const t of GENERIC_TYPES) console.log(worthRow(t, troop(t), m.vs, m.W));
    console.log("\nFor rules/data/troops.js:\n");
    console.log(
      GENERIC_TYPES.map((t) => `${t}: ${+m.W[t].toFixed(2)}`)
        .join(", ")
        .replace(/(.{1,96})(, |$)/g, "$1,\n")
        .trim(),
    );
  }
}

if (want("cultures")) {
  console.log("\n## Cultures — each culture's troops, worth in militia (army.md §4)\n");
  const all = [];
  for (const c of Object.keys(CULTURES)) for (const id of cultureRoster(c)) all.push(id);
  const types = all.map((id) => [id, (n) => ({ type: id, n })]);
  const m = measure(types);
  const cols = Object.keys(CULTURES);
  const generic = [...new Set(all.map((id) => troop(id).type))];
  console.log(
    `${padr("troop", 13)}${pad("generic", 8)}${cols.map((c) => pad(CULTURES[c].name.slice(0, 8), 10)).join("")}`,
  );
  for (const g of generic) {
    const cells = cols.map((c) => {
      const id = `${c}:${g}`;
      return pad(m.W[id] ? m.W[id].toFixed(2) : "—", 10);
    });
    console.log(`${padr(g, 13)}${pad((W[g] ?? WORTH[g]).toFixed(2), 8)}${cells.join("")}`);
  }
  console.log("\nFor rules/data/troops.js:\n");
  console.log(all.map((id) => `"${id}": ${+m.W[id].toFixed(2)}`).join(", "));
}

// ---------------------------------------------------------------------------
// Counters, armies, gold
// ---------------------------------------------------------------------------

if (want("matrix")) {
  console.log("\n## Counter matrix — 40 militia-worth a side (battle.md §10.2)\n");
  console.log("Row attacks column. Cell = % of the row's men still alive if the row");
  console.log("wins, negative = % of the column's men alive when the column wins.\n");
  printMatrix(counterMatrix(W));
}

/** A doctrine at a worth, as the model built it: one squad per troop type. */
function build(name, budget, culture = null) {
  return buildArmy(culture, name, budget).map(({ type, n }) => ({ type, n }));
}

function roundRobin(names, make, label) {
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
        const r = fight([make(a), make(c)], seed);
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
  const order = Object.entries(wins).sort((x, y) => y[1] - x[1]);
  console.log(
    `\n${label} of ${names.length * SEEDS.length}: ${order.map(([n, w]) => `${n} ${w}`).join(", ")}`,
  );
}

if (want("armies")) {
  const BUDGET = 150;
  const names = Object.keys(DOCTRINES);
  console.log(`\n## Armies — ${BUDGET} militia-worth a side (battle.md §10.3)\n`);
  for (const n of names) {
    const a = build(n, BUDGET);
    console.log(
      `${padr(n, 11)} ${a.map((s) => `${s.n} ${s.type}`).join(", ")}  (${a.reduce((m, s) => m + s.n, 0)} men)`,
    );
  }
  roundRobin(names, (n) => build(n, BUDGET), "Wins");

  // The same doctrines as the game fields them: split into squads of 40.
  console.log(`\nAs the game fields them — squads of at most 40 men:`);
  roundRobin(names, (n) => armySquads(build(n, BUDGET)), "Wins");
}

/** What a soldier costs in gold, iron at 30 and horses at 40 (army.md §3). */
export const PRICE = {
  levy: 10,
  militia: 30,
  bowman: 30,
  squire: 55 + 40,
  footman: 70 + 30,
  spearman: 70 + 30,
  archer: 70,
  horseman: 125 + 30 + 40,
  manatarms: 150 + 60,
  pikeman: 150 + 60,
  longbow: 240,
  crossbow: 150 + 30,
  knight: 270 + 90 + 80,
  horsearcher: 220 + 30 + 40,
};

if (want("gold")) {
  const BUDGET = 12000;
  const CAP = 110;
  const names = Object.keys(DOCTRINES);
  const buy = (name) => {
    const raw = Object.entries(DOCTRINES[name].mix).map(([type, share]) => ({
      type,
      n: (BUDGET * share) / PRICE[type],
    }));
    const men = raw.reduce((m, s) => m + s.n, 0);
    const k = men > CAP ? CAP / men : 1;
    return raw.map((s) => ({ type: s.type, n: Math.max(1, Math.round(s.n * k)) }));
  };
  const spent = (a) => a.reduce((g, s) => g + s.n * PRICE[s.type], 0);
  console.log(
    `\n## Armies at equal gold — ${BUDGET} a side, at most ${CAP} men (battle.md §10.4)\n`,
  );
  for (const n of names) {
    const a = buy(n);
    const worth = a.reduce((m, s) => m + s.n * W[s.type], 0);
    console.log(
      `${padr(n, 11)} ${a.map((s) => `${s.n} ${s.type}`).join(", ")}  (${a.reduce((m, s) => m + s.n, 0)} men, worth ${Math.round(worth)}, ${spent(a)} gold)`,
    );
  }
  roundRobin(names, buy, "Wins");
}

// ---------------------------------------------------------------------------
// Cultures' armies
// ---------------------------------------------------------------------------

if (want("cultures")) {
  // Each culture's version of each doctrine against the six generic ones, at
  // equal worth: does a culture's tree make its armies better or worse?
  const BUDGET = 150;
  const names = Object.keys(DOCTRINES);
  console.log(
    `\n## Cultures' armies — wins of 18 against the generic doctrines, ${BUDGET} worth\n`,
  );
  console.log(padr("", 11) + names.map((n) => pad(n, 11)).join(""));
  console.log(
    padr("generic", 11) +
      names
        .map((a) => {
          let w = 0;
          for (const c of names)
            for (const seed of SEEDS)
              if (fight([build(a, BUDGET), build(c, BUDGET)], seed).winner === 0) w++;
          return pad(w, 11);
        })
        .join(""),
  );
  for (const cu of Object.keys(CULTURES)) {
    let line = padr(CULTURES[cu].name, 11);
    for (const a of names) {
      let w = 0;
      for (const c of names)
        for (const seed of SEEDS)
          if (fight([build(a, BUDGET, cu), build(c, BUDGET)], seed).winner === 0) w++;
      line += pad(w, 11);
    }
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Formations and scale
// ---------------------------------------------------------------------------

if (want("formations")) {
  console.log("\n## Formations — wins of 9 for the first side (battle.md §10.5)\n");
  const score = (a, c) => {
    let w = 0;
    let l = 0;
    let dead = 0;
    for (const seed of SEEDS9) {
      const r = fight([a, c], seed);
      if (r.winner === 0) w++;
      else if (r.winner === 1) l++;
      dead += r.sides[1].dead;
    }
    return `${w}/${l}/${SEEDS9.length - w - l} (kills ${Math.round(dead / SEEDS9.length)})`;
  };
  const sq = (type, n, formation = "line") => [{ type, n, formation }];
  const rows = [
    ["equal numbers, 40 v 40", (t, f) => score(sq(t, 40, f), sq(t, 40))],
    ["outnumbered, 40 v 56", (t, f) => score(sq(t, 40, f), sq(t, 56))],
    ["against a charge, 40 v 12 knights", (t, f) => score(sq(t, 40, f), sq("knight", 12))],
  ];
  for (const t of ["militia", "footman", "spearman"]) {
    console.log(`${t}`);
    for (const [label, run] of rows) {
      console.log(
        `  ${padr(label, 34)} line ${padr(run(t, "line"), 18)} wide ${padr(run(t, "wide"), 18)} deep ${run(t, "deep")}`,
      );
    }
  }
}

if (want("scale")) {
  console.log("\n## Scale — what doubling buys (battle.md §10.6)\n");
  console.log("N attackers v 30 of the same troop: rounds, and each side's dead.");
  console.log(
    "To kill 12 of 30, Lanchester's linear law costs 60 men 12 and the square law about 5.\n",
  );
  for (const model of [true, false]) {
    console.log(model ? "Without the split (the model):" : "With the AI's split:");
    for (const t of ["militia", "archer", "knight"]) {
      const cells = [45, 60, 90].map((n) => {
        const r = fight([[{ type: t, n }], [{ type: t, n: 30 }]], 1, { model });
        return `${pad(n, 3)} v 30: r${pad(r.rounds, 2)} dead ${pad(r.sides[0].dead, 2)} : ${pad(r.sides[1].dead, 2)}`;
      });
      console.log(`  ${padr(t, 8)} ${cells.join("   ")}`);
    }
  }
}

// ---------------------------------------------------------------------------
// What a bonus, a hero and an ability are worth
// ---------------------------------------------------------------------------

/**
 * What a bonus is worth, in troops. One army against itself only varies the
 * dice, and a single extra man can change how two lines meet, so the answer
 * jumps about; instead every doctrine fights its own mirror, 120 worth a
 * side, 8 seeds each, with the plain side scaled up in 5% steps until it
 * scores half (a draw counting half a win). The crossing is read off between
 * the last two steps.
 */
const POOL = Object.keys(DOCTRINES);
const POOL_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const poolArmy = (d, k) => armySquads(buildArmy(null, d, 120 * k));

function breakEven(opts = {}) {
  const score = (k) => {
    let p = 0;
    let n = 0;
    for (const d of POOL)
      for (const seed of POOL_SEEDS) {
        const r = fight([poolArmy(d, 1), poolArmy(d, k)], seed, opts);
        p += r.winner === 1 ? 1 : r.winner == null ? 0.5 : 0;
        n++;
      }
    return p / n;
  };
  let prev = score(1);
  if (prev >= 0.5) return "≤ 0%";
  for (let k = 1.05; k < 2.01; k += 0.05) {
    const now = score(k);
    if (now >= 0.5) {
      const at = k - 0.05 + (0.05 * (0.5 - prev)) / (now - prev || 1);
      return `+${Math.round((at - 1) * 100)}%`;
    }
    prev = now;
  }
  return ">+100%";
}

if (want("mods")) {
  console.log("\n## Modifiers — each bonus, as the % more troops it is worth (battle.md §10.7)\n");
  const MODS = {
    "melee +10%": { melee: 1.1 },
    "melee +30%": { melee: 1.3 },
    "ranged +10%": { ranged: 1.1 },
    "ranged +30%": { ranged: 1.3 },
    "def +1": { def: 1 },
    "def +3": { def: 3 },
    "atk +1": { atk: 1 },
    "morale +10": { morale: 10 },
    "morale +25": { morale: 25 },
  };
  for (const [name, mod] of Object.entries(MODS)) {
    console.log(`${padr(name, 12)} ≈ ${breakEven({ mods: [mod, {}] })} troops`);
  }
}

if (want("hero")) {
  console.log("\n## The hero — a Skirmish hero, as % more troops (army.md §6)\n");
  console.log("The plain army against the same army and a hero: first the hero's");
  console.log("bonuses alone, then with the banner squad (aura, household), then with");
  console.log("the abilities, spent by the AI's rules.\n");
  console.log(
    `${padr("level", 7)}${pad("bonuses", 10)}${pad("+ banner", 10)}${pad("+ abilities", 13)}`,
  );
  for (const level of [1, 5, 10, 20]) {
    const full = skirmishHero(null, level);
    const bare = { ...full, abilities: [] };
    const a = breakEven({ heroes: [bare, null], bannerless: true });
    const b = breakEven({ heroes: [bare, null] });
    const c = breakEven({ heroes: [full, null] });
    console.log(`${padr(level, 7)}${pad(a, 10)}${pad(b, 10)}${pad(c, 13)}`);
  }
}

if (want("abilities")) {
  console.log("\n## Abilities — each one alone, as % more troops (battle.md §6)\n");
  console.log("Both sides have a level-5 hero and banner; one knows a single ability");
  console.log("and spends Valor on it by the AI's rules, the other knows none. Uses is");
  console.log("how often a battle the AI found a reason to.\n");
  const none = { ...skirmishHero(null, 5), abilities: [] };
  console.log(`${padr("ability", 15)}${pad("uses", 6)}  worth`);
  for (const id of [null, ...Object.keys(ABILITIES)]) {
    const h = { ...none, abilities: id ? [id] : [] };
    let uses = 0;
    let n = 0;
    for (const d of POOL)
      for (const seed of POOL_SEEDS) {
        const b = createBattle({
          seed,
          sides: [
            { squads: [...poolArmy(d, 1), bannerSquad(h)], hero: h },
            { squads: [...poolArmy(d, 1), bannerSquad(none)], hero: none },
          ],
        });
        while (!b.over) playRound(b, { record: false });
        uses += b.sides[0].used.length;
        n++;
      }
    console.log(
      `${padr(id ? ABILITIES[id].name : "(none)", 15)}${pad((uses / n).toFixed(1), 6)}  ${breakEven({ heroes: [h, none] })}`,
    );
  }
}

if (want("mixed")) {
  console.log("\n## Mixed squads — one squad of two troops against the two alone\n");
  const pairs = [
    ["militia", "footman"],
    ["levy", "militia"],
    ["footman", "manatarms"],
    ["bowman", "archer"],
    ["horseman", "knight"],
  ];
  const types = [];
  for (const [a, c] of pairs) {
    types.push([
      `${a}+${c}`,
      (n) => ({
        units: [
          { type: a, n: Math.ceil(n / 2) },
          { type: c, n: Math.floor(n / 2) },
        ],
      }),
    ]);
  }
  const m = measure(types);
  console.log(`${padr("squad", 20)}${pad("mixed", 8)}${pad("mean of the two", 17)}`);
  for (const [a, c] of pairs) {
    const k = `${a}+${c}`;
    console.log(
      `${padr(k, 20)}${pad(m.W[k].toFixed(2), 8)}${pad(((W[a] + W[c]) / 2).toFixed(2), 17)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Length and cost
// ---------------------------------------------------------------------------

if (want("length")) {
  console.log("\n## Length — rounds per battle (battle.md §10.8)\n");
  const roster = GENERIC_TYPES.filter((t) => t !== "troll");
  let seed = 100;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const report = (label, rounds, stale) => {
    rounds.sort((a, c) => a - c);
    const q = (p) => rounds[Math.floor(p * (rounds.length - 1))];
    console.log(
      `${padr(label, 34)} p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}  max ${q(1)}  stalemates ${stale}`,
    );
  };
  let rounds = [];
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
  report("200 random mid-sized battles", rounds, stale);
  // Skirmishes as the game sets them up: cultures, doctrines, heroes.
  const cultures = Object.keys(CULTURES);
  const docs = [...Object.keys(DOCTRINES), "random"];
  rounds = [];
  stale = 0;
  for (let i = 0; i < 200; i++) {
    const side = () => ({
      culture: cultures[Math.floor(rand() * 4)],
      doctrine: docs[Math.floor(rand() * docs.length)],
      worth: 60 + Math.floor(rand() * 5) * 40,
      hero: [0, 1, 5, 10, 20][Math.floor(rand() * 5)],
      ai: true,
    });
    const b = skirmish({
      seed: i,
      terrain: rand() < 0.5 ? "woods" : "open",
      sides: [side(), side()],
    });
    while (!b.over) playRound(b, { record: false });
    rounds.push(b.round);
    if (b.stalemate) stale++;
  }
  report("200 random skirmishes", rounds, stale);
}

if (want("perf")) {
  console.log("\n## Perf — what a round and a battle cost in Node (tech.md §5)\n");
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
  for (let i = 0; i < 20; i++) fight([big, big], i); // warm up
  let worst = 0;
  let rounds = 0;
  const t0 = performance.now();
  const N = 50;
  for (let i = 0; i < N; i++) {
    const b = createBattle({ seed: i, sides: [{ squads: big }, { squads: big }] });
    while (!b.over) {
      const r0 = performance.now();
      playRound(b, { record: true });
      worst = Math.max(worst, performance.now() - r0);
      rounds++;
    }
  }
  const ms = (performance.now() - t0) / N;
  console.log(
    `8 squads / 200 men a side, played as Go plays it: ${ms.toFixed(1)} ms a battle ` +
      `(${(rounds / N).toFixed(1)} rounds), ${((ms * N) / rounds).toFixed(2)} ms a round with its ` +
      `timeline, worst round ${worst.toFixed(1)} ms`,
  );
  const t1 = performance.now();
  for (let i = 0; i < N; i++) fight([big, big], i);
  console.log(
    `auto-resolved, no timeline: ${((performance.now() - t1) / N).toFixed(1)} ms a battle`,
  );
  const odd = skirmish({
    seed: 3,
    sides: [
      { culture: "vale", doctrine: "balanced", worth: 150, hero: 5 },
      { culture: "fen", doctrine: "yeomen", worth: 150, hero: 5 },
    ],
  });
  const t2 = performance.now();
  for (let i = 0; i < 5; i++) odds(odd);
  console.log(
    `odds (8 auto-resolves) for two 150-worth armies with heroes: ${((performance.now() - t2) / 5).toFixed(0)} ms`,
  );
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
