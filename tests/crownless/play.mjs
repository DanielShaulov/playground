/**
 * Crownless played in a real browser, through the screen a person uses.
 *
 *     npm start                     # in one terminal
 *     npm run test:crownless        # in another
 *
 * One block per milestone. M1 is the battle sandbox: a whole Skirmish played
 * through the bottom bar alone, then the rest of what a thumb can do — tap
 * squads and ground, deploy, use an ability, retreat, hand the battle to the
 * AI — each read back from the save. Expected values are literals worked out
 * by hand (harness.mjs says why the rules may build positions but never
 * compute an answer).
 */
import { openGame, createReport, saveOf } from "./harness.mjs";
import { createBattle } from "../../games/crownless/rules/battle.js";
import { skirmishHero, bannerSquad } from "../../games/crownless/rules/battle-setup.js";

const report = createReport();
const { check } = report;
const game = await openGame();
const { page, press, read, settle } = game;

/** A small battle you command, placed by hand. */
function battle({ mine, theirs, hero = 0, seed = 7 }) {
  const h = hero ? skirmishHero("vale", hero) : null;
  const b = createBattle({
    seed,
    sides: [
      {
        squads: h ? [...mine, { ...bannerSquad(h), x: 50, y: 128 }] : mine,
        place: true,
        ai: false,
        hero: h,
        culture: "vale",
      },
      { squads: theirs, place: true, ai: true, culture: "fen" },
    ],
  });
  return b;
}

const resultShown = () => page.locator('[aria-label="Result"]').isVisible();

// ---------------------------------------------------------------------------
// M1 · A whole Skirmish through the bottom bar alone
// ---------------------------------------------------------------------------

console.log("\n# A Skirmish, start to finish, through the bottom bar\n");

await press("Skirmish", 500);
await page.waitForFunction(() => /Odds: \w+ \(\d of 8\)/.test(document.body.textContent), null, {
  timeout: 20000,
});
await press("Deploy ▶", 500);
let s = await read();
check(
  "Deploy saves a battle that hasn't started",
  s?.phase === "deploy" && s.battle.round === 0,
  s?.phase,
);
const odds = s.odds;
check(
  "the odds shown are saved with it, as wins of 8",
  odds && odds.runs === 8 && odds.wins >= 0 && odds.wins <= 8,
  JSON.stringify(odds?.wins),
);

await press("Hammer");
s = await read();
const horse = s.battle.squads.filter((q) => q.side === 0 && q.role === "cav");
// Valemark Balanced at 100 fields one squad of 8 horsemen: 2 ranks, 4 abreast,
// 6 m wide. Hammer masses it from 4 m in from the right edge (centre 93), 8 m
// ahead of the line at 110, and sends it in.
check(
  "Hammer puts the horse on the right wing, ahead, charging",
  horse.length === 1 && horse[0].x === 93 && horse[0].y === 102 && horse[0].cmd.kind === "charge",
  horse.map((q) => `${q.x},${q.y} ${q.cmd.kind}`).join(),
);
const said = await page
  .locator(".cl-toast")
  .textContent({ timeout: 1000 })
  .catch(() => null);
check(
  "and says what Hammer means",
  said === "Hammer: The foot holds as the anvil; every horse, massed on the right, charges.",
  said,
);
await press("Line");
s = await read();
check(
  "Line puts it back on the left wing",
  s.battle.squads.find((q) => q.side === 0 && q.role === "cav").x === 10,
);

await press("Begin ▶");
s = await read();
check("Begin starts the battle at round 0, planning", s.phase === "plan" && s.battle.round === 0);

// An order with nothing selected goes to the whole army but the banner.
await press("Charge");
await press("Done");
s = await read();
check(
  "an army order leaves the banner behind the line",
  s.battle.squads.every((q) => q.side !== 0 || q.cmd.kind === (q.banner ? "escort" : "charge")),
  s.battle.squads
    .filter((q) => q.side === 0)
    .map((q) => q.cmd.kind)
    .join(" "),
);

await press("All squads");
await press("Advance");
const firstFoe = Number(await page.locator(".cl-chip.foe").first().getAttribute("data-squad"));
await page.locator(".cl-chip.foe").first().tap();
await settle();
s = await read();
const army = s.battle.squads.filter((q) => q.side === 0 && !q.banner);
check(
  "Advance on a target chip orders every squad but the banner at that squad",
  army.every((q) => q.cmd.kind === "advance" && q.cmd.target === firstFoe),
  army.map((q) => `${q.cmd.kind}:${q.cmd.target}`).join(" "),
);
check(
  "the banner keeps behind the line",
  s.battle.squads.find((q) => q.side === 0 && q.banner).cmd.kind === "escort",
);

