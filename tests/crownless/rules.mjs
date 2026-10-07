/**
 * The battle rules, checked in Node: no browser, about a second.
 *
 *     npm run test:crownless:rules
 *
 * Each check builds a small position, runs the rules, and compares with a
 * number worked out by hand. battle-sim.mjs measures how the rules play;
 * this says they do what battle.md and army.md say they do.
 */
import {
  createBattle,
  playRound,
  beginRound,
  step,
  finishRound,
  edge,
  speedOf,
  setFormation,
  useAbility,
  aftermath,
  CHARGE_RUNUP,
} from "../../games/crownless/rules/battle.js";
import {
  armySquads,
  skirmishHero,
  bannerSquad,
  skirmish,
  oddsWord,
  band,
  deploy,
  applyPreset,
} from "../../games/crownless/rules/battle-setup.js";
import { troop, cultureTroop, worthOf } from "../../games/crownless/rules/data/troops.js";
import { give } from "../../games/crownless/rules/battle-ai.js";

let failed = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  — ${detail}` : ""}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const run = (b) => {
  while (!b.over) playRound(b, { record: false });
  return b;
};

// --- The curve ---------------------------------------------------------------

console.log("\n# The edge curve (battle.md §3.1)\n");
check("+5 is ×1.469", near(edge(5, 0), 1.4693280768, 1e-9), edge(5, 0));
check("−5 is ×0.681", near(edge(0, 5), 0.680583197, 1e-9), edge(0, 5));
check(
  "tenths of a point count (pierced armour 1.2)",
  near(edge(0, 1.2), 0.911783, 1e-6),
  edge(0, 1.2),
);

// --- Troops and cultures -------------------------------------------------------

console.log("\n# Cultures (army.md §4)\n");
check("Valemark's Lance: knights charge 15", troop("vale:knight").charge === 15);
check("Valemark infantry −4 morale: footmen 62", troop("vale:footman").morale === 62);
check("Fenreach's Greenwood: longbows reach 100 m", troop("fen:longbow").range === 100);
check(
  "Fenreach men-at-arms: def 6, speed 4.5",
  troop("fen:manatarms").def === 6 && troop("fen:manatarms").speed === 4.5,
);
check("Kharum men-at-arms: +1 def and Stone-born +1, so 9", troop("hold:manatarms").def === 9);
check("Kharum crossbows: armour 4", troop("hold:crossbow").armor === 4);
check("Ulus horse archers: 16 volleys", troop("ulus:horsearcher").ammo === 16);
check(
  "Ulus knights are Lancers: armour 4, speed 10",
  troop("ulus:knight").name === "Steppe Lancer" &&
    troop("ulus:knight").armor === 4 &&
    troop("ulus:knight").speed === 10,
);
check(
  "a culture's troop name is its word and the generic",
  troop("vale:footman").name === "Vale Footman",
);
check("elites keep their own names", troop("vale:bannerknight").name === "Banner Knight");
check(
  "Ulus has no men-at-arms: it fields footmen",
  cultureTroop("ulus", "manatarms") === "ulus:footman",
);
check(
  "Ulus has no crossbows or longbows: archers",
  cultureTroop("ulus", "crossbow") === "ulus:archer",
);
check("Fenreach has no knights: horsemen", cultureTroop("fen", "knight") === "fen:horseman");
check("Valemark has no longbows: crossbows", cultureTroop("vale", "longbow") === "vale:crossbow");

// --- The Skirmish hero ---------------------------------------------------------

console.log("\n# The hero (army.md §6)\n");
const h10 = skirmishHero("vale", 10);
check(
  "level 10: attributes 3, skills at rank 2",
  h10.might === 3 &&
    h10.cunning === 3 &&
    h10.leadership === 2 &&
    h10.tactics === 2 &&
    h10.offense === 2,
);
check(
  "level 10 knows Inspire (Leadership Advanced)",
  h10.abilities.join() === "rally,holdline,lance,inspire",
);
check("level 1 does not", skirmishHero("fen", 1).abilities.join() === "rally,holdline,stakes");
check(
  "the hero: 60 + 4 × level hp, 6 + level/5 atk",
  troop("hero:16").hp === 124 && troop("hero:16").atk === 9,
);
const h12 = skirmishHero("vale", 12);
check(
  "level 12: attributes 4, skills still at rank 2",
  h12.might === 4 && h12.guard === 4 && h12.leadership === 2,
);
{
  const b = createBattle({
    sides: [
      { squads: [{ type: "footman", n: 20 }, bannerSquad(h10)], hero: h10 },
      { squads: [{ type: "footman", n: 20 }] },
    ],
  });
  const s = b.squads.find((q) => q.side === 0 && !q.banner);
  // Might 3 → +1 atk; Guard 3 → +1 def; Command 3 + Leadership 2 × 4 → +11 morale.
  check(
    "the hero's bonuses reach every squad: morale 66 + 11",
    s.morale === 77 && s.cap === 77,
    s.morale,
  );
  check(
    "Valor starts at 2, at most 7 with Cunning 3",
    b.sides[0].valor === 2 && b.sides[0].valorMax === 7,
  );
  playRound(b, { record: false });
  check("and grows by 1 a round", b.sides[0].valor === 3);
  check(
    "a household of 4 footmen fights round the hero",
    b.squads
      .find((q) => q.banner)
      .units.map((u) => `${u.type}×${u.n0}`)
      .join() === "vale:footman×4,hero:10×1",
  );
}
{
  // Longbows shooting a banner squad: the household dies first, the hero last.
  const h = skirmishHero("vale", 1);
  const b = createBattle({
    seed: 3,
    sides: [
      { squads: [{ ...bannerSquad(h), x: 50, y: 100 }], hero: h, place: true },
      { squads: [{ type: "longbow", n: 60, x: 50, y: 40 }], place: true },
    ],
  });
  give(b, 0, [0], { kind: "hold" });
  // Nerve of iron, so it stands and is shot to the last man instead of running.
  b.squads[0].morale = b.squads[0].cap = 10000;
  let ok = true;
  let heroHit = false;
  for (let r = 0; r < 20 && !b.over; r++) {
    beginRound(b);
    for (let i = 0; i < 30; i++) {
      step(b);
      const [guards, hero] = b.squads[0].units;
      if (hero.pool > 0 || hero.n === 0) heroHit = true;
      if (heroHit && guards.n > 0) ok = false;
    }
    finishRound(b);
  }
  check("the hero is the last of the banner squad to fall", ok && heroHit);
}

// --- Squads ----------------------------------------------------------------------

console.log("\n# Squads (battle.md §2)\n");
{
  const list = armySquads([{ type: "levy", n: 100 }]);
  check(
    "a role past 40 men splits into equal squads",
    list.map((s) => s.units[0].n).join() === "33,33,34",
  );
  const big = armySquads([{ type: "militia", n: 400 }]);
  check(
    "an army fields at most 8 squads",
    big.length === 8 && big.every((s) => s.units[0].n === 50),
  );
  const mixed = armySquads([
    { type: "militia", n: 25 },
    { type: "footman", n: 10 },
  ]);
  check(
    "one role under 40 is one squad of both troops, best first",
    mixed.length === 1 && mixed[0].units.map((u) => u.type).join() === "footman,militia",
  );
}
{
  const b = createBattle({
    sides: [
      {
        squads: [
          {
            units: [
              { type: "horseman", n: 10 },
              { type: "knight", n: 10 },
            ],
          },
        ],
      },
      { squads: [{ type: "militia", n: 10 }] },
    ],
  });
  check("a mixed squad moves at its slowest member's pace", speedOf(b, b.squads[0]) === 9);
  check("and starts at its men's average morale", b.squads[0].morale === 71);
}
{
  const b = createBattle({
    seed: 2,
    sides: [
      {
        squads: [
          {
            units: [
              { type: "militia", n: 20 },
              { type: "levy", n: 20 },
            ],
            x: 50,
            y: 100,
          },
        ],
        place: true,
      },
      { squads: [{ type: "longbow", n: 40, x: 50, y: 40 }], place: true },
    ],
  });
  give(b, 0, [0], { kind: "hold" });
  for (let r = 0; r < 3; r++) playRound(b, { record: false });
  const [m, l] = b.squads[0].units;
  check(
    "arrows into a mixed squad fall on both its troops",
    m.n < 20 && l.n < 20,
    `militia ${m.n}, levy ${l.n}`,
  );
}
{
  const b = createBattle({
    sides: [{ squads: [{ type: "footman", n: 40 }] }, { squads: [{ type: "militia", n: 10 }] }],
  });
  setFormation(b, 0, "wide");
  check("Wide halves the ranks: 40 footmen 20 files across", b.squads[0].files0 === 20);
  check("and costs 5 morale and cap", b.squads[0].morale === 61 && b.squads[0].cap === 61);
  setFormation(b, 0, "line");
  check("Line gives both back", b.squads[0].files0 === 10 && b.squads[0].cap === 66);
}

// --- Orders and the field -------------------------------------------------------

console.log("\n# Orders and the field (battle.md §5, §7)\n");
{
  const make = (woods) =>
    createBattle({
      woods,
      sides: [
        { squads: [{ type: "footman", n: 20, x: 50, y: 110 }], place: true, ai: false },
        { squads: [{ type: "militia", n: 10, x: 50, y: 10 }], place: true },
      ],
    });
  const open = make([]);
  give(open, 0, [0], { kind: "move", x: 50, y: 60 });
  playRound(open, { record: false });
  check(
    "a move covers 4.5 m a second: 13.5 m a round",
    near(open.squads[0].y, 96.5, 1e-6),
    open.squads[0].y,
  );
  const side = make([]);
  give(side, 0, [0], { kind: "move", x: 95, y: 110 });
  playRound(side, { record: false });
  check(
    "and keeps its facing, even marching sideways",
    side.squads[0].x > 60 && side.squads[0].fy === -1 && side.squads[0].fx === 0,
  );
  const wood = make([{ x: 50, y: 100, rx: 30, ry: 30 }]);
  give(wood, 0, [0], { kind: "move", x: 50, y: 60 });
  playRound(wood, { record: false });
  check("woods slow it to 60%: 8.1 m", near(wood.squads[0].y, 101.9, 1e-6), wood.squads[0].y);
}
{
  const b = createBattle({
    sides: [
      { squads: [{ type: "footman", n: 20, x: 50, y: 110 }], place: true, ai: false },
      { squads: [{ type: "militia", n: 10, x: 50, y: 10 }], place: true },
    ],
  });
  give(b, 0, [0], { kind: "fallback" });
  playRound(b, { record: false });
  check("Fall back heads for your own edge", b.squads[0].y > 110);
}
check(
  "your band is 45 m deep, 10 m more a Tactics rank",
  band(0, 0).y0 === 95 && band(0, 2).y0 === 75 && band(1, 1).y1 === 55,
);

// --- Deployment presets --------------------------------------------------------

console.log("\n# Deployment presets (battle.md §1)\n");

{
  // Two squads of 30 foot (4 ranks: 12 m wide, 4 m apart, centres 42 and
  // 58), 20 archers behind at 50, two squads of 20 horse (2 ranks: 15 m
  // wide) and a banner. The line stands at y 110.
  const specs = [
    { type: "footman", n: 30 },
    { type: "footman", n: 30 },
    { type: "archer", n: 20 },
    { type: "horseman", n: 20 },
    { type: "horseman", n: 20 },
    bannerSquad(skirmishHero("vale", 1)),
  ].map((s, id) => ({ ...s, id }));
  const by = (list) => Object.fromEntries(list.map((s) => [s.id, s]));
  const kinds = (list) => list.map((s) => s.cmd.kind).join(" ");

  let d = by(deploy(specs, 0, "line"));
  check(
    "Line: every squad holds, the banner keeps behind",
    kinds(Object.values(d)) === "hold hold hold hold hold escort",
    kinds(Object.values(d)),
  );
  check("Line: a horse squad on each wing", d[3].x === 10 && d[4].x === 90);

  d = by(deploy(specs, 0, "hammer"));
  // Massed from 4 m in, 3 m apart: centres 96 − 7.5 and 96 − 15 − 3 − 7.5.
  check(
    "Hammer: both horse squads side by side on the right, 8 m ahead of the line",
    d[3].x === 88.5 && d[4].x === 70.5 && d[3].y === 102 && d[4].y === 102,
    `${d[3].x},${d[3].y} ${d[4].x},${d[4].y}`,
  );
  check(
    "Hammer: the horse charges, the foot holds",
    kinds([d[3], d[4], d[0], d[1], d[2]]) === "charge charge hold hold hold",
    kinds([d[3], d[4], d[0], d[1], d[2]]),
  );

  d = by(deploy(specs, 0, "refused"));
  // The line shifts 14 m right and swings 0.45 rad back about its right end:
  // the left squad, 16 m along, drops 16 × sin 0.45 = 6.96 m.
  check(
    "Refused: the right of the line moves over, the left stands back",
    d[1].x === 72 && d[1].y === 110 && Math.abs(d[0].y - 116.96) < 0.01,
    `${d[1].x},${d[1].y} ${d[0].y.toFixed(2)}`,
  );
  check(
    "Refused: the line faces half-left, along the swing",
    Math.abs(d[0].fx + 0.435) < 0.001 && Math.abs(d[0].fy + 0.9) < 0.001,
    `${d[0].fx.toFixed(3)},${d[0].fy.toFixed(3)}`,
  );
  check(
    "Refused: the right and the horse advance, the left holds",
    kinds([d[1], d[2], d[3], d[4], d[0]]) === "advance advance advance advance hold",
    kinds([d[1], d[2], d[3], d[4], d[0]]),
  );

  d = by(deploy(specs, 0, "defensive"));
  check(
    "Defensive: archers 12 m before the foot, horse either side of the banner behind",
    d[2].y === 102 && d[0].y === 114 && d[3].x === 36 && d[4].x === 64 && d[3].y === 126,
    `${d[2].y} ${d[0].y} ${d[3].x},${d[3].y} ${d[4].x}`,
  );
  check(
    "Defensive: the archers skirmish, everyone else holds",
    kinds(Object.values(d)) === "hold hold skirmish hold hold escort",
    kinds(Object.values(d)),
  );

  const b = skirmish({
    seed: 3,
    terrain: "open",
    sides: [
      { culture: "vale", doctrine: "balanced", worth: 100, hero: 5 },
      { culture: "fen", doctrine: "yeomen", worth: 100, hero: 5 },
    ],
  });
  check(
    "the AI's squads take no orders from its deployment",
    b.squads.every((s) => s.side === 0 || s.cmd === null),
  );
  applyPreset(b, 1, "hammer");
  check(
    "nor from a preset",
    b.squads.every((s) => s.side === 0 || s.cmd === null),
  );
  applyPreset(b, 0, "refused");
  check(
    "a preset turns the battle's squads as well as moving them",
    b.squads.some((s) => s.side === 0 && s.fx < -0.1),
  );
  applyPreset(b, 0, "line");
  const mine = b.squads.filter((s) => s.side === 0);
  check(
    "a preset taken back puts orders and facing back too",
    mine.every((s) => s.cmd.kind === (s.banner ? "escort" : "hold") && s.fx === 0 && s.fy === -1),
    kinds(mine),
  );
}

// --- Abilities -------------------------------------------------------------------

console.log("\n# Abilities (battle.md §6)\n");
{
  const h = { ...skirmishHero("vale", 5), abilities: ["rally", "holdline", "charge", "loose"] };
  const make = () =>
    createBattle({
      sides: [
        {
          squads: [
            { type: "footman", n: 20, x: 40, y: 110 },
            { type: "horseman", n: 10, x: 80, y: 110 },
            { type: "archer", n: 20, x: 60, y: 118 },
            { ...bannerSquad(h), x: 50, y: 125 },
          ],
          hero: h,
          place: true,
          ai: false,
        },
        { squads: [{ type: "militia", n: 30, x: 50, y: 20 }], place: true },
      ],
    });
  let b = make();
  b.sides[0].valor = 6;
  const foot = b.squads[0];
  foot.morale = 10;
  foot.state = "routing";
  check("Rally needs 3 Valor", useAbility(b, 0, "rally") === null && b.sides[0].valor === 3);
  check("and only once a round", useAbility(b, 0, "rally") === "already used this round");
  beginRound(b);
  // Leadership 1 + Command 2 lift the cap to 72; +25 on 10 is 35.
  check(
    "routers near the banner rally with +25",
    foot.state === "wavering" && foot.morale === 35,
    `${foot.state} ${foot.morale}`,
  );
  for (let i = 0; i < 30; i++) step(b);
  finishRound(b);
  check("then it rests for two rounds", b.sides[0].cool.rally === 2);

  b = make();
  b.sides[0].valor = 6;
  check("Hold the Line needs a squad", useAbility(b, 0, "holdline") === "pick one of your squads");
  useAbility(b, 0, "holdline", 0);
  give(b, 0, [0], { kind: "move", x: 40, y: 60 });
  playRound(b, { record: false });
  check("Hold the Line: the squad does not move", b.squads[0].y === 110);

  b = make();
  b.sides[0].valor = 6;
  useAbility(b, 0, "charge");
  beginRound(b);
  check(
    "Charge!: every horse squad has its run-up",
    b.squads[1].runUp === CHARGE_RUNUP && b.squads[0].runUp === 0,
  );

  b = make();
  b.sides[0].valor = 2;
  check("Charge! costs 3", useAbility(b, 0, "charge") === "needs 3 Valor");
  check("and nothing unknown can be used", useAbility(b, 0, "inspire") === "not known");
}

// --- Whole battles ----------------------------------------------------------------

console.log("\n# Whole battles\n");
{
  const setup = {
    seed: 77,
    terrain: "woods",
    sides: [
      { culture: "hold", doctrine: "shieldwall", worth: 120, hero: 5, ai: true },
      { culture: "ulus", doctrine: "steppe", worth: 120, hero: 5 },
    ],
  };
  const a = run(skirmish(setup));
  const b = run(skirmish(setup));
  check("the same seed fights the same battle", JSON.stringify(a) === JSON.stringify(b));
  const c = skirmish(setup);
  for (let i = 0; i < 3; i++) playRound(c, { record: false });
  const d = run(JSON.parse(JSON.stringify(c)));
  check(
    "a battle saved mid-way and loaded plays out the same",
    JSON.stringify(d) === JSON.stringify(a),
  );
}
{
  // A mirror match with fortune off must stay a mirror. Foot and horse
  // archers is the army where it didn't: equal lines wrapped each other by
  // a rounding error, and side 1 broke a hair early every time.
  const army = [
    { type: "footman", n: 30 },
    { type: "horsearcher", n: 20 },
  ];
  const h = skirmishHero(null, 5);
  const b = createBattle({
    seed: 1,
    opts: { luck: 0 },
    sides: [0, 1].map(() => ({ squads: [...army, bannerSquad(h)], hero: h })),
  });
  // Ten rounds: long enough for an edge to show (it did by round 5), short
  // of where plain rounding drift — coordinates near 140 carry coarser bits
  // than near 0 — grows past a millimetre in a long melee.
  for (let i = 0; i < 10 && !b.over; i++) playRound(b, { record: false });
  const K = b.squads.length / 2;
  const mirrored = b.squads.slice(0, K).every((a, k) => {
    const c = b.squads[k + K];
    return near(a.x, c.x, 1e-3) && near(a.y, 140 - c.y, 1e-3) && a.n === c.n && a.state === c.state;
  });
  check(
    "a mirror match without fortune stays a mirror: no side moves first",
    mirrored,
    `round ${b.round}`,
  );
}
{
  const b = createBattle({
    seed: 1,
    sides: [
      { squads: [{ type: "militia", n: 90, x: 50, y: 80 }], place: true },
      { squads: [{ type: "militia", n: 30, x: 50, y: 60 }], place: true },
    ],
  });
  for (let i = 0; i < 4 && !b.over; i++) playRound(b, { record: false });
  check(
    "a line overhanging its enemy by its wrap and more splits its idle files off",
    b.squads.length === 3,
    `${b.squads.length} squads`,
  );
  const sum = b.squads.filter((s) => s.side === 0).reduce((m, s) => m + s.n0, 0);
  check("and the two halves still count the 90 it started with", sum === 90);
}
{
  const b = run(
    createBattle({
      seed: 9,
      sides: [{ squads: [{ type: "knight", n: 30 }] }, { squads: [{ type: "militia", n: 60 }] }],
    }),
  );
  const after = aftermath(b, { worthOf });
  const w = b.winner;
  const dead = b.squads.filter((s) => s.side === w).reduce((m, s) => m + s.n0 - s.n, 0);
  const sum = (o) => Object.values(o).reduce((a, c) => a + c, 0);
  check(
    "the winner's dead are killed or wounded, every one",
    sum(after[w].killed) + sum(after[w].wounded) === dead,
  );
  check(
    "the loser's wounded are the winner's prisoners",
    sum(after[1 - w].captured) === sum(after[w].taken),
  );
}
check(
  "odds read as words (battle.md §12)",
  [8, 7, 6, 5, 3, 2, 1, 0].map(oddsWord).join() ===
    "Overwhelming,Favourable,Favourable,Even,Even,Risky,Risky,Hopeless",
);

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