// Skip shows the rest of a round at once; the bar must come back with it.
await press("Go ▶", 300);
await press("Skip ▶▶", 400);
s = await read();
check(
  "Skip ends the round at once and gives back Go",
  (await game.can("Go ▶")) && s.phase === "plan" && s.battle.round === 1,
  `round ${s.battle.round}`,
);

await press("Continuous");
for (let i = 0; i < 80 && !(await resultShown()); i++) {
  // Continuous play stops on events that need you; Go carries on.
  if (await game.can("Go ▶")) await press("Go ▶", 50);
  await settle(600);
}
s = await read();
check("the battle ends", s.phase === "over" && s.battle.over === true, `round ${s.battle.round}`);
check(
  "the result is in the save",
  s.result && s.result.rounds === s.battle.round && [0, 1, null].includes(s.result.winner),
  JSON.stringify(s.result?.sides?.[0]),
);
const heading = await page.locator(".cl-result-head").textContent();
check(
  "the result sheet says who won",
  heading === (s.result?.winner === 0 ? "Victory" : s.result?.winner === 1 ? "Defeat" : "Draw"),
  heading,
);
const side0 = s.result?.sides?.[0] ?? {};
check(
  "everyone you fielded is accounted for",
  side0.fielded > 0 && side0.fielded >= side0.killed + side0.wounded + side0.captured + side0.fled,
  JSON.stringify(side0),
);
check("the console is clean", game.errors.length === 0, game.errors.join(" | "));

// ---------------------------------------------------------------------------
// Taps on the field
// ---------------------------------------------------------------------------

console.log("\n# Squads and ground, tapped on the field\n");

let b = battle({
  mine: [
    { type: "footman", n: 24, x: 30, y: 110 },
    { type: "archer", n: 20, x: 62, y: 118 },
  ],
  theirs: [{ type: "militia", n: 30, x: 50, y: 20 }],
});
await game.resume(saveOf(b));
s = await read();
await game.tapSquad(s.battle.squads[0]);
check(
  "tapping your squad selects it",
  (await game.chip(0).getAttribute("aria-pressed")) === "true",
);
await game.tapField(30, 90);
s = await read();
const cmd = s.battle.squads[0].cmd;
check(
  "tapping open ground orders it there",
  cmd.kind === "move" && Math.abs(cmd.x - 30) < 0.3 && Math.abs(cmd.y - 90) < 0.3,
  JSON.stringify(cmd),
);
await game.go();
s = await read();
// 3 s at 4.5 m/s from y 110 toward y 90: 13.5 m, so y 96.5.
check(
  "it marches 13.5 m in a round",
  Math.abs(s.battle.squads[0].y - 96.5) < 0.5,
  s.battle.squads[0].y.toFixed(2),
);
await game.tapSquad(s.battle.squads[2]);
s = await read();
check(
  "tapping an enemy squad sends your selection at it",
  s.battle.squads[0].cmd.kind === "advance" && s.battle.squads[0].cmd.target === 2,
  JSON.stringify(s.battle.squads[0].cmd),
);
await game.tapSquad(s.battle.squads[1]);
await game.tapSquad(s.battle.squads[1]);
check(
  "tapping a selected squad again lets it go",
  (await game.chip(1).getAttribute("aria-pressed")) === "false",
);

// ---------------------------------------------------------------------------
// Saved before shown, and resumed
// ---------------------------------------------------------------------------

console.log("\n# Ironman: the round is saved before it is shown\n");

const before = (await read()).battle.round;
await press("Go ▶", 0);
s = await read();
check(
  "the round is in the save the moment Go is pressed",
  s.battle.round === before + 1,
  `${before} → ${s.battle.round}`,
);
await game.reload();
check(
  "the title offers to continue from the next round",
  await page.getByRole("button", { name: `Continue — round ${before + 2}` }).isVisible(),
);
await page.getByRole("button", { name: /^Continue/ }).tap();
await settle(300);
check(
  "Continue resumes there",
  (await page.locator(".cl-hud b").first().textContent()) === `Round ${before + 2}`,
);

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

console.log("\n# Deploying\n");

b = battle({
  mine: [{ type: "footman", n: 24, x: 30, y: 110 }],
  theirs: [{ type: "militia", n: 30, x: 50, y: 20 }],
  hero: 5,
});
await game.resume(saveOf(b, { phase: "deploy" }));
await game.chip(0).tap();
await settle();
await game.tapField(70, 120);
s = await read();
let q = s.battle.squads[0];
check(
  "a selected squad goes where you tap in your band",
  Math.abs(q.x - 70) < 0.3 && Math.abs(q.y - 120) < 0.3,
  `${q.x.toFixed(2)},${q.y.toFixed(2)}`,
);
await game.tapField(70, 60);
s = await read();
q = s.battle.squads[0];
// A level-5 hero has Tactics 1: the band reaches 45 + 10 = 55 m in, to y 85.
check("but not past the front of the band", q.y === 85, q.y.toFixed(2));

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

console.log("\n# Spending Valor\n");

b = battle({
  mine: [
    { type: "footman", n: 24, x: 40, y: 112 },
    { type: "spearman", n: 20, x: 60, y: 112 },
  ],
  theirs: [{ type: "militia", n: 30, x: 50, y: 20 }],
  hero: 5,
});
b.sides[0].valor = 6;
await game.resume(saveOf(b));
check("Hold the Line needs a squad picked first", !(await game.can("Hold the Line")));
await press("Rally");
s = await read();
check("Rally costs 3 of your 6 Valor", s.battle.sides[0].valor === 3, s.battle.sides[0].valor);
check("and waits for the round", s.battle.sides[0].pending[0]?.id === "rally");
// 3 Valor would pay for another: only the once-a-round rule refuses it.
check("a second Rally the same round is refused", !(await game.can("Rally")));
await game.chip(1).tap();
await settle();
await press("Hold the Line");
s = await read();
check(
  "Hold the Line on the picked squad costs 2 more",
  s.battle.sides[0].valor === 1 && s.battle.sides[0].pending[1]?.squad === 1,
);
await game.go();
s = await read();
check(
  "both are used as the round starts",
  s.battle.sides[0].used.map((u) => `${u.id}@${u.round}`).join() === "rally@0,holdline@0",
  JSON.stringify(s.battle.sides[0].used),
);
check("Valor comes back by one a round", s.battle.sides[0].valor === 2, s.battle.sides[0].valor);

// ---------------------------------------------------------------------------
// Ending early
// ---------------------------------------------------------------------------

console.log("\n# Retreat and Auto finish\n");

b = battle({
  mine: [{ type: "footman", n: 20, x: 50, y: 110 }],
  theirs: [{ type: "militia", n: 30, x: 50, y: 20 }],
});
await game.resume(saveOf(b));
await press("More");
await press("Retreat");
check("Retreat asks once", await game.can("Retreat — sure?"));
await press("Retreat — sure?", 400);
s = await read();
check(
  "retreating loses the battle",
  s.phase === "over" && s.battle.winner === 1 && s.battle.retreated === 0,
);
// Never in melee: a rearguard of 15% of your worth, 3 of 20 footmen, stays behind.
check(
  "and leaves a rearguard of 3",
  s.battle.squads[0].n === 17 && s.battle.squads[0].state === "fled",
  s.battle.squads[0].n,
);
check("the sheet says so", (await page.locator(".cl-result-head").textContent()) === "Retreat");

b = battle({
  mine: [{ type: "knight", n: 30, x: 50, y: 110 }],
  theirs: [{ type: "levy", n: 12, x: 50, y: 30 }],
});
await game.resume(saveOf(b));
await press("More");
await press("Auto finish", 400);
s = await read();
check(
  "Auto finish plays the battle out at once",
  s.phase === "over" && s.battle.over && s.result?.winner === 0,
  `winner ${s.result?.winner}`,
);

// ---------------------------------------------------------------------------
// The best record
// ---------------------------------------------------------------------------

console.log("\n# The toughest win\n");

await page.evaluate(() => localStorage.removeItem("playground:crownless:best"));
await press("Title", 400);
await press("Skirmish", 400);
await press("Their army");
await page.getByRole("group", { name: "Strength" }).getByRole("button", { name: "60" }).tap();
await settle();
await press("Your army");
await page.getByRole("group", { name: "Strength" }).getByRole("button", { name: "200" }).tap();
await page.waitForFunction(() => /Odds: \w+ \(\d of 8\)/.test(document.body.textContent), null, {
  timeout: 20000,
});
const oddsText = await page.locator(".cl-odds").textContent();
check(
  "200 against 60 is Overwhelming",
  oddsText.startsWith("Odds: Overwhelming (8 of 8)"),
  oddsText,
);
await press("Deploy ▶", 400);
await press("Begin ▶");
await press("More");
await press("Auto finish", 400);
const best = await game.store("best");
check(
  "a win sets the record at the odds it was shown",
  best?.wins === 8 && best.word === "Overwhelming",
  JSON.stringify(best),
);
await press("Title", 400);
check(
  "the title shows it",
  (await page.locator(".cl-best").textContent()).includes("Overwhelming (8 of 8)"),
);

/** Win a sure battle that was shown at the given odds. */
async function winAt(wins, word) {
  const sure = battle({
    mine: [{ type: "knight", n: 30, x: 50, y: 110 }],
    theirs: [{ type: "levy", n: 12, x: 50, y: 30 }],
  });
  await game.resume(saveOf(sure, { odds: { wins, runs: 8, word, losses: {} } }));
  await press("More");
  await press("Auto finish", 400);
  await press("Title", 400);
  return game.store("best");
}
let rec = await winAt(2, "Risky");
check(
  "a win at worse odds replaces it",
  rec?.wins === 2 && rec.word === "Risky",
  JSON.stringify(rec),
);
rec = await winAt(6, "Favourable");
check("a win at better odds does not", rec?.wins === 2, JSON.stringify(rec));

// ---------------------------------------------------------------------------
// Reading a squad
// ---------------------------------------------------------------------------

console.log("\n# A long press reads, and never acts\n");

b = battle({
  mine: [{ type: "footman", n: 24, x: 40, y: 112 }],
  theirs: [{ type: "militia", n: 30, x: 50, y: 20 }],
});
await game.resume(saveOf(b));
s = await read();
{
  const L = game.layout();
  const p = { x: L.ox + 40 * L.scale, y: L.oy + 112 * L.scale };
  await page.mouse.move(game.rect.left + p.x, game.rect.top + p.y);
  await page.mouse.down();
  await settle(650);
  const tip = await page
    .locator(".cl-tip")
    .textContent()
    .catch(() => "");
  await page.mouse.up();
  await settle();
  check(
    "holding a squad shows what it is",
    tip.includes("24 Footman") && tip.includes("morale 66 of 66"),
    tip,
  );
  const after = await read();
  check("and changes nothing", JSON.stringify(after.battle) === JSON.stringify(s.battle));
  check("nor selects it", (await game.chip(0).getAttribute("aria-pressed")) === "false");
}

// ---------------------------------------------------------------------------
// Cost (tech.md §5)
// ---------------------------------------------------------------------------

console.log("\n# What a round and a frame cost, with the CPU slowed 4× to stand in for a phone\n");

{
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const perf = await page.evaluate(async () => {
    const R = await import("./rules/battle.js");
    const V = await import("./view/battle-view.js");
    const Lm = await import("./view/layout.js");
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
    const make = (seed) => R.createBattle({ seed, sides: [{ squads: big }, { squads: big }] });
    // Rounds, timeline and all, as Go computes them — after one battle to
    // warm the JIT, as a phone has by the time it reaches a battle.
    for (let i = 0; i < 2; i++) {
      const w = make(100 + i);
      while (!w.over) R.playRound(w);
    }
    const times = [];
    for (let i = 0; i < 6; i++) {
      const b = make(i);
      while (!b.over) {
        const t0 = performance.now();
        R.playRound(b);
        times.push(performance.now() - t0);
      }
    }
    times.sort((a, c) => a - c);
    // Frames: 400 soldiers on a 390 × 844 field at 2× pixels.
    const canvas = document.createElement("canvas");
    canvas.width = 390 * 2;
    canvas.height = 662 * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    const b = make(3);
    const view = V.createBattleView();
    view.setBattle(b);
    const L = Lm.layout(390, 844 - 44);
    const ui = { selected: new Set([0]), deploy: false, targeting: false, tactics: 0, now: 0 };
    let men = b.squads.reduce((m, s) => m + s.n, 0);
    view.draw(ctx, L, ui); // warm the ground cache
    const tl = R.playRound(b);
    view.play(tl);
    // Timed: the game's own work for a frame. Untimed: rasterising it, which
    // headless Chromium does on the CPU and a phone on its GPU. Without the
    // flush each frame, an unseen canvas saves its raster up and pays for a
    // hundred frames in one.
    const frames = [];
    for (let i = 0; i < 180; i++) {
      const t0 = performance.now();
      view.update(1 / 60);
      ui.now += 1 / 60;
      view.draw(ctx, L, ui);
      frames.push(performance.now() - t0);
      ctx.getImageData(0, 0, 1, 1);
      if (!view.playing()) view.play(R.playRound(b));
    }
    frames.sort((a, c) => a - c);
    const q = (a, p) => a[Math.floor(p * (a.length - 1))];
    return {
      roundMedian: q(times, 0.5),
      roundP95: q(times, 0.95),
      frameMedian: q(frames, 0.5),
      frameP95: q(frames, 0.95),
      men,
    };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const f = (v) => v.toFixed(1);
  // Medians: a shared VM's p95 swings by half again between identical runs.
  check(
    "a round of 16 squads and 400 men computes in 10 ms or less",
    perf.roundMedian <= 10,
    `median ${f(perf.roundMedian)} ms, p95 ${f(perf.roundP95)} ms`,
  );
  check(
    `the game's work for a frame of ${perf.men} soldiers fits 60 fps (16.7 ms)`,
    perf.frameMedian <= 16.7 && perf.frameP95 <= 16.7,
    `median ${f(perf.frameMedian)} ms, p95 ${f(perf.frameP95)} ms`,
  );
}

check("the console stayed clean throughout", game.errors.length === 0, game.errors.join(" | "));
await game.close();
process.exit(report.finish() ? 1 : 0);
